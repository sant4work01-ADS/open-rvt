"""O036: auto-enlace de lineales en cruces (la parte de giro se retiró en O036b).

Valores calculados a mano (spec O036), con ejes 1 (x=0), 2 (x=4), A (y=0)
y B (y=3):

- muro de (0,0) a (4,0): cruces 1-A y 2-A comparten el eje A; guía A,
  inicio 1, fin 2. Al mover el eje 2 de x=4 a x=5 el muro mide 5.00 m.
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.util.placement as placement
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES  # noqa: E402
from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O036")
    return nucleo


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _pset(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), PSET_RESTRICCIONES)


def _plano(nucleo: ModeloNucleo, gid: str) -> tuple[float, float]:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[0][3]), float(matriz[1][3])


def _tipo(nucleo: ModeloNucleo, clase: str, nombre: str) -> str:
    return next(t["nombre"] for t in nucleo.tipos_listar(clase) if t["nombre"] == nombre)


def _reticula(nucleo: ModeloNucleo) -> dict[str, str]:
    ejes = {}
    for etiqueta, x1, y1, x2, y2 in (
        ("1", 0, -2, 0, 5),
        ("2", 4, -2, 4, 5),
        ("A", -2, 0, 6, 0),
        ("B", -2, 3, 6, 3),
    ):
        ejes[etiqueta] = nucleo.eje_crear(etiqueta, x1, y1, x2, y2)["creados"][0]
    return ejes


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def test_muro_de_dos_clics_sobre_cruces_queda_enlazado_y_sigue_al_eje() -> None:
    nucleo = _nuevo()
    ejes = _reticula(nucleo)
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 0)["creados"][0]
    datos = _pset(nucleo, muro)
    assert datos["EnlaceTipo"] == "tramo"
    assert datos["EnlaceEjeGuia"] == ejes["A"]
    assert datos["EnlaceEjeInicio"] == ejes["1"]
    assert datos["EnlaceEjeFin"] == ejes["2"]
    assert datos["EnlaceDesfase"] == pytest.approx(0.0)
    assert datos["EnlaceDesfaseInicio"] == pytest.approx(0.0)
    assert datos["EnlaceDesfaseFin"] == pytest.approx(0.0)
    assert nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"] == pytest.approx(4.0)

    # El eje 2 pasa de x=4 a x=5: el muro enlazado mide 5.00 m.
    nucleo.ejes_mover(ejes["2"], 1.0)
    assert nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"] == pytest.approx(5.0)
    assert _plano(nucleo, muro) == pytest.approx((0.0, 0.0))


def test_muro_con_un_extremo_fuera_de_cruce_no_se_enlaza() -> None:
    nucleo = _nuevo()
    _reticula(nucleo)
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 2, 0)["creados"][0]
    assert _pset(nucleo, muro).get("EnlaceTipo") is None


def test_muro_entre_dos_cruces_sin_eje_comun_no_se_enlaza() -> None:
    nucleo = _nuevo()
    _reticula(nucleo)
    # (0,0) es el cruce 1-A y (4,3) el 2-B: no comparten ningún eje.
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 3)["creados"][0]
    assert _pset(nucleo, muro).get("EnlaceTipo") is None


def test_contratrabe_y_trabe_de_dos_clics_sobre_cruces_se_enlazan() -> None:
    nucleo = _nuevo()
    ejes = _reticula(nucleo)
    nivel = _nivel(nucleo)
    contratrabe = nucleo.viga_crear(
        _tipo(nucleo, "IfcFootingType", "CT-1 Contratrabe 20×40"),
        nivel,
        0,
        0,
        4,
        0,
        desfase=-0.10,
    )["creados"][0]
    trabe = nucleo.viga_crear(
        _tipo(nucleo, "IfcBeamType", "T-1 Trabe 20×40"),
        nivel,
        0,
        0,
        4,
        0,
    )["creados"][0]
    for gid in (contratrabe, trabe):
        datos = _pset(nucleo, gid)
        assert datos["EnlaceEjeGuia"] == ejes["A"]
        assert datos["EnlaceEjeInicio"] == ejes["1"]
        assert datos["EnlaceEjeFin"] == ejes["2"]


def test_copiar_un_muro_enlazado_conserva_el_enlace() -> None:
    nucleo = _nuevo()
    ejes = _reticula(nucleo)
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 0)["creados"][0]
    copia = nucleo.elementos_copiar([muro], 0.0, 5.0, 0.0)["creados"][0]
    datos = _pset(nucleo, copia)
    assert datos["EnlaceTipo"] == "tramo"
    assert datos["EnlaceEjeGuia"] == ejes["A"]
    assert datos["EnlaceEjeInicio"] == ejes["1"]
    assert datos["EnlaceEjeFin"] == ejes["2"]


def test_rpc_crea_muro_enlazado() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O036"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    ejes = {}
    for etiqueta, x1, y1, x2, y2 in (
        ("1", 0, -2, 0, 5),
        ("2", 4, -2, 4, 5),
        ("A", -2, 0, 6, 0),
        ("B", -2, 3, 6, 3),
    ):
        ejes[etiqueta] = servidor.despachar(
            "ejes.crear", {"etiqueta": etiqueta, "x1": x1, "y1": y1, "x2": x2, "y2": y2}
        )["creados"][0]
    muro = servidor.despachar(
        "muros.crear",
        {"tipo": "Block 15", "nivel": nivel, "x1": 0, "y1": 0, "x2": 4, "y2": 0},
    )["creados"][0]
    nucleo = servidor._exigir()
    assert _pset(nucleo, muro)["EnlaceEjeGuia"] == ejes["A"]
    assert _pset(nucleo, muro)["EnlaceEjeInicio"] == ejes["1"]
    assert _pset(nucleo, muro)["EnlaceEjeFin"] == ejes["2"]
