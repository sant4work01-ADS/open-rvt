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


def _losa_entre_cuatro_trabes(nucleo: ModeloNucleo, nivel: str) -> str:
    nucleo.tipos_crear(
        "trabe", "T-25", {"seccion": {"Forma": "rectangular", "B": 0.25, "H": 0.40}}
    )
    for x1, y1, x2, y2 in (
        (0, 0, 5, 0), (5, 0, 5, 4), (5, 4, 0, 4), (0, 4, 0, 0)
    ):
        nucleo.viga_crear("T-25", nivel, x1, y1, x2, y2)
    return nucleo.losa_crear(
        nivel, [(0, 0), (5, 0), (5, 4), (0, 4)], espesor=0.10
    )["creados"][0]


def test_losa_entre_cuatro_trabes_area_y_volumen_de_la_tabla() -> None:
    nucleo, nivel = _nuevo()
    losa = _losa_entre_cuatro_trabes(nucleo, nivel)

    x0, x1, y0, y1, z0, z1 = _caja(nucleo, losa)
    # Las trabes de 0.25 centradas en los ejes dejan la losa de 4.75 × 3.75.
    assert (x0, x1) == pytest.approx((0.125, 4.875), abs=1e-9)
    assert (y0, y1) == pytest.approx((0.125, 3.875), abs=1e-9)
    assert (z0, z1) == pytest.approx((-0.10, 0.0), abs=1e-9)
    assert _volumen_malla(nucleo, losa) == pytest.approx(1.78125, abs=1e-9)

    cantidades = nucleo.cantidades_estructura()
    info = next(e for e in cantidades["elementos"] if e["globalid"] == losa)
    assert info["volumen_neto_m3"] == pytest.approx(1.78125, abs=1e-9)

    medicion = nucleo.medicion_calcular()["partidas"]
    area = next(p for p in medicion if p["nombre"] == "Área de la losa")
    assert area["total"] == pytest.approx(17.8125, abs=1e-4)
    volumen = next(p for p in medicion if p["nombre"] == "Volumen de concreto")
    renglon = next(r for r in volumen["renglones"] if r["globalid"] == losa)
    assert renglon["resultado"] == pytest.approx(1.7812, abs=1e-4)


def test_losa_recortada_en_la_cara_de_la_trabe_y_la_trabe_queda_entera() -> None:
    nucleo, nivel = _nuevo()
    losa = _losa_entre_cuatro_trabes(nucleo, nivel)
    trabes = [
        e for e in nucleo.cantidades_estructura()["elementos"] if e["alias"] == "trabe"
    ]
    assert len(trabes) == 4
    # O012 entre vigas: la más larga (5.00) llega a la cara exterior de la corta
    # y la corta (4.00) se recorta en la cara interior. La losa no les quita nada:
    # 0.25·0.40·(5.00 + 0.125 + 0.125) = 0.525 y 0.25·0.40·(4.00 − 0.25) = 0.375.
    volumenes = sorted(t["volumen_neto_m3"] for t in trabes)
    assert volumenes == pytest.approx([0.375, 0.375, 0.525, 0.525], abs=1e-9)
    # La losa ocupa solo su espesor y las trabes siguen enteras hacia abajo.
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, losa)
    assert (z0, z1) == pytest.approx((-0.10, 0.0), abs=1e-9)
    for trabe in trabes:
        _tx0, _tx1, _ty0, _ty1, tz0, tz1 = _caja(nucleo, trabe["globalid"])
        assert (tz0, tz1) == pytest.approx((-0.40, 0.0), abs=1e-9)


def _volumen_entre(nucleo: ModeloNucleo, a: str, b: str) -> float:
    info_a = nucleo._piezas_de_elemento(_entidad(nucleo, a))
    info_b = nucleo._piezas_de_elemento(_entidad(nucleo, b))
    total = 0.0
    for pieza_a in info_a["piezas"]:
        for pieza_b in info_b["piezas"]:
            z0 = max(pieza_a["z0"], pieza_b["z0"])
            z1 = min(pieza_a["z1"], pieza_b["z1"])
            if z1 - z0 <= 1e-9:
                continue
            total += pieza_a["poligono"]().intersection(pieza_b["poligono"]()).area * (z1 - z0)
    return total


def test_columna_en_esquina_de_losa_no_traslapa_volumen() -> None:
    nucleo, nivel = _nuevo()
    losa = _losa_entre_cuatro_trabes(nucleo, nivel)
    columna = _zapata_con_columna(nucleo, nivel, 0, 0)
    # La columna baja hasta el dado y atraviesa el espesor de la losa.
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, losa)
    _cx0, _cx1, _cy0, _cy1, cz0, cz1 = _caja(nucleo, columna)
    assert cz0 < z0 and cz1 > z1
    assert _volumen_entre(nucleo, losa, columna) == pytest.approx(0.0, abs=1e-9)
