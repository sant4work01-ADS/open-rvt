"""O026: herramienta Alinear.

Los valores esperados se calculan a mano:
- muro Block 15 (0.15 m) con su cara positiva sobre el eje x=3 → centro 3 + 0.15/2 = 3.075;
- columna de 0.30 m con su cara positiva sobre el eje x=0 → centro 0 + 0.30/2 = 0.15;
- al mover el eje x=3 un metro con candado, el muro pasa de 3.075 a 4.075;
- sin candado el muro se queda en 3.075.
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.util.placement as placement
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES  # noqa: E402
from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O026")
    return nucleo


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _plano(nucleo: ModeloNucleo, gid: str) -> tuple[float, float]:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[0][3]), float(matriz[1][3])


def _pset(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), PSET_RESTRICCIONES)


def _eje_vertical(nucleo: ModeloNucleo, x: float) -> str:
    return nucleo.eje_crear("", x, 0, x, 10)["creados"][0]


def test_muro_por_su_cara_a_un_eje() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = _eje_vertical(nucleo, 3.0)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 0, 5)["creados"][0]
    resultado = nucleo.alinear(
        {"tipo": "eje", "globalid": eje}, muro, "cara1", False
    )
    assert _plano(nucleo, muro)[0] == pytest.approx(3.075)
    assert resultado["desplazamiento"] == pytest.approx(3.075)
    datos = _pset(nucleo, muro)
    assert datos["AlinearReferencia"] == eje
    assert datos["AlinearBloqueada"] is False


def test_columna_de_030_por_su_cara() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = _eje_vertical(nucleo, 0.0)
    tipo = next(
        t["nombre"]
        for t in nucleo.tipos_listar("IfcColumnType")
        if "30" in t["nombre"]
    )
    columna = nucleo.columna_crear(tipo, nivel, -2.0, 2.0)["creados"][0]
    nucleo.alinear({"tipo": "eje", "globalid": eje}, columna, "cara1", False)
    assert _plano(nucleo, columna)[0] == pytest.approx(0.15)


def test_candado_cerrado_sigue_al_eje_y_abierto_no() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = _eje_vertical(nucleo, 3.0)
    con_candado = nucleo.muro_crear("Block 15", nivel, 0, 0, 0, 5)["creados"][0]
    sin_candado = nucleo.muro_crear("Block 15", nivel, 0, 8, 0, 13)["creados"][0]
    nucleo.alinear({"tipo": "eje", "globalid": eje}, con_candado, "cara1", True)
    nucleo.alinear({"tipo": "eje", "globalid": eje}, sin_candado, "cara1", False)
    assert _plano(nucleo, con_candado)[0] == pytest.approx(3.075)
    assert _plano(nucleo, sin_candado)[0] == pytest.approx(3.075)
    nucleo.ejes_mover(eje, 1.0)
    assert _plano(nucleo, con_candado)[0] == pytest.approx(4.075)
    assert _plano(nucleo, sin_candado)[0] == pytest.approx(3.075)


def test_sin_paralelismo_avisa_y_no_mueve_nada() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = _eje_vertical(nucleo, 3.0)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 5, 0)["creados"][0]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.alinear({"tipo": "eje", "globalid": eje}, muro, "cara1", True)
    assert exc.value.codigo == -32027
    assert "paralela" in exc.value.mensaje.lower()
    assert _plano(nucleo, muro) == pytest.approx((0.0, 0.0))


def test_deshacer_revierte_la_alineacion_en_un_paso() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = _eje_vertical(nucleo, 3.0)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 0, 5)["creados"][0]
    nucleo.alinear({"tipo": "eje", "globalid": eje}, muro, "cara1", True)
    assert _plano(nucleo, muro)[0] == pytest.approx(3.075)
    assert nucleo.deshacer()["hecho"] is True
    assert _plano(nucleo, muro)[0] == pytest.approx(0.0)


def test_referencia_de_nivel_liga_base_y_tope() -> None:
    nucleo = _nuevo()
    n0 = _nivel(nucleo)
    n1 = nucleo.nivel_crear("Nivel 1", 3.0)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 0, 5)["creados"][0]
    nucleo.alinear({"tipo": "nivel", "globalid": n1}, muro, "tope", True)
    datos = _pset(nucleo, muro)
    assert datos["NivelTope"] == n1
    assert datos["AlinearReferencia"] == n1
    nucleo.nivel_editar(n1, elevacion=4.0)
    assert nucleo.propiedades(muro)["psets"]["OPENRVT_Muro"]["Altura"] == pytest.approx(
        4.0
    )


def test_servidor_alinea_y_propaga_por_rpc() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O026"})
    n0 = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    eje = servidor.despachar(
        "ejes.crear", {"etiqueta": "", "x1": 3, "y1": 0, "x2": 3, "y2": 10}
    )["creados"][0]
    muro = servidor.despachar(
        "muros.crear",
        {"tipo": "Block 15", "nivel": n0, "x1": 0, "y1": 0, "x2": 0, "y2": 5},
    )["creados"][0]
    servidor.despachar(
        "restricciones.alinear",
        {
            "referencia": {"tipo": "eje", "globalid": eje},
            "elemento": muro,
            "cara": "cara1",
            "bloquear": True,
        },
    )
    servidor.despachar("ejes.mover", {"globalid": eje, "desplazamiento": 1.0})
    entidad = next(
        e for e in servidor._exigir().modelo.by_type("IfcWall") if e.GlobalId == muro
    )
    matriz = placement.get_local_placement(entidad.ObjectPlacement)
    assert float(matriz[0][3]) == pytest.approx(4.075)
