"""Pruebas de O007c: ligas, alojamiento, retícula, cortes por prioridad y acero kg/m."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O007c")
    return nucleo


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _pset(nucleo: ModeloNucleo, gid: str, nombre: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), nombre)


def _rectangulo(nucleo: ModeloNucleo, ancho=7.0, fondo=5.0, altura=2.6) -> list[str]:
    nivel = _nivel(nucleo)
    muros = []
    for x1, y1, x2, y2 in (
        (0, 0, ancho, 0),
        (ancho, 0, ancho, fondo),
        (ancho, fondo, 0, fondo),
        (0, fondo, 0, 0),
    ):
        muros += nucleo.muro_crear(
            "Block 15", nivel, x1, y1, x2, y2, altura
        )["creados"]
    return muros


def _reticula(nucleo: ModeloNucleo, separaciones=(2.0, 2.0)) -> None:
    nucleo.ejes_crear_reticula(
        {"separaciones": list(separaciones), "longitud": 10},
        {"separaciones": list(separaciones), "longitud": 10},
        "rebase",
        1.5,
    )


def test_castillos_automaticos_rectangulo_7x5_da_diez_y_no_duplica() -> None:
    nucleo = _nuevo()
    muros = _rectangulo(nucleo)
    resultado = nucleo.castillos_automaticos(muros, 3.0)
    assert len(resultado["creados"]) == 10
    otra = nucleo.castillos_automaticos(muros, 3.0)
    assert otra["creados"] == []
    assert len(otra["omitidos"]) >= 4
    # Los intermedios de los muros de 7.00 están a 2.333 y 4.667 del inicio.
    distancias = sorted(
        round(float(nucleo._leer_liga(dependiente)["Distancia"]), 3)
        for dependiente in nucleo._dependientes_de(_entidad(nucleo, muros[0]))
    )
    assert distancias == [0.0, 2.333, 4.667, 7.0]


def test_castillos_automaticos_muro_suelto_de_cuatro() -> None:
    nucleo = _nuevo()
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 0, 2.6)["creados"][0]
    resultado = nucleo.castillos_automaticos([muro], 3.0)
    assert len(resultado["creados"]) == 3
    otra = nucleo.castillos_automaticos([muro], 3.0)
    assert otra["creados"] == []


def test_el_castillo_sigue_al_muro_y_el_cerramiento_se_recalcula() -> None:
    nucleo = _nuevo()
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 0, 2.6)["creados"][0]
    castillos = nucleo.castillos_automaticos([muro], 3.0)["creados"]
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    for castillo in castillos:
        datos = _pset(nucleo, castillo, "OPENRVT_Estructura")
        assert datos["Altura"] == pytest.approx(2.40)
        assert datos["H"] == pytest.approx(0.15)

    nucleo.elementos_mover([muro], 1.0, 0.0, 0.0)
    for castillo in castillos:
        datos = _pset(nucleo, castillo, "OPENRVT_Estructura")
        assert datos["X"] >= 1.0 - 1e-9
        assert datos["X"] <= 5.0 + 1e-9

    nucleo.elemento_editar(muro, {"longitud": 6.0})
    datos = _pset(nucleo, cerramiento, "OPENRVT_Estructura")
    assert datos["Longitud"] == pytest.approx(6.0)
    assert datos["X2"] == pytest.approx(7.0)
    assert datos["B"] == pytest.approx(0.15)

    nucleo.elementos_borrar([muro])
    assert len(nucleo.modelo.by_type("IfcWall")) == 0
    assert len(nucleo.modelo.by_type("IfcColumn")) == 0
    assert len(nucleo.modelo.by_type("IfcBeam")) == 0
    nucleo.deshacer()
    assert len(nucleo.modelo.by_type("IfcWall")) == 1
    assert len(nucleo.modelo.by_type("IfcColumn")) == len(castillos)
    assert len(nucleo.modelo.by_type("IfcBeam")) == 1


def test_cerramiento_veinte_baja_los_castillos_a_dos_cuarenta() -> None:
    nucleo = _nuevo()
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 2.6, 0, 2.6)["creados"][0]
    castillo = nucleo.castillo_crear_en_muro(
        "K-1 Castillo 15×15", muro, 1.3
    )["creados"][0]
    assert _pset(nucleo, castillo, "OPENRVT_Estructura")["Altura"] == pytest.approx(2.6)
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    datos = _pset(nucleo, castillo, "OPENRVT_Estructura")
    assert datos["Altura"] == pytest.approx(2.40)
    assert datos["Base"] == pytest.approx(0.0)
    # El cerramiento va de extremo a extremo y con el ancho del núcleo.
    cerramientos = [
        e for e in nucleo.modelo.by_type("IfcBeam")
        if nucleo._estructura_de_tipo(nucleo._tipo_entidad(e)) == "cerramiento"
    ]
    pset = _pset(nucleo, cerramientos[0].GlobalId, "OPENRVT_Estructura")
    assert pset["Longitud"] == pytest.approx(2.6)
    assert pset["B"] == pytest.approx(0.15)


def test_columnas_en_cruces_y_el_eje_mueve_columnas_y_zapatas() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    _reticula(nucleo)
    resultado = nucleo.columnas_en_cruces("C-1 Columna 30×30", nivel)
    assert len(resultado["creados"]) == 9
    assert nucleo.columnas_en_cruces("C-1 Columna 30×30", nivel)["creados"] == []
    with_zapata = resultado["creados"][:3]
    for columna in with_zapata:
        nucleo.zapata_bajo_columna("Z-1 Zapata 1.20×1.20", columna)

    eje_b = next(e for e in nucleo.ejes_listar() if e["etiqueta"] == "B")
    columnas_b = [
        c for c in resultado["creados"]
        if abs(float(_pset(nucleo, c, "OPENRVT_Estructura")["Y"]) - 2.0) < 1e-9
    ]
    assert len(columnas_b) == 3
    nucleo.ejes_mover(eje_b["globalid"], 0.5)
    for columna in columnas_b:
        assert float(_pset(nucleo, columna, "OPENRVT_Estructura")["Y"]) == pytest.approx(1.5)
    zapatas = [
        e for e in nucleo.modelo.by_type("IfcFooting")
        if nucleo._estructura_de_tipo(nucleo._tipo_entidad(e)) == "zapata"
    ]
    assert len(zapatas) == 3
    assert sorted(_pset(nucleo, z.GlobalId, "OPENRVT_Estructura")["Y"] for z in zapatas) == [
        pytest.approx(0.0), pytest.approx(1.5), pytest.approx(4.0)
    ]


def test_zapata_excentrica_en_lindero_y_base_de_columna() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    columna = nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0, altura=3.0)["creados"][0]
    zapata = nucleo.zapata_bajo_columna(
        "Z-1 Zapata 1.20×1.20", columna, 1.0, "E"
    )["creados"][0]
    pz = _pset(nucleo, zapata, "OPENRVT_Estructura")
    assert pz["X"] + 1.20 / 2.0 == pytest.approx(0.15)
    assert _pset(nucleo, zapata, "OPENRVT_Liga")["Lindero"] == "E"
    assert _pset(nucleo, columna, "OPENRVT_Estructura")["Base"] == pytest.approx(-0.15)
    # Borrar la columna pregunta en la interfaz; el núcleo acepta la decisión.
    nucleo.elementos_borrar([columna], dependientes=False)
    assert len(nucleo.modelo.by_type("IfcFooting")) == 1


def test_corte_por_prioridad_de_la_trabe_e_invariante_de_union() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    c1 = nucleo.columna_crear("C-1 Columna 30×30", nivel, 0, 0, altura=3.0)["creados"][0]
    c2 = nucleo.columna_crear("C-1 Columna 30×30", nivel, 4, 0, altura=3.0)["creados"][0]
    nucleo.zapata_bajo_columna("Z-1 Zapata 1.20×1.20", c1)
    nucleo.zapata_bajo_columna("Z-1 Zapata 1.20×1.20", c2)
    nucleo.viga_crear("T-1 Trabe 20×40", nivel, 0, 0, 4, 0, desfase=3.0)
    cantidades = nucleo.cantidades_estructura()
    trabe = next(e for e in cantidades["elementos"] if e["alias"] == "trabe")
    assert trabe["volumen_bruto_m3"] == pytest.approx(0.20 * 0.40 * 4.00)
    assert trabe["volumen_neto_m3"] == pytest.approx(0.20 * 0.40 * 3.70, abs=1e-6)
    assert cantidades["total"]["volumen_neto_m3"] == pytest.approx(
        cantidades["union_m3"], abs=1e-6
    )


def test_area_neta_del_muro_con_castillos_y_cerramiento() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0, 2.6)["creados"][0]
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 0.5)
    nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 3.5)
    muro_info = next(
        e for e in nucleo.cantidades_estructura()["elementos"] if e["alias"] == "muro"
    )
    assert muro_info["detalle"]["area_neta_m2"] == pytest.approx(8.88, abs=1e-6)


def test_guardar_y_reabrir_conserva_ligas_y_relaciones(tmp_path: Path) -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0, 2.6)["creados"][0]
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    nucleo.dala_crear_en_muro("DD-1 Dala de desplante 15×20", muro)
    castillo = nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 2.0)["creados"][0]
    columna = nucleo.columna_crear("C-1 Columna 30×30", nivel, 8, 0, altura=3.0)["creados"][0]
    nucleo.zapata_bajo_columna("Z-1 Zapata 1.20×1.20", columna)
    ruta = tmp_path / "o007c.ifc"
    nucleo.guardar(str(ruta))

    otro = ModeloNucleo()
    otro.abrir(str(ruta))
    liga = otro._leer_liga(otro._entidad_por_gid(castillo))
    assert liga["Muro"] == muro
    assert liga["Distancia"] == pytest.approx(2.0)
    assert otro._leer_liga(otro._entidad_por_gid(castillo))["Muro"] == muro
    relaciones = otro.modelo.by_type("IfcRelConnectsElements")
    assert len(relaciones) == 4  # castillo, cerramiento, dala y zapata
    assert otro.validar() == []


def test_acero_por_pieza_tipo_usa_largo_de_referencia() -> None:
    nucleo = _nuevo()
    tipo = next(
        t for t in nucleo.tipos_listar("IfcColumnType")
        if t["nombre"] == "C-1 Columna 30×30"
    )
    assert tipo["acero"]["kg_m"] == pytest.approx(10.912, abs=1e-9)
    assert tipo["acero"]["largo_referencia"] == pytest.approx(3.0)
    assert tipo["acero"]["total_kg"] == pytest.approx(18.624 + 14.112, abs=1e-3)
    trabe = next(
        t for t in nucleo.tipos_listar("IfcBeamType")
        if t["nombre"] == "T-1 Trabe 20×40"
    )
    assert trabe["acero"]["largo_referencia"] == pytest.approx(4.0)
    assert trabe["acero"]["kg_m"] == pytest.approx(trabe["acero"]["total_kg"] / 4.0)


def test_cerramiento_en_nivel_superior_queda_en_la_cabeza_del_muro() -> None:
    nucleo = _nuevo()
    nivel = nucleo.nivel_crear("Nivel 1", 3.0)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0, 2.6)["creados"][0]
    cerramiento = nucleo.cerramiento_crear_en_muro(
        "CE-1 Cerramiento 15×20", muro
    )["creados"][0]
    datos = _pset(nucleo, cerramiento, "OPENRVT_Estructura")
    assert datos["Z"] == pytest.approx(3.0 + 2.6 - 0.20 / 2.0)
    assert datos["Longitud"] == pytest.approx(4.0)


def test_zapata_corrida_expresa_kg_por_metro_sobre_referencia() -> None:
    nucleo = _nuevo()
    tipo = next(
        t for t in nucleo.tipos_listar("IfcFootingType")
        if t["nombre"] == "ZC-1 Zapata corrida 60"
    )
    assert tipo["acero"]["unidad"] == "kg/m"
    assert tipo["acero"]["largo_referencia"] == pytest.approx(4.0)
    assert tipo["acero"]["kg_m"] == pytest.approx(
        tipo["acero"]["total_kg"] / 4.0, abs=1e-9
    )


def test_servidor_expone_las_interacciones() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    muro = servidor.despachar("muros.crear", {
        "tipo": "Block 15", "nivel": nivel,
        "x1": 0, "y1": 0, "x2": 4, "y2": 0, "altura": 2.6,
    })["creados"][0]
    automaticos = servidor.despachar("castillos.automaticos", {
        "muros": [muro], "separacion_max": 3.0,
    })
    assert len(automaticos["creados"]) == 3
    cantidades = servidor.despachar("cantidades.estructura", {})
    assert cantidades["total"]["volumen_neto_m3"] > 0


def test_castillo_fuera_del_muro_es_error_32602() -> None:
    nucleo = _nuevo()
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 0, 4, 0)["creados"][0]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 4.5)
    assert exc.value.codigo == -32602
    assert "fuera del muro" in exc.value.mensaje
