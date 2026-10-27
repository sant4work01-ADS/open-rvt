"""O012: uniones de vigas, contratrabes y columnas.

Los valores esperados salen de la tabla de la especificación, calculados a mano:
contratrabe CT-1 de 0.20 × 0.40 (área 0.08 m²) y columnas de 0.30 × 0.30.

- L sin columna: A de x = -0.10 a 4.00 (4.10 m) y B de y = 0.10 a 3.00 (2.90 m)
  → 0.08 · (4.10 + 2.90) = 0.560 m³.
- T: A pasante de 6.00 m y B de 3.00 a 0.10 (2.90 m) → 0.08 · 8.90 = 0.712 m³.
- Columna en (3, 0), A1 y A2 se recortan en x = 2.85 y 3.15 (2.85 m cada una).
- Hueco de 3 cm: B termina en y = 0.10 (2.90 m); hueco de 8 cm: no se une (2.82 m).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.api.geometry as geometry_api
import numpy as np
import pytest
from shapely.geometry import Polygon
from shapely.ops import unary_union

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

CT = "CT-1 Contratrabe 20×40"
COL = "C-1 Columna 30×30"
ANCHO = 0.20
PERALTE = 0.40
AREA = ANCHO * PERALTE


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O012")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _malla(nucleo: ModeloNucleo, gid: str):
    """Vértices y triángulos en coordenadas de mundo del cuerpo del elemento."""
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


def _caja(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    vertices, _caras = _malla(nucleo, gid)
    return (
        float(vertices[:, 0].min()), float(vertices[:, 0].max()),
        float(vertices[:, 1].min()), float(vertices[:, 1].max()),
    )


def _viga(nucleo: ModeloNucleo, nivel: str, x1, y1, x2, y2) -> str:
    return nucleo.viga_crear(CT, nivel, x1, y1, x2, y2)["creados"][0]


def _volumenes(nucleo: ModeloNucleo) -> dict[str, dict[str, float]]:
    return {
        e["globalid"]: e for e in nucleo.cantidades_estructura()["elementos"]
    }


def test_l_sin_columna_volumen_y_coordenadas_exactas() -> None:
    nucleo, nivel = _nuevo()
    a = _viga(nucleo, nivel, 0, 0, 4, 0)
    b = _viga(nucleo, nivel, 0, 0, 0, 3)

    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 4.10, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * 2.90, abs=1e-9)
    x0, x1, _y0, _y1 = _caja(nucleo, a)
    _x0, _x1, y0, y1 = _caja(nucleo, b)
    assert (x0, x1) == pytest.approx((-0.10, 4.00), abs=1e-9)
    assert (y0, y1) == pytest.approx((0.10, 3.00), abs=1e-9)

    cantidades = nucleo.cantidades_estructura()
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(0.560, abs=1e-9)
    assert cantidades["union_m3"] == pytest.approx(0.560, abs=1e-9)


def test_t_sin_columna_recorta_el_que_llega() -> None:
    nucleo, nivel = _nuevo()
    a = _viga(nucleo, nivel, 0, 0, 6, 0)
    b = _viga(nucleo, nivel, 3, 3, 3, 0)

    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 6.00, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * 2.90, abs=1e-9)
    _x0, _x1, y0, y1 = _caja(nucleo, b)
    assert (y0, y1) == pytest.approx((0.10, 3.00), abs=1e-9)

    cantidades = nucleo.cantidades_estructura()
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(0.712, abs=1e-9)
    assert cantidades["union_m3"] == pytest.approx(0.712, abs=1e-9)


def test_columna_en_el_nodo_manda_y_recorta_las_dos_vigas() -> None:
    nucleo, nivel = _nuevo()
    columna = nucleo.columna_crear(COL, nivel, 3, 0, altura=2.0)["creados"][0]
    a1 = _viga(nucleo, nivel, 0, 0, 3, 0)
    a2 = _viga(nucleo, nivel, 3, 0, 6, 0)

    assert _volumen_malla(nucleo, columna) == pytest.approx(0.30 * 0.30 * 2.0, abs=1e-9)
    assert _volumen_malla(nucleo, a1) == pytest.approx(AREA * 2.85, abs=1e-9)
    assert _volumen_malla(nucleo, a2) == pytest.approx(AREA * 2.85, abs=1e-9)
    _x0, x1, _y0, _y1 = _caja(nucleo, a1)
    x20, _x21, _y20, _y21 = _caja(nucleo, a2)
    assert x1 == pytest.approx(2.85, abs=1e-9)
    assert x20 == pytest.approx(3.15, abs=1e-9)

    # La columna queda entera y manda en la relación IFC.
    relaciones = [
        r for r in nucleo.modelo.by_type("IfcRelConnectsElements")
        if r.Name == "OPEN-RVT unión"
    ]
    assert len(relaciones) == 2
    for rel in relaciones:
        assert rel.RelatingElement.GlobalId == columna
        assert rel.RelatedElement.GlobalId in (a1, a2)


def test_hueco_de_tres_centimetros_se_une_y_ocho_no() -> None:
    nucleo, nivel = _nuevo()
    _viga(nucleo, nivel, 0, 0, 6, 0)
    b3 = _viga(nucleo, nivel, 3, 3, 3, 0.13)
    _x0, _x1, y03, _y13 = _caja(nucleo, b3)
    assert y03 == pytest.approx(0.10, abs=1e-9)
    assert _volumen_malla(nucleo, b3) == pytest.approx(AREA * 2.90, abs=1e-9)

    otro, nivel2 = _nuevo()
    _viga(otro, nivel2, 0, 0, 6, 0)
    b8 = _viga(otro, nivel2, 3, 3, 3, 0.18)
    _x0, _x1, y08, _y18 = _caja(otro, b8)
    assert y08 == pytest.approx(0.18, abs=1e-9)
    assert _volumen_malla(otro, b8) == pytest.approx(AREA * 2.82, abs=1e-9)


def test_x_parte_la_viga_mas_corta_en_dos_solidos_de_un_solo_elemento() -> None:
    nucleo, nivel = _nuevo()
    a = _viga(nucleo, nivel, 0, 0, 8, 0)
    b = _viga(nucleo, nivel, 4, -2, 4, 2)

    entidad = _entidad(nucleo, b)
    assert entidad.is_a("IfcFooting")
    assert entidad.PredefinedType == "FOOTING_BEAM"
    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 8.00, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * (1.90 + 1.90), abs=1e-9)
    # Sigue siendo un solo IfcBeam con dos sólidos: dos cajas separadas en el eje.
    assert len(entidad.Representation.Representations[0].Items[0].Faces) == 12


def _poligonos_de(nucleo: ModeloNucleo, gid: str) -> list[Polygon]:
    entidad = _entidad(nucleo, gid)
    info = nucleo._piezas_de_elemento(entidad)
    assert info is not None
    return [p["poligono"]() for p in info["piezas"]]


def test_invariante_union_igual_a_suma_y_sin_traslapes() -> None:
    nucleo, nivel = _nuevo()
    _viga(nucleo, nivel, 0, 0, 4, 0)
    _viga(nucleo, nivel, 0, 0, 0, 3)
    _viga(nucleo, nivel, 4, 0, 8, 0)
    _viga(nucleo, nivel, 6, -2, 6, 2)
    nucleo.columna_crear(COL, nivel, 8, 0, altura=2.0)

    cantidades = nucleo.cantidades_estructura()
    suma = sum(e["volumen_neto_m3"] for e in cantidades["elementos"])
    assert suma == pytest.approx(cantidades["union_m3"], abs=1e-6)
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(suma, abs=1e-6)

    ids = [e["globalid"] for e in cantidades["elementos"]]
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            for pa in _poligonos_de(nucleo, a):
                for pb in _poligonos_de(nucleo, b):
                    interseccion = pa.intersection(pb).area
                    if interseccion > 1e-9:
                        # Todas las piezas son prismas de 0.40 m de alto.
                        assert interseccion * PERALTE <= 1e-6


def test_borrar_columna_recalcula_vecinos_y_deshacer_los_recorta() -> None:
    nucleo, nivel = _nuevo()
    columna = nucleo.columna_crear(COL, nivel, 2, 0, altura=2.0)["creados"][0]
    a = _viga(nucleo, nivel, 0, 0, 2, 0)
    b = _viga(nucleo, nivel, 2, 0, 4, 0)
    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 1.85, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * 1.85, abs=1e-9)

    nucleo.elementos_borrar([columna], dependientes=False)
    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 2.00, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * 2.00, abs=1e-9)

    nucleo.deshacer()
    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 1.85, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * 1.85, abs=1e-9)


def test_flujo_crear_guardar_reabrir_reporte() -> None:
    nucleo, nivel = _nuevo()
    a = _viga(nucleo, nivel, 0, 0, 4, 0)
    b = _viga(nucleo, nivel, 0, 0, 0, 3)
    ruta = "/tmp/opencode/o012-flujo.ifc"
    nucleo.guardar(ruta)

    otro = ModeloNucleo()
    otro.abrir(ruta)
    assert len(otro.modelo.by_type("IfcBeam")) + len(otro.modelo.by_type("IfcFooting")) == 2
    cantidades = otro.cantidades_estructura()
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(0.560, abs=1e-9)
    netos = {e["globalid"]: e["volumen_neto_m3"] for e in cantidades["elementos"]}
    assert netos[a] == pytest.approx(AREA * 4.10, abs=1e-9)
    assert netos[b] == pytest.approx(AREA * 2.90, abs=1e-9)


def test_compatibilidad_057_regenera_vigas_encimadas_sin_perder_elementos() -> None:
    """Un archivo 0.5.7 traía las cajas completas, de centro a centro."""
    nucleo, nivel = _nuevo()
    a = _viga(nucleo, nivel, 0, 0, 4, 0)
    b = _viga(nucleo, nivel, 0, 0, 0, 3)
    # Se simula el archivo viejo: cuerpo completo y sin relaciones de unión.
    for gid in (a, b):
        elemento = _entidad(nucleo, gid)
        datos = nucleo._leer_pset(elemento, "OPENRVT_Estructura")
        seccion = {"B": ANCHO, "H": PERALTE}
        cuerpo = nucleo._cuerpo_viga(seccion, float(datos["Longitud"]))
        geometry_api.assign_representation(nucleo.modelo, product=elemento, representation=cuerpo)
    for rel in list(nucleo.modelo.by_type("IfcRelConnectsElements")):
        if rel.Name == "OPEN-RVT unión":
            nucleo.modelo.remove(rel)
    ruta = "/tmp/opencode/o012-v057.ifc"
    nucleo.guardar(ruta)

    viejo = ModeloNucleo()
    viejo.abrir(ruta)
    assert len(viejo.modelo.by_type("IfcFooting")) == 2
    assert _volumen_malla(viejo, a) == pytest.approx(AREA * 4.10, abs=1e-9)
    assert _volumen_malla(viejo, b) == pytest.approx(AREA * 2.90, abs=1e-9)
    assert len([
        r for r in viejo.modelo.by_type("IfcRelConnectsElements")
        if r.Name == "OPEN-RVT unión"
    ]) == 1


def test_hueco_de_cinco_centimetros_es_el_limite() -> None:
    # Justo 5 cm sí se une; 5.1 cm no.
    for extremo, unido in ((0.15, True), (0.151, False)):
        nucleo, nivel = _nuevo()
        _viga(nucleo, nivel, 0, 0, 6, 0)
        b = _viga(nucleo, nivel, 3, 3, 3, extremo)
        _x0, _x1, y0, _y1 = _caja(nucleo, b)
        if unido:
            assert y0 == pytest.approx(0.10, abs=1e-9)
        else:
            assert y0 == pytest.approx(extremo, abs=1e-9)


def test_mover_columna_recalcula_las_vigas_vecinas() -> None:
    nucleo, nivel = _nuevo()
    columna = nucleo.columna_crear(COL, nivel, 2, 0, altura=2.0)["creados"][0]
    a = _viga(nucleo, nivel, 0, 0, 2, 0)
    b = _viga(nucleo, nivel, 2, 0, 4, 0)
    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 1.85, abs=1e-9)

    nucleo.elementos_mover([columna], 1, 0, 0)
    # La columna quedó en x = 3: la viga A ya no tiene columna y mide 2.00 m; la B
    # pasa por la columna y se parte en dos tramos de 0.85 m.
    assert _volumen_malla(nucleo, a) == pytest.approx(AREA * 2.00, abs=1e-9)
    assert _volumen_malla(nucleo, b) == pytest.approx(AREA * 1.70, abs=1e-9)
    entidad_b = _entidad(nucleo, b)
    assert len(entidad_b.Representation.Representations[0].Items[0].Faces) == 12


def test_copiar_conserva_pset_tramos_y_relaciones() -> None:
    nucleo, nivel = _nuevo()
    a = _viga(nucleo, nivel, 0, 0, 4, 0)
    copia = nucleo.elementos_copiar([a], 0, 4, 0)["creados"][0]
    entidad = _entidad(nucleo, copia)
    datos = nucleo._leer_pset(entidad, "OPENRVT_Estructura")
    assert (datos["X1"], datos["Y1"]) == pytest.approx((0.0, 4.0))
    assert datos["Longitud"] == pytest.approx(4.0)
    assert _volumen_malla(nucleo, copia) == pytest.approx(AREA * 4.0, abs=1e-9)
    assert len(nucleo.modelo.by_type("IfcFooting")) == 2
