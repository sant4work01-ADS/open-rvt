"""O012b: jerarquía completa de uniones (zapata > columna > viga > losa > muro).

Los valores esperados salen de la tabla de la especificación y se calcularon a
mano; no se copian del resultado del código:

- Contratrabe entre dos dados de 0.40 × 0.40 a 4.00 m entre centros:
  largo 4.00 − 0.20 − 0.20 = 3.60 m; volumen 0.20 · 0.40 · 3.60 = 0.288 m³.
- Muro de 0.15 entre castillos de 0.15 a 4.00 m entre centros:
  largo 4.00 − 0.075 − 0.075 = 3.85 m; área 3.85 · 2.60 = 10.01 m².
- Losa de 0.10 entre cuatro trabes de 0.25 centradas en ejes de 5.00 × 4.00:
  área (5.00 − 0.25) · (4.00 − 0.25) = 17.8125 m²; volumen 1.78125 m³.
- Columna en esquina de losa: intersección de volumen 0.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely.geometry import Polygon

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

CT = "CT-1 Contratrabe 20×40"
COL = "C-1 Columna 30×30"
ZAP = "Z-1 Zapata 1.20×1.20"
K = "K-1 Castillo 15×15"
MURO = "Block 15"


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O012b")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _malla(nucleo: ModeloNucleo, gid: str):
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == _entidad(nucleo, gid).id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            return vertices, caras
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {gid}")


def _volumen_malla(nucleo: ModeloNucleo, gid: str) -> float:
    vertices, caras = _malla(nucleo, gid)
    return abs(sum(
        float(np.dot(vertices[c[0]], np.cross(vertices[c[1]], vertices[c[2]]))) / 6.0
        for c in caras
    ))


def _caja(nucleo: ModeloNucleo, gid: str):
    vertices, _caras = _malla(nucleo, gid)
    return (
        float(vertices[:, 0].min()), float(vertices[:, 0].max()),
        float(vertices[:, 1].min()), float(vertices[:, 1].max()),
        float(vertices[:, 2].min()), float(vertices[:, 2].max()),
    )


def _zapata_con_columna(nucleo: ModeloNucleo, nivel: str, x: float, y: float):
    columna = nucleo.columna_crear(COL, nivel, x, y, altura=2.0)["creados"][0]
    nucleo.zapata_bajo_columna(ZAP, columna)
    return columna


def test_contratrabe_entre_dos_dados_largo_y_volumen_de_la_tabla() -> None:
    nucleo, nivel = _nuevo()
    _zapata_con_columna(nucleo, nivel, 0, 0)
    _zapata_con_columna(nucleo, nivel, 4, 0)
    # La cara superior del CT-1 queda al ras de la cara superior del dado:
    # zapata Z = -1.00, peralte 0.25 y dado 0.60 → cara superior en -0.15.
    ct = nucleo.viga_crear(CT, nivel, 0, 0, 4, 0, desfase=-0.15)["creados"][0]

    x0, x1, _y0, _y1, _z0, _z1 = _caja(nucleo, ct)
    assert x0 == pytest.approx(0.20, abs=1e-9)
    assert x1 == pytest.approx(3.80, abs=1e-9)
    assert x1 - x0 == pytest.approx(3.60, abs=1e-9)
    assert _volumen_malla(nucleo, ct) == pytest.approx(0.288, abs=1e-9)

    cantidades = nucleo.cantidades_estructura()
    info = next(e for e in cantidades["elementos"] if e["globalid"] == ct)
    assert info["volumen_neto_m3"] == pytest.approx(0.288, abs=1e-9)
    assert info["volumen_bruto_m3"] == pytest.approx(0.320, abs=1e-9)


def test_la_zapata_y_el_dado_quedan_enteros_bajo_la_contratrabe() -> None:
    nucleo, nivel = _nuevo()
    _zapata_con_columna(nucleo, nivel, 0, 0)
    _zapata_con_columna(nucleo, nivel, 4, 0)
    ct = nucleo.viga_crear(CT, nivel, 0, 0, 4, 0, desfase=-0.15)["creados"][0]
    zapatas = [e for e in nucleo.cantidades_estructura()["elementos"] if e["alias"] == "zapata"]
    assert len(zapatas) == 2
    # Plantilla 1.20²·0.05 + peralte 1.20²·0.25 + dado 0.40²·0.60 = 0.528 m³.
    for zapata in zapatas:
        assert zapata["volumen_neto_m3"] == pytest.approx(0.528, abs=1e-9)
    assert _volumen_malla(nucleo, ct) == pytest.approx(0.288, abs=1e-9)
