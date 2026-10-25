"""O006c: la bitácora necesita la traza de Python en cada error JSON-RPC."""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo import servidor  # noqa: E402


def _respuesta(monkeypatch, metodo: str) -> dict:
    class ModeloQueFalla:
        def metodo_que_falla(self):
            raise RuntimeError("fallo de prueba O006c")

    monkeypatch.setattr(servidor, "ModeloNucleo", lambda: ModeloQueFalla())
    monkeypatch.setattr(
        servidor.Servidor,
        "despachar",
        lambda self, metodo, params: self.modelo.metodo_que_falla(),
    )
    srv = servidor.Servidor()
    return srv.responder(
        '{"jsonrpc": "2.0", "id": 7, "method": "prueba.falla", "params": {}}'
    )


def test_error_inesperado_lleva_traza_de_python(monkeypatch):
    respuesta = _respuesta(monkeypatch, "prueba.falla")
    assert respuesta["id"] == 7
    error = respuesta["error"]
    assert error["code"] == -32603
    assert "fallo de prueba O006c" in error["message"]
    traza = error["data"]["traza"]
    assert "Traceback (most recent call last)" in traza
    assert "RuntimeError: fallo de prueba O006c" in traza
    assert "metodo_que_falla" in traza


def test_error_controlado_tambien_lleva_traza(monkeypatch):
    monkeypatch.setattr(
        servidor.Servidor,
        "despachar",
        lambda self, metodo, params: (_ for _ in ()).throw(
            servidor.ErrorNucleo("No se pudo crear el eje.", -32027)
        ),
    )
    respuesta = servidor.Servidor().responder(
        '{"jsonrpc": "2.0", "id": 8, "method": "ejes.crear", "params": {}}'
    )
    error = respuesta["error"]
    assert error["message"] == "No se pudo crear el eje."
    assert "Traceback (most recent call last)" in error["data"]["traza"]
    assert "No se pudo crear el eje." in error["data"]["traza"]
