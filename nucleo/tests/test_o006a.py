"""Pruebas de O006a: cotas que mandan entre ejes y entre niveles."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
MUESTRAS = RAIZ / "muestras"
FZK = MUESTRAS / "AC20-FZK-Haus.ifc"

sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O006a")
    return nucleo


def _ejes(nucleo: ModeloNucleo) -> dict[str, dict]:
    return {e["etiqueta"]: e for e in nucleo.ejes_listar()}


def _x(nucleo: ModeloNucleo, etiqueta: str) -> float:
    return _ejes(nucleo)[etiqueta]["x1"]


def _z_muro(nucleo: ModeloNucleo, globalid: str) -> float:
    import ifcopenshell.util.placement as placement

    muro = nucleo.modelo.by_type("IfcWall")
    elegido = next(m for m in muro if m.GlobalId == globalid)
    return float(placement.get_local_placement(elegido.ObjectPlacement)[2][3])


def _crear_retícula(nucleo: ModeloNucleo) -> list[str]:
    resultado = nucleo.ejes_crear_por_separaciones("vertical", 0, [5, 4.5, 5], 20, "1")
    assert resultado["etiquetas"] == ["1", "2", "3", "4"]
    return resultado["creados"]


def test_mover_eje_y_deshacer() -> None:
    nucleo = _nuevo()
    nucleo.ejes_crear_por_separaciones("vertical", 0, [5], 20, "1")
    assert _x(nucleo, "1") == 0.0
    nucleo.ejes_mover(_ejes(nucleo)["1"]["globalid"], 1.25)
    assert _x(nucleo, "1") == pytest.approx(1.25)
    # El eje no se acorta: solo cambia de posición.
    eje = _ejes(nucleo)["1"]
    assert eje["x2"] - eje["x1"] == pytest.approx(0.0)
    assert nucleo.deshacer()["hecho"] is True
    assert _x(nucleo, "1") == 0.0


def test_separacion_con_cadena_conserva_los_huecos() -> None:
    nucleo = _nuevo()
    _crear_retícula(nucleo)
    ejes = _ejes(nucleo)
    nucleo.ejes_separacion(ejes["1"]["globalid"], ejes["2"]["globalid"], 6.0, True)
    assert [_x(nucleo, e) for e in ("1", "2", "3", "4")] == pytest.approx(
        [0.0, 6.0, 10.5, 15.5]
    )
    assert nucleo.deshacer()["hecho"] is True
    assert [_x(nucleo, e) for e in ("1", "2", "3", "4")] == pytest.approx(
        [0.0, 5.0, 9.5, 14.5]
    )


def test_separacion_sin_cadena_solo_mueve_el_eje() -> None:
    nucleo = _nuevo()
    _crear_retícula(nucleo)
    ejes = _ejes(nucleo)
    nucleo.ejes_separacion(ejes["2"]["globalid"], ejes["3"]["globalid"], 6.0, False)
    assert [_x(nucleo, e) for e in ("1", "2", "3", "4")] == pytest.approx(
        [0.0, 5.0, 11.0, 14.5]
    )
    assert nucleo.deshacer()["hecho"] is True
    assert [_x(nucleo, e) for e in ("1", "2", "3", "4")] == pytest.approx(
        [0.0, 5.0, 9.5, 14.5]
    )


def test_separacion_entre_ejes_no_paralelos_da_error_en_español() -> None:
    nucleo = _nuevo()
    vertical = nucleo.eje_crear("1", 0, 0, 0, 20)
    horizontal = nucleo.eje_crear("A", 0, 0, 20, 0)
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.ejes_separacion(vertical["creados"][0], horizontal["creados"][0], 4.0, True)
    assert "paralelos" in exc.value.mensaje
    # Nada se movió.
    assert _x(nucleo, "1") == 0.0
    assert _ejes(nucleo)["A"]["y1"] == 0.0


def test_crear_por_separaciones_horizontal_y_etiquetas_repetidas() -> None:
    nucleo = _nuevo()
    creados = nucleo.ejes_crear_por_separaciones("horizontal", 1.5, [4, 4], 12, "A")
    assert creados["etiquetas"] == ["A", "B", "C"]
    ejes = _ejes(nucleo)
    assert [ejes[e]["y1"] for e in "ABC"] == pytest.approx([1.5, 5.5, 9.5])
    assert [ejes[e]["x2"] for e in "ABC"] == [12.0, 12.0, 12.0]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.ejes_crear_por_separaciones("horizontal", 0, [4], 12, "B")
    assert "ya existe" in exc.value.mensaje.lower()
    assert nucleo.deshacer()["hecho"] is True
    assert nucleo.ejes_listar() == []


def test_niveles_separacion_mueve_muro_y_cadena() -> None:
    nucleo = _nuevo()
    nivel0 = nucleo.niveles()[0]["globalid"]
    nucleo.nivel_crear("Nivel 1", 2.7)
    nucleo.nivel_crear("Nivel 2", 5.4)
    niveles = nucleo.niveles()
    n1 = next(n for n in niveles if n["nombre"] == "Nivel 1")
    n2 = next(n for n in niveles if n["nombre"] == "Nivel 2")
    muro = nucleo.muro_crear("Block 15", n1["globalid"], 0, 0, 5, 0, 2.6, "centro")
    z_antes = _z_muro(nucleo, muro["creados"][0])
    assert z_antes == pytest.approx(2.7)
    nucleo.niveles_separacion(nivel0, n1["globalid"], 3.0, True)
    niveles = {n["nombre"]: n["elevacion"] for n in nucleo.niveles()}
    assert niveles["Nivel 1"] == pytest.approx(3.0)
    assert niveles["Nivel 2"] == pytest.approx(5.7)
    assert _z_muro(nucleo, muro["creados"][0]) == pytest.approx(3.0)
    # Un solo paso de deshacer devuelve nivel, cadena y muro.
    assert nucleo.deshacer()["hecho"] is True
    elevaciones = {n["nombre"]: n["elevacion"] for n in nucleo.niveles()}
    assert elevaciones["Nivel 0"] == pytest.approx(0.0)
    assert elevaciones["Nivel 1"] == pytest.approx(2.7)
    assert elevaciones["Nivel 2"] == pytest.approx(5.4)
    assert _z_muro(nucleo, muro["creados"][0]) == pytest.approx(2.7)


def test_nivel_editar_mueve_los_elementos_una_sola_vez() -> None:
    nucleo = _nuevo()
    nivel0 = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear("Block 15", nivel0, 0, 0, 5, 0, 2.6, "centro")
    nucleo.nivel_editar(nivel0, elevacion=0.3)
    assert _z_muro(nucleo, muro["creados"][0]) == pytest.approx(0.3)
    nucleo.deshacer()
    assert _z_muro(nucleo, muro["creados"][0]) == pytest.approx(0.0)


def test_fzk_nivel_mueve_los_elementos_una_sola_vez() -> None:
    if not FZK.is_file():
        pytest.skip("falta muestras/AC20-FZK-Haus.ifc")
    nucleo = ModeloNucleo()
    nucleo.abrir(str(FZK))
    import ifcopenshell.util.placement as placement

    dach = next(n for n in nucleo.niveles() if n["nombre"] == "Dachgeschoss")
    muro = next(
        m
        for m in nucleo.modelo.by_type("IfcWall")
        if any(
            r.RelatingStructure.GlobalId == dach["globalid"]
            for r in m.ContainedInStructure
        )
    )
    z_antes = float(placement.get_local_placement(muro.ObjectPlacement)[2][3])
    assert z_antes == pytest.approx(2.7)
    nucleo.nivel_editar(dach["globalid"], elevacion=3.0)
    assert next(n for n in nucleo.niveles() if n["nombre"] == "Dachgeschoss")[
        "elevacion"
    ] == pytest.approx(3.0)
    assert float(placement.get_local_placement(muro.ObjectPlacement)[2][3]) == pytest.approx(
        3.0
    )


def test_guardar_y_reabrir_conserva_ejes_niveles_y_muro(tmp_path: Path) -> None:
    nucleo = _nuevo()
    nucleo.ejes_crear_por_separaciones("vertical", 0, [5, 4.5, 5], 20, "1")
    nivel1 = nucleo.nivel_crear("Nivel 1", 2.7)["creados"][0]
    muro = nucleo.muro_crear("Block 15", nivel1, 0, 0, 5, 0, 2.6, "centro")
    nucleo.niveles_separacion(nucleo.niveles()[0]["globalid"], nivel1, 3.0, True)
    destino = tmp_path / "o006a.ifc"
    nucleo.guardar(str(destino))

    otro = ModeloNucleo()
    otro.abrir(str(destino))
    assert [(n["nombre"], n["elevacion"]) for n in otro.niveles()] == [
        ("Nivel 0", 0.0),
        ("Nivel 1", 3.0),
    ]
    assert [_x(otro, e) for e in ("1", "2", "3", "4")] == pytest.approx(
        [0.0, 5.0, 9.5, 14.5]
    )
    assert _z_muro(otro, muro["creados"][0]) == pytest.approx(3.0)


def test_servidor_despacha_las_cuatro_operaciones() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC"})
    creados = servidor.despachar(
        "ejes.crear_por_separaciones",
        {
            "direccion": "vertical",
            "origen": 0,
            "separaciones": [5, 4.5, 5],
            "longitud": 20,
            "primera_etiqueta": "1",
        },
    )
    ejes = servidor.despachar("ejes.listar", {})
    servidor.despachar(
        "ejes.separacion",
        {
            "referencia": ejes[0]["globalid"],
            "mover": ejes[1]["globalid"],
            "distancia": 6,
            "cadena": True,
        },
    )
    assert [e["x1"] for e in servidor.despachar("ejes.listar", {})] == pytest.approx(
        [0.0, 6.0, 10.5, 15.5]
    )
    servidor.despachar("ejes.mover", {"globalid": creados["creados"][0], "desplazamiento": 1})
    assert servidor.despachar("ejes.listar", {})[0]["x1"] == pytest.approx(1.0)
    nivel1 = servidor.despachar("niveles.crear", {"nombre": "Nivel 1", "elevacion": 2.7})
    servidor.despachar(
        "niveles.separacion",
        {
            "inferior": servidor.despachar("modelo.niveles", {})[0]["globalid"],
            "superior": nivel1["creados"][0],
            "altura": 3,
            "cadena": True,
        },
    )
    assert servidor.despachar("modelo.niveles", {})[1]["elevacion"] == pytest.approx(3.0)
