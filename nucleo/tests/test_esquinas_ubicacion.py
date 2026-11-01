"""Esquinas de muros al cambiar la línea de ubicación (bug del usuario, 1-nov).

Rectángulo 4×3 de muros Block 15 (0.15) a eje. Al pasar un muro a «paño interior»
sus vecinos deben regenerar el inglete: la planta queda como un anillo limpio
(4 vértices por fuera y 4 por dentro), sin muescas en las esquinas. Se mide la
geometría guardada en el IFC, no una recalculada al vuelo.
"""

from __future__ import annotations

import itertools
import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely.geometry import MultiPoint
from shapely.ops import unary_union

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

CCW = ((0, 0, 4, 0), (4, 0, 4, 3), (4, 3, 0, 3), (0, 3, 0, 0))
CW = ((0, 0, 0, 3), (0, 3, 4, 3), (4, 3, 4, 0), (4, 0, 0, 0))


def _huella_guardada(muro):
    ajustes = geom.settings()
    ajustes.set("use-world-coords", True)
    forma = geom.create_shape(ajustes, muro)
    v = np.array(forma.geometry.verts).reshape(-1, 3)
    return MultiPoint([tuple(p) for p in v[:, :2]]).convex_hull


def _anillo(nucleo):
    piezas = [_huella_guardada(m) for m in nucleo.modelo.by_type("IfcWall")]
    total = unary_union(piezas).buffer(1e-5, join_style=2).buffer(-1e-5, join_style=2)
    return total.simplify(1e-4)


def _rectangulo(trazo, lineas):
    nucleo = ModeloNucleo()
    nucleo.nuevo("esquinas")
    nivel = nucleo.niveles()[0]["globalid"]
    gids = [nucleo.muro_crear("Block 15", nivel, *p)["creados"][0] for p in trazo]
    for gid, linea in zip(gids, lineas):
        if linea:
            nucleo.elemento_editar(gid, {"linea_ubicacion": linea})
    return nucleo


@pytest.mark.parametrize("trazo", [CCW, CW], ids=["antihorario", "horario"])
@pytest.mark.parametrize(
    "lineas",
    [
        ("cara_interior", None, None, None),
        ("cara_interior",) * 4,
        ("cara_exterior", "cara_interior", None, "cara_exterior"),
    ],
)
def test_vecinos_regeneran_el_inglete(trazo, lineas):
    anillo = _anillo(_rectangulo(trazo, lineas))
    assert anillo.geom_type == "Polygon", anillo.wkt
    assert len(anillo.interiors) == 1, anillo.wkt
    assert len(anillo.exterior.coords) == 5, f"esquinas exteriores con muesca: {anillo.wkt}"
    assert len(anillo.interiors[0].coords) == 5, f"esquinas interiores con muesca: {anillo.wkt}"


def test_paño_interior_en_todos_queda_dentro_del_eje():
    # Antihorario: el lado izquierdo (exterior) mira hacia adentro del rectángulo,
    # así que «paño interior» deja el cuerpo hacia afuera; con todos igual, el
    # anillo exterior es 4.30 × 3.30 o 4 × 3 según el lado, siempre rectangular.
    anillo = _anillo(_rectangulo(CCW, ("cara_interior",) * 4))
    x0, y0, x1, y1 = anillo.bounds
    assert {round(x1 - x0, 3), round(y1 - y0, 3)} in ({4.0, 3.0}, {4.3, 3.3})


def test_todas_las_combinaciones_cierran():
    malas = []
    for lineas in itertools.product([None, "cara_interior", "cara_exterior"], repeat=4):
        anillo = _anillo(_rectangulo(CCW, lineas))
        if not (
            anillo.geom_type == "Polygon"
            and len(anillo.interiors) == 1
            and len(anillo.exterior.coords) == 5
            and len(anillo.interiors[0].coords) == 5
        ):
            malas.append(lineas)
    assert not malas, malas


def test_editar_reporta_los_vecinos_para_redibujarlos():
    # La app solo vuelve a teselar lo que el núcleo reporta: si los vecinos no van
    # en «modificados», la planta muestra sus esquinas viejas (captura del usuario).
    nucleo = ModeloNucleo()
    nucleo.nuevo("esquinas")
    nivel = nucleo.niveles()[0]["globalid"]
    gids = [nucleo.muro_crear("Block 15", nivel, *p)["creados"][0] for p in CCW]
    resultado = nucleo.elemento_editar(gids[2], {"linea_ubicacion": "cara_interior"})
    assert gids[2] in resultado["modificados"]
    assert gids[1] in resultado["modificados"], resultado
    assert gids[3] in resultado["modificados"], resultado
