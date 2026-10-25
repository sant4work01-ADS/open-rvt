"""Pruebas de estilos de dibujo de O005 (OPENRVT_Estilos)."""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402

ESTILOS = {
    "categorias": {
        "muros": {"corte": 0.7, "proyeccion": 0.18, "color": "#1f2328", "patron": "continua"},
        "arriba-corte": {"corte": None, "proyeccion": 0.13, "color": "#4b5563", "patron": "discontinua-larga"},
    },
    "materiales": {"block": {"patron": "diagonal", "escala": 2}},
}


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("Estilos O005")
    return nucleo


def test_estilos_vacios_devuelve_none() -> None:
    assert _nuevo().leer_estilos() is None


def test_guardar_y_leer_estilos_round_trip() -> None:
    nucleo = _nuevo()
    nucleo.guardar_estilos(ESTILOS)
    assert nucleo.leer_estilos() == ESTILOS
    # El pset se llama OPENRVT_Estilos, como pide la spec.
    proyecto = nucleo.modelo.by_type("IfcProject")[0]
    nombres = [
        rel.RelatingPropertyDefinition.Name
        for rel in proyecto.IsDefinedBy
        if rel.is_a("IfcRelDefinesByProperties")
    ]
    assert "OPENRVT_Estilos" in nombres


def test_guardar_estilos_se_puede_deshacer() -> None:
    nucleo = _nuevo()
    nucleo.guardar_estilos(ESTILOS)
    assert nucleo.leer_estilos() == ESTILOS
    resultado = nucleo.deshacer()
    assert resultado["hecho"] is True
    assert nucleo.leer_estilos() is None


def test_servidor_despacha_estilos() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC"})
    servidor.despachar("estilos.guardar", {"estilos": ESTILOS})
    assert servidor.despachar("estilos.leer", {}) == ESTILOS
