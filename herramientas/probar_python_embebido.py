#!/usr/bin/env python3
"""Comprueba un intérprete de Python embebido hablando JSON-RPC por stdin.

Uso: probar_python_embebido.py <python> <archivo.ifc de salida>

Arranca `python -m openrvt_nucleo.servidor` (el mismo comando que usa la app),
hace ping, crea un proyecto y un muro, guarda, reabre y tesela el muro. Cada
comprobación falla con SystemExit si el resultado no es el esperado.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

PYTHON = sys.argv[1]
SALIDA = sys.argv[2]
# Al probar un python.exe de Windows desde WSL la ruta es de Windows y no se
# puede comprobar con las funciones de archivo de Linux.
ES_WINDOWS = bool(re.match(r"^[A-Za-z]:[\\/]", SALIDA))
SALIDA_LOCAL = None if ES_WINDOWS else os.path.abspath(SALIDA)


class Servidor:
    def __init__(self, programa: str) -> None:
        entorno = os.environ.copy()
        entorno["PYTHONUNBUFFERED"] = "1"
        self.proceso = subprocess.Popen(
            [programa, "-u", "-m", "openrvt_nucleo.servidor"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=entorno,
        )
        self.id = 0

    def llamar(self, metodo: str, params: dict | None = None):
        self.id += 1
        solicitud = {
            "jsonrpc": "2.0",
            "id": self.id,
            "method": metodo,
            "params": params or {},
        }
        assert self.proceso.stdin and self.proceso.stdout
        self.proceso.stdin.write(json.dumps(solicitud) + "\n")
        self.proceso.stdin.flush()
        linea = self.proceso.stdout.readline()
        if not linea:
            error = self.proceso.stderr.read() if self.proceso.stderr else ""
            raise SystemExit(f"el servidor terminó sin responder a {metodo}: {error}")
        respuesta = json.loads(linea)
        if respuesta.get("id") != self.id:
            raise SystemExit(f"respuesta con id incorrecto para {metodo}: {respuesta}")
        if "error" in respuesta:
            raise SystemExit(f"error del núcleo en {metodo}: {respuesta['error']}")
        return respuesta["result"]

    def cerrar(self) -> None:
        if self.proceso.stdin:
            self.proceso.stdin.close()
        try:
            self.proceso.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proceso.kill()


def exigir(condicion: bool, mensaje: str) -> None:
    if not condicion:
        raise SystemExit(f"FALLO: {mensaje}")


def main() -> int:
    if SALIDA_LOCAL:
        try:
            os.unlink(SALIDA_LOCAL)
        except FileNotFoundError:
            pass
    servidor = Servidor(PYTHON)
    try:
        ping = servidor.llamar("nucleo.ping")
        exigir(ping.get("disponible") is True, f"ping no disponible: {ping}")
        exigir(
            ping.get("ifcopenshell") == "0.9.0.post1",
            f"versión de IfcOpenShell inesperada: {ping.get('ifcopenshell')}",
        )

        nuevo = servidor.llamar("proyecto.nuevo", {"nombre": "Casa embebida"})
        exigir(nuevo.get("esquema") == "IFC4", f"esquema inesperado: {nuevo.get('esquema')}")

        niveles = servidor.llamar("modelo.niveles")
        exigir(isinstance(niveles, list) and len(niveles) == 1, f"niveles: {niveles}")
        nivel = niveles[0]["globalid"]

        muro = servidor.llamar(
            "muros.crear",
            {
                "tipo": "Block 15",
                "nivel": nivel,
                "x1": 0, "y1": 0, "x2": 8, "y2": 0,
                "altura": 3.0,
            },
        )
        exigir(len(muro.get("creados", [])) == 1, f"muro no creado: {muro}")
        muro_gid = muro["creados"][0]

        guardado = servidor.llamar("proyecto.guardar", {"ruta": SALIDA})
        exigir(
            os.path.normpath(guardado["ruta"]).lower() == os.path.normpath(SALIDA).lower(),
            f"ruta guardada distinta: {guardado['ruta']}",
        )
        if SALIDA_LOCAL:
            exigir(
                os.path.isfile(SALIDA_LOCAL) and os.path.getsize(SALIDA_LOCAL) > 1000,
                "el IFC guardado está vacío",
            )
    finally:
        servidor.cerrar()

    reabierto = Servidor(PYTHON)
    try:
        abierto = reabierto.llamar("proyecto.abrir", {"ruta": SALIDA})
        exigir(abierto.get("esquema") == "IFC4", f"no reabrió IFC4: {abierto}")
        elementos = reabierto.llamar("modelo.elementos")
        muros = [e for e in elementos if e["clase"] == "IfcWall"]
        exigir(len(muros) == 1, f"muros tras reabrir: {len(muros)}")
        exigir(muros[0]["globalid"] == muro_gid, "el GlobalId del muro cambió al guardar")
        tesela = reabierto.llamar("geometria.teselar", {"globalids": [muro_gid]})
        exigir(len(tesela.get("elementos", [])) == 1, "el muro no se teseló")
        exigir(len(tesela["elementos"][0]["vertices"]) > 0, "el muro teselado no tiene vértices")
    finally:
        reabierto.cerrar()

    tamano = f" ({os.path.getsize(SALIDA_LOCAL)} bytes)" if SALIDA_LOCAL else ""
    print("OK: ping, proyecto nuevo, muro, guardado, reapertura y teselado" + tamano)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
