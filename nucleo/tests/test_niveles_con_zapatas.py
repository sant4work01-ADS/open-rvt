"""Editar o borrar un nivel con zapatas (restricción sin NivelTope) no truena."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _con_zapata() -> tuple[ModeloNucleo, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("niveles-zapatas")
    nivel = nucleo.niveles()[0]["globalid"]
    zapata = nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel, 0.0, 0.0, desplante=1.00)
    return nucleo, nivel, zapata["creados"][0]


def test_editar_elevacion_y_nombre_del_nivel_con_zapata() -> None:
    nucleo, nivel, _ = _con_zapata()
    nucleo.nivel_editar(nivel, elevacion=0.30)
    nucleo.nivel_editar(nivel, nombre="Planta baja")
    dato = next(n for n in nucleo.niveles() if n["globalid"] == nivel)
    assert dato["elevacion"] == pytest.approx(0.30)
    assert dato["nombre"] == "Planta baja"


def test_editar_otro_nivel_con_zapata_en_el_modelo() -> None:
    nucleo, _, _ = _con_zapata()
    nucleo.nivel_crear("Azotea", 6.0)
    for n in nucleo.niveles():
        nucleo.nivel_editar(n["globalid"], elevacion=float(n["elevacion"]) + 0.10)


def test_borrar_nivel_vacio_con_zapata_en_otro_nivel() -> None:
    nucleo, _, _ = _con_zapata()
    azotea = nucleo.nivel_crear("Azotea", 6.0)
    gid = next(n["globalid"] for n in nucleo.niveles() if n["nombre"] == "Azotea")
    nucleo.nivel_borrar(gid)
    assert all(n["nombre"] != "Azotea" for n in nucleo.niveles())
    assert azotea
