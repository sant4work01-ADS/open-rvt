#!/usr/bin/env python3
"""Resume la prueba de edición O001b: 3 corridas de cada motor y medianas.

Uso:
    ~/.venvs/openrvt/bin/python evaluacion/resumir_edicion.py

Escribe resultados/edicion_resumen.json con los tiempos medianos, los
volúmenes medidos por el otro motor y las líneas de código de los guiones.
"""

from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
SALIDA = RAIZ / "resultados"
PYTHON = sys.executable
NODE = os.environ.get("OPENRVT_NODE", "node")

ESPERADOS = {
    "Muro Sur": (9.0 * 3.0 - 0.90 * 2.10) * 0.20,
    "Muro Norte": 9.0 * 3.0 * 0.20,
    "Muro Este": 6.0 * 3.0 * 0.20,
    "Muro Oeste": 6.0 * 3.0 * 0.20,
}


def loc(ruta: Path):
    lineas = ruta.read_text(encoding="utf-8").splitlines()
    codigo = [
        linea
        for linea in lineas
        if linea.strip() and not linea.strip().startswith(("#", "//", "*", "/*"))
    ]
    return {"fisicas": len(lineas), "codigo": len(codigo)}


def correr(comando, ruta_json):
    subprocess.run(comando, cwd=RAIZ, check=True, stdout=subprocess.DEVNULL)
    return json.loads(ruta_json.read_text(encoding="utf-8"))


def mediana_operaciones(corridas):
    claves = corridas[0]["operaciones_s"].keys()
    return {
        clave: statistics.median(c["operaciones_s"][clave] for c in corridas)
        for clave in claves
    }


def volumenes(datos, clave):
    return {m["nombre"]: m["volumen_malla"] for m in datos[clave]["muros"]}


def main():
    # Una corrida de calentamiento (no se cuenta) y luego 3 medidas.
    correr([PYTHON, str(AQUI / "a_editar.py")], SALIDA / "edicion_a.json")
    correr([NODE, str(AQUI / "b_editar.mjs")], SALIDA / "edicion_b.json")
    corridas_a = []
    corridas_b = []
    for _ in range(3):
        corridas_a.append(correr([PYTHON, str(AQUI / "a_editar.py")], SALIDA / "edicion_a.json"))
        corridas_b.append(correr([NODE, str(AQUI / "b_editar.mjs")], SALIDA / "edicion_b.json"))

    def resumen_motor(corridas, propio, otro):
        return {
            "medianas_s": mediana_operaciones(corridas),
            "total_mediano_s": statistics.median(c["total_s"] for c in corridas),
            "propagacion_tipo": corridas[-1]["propagacion_tipo"],
            "validacion": corridas[-1]["validacion"],
            "volumenes_propio": volumenes(corridas[-1], propio),
            "volumenes_otro": volumenes(corridas[-1], otro),
            "corridas_s": [
                {"operaciones": c["operaciones_s"], "total": c["total_s"]} for c in corridas
            ],
        }

    resultado = {
        "repeticiones": 3,
        "esperados_m3": ESPERADOS,
        "a": resumen_motor(corridas_a, "medido_propio", "medido_por_b"),
        "b": resumen_motor(corridas_b, "medido_propio", "medido_por_a"),
        "loc": {
            "a_editar.py": loc(AQUI / "a_editar.py"),
            "b_editar.mjs": loc(AQUI / "b_editar.mjs"),
        },
    }

    # Diferencias relativas contra el volumen esperado (para el informe).
    diferencias = {}
    for motor, clave in (("a", "volumenes_otro"), ("b", "volumenes_otro")):
        difs = {}
        for nombre, esperado in ESPERADOS.items():
            medido = resultado[motor][clave][nombre]
            difs[nombre] = abs(medido - esperado) / esperado
        diferencias[motor] = difs
    resultado["diferencias_relativas"] = diferencias

    (SALIDA / "edicion_resumen.json").write_text(
        json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({
        "a_total_s": resultado["a"]["total_mediano_s"],
        "b_total_s": resultado["b"]["total_mediano_s"],
        "a_operaciones_s": resultado["a"]["medianas_s"],
        "b_operaciones_s": resultado["b"]["medianas_s"],
        "loc": resultado["loc"],
        "diferencias": diferencias,
        "validacion_a": resultado["a"]["validacion"]["errores"],
        "validacion_b": resultado["b"]["validacion"]["errores"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
