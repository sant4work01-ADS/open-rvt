"""O054: castillos, trabes y cerramientos del ancho del núcleo; esquinas cerradas.

Valores a mano:
- rectángulo de ejes 2.50 × 1.50 con muros Block 20 (núcleo 0.20): el anillo
  exterior mide 2.70 × 1.70 y el interior 2.30 × 1.30, así que la franja del
  cerramiento (2.20–2.40) tiene (2.70×1.70) − (2.30×1.30) = 1.60 m².
- cuatro castillos de esquina de 0.20 × 0.20 = 0.04 m² cada uno (0.16 total);
  los cerramientos quedan de 2.30 y 1.30 m de largo por 0.20 de ancho:
  2×2.30×0.20 + 2×1.30×0.20 = 0.92 + 0.52 = 1.44 m²; 1.44 + 0.16 = 1.60.
- volumen de concreto de esos castillos y cerramientos con muro de 2.60 m:
  castillos 4×0.20×0.20×2.60 = 0.416 m³; cerramientos
  2×2.30×0.20×0.20 + 2×1.30×0.20×0.20 = 0.288 m³; total 0.704 m³.
- «del tipo» 0.30 × 0.30 en un muro Block 15 de 4.00 × 0.15 × 2.60:
  el muro pierde 0.30 × 0.15 × 2.60 = 0.117 m³ y queda en 1.443 m³.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely.geometry import Polygon
from shapely.ops import unary_union

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

CASTILLO = "K-1 Castillo 15×15"
CERRAMIENTO = "CE-1 Cerramiento 15×20"
DUENO = RAIZ / "docs" / "notas-usuario" / "capturas" / "2026-11-07" / "modelo-dueno-0.5.28.ifc"
RECTANGULO = [(0.0, 0.0), (2.5, 0.0), (2.5, 1.5), (0.0, 1.5)]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Estructura")


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


def _volumen(nucleo: ModeloNucleo, gid: str) -> float:
    vertices, caras = _malla(nucleo, gid)
    return abs(sum(
        float(np.dot(vertices[c[0]], np.cross(vertices[c[1]], vertices[c[2]]))) / 6.0
        for c in caras
    ))


def _huella(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float]:
    """(área en planta, z mínimo, z máximo) de la malla real del elemento."""
    vertices, caras = _malla(nucleo, gid)
    triangulos = [
        Polygon([tuple(vertices[i][:2]) for i in cara]) for cara in caras
    ]
    area = unary_union(triangulos).area
    return area, float(vertices[:, 2].min()), float(vertices[:, 2].max())


def _caja(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    vertices, _caras = _malla(nucleo, gid)
    return (
        float(vertices[:, 0].min()), float(vertices[:, 0].max()),
        float(vertices[:, 1].min()), float(vertices[:, 1].max()),
    )


def _rectangulo() -> tuple[ModeloNucleo, str, list[str], list[str]]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O054")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    muros = []
    for x1, y1, x2, y2 in (
        (0, 0, 2.5, 0), (2.5, 0, 2.5, 1.5),
        (2.5, 1.5, 0, 1.5), (0, 1.5, 0, 0),
    ):
        muro = nucleo.muro_crear("Block 20", n0, x1, y1, x2, y2, altura=2.60)[
            "creados"
        ][0]
        nucleo.restricciones_editar(muro, nivel_tope=n0, desfase_tope=2.60)
        muros.append(muro)
    cerramientos = [
        nucleo.cerramiento_crear_en_muro(CERRAMIENTO, muro, nivel=n220, desfase=0.2)[
            "creados"
        ][0]
        for muro in muros
    ]
    castillos = nucleo.castillos_automaticos(separacion_max=3.0)["creados"]
    return nucleo, n220, cerramientos, castillos


def test_esquinas_del_rectangulo_suman_1_60_sin_traslapes() -> None:
    nucleo, _n220, cerramientos, castillos = _rectangulo()
    assert len(castillos) == 4
    for castillo in castillos:
        datos = _datos(nucleo, castillo)
        assert float(datos["B"]) == pytest.approx(0.20)
        assert float(datos["H"]) == pytest.approx(0.20)
        x0, x1, y0, y1 = _caja(nucleo, castillo)
        assert x1 - x0 == pytest.approx(0.20, abs=1e-9)
        assert y1 - y0 == pytest.approx(0.20, abs=1e-9)
    # Geometría real: cada pieza que vive en 2.20–2.40 aporta su huella.
    piezas = [*cerramientos, *castillos]
    areas = []
    for gid in piezas:
        area, z0, z1 = _huella(nucleo, gid)
        assert z0 < 2.40 and z1 > 2.20
        areas.append(area)
    assert sum(areas) == pytest.approx(1.60, abs=1e-6)
    # La unión de las huellas también mide 1.60: no hay traslapes.
    triangulos = []
    for gid in piezas:
        vertices, caras = _malla(nucleo, gid)
        triangulos.extend(
            Polygon([tuple(vertices[i][:2]) for i in cara]) for cara in caras
        )
    assert unary_union(triangulos).area == pytest.approx(1.60, abs=1e-6)


def test_modelo_del_dueno_se_repara_al_abrirlo() -> None:
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    castillos = [
        e.GlobalId for e in nucleo.modelo.by_type("IfcColumn")
        if nucleo._estructura_de_tipo(nucleo._tipo_entidad(e)) == "castillo"
    ]
    cerramientos = [
        e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")
        if nucleo._estructura_de_tipo(nucleo._tipo_entidad(e)) == "cerramiento"
    ]
    assert len(castillos) == 4 and len(cerramientos) == 4
    for gid in castillos:
        datos = _datos(nucleo, gid)
        assert float(datos["B"]) == pytest.approx(0.20)
        assert float(datos["H"]) == pytest.approx(0.20)
        assert "20×20" in _entidad(nucleo, gid).Name
    for gid in cerramientos:
        assert "20×20" in _entidad(nucleo, gid).Name
    piezas = [*cerramientos, *castillos]
    areas = []
    for gid in piezas:
        area, z0, z1 = _huella(nucleo, gid)
        assert z0 < 2.40 and z1 > 2.20
        areas.append(area)
    assert sum(areas) == pytest.approx(1.60, abs=1e-6)
    triangulos = []
    for gid in piezas:
        vertices, caras = _malla(nucleo, gid)
        triangulos.extend(
            Polygon([tuple(vertices[i][:2]) for i in cara]) for cara in caras
        )
    assert unary_union(triangulos).area == pytest.approx(1.60, abs=1e-6)


def test_castillo_intermedio_toma_el_nucleo_en_el_espesor() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O054 intermedio")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    castillo = nucleo.castillo_crear_en_muro(CASTILLO, muro, 2.0)["creados"][0]
    datos = _datos(nucleo, castillo)
    # 15 del tipo a lo largo; el núcleo de Block 15 (0.15) en el espesor.
    assert float(datos["B"]) == pytest.approx(0.15)
    assert float(datos["H"]) == pytest.approx(0.15)
    x0, x1, y0, y1 = _caja(nucleo, castillo)
    assert (x0, x1) == pytest.approx((1.925, 2.075), abs=1e-9)
    assert (y0, y1) == pytest.approx((-0.075, 0.075), abs=1e-9)


def test_seccion_del_tipo_recorta_el_muro_y_sus_capas() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O054 del tipo")
    nivel = nucleo.niveles()[0]["globalid"]
    tipo = next(
        t for t in nucleo.tipos_listar("IfcColumnType") if t["nombre"] == CASTILLO
    )["globalid"]
    nucleo.tipos_editar(tipo, {"seccion": {"B": 0.30, "H": 0.30}})
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    castillo = nucleo.castillo_crear_en_muro(CASTILLO, muro, 2.0)["creados"][0]
    nucleo.elemento_editar(castillo, {"AnchoDelMuro": False})

    datos = _datos(nucleo, castillo)
    assert float(datos["B"]) == pytest.approx(0.30)
    assert float(datos["H"]) == pytest.approx(0.30)
    # 4.00 × 0.15 × 2.60 = 1.56; menos 0.30 × 0.15 × 2.60 = 0.117 → 1.443.
    assert _volumen(nucleo, muro) == pytest.approx(1.443, abs=1e-6)
    assert _volumen(nucleo, castillo) == pytest.approx(0.234, abs=1e-6)
    # El muro termina en las caras del castillo: 2.00 ± 0.15.
    x0, x1, _y0, _y1 = _caja(nucleo, muro)
    assert (x0, x1) == pytest.approx((0.0, 4.0), abs=1e-9)
    # El hueco de 0.30 no existe en la malla del muro: se comprueba la huella.
    area, _z0, _z1 = _huella(nucleo, muro)
    assert area == pytest.approx(4.00 * 0.15 - 0.30 * 0.15, abs=1e-6)


def test_cantidades_de_castillos_y_cerramientos_sin_doble_conteo() -> None:
    nucleo, _n220, _cerramientos, _castillos = _rectangulo()
    elementos = [
        e for e in nucleo.cantidades_estructura()["elementos"]
        if e["alias"] in ("castillo", "cerramiento")
    ]
    assert len(elementos) == 8
    total = sum(float(e["volumen_neto_m3"]) for e in elementos)
    assert total == pytest.approx(0.704, abs=1e-9)


def test_deshacer_revierte_y_guardar_reabrir_conserva() -> None:
    nucleo, _n220, _cerramientos, castillos = _rectangulo()
    castillo = castillos[0]
    nucleo.elemento_editar(castillo, {"AnchoDelMuro": False})
    datos = _datos(nucleo, castillo)
    assert float(datos["B"]) == pytest.approx(0.15)
    assert float(datos["H"]) == pytest.approx(0.15)
    assert bool(datos["AnchoDelMuro"]) is False

    nucleo.deshacer()
    datos = _datos(nucleo, castillo)
    assert float(datos["B"]) == pytest.approx(0.20)
    assert float(datos["H"]) == pytest.approx(0.20)
    assert bool(datos["AnchoDelMuro"]) is True

    nucleo.elemento_editar(castillo, {"AnchoDelMuro": False})
    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "o054.ifc"
        nucleo.guardar(str(ruta))
        otro = ModeloNucleo()
        otro.abrir(str(ruta))
        datos = _datos(otro, castillo)
        assert float(datos["B"]) == pytest.approx(0.15)
        assert float(datos["H"]) == pytest.approx(0.15)
        assert bool(datos["AnchoDelMuro"]) is False
