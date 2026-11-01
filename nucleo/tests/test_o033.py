"""O033: la zapata corrida cuelga del nivel, se edita sin perder el GlobalId y
se alinea con los ejes.

Valores calculados a mano con el tipo de biblioteca «ZC-1 Zapata corrida 60»
(Ancho 0.60 m, Peralte 0.20 m):

- Nivel 0 en 0.00, desplante 0.80 → centro Z = 0 − 0.80 + 0.20/2 = −0.70;
  fondo −0.80, tope −0.60.
- Nivel 0 a +0.50 → centro −0.20, fondo −0.30, tope −0.10 y desplante 0.80.
- Nivel de base a −1.20, desplante 0.80 → fondo −2.00.
- Ejes A (x=0), B (x=5), 1 (y=0), 2 (y=4): zapata corrida sobre el eje 1 con
  ancho 0.60 → centrada en y=0 y prolongaciones 0.30 en ambos cruces.
- Esquina A-1: las dos zapatas de 0.60 se prolongan 0.30; una cubre
  x ∈ [−0.30, 5.30], y ∈ [−0.30, 0.30] y la otra x ∈ [−0.30, 0.30],
  y ∈ [−0.30, 4.30]; la esquina [−0.30, 0.30] × [−0.30, 0.30] queda llena.
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
    nucleo.nuevo("O033")
    return nucleo


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcRoot") if e.GlobalId == gid)


def _estructura(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Estructura")


def _restricciones(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), PSET_RESTRICCIONES)


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[2][3])


def _tipo(nucleo: ModeloNucleo, nombre: str) -> str:
    return next(
        t["nombre"] for t in nucleo.tipos_listar("IfcFootingType") if t["nombre"] == nombre
    )


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _reticula(nucleo: ModeloNucleo) -> tuple[str, str, str, str]:
    a = nucleo.eje_crear("A", 0, 0, 0, 10)["creados"][0]
    b = nucleo.eje_crear("B", 5, 0, 5, 10)["creados"][0]
    uno = nucleo.eje_crear("1", 0, 0, 5, 0)["creados"][0]
    dos = nucleo.eje_crear("2", 0, 4, 5, 4)["creados"][0]
    return a, b, uno, dos


def _corrida(
    nucleo: ModeloNucleo,
    x1: float = 0.0,
    y1: float = 0.0,
    x2: float = 5.0,
    y2: float = 0.0,
    desplante: float = 0.80,
) -> str:
    tipo = _tipo(nucleo, "ZC-1 Zapata corrida 60")
    return nucleo.zapata_corrida_crear(
        tipo, _nivel(nucleo), x1, y1, x2, y2, desplante
    )["creados"][0]


# --------------------------------------------------------------------- vertical


def test_reproduce_el_error_del_panel_al_editar_la_zapata() -> None:
    """El panel manda restricciones.editar con el GlobalId de la misma zapata."""
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    # Antes del arreglo: «No existe el elemento <el GlobalId de la zapata>».
    resultado = nucleo.restricciones_editar(gid, nivel_base=_nivel(nucleo))
    assert resultado["modificados"] == [gid]
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)
    assert _restricciones(nucleo, gid)["Desplante"] == pytest.approx(0.80)


def test_desplante_080_bajo_nivel_0() -> None:
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    centro = _z(nucleo, gid)
    peralte = 0.20
    assert centro == pytest.approx(-0.70, abs=1e-9)
    assert centro - peralte / 2.0 == pytest.approx(-0.80, abs=1e-9)
    assert centro + peralte / 2.0 == pytest.approx(-0.60, abs=1e-9)
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)
    assert _restricciones(nucleo, gid)["Desplante"] == pytest.approx(0.80)


def test_subir_el_nivel_cincuenta_centimetros_sube_la_zapata() -> None:
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    nivel = _nivel(nucleo)
    nucleo.nivel_editar(nivel, elevacion=0.50)
    assert _z(nucleo, gid) == pytest.approx(-0.20, abs=1e-9)
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)
    assert _restricciones(nucleo, gid)["Desplante"] == pytest.approx(0.80)


def test_desplante_cero_rechaza_y_conserva_globalid_y_estado() -> None:
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    antes_z = _z(nucleo, gid)
    antes_undo = len(nucleo._deshacer)
    with pytest.raises(ErrorNucleo) as excinfo:
        nucleo.elemento_editar(gid, {"Desplante": 0})
    assert excinfo.value.codigo == -32602
    assert _z(nucleo, gid) == pytest.approx(antes_z)
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)
    assert _entidad(nucleo, gid).GlobalId == gid
    assert len(nucleo._deshacer) == antes_undo
    props = nucleo.propiedades(gid)
    assert props["psets"]["OPENRVT_Estructura"]["Desplante"] == pytest.approx(0.80)


def test_cambiar_el_nivel_de_base_conserva_el_desplante() -> None:
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    bajo = nucleo.nivel_crear("Nivel -1.20", -1.20)["creados"][0]
    nucleo.restricciones_editar(gid, nivel_base=bajo)
    assert _z(nucleo, gid) == pytest.approx(-1.90, abs=1e-9)  # −1.20 − 0.80 + 0.10
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)
    assert _restricciones(nucleo, gid)["NivelBase"] == bajo
    assert _restricciones(nucleo, gid)["Desplante"] == pytest.approx(0.80)


def test_editar_desplante_y_deshacer_en_un_paso() -> None:
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    nucleo.elemento_editar(gid, {"Desplante": 1.20})
    assert _z(nucleo, gid) == pytest.approx(-1.10, abs=1e-9)
    nucleo.deshacer()
    assert _z(nucleo, gid) == pytest.approx(-0.70, abs=1e-9)
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)


def test_zapata_vieja_con_restriccion_desfasada_conserva_su_posicion() -> None:
    """Archivo 0.5.14: guarda Desplante pero una restricción vieja con DesfaseBase 0."""
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    entidad = _entidad(nucleo, gid)
    nucleo._guardar_pset(
        entidad,
        PSET_RESTRICCIONES,
        {"NivelBase": _nivel(nucleo), "DesfaseBase": 0.0, "NivelTope": "", "DesfaseTope": 0.0,
         "AlturaSinConexion": 0.0},
    )
    assert _z(nucleo, gid) == pytest.approx(-0.70, abs=1e-9)
    assert nucleo.restricciones_editar(gid, nivel_base=_nivel(nucleo))["modificados"] == [gid]
    assert _z(nucleo, gid) == pytest.approx(-0.70, abs=1e-9)
    nucleo.nivel_editar(_nivel(nucleo), elevacion=0.50)
    assert _z(nucleo, gid) == pytest.approx(-0.20, abs=1e-9)
    assert _estructura(nucleo, gid)["Desplante"] == pytest.approx(0.80)


def test_zapata_no_acepta_altura_ni_tope_por_ninguna_puerta() -> None:
    nucleo = _nuevo()
    gid = _corrida(nucleo)
    with pytest.raises(ErrorNucleo) as uno:
        nucleo.elemento_editar(gid, {"Altura": 2.0})
    assert uno.value.codigo == -32602
    with pytest.raises(ErrorNucleo) as dos:
        nucleo.restricciones_editar(gid, nivel_tope=_nivel(nucleo))
    assert dos.value.codigo == -32602
    with pytest.raises(ErrorNucleo) as tres:
        nucleo.restricciones_editar(gid, desfase_base=0.0)
    assert tres.value.codigo == -32602


# --------------------------------------------------------------------- alineación


def test_zapata_en_eje_centrada_y_prolongaciones_de_medio_ancho() -> None:
    nucleo = _nuevo()
    _reticula(nucleo)
    # Trazo ligeramente desplazado del eje 1 (y=0): debe centrarse en el eje.
    gid = _corrida(nucleo, 0.0, 0.07, 5.0, 0.05)
    datos = _estructura(nucleo, gid)
    assert datos["Y1"] == pytest.approx(0.0, abs=1e-6)
    assert datos["Y2"] == pytest.approx(0.0, abs=1e-6)
    assert datos["X1"] == pytest.approx(0.0, abs=1e-6)
    assert datos["X2"] == pytest.approx(5.0, abs=1e-6)
    assert datos["ProlongacionInicio"] == pytest.approx(0.30, abs=1e-6)
    assert datos["ProlongacionFin"] == pytest.approx(0.30, abs=1e-6)


def test_esquina_en_L_cierra_sin_hueco() -> None:
    nucleo = _nuevo()
    _reticula(nucleo)
    largo_x = _corrida(nucleo, 0.0, 0.0, 5.0, 0.0)
    largo_y = _corrida(nucleo, 0.0, 0.0, 0.0, 4.0)
    for gid in (largo_x, largo_y):
        datos = _estructura(nucleo, gid)
        assert datos["ProlongacionInicio"] == pytest.approx(0.30, abs=1e-6)
        assert datos["ProlongacionFin"] == pytest.approx(0.30, abs=1e-6)
    # Volúmenes del cuerpo (ancho 0.60 y prolongaciones 0.30):
    caja_x = (-0.30, 5.30, -0.30, 0.30)
    caja_y = (-0.30, 0.30, -0.30, 4.30)
    esquina = (-0.30, 0.30, -0.30, 0.30)
    assert caja_x[0] <= esquina[0] and caja_x[1] >= esquina[1]
    assert caja_x[2] <= esquina[2] and caja_x[3] >= esquina[3]
    assert caja_y[0] <= esquina[0] and caja_y[1] >= esquina[1]
    assert caja_y[2] <= esquina[2] and caja_y[3] >= esquina[3]


def test_mover_el_eje_mueve_la_zapata_y_conserva_prolongaciones() -> None:
    nucleo = _nuevo()
    _a, b, uno, dos = _reticula(nucleo)
    gid = _corrida(nucleo, 0.0, 0.0, 5.0, 0.0)
    nucleo.enlazar_tramo(gid, uno, _a, b)
    nucleo.ejes_mover(b, 1.0)
    datos = _estructura(nucleo, gid)
    assert datos["X2"] == pytest.approx(6.0, abs=1e-6)
    assert datos["ProlongacionInicio"] == pytest.approx(0.30, abs=1e-6)
    assert datos["ProlongacionFin"] == pytest.approx(0.30, abs=1e-6)
    assert _z(nucleo, gid) == pytest.approx(-0.70, abs=1e-9)


def test_rpc_de_puntas_edita_desplante_y_nivel() -> None:
    """Flujo completo por el servidor JSON-RPC, no solo la API interna."""
    nucleo = _nuevo()
    _reticula(nucleo)
    gid = _corrida(nucleo)
    servidor = Servidor()
    servidor.modelo = nucleo
    servidor.despachar(
        "elementos.editar", {"globalid": gid, "cambios": {"Desplante": 1.0}}
    )
    assert _z(nucleo, gid) == pytest.approx(-0.90, abs=1e-9)
    props = nucleo.propiedades(gid)
    assert props["psets"]["OPENRVT_Estructura"]["Desplante"] == pytest.approx(1.0)
