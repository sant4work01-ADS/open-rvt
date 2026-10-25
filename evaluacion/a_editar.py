#!/usr/bin/env python3
"""Motor A de la evaluación O001b: IfcOpenShell (Python), edición.

Uso:
    ~/.venvs/openrvt/bin/python evaluacion/a_editar.py
    ~/.venvs/openrvt/bin/python evaluacion/a_editar.py --medir archivo.ifc --json salida.json
    ~/.venvs/openrvt/bin/python evaluacion/a_editar.py --validar archivo.ifc --json salida.json

El guion crea un IFC4 con ifcopenshell.api, lo edita, lo guarda y lo vuelve a
abrir con web-ifc para medir los muros. Escribe:
    resultados/edicion_a.ifc
    resultados/edicion_a.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.aggregate
import ifcopenshell.api.attribute
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.material
import ifcopenshell.api.project
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.type
import ifcopenshell.api.unit
import ifcopenshell.geom as geom
import ifcopenshell.validate

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
SALIDA = RAIZ / "resultados"
NODE = os.environ.get("OPENRVT_NODE", "node")

sys.path.insert(0, str(AQUI))

from geometria import volumen_malla  # noqa: E402

MURO_SUR = 0
MURO_ESTE = 1
MURO_NORTE = 2
MURO_OESTE = 3


# --------------------------------------------------------------------------
# Construcción del modelo
# --------------------------------------------------------------------------

def crear_modelo():
    """Crea el IFC4 del guion y devuelve (modelo, ids)."""
    modelo = ifcopenshell.api.project.create_file(version="IFC4")
    proyecto = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcProject", name="Edición O001b")
    largo = ifcopenshell.api.unit.add_si_unit(modelo, unit_type="LENGTHUNIT")
    area = ifcopenshell.api.unit.add_si_unit(modelo, unit_type="AREAUNIT")
    volumen = ifcopenshell.api.unit.add_si_unit(modelo, unit_type="VOLUMEUNIT")
    ifcopenshell.api.unit.assign_unit(modelo, units=[largo, area, volumen])

    modelo3d = ifcopenshell.api.context.add_context(modelo, context_type="Model")
    cuerpo = ifcopenshell.api.context.add_context(
        modelo, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=modelo3d
    )
    plan = ifcopenshell.api.context.add_context(modelo, context_type="Plan")
    eje = ifcopenshell.api.context.add_context(
        modelo, context_type="Plan", context_identifier="Axis", target_view="GRAPH_VIEW", parent=plan
    )

    sitio = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcSite", name="Sitio")
    edificio = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcBuilding", name="Edificio")
    nivel1 = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcBuildingStorey", name="Nivel 1")
    nivel2 = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcBuildingStorey", name="Nivel 2")
    ifcopenshell.api.attribute.edit_attributes(modelo, product=nivel1, attributes={"Elevation": 0.0})
    ifcopenshell.api.attribute.edit_attributes(modelo, product=nivel2, attributes={"Elevation": 3.0})
    ifcopenshell.api.aggregate.assign_object(modelo, products=[sitio], relating_object=proyecto)
    ifcopenshell.api.aggregate.assign_object(modelo, products=[edificio], relating_object=sitio)
    ifcopenshell.api.aggregate.assign_object(modelo, products=[nivel1], relating_object=edificio)
    ifcopenshell.api.aggregate.assign_object(modelo, products=[nivel2], relating_object=edificio)

    # Tipo de muro «Block 15» con una capa de material de 0.15 m.
    tipo = ifcopenshell.api.root.create_entity(
        modelo, ifc_class="IfcWallType", name="Block 15", predefined_type="STANDARD"
    )
    material = ifcopenshell.api.material.add_material(modelo, name="Bloque", category="masonry")
    conjunto = ifcopenshell.api.material.add_material_set(
        modelo, name="Block 15", set_type="IfcMaterialLayerSet"
    )
    capa = ifcopenshell.api.material.add_layer(modelo, layer_set=conjunto, material=material, name="Bloque")
    ifcopenshell.api.material.edit_layer(modelo, layer=capa, attributes={"LayerThickness": 0.15})
    ifcopenshell.api.material.assign_material(
        modelo, products=[tipo], type="IfcMaterialLayerSet", material=conjunto
    )

    def crear_muro(nombre, p1, p2):
        muro = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcWall", name=nombre)
        ifcopenshell.api.type.assign_type(modelo, related_objects=[muro], relating_type=tipo)
        ifcopenshell.api.material.assign_material(
            modelo, products=[muro], type="IfcMaterialLayerSetUsage"
        )
        rep = ifcopenshell.api.geometry.create_2pt_wall(
            modelo,
            element=muro,
            context=cuerpo,
            p1=p1,
            p2=p2,
            elevation=0.0,
            height=3.0,
            thickness=0.15,
        )
        ifcopenshell.api.geometry.assign_representation(modelo, product=muro, representation=rep)
        largo_muro = float(np.linalg.norm(np.array(p2, dtype=float) - np.array(p1, dtype=float)))
        rep_eje = ifcopenshell.api.geometry.add_axis_representation(
            modelo, context=eje, axis=[(0.0, 0.0), (largo_muro, 0.0)]
        )
        ifcopenshell.api.geometry.assign_representation(modelo, product=muro, representation=rep_eje)
        ifcopenshell.api.spatial.assign_container(modelo, products=[muro], relating_structure=nivel1)
        return muro

    # Ejes de esquina a esquina (uniones a eje): cada muro conserva su largo
    # nominal y se solapa con los perpendiculares en las esquinas.
    muros = [
        crear_muro("Muro Sur", (0.0, 0.0), (8.0, 0.0)),
        crear_muro("Muro Este", (8.0, 0.0), (8.0, 6.0)),
        crear_muro("Muro Norte", (8.0, 6.0), (0.0, 6.0)),
        crear_muro("Muro Oeste", (0.0, 6.0), (0.0, 0.0)),
    ]

    # Losa de 0.12 m sobre el nivel 1, con el contorno exterior de los muros.
    losa = ifcopenshell.api.root.create_entity(
        modelo, ifc_class="IfcSlab", name="Losa", predefined_type="FLOOR"
    )
    rep = ifcopenshell.api.geometry.add_slab_representation(
        modelo, context=cuerpo, depth=0.12, polyline=[(0.0, 0.0), (8.0, 0.0), (8.0, 6.0), (0.0, 6.0)]
    )
    ifcopenshell.api.geometry.assign_representation(modelo, product=losa, representation=rep)
    # Losa de piso del nivel 2: cara superior en 3.00 m (sobre el nivel 1).
    matriz = np.eye(4)
    matriz[2, 3] = 3.0 - 0.12
    ifcopenshell.api.geometry.edit_object_placement(modelo, product=losa, matrix=matriz)
    ifcopenshell.api.spatial.assign_container(modelo, products=[losa], relating_structure=nivel2)

    # Vano de 0.90 × 2.10 m en el muro sur y puerta que lo rellena.
    vano = ifcopenshell.api.root.create_entity(modelo, ifc_class="IfcOpeningElement", name="Vano Puerta")
    rep = ifcopenshell.api.geometry.add_wall_representation(
        modelo, context=cuerpo, length=0.90, height=2.10, thickness=0.40
    )
    ifcopenshell.api.geometry.assign_representation(modelo, product=vano, representation=rep)
    matriz = np.eye(4)
    matriz[:, 3] = [4.05, -0.125, 0.0, 1.0]
    ifcopenshell.api.geometry.edit_object_placement(modelo, product=vano, matrix=matriz)
    ifcopenshell.api.feature.add_feature(modelo, feature=vano, element=muros[MURO_SUR])
    ifcopenshell.api.spatial.assign_container(modelo, products=[vano], relating_structure=nivel1)

    puerta = ifcopenshell.api.root.create_entity(
        modelo, ifc_class="IfcDoor", name="Puerta", predefined_type="DOOR"
    )
    rep = ifcopenshell.api.geometry.add_door_representation(
        modelo, context=cuerpo, overall_height=2.10, overall_width=0.90
    )
    ifcopenshell.api.geometry.assign_representation(modelo, product=puerta, representation=rep)
    matriz = np.eye(4)
    matriz[:, 3] = [4.05, 0.05, 0.0, 1.0]
    ifcopenshell.api.geometry.edit_object_placement(modelo, product=puerta, matrix=matriz)
    ifcopenshell.api.feature.add_filling(modelo, opening=vano, element=puerta)
    ifcopenshell.api.spatial.assign_container(modelo, products=[puerta], relating_structure=nivel1)

    return modelo, {
        "proyecto": proyecto,
        "tipo": tipo,
        "capa": capa,
        "conjunto": conjunto,
        "nivel1": nivel1,
        "nivel2": nivel2,
        "muros": muros,
        "losa": losa,
        "vano": vano,
        "puerta": puerta,
    }


def _rep_eje(muro):
    for rep in muro.Representation.Representations:
        if rep.RepresentationIdentifier == "Axis":
            return rep
    raise RuntimeError(f"{muro.Name} no tiene representación de eje")


def _cambiar_largo_eje(muro, largo):
    rep = _rep_eje(muro)
    curva = rep.Items[0]
    puntos = [tuple(p) for p in curva.Points.CoordList]
    puntos[-1] = (float(largo), 0.0)
    curva.Points.CoordList = puntos


def editar_modelo(modelo, ids):
    """Alarga el edificio 1 m al este y cambia el espesor del tipo a 0.20 m."""
    muros = ids["muros"]
    # El muro este se desplaza 1 m al este; el sur y el norte lo siguen. Las
    # uniones son a eje, así que los largos nominales quedan 9, 6, 9 y 6.
    matriz = np.eye(4)
    matriz[:, 3] = [9.0, 0.0, 0.0, 1.0]
    ifcopenshell.api.geometry.edit_object_placement(modelo, product=muros[MURO_ESTE], matrix=matriz)
    matriz = np.array(
        [
            [-1.0, 0.0, 0.0, 9.0],
            [0.0, -1.0, 0.0, 6.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ]
    )
    ifcopenshell.api.geometry.edit_object_placement(modelo, product=muros[MURO_NORTE], matrix=matriz)
    _cambiar_largo_eje(muros[MURO_SUR], 9.0)
    _cambiar_largo_eje(muros[MURO_NORTE], 9.0)

    # Cambio de espesor del tipo: se edita la capa y se regeneran los cuatro
    # muros desde eje + capa, como haría el editor al aceptar el cambio.
    ifcopenshell.api.material.edit_layer(modelo, layer=ids["capa"], attributes={"LayerThickness": 0.20})
    for muro in muros:
        ifcopenshell.api.geometry.regenerate_wall_representation(
            modelo, wall=muro, length=1.0, height=3.0
        )


def comprobar_grosor(modelo, ids, grosor=0.20):
    capa = ids["capa"].LayerThickness
    valores = []
    for muro in ids["muros"]:
        for rep in muro.Representation.Representations:
            if rep.RepresentationIdentifier != "Body":
                continue
            for item in rep.Items:
                perfil = getattr(item, "SweptArea", None)
                if perfil is None:
                    continue
                if hasattr(perfil, "YDim"):
                    valores.append(float(perfil.YDim))
                elif hasattr(perfil, "OuterCurve"):
                    puntos = perfil.OuterCurve.Points.CoordList
                    ys = [float(p[1]) for p in puntos]
                    valores.append(max(ys) - min(ys))
    return {
        "capa": float(capa),
        "perfiles": valores,
        "ok": len(valores) == 4
        and abs(float(capa) - grosor) < 1e-9
        and all(abs(v - grosor) < 1e-9 for v in valores),
    }


# --------------------------------------------------------------------------
# Medición y validación
# --------------------------------------------------------------------------

def medir_con_ifcopenshell(ruta):
    modelo = ifcopenshell.open(str(ruta))
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    ajustes.set(ajustes.WELD_VERTICES, True)
    mallas = {}
    it = geom.iterator(ajustes, modelo, max(1, os.cpu_count() or 1))
    if it.initialize():
        while True:
            forma = it.get()
            mallas[forma.id] = (list(forma.geometry.verts), list(forma.geometry.faces))
            if not it.next():
                break
    muros = []
    for muro in modelo.by_type("IfcWall"):
        datos = mallas.get(muro.id())
        muros.append(
            {
                "globalid": muro.GlobalId,
                "nombre": muro.Name or "",
                "volumen_malla": volumen_malla(*datos) if datos and datos[1] else None,
            }
        )
    return {
        "motor": "a",
        "esquema": modelo.schema,
        "conteo": {
            "muros": len(modelo.by_type("IfcWall")),
            "losas": len(modelo.by_type("IfcSlab")),
            "puertas": len(modelo.by_type("IfcDoor")),
            "vanos": len(modelo.by_type("IfcOpeningElement")),
        },
        "muros": muros,
    }


class _Contador(logging.Handler):
    def __init__(self):
        super().__init__()
        self.errores = 0
        self.avisos = 0
        self.mensajes = []

    def emit(self, record):
        if record.levelno >= logging.ERROR:
            self.errores += 1
        else:
            self.avisos += 1
        if len(self.mensajes) < 20:
            self.mensajes.append(record.getMessage())


def validar_con_ifcopenshell(ruta):
    contador = _Contador()
    registro = logging.getLogger("o001b_validacion")
    registro.handlers = [contador]
    registro.setLevel(logging.DEBUG)
    registro.propagate = False
    ifcopenshell.validate.validate(str(ruta), logger=registro)
    return {
        "errores": contador.errores,
        "avisos": contador.avisos,
        "mensajes": contador.mensajes,
        "ok": contador.errores == 0,
    }


# --------------------------------------------------------------------------
# Orquestación
# --------------------------------------------------------------------------

def medir_con_webifc(ruta, tmp):
    destino = Path(tmp) / "medido_b.json"
    subprocess.run(
        [NODE, str(AQUI / "b_editar.mjs"), "--medir", str(ruta), "--json", str(destino)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    return json.loads(destino.read_text(encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser(description="Motor A: IfcOpenShell, edición")
    ap.add_argument("--medir", help="solo medir un IFC y escribir JSON")
    ap.add_argument("--validar", help="solo validar un IFC y escribir JSON")
    ap.add_argument("--json", help="archivo JSON de salida para --medir/--validar")
    args = ap.parse_args()

    if args.medir:
        datos = medir_con_ifcopenshell(args.medir)
        Path(args.json).write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({k: v for k, v in datos.items() if k != "muros"}, ensure_ascii=False))
        return
    if args.validar:
        datos = validar_con_ifcopenshell(args.validar)
        Path(args.json).write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(datos, ensure_ascii=False))
        return

    tiempos = {}
    t0 = time.perf_counter()
    modelo, ids = crear_modelo()
    tiempos["crear_modelo_s"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    editar_modelo(modelo, ids)
    tiempos["editar_modelo_s"] = time.perf_counter() - t0
    propagacion = comprobar_grosor(modelo, ids)

    t0 = time.perf_counter()
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta_ifc = SALIDA / "edicion_a.ifc"
    modelo.write(str(ruta_ifc))
    tiempos["guardar_s"] = time.perf_counter() - t0

    with tempfile.TemporaryDirectory(prefix="o001b_a_") as tmp:
        t0 = time.perf_counter()
        propio = medir_con_ifcopenshell(ruta_ifc)
        tiempos["medir_propio_s"] = time.perf_counter() - t0

        t0 = time.perf_counter()
        otro = medir_con_webifc(ruta_ifc, tmp)
        tiempos["medir_otro_s"] = time.perf_counter() - t0

        t0 = time.perf_counter()
        validacion = validar_con_ifcopenshell(ruta_ifc)
        tiempos["validar_s"] = time.perf_counter() - t0

        resultado = {
            "motor": "a",
            "ifc": str(ruta_ifc.relative_to(RAIZ)),
            "esquema": modelo.schema,
            "operaciones_s": tiempos,
            "total_s": sum(tiempos.values()),
            "propagacion_tipo": propagacion,
            "medido_propio": propio,
            "medido_por_b": otro,
            "validacion": validacion,
        }
        (SALIDA / "edicion_a.json").write_text(
            json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(json.dumps({k: v for k, v in resultado.items() if k not in ("medido_propio", "medido_por_b")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
