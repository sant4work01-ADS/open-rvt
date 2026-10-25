"""Servidor JSON-RPC 2.0 del núcleo IFC.

Un mensaje JSON por línea en stdin y una respuesta por línea en stdout. Los registros
van siempre a stderr: stdout está reservado al protocolo.
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
from typing import Any

LOG = logging.getLogger("openrvt_nucleo")

try:  # El fallo de importación se informa como error de comando, no tumba el proceso.
    from .modelo import ErrorNucleo, ModeloNucleo
except Exception as exc:  # pragma: no cover - depende del entorno
    LOG.critical("no se pudo importar IfcOpenShell: %s", exc)
    ModeloNucleo = None  # type: ignore[assignment]

    class ErrorNucleo(Exception):  # type: ignore[no-redef]
        def __init__(self, mensaje: str, codigo: int = -32000):
            super().__init__(mensaje)
            self.mensaje = mensaje
            self.codigo = codigo


def _sin_modelo() -> ErrorNucleo:
    return ErrorNucleo(
        "Núcleo IFC no disponible: falta IfcOpenShell en el intérprete de Python.",
        -32010,
    )


def _params(params: Any) -> dict[str, Any]:
    if params is None:
        return {}
    if not isinstance(params, dict):
        raise ErrorNucleo("Los parámetros deben ser un objeto JSON.", -32602)
    return params


class Servidor:
    def __init__(self) -> None:
        self.modelo = ModeloNucleo() if ModeloNucleo is not None else None

    def _exigir(self) -> Any:
        if self.modelo is None:
            raise _sin_modelo()
        return self.modelo

    def despachar(self, metodo: str, params: dict[str, Any]) -> Any:
        if metodo == "proyecto.nuevo":
            return self._exigir().nuevo(str(params.get("nombre") or "Modelo sin título"))
        if metodo == "proyecto.abrir":
            return self._exigir().abrir(str(params.get("ruta") or ""))
        if metodo == "proyecto.guardar":
            ruta = params.get("ruta")
            return self._exigir().guardar(str(ruta) if ruta else None)
        if metodo == "proyecto.info":
            return self._exigir().info()
        if metodo == "modelo.niveles":
            return self._exigir().niveles()
        if metodo == "modelo.elementos":
            return self._exigir().elementos(params.get("filtro"))
        if metodo == "modelo.propiedades":
            return self._exigir().propiedades(str(params.get("globalid") or ""))
        if metodo == "geometria.teselar":
            return self._exigir().teselar(params.get("globalids"))
        if metodo == "vistas.leer":
            return self._exigir().leer_vistas()
        if metodo == "vistas.guardar":
            return self._exigir().guardar_vistas(params.get("lista", params.get("vistas")))
        if metodo == "historial.deshacer":
            return self._exigir().deshacer()
        if metodo == "historial.rehacer":
            return self._exigir().rehacer()
        raise ErrorNucleo(f"Método desconocido: {metodo}", -32601)

    def responder(self, linea: str) -> dict[str, Any] | None:
        try:
            solicitud = json.loads(linea)
        except json.JSONDecodeError as exc:
            return {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"JSON no válido: {exc.msg}"},
            }
        if not isinstance(solicitud, dict) or solicitud.get("jsonrpc") != "2.0":
            return {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32600, "message": "Solicitud JSON-RPC no válida."},
            }
        identificador = solicitud.get("id")
        metodo = solicitud.get("method")
        if not isinstance(metodo, str) or not metodo:
            return {
                "jsonrpc": "2.0",
                "id": identificador,
                "error": {"code": -32600, "message": "Falta el método."},
            }
        try:
            params = _params(solicitud.get("params"))
            resultado = self.despachar(metodo, params)
            if identificador is None:
                return None  # notificación: no se responde
            return {"jsonrpc": "2.0", "id": identificador, "result": resultado}
        except ErrorNucleo as exc:
            LOG.info("error de comando %s: %s", metodo, exc.mensaje)
            return {
                "jsonrpc": "2.0",
                "id": identificador,
                "error": {"code": exc.codigo, "message": exc.mensaje},
            }
        except Exception as exc:  # el núcleo nunca se cae por un comando
            LOG.error("fallo en %s:\n%s", metodo, traceback.format_exc())
            return {
                "jsonrpc": "2.0",
                "id": identificador,
                "error": {
                    "code": -32603,
                    "message": f"Error interno del núcleo IFC: {exc}",
                },
            }


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    servidor = Servidor()
    for linea in sys.stdin:
        if not linea.strip():
            continue
        respuesta = servidor.responder(linea)
        if respuesta is None:
            continue
        try:
            sys.stdout.write(json.dumps(respuesta, ensure_ascii=False, separators=(",", ":")))
            sys.stdout.write("\n")
            sys.stdout.flush()
        except BrokenPipeError:
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
