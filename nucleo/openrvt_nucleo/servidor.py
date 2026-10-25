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

ERROR_IMPORTACION: str | None = None

try:  # El fallo de importación se informa como error de comando, no tumba el proceso.
    from .modelo import ErrorNucleo, ModeloNucleo
except Exception as exc:  # pragma: no cover - depende del entorno
    ERROR_IMPORTACION = str(exc)
    LOG.critical("no se pudo importar IfcOpenShell: %s", exc)
    ModeloNucleo = None  # type: ignore[assignment]

    class ErrorNucleo(Exception):  # type: ignore[no-redef]
        def __init__(self, mensaje: str, codigo: int = -32000):
            super().__init__(mensaje)
            self.mensaje = mensaje
            self.codigo = codigo


def _sin_modelo() -> ErrorNucleo:
    detalle = f" ({ERROR_IMPORTACION})" if ERROR_IMPORTACION else ""
    return ErrorNucleo(
        f"Núcleo IFC no disponible: falta IfcOpenShell en el intérprete de Python.{detalle}",
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
        if metodo == "nucleo.ping":
            if self.modelo is None:
                return {
                    "disponible": False,
                    "detalle": (
                        "falta IfcOpenShell en el intérprete de Python"
                        + (f": {ERROR_IMPORTACION}" if ERROR_IMPORTACION else "")
                    ),
                }
            import ifcopenshell

            import platform

            return {
                "disponible": True,
                "ifcopenshell": getattr(ifcopenshell, "version", "desconocida"),
                "python": platform.python_version(),
            }
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
        if metodo == "estilos.leer":
            return self._exigir().leer_estilos()
        if metodo == "estilos.guardar":
            return self._exigir().guardar_estilos(
                params.get("estilos", params.get("datos"))
            )
        if metodo == "niveles.crear":
            return self._exigir().nivel_crear(
                str(params.get("nombre") or ""), params.get("elevacion", 0.0)
            )
        if metodo == "niveles.editar":
            return self._exigir().nivel_editar(
                str(params.get("globalid") or ""),
                params.get("nombre"),
                params.get("elevacion"),
            )
        if metodo == "niveles.borrar":
            return self._exigir().nivel_borrar(str(params.get("globalid") or ""))
        if metodo == "niveles.separacion":
            return self._exigir().niveles_separacion(
                str(params.get("inferior") or ""),
                str(params.get("superior") or ""),
                params.get("altura", 0.0),
                bool(params.get("cadena", True)),
            )
        if metodo == "ejes.crear":
            return self._exigir().eje_crear(
                str(params.get("etiqueta") or ""),
                params.get("x1", 0.0),
                params.get("y1", 0.0),
                params.get("x2", 0.0),
                params.get("y2", 0.0),
            )
        if metodo == "ejes.crear_por_separaciones":
            return self._exigir().ejes_crear_por_separaciones(
                str(params.get("direccion") or "vertical"),
                params.get("origen", 0.0),
                params.get("separaciones"),
                params.get("longitud", 0.0),
                str(params.get("primera_etiqueta") or ""),
                str(params.get("modo") or "origen"),
                params.get("rebase", 1.5),
            )
        if metodo == "ejes.crear_reticula":
            return self._exigir().ejes_crear_reticula(
                params.get("vertical"),
                params.get("horizontal"),
                str(params.get("modo") or "rebase"),
                params.get("rebase", 1.5),
            )
        if metodo == "ejes.reticula":
            return self._exigir().ejes_reticula()
        if metodo == "ejes.rebase":
            return self._exigir().ejes_rebase(params.get("rebase", 1.5))
        if metodo == "ejes.mover":
            return self._exigir().ejes_mover(
                str(params.get("globalid") or ""), params.get("desplazamiento", 0.0)
            )
        if metodo == "ejes.separacion":
            return self._exigir().ejes_separacion(
                str(params.get("referencia") or ""),
                str(params.get("mover") or ""),
                params.get("distancia", 0.0),
                bool(params.get("cadena", True)),
            )
        if metodo == "ejes.editar":
            return self._exigir().eje_editar(
                str(params.get("globalid") or ""), str(params.get("etiqueta") or "")
            )
        if metodo == "ejes.borrar":
            return self._exigir().eje_borrar(str(params.get("globalid") or ""))
        if metodo == "ejes.listar":
            return self._exigir().ejes_listar()
        if metodo == "tipos.listar":
            return self._exigir().tipos_listar(str(params.get("clase") or "IfcWallType"))
        if metodo == "muros.crear":
            return self._exigir().muro_crear(
                str(params.get("tipo") or ""),
                str(params.get("nivel") or ""),
                params.get("x1", 0.0),
                params.get("y1", 0.0),
                params.get("x2", 0.0),
                params.get("y2", 0.0),
                params.get("altura", 2.60),
                str(params.get("alineacion") or "centro"),
            )
        if metodo == "losas.crear":
            return self._exigir().losa_crear(
                str(params.get("nivel") or ""),
                params.get("puntos"),
                params.get("espesor", 0.12),
                params.get("desfase", 0.0),
            )
        if metodo == "losas.desde_muros":
            return self._exigir().losa_desde_muros(
                str(params.get("nivel") or ""), params.get("globalids")
            )
        if metodo == "aberturas.crear":
            return self._exigir().abertura_crear(
                str(params.get("clase") or "IfcDoor"),
                str(params.get("muro") or ""),
                params.get("distancia", 0.0),
                params.get("ancho"),
                params.get("alto"),
                params.get("antepecho"),
                bool(params.get("volteado", False)),
            )
        if metodo == "elementos.mover":
            return self._exigir().elementos_mover(
                params.get("globalids"),
                params.get("dx", 0.0),
                params.get("dy", 0.0),
                params.get("dz", 0.0),
            )
        if metodo == "elementos.borrar":
            return self._exigir().elementos_borrar(params.get("globalids"))
        if metodo == "elementos.copiar":
            return self._exigir().elementos_copiar(
                params.get("globalids"),
                params.get("dx", 0.0),
                params.get("dy", 0.0),
                params.get("dz", 0.0),
            )
        if metodo == "elementos.editar":
            return self._exigir().elemento_editar(
                str(params.get("globalid") or ""), params.get("cambios")
            )
        if metodo == "proyecto.validar":
            return self._exigir().validar()
        if metodo == "modelo.referencias":
            return self._exigir().referencias()
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
                "error": {
                    "code": exc.codigo,
                    "message": exc.mensaje,
                    # O006c: la interfaz muestra y exporta la traza completa.
                    "data": {"traza": traceback.format_exc()},
                },
            }
        except Exception as exc:  # el núcleo nunca se cae por un comando
            traza = traceback.format_exc()
            LOG.error("fallo en %s:\n%s", metodo, traza)
            return {
                "jsonrpc": "2.0",
                "id": identificador,
                "error": {
                    "code": -32603,
                    "message": f"Error interno del núcleo IFC: {exc}",
                    "data": {"traza": traza},
                },
            }


def main() -> int:
    # El puente Rust lee y escribe UTF-8; en Windows las tuberías serían cp1252.
    for flujo in (sys.stdin, sys.stdout, sys.stderr):
        flujo.reconfigure(encoding="utf-8")
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
