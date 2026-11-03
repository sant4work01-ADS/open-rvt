"""ED1: recortar y extender elementos lineales en planta.

Valores calculados a mano (spec ED1):

- M1 (0,0)-(3,0) y M2 (4,1)-(4,5), a esquina con clics (1,0) y (4,3):
  la intersección de sus líneas es (4,0); M1 conserva el lado del clic (1,0)
  y queda (0,0)-(4,0); M2 conserva el lado de (4,3) y queda (4,0)-(4,5).
  Área de M1: 4 m × 2.60 m = 10.40 m².
- Muro (0,0)-(6,0) contra el eje x=4:
  conservando (1,0) queda (0,0)-(4,0); conservando (5,0) queda (4,0)-(6,0).
- Contratrabe (0,0)-(2,0) hasta el muro de eje x=5: queda (0,0)-(5,0).
- Paralelos: M1 (0,0)-(3,0) y M2 (0,1)-(3,1) no se tocan; se rechaza sin cambio.
- Vano: puerta a 5.00 m en un muro de 6.00 m; al recortar a 4.00 m se borra.
- Enlaces: un muro enlazado a los ejes 1 (x=0) y 2 (x=4) pierde el enlace del
  extremo ajustado y conserva el del otro extremo.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES  # noqa: E402
from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("ED1")
    return nucleo


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(
        e
        for e in nucleo.modelo.by_type("IfcProduct")
        if getattr(e, "GlobalId", None) == gid
    )


def _pset(nucleo: ModeloNucleo, gid: str, nombre: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), nombre)


def _linea_muro(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    datos = nucleo._datos_muro(_entidad(nucleo, gid))
    return datos["x1"], datos["y1"], datos["x2"], datos["y2"]


def _linea_estructura(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    datos = _pset(nucleo, gid, "OPENRVT_Estructura")
    return (
        float(datos["X1"]),
        float(datos["Y1"]),
        float(datos["X2"]),
        float(datos["Y2"]),
    )


def _reticula(nucleo: ModeloNucleo) -> dict[str, str]:
    ejes = {}
    for etiqueta, x1, y1, x2, y2 in (
        ("1", 0, -2, 0, 5),
        ("2", 4, -2, 4, 5),
        ("3", 3, -2, 3, 5),
        ("A", -2, 0, 6, 0),
    ):
        ejes[etiqueta] = nucleo.eje_crear(etiqueta, x1, y1, x2, y2)["creados"][0]
    return ejes


def test_esquina_conserva_el_lado_del_clic_y_area() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    m1 = nucleo.muro_crear("Block 15", nivel, 0, 0, 3, 0)["creados"][0]
    m2 = nucleo.muro_crear("Block 15", nivel, 4, 1, 4, 5)["creados"][0]

    resultado = nucleo.elementos_recortar_esquina(m1, m2, [1, 0], [4, 3])

    assert _linea_muro(nucleo, m1) == pytest.approx((0, 0, 4, 0), abs=1e-9)
    assert _linea_muro(nucleo, m2) == pytest.approx((4, 0, 4, 5), abs=1e-9)
    assert _pset(nucleo, m1, "OPENRVT_Muro")["Longitud"] == pytest.approx(4.0, abs=1e-9)
    assert _pset(nucleo, m1, "OPENRVT_Muro")["Altura"] == pytest.approx(2.60, abs=1e-9)
    assert (
        _pset(nucleo, m1, "OPENRVT_Muro")["Longitud"]
        * _pset(nucleo, m1, "OPENRVT_Muro")["Altura"]
    ) == pytest.approx(10.40, abs=1e-9)
    assert set(resultado["modificados"]) == {m1, m2}


def test_recorte_contra_eje_conserva_cada_lado() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = nucleo.eje_crear("A", 4, -2, 4, 8)["creados"][0]
    m1 = nucleo.muro_crear("Block 15", nivel, 0, 0, 6, 0)["creados"][0]
    nucleo.elementos_recortar_extender(m1, eje, [1, 0])
    assert _linea_muro(nucleo, m1) == pytest.approx((0, 0, 4, 0), abs=1e-9)

    m2 = nucleo.muro_crear("Block 15", nivel, 0, 1, 6, 1)["creados"][0]
    nucleo.elementos_recortar_extender(m2, eje, [5, 1])
    assert _linea_muro(nucleo, m2) == pytest.approx((4, 1, 6, 1), abs=1e-9)


def test_extiende_contratrabe_hasta_el_eje_del_muro() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel, 5, -2, 5, 2)["creados"][0]
    contratrabe = nucleo.viga_crear(
        "CT-1 Contratrabe 20×40", nivel, 0, 0, 2, 0
    )["creados"][0]

    nucleo.elementos_recortar_extender(contratrabe, muro, [1, 0])

    assert _linea_estructura(nucleo, contratrabe) == pytest.approx(
        (0, 0, 5, 0), abs=1e-9
    )
    assert _pset(nucleo, contratrabe, "OPENRVT_Estructura")["Longitud"] == pytest.approx(
        5.0, abs=1e-9
    )


def test_paralelos_se_rechazan_sin_tocar_el_modelo() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    m1 = nucleo.muro_crear("Block 15", nivel, 0, 0, 3, 0)["creados"][0]
    m2 = nucleo.muro_crear("Block 15", nivel, 0, 1, 3, 1)["creados"][0]
    antes = (_linea_muro(nucleo, m1), _linea_muro(nucleo, m2))
    historial = len(nucleo._deshacer)

    with pytest.raises(ErrorNucleo) as error:
        nucleo.elementos_recortar_extender(m1, m2, [1, 0])

    assert error.value.mensaje == "Los elementos son paralelos"
    assert (_linea_muro(nucleo, m1), _linea_muro(nucleo, m2)) == antes
    assert len(nucleo._deshacer) == historial


def test_el_vano_que_queda_fuera_se_borra_con_aviso() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = nucleo.eje_crear("A", 4, -2, 4, 8)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 6, 0)["creados"][0]
    creados = nucleo.abertura_crear(
        "IfcDoor", muro, 5.0, 0.9, 2.1, 0.0
    )["creados"]
    puerta = next(
        e for e in nucleo.modelo.by_type("IfcDoor") if e.GlobalId == creados[1]
    )
    puerta.Name = "P-1"

    resultado = nucleo.elementos_recortar_extender(muro, eje, [1, 0])

    assert _linea_muro(nucleo, muro) == pytest.approx((0, 0, 4, 0), abs=1e-9)
    assert len(nucleo.modelo.by_type("IfcDoor")) == 0
    assert len(nucleo.modelo.by_type("IfcOpeningElement")) == 0
    assert puerta.GlobalId in resultado["borrados"]
    assert resultado["mensaje"] == "Se borró la puerta P-1: quedó fuera del muro"


def test_el_extremo_ajustado_pierde_su_enlace_y_el_otro_lo_conserva() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    ejes = _reticula(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0)["creados"][0]
    inicial = _pset(nucleo, muro, PSET_RESTRICCIONES)
    assert inicial["EnlaceTipo"] == "tramo"
    assert inicial["EnlaceEjeInicio"] == ejes["1"]
    assert inicial["EnlaceEjeFin"] == ejes["2"]

    nucleo.elementos_recortar_extender(muro, ejes["3"], [1, 0])

    datos = _pset(nucleo, muro, PSET_RESTRICCIONES)
    assert datos["EnlaceTipo"] == "tramo"
    assert datos["EnlaceEjeGuia"] == ejes["A"]
    assert datos["EnlaceEjeInicio"] == ejes["1"]
    assert "EnlaceEjeFin" not in datos
    assert "EnlaceDesfaseFin" not in datos
    assert _linea_muro(nucleo, muro) == pytest.approx((0, 0, 3, 0), abs=1e-9)


def test_deshacer_devuelve_todo_exacto_en_un_solo_paso() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    m1 = nucleo.muro_crear("Block 15", nivel, 0, 0, 3, 0)["creados"][0]
    m2 = nucleo.muro_crear("Block 15", nivel, 4, 1, 4, 5)["creados"][0]
    antes = (_linea_muro(nucleo, m1), _linea_muro(nucleo, m2))

    nucleo.elementos_recortar_esquina(m1, m2, [1, 0], [4, 3])
    nucleo.deshacer()

    assert _linea_muro(nucleo, m1) == pytest.approx(antes[0], abs=1e-9)
    assert _linea_muro(nucleo, m2) == pytest.approx(antes[1], abs=1e-9)


def test_flujo_servidor_guarda_y_reabre_el_recorte(tmp_path: Path) -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "ED1 flujo"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    eje = servidor.despachar(
        "ejes.crear", {"etiqueta": "A", "x1": 4, "y1": -2, "x2": 4, "y2": 8}
    )["creados"][0]
    muro = servidor.despachar(
        "muros.crear",
        {
            "tipo": "Block 15",
            "nivel": nivel,
            "x1": 0,
            "y1": 0,
            "x2": 6,
            "y2": 0,
        },
    )["creados"][0]

    servidor.despachar(
        "elementos.recortar_extender",
        {"globalid": muro, "referencia": eje, "punto_conservar": [1, 0]},
    )
    ruta = str(tmp_path / "ed1.ifc")
    servidor.despachar("proyecto.guardar", {"ruta": ruta})

    otro = ModeloNucleo()
    otro.abrir(ruta)
    datos = otro._datos_muro(otro._entidad_por_gid(muro))
    assert (datos["x1"], datos["y1"], datos["x2"], datos["y2"]) == pytest.approx(
        (0, 0, 4, 0), abs=1e-9
    )
    partidas = otro.medicion_calcular()["partidas"]
    muro_m2 = next(p for p in partidas if p["unidad"] == "m2")
    assert muro_m2["total"] == pytest.approx(10.40, abs=1e-9)


def test_solo_acepta_elementos_lineales() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0)["creados"][0]
    columna = nucleo.columna_crear(
        "C-1 Columna 30×30", nivel, 0, 0
    )["creados"][0]

    with pytest.raises(ErrorNucleo) as error:
        nucleo.elementos_recortar_extender(columna, muro, [0, 0])
    assert "Solo se recortan o extienden" in error.value.mensaje

    with pytest.raises(ErrorNucleo) as error:
        nucleo.elementos_recortar_extender(muro, columna, [1, 0])
    assert "La referencia debe ser un elemento lineal o un eje" in error.value.mensaje


def test_punto_conservar_invalido_no_cambia_nada() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    eje = nucleo.eje_crear("A", 4, -2, 4, 8)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 6, 0)["creados"][0]
    antes = _linea_muro(nucleo, muro)
    historial = len(nucleo._deshacer)

    with pytest.raises(ErrorNucleo) as error:
        nucleo.elementos_recortar_extender(muro, eje, [])

    assert error.value.mensaje == "Falta el punto del lado que se conserva."
    assert _linea_muro(nucleo, muro) == antes
    assert len(nucleo._deshacer) == historial
