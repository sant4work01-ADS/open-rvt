"""O063 punto 3: un comando mutador que falla no deja basura en el modelo."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _gids(modelo) -> list[str]:
    return sorted(e.GlobalId for e in modelo.modelo.by_type("IfcElement"))


def test_un_muro_que_falla_a_la_mitad_se_revierte_y_no_ensucia_deshacer(monkeypatch):
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "Rollback O063"})
    nucleo = servidor.modelo
    antes = _gids(nucleo)
    nivel = nucleo.niveles()[0]["globalid"]
    assert nucleo._deshacer == []

    def falla(_muro):
        raise RuntimeError("falla simulada al construir el cuerpo del muro")

    monkeypatch.setattr(nucleo, "_cuerpo_muro", falla)
    with pytest.raises(RuntimeError, match="falla simulada"):
        servidor.despachar(
            "muros.crear",
            {
                "tipo": nucleo.tipos_listar("IfcWallType")[0]["nombre"],
                "nivel": nivel,
                "x1": 0.0,
                "y1": 0.0,
                "x2": 4.0,
                "y2": 0.0,
                "altura": 2.6,
            },
        )

    assert _gids(nucleo) == antes, "el muro a medio crear no debe quedar en el modelo"
    assert nucleo._deshacer == [], "el paso fallido no debe quedar en el historial"
    assert nucleo.deshacer() == {"hecho": False, "motivo": "No hay nada que deshacer."}


def test_con_el_historial_lleno_un_comando_que_falla_no_pierde_ni_ensucia_pasos(
    monkeypatch,
):
    """O063: el rollback no depende de que el historial crezca.

    Con 50 pasos (MAX_HISTORIAL) ya hechos, la instantánea del comando fallido
    desplaza a la más vieja, así que la longitud no aumenta. El modelo debe
    quedar igual y el historial debe conservar exactamente los mismos 50 textos
    que había antes.
    """
    from openrvt_nucleo.modelo import MAX_HISTORIAL

    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "Historial lleno O063"})
    nucleo = servidor.modelo
    for i in range(MAX_HISTORIAL):
        servidor.despachar("notas.crear", {"texto": f"nota {i}", "x": 0, "y": 0, "z": 0})
    assert len(nucleo._deshacer) == MAX_HISTORIAL
    historial_antes = list(nucleo._deshacer)
    antes = sorted(e.GlobalId for e in nucleo.modelo.by_type("IfcRoot"))
    nivel = nucleo.niveles()[0]["globalid"]

    def falla(_muro):
        raise RuntimeError("falla simulada con el historial lleno")

    monkeypatch.setattr(nucleo, "_cuerpo_muro", falla)
    with pytest.raises(RuntimeError, match="historial lleno"):
        servidor.despachar(
            "muros.crear",
            {
                "tipo": nucleo.tipos_listar("IfcWallType")[0]["nombre"],
                "nivel": nivel,
                "x1": 0.0,
                "y1": 0.0,
                "x2": 4.0,
                "y2": 0.0,
                "altura": 2.6,
            },
        )

    despues = sorted(e.GlobalId for e in nucleo.modelo.by_type("IfcRoot"))
    assert despues == antes, "el muro a medio crear no debe quedar en el modelo"
    assert len(nucleo._deshacer) == MAX_HISTORIAL
    assert nucleo._deshacer == historial_antes, "los 50 pasos previos deben seguir intactos"
