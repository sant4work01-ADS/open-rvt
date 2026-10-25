"""Pruebas del núcleo IFC (pytest).

Las muestras se bajan con ``./herramientas/bajar_muestras.sh``; si no están, las pruebas
que dependen de ellas se saltan para no dar un falso negativo.
"""

from __future__ import annotations

import base64
import json
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
MUESTRAS = RAIZ / "muestras"
FZK = MUESTRAS / "AC20-FZK-Haus.ifc"

sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _exigir_fzk() -> Path:
    if not FZK.is_file():
        pytest.skip("falta muestras/AC20-FZK-Haus.ifc (./herramientas/bajar_muestras.sh)")
    return FZK


def test_nuevo_guardar_y_abrir_conserva_nivel_y_unidades(tmp_path: Path):
    nucleo = ModeloNucleo()
    info = nucleo.nuevo("Casa de prueba")
    assert info["esquema"] == "IFC4"
    assert info["con_cambios"] is True
    niveles = nucleo.niveles()
    assert [(n["nombre"], n["elevacion"]) for n in niveles] == [("Nivel 0", 0.0)]

    destino = tmp_path / "nuevo.ifc"
    guardado = nucleo.guardar(str(destino))
    assert guardado["ruta"] == str(destino.resolve())
    assert guardado["con_cambios"] is False

    otro = ModeloNucleo()
    abierto = otro.abrir(str(destino))
    assert abierto["esquema"] == "IFC4"
    assert abierto["con_cambios"] is False
    assert [(n["nombre"], n["elevacion"]) for n in otro.niveles()] == [("Nivel 0", 0.0)]
    unidades = {
        u.Name for u in otro.modelo.by_type("IfcSIUnit") if getattr(u, "Name", None)
    }
    assert {"METRE", "SQUARE_METRE", "CUBIC_METRE"} <= unidades


def test_fzk_haus_niveles_y_conteos_como_o001():
    nucleo = ModeloNucleo()
    nucleo.abrir(str(_exigir_fzk()))
    assert [(n["nombre"], n["elevacion"]) for n in nucleo.niveles()] == [
        ("Erdgeschoss", 0.0),
        ("Dachgeschoss", 2.7),
    ]
    por_clase = nucleo.info()["por_clase"]
    assert {
        clase: por_clase.get(clase, 0)
        for clase in (
            "IfcBeam",
            "IfcDoor",
            "IfcSlab",
            "IfcStair",
            "IfcWallStandardCase",
            "IfcWindow",
        )
    } == {
        "IfcBeam": 4,
        "IfcDoor": 5,
        "IfcSlab": 4,
        "IfcStair": 1,
        "IfcWallStandardCase": 13,
        "IfcWindow": 11,
    }
    assert nucleo.info()["elementos"] == 38 + 42 + 2  # elementos + miembros + barandillas


def test_fzk_haus_teselado_igual_a_o001():
    nucleo = ModeloNucleo()
    nucleo.abrir(str(_exigir_fzk()))
    resultado = nucleo.teselar()
    # O001 (motor A, IfcOpenShell) midió 24 168 triángulos en todo el modelo.
    assert abs(resultado["triangulos"] - 24168) <= 24168 * 0.01
    assert len(resultado["elementos"]) > 0
    for elemento in resultado["elementos"][:5]:
        vertices = base64.b64decode(elemento["vertices"])
        indices = base64.b64decode(elemento["indices"])
        assert len(vertices) % 12 == 0  # float32 × 3
        assert len(indices) % 12 == 0  # uint32 × 3
        assert len(vertices) > 0 and len(indices) > 0
        assert elemento["color"].startswith("#")
        assert elemento["categoria"] in {
            "muros",
            "losas",
            "columnas",
            "vigas",
            "puertas",
            "ventanas",
            "cubiertas",
            "escaleras",
            "otros",
        }

    # El filtro devuelve solo los GlobalId pedidos.
    primero = resultado["elementos"][0]["globalid"]
    filtrado = nucleo.teselar([primero])
    assert [e["globalid"] for e in filtrado["elementos"]] == [primero]


def test_vistas_se_recuperan_al_reabrir(tmp_path: Path):
    nucleo = ModeloNucleo()
    nucleo.abrir(str(_exigir_fzk()))
    assert nucleo.leer_vistas() == []
    vistas = [
        {
            "id": "v1",
            "nombre": "Planta Erdgeschoss",
            "tipo": "planta",
            "nivel": "2eyxpyOx95m90jmsXLOuR0",
            "alturaPlano": 1.2,
            "profundidad": -1.0,
            "nivelesVisibles": ["2eyxpyOx95m90jmsXLOuR0"],
            "categorias": {"muros": True, "ventanas": False},
            "estilo": "aristas",
            "escala": 100,
        },
        {
            "id": "c1",
            "nombre": "Corte A",
            "tipo": "corte",
            "puntoA": [0.0, 0.0],
            "puntoB": [10.0, 0.0],
            "direccion": [0.0, 1.0],
            "profundidad": 10.0,
            "alturaPlano": 1.2,
            "nivelesVisibles": [],
            "categorias": {"muros": True},
            "estilo": "sombreado",
            "escala": 50,
        },
    ]
    nucleo.guardar_vistas(vistas)
    assert nucleo.info()["con_cambios"] is True

    destino = tmp_path / "vistas.ifc"
    nucleo.guardar(str(destino))
    otro = ModeloNucleo()
    otro.abrir(str(destino))
    assert otro.leer_vistas() == vistas


def test_historial_deshacer_y_rehacer_vistas():
    nucleo = ModeloNucleo()
    nucleo.abrir(str(_exigir_fzk()))
    nucleo.guardar_vistas([{"id": "v1", "nombre": "Planta", "tipo": "planta"}])
    assert nucleo.leer_vistas()[0]["id"] == "v1"
    assert nucleo.deshacer()["hecho"] is True
    assert nucleo.leer_vistas() == []
    assert nucleo.rehacer()["hecho"] is True
    assert nucleo.leer_vistas()[0]["id"] == "v1"
    assert nucleo.deshacer()["hecho"] is True
    assert nucleo.deshacer()["hecho"] is False


def test_propiedades_incluyen_psets_y_material():
    nucleo = ModeloNucleo()
    nucleo.abrir(str(_exigir_fzk()))
    muro = next(e for e in nucleo.elementos() if e["clase"] == "IfcWallStandardCase")
    propiedades = nucleo.propiedades(muro["globalid"])
    assert propiedades["globalid"] == muro["globalid"]
    assert propiedades["clase"] == "IfcWallStandardCase"
    assert propiedades["nivel"] == "Erdgeschoss"
    assert "Pset_WallCommon" in propiedades["psets"]
    assert propiedades["materiales"]
    assert propiedades["materiales"][0]["nombre"] == "Leichtbeton 102890359"


def test_metodo_y_ruta_inexistentes_no_tumban_el_servidor():
    proceso = subprocess.Popen(
        [sys.executable, "-m", "openrvt_nucleo.servidor"],
        cwd=str(RAIZ / "nucleo"),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert proceso.stdin is not None and proceso.stdout is not None
    peticiones = [
        {"jsonrpc": "2.0", "id": 1, "method": "no.existe", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "proyecto.abrir",
            "params": {"ruta": "/ruta/que/no/existe.ifc"},
        },
        {"jsonrpc": "2.0", "id": 3, "method": "proyecto.nuevo", "params": {"nombre": "Sigue"}},
        {"jsonrpc": "2.0", "id": 4, "method": "modelo.niveles", "params": {}},
    ]
    for peticion in peticiones:
        proceso.stdin.write(json.dumps(peticion) + "\n")
    proceso.stdin.flush()
    respuestas = [json.loads(proceso.stdout.readline()) for _ in peticiones]
    proceso.stdin.close()
    proceso.wait(timeout=10)

    assert respuestas[0]["error"]["code"] == -32601
    assert "desconocido" in respuestas[0]["error"]["message"]
    assert respuestas[1]["error"]["code"] == -32002
    assert "No existe el archivo" in respuestas[1]["error"]["message"]
    assert respuestas[2]["result"]["nombre"] == "Sigue"
    assert respuestas[3]["result"][0]["nombre"] == "Nivel 0"
    assert proceso.returncode == 0
