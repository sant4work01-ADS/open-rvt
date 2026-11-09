"""O058: el muro atraviesa losas y cerramientos intermedios.

Valores a mano (spec O058 y bitácora del dueño, 2026-11-09):
- Niveles N0 0.00, N1 2.20, N2 2.40, N3 3.00, N4 3.20, N5 3.60; rectángulo
  2.50 × 1.50; losa N0 de −0.12 a 0.00; cerramientos 15 × 20 en 2.20–2.40; losa
  N4 de 3.08 a 3.20; cuatro muros con base N0 y tope N5.
- El cuerpo del muro va de 0.00 a 3.60 y se parte en tramos: 0.00–2.20 (muro),
  2.20–2.40 (cerramiento), 2.40–3.08 (muro), 3.08–3.20 (losa N4) y 3.20–3.60
  (muro). O061: cada intermedio resta solo su sólido ∩ el muro, no la franja
  entera; la losa N4 llega a −0.075 y deja una franja de 0.025 en el borde.
  El IFC del dueño trae muros «Block 20» (Espesor 0.20), no Block 15 como dice
  la narrativa; por eso la huella se toma de `_huellas_muro`, como pide la spec:
  el muro de y = 1.5 mide 2.30 × 0.20 = 0.46 m² (2.50 de eje menos los dos
  castillos de 0.15/2 a cada lado); su volumen a mano es
  0.46 × 3.48 − (0.15 × 2.30) × 0.20 + (2.30 × 0.025) × 0.12 = 1.5387 m³.
- Muro N0 con tope N1 y losa N1 (2.08–2.20): la corona baja a 2.08; la losa toca
  la corona nominal 2.20, así que sí es cubierta. Base 0.00.
- Muro sobre losa N0 (−0.12…0.00): la losa toca la base nominal 0.00 → base 0.00.
- Muro sobre contratrabe O035 con cara superior −0.30: la base baja a −0.30.
- Muro en N1 (2.20) sobre cerramiento 2.20–2.40: el cerramiento toca su base
  nominal y su cara superior es 2.40 → la base sube a 2.40.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely.geometry import Polygon

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

DUENO = RAIZ / "nucleo" / "tests" / "datos" / "o058-muro-n0-n5.ifc"
MURO = "Block 20"
CERRAMIENTO = "CE-1 Cerramiento 15×20"
CONTRATRABE = "CT-1 Contratrabe 20×40"
LADOS = [
    (0.0, 0.0, 2.5, 0.0),
    (2.5, 0.0, 2.5, 1.5),
    (2.5, 1.5, 0.0, 1.5),
    (0.0, 1.5, 0.0, 0.0),
]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._datos_muro(_entidad(nucleo, gid))


def _huella_area(nucleo: ModeloNucleo, gid: str) -> float:
    datos = _datos(nucleo, gid)
    return sum(
        Polygon(anillo).area for anillo in nucleo._huellas_muro(_entidad(nucleo, gid), datos)
    )


def _caja(nucleo: ModeloNucleo, gid: str) -> tuple[float, ...]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == _entidad(nucleo, gid).id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            return (
                float(vertices[:, 0].min()), float(vertices[:, 0].max()),
                float(vertices[:, 1].min()), float(vertices[:, 1].max()),
                float(vertices[:, 2].min()), float(vertices[:, 2].max()),
            )
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {gid}")


def _volumen_malla(nucleo: ModeloNucleo, gid: str) -> float:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == _entidad(nucleo, gid).id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            return abs(
                sum(
                    float(
                        np.dot(
                            vertices[c[0]],
                            np.cross(vertices[c[1]], vertices[c[2]]),
                        )
                    )
                    / 6.0
                    for c in caras
                )
            )
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {gid}")


def _niveles(nucleo: ModeloNucleo) -> dict[str, str]:
    salida = {}
    for nombre, elevacion in (
        ("Nivel 1", 2.20),
        ("Nivel 2", 2.40),
        ("Nivel 3", 3.00),
        ("Nivel 4", 3.20),
        ("Nivel 5", 3.60),
    ):
        salida[nombre] = nucleo.nivel_crear(nombre, elevacion)["creados"][0]
    salida["Nivel 0"] = nucleo.niveles()[0]["globalid"]
    return salida


def test_muros_del_dueno_van_de_0_a_360_y_descuentan_cerramiento_y_losa() -> None:
    """(a) El IFC del dueño, regenerado, deja cada muro de 0.00 a 3.60."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    muros = list(nucleo.modelo.by_type("IfcWall"))
    assert len(muros) == 4
    for muro in muros:
        nucleo._regenerar_muro(muro)

    areas = {}
    # O061: valores a mano. A = huella; el cerramiento de 0.15 resta solo
    # su sólido (0.15 × solape) y la azotea N4 (3.08–3.20) deja 0.025 de franja
    # en el borde exterior porque su contorno llega a −0.075. En las esquinas
    # a 45° el solape pierde un triángulo de 0.075² / 2 = 0.0028125.
    esperados = {
        # eje y=1.5: 0.46×3.48 − (0.15×2.30)×0.20 + (2.30×0.025)×0.12 = 1.5387.
        "00gX8hgmr8fROaq_4TRyaB": 1.5387,
        # eje x=2.5: 0.26×3.48 − (0.15×1.30)×0.20 + (1.30×0.025)×0.12 = 0.8697.
        "0KjZGGVCz5uRbquvy4FH$a": 0.8697,
        # eje y=0 (esquina 45°): cerramiento 0.15×2.40 − 0.0028125 = 0.3571875;
        # franja 0.025×2.475 + 0.0003125 = 0.0621875;
        # 0.48×3.48 − 0.3571875×0.20 + 0.0621875×0.12 = 1.606425.
        "2$JKY6B6f4nuTR$iWYRmCb": 1.606425,
        # eje x=0 (espejo): cerramiento 0.15×1.40 − 0.0028125 = 0.2071875;
        # franja 0.025×1.475 + 0.0003125 = 0.0371875;
        # 0.28×3.48 − 0.2071875×0.20 + 0.0371875×0.12 = 0.937425.
        "0xg3GB_If8tvz7MLS9Vl76": 0.937425,
    }
    for muro in muros:
        gid = muro.GlobalId
        areas[gid] = _huella_area(nucleo, gid)
        _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, gid)
        assert z0 == pytest.approx(0.00, abs=1e-9), f"{gid} no arranca en 0.00"
        assert z1 == pytest.approx(3.60, abs=1e-9), f"{gid} no llega a 3.60"
        assert _volumen_malla(nucleo, gid) == pytest.approx(
            esperados[gid], abs=1e-6
        )

    # El muro de y = 1.5 mide 2.30 × 0.20 = 0.46 m² de huella.
    muro_y15 = next(m for m in muros if abs(_datos(nucleo, m.GlobalId)["y1"] - 1.5) < 1e-9)
    assert areas[muro_y15.GlobalId] == pytest.approx(0.46, abs=1e-9)
    assert _volumen_malla(nucleo, muro_y15.GlobalId) == pytest.approx(
        1.5387, abs=1e-6
    )


def test_muro_n0_tope_n1_bajo_losa_n1_corona_208() -> None:
    """(b) La losa de N1 toca la corona nominal 2.20: corona 2.08 y base 0.00."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 b")
    n0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.20)["creados"][0]
    muro = nucleo.muro_crear(MURO, n0, 0, 0, 4, 0, altura=2.60)["creados"][0]
    # Tope N1 explícito: la altura nominal es 2.20.
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    assert _datos(nucleo, muro)["altura"] == pytest.approx(2.20, abs=1e-9)
    nucleo.losa_crear(
        n1, [(-1, -1), (5, -1), (5, 1), (-1, 1)], espesor=0.12, desfase=0
    )

    entidad = _entidad(nucleo, muro)
    assert nucleo._limites_verticales_muro_nivel(entidad, _datos(nucleo, muro)) == (
        pytest.approx(0.00, abs=1e-9),
        pytest.approx(2.08, abs=1e-9),
    )
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (z0, z1) == pytest.approx((0.00, 2.08), abs=1e-9)
    # La losa toca la corona nominal: no es intermedia, el cuerpo llega a 2.08.
    assert _volumen_malla(nucleo, muro) == pytest.approx(
        _huella_area(nucleo, muro) * 2.08, abs=1e-6
    )


def test_muro_sobre_losa_n0_conserva_base_0() -> None:
    """(c) La losa N0 (−0.12…0.00) toca la base nominal: base 0.00."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 c losa")
    n0 = nucleo.niveles()[0]["globalid"]
    nucleo.losa_crear(
        n0, [(-1, -1), (5, -1), (5, 1), (-1, 1)], espesor=0.12, desfase=0
    )
    muro = nucleo.muro_crear(MURO, n0, 0, 0, 4, 0, altura=2.60)["creados"][0]

    entidad = _entidad(nucleo, muro)
    assert nucleo._limites_verticales_muro_nivel(entidad, _datos(nucleo, muro)) == (
        pytest.approx(0.00, abs=1e-9),
        pytest.approx(2.60, abs=1e-9),
    )
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (z0, z1) == pytest.approx((0.00, 2.60), abs=1e-9)
    # La losa queda por debajo de la base: no se descuenta del cuerpo.
    assert _volumen_malla(nucleo, muro) == pytest.approx(
        _huella_area(nucleo, muro) * 2.60, abs=1e-6
    )


def test_muro_sobre_contratrabe_o035_baja_a_su_cara_superior() -> None:
    """(c) O035 se conserva: la base baja a la cara superior de la contratrabe."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 c contratrabe")
    n0 = nucleo.niveles()[0]["globalid"]
    nucleo.viga_crear(CONTRATRABE, n0, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 4, 0, altura=2.60)["creados"][0]

    entidad = _entidad(nucleo, muro)
    assert nucleo._limites_verticales_muro(entidad, _datos(nucleo, muro)) == (
        pytest.approx(-0.30, abs=1e-9),
        pytest.approx(2.60, abs=1e-9),
    )
    assert _caja(nucleo, muro)[4] == pytest.approx(-0.30, abs=1e-9)
    # 4.00 × 0.15 × 2.90 = 1.740 m³ (muro Block 15 de 2.60 sobre −0.30).
    assert _volumen_malla(nucleo, muro) == pytest.approx(1.740, abs=1e-6)


def test_muro_en_n1_sobre_cerramiento_220_240_arranca_en_240() -> None:
    """(d) El cerramiento toca la base 2.20 y su cara superior 2.40 manda."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 d")
    n0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.20)["creados"][0]
    # El muro se crea antes de Nivel 2 para que su tope quede libre (2.60).
    muro = nucleo.muro_crear(MURO, n1, 0, 0, 4, 0, altura=2.60)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 2.40)["creados"][0]
    # Nivel 2, desfase 0: centro 2.30 → cerramiento de 2.20 a 2.40.
    nucleo.cerramiento_crear(CERRAMIENTO, 0, 0, 4, 0, nivel=n2, desfase=0)
    nucleo._regenerar_muro(_entidad(nucleo, muro))

    entidad = _entidad(nucleo, muro)
    assert nucleo._limites_verticales_muro_nivel(entidad, _datos(nucleo, muro)) == (
        pytest.approx(2.40, abs=1e-9),
        pytest.approx(4.80, abs=1e-9),
    )
    assert _caja(nucleo, muro)[4] == pytest.approx(2.40, abs=1e-9)
    # El cerramiento queda en la base, no dentro: 4.00 × 0.20 × 2.40 = 1.920 m³.
    assert _volumen_malla(nucleo, muro) == pytest.approx(1.920, abs=1e-6)


def test_losa_a_media_altura_no_cambia_base_ni_corona_y_se_resta() -> None:
    """Regla 3: una losa que no toca base ni corona parte el muro en tramos."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 intermedia")
    n0 = nucleo.niveles()[0]["globalid"]
    n5 = nucleo.nivel_crear("Nivel 5", 3.60)["creados"][0]
    muro = nucleo.muro_crear(MURO, n0, 0, 0, 4, 0, altura=2.60)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n5)
    # Losa de 0.20 de 1.40 a 1.60: ni apoyo (no toca 0.00) ni cubierta (no toca 3.60).
    nucleo.losa_crear(
        n0, [(-1, -1), (5, -1), (5, 1), (-1, 1)], espesor=0.20, desfase=1.60
    )

    entidad = _entidad(nucleo, muro)
    assert nucleo._limites_verticales_muro_nivel(entidad, _datos(nucleo, muro)) == (
        pytest.approx(0.00, abs=1e-9),
        pytest.approx(3.60, abs=1e-9),
    )
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (z0, z1) == pytest.approx((0.00, 3.60), abs=1e-9)
    # 3.60 − 0.20 de losa intermedia = 3.40 m de cuerpo.
    assert _volumen_malla(nucleo, muro) == pytest.approx(
        _huella_area(nucleo, muro) * 3.40, abs=1e-6
    )


def test_cerramiento_a_media_altura_no_baja_la_corona_ni_la_base() -> None:
    """Regla 2/3: el cerramiento intermedio no es cubierta (O045) y se resta."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 cerramiento intermedio")
    n0 = nucleo.niveles()[0]["globalid"]
    # El muro se crea antes de Nivel 2 para que su tope quede libre (2.60).
    muro = nucleo.muro_crear(MURO, n0, 0, 0, 4, 0, altura=2.60)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 2.40)["creados"][0]
    nucleo.cerramiento_crear(CERRAMIENTO, 0, 0, 4, 0, nivel=n2, desfase=0)
    nucleo._regenerar_muro(_entidad(nucleo, muro))

    entidad = _entidad(nucleo, muro)
    assert nucleo._limites_verticales_muro_nivel(entidad, _datos(nucleo, muro)) == (
        pytest.approx(0.00, abs=1e-9),
        pytest.approx(2.60, abs=1e-9),
    )
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (z0, z1) == pytest.approx((0.00, 2.60), abs=1e-9)
    # 2.60 − 0.20 del cerramiento 2.20–2.40 = 2.40 m de cuerpo.
    assert _volumen_malla(nucleo, muro) == pytest.approx(
        _huella_area(nucleo, muro) * 2.40, abs=1e-6
    )


def test_flujo_completo_cambiar_tope_a_n5_guarda_reabre_y_reporta() -> None:
    """Flujo: comandos → cambiar tope en N5 → guardar → reabrir → cantidades."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O058 flujo")
    niveles = _niveles(nucleo)
    n0 = niveles["Nivel 0"]
    n2 = niveles["Nivel 2"]
    n5 = niveles["Nivel 5"]

    # Losa de N0 (−0.12…0.00) y cuatro muros en N0 con tope automático N1.
    nucleo.losa_crear(
        n0, [(-0.1, -0.1), (2.6, -0.1), (2.6, 1.6), (-0.1, 1.6)],
        espesor=0.12, desfase=0,
    )
    muros = [
        nucleo.muro_crear(MURO, n0, *lado, altura=2.60)["creados"][0] for lado in LADOS
    ]
    for muro in muros:
        assert _datos(nucleo, muro)["altura"] == pytest.approx(2.20, abs=1e-9)

    # Cerramientos 2.20–2.40 sobre cada muro y losa de N4 (3.08–3.20).
    for muro in muros:
        nucleo.cerramiento_crear_en_muro(CERRAMIENTO, muro, nivel=n2, desfase=0)
    nucleo.losa_crear(
        niveles["Nivel 4"],
        [(-0.075, -0.075), (2.575, -0.075), (2.575, 1.575), (-0.075, 1.575)],
        espesor=0.12, desfase=0,
    )

    # El dueño cambia el tope de los cuatro muros a N5 en Propiedades.
    for muro in muros:
        nucleo.restricciones_editar(muro, nivel_tope=n5)
        assert _datos(nucleo, muro)["altura"] == pytest.approx(3.60, abs=1e-9)

    # O061: valores a mano. Los cerramientos se crean con AnchoDelMuro = True
    # (B = 0.20), se cruzan en las esquinas y dejan dos triángulos de 0.005 en
    # el tramo 2.20–2.40; la losa N4 (contorno a −0.075) deja en 3.08–3.20 una
    # franja de 0.025 en el borde exterior. Muro largo (A = 0.50):
    # 0.50×3.28 + 0.01×0.20 + 0.066875×0.12 = 1.650025.
    # Muro corto (A = 0.30): 0.30×3.28 + 0.01×0.20 + 0.041875×0.12 = 0.991025.
    esperados = [1.650025, 0.991025, 1.650025, 0.991025]
    huellas: dict[str, float] = {}
    for muro, esperado in zip(muros, esperados):
        huellas[muro] = _huella_area(nucleo, muro)
        _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
        assert (z0, z1) == pytest.approx((0.00, 3.60), abs=1e-9)
        assert _volumen_malla(nucleo, muro) == pytest.approx(esperado, abs=1e-6)

    # Reporte de cantidades: la base y la cima también salen de la regla nueva.
    cantidades = nucleo.cantidades_estructura()["elementos"]
    for muro in muros:
        info = next(e for e in cantidades if e["globalid"] == muro)
        assert info["detalle"]["base_m"] == pytest.approx(0.00, abs=1e-9)
        assert info["detalle"]["cima_m"] == pytest.approx(3.60, abs=1e-9)

    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "o058.ifc"
        nucleo.guardar(str(ruta))
        otro = ModeloNucleo()
        otro.abrir(str(ruta))
        for muro, esperado in zip(muros, esperados):
            _x0, _x1, _y0, _y1, z0, z1 = _caja(otro, muro)
            assert (z0, z1) == pytest.approx((0.00, 3.60), abs=1e-9)
            assert _volumen_malla(otro, muro) == pytest.approx(esperado, abs=1e-6)
            assert _huella_area(otro, muro) == pytest.approx(
                huellas[muro], abs=1e-6
            )


def test_ningun_horizontal_intermedio_cambia_base_ni_corona() -> None:
    """Invariante: losa, cerramiento y contratrabe intermedios solo restan cuerpo."""
    casos = [
        ("losa", 1.60, 0.20),
        ("cerramiento", 2.20, 0.20),
        ("contratrabe", 1.50, 0.40),
    ]
    for nombre, z0, espesor in casos:
        nucleo = ModeloNucleo()
        nucleo.nuevo(f"O058 invariante {nombre}")
        n0 = nucleo.niveles()[0]["globalid"]
        n5 = nucleo.nivel_crear("Nivel 5", 3.60)["creados"][0]
        muro = nucleo.muro_crear(MURO, n0, 0, 0, 4, 0, altura=2.60)["creados"][0]
        nucleo.restricciones_editar(muro, nivel_tope=n5)
        if nombre == "losa":
            nucleo.losa_crear(
                n0, [(-1, -1), (5, -1), (5, 1), (-1, 1)],
                espesor=espesor, desfase=z0 + espesor,
            )
        elif nombre == "cerramiento":
            n2 = nucleo.nivel_crear("Nivel 2", 2.40)["creados"][0]
            nucleo.cerramiento_crear(
                CERRAMIENTO, 0, 0, 4, 0, nivel=n2, desfase=0
            )
        else:
            # En vigas el tope es el desfase: 1.50 + 0.40 = 1.90 → 1.50–1.90.
            nucleo.viga_crear(
                CONTRATRABE, n0, 0, 0, 4, 0, desfase=z0 + espesor
            )
        nucleo._regenerar_muro(_entidad(nucleo, muro))

        entidad = _entidad(nucleo, muro)
        base, cima = nucleo._limites_verticales_muro_nivel(entidad, _datos(nucleo, muro))
        assert (base, cima) == pytest.approx((0.00, 3.60), abs=1e-9), nombre
        _x0, _x1, _y0, _y1, z0_malla, z1_malla = _caja(nucleo, muro)
        assert (z0_malla, z1_malla) == pytest.approx((0.00, 3.60), abs=1e-9), nombre
        assert _volumen_malla(nucleo, muro) == pytest.approx(
            _huella_area(nucleo, muro) * (3.60 - espesor), abs=1e-6
        ), nombre
