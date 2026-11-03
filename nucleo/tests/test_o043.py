"""O043: un cerramiento por muro y nivel, y el nivel de la planta manda.

Muro de Nivel 0 a Nivel 3.60; el cerramiento creado desde la planta de 2.20 queda
en N 2.20 con desfase 0, con su centro en 2.20 − 0.20/2 = 2.10, y el muro termina
en la cara inferior (2.20 − 0.20 = 2.00). Un segundo cerramiento en el mismo nivel
del mismo muro se rechaza sin tocar el modelo.
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.util.placement as placement
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

TIPO = "CE-1 Cerramiento 15×20"


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[2][3])


def _altura_muro(nucleo: ModeloNucleo, gid: str) -> float:
    return float(nucleo._datos_muro(_entidad(nucleo, gid))["altura"])


def _escenario() -> tuple[ModeloNucleo, str, str, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O043")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    n360 = nucleo.nivel_crear("N 3.60", 3.60)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 8, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n360, desfase_tope=0)
    return nucleo, n220, n360, muro, n0


def test_cerramiento_en_la_planta_baja_el_muro_a_su_cara_inferior() -> None:
    nucleo, n220, _n360, muro, _n0 = _escenario()
    cerramiento = nucleo.cerramiento_crear_en_muro(
        TIPO, muro, nivel=n220, desfase=0, desde_planta=True
    )["creados"][0]
    restriccion = nucleo._restricciones_de(_entidad(nucleo, cerramiento))
    assert restriccion["NivelBase"] == n220
    assert restriccion["DesfaseBase"] == pytest.approx(0.0, abs=1e-9)
    assert _z(nucleo, cerramiento) == pytest.approx(2.10, abs=1e-9)
    assert _altura_muro(nucleo, muro) == pytest.approx(2.00, abs=1e-9)


def test_segundo_cerramiento_en_el_mismo_nivel_se_rechaza_sin_tocar_el_modelo() -> None:
    nucleo, n220, _n360, muro, _n0 = _escenario()
    primero = nucleo.cerramiento_crear_en_muro(
        TIPO, muro, nivel=n220, desfase=0
    )["creados"][0]
    vigas_antes = {e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")}
    altura_antes = _altura_muro(nucleo, muro)
    instantaneas_antes = len(nucleo._deshacer)

    with pytest.raises(Exception, match="ya tiene cerramiento en N 2.20"):
        nucleo.cerramiento_crear_en_muro(TIPO, muro, nivel=n220, desfase=0)

    assert {e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")} == vigas_antes
    assert primero in vigas_antes
    assert _altura_muro(nucleo, muro) == pytest.approx(altura_antes, abs=1e-12)
    assert len(nucleo._deshacer) == instantaneas_antes


def test_el_mismo_muro_admite_cerramiento_en_otro_nivel() -> None:
    nucleo, n220, n360, muro, _n0 = _escenario()
    nucleo.cerramiento_crear_en_muro(TIPO, muro, nivel=n220, desfase=0)
    segundo = nucleo.cerramiento_crear_en_muro(
        TIPO, muro, nivel=n360, desfase=0
    )["creados"][0]
    assert nucleo._restricciones_de(_entidad(nucleo, segundo))["NivelBase"] == n360
    assert _altura_muro(nucleo, muro) == pytest.approx(3.60, abs=1e-9)
