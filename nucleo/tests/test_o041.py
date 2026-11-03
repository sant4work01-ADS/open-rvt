"""O041: cerramientos de verdad, la zapata no corta la losa y castillos rápidos.

Los tiempos se miden con la misma retícula de la spec (muros corridos, no
segmentados): una retícula de n × n cuartos son n + 1 muros horizontales y
n + 1 verticales, con castillos automáticos a separación máxima 3 m.

La laptop de la spec tardaba 2.6 / 9.7 / 24.9 s en 2×2 / 3×3 / 4×4; la meta es
4×4 < 2 s y 3×3 < 1 s. El tope de la prueba deja holgura ×3.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import ifcopenshell.util.placement as placement
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O041")
    return nucleo


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[2][3])


def _datos_muro(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._datos_muro(_entidad(nucleo, gid))


def _modelo_con_cerramiento(
    nucleo: ModeloNucleo, altura_nivel: float = 2.60
) -> tuple[str, str, str]:
    """(muro, cerramiento, nivel1) con el muro de Nivel 0 a Nivel 1."""
    nivel0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", altura_nivel)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel0, 0, 0, 4, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    return muro, cerramiento, n1


def _castillos_de(nucleo: ModeloNucleo, muro: str) -> list[str]:
    salida = []
    for e in nucleo.modelo.by_type("IfcColumn"):
        if nucleo._leer_pset(e, "OPENRVT_Liga").get("Muro") == muro:
            salida.append(str(e.GlobalId))
    return salida


def test_ligado_editar_nivel_cambia_la_altura_del_muro() -> None:
    """O041: al bajar el cerramiento a Nivel 1 − 0.20, el muro se acorta.

    Muro Block 15 de Nivel 0 a Nivel 1 (2.60); cerramiento CE-1 (H 0.20) ligado,
    con tope 2.60. Al fijar desfase −0.20 el tope pasa a 2.40, el fondo a 2.20 y el
    muro (que termina en la cara inferior del cerramiento) baja de 2.60 a 2.40.
    """
    nucleo = _nuevo()
    muro, cerramiento, n1 = _modelo_con_cerramiento(nucleo)
    nucleo.castillos_automaticos([muro], 3.0, None)
    assert _datos_muro(nucleo, muro)["altura"] == pytest.approx(2.60, abs=1e-9)
    nucleo.restricciones_editar(cerramiento, nivel_base=n1, desfase_base=-0.20)
    assert _z(nucleo, cerramiento) == pytest.approx(2.30, abs=1e-9)
    # El muro termina en la cara inferior (2.20); la altura guardada es 2.40.
    assert _datos_muro(nucleo, muro)["altura"] == pytest.approx(2.40, abs=1e-9)
    for castillo in _castillos_de(nucleo, muro):
        datos = nucleo._leer_pset(_entidad(nucleo, castillo), "OPENRVT_Estructura")
        assert datos["Altura"] == pytest.approx(2.20, abs=1e-9)


def test_ligado_editar_desfase_es_un_solo_paso_de_deshacer() -> None:
    """O041: cambiar el nivel o el desfase conserva el GlobalId y es un deshacer."""
    nucleo = _nuevo()
    muro, cerramiento, n1 = _modelo_con_cerramiento(nucleo)
    nucleo.restricciones_editar(cerramiento, nivel_base=n1, desfase_base=-0.20)
    assert _datos_muro(nucleo, muro)["altura"] == pytest.approx(2.40, abs=1e-9)
    nucleo.deshacer()
    assert _entidad(nucleo, cerramiento).GlobalId == cerramiento
    assert _z(nucleo, cerramiento) == pytest.approx(2.50, abs=1e-9)
    assert _datos_muro(nucleo, muro)["altura"] == pytest.approx(2.60, abs=1e-9)


def test_ligado_sigue_el_eje_y_el_largo_pero_no_la_altura() -> None:
    """O041: la liga es solo en planta; al mover el muro el cerramiento sigue el eje
    y el largo, pero conserva su altura (que manda él)."""
    nucleo = _nuevo()
    muro, cerramiento, n1 = _modelo_con_cerramiento(nucleo)
    nucleo.restricciones_editar(cerramiento, nivel_base=n1, desfase_base=0.30)
    assert _z(nucleo, cerramiento) == pytest.approx(2.80, abs=1e-9)
    # Mover el muro en planta no cambia la cota del cerramiento, solo su eje.
    nucleo.elementos_mover([muro], 1.0, 2.0, 0.0)
    datos = nucleo._leer_pset(_entidad(nucleo, cerramiento), "OPENRVT_Estructura")
    assert datos["X1"] == pytest.approx(1.0, abs=1e-9)
    assert datos["Y1"] == pytest.approx(2.0, abs=1e-9)
    assert datos["Longitud"] == pytest.approx(4.0, abs=1e-9)
    assert _z(nucleo, cerramiento) == pytest.approx(2.80, abs=1e-9)


def test_soltar_del_muro_deja_la_altura_donde_esta() -> None:
    """O041: «Soltar del muro» suelta la liga y deja el cerramiento donde está."""
    nucleo = _nuevo()
    _muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    nucleo.soltar_del_muro(cerramiento)
    assert nucleo._leer_pset(_entidad(nucleo, cerramiento), "OPENRVT_Liga") == {}
    assert _z(nucleo, cerramiento) == pytest.approx(2.50, abs=1e-9)


def test_crear_con_nivel_y_desfase_de_la_barra() -> None:
    """O041 §1: la barra de opciones aplica nivel y desfase al crear.

    Muro Block 15 de Nivel 0 (0.00) a Nivel 1 (2.60). Con Nivel 0 y desfase 1.80
    en la barra, la cara superior del cerramiento (CE-1, H 0.20) queda en 1.80,
    su centro en 1.70, y el muro guarda altura 1.80 (la cara superior, como en
    «la altura la manda el cerramiento»; los castillos pararían en 1.60).
    Todo es un solo paso de Deshacer.
    """
    nucleo = _nuevo()
    nivel0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel0, 0, 0, 4, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro, nivel=nivel0, desfase=1.80
    )["creados"][0]
    assert _z(nucleo, cerramiento) == pytest.approx(1.70, abs=1e-9)
    assert _datos_muro(nucleo, muro)["altura"] == pytest.approx(1.80, abs=1e-9)
    restriccion = nucleo._restricciones_de(_entidad(nucleo, cerramiento))
    assert restriccion["NivelBase"] == nivel0
    assert restriccion["DesfaseBase"] == pytest.approx(1.80, abs=1e-9)
    # Un solo paso de Deshacer deshace la creación completa (incluido el ajuste
    # de nivel y desfase): el cerramiento desaparece y el muro vuelve a 2.60.
    nucleo.deshacer()
    assert cerramiento not in {e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")}
    assert _datos_muro(nucleo, muro)["altura"] == pytest.approx(2.60, abs=1e-9)


# ------------------------------------------------------------------ matriz (O041 §4)


def _todos_con_geometria(nucleo: ModeloNucleo) -> set[str]:
    teselados = {e["globalid"] for e in nucleo.teselar(None)["elementos"]}
    todos = {e["globalid"] for e in nucleo.elementos()}
    return todos - teselados


def _muro(nucleo: ModeloNucleo, nivel: str, x1, y1, x2, y2) -> str:
    return nucleo.muro_crear("Block 15", nivel, x1, y1, x2, y2)["creados"][0]


def test_matriz_L_T_y_cruz_sin_hueco_ni_volumen_duplicado() -> None:
    """Uniones en L, T y cruz: cada cerramiento tiene malla y la suma de netos es el
    volumen de la unión (sin huecos ni doble conteo)."""
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    muros = []
    # L en (0,0): horizontal +x y vertical +y.
    muros += [_muro(nucleo, nivel, 0, 0, 4, 0), _muro(nucleo, nivel, 0, 0, 0, 3)]
    # T en (10,0): horizontal pasante y vertical que llega.
    muros += [_muro(nucleo, nivel, 8, 0, 12, 0), _muro(nucleo, nivel, 10, 0, 10, 3)]
    # Cruz en (20,0): horizontal y vertical que se cruzan.
    muros += [_muro(nucleo, nivel, 18, 0, 22, 0), _muro(nucleo, nivel, 20, -1.5, 20, 1.5)]
    for muro in muros:
        nucleo.restricciones_editar(muro, nivel_tope=n1)
        nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    # Ningún elemento queda sin geometría.
    assert _todos_con_geometria(nucleo) == set()
    cantidades = nucleo.cantidades_estructura()
    cerramientos = [e for e in cantidades["elementos"] if e["alias"] == "cerramiento"]
    assert len(cerramientos) == len(muros)
    assert sum(e["volumen_neto_m3"] for e in cerramientos) > 0
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


@pytest.mark.parametrize("linea_a,linea_b", [
    ("eje_nucleo", "cara_exterior"),
    ("cara_exterior", "cara_interior"),
    ("cara_interior", "eje_nucleo"),
])
def test_matriz_muros_a_eje_ya_pano(linea_a: str, linea_b: str) -> None:
    """Cerramientos en una L con los muros a eje y a paño exterior/interior (O032).

    Dos muros de 4.00 y 3.00 m, ambos Block 15, con cerramiento CE-1 de 0.15 de
    ancho y 0.20 de peralte (el ancho lo manda el núcleo del muro): 4·0.15·0.20 =
    0.12 y 3·0.15·0.20 = 0.09 m³ brutos. No hay hueco ni doble conteo: la suma de
    netos es el volumen de la unión, y todos los cerramientos se teselan.
    """
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    a = nucleo.muro_crear(
        "Block 15", nivel, 0, 0, 4, 0, linea_ubicacion=linea_a
    )["creados"][0]
    b = nucleo.muro_crear(
        "Block 15", nivel, 4, 0, 4, 3, linea_ubicacion=linea_b
    )["creados"][0]
    for muro in (a, b):
        nucleo.restricciones_editar(muro, nivel_tope=n1)
        nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    assert _todos_con_geometria(nucleo) == set()
    cantidades = nucleo.cantidades_estructura()
    cerramientos = [e for e in cantidades["elementos"] if e["alias"] == "cerramiento"]
    assert len(cerramientos) == 2
    assert sorted(e["volumen_bruto_m3"] for e in cerramientos) == pytest.approx(
        [0.09, 0.12], abs=1e-6
    )
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


def test_matriz_muros_de_15_y_12_cm_juntos() -> None:
    """Un muro Block 15 y otro Block 12 en L: cada cerramiento toma el ancho de su
    núcleo (0.15 y 0.12), así que los brutos son 4·0.15·0.20 = 0.12 y
    3·0.12·0.20 = 0.072 m³. Se teselan los dos y la suma de netos es la unión."""
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    a = _muro(nucleo, nivel, 0, 0, 4, 0)
    b = nucleo.muro_crear("Block 12", nivel, 4, 0, 4, 3)["creados"][0]
    for muro in (a, b):
        nucleo.restricciones_editar(muro, nivel_tope=n1)
        nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    assert _todos_con_geometria(nucleo) == set()
    cantidades = nucleo.cantidades_estructura()
    cerramientos = [e for e in cantidades["elementos"] if e["alias"] == "cerramiento"]
    assert len(cerramientos) == 2
    assert sorted(e["volumen_bruto_m3"] for e in cerramientos) == pytest.approx(
        [0.072, 0.12], abs=1e-6
    )
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


def test_retícula_3x3_de_cuartos_con_cerramientos() -> None:
    """Retícula de 3×3 cuartos (muros corridos): todos los cerramientos se teselan."""
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    dx, dy = 4.0, 3.0
    muros = []
    for i in range(4):
        muros.append(_muro(nucleo, nivel, 0, i * dy, 3 * dx, i * dy))
    for j in range(4):
        muros.append(_muro(nucleo, nivel, j * dx, 0, j * dx, 3 * dy))
    for muro in muros:
        nucleo.restricciones_editar(muro, nivel_tope=n1)
        nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    assert _todos_con_geometria(nucleo) == set()
    cantidades = nucleo.cantidades_estructura()
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


def test_dos_ordenes_castillos_y_cerramientos_dan_el_mismo_volumen() -> None:
    """Crear castillos y luego cerramientos, o cerramientos y luego castillos
    automáticos, deja el mismo volumen de cerramientos."""

    def construir(castillos_primero: bool) -> float:
        nucleo = _nuevo()
        nivel = nucleo.niveles()[0]["globalid"]
        n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
        muro = _muro(nucleo, nivel, 0, 0, 6, 0)
        nucleo.restricciones_editar(muro, nivel_tope=n1)
        if castillos_primero:
            nucleo.castillos_automaticos([muro], 3.0, None)
            nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
        else:
            nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
            nucleo.castillos_automaticos([muro], 3.0, None)
        assert _todos_con_geometria(nucleo) == set()
        cerramientos = [
            e for e in nucleo.cantidades_estructura()["elementos"]
            if e["alias"] == "cerramiento"
        ]
        return sum(e["volumen_neto_m3"] for e in cerramientos)

    assert construir(True) == pytest.approx(construir(False), abs=1e-9)


def test_cerramiento_sobre_muro_con_losa_y_sin_losa() -> None:
    """El cerramiento se tesela tanto con losa encima como sin ella."""
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    muro = _muro(nucleo, nivel, 0, 0, 4, 0)
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    assert _todos_con_geometria(nucleo) == set()
    # Losa encima: el cerramiento y la losa conviven sin perderse.
    nucleo.losa_crear(n1, [(-1, -1), (5, -1), (5, 1), (-1, 1)], espesor=0.10)
    assert _todos_con_geometria(nucleo) == set()
    datos = nucleo._leer_pset(_entidad(nucleo, cerramiento), "OPENRVT_Estructura")
    assert datos["Longitud"] == pytest.approx(4.0, abs=1e-9)


def _retícula(nucleo: ModeloNucleo, n: int) -> list[str]:
    """n × n cuartos: n + 1 muros horizontales y n + 1 verticales (corridos)."""
    nivel = nucleo.niveles()[0]["globalid"]
    dx, dy = 4.0, 3.0
    muros = []
    for i in range(n + 1):
        muros.append(
            nucleo.muro_crear("Block 15", nivel, 0, i * dy, n * dx, i * dy, altura=2.6)[
                "creados"
            ][0]
        )
    for j in range(n + 1):
        muros.append(
            nucleo.muro_crear("Block 15", nivel, j * dx, 0, j * dx, n * dy, altura=2.6)[
                "creados"
            ][0]
        )
    return muros


def _tiempo_castillos(n: int) -> tuple[float, int, int]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O041 castillos")
    muros = _retícula(nucleo, n)
    inicio = time.perf_counter()
    resultado = nucleo.castillos_automaticos(muros, 3.0, None)
    segundos = time.perf_counter() - inicio
    return segundos, len(muros), len(resultado["creados"])


@pytest.mark.parametrize("n,esperado_muros,esperado_castillos,tope", [
    (3, 8, 28, 3.0),
    (4, 10, 45, 6.0),
])
def test_castillos_automaticos_rapidos(n, esperado_muros, esperado_castillos, tope) -> None:
    """Meta 3×3 < 1 s y 4×4 < 2 s; el tope deja holgura ×3 para la máquina."""
    segundos, muros, castillos = _tiempo_castillos(n)
    assert muros == esperado_muros
    assert castillos == esperado_castillos
    assert segundos < tope, f"{n}×{n} tardó {segundos:.2f} s (tope {tope} s)"


def test_castillos_automaticos_no_regeneran_por_cada_castillo() -> None:
    """O041: se crean todos los castillos y después se regenera una sola vez.

    Se cuenta el número de veces que se llama a ``_recalcular_uniones_estructura``:
    antes del arreglo era uno por castillo más el final (29 en 3×3); ahora debe ser
    una sola llamada.
    """
    from openrvt_nucleo import modelado

    nucleo = ModeloNucleo()
    nucleo.nuevo("O041 recalc")
    muros = _retícula(nucleo, 3)

    def encontrar_clase() -> type:
        for kls in ModeloNucleo.__mro__:
            if "_recalcular_uniones_estructura" in kls.__dict__:
                return kls
        raise AssertionError("no se encontró _recalcular_uniones_estructura")

    kls = encontrar_clase()
    original = kls._recalcular_uniones_estructura
    contador = {"n": 0}

    def patched(self) -> None:
        contador["n"] += 1
        original(self)

    kls._recalcular_uniones_estructura = patched
    try:
        resultado = nucleo.castillos_automaticos(muros, 3.0, None)
        assert len(resultado["creados"]) == 28
        assert contador["n"] == 1, f"se regeneró {contador['n']} veces"
    finally:
        kls._recalcular_uniones_estructura = original


def test_mover_un_cerramiento_ligado_avisa_y_el_muro_si_se_mueve() -> None:
    """O041 §2: Mover un cerramiento ligado avisa con claridad; con el muro también
    seleccionado, ambos se mueven y el cerramiento sigue el eje."""
    nucleo = _nuevo()
    muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    with pytest.raises(Exception, match="ligado al muro"):
        nucleo.elementos_mover([cerramiento], 1.0, 0.0, 0.0)
    # No se movió nada: el cerramiento conserva su eje en x = 0.
    datos = nucleo._leer_pset(_entidad(nucleo, cerramiento), "OPENRVT_Estructura")
    assert datos["X1"] == pytest.approx(0.0, abs=1e-9)
    nucleo.elementos_mover([muro, cerramiento], 1.0, 0.0, 0.0)
    datos = nucleo._leer_pset(_entidad(nucleo, cerramiento), "OPENRVT_Estructura")
    assert datos["X1"] == pytest.approx(1.0, abs=1e-9)
    assert datos["Longitud"] == pytest.approx(4.0, abs=1e-9)


def test_copiar_un_cerramiento_ligado_avisa() -> None:
    """O041 §2: Copiar un cerramiento ligado no crea una copia colgando del muro
    original: se avisa y se deja soltar primero."""
    nucleo = _nuevo()
    _muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    with pytest.raises(Exception, match="Soltar del muro"):
        nucleo.elementos_copiar([cerramiento], 1.0, 0.0, 0.0)
    nucleo.soltar_del_muro(cerramiento)
    nucleo.elementos_copiar([cerramiento], 1.0, 0.0, 0.0)
    copias = [
        e for e in nucleo.modelo.by_type("IfcBeam")
        if nucleo._leer_pset(e, "OPENRVT_Estructura").get("X1") == pytest.approx(1.0, abs=1e-9)
    ]
    assert len(copias) == 1


def test_supr_borra_el_cerramiento_y_deja_el_muro() -> None:
    """O041 §2: Supr sobre un cerramiento lo borra sin llevarse el muro."""
    nucleo = _nuevo()
    muro, cerramiento, _n1 = _modelo_con_cerramiento(nucleo)
    nucleo.elementos_borrar([cerramiento], True)
    assert cerramiento not in {e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")}
    assert _entidad(nucleo, muro).is_a("IfcWall")
