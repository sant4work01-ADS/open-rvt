"""O050: losas del dueño, cerramientos que suben/bajan y castillos al cerramiento.

Los valores salen de la geometría a mano:
rectángulo 2.50 × 1.50 = 3.75 m²; con desfase 0.075 en los cuatro bordes
exteriores mide 2.65 × 1.65 = 4.3725 m². El cerramiento 15 × 20 tiene 20 cm de
peralte: su cara superior es la elevación del nivel y su cara inferior queda
0.20 m abajo.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

TIPO = "CE-1 Cerramiento 15×20"
CASTILLO = "K-1 Castillo 15×15"
RECTANGULO = [(0.0, 0.0), (2.5, 0.0), (2.5, 1.5), (0.0, 1.5)]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Estructura")


def _altura_castillo(nucleo: ModeloNucleo, gid: str) -> float:
    return float(_datos(nucleo, gid)["Altura"])


def _escenario() -> tuple[ModeloNucleo, str, str, str, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O050")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    n240 = nucleo.nivel_crear("N 2.40", 2.40)["creados"][0]
    n300 = nucleo.nivel_crear("N 3.00", 3.00)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 2.5, 0, altura=2.60)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n0, desfase_tope=2.60)
    return nucleo, n0, n220, n240, n300, muro


def test_losa_con_punto_de_cierre_repetido_queda_en_cuatro_lados() -> None:
    """El dueño cerró sobre el primer vértice y la losa quedó de 5 lados."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O050 losa")
    nivel = nucleo.niveles()[0]["globalid"]
    puntos = [[0, 1.5], [2.5, 1.5], [2.5, 0], [0, 0], [0, 1.5]]

    creada = nucleo.losa_crear(nivel, puntos)["creados"][0]
    datos = nucleo._leer_pset(_entidad(nucleo, creada), "OPENRVT_Losa")

    assert int(datos["Puntos"]) == 4
    assert len(nucleo._bordes_de_losa(_entidad(nucleo, creada))) == 4
    # 2.50 × 1.50 = 3.75 m².
    assert float(datos["Area"]) == pytest.approx(3.75, abs=1e-9)


def test_losa_con_desfase_exterior_crece_a_2_65_por_1_65() -> None:
    """Cada borde libre se separa 0.075 m hacia afuera: 2.65 × 1.65."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O050 desfase")
    nivel = nucleo.niveles()[0]["globalid"]
    creada = nucleo.losa_crear(nivel, RECTANGULO)["creados"][0]
    nucleo.elemento_editar(creada, {"desfase_bordes": 0.075})

    datos = nucleo._leer_pset(_entidad(nucleo, creada), "OPENRVT_Losa")
    assert float(datos["Area"]) == pytest.approx(4.3725, abs=1e-9)


def test_losa_vieja_de_cinco_puntos_se_repara_al_abrir_y_edita() -> None:
    """Un archivo con 5 bordes (el último degenerado) abre con 4 y acepta cambio_borde."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O050 vieja")
    nivel = nucleo.niveles()[0]["globalid"]
    creada = nucleo.losa_crear(nivel, RECTANGULO)["creados"][0]
    entidad = _entidad(nucleo, creada)
    crudo = [(0, 1.5), (2.5, 1.5), (2.5, 0), (0, 0), (0, 1.5)]
    datos = dict(nucleo._leer_pset(entidad, "OPENRVT_Losa"))
    datos["Puntos"] = 5
    datos["Bordes"] = json.dumps(nucleo._normalizar_bordes_losa(None, crudo))
    nucleo._guardar_pset(entidad, "OPENRVT_Losa", datos)
    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "losa-cinco.ifc"
        nucleo.guardar(str(ruta))
        otro = ModeloNucleo()
        otro.abrir(str(ruta))
        reparada = _entidad(otro, creada)
        assert len(otro._bordes_de_losa(reparada)) == 4
        assert len(otro._poligono_de_losa(reparada)) == 4

        otro.elemento_editar(creada, {"cambio_borde": {"indice": 0, "desfase": 0.075}})
        area = float(otro._leer_pset(_entidad(otro, creada), "OPENRVT_Losa")["Area"])
        # Sólo el lado de 2.50 se separa 0.075: 3.75 + 2.50 × 0.075 = 3.9375.
        assert area == pytest.approx(3.9375, abs=1e-9)


def test_castillo_sigue_la_cara_inferior_del_cerramiento() -> None:
    """Nivel 2.20 → castillo 0–2.00; 2.40 → 0–2.20; 3.00 → tope del muro 2.60."""
    nucleo, n0, n220, n240, n300, muro = _escenario()
    castillo = nucleo.castillo_crear_en_muro(CASTILLO, muro, 0.075)["creados"][0]
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.60)

    creado = nucleo.cerramiento_crear(
        TIPO, 0.0, 0.0, 2.5, 0.0, nivel=n220, desfase=0
    )["creados"][0]
    assert _datos(nucleo, creado)["Z"] == pytest.approx(2.10)
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.00)

    nucleo.restricciones_editar(creado, nivel_base=n240)
    assert _datos(nucleo, creado)["Z"] == pytest.approx(2.30)
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.20)

    nucleo.restricciones_editar(creado, nivel_base=n300)
    assert _datos(nucleo, creado)["Z"] == pytest.approx(2.90)
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.60)

    nucleo.restricciones_editar(creado, nivel_base=n220)
    assert _datos(nucleo, creado)["Z"] == pytest.approx(2.10)
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.00)


def test_puerta_que_invade_el_cerramiento_se_crea_con_aviso() -> None:
    """Puerta de 2.10 bajo un cerramiento de cara inferior 2.00: avisa, no falla."""
    nucleo, _n0, n220, _n240, _n300, muro = _escenario()
    nucleo.cerramiento_crear(TIPO, 0.0, 0.0, 2.5, 0.0, nivel=n220, desfase=0)

    resultado = nucleo.abertura_crear(
        "IfcDoor", muro, 0.5, ancho=0.9, alto=2.10, antepecho=0.0
    )

    assert len(resultado["creados"]) == 2
    assert "La abertura invade el cerramiento (cara inferior a 2.00 m)" in resultado[
        "mensaje"
    ]


def test_varios_cerramientos_suben_de_nivel_en_un_solo_deshacer() -> None:
    """Cuatro cerramientos a Nivel 2, un deshacer y vuelven todos a Nivel 1."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O050 varios")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    n240 = nucleo.nivel_crear("N 2.40", 2.40)["creados"][0]
    muros = []
    for x1, y1, x2, y2 in (
        (0, 0, 2.5, 0),
        (2.5, 0, 2.5, 1.5),
        (2.5, 1.5, 0, 1.5),
        (0, 1.5, 0, 0),
    ):
        muro = nucleo.muro_crear("Block 15", n0, x1, y1, x2, y2, altura=2.60)[
            "creados"
        ][0]
        nucleo.restricciones_editar(muro, nivel_tope=n0, desfase_tope=2.60)
        muros.append(muro)
    cerramientos = []
    for x1, y1, x2, y2 in (
        (0, 0, 2.5, 0),
        (2.5, 0, 2.5, 1.5),
        (2.5, 1.5, 0, 1.5),
        (0, 1.5, 0, 0),
    ):
        cerramientos.append(
            nucleo.cerramiento_crear(
                TIPO, x1, y1, x2, y2, nivel=n220, desfase=0
            )["creados"][0]
        )
    antes = [float(_datos(nucleo, c)["Z"]) for c in cerramientos]
    instantaneas = len(nucleo._deshacer)

    nucleo.restricciones_editar_varios(cerramientos, nivel_base=n240)

    assert len(nucleo._deshacer) == instantaneas + 1
    for c in cerramientos:
        assert _datos(nucleo, c)["Z"] == pytest.approx(2.30)
        assert nucleo._restricciones_de(_entidad(nucleo, c))["NivelBase"] == n240
    nucleo.deshacer()
    despues = [float(_datos(nucleo, c)["Z"]) for c in cerramientos]
    assert despues == pytest.approx(antes)
    for c in cerramientos:
        assert nucleo._restricciones_de(_entidad(nucleo, c))["NivelBase"] == n220
