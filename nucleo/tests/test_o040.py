"""O040: los cerramientos fallan (restricción de nivel, dibujo en planta, flujo).

Valores calculados a mano (tipo «CE-1 Cerramiento 15×20»: B 0.15, H 0.20):

- Muro Block 15 de Nivel 0 (0.00) a Nivel 1 (2.60): corona en 2.60. El cerramiento
  ligado queda con tope 2.60 (lecho superior), centro 2.50 y fondo 2.40.
- Subir Nivel 1 a 2.90 sube el tope a 2.90 y baja los castillos a 2.90 − 0.20 = 2.70.
- Soltar del muro y cambiar a Nivel 0 + desfase 2.40 → tope 2.40, centro 2.30.
- L de dos cerramientos de 4 m (en +x) y 3 m (en +y) en la misma esquina:
  unión física = (4.15 × 0.15 + 3.15 × 0.15 − 0.15 × 0.15) × 0.20 = 0.2145 m³.
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
    nucleo.nuevo("O040")
    return nucleo


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _estructura(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Estructura")


def _restricciones(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), PSET_RESTRICCIONES)


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[2][3])


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _tipo(nucleo: ModeloNucleo, nombre: str) -> str:
    return next(
        t["nombre"] for t in nucleo.tipos_listar("IfcBeamType") if t["nombre"] == nombre
    )


def _peralte(nucleo: ModeloNucleo, gid: str) -> float:
    return nucleo._peralte_de(_entidad(nucleo, gid))


def _tope(nucleo: ModeloNucleo, gid: str) -> float:
    return nucleo._z_de_elemento(_entidad(nucleo, gid))


def _castillos_de(nucleo: ModeloNucleo, muro: str) -> list[str]:
    salida = []
    for e in nucleo.modelo.by_type("IfcColumn"):
        if nucleo._leer_pset(e, "OPENRVT_Liga").get("Muro") == muro:
            salida.append(str(e.GlobalId))
    return salida


def _modelo_con_cerramiento(
    nucleo: ModeloNucleo, altura_nivel: float = 2.60
) -> tuple[str, str, str]:
    """(muro, cerramiento, nivel1) con el muro de Nivel 0 a Nivel 1."""
    nivel0 = _nivel(nucleo)
    n1 = nucleo.nivel_crear("Nivel 1", altura_nivel)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel0, 0, 0, 4, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    return muro, cerramiento, n1


# ----------------------------------------------------------- regla única de altura


def test_ligado_tope_es_la_corona_del_muro() -> None:
    """El lecho guardado es el superior: tope = corona del muro (±1e-6)."""
    nucleo = _nuevo()
    muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    assert _tope(nucleo, cerramiento) == pytest.approx(2.60, abs=1e-6)
    assert _z(nucleo, cerramiento) == pytest.approx(2.50, abs=1e-9)
    # Fondo = tope − peralte.
    assert _z(nucleo, cerramiento) - _peralte(nucleo, cerramiento) / 2.0 == pytest.approx(
        2.40, abs=1e-9
    )


def test_ligado_guarda_restriccion_del_nivel_de_tope_del_muro() -> None:
    """Nivel de referencia = nivel de tope del muro; Desfase = desfase de tope."""
    nucleo = _nuevo()
    muro, cerramiento, n1 = _modelo_con_cerramiento(nucleo)
    restriccion = _restricciones(nucleo, cerramiento)
    assert restriccion["NivelBase"] == n1
    assert restriccion["DesfaseBase"] == pytest.approx(0.0, abs=1e-9)


def test_subir_nivel_uno_sube_cerramiento_y_castillos() -> None:
    """Al subir Nivel 1 +0.30 el cerramiento y los castillos lo siguen."""
    nucleo = _nuevo()
    muro, cerramiento, n1 = _modelo_con_cerramiento(nucleo)
    nucleo.castillos_automaticos([muro], 3.0)
    nucleo.nivel_editar(n1, elevacion=2.90)
    assert _tope(nucleo, cerramiento) == pytest.approx(2.90, abs=1e-6)
    for castillo in _castillos_de(nucleo, muro):
        datos = _estructura(nucleo, castillo)
        # O050: el castillo llega a la cara inferior del cerramiento (2.90 − 0.20).
        assert datos["Altura"] == pytest.approx(2.70, abs=1e-6)
        assert datos["Base"] == pytest.approx(0.0, abs=1e-6)


def test_muro_sin_tope_ligado_toma_base_mas_altura() -> None:
    """Muro sin conexión: el cerramiento ligado toma base del muro + altura."""
    nucleo = _nuevo()
    nivel0 = _nivel(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel0, 0, 0, 4, 0, altura=3.0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope="")
    nucleo.restricciones_editar(muro, altura_sin_conexion=3.0)
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    assert _tope(nucleo, cerramiento) == pytest.approx(3.0, abs=1e-6)
    restriccion = _restricciones(nucleo, cerramiento)
    assert restriccion["NivelBase"] == nivel0
    assert restriccion["DesfaseBase"] == pytest.approx(3.0, abs=1e-6)


# ----------------------------------------------------------- suelto y edición


def test_soltar_del_muro_y_cambiar_nivel_conserva_desfase() -> None:
    """Soltar deja el cerramiento donde está; después es editable."""
    nucleo = _nuevo()
    _muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    nucleo.soltar_del_muro(cerramiento)
    assert nucleo._leer_pset(_entidad(nucleo, cerramiento), "OPENRVT_Liga") == {}
    # Nivel 0 + 2.40 → tope 2.40 (mismo desfase respecto al nuevo nivel).
    nucleo.restricciones_editar(
        cerramiento, nivel_base=_nivel(nucleo), desfase_base=2.40
    )
    assert _tope(nucleo, cerramiento) == pytest.approx(2.40, abs=1e-6)
    assert _z(nucleo, cerramiento) == pytest.approx(2.30, abs=1e-9)


def test_cerramiento_no_acepta_tope_ni_altura() -> None:
    """Ninguna puerta acepta restricción de tope ni altura en el cerramiento."""
    nucleo = _nuevo()
    _muro, cerramiento, n1 = _modelo_con_cerramiento(nucleo)
    nucleo.soltar_del_muro(cerramiento)
    with pytest.raises(ErrorNucleo) as uno:
        nucleo.restricciones_editar(cerramiento, nivel_tope=n1)
    assert uno.value.codigo == -32602
    with pytest.raises(ErrorNucleo) as dos:
        nucleo.restricciones_editar(cerramiento, altura_sin_conexion=2.0)
    assert dos.value.codigo == -32602


def test_deshacer_sueltar_y_cambiar_nivel_en_un_paso() -> None:
    """Soltar + cambiar nivel es un solo paso de Deshacer, con GlobalId estable."""
    nucleo = _nuevo()
    _muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    nucleo.soltar_del_muro(cerramiento)
    nucleo.restricciones_editar(
        cerramiento, nivel_base=_nivel(nucleo), desfase_base=2.40
    )
    assert _tope(nucleo, cerramiento) == pytest.approx(2.40, abs=1e-6)
    nucleo.deshacer()
    assert _tope(nucleo, cerramiento) == pytest.approx(2.60, abs=1e-6)
    assert _entidad(nucleo, cerramiento).GlobalId == cerramiento


def test_cambiar_tipo_peralte_recalcula_muro_sin_tocar_castillos() -> None:
    """Cambiar el peralte del tipo re-deriva Z; O045: los castillos no bajan."""
    nucleo = _nuevo()
    muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    nucleo.castillos_automaticos([muro], 3.0)
    tipo_gid = next(
        t["globalid"]
        for t in nucleo.tipos_listar("IfcBeamType")
        if t["nombre"] == "CE-1 Cerramiento 15×20"
    )
    # H de 0.20 → 0.30: el tope (corona 2.60) no cambia; el fondo baja a 2.30.
    nucleo.tipos_editar(tipo_gid, {"seccion": {"H": 0.30}})
    assert _tope(nucleo, cerramiento) == pytest.approx(2.60, abs=1e-6)
    assert _z(nucleo, cerramiento) == pytest.approx(2.45, abs=1e-9)
    assert _peralte(nucleo, cerramiento) == pytest.approx(0.30, abs=1e-9)
    for castillo in _castillos_de(nucleo, muro):
        # O050: la cara inferior baja a 2.60 − 0.30 y el castillo la sigue.
        assert _estructura(nucleo, castillo)["Altura"] == pytest.approx(2.30, abs=1e-6)


# ----------------------------------------------------------- esquinas y archivo viejo


def test_L_sin_volumen_duplicado() -> None:
    """La suma de volúmenes de los cerramientos es la unión (0.2145 m³, a mano).

    Unión física de los dos cerramientos de 0.15 × 0.20 en L (uno de 4 m en +x y
    otro de 3 m en +y): (4.15 × 0.15 + 3.15 × 0.15 − 0.15 × 0.15) × 0.20 = 0.2145.
    """
    nucleo = _nuevo()
    nivel0 = _nivel(nucleo)
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    m1 = nucleo.muro_crear("Block 15", nivel0, 0, 0, 4, 0)["creados"][0]
    m2 = nucleo.muro_crear("Block 15", nivel0, 0, 0, 0, 3)["creados"][0]
    nucleo.restricciones_editar(m1, nivel_tope=n1)
    nucleo.restricciones_editar(m2, nivel_tope=n1)
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", m1)
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", m2)
    cantidades = nucleo.cantidades_estructura()
    cerramientos = [e for e in cantidades["elementos"] if e["alias"] == "cerramiento"]
    assert len(cerramientos) == 2
    suma_cerramientos = sum(e["volumen_neto_m3"] for e in cerramientos)
    assert suma_cerramientos == pytest.approx(0.2145, abs=1e-6)
    # Invariante global: la suma de netos es el volumen de la unión.
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


def test_archivo_viejo_conserva_la_posicion() -> None:
    """Un cerramiento viejo (sin pset de restricciones) conserva su posición."""
    nucleo = _nuevo()
    _muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    antes = _z(nucleo, cerramiento)
    entidad = _entidad(nucleo, cerramiento)
    nucleo._quitar_claves_pset(
        entidad, PSET_RESTRICCIONES,
        ("NivelBase", "DesfaseBase", "NivelTope", "DesfaseTope", "AlturaSinConexion"),
    )
    assert _z(nucleo, cerramiento) == pytest.approx(antes, abs=1e-9)
    # La restricción se deriva de la geometría: tope 2.60.
    assert _tope(nucleo, cerramiento) == pytest.approx(2.60, abs=1e-6)


def test_rpc_de_puntas_suelta_y_cambia_nivel() -> None:
    """Flujo completo por el servidor JSON-RPC, no solo la API interna."""
    nucleo = _nuevo()
    _muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    servidor = Servidor()
    servidor.modelo = nucleo
    servidor.despachar("cerramientos.soltar_del_muro", {"globalid": cerramiento})
    servidor.despachar(
        "restricciones.editar",
        {"globalid": cerramiento, "nivel_base": _nivel(nucleo), "desfase_base": 2.40},
    )
    assert _tope(nucleo, cerramiento) == pytest.approx(2.40, abs=1e-6)

# ------------------------------------------------- muro que no se teselaba (2-nov)


@pytest.mark.parametrize("largo,ancho", [(4.0, 3.0), (5.0, 4.0), (6.0, 3.5), (3.0, 3.0)])
def test_todos_los_muros_se_teselan_con_castillos_y_cerramientos(largo, ancho) -> None:
    """El recorte con castillos dejaba vértices casi repetidos en un muro y
    IfcOpenShell no lo teselaba: desaparecía de planta, alzado y 3D."""
    from openrvt_nucleo.modelo import ModeloNucleo

    nucleo = ModeloNucleo()
    nucleo.nuevo("O040 teselado")
    nivel = nucleo.niveles()[0]["globalid"]
    muros = [
        nucleo.muro_crear("Block 15", nivel, *c, 2.6, "centro", "eje_nucleo")["creados"][0]
        for c in [(0, 0, largo, 0), (largo, 0, largo, ancho), (largo, ancho, 0, ancho), (0, ancho, 0, 0)]
    ]
    nucleo.castillos_automaticos(muros, 3.0, None)
    for muro in muros:
        nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    teselados = {e["globalid"] for e in nucleo.teselar(None)["elementos"]}
    todos = {e["globalid"] for e in nucleo.elementos()}
    assert todos <= teselados, f"sin geometría: {sorted(todos - teselados)}"
