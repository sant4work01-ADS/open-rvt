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


def test_muro_entre_castillos_largo_area_y_volumen_de_la_tabla() -> None:
    nucleo, nivel = _nuevo()
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    c1 = nucleo.castillo_crear_en_muro(K, muro, 0.0)["creados"][0]
    c2 = nucleo.castillo_crear_en_muro(K, muro, 4.0)["creados"][0]

    x0, x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert x1 - x0 == pytest.approx(3.85, abs=1e-9)
    assert (z0, z1) == pytest.approx((0.0, 2.60), abs=1e-9)
    assert _volumen_malla(nucleo, muro) == pytest.approx(3.85 * 2.60 * 0.15, abs=1e-9)

    info = next(
        e for e in nucleo.cantidades_estructura()["elementos"]
        if e["globalid"] == muro
    )
    assert info["detalle"]["area_neta_m2"] == pytest.approx(10.01, abs=1e-9)
    for castillo in (c1, c2):
        assert _volumen_malla(nucleo, castillo) == pytest.approx(0.15 * 0.15 * 2.60, abs=1e-9)
        assert _volumen_entre(nucleo, muro, castillo) == pytest.approx(0.0, abs=1e-9)


def test_capas_del_muro_tambien_terminan_en_los_castillos() -> None:
    nucleo, nivel = _nuevo()
    muro = nucleo.muro_crear(
        "Block 15 aplanado-yeso", nivel, 0, 0, 4, 0, altura=2.60
    )["creados"][0]
    nucleo.castillo_crear_en_muro(K, muro, 0.0)
    nucleo.castillo_crear_en_muro(K, muro, 4.0)
    entidad = _entidad(nucleo, muro)
    tipo = nucleo._tipo_entidad(entidad)
    capas = nucleo.capas_de_tipo(tipo)
    assert len(capas) == 6
    # Largo 3.85 y altura 2.60: cada capa mide 10.01 m², igual que el núcleo.
    for indice, _capa in enumerate(capas):
        assert nucleo._area_capa_muro(entidad, indice) == pytest.approx(10.01, abs=1e-9)


def test_muro_apoya_en_dala_y_corona_en_cerramiento_sin_traslape() -> None:
    nucleo, nivel = _nuevo()
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    dala = nucleo.dala_crear_en_muro("DD-1 Dala de desplante 15×20", muro)["creados"][0]
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    nucleo.castillo_crear_en_muro(K, muro, 0.0)
    nucleo.castillo_crear_en_muro(K, muro, 4.0)

    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    # Dala 0.20 en la base; cerramiento 0.20 en la corona.
    assert (z0, z1) == pytest.approx((0.20, 2.40), abs=1e-9)
    assert _volumen_malla(nucleo, muro) == pytest.approx(3.85 * 0.15 * 2.20, abs=1e-9)
    assert _volumen_entre(nucleo, muro, dala) == pytest.approx(0.0, abs=1e-9)
    assert _volumen_entre(nucleo, muro, cerramiento) == pytest.approx(0.0, abs=1e-9)

    info = next(
        e for e in nucleo.cantidades_estructura()["elementos"]
        if e["globalid"] == muro
    )
    assert info["detalle"]["area_neta_m2"] == pytest.approx(3.85 * 2.20, abs=1e-9)
    assert info["detalle"]["base_m"] == pytest.approx(0.20, abs=1e-9)
    assert info["detalle"]["cima_m"] == pytest.approx(2.40, abs=1e-9)


def test_muro_sobre_contratrabe_no_traslapa_y_conserva_su_largo() -> None:
    nucleo, nivel = _nuevo()
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    nucleo.castillo_crear_en_muro(K, muro, 0.0)
    nucleo.castillo_crear_en_muro(K, muro, 4.0)
    ct = nucleo.viga_crear(CT, nivel, 0, 0, 4, 0, desfase=0.20)["creados"][0]

    _x0, _x1, _y0, _y1, z0, _z1 = _caja(nucleo, muro)
    assert z0 == pytest.approx(0.20, abs=1e-9)
    assert _volumen_entre(nucleo, muro, ct) == pytest.approx(0.0, abs=1e-9)
    # La contratrabe también termina en las caras de los castillos: 3.85 m.
    assert _volumen_malla(nucleo, ct) == pytest.approx(3.85 * 0.20 * 0.40, abs=1e-9)


def test_muro_bajo_losa_se_recorta_en_la_cara_inferior() -> None:
    nucleo, nivel = _nuevo()
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    nucleo.castillo_crear_en_muro(K, muro, 0.0)
    nucleo.castillo_crear_en_muro(K, muro, 4.0)
    losa = nucleo.losa_crear(
        nivel, [(-1, -1), (5, -1), (5, 1), (-1, 1)], espesor=0.10, desfase=2.60
    )["creados"][0]
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (z0, z1) == pytest.approx((0.0, 2.50), abs=1e-9)
    assert _volumen_entre(nucleo, muro, losa) == pytest.approx(0.0, abs=1e-9)


def _modelo_con_todos_los_elementos() -> ModeloNucleo:
    """Cimentación, losa con trabes y muro con castillos, dala y cerramiento."""
    nucleo, nivel = _nuevo()
    # 1. Zapata + dado + columna, y contratrabe entre dos dados.
    for x, y in ((0, 0), (4, 0)):
        columna = nucleo.columna_crear(COL, nivel, x, y, altura=2.0)["creados"][0]
        nucleo.zapata_bajo_columna(ZAP, columna)
    nucleo.viga_crear(CT, nivel, 0, 0, 4, 0, desfase=-0.15)
    # 2. Losa entre cuatro trabes de 0.25 y columnas en las esquinas.
    nucleo.tipos_crear(
        "trabe", "T-25", {"seccion": {"Forma": "rectangular", "B": 0.25, "H": 0.40}}
    )
    for x, y in ((20, 0), (25, 0), (25, 4), (20, 4)):
        columna = nucleo.columna_crear(COL, nivel, x, y, altura=2.0)["creados"][0]
        nucleo.zapata_bajo_columna(ZAP, columna)
    for x1, y1, x2, y2 in (
        (20, 0, 25, 0), (25, 0, 25, 4), (25, 4, 20, 4), (20, 4, 20, 0)
    ):
        nucleo.viga_crear("T-25", nivel, x1, y1, x2, y2)
    nucleo.losa_crear(nivel, [(20, 0), (25, 0), (25, 4), (20, 4)], espesor=0.10)
    # 3. Muro con castillos, dala y cerramiento.
    muro = nucleo.muro_crear(MURO, nivel, 20, 10, 24, 10, altura=2.60)["creados"][0]
    nucleo.castillo_crear_en_muro(K, muro, 0.0)
    nucleo.castillo_crear_en_muro(K, muro, 4.0)
    nucleo.dala_crear_en_muro("DD-1 Dala de desplante 15×20", muro)
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    return nucleo


def test_invariante_global_sin_traslapes_en_un_modelo_con_todos_los_elementos() -> None:
    nucleo = _modelo_con_todos_los_elementos()
    elementos = nucleo.cantidades_estructura()["elementos"]
    assert {e["alias"] for e in elementos} >= {
        "zapata", "contratrabe", "columna", "trabe", "losa", "muro",
        "castillo", "dala", "cerramiento",
    }
    ids = [e["globalid"] for e in elementos]
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            assert _volumen_entre(nucleo, a, b) <= 1e-6, f"{a} y {b} se traslapan"
    cantidades = nucleo.cantidades_estructura()
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )
    assert sum(e["volumen_neto_m3"] for e in elementos) == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


def test_flujo_comando_guardar_reabrir_y_medicion_del_muro() -> None:
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "O012b flujo"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    muro = servidor.despachar(
        "muros.crear",
        {"tipo": MURO, "nivel": nivel, "x1": 0, "y1": 0, "x2": 4, "y2": 0, "altura": 2.6},
    )["creados"][0]
    for distancia in (0.0, 4.0):
        servidor.despachar(
            "castillos.crear_en_muro",
            {"tipo": K, "muro": muro, "distancia": distancia},
        )
    ruta = "/tmp/opencode/o012b-flujo.ifc"
    servidor.despachar("proyecto.guardar", {"ruta": ruta})

    otro = Servidor()
    otro.despachar("proyecto.abrir", {"ruta": ruta})
    cantidades = otro.despachar("cantidades.estructura", {})
    info = next(e for e in cantidades["elementos"] if e["globalid"] == muro)
    assert info["volumen_neto_m3"] == pytest.approx(3.85 * 0.15 * 2.60, abs=1e-9)
    assert info["detalle"]["area_neta_m2"] == pytest.approx(10.01, abs=1e-9)
    medicion = otro.despachar("medicion.calcular", {})
    area = next(
        p for p in medicion["partidas"]
        if any(r["globalid"] == muro for r in p["renglones"])
        and p["unidad"] == "m2"
    )
    renglon = next(r for r in area["renglones"] if r["globalid"] == muro)
    assert renglon["resultado"] == pytest.approx(10.01, abs=1e-4)


def test_copiar_losa_conserva_recorte_y_pset() -> None:
    nucleo, nivel = _nuevo()
    losa = _losa_entre_cuatro_trabes(nucleo, nivel)
    copia = nucleo.elementos_copiar([losa], 0, 0, 0)["creados"][0]
    datos = nucleo._leer_pset(_entidad(nucleo, copia), "OPENRVT_Losa")
    assert datos.get("Contorno")
    assert datos.get("Area") == pytest.approx(17.8125, abs=1e-9)
    assert datos.get("Espesor") == pytest.approx(0.10, abs=1e-9)
    assert _volumen_malla(nucleo, copia) == pytest.approx(1.78125, abs=1e-9)


def test_zapata_sin_dado_no_inventa_una_columna_falsa() -> None:
    nucleo, nivel = _nuevo()
    nucleo.tipos_crear(
        "zapata",
        "Z-0 Sin dado",
        {"seccion": {"Largo": 1.2, "Ancho": 1.2, "Peralte": 0.25,
                     "DadoB": 0.0, "DadoH": 0.0, "DadoAlto": 0.0,
                     "Plantilla": 0.05}},
    )
    columna = nucleo.columna_crear(COL, nivel, 0, 0, altura=2.0)["creados"][0]
    zapata = nucleo.zapata_bajo_columna("Z-0 Sin dado", columna)["creados"][0]
    entidad = _entidad(nucleo, zapata)
    assert nucleo._barras_de_dado(entidad) == []
    # La columna baja hasta la cara superior de la zapata: 1.20²·0.25 + plantilla.
    info = next(
        e for e in nucleo.cantidades_estructura()["elementos"]
        if e["globalid"] == zapata
    )
    assert info["volumen_neto_m3"] == pytest.approx(1.2 * 1.2 * 0.25 + 1.2 * 1.2 * 0.05, abs=1e-9)
