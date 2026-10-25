"""Pruebas de O006d: retícula en ambos sentidos con rebase y ejes sueltos."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O006d")
    return nucleo


def _ejes(nucleo: ModeloNucleo) -> dict[str, dict]:
    return {e["etiqueta"]: e for e in nucleo.ejes_listar()}


def _largo(eje: dict) -> float:
    return ((eje["x2"] - eje["x1"]) ** 2 + (eje["y2"] - eje["y1"]) ** 2) ** 0.5


def _reticula(nucleo: ModeloNucleo) -> dict:
    return nucleo.ejes_crear_reticula(
        {"separaciones": [5, 4.5, 5], "primera_etiqueta": "1"},
        {"separaciones": [4, 4], "primera_etiqueta": "A"},
        "rebase",
        1.5,
    )


def test_reticula_en_ambos_sentidos_rebasa_la_familia_opuesta() -> None:
    nucleo = _nuevo()
    resultado = _reticula(nucleo)
    assert resultado["etiquetas"] == ["1", "2", "3", "4", "A", "B", "C"]
    assert resultado["modo"] == "rebase"
    ejes = _ejes(nucleo)
    for etiqueta in ("1", "2", "3", "4"):
        assert _largo(ejes[etiqueta]) == pytest.approx(11.0)
        assert ejes[etiqueta]["y1"] == pytest.approx(-1.5)
        assert ejes[etiqueta]["y2"] == pytest.approx(9.5)
    for etiqueta in ("A", "B", "C"):
        assert _largo(ejes[etiqueta]) == pytest.approx(17.5)
        assert ejes[etiqueta]["x1"] == pytest.approx(-1.5)
        assert ejes[etiqueta]["x2"] == pytest.approx(16.0)
    # El rebase se guarda en el pset del IfcGrid y se lee para las cotas.
    assert nucleo.ejes_reticula() == {"modo": "rebase", "rebase": pytest.approx(1.5)}
    grid = nucleo.modelo.by_type("IfcGrid")[0]
    assert nucleo._leer_pset(grid, "OPENRVT_Reticula") == {
        "Modo": "rebase",
        "Rebase": 1.5,
    }


def test_cambiar_una_separacion_recalcula_los_extremos() -> None:
    nucleo = _nuevo()
    _reticula(nucleo)
    ejes = _ejes(nucleo)
    # Separación por cotas: mueve 3 y 4, la familia vertical conserva sus 11 m.
    nucleo.ejes_separacion(ejes["2"]["globalid"], ejes["3"]["globalid"], 6.0, True)
    assert _largo(_ejes(nucleo)["1"]) == pytest.approx(11.0)
    # Mover C dos metros cambia el extremo de todos los verticales: 8 + 2 + 3 = 13.
    ejes = _ejes(nucleo)
    nucleo.ejes_mover(ejes["C"]["globalid"], -2.0)
    ejes = _ejes(nucleo)
    assert ejes["C"]["y1"] == pytest.approx(10.0)
    for etiqueta in ("1", "2", "3", "4"):
        assert _largo(ejes[etiqueta]) == pytest.approx(13.0)
        assert ejes[etiqueta]["y2"] == pytest.approx(11.5)
    # Los horizontales también se recalculan con las posiciones verticales actuales.
    for etiqueta in ("A", "B", "C"):
        assert ejes[etiqueta]["x1"] == pytest.approx(-1.5)
        assert ejes[etiqueta]["x2"] == pytest.approx(17.5)


def test_cambiar_el_rebase_recalcula_los_extremos() -> None:
    nucleo = _nuevo()
    _reticula(nucleo)
    nucleo.ejes_rebase(2.0)
    assert nucleo.ejes_reticula()["rebase"] == pytest.approx(2.0)
    ejes = _ejes(nucleo)
    for etiqueta in ("1", "2", "3", "4"):
        assert _largo(ejes[etiqueta]) == pytest.approx(12.0)
    assert nucleo.deshacer()["hecho"] is True
    assert nucleo.ejes_reticula()["rebase"] == pytest.approx(1.5)
    assert _largo(_ejes(nucleo)["1"]) == pytest.approx(11.0)


def test_una_sola_familia_usa_el_modo_origen() -> None:
    nucleo = _nuevo()
    resultado = nucleo.ejes_crear_reticula(
        {"separaciones": [5, 4], "origen": 2, "longitud": 10, "primera_etiqueta": "1"},
        None,
        "rebase",
        1.5,
    )
    assert resultado["modo"] == "origen"
    ejes = _ejes(nucleo)
    assert [ejes[e]["x1"] for e in ("1", "2", "3")] == pytest.approx([2.0, 7.0, 11.0])
    assert _largo(ejes["1"]) == pytest.approx(10.0)


def test_dos_familias_en_modo_origen_respetan_origen_y_longitud() -> None:
    nucleo = _nuevo()
    nucleo.ejes_crear_reticula(
        {"separaciones": [5], "origen": 2, "longitud": 10, "primera_etiqueta": "1"},
        {"separaciones": [4], "origen": 1, "longitud": 8, "primera_etiqueta": "A"},
        "origen",
        1.5,
    )
    ejes = _ejes(nucleo)
    assert (ejes["1"]["x1"], ejes["1"]["y1"], ejes["1"]["y2"]) == (2.0, 0.0, 10.0)
    assert (ejes["A"]["y1"], ejes["A"]["x1"], ejes["A"]["x2"]) == (1.0, 0.0, 8.0)


def test_bloques_vacios_y_etiquetas_repetidas() -> None:
    nucleo = _nuevo()
    with pytest.raises(Exception) as exc:
        nucleo.ejes_crear_reticula(None, {"separaciones": []}, "rebase", 1.5)
    assert "familia" in str(exc.value)
    nucleo.ejes_crear_reticula(
        {"separaciones": [5], "primera_etiqueta": "1"}, None, "rebase", 1.5
    )
    with pytest.raises(Exception) as exc:
        nucleo.ejes_crear_reticula(
            {"separaciones": [4], "primera_etiqueta": "1"}, None, "rebase", 1.5
        )
    assert "ya existe" in str(exc.value).lower()
