"""O036: auto-enlace de lineales en cruces y giro de ejes.

Valores calculados a mano (spec O036), con ejes 1 (x=0), 2 (x=4), A (y=0)
y B (y=3):

- muro de (0,0) a (4,0): cruces 1-A y 2-A comparten el eje A; guía A,
  inicio 1, fin 2. Al mover el eje 2 de x=4 a x=5 el muro mide 5.00 m.
- giro de 10° del eje 2 alrededor de (4, 1.5):
  - el eje gira a la izquierda (antihorario); su dirección pasa de (0,1) a
    (-sen 10°, cos 10°).
  - cruce 2-A: la recta corta y=0 a x = 4 + 1.5·tan 10° = 4.2644904711.
  - cruce 2-B: corta y=3 a x = 4 − 1.5·tan 10° = 3.7355095289.
  - el muro enlazado termina en (4.2644904711, 0): mide 4.2644904711 m.
  - la columna en 2-B pasa de (4, 3) a (3.7355095289, 3).
- girar el eje A 90° alrededor de (0,0) lo deja paralelo a los ejes 1 y 2:
  se rechaza sin tocar el modelo ni el historial.
"""

from __future__ import annotations

import math
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


def _extremos_eje(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    _grid, eje = nucleo._eje_por_gid(gid)
    return nucleo._direccion_eje(eje)[:4]


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


def test_giro_que_deja_un_eje_paralelo_se_rechaza_sin_cambios() -> None:
    nucleo = _nuevo()
    ejes = _reticula(nucleo)
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 0)["creados"][0]
    antes = _extremos_eje(nucleo, ejes["A"])
    largo_antes = nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"]
    historial_antes = len(nucleo._deshacer)
    with pytest.raises(Exception, match="paralelo"):
        nucleo.ejes_girar(ejes["A"], math.radians(90.0), [0.0, 0.0])
    assert _extremos_eje(nucleo, ejes["A"]) == pytest.approx(antes)
    assert (
        nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"]
        == pytest.approx(largo_antes)
    )
    assert len(nucleo._deshacer) == historial_antes


def test_giro_valido_mueve_cruces_muro_y_columna_y_deshace_en_un_paso() -> None:
    nucleo = _nuevo()
    ejes = _reticula(nucleo)
    nivel = _nivel(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0)["creados"][0]
    columna = nucleo.columna_crear(
        _tipo(nucleo, "IfcColumnType", "C-1 Columna 30×30"),
        nivel,
        4,
        3,
        eje_a=ejes["2"],
        eje_b=ejes["B"],
    )["creados"][0]

    # 4 ± 1.5·tan 10°.
    cruce_2a = 4.0 + 1.5 * math.tan(math.radians(10.0))
    cruce_2b = 4.0 - 1.5 * math.tan(math.radians(10.0))
    nucleo.ejes_girar(ejes["2"], math.radians(10.0), [4.0, 1.5])

    # Cruces calculados a mano: 2-A = (4 + 1.5·tan 10°, 0) y 2-B = (4 − 1.5·tan 10°, 3).
    assert nucleo._cruce_de_ejes(ejes["2"], ejes["A"]) == pytest.approx(
        (cruce_2a, 0.0), abs=1e-9
    )
    assert nucleo._cruce_de_ejes(ejes["2"], ejes["B"]) == pytest.approx(
        (cruce_2b, 3.0), abs=1e-9
    )
    assert _plano(nucleo, columna) == pytest.approx((cruce_2b, 3.0), abs=1e-9)
    assert nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"] == pytest.approx(
        cruce_2a, abs=1e-9
    )
    assert _pset(nucleo, muro)["EnlaceEjeGuia"] == ejes["A"]
    assert _pset(nucleo, columna)["EnlaceEjeA"] == ejes["2"]

    # Un solo paso de Deshacer devuelve eje, muro y columna exactos (±1e-9).
    assert nucleo.deshacer()["hecho"] is True
    assert _extremos_eje(nucleo, ejes["2"]) == pytest.approx((4, -2, 4, 5), abs=1e-9)
    assert nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"] == pytest.approx(
        4.0, abs=1e-9
    )
    assert _plano(nucleo, columna) == pytest.approx((4.0, 3.0), abs=1e-9)
    assert _pset(nucleo, muro)["EnlaceEjeFin"] == ejes["2"]
    assert _pset(nucleo, columna)["EnlaceEjeB"] == ejes["B"]


def test_rpc_crea_muro_enlazado_y_lo_gira() -> None:
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

    servidor.despachar(
        "ejes.girar",
        {"globalid": ejes["2"], "angulo": math.radians(10.0), "centro": [4.0, 1.5]},
    )
    assert nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Longitud"] == pytest.approx(
        4.0 + 1.5 * math.tan(math.radians(10.0)), abs=1e-9
    )
