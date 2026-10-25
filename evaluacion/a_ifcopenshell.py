#!/usr/bin/env python3
"""Motor A de la evaluación O001: IfcOpenShell (Python).

Uso:
    ~/.venvs/openrvt/bin/python evaluacion/a_ifcopenshell.py muestras/AC20-FZK-Haus.ifc

Mide apertura, teselado y extracción de cantidades; corre el pipeline 3 veces
en procesos hijos y reporta la mediana. Escribe:
    resultados/<muestra>_a.csv    columnas pedidas por la especificación
    resultados/<muestra>_a.json   métricas + filas con datos extra (area_lateral)
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import resource
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom as geom

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from geometria import (  # noqa: E402
    area_lateral,
    area_planta,
    dimensiones,
    estado_malla,
    volumen_malla,
)

CLASES = (
    "IfcWall",
    "IfcSlab",
    "IfcColumn",
    "IfcBeam",
    "IfcDoor",
    "IfcWindow",
    "IfcRoof",
    "IfcStair",
)

COLUMNAS = (
    "globalid",
    "clase",
    "nombre",
    "nivel",
    "volumen_malla",
    "area_planta",
    "qto_volumen",
    "qto_area",
    "largo",
    "alto",
    "cerrada",
)

PREFIJOS = {
    None: 1.0,
    "EXA": 1e18,
    "PETA": 1e15,
    "TERA": 1e12,
    "GIGA": 1e9,
    "MEGA": 1e6,
    "KILO": 1e3,
    "HECTO": 1e2,
    "DECA": 1e1,
    "DECI": 1e-1,
    "CENTI": 1e-2,
    "MILLI": 1e-3,
    "MICRO": 1e-6,
    "NANO": 1e-9,
}

VOL_NET = {
    "netvolume",
    "netto-volumen",
    "netto volumen",
    "net volume",
    "neto volumen",
    "volumen neto",
}
VOL_GROSS = {
    "grossvolume",
    "bruttovolumen",
    "gross volume",
    "volumen bruto",
}
VOL_GENERIC = {"volume", "volumen"}
VOL_PROHIBIDO = (
    "offnung",
    "oeffnung",
    "öffnung",
    "opening",
    "konditional",
    "conditional",
    "kern",
    "core",
    "ummantelung",
    "casing",
    "loch",
    "hueco",
)

AREA_PROHIBIDO = VOL_PROHIBIDO + (
    "side",
    "seite",
    "lateral",
    "surface",
    "oberflaeche",
    "oberflächenbereich",
    "unterseite",
    "oberseite",
    "kante",
    "edge",
    "perimeter",
    "umfang",
)


def _norm(texto: str) -> str:
    t = (texto or "").lower().strip()
    t = t.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    t = t.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    return " ".join(t.split())


def _valor(q):
    for attr in ("VolumeValue", "AreaValue", "LengthValue", "CountValue", "WeightValue"):
        v = getattr(q, attr, None)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                return None
    return None


def factores_unidad(modelo):
    """Factores a SI (m, m², m³) leídos de IfcProject.UnitsInContext."""
    largo = area = volumen = None
    proyectos = modelo.by_type("IfcProject")
    if proyectos and proyectos[0].UnitsInContext:
        for u in proyectos[0].UnitsInContext.Units:
            if u.is_a("IfcSIUnit"):
                f = PREFIJOS.get(u.Prefix, 1.0)
                if u.UnitType == "LENGTHUNIT":
                    largo = f
                elif u.UnitType == "AREAUNIT":
                    area = f * f
                elif u.UnitType == "VOLUMEUNIT":
                    volumen = f * f * f
            elif u.is_a("IfcConversionBasedUnit") and u.UnitType == "LENGTHUNIT":
                try:
                    mw = u.ConversionFactor
                    base = mw.UnitComponent
                    fb = PREFIJOS.get(getattr(base, "Prefix", None), 1.0)
                    largo = float(mw.ValueComponent) * fb
                except (AttributeError, TypeError, ValueError):
                    pass
    largo = largo or 1.0
    area = area or largo * largo
    volumen = volumen or largo * largo * largo
    return {"length": largo, "area": area, "volume": volumen}


def _mejor_volumen(candidatos):
    mejor = None
    mejor_punt = -1
    for nombre, valor in candidatos:
        if valor is None:
            continue
        n = _norm(nombre)
        if any(p in n for p in VOL_PROHIBIDO):
            continue
        if n in VOL_NET:
            punt = 100
        elif n in VOL_GROSS:
            punt = 90
        elif n in VOL_GENERIC:
            punt = 70
        elif "net" in n and ("volume" in n or "volumen" in n):
            punt = 65
        elif ("gross" in n or "brutto" in n) and ("volume" in n or "volumen" in n):
            punt = 60
        elif "volume" in n or "volumen" in n:
            punt = 50
        else:
            continue
        if punt > mejor_punt:
            mejor_punt, mejor = punt, valor
    return mejor


def _mejor_area(candidatos, clase):
    mejor = None
    mejor_punt = -1
    for nombre, valor in candidatos:
        if valor is None:
            continue
        n = _norm(nombre)
        if any(p in n for p in AREA_PROHIBIDO):
            continue
        if n in {"netfootprintarea", "net footprint area", "area neta en planta"}:
            punt = 100
        elif n in {"grossfootprintarea", "gross footprint area", "area bruta en planta"}:
            punt = 95
        elif n in {"footprintarea", "area en planta"}:
            punt = 90
        elif clase == "IfcSlab" and n in {"netarea", "net area"}:
            punt = 85
        elif clase == "IfcSlab" and n in {"grossarea", "gross area"}:
            punt = 80
        elif clase == "IfcSlab" and n in {"area", "flaeche", "fläche"}:
            punt = 75
        elif clase == "IfcColumn" and n in {"flaeche", "fläche"}:
            punt = 85
        else:
            continue
        if punt > mejor_punt:
            mejor_punt, mejor = punt, valor
    return mejor


def cantidades_base(elemento, factores):
    """Devuelve (qto_volumen, qto_area) en SI, o None si el archivo no las trae."""
    volumenes = []
    areas = []
    for rel in getattr(elemento, "IsDefinedBy", ()) or ():
        if not rel.is_a("IfcRelDefinesByProperties"):
            continue
        pd = rel.RelatingPropertyDefinition
        if not pd or not pd.is_a("IfcElementQuantity"):
            continue
        for q in pd.Quantities or ():
            val = _valor(q)
            nombre = getattr(q, "Name", "") or ""
            if q.is_a("IfcQuantityVolume"):
                volumenes.append((nombre, None if val is None else val * factores["volume"]))
            elif q.is_a("IfcQuantityArea"):
                areas.append((nombre, None if val is None else val * factores["area"]))
    return _mejor_volumen(volumenes), _mejor_area(areas, elemento.is_a())


def nivel_de(elemento):
    for rel in getattr(elemento, "ContainedInStructure", ()) or ():
        nivel = getattr(rel, "RelatingStructure", None)
        if nivel is not None and nivel.is_a("IfcSpatialStructureElement"):
            return nivel.Name or ""
    for rel in getattr(elemento, "FillsVoids", ()) or ():
        hueco = getattr(rel, "RelatingOpeningElement", None)
        if hueco is None:
            continue
        for rel2 in getattr(hueco, "ContainedInStructure", ()) or ():
            nivel = getattr(rel2, "RelatingStructure", None)
            if nivel is not None:
                return nivel.Name or ""
    return ""


def _pico_rss_mb():
    # Linux: ru_maxrss está en kibibytes.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0


def medir_una(ruta: str):
    t0 = time.perf_counter()
    modelo = ifcopenshell.open(ruta)
    apertura = time.perf_counter() - t0

    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    ajustes.set(ajustes.WELD_VERTICES, True)
    ajustes.set(ajustes.NO_NORMALS, False)

    objetivos = set()
    for clase in CLASES:
        objetivos.update(modelo.by_type(clase))
    por_id = {e.id(): e for e in objetivos}

    mallas = {}
    triangulos = 0
    formas = 0

    t0 = time.perf_counter()
    it = geom.iterator(ajustes, modelo, max(1, os.cpu_count() or 1))
    if it.initialize():
        while True:
            forma = it.get()
            formas += 1
            geo = forma.geometry
            triangulos += len(geo.faces) // 3
            if forma.id in por_id:
                if forma.id not in mallas:
                    mallas[forma.id] = [list(geo.verts), list(geo.faces)]
                else:
                    base = len(mallas[forma.id][0]) // 3
                    mallas[forma.id][0].extend(geo.verts)
                    mallas[forma.id][1].extend(i + base for i in geo.faces)
            if not it.next():
                break
    teselado = time.perf_counter() - t0

    t0 = time.perf_counter()
    factores = factores_unidad(modelo)
    filas = []
    sin_malla = 0
    abiertas = 0
    for e in sorted(objetivos, key=lambda x: (x.is_a(), x.Name or "", x.GlobalId)):
        datos = mallas.get(e.id())
        fila = {
            "globalid": e.GlobalId,
            "clase": e.is_a(),
            "nombre": e.Name or "",
            "nivel": nivel_de(e),
            "volumen_malla": None,
            "area_planta": None,
            "qto_volumen": None,
            "qto_area": None,
            "largo": None,
            "alto": None,
            "cerrada": False,
            "manifold": False,
            "area_lateral": None,
            "sin_malla": True,
        }
        if datos and datos[1]:
            verts, caras = datos
            fila["sin_malla"] = False
            fila["volumen_malla"] = volumen_malla(verts, caras)
            fila["area_planta"] = area_planta(verts, caras)
            fila["cerrada"], fila["manifold"] = estado_malla(verts, caras)
            dim = dimensiones(verts, caras)
            fila["largo"] = dim["largo"]
            fila["alto"] = dim["alto"]
            if e.is_a("IfcWall"):
                fila["area_lateral"] = area_lateral(verts, caras)
            if not fila["cerrada"]:
                abiertas += 1
        else:
            sin_malla += 1
        fila["qto_volumen"], fila["qto_area"] = cantidades_base(e, factores)
        filas.append(fila)
    extraccion = time.perf_counter() - t0

    resultado = {
        "muestra": Path(ruta).stem,
        "motor": "a",
        "esquema": modelo.schema,
        "apertura_s": apertura,
        "teselado_s": teselado,
        "extraccion_s": extraccion,
        "total_s": apertura + teselado + extraccion,
        "triangulos": triangulos,
        "formas": formas,
        "pico_rss_mb": _pico_rss_mb(),
        "n_objetivo": len(objetivos),
        "n_sin_malla": sin_malla,
        "n_abiertas": abiertas,
        "filas": filas,
    }
    del modelo
    return resultado


def escribir_csv(ruta: Path, filas):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with ruta.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS)
        w.writeheader()
        for fila in filas:
            salida = {}
            for col in COLUMNAS:
                v = fila.get(col)
                if isinstance(v, bool):
                    salida[col] = "true" if v else "false"
                elif isinstance(v, float):
                    salida[col] = f"{v:.9f}"
                elif v is None:
                    salida[col] = ""
                else:
                    salida[col] = v
            w.writerow(salida)


def main():
    ap = argparse.ArgumentParser(description="Motor A: IfcOpenShell")
    ap.add_argument("ifc", help="archivo IFC de entrada")
    ap.add_argument("--salida", default=str(AQUI.parent / "resultados"), help="carpeta de resultados")
    ap.add_argument("--repeticiones", type=int, default=3)
    ap.add_argument("--una-corrida", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--json-temporal", help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args.una_corrida:
        datos = medir_una(args.ifc)
        Path(args.json_temporal).write_text(json.dumps(datos), encoding="utf-8")
        print(json.dumps({k: v for k, v in datos.items() if k != "filas"}))
        return

    corridas = []
    with tempfile.TemporaryDirectory(prefix="o001a_") as tmp:
        for i in range(args.repeticiones):
            destino = Path(tmp) / f"corrida_{i}.json"
            subprocess.run(
                [sys.executable, __file__, args.ifc, "--una-corrida", "--json-temporal", str(destino)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            corridas.append(json.loads(destino.read_text(encoding="utf-8")))

    def mediana(clave):
        return statistics.median(c[clave] for c in corridas)

    ordenadas = sorted(corridas, key=lambda c: c["total_s"])
    representativa = ordenadas[len(ordenadas) // 2]
    resumen = {
        "muestra": representativa["muestra"],
        "motor": "a",
        "esquema": representativa["esquema"],
        "repeticiones": len(corridas),
        "apertura_s": mediana("apertura_s"),
        "teselado_s": mediana("teselado_s"),
        "extraccion_s": mediana("extraccion_s"),
        "total_s": mediana("total_s"),
        "triangulos": int(mediana("triangulos")),
        "formas": int(mediana("formas")),
        "pico_rss_mb": mediana("pico_rss_mb"),
        "n_objetivo": representativa["n_objetivo"],
        "n_sin_malla": representativa["n_sin_malla"],
        "n_abiertas": representativa["n_abiertas"],
        "filas": representativa["filas"],
        "corridas": [
            {k: c[k] for k in ("apertura_s", "teselado_s", "extraccion_s", "total_s", "pico_rss_mb")}
            for c in corridas
        ],
    }

    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    base = representativa["muestra"]
    escribir_csv(salida / f"{base}_a.csv", representativa["filas"])
    (salida / f"{base}_a.json").write_text(json.dumps(resumen, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in resumen.items() if k not in ("filas", "corridas")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
