"""O057: cerramientos en muros apilados y castillos con tope del usuario.

Valores a mano (bitácora del dueño, 2026-11-09):
- Niveles N0 0.00, N1 2.20, N2 2.40, N3 3.00, N4 3.20, N5 3.60.
- Muros Block 15 (núcleo 0.15) en N0 con tope N1 → corona 2.20.
- Muros Block 15 en N2 con tope N3 → corona 3.00.
- Castillo con NivelTope N5 → altura 3.60 − 0.00 = 3.60 m.
- Cerramiento 15×20 (peralte 0.20) en N4 → cara superior 3.20, inferior 3.00;
  solo puede colgar del muro cuya corona es 3.00 (el de N2), nunca del de N0
  (corona 2.20). Cuatro lados de 2.50 y 1.50 → 4 cerramientos; con los 4 del
  paso 2 el modelo queda con 8.
- El mismo trazo con NivelBase N2 (cara inferior 2.20) cuelga del muro de N0
  (corona 2.20): 4 más, sin duplicar los 4 sueltos del paso 2.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402

TIPO = "CE-1 Cerramiento 15×20"
CASTILLO = "K-1 Castillo 15×15"
MURO = "Block 15"
LADOS = [
    (0.0, 1.5, 2.5, 1.5),
    (2.5, 1.5, 2.5, 0.0),
    (2.5, 0.0, 0.0, 0.0),
    (0.0, 0.0, 0.0, 1.5),
]
DUENO = RAIZ / "nucleo" / "tests" / "datos" / "o057-fallo-dueno.ifc"


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Estructura")


def _restriccion(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._restricciones_de(_entidad(nucleo, gid))


def _liga(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Liga")


def _cerramientos(nucleo: ModeloNucleo) -> list:
    salida = []
    for viga in nucleo.modelo.by_type("IfcBeam"):
        try:
            if nucleo._estructura_de_tipo(nucleo._tipo_entidad(viga)) == "cerramiento":
                salida.append(viga)
        except Exception:
            continue
    return salida


def _altura_castillo(nucleo: ModeloNucleo, gid: str) -> float:
    return float(_datos(nucleo, gid)["Altura"])


def _bitacora() -> dict:
    """Pasos 1-4 de la bitácora, por comandos del núcleo."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O057")
    n0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.20)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 2.40)["creados"][0]
    n3 = nucleo.nivel_crear("Nivel 3", 3.00)["creados"][0]
    n4 = nucleo.nivel_crear("Nivel 4", 3.20)["creados"][0]
    n5 = nucleo.nivel_crear("Nivel 5", 3.60)["creados"][0]
    # 1. Cuatro muros Block 15 en N0 (tope N1 = 2.20) y castillos en las esquinas.
    muros_n0 = [
        nucleo.muro_crear(MURO, n0, *lado, altura=2.60)["creados"][0]
        for lado in LADOS
    ]
    assert all(
        nucleo._datos_muro(_entidad(nucleo, m))["altura"] == pytest.approx(2.20)
        for m in muros_n0
    )
    castillos = nucleo.castillos_automaticos(separacion_max=3.0)["creados"]
    assert len(castillos) == 4
    # 2. Cuatro cerramientos en N1 y se cambian a N2 (restricciones.editar).
    for lado in LADOS:
        cerramiento = nucleo.cerramiento_crear(
            TIPO, *lado, nivel=n1, desfase=0
        )["creados"][0]
        nucleo.restricciones_editar(cerramiento, nivel_base=n2)
    # 3. NivelTope de los cuatro castillos a N5 (3.60), puesto a mano.
    for castillo in castillos:
        nucleo.restricciones_editar(castillo, nivel_tope=n5)
    assert all(
        _altura_castillo(nucleo, c) == pytest.approx(3.60) for c in castillos
    )
    # 4. Cuatro muros Block 15 en N2 (2.40 → tope N3 = 3.00).
    muros_n2 = [
        nucleo.muro_crear(MURO, n2, *lado, altura=2.60)["creados"][0]
        for lado in LADOS
    ]
    assert all(
        nucleo._datos_muro(_entidad(nucleo, m))["altura"] == pytest.approx(0.60)
        for m in muros_n2
    )
    return {
        "nucleo": nucleo,
        "n0": n0, "n1": n1, "n2": n2, "n3": n3, "n4": n4, "n5": n5,
        "muros_n0": muros_n0, "muros_n2": muros_n2, "castillos": castillos,
    }


def _contenedor(nucleo: ModeloNucleo, gid: str) -> str:
    return nucleo._nivel_de_elemento(_entidad(nucleo, gid)).GlobalId


def test_cuatro_cerramientos_en_n4_se_ligan_solo_a_los_muros_de_n2() -> None:
    """(a) El trazo en N4 cuelga de la corona 3.00 (N2), no de la de 2.20 (N0)."""
    datos = _bitacora()
    nucleo = datos["nucleo"]
    assert len(_cerramientos(nucleo)) == 4
    muros_n0 = {_entidad(nucleo, m).GlobalId for m in datos["muros_n0"]}
    muros_n2 = {_entidad(nucleo, m).GlobalId for m in datos["muros_n2"]}

    creados: list[str] = []
    for lado in LADOS:
        resultado = nucleo.cerramiento_crear(
            TIPO, *lado, nivel=datos["n4"], desfase=0
        )
        # El trazo de un lado debe producir UN cerramiento, no uno por muro apilado.
        assert len(resultado["creados"]) == 1, resultado["mensaje"]
        creados.extend(resultado["creados"])
    assert len(creados) == 4
    assert len(_cerramientos(nucleo)) == 8

    for gid in creados:
        liga = _liga(nucleo, gid)
        assert liga.get("Muro") in muros_n2, "se ligó a un muro de N0 o quedó suelto"
        assert liga.get("Muro") not in muros_n0
        # Invariante (e): vive en el storey de su NivelBase (N4).
        assert _contenedor(nucleo, gid) == datos["n4"]
        assert float(_datos(nucleo, gid)["Z"]) == pytest.approx(3.10)


def test_castillos_con_tope_del_usuario_siguen_en_360_tras_el_trazo() -> None:
    """(b) y regla 2: ningún cerramiento automático pisa el tope N5 = 3.60."""
    datos = _bitacora()
    nucleo = datos["nucleo"]
    for lado in LADOS:
        nucleo.cerramiento_crear(TIPO, *lado, nivel=datos["n4"], desfase=0)
    for castillo in datos["castillos"]:
        assert _altura_castillo(nucleo, castillo) == pytest.approx(3.60)
        assert float(_datos(nucleo, castillo)["Base"]) == pytest.approx(0.00)
        assert _restriccion(nucleo, castillo)["NivelTope"] == datos["n5"]


def test_cerramiento_ligado_al_muro_de_n0_no_baja_el_castillo_del_usuario() -> None:
    """Regla 2: el cerramiento falso a 2.00 del paso 5 no deja huecos (3.60)."""
    datos = _bitacora()
    nucleo = datos["nucleo"]
    muro_n0 = datos["muros_n0"][0]
    # Cerramiento 2.20–2.40 sobre el muro de N0, como el falso del paso 5.
    nucleo.cerramiento_crear_en_muro(TIPO, muro_n0, nivel=datos["n2"], desfase=0)
    for castillo in datos["castillos"]:
        assert _altura_castillo(nucleo, castillo) == pytest.approx(3.60)


def test_sin_tope_del_usuario_el_castillo_sigue_la_cara_inferior() -> None:
    """Regla 2, segunda parte: sin NivelTope se conserva O050 (no se debilita)."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O057 sin tope")
    n0 = nucleo.niveles()[0]["globalid"]
    # Muro de 2.60 sin nivel superior: conserva su altura porque no hay tope.
    muro = nucleo.muro_crear(MURO, n0, 0.0, 0.0, 2.5, 0.0, altura=2.60)["creados"][0]
    n1 = nucleo.nivel_crear("Nivel 1", 2.20)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 2.40)["creados"][0]
    castillo = nucleo.castillo_crear_en_muro(CASTILLO, muro, 0.075)["creados"][0]
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.60)

    nucleo.cerramiento_crear_en_muro(TIPO, muro, nivel=n2, desfase=0)

    # Cerramiento 2.20–2.40: fondo 2.20; el castillo baja de 2.60 a 2.20.
    assert _altura_castillo(nucleo, castillo) == pytest.approx(2.20)


def test_el_mismo_trazo_con_nivel_base_n2_no_duplica_ni_falla() -> None:
    """(c) Con NivelBase N2 cuelga de la corona 2.20 (N0) y no choca con los sueltos."""
    datos = _bitacora()
    nucleo = datos["nucleo"]
    muros_n0 = {_entidad(nucleo, m).GlobalId for m in datos["muros_n0"]}

    creados: list[str] = []
    for lado in LADOS:
        creados.extend(
            nucleo.cerramiento_crear(
                TIPO, *lado, nivel=datos["n2"], desfase=0
            )["creados"]
        )
    assert len(creados) == 4
    assert len(_cerramientos(nucleo)) == 8
    for gid in creados:
        liga = _liga(nucleo, gid)
        assert liga.get("Muro") in muros_n0
        assert _contenedor(nucleo, gid) == datos["n2"]
        assert float(_datos(nucleo, gid)["Z"]) == pytest.approx(2.30)


def test_duplicado_solo_rechaza_el_muro_que_de_verdad_sostiene() -> None:
    """Borde: repetir un lado en N4 falla; la regla no debilita O045."""
    datos = _bitacora()
    nucleo = datos["nucleo"]
    nucleo.cerramiento_crear(TIPO, *LADOS[0], nivel=datos["n4"], desfase=0)
    with pytest.raises(ErrorNucleo) as fallo:
        nucleo.cerramiento_crear(TIPO, *LADOS[0], nivel=datos["n4"], desfase=0)
    assert "ya tiene cerramiento en Nivel 4" in str(fallo.value)


def test_trazo_fuera_de_muros_crea_uno_suelto_en_el_nivel() -> None:
    """Borde/regla 1: sin muro bajo el trazo se crea suelto en el nivel."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O057 suelto")
    n0 = nucleo.niveles()[0]["globalid"]
    n4 = nucleo.nivel_crear("Nivel 4", 3.20)["creados"][0]
    resultado = nucleo.cerramiento_crear(
        TIPO, 10.0, 10.0, 12.5, 10.0, nivel=n4, desfase=0
    )
    assert len(resultado["creados"]) == 1
    gid = resultado["creados"][0]
    assert not _liga(nucleo, gid).get("Muro")
    assert _contenedor(nucleo, gid) == n4


def test_trazo_de_longitud_cero_se_rechaza() -> None:
    """Borde: dos puntos iguales no crean nada."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O057 cero")
    n0 = nucleo.niveles()[0]["globalid"]
    with pytest.raises(ErrorNucleo):
        nucleo.cerramiento_crear(TIPO, 1.0, 1.0, 1.0, 1.0, nivel=n0, desfase=0)


def test_editar_el_nivel_base_mueve_el_cerramiento_de_storey() -> None:
    """Regla 3: también al editar la restricción queda en el storey de su base."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O057 storey")
    n0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.20)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 2.40)["creados"][0]
    cerramiento = nucleo.cerramiento_crear(
        TIPO, 5.0, 5.0, 7.5, 5.0, nivel=n1, desfase=0
    )["creados"][0]
    assert _contenedor(nucleo, cerramiento) == n1
    nucleo.restricciones_editar(cerramiento, nivel_base=n2)
    assert _contenedor(nucleo, cerramiento) == n2
    assert float(_datos(nucleo, cerramiento)["Z"]) == pytest.approx(2.30)


def test_validar_y_reparar_el_ifc_del_dueno() -> None:
    """(d) El N4 ligado al muro de N0 se detecta; al reparar quedan los 4 castillos en 3.60."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    problemas = nucleo.validar_cerramientos()
    malo = "0hiLUpQHr1lh2jfQgW9rKi"  # N4 (3.20) ligado al muro de N0 (corona 2.20)
    bueno = "3vdCXVSSn2WRxzOUVVV$JN"  # N4 ligado al muro de N2 (corona 3.00)
    por_gid = {p["globalid"]: p for p in problemas}
    assert malo in por_gid
    assert "muro_incorrecto" in por_gid[malo]["motivos"]
    assert bueno not in por_gid or "muro_incorrecto" not in por_gid[bueno]["motivos"]

    nucleo.reparar_cerramientos()

    problemas = nucleo.validar_cerramientos()
    assert not [
        p for p in problemas if "muro_incorrecto" in p["motivos"]
    ], problemas
    # Los dos castillos que el cerramiento falso bajó a 2.20 vuelven a 3.60.
    castillos = [
        c for c in nucleo.modelo.by_type("IfcColumn")
        if nucleo._estructura_de_tipo(nucleo._tipo_entidad(c)) == "castillo"
    ]
    assert len(castillos) == 4
    for castillo in castillos:
        assert float(
            nucleo._leer_pset(castillo, "OPENRVT_Estructura")["Altura"]
        ) == pytest.approx(3.60)


def test_cada_cerramiento_habita_el_storey_de_su_nivel_base() -> None:
    """Invariante (e), puerta por puerta: trazo, en_muro y restricciones.editar."""
    datos = _bitacora()
    nucleo = datos["nucleo"]
    for lado in LADOS:
        nucleo.cerramiento_crear(TIPO, *lado, nivel=datos["n4"], desfase=0)
    for muro in datos["muros_n2"]:
        # Otro nivel para no duplicar el trazo de N4 sobre el mismo muro.
        nucleo.cerramiento_crear_en_muro(TIPO, muro, nivel=datos["n1"], desfase=0)
    for viga in _cerramientos(nucleo):
        restriccion = _restriccion(nucleo, viga.GlobalId)
        assert _contenedor(nucleo, viga.GlobalId) == restriccion["NivelBase"]
