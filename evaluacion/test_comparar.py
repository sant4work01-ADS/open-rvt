"""Pruebas de la evaluación O001. Correr con:
    ~/.venvs/openrvt/bin/python -m pytest evaluacion/test_comparar.py -q
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comparar import comparar_filas, diferencia_relativa  # noqa: E402
from geometria import area_planta, es_cerrada, volumen_malla  # noqa: E402


CUBO_VERTS = [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
    0, 0, 1,
    1, 0, 1,
    1, 1, 1,
    0, 1, 1,
]
CUBO_CARAS = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
]

# Prisma triangular recto: base de área 0.5 m² y altura 1 m -> 0.5 m³.
PRISMA_VERTS = [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    1, 0, 1,
    0, 1, 1,
]
PRISMA_CARAS = [
    0, 2, 1,
    3, 4, 5,
    0, 1, 4, 0, 4, 3,
    1, 2, 5, 1, 5, 4,
    2, 0, 3, 2, 3, 5,
]


def test_volumen_cubo_exacto():
    assert volumen_malla(CUBO_VERTS, CUBO_CARAS) == pytest.approx(1.0, abs=1e-9)


def test_volumen_prisma_triangular_exacto():
    assert volumen_malla(PRISMA_VERTS, PRISMA_CARAS) == pytest.approx(0.5, abs=1e-9)


def test_area_planta_cubo():
    # La huella de un cubo de 1 m es 1 m².
    assert area_planta(CUBO_VERTS, CUBO_CARAS) == pytest.approx(1.0, abs=1e-9)


def test_malla_cerrada_y_abierta():
    assert es_cerrada(CUBO_VERTS, CUBO_CARAS) is True
    # Quitar una cara deja tres aristas de borde.
    abierta = CUBO_CARAS[:-3]
    assert es_cerrada(CUBO_VERTS, abierta) is False


def _fila(gid, volumen, qto_volumen=None, area=None, qto_area=None, cerrada=True):
    return {
        "globalid": gid,
        "clase": "IfcWall",
        "nombre": "muro",
        "nivel": "N0",
        "volumen_malla": volumen,
        "area_planta": area,
        "qto_volumen": qto_volumen,
        "qto_area": qto_area,
        "largo": 1.0,
        "alto": 1.0,
        "cerrada": "true" if cerrada else "false",
    }


def test_comparar_marca_diferencia_sembrada_5pct():
    a = [_fila("g1", 1.0, qto_volumen=1.0)]
    b = [_fila("g1", 1.05, qto_volumen=1.0)]
    r = comparar_filas(a, b)
    assert r["volumen"]["comparables"] == 1
    assert r["volumen"]["pasan_1pct"] == 1
    assert r["volumen"]["peores"][0]["dif_rel"] == pytest.approx(0.05, abs=1e-12)
    assert r["volumen"]["concordancia_pct"] == 0.0


def test_comparar_no_marca_diferencia_pequena():
    a = [_fila("g1", 1.0)]
    b = [_fila("g1", 1.005)]
    r = comparar_filas(a, b)
    assert r["volumen"]["pasan_1pct"] == 0
    assert r["volumen"]["concordancia_pct"] == 100.0


def test_comparar_faltantes_y_area_base():
    a = [_fila("g1", 1.0, qto_volumen=1.0, area=2.0, qto_area=2.0), _fila("g2", 1.0)]
    b = [_fila("g1", 1.03, qto_volumen=1.0, area=2.0, qto_area=2.0), _fila("g3", 1.0)]
    r = comparar_filas(a, b)
    assert r["faltan_en_a"] == ["g3"]
    assert r["faltan_en_b"] == ["g2"]
    assert r["volumen"]["pasan_1pct"] == 1
    assert r["qto_volumen_a"]["pasan"] == 0
    assert r["qto_area_a"]["comparables"] == 1
    assert r["qto_area_a"]["pasan"] == 0


def test_comparar_qto_marca_3pct():
    a = [_fila("g1", 1.0, qto_volumen=1.03)]
    b = [_fila("g1", 1.0, qto_volumen=1.03)]
    r = comparar_filas(a, b)
    assert r["qto_volumen_a"]["comparables"] == 1
    assert r["qto_volumen_a"]["pasan"] == 1
    assert r["qto_volumen_a"]["peores"][0]["dif_rel"] == pytest.approx(0.03 / 1.03, abs=1e-12)


def test_diferencia_relativa():
    assert diferencia_relativa(1.0, 1.0) == 0.0
    assert diferencia_relativa(0.0, 0.0) == 0.0
    assert diferencia_relativa(1.0, 1.1) == pytest.approx(0.1, abs=1e-12)
    assert diferencia_relativa(None, 1.0) is None
    assert math.isclose(diferencia_relativa(2.0, 1.0), 0.5, abs_tol=1e-12)
    assert diferencia_relativa(1.0, 1.1, "b") == pytest.approx(0.1 / 1.1, abs=1e-12)
