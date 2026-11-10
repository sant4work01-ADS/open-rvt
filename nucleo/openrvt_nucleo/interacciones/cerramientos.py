"""Interacciones de Cerramientos y dalas: creación y tramos.

Parte de O065: módulo temático del paquete ``interacciones``. El código se movió
tal cual desde ``interacciones.py``; no cambia la lógica ni los nombres.
"""

from __future__ import annotations

import math
from typing import Any

import ifcopenshell
import ifcopenshell.api.root as root
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api

from ..modelado import (
    PSET_RESTRICCIONES,
    TOLERANCIA,
    TOLERANCIA_CALCULO,
    _gid,
    _nombre,
    _texto,
)
from .. import uniones
from .comun import LARGOS_REFERENCIA, LIGA, PRIORIDAD

from ..siembra import crea_openrvt


class CerramientosMixin:
    """Cerramientos y dalas: creación y tramos."""


    def _restricciones_cerramiento_ligado(self, muro: Any) -> dict[str, Any]:
        """Restricción vertical de un cerramiento ligado, derivada del muro.

        O040: el cerramiento cuelga de la corona del muro, así que su nivel de
        referencia es el nivel de tope del muro (con su desfase) o, si el muro no
        tiene tope («sin conexión»), la base del muro más su altura.
        """
        restriccion = self._restricciones_de(muro)
        tope = _texto(restriccion.get("NivelTope"))
        if tope:
            nivel = tope
            desfase = float(restriccion.get("DesfaseTope") or 0.0)
        else:
            nivel = _texto(restriccion.get("NivelBase"))
            desfase = float(restriccion.get("DesfaseBase") or 0.0) + float(
                restriccion.get("AlturaSinConexion") or 0.0
            )
        return {"NivelBase": nivel, "DesfaseBase": desfase}

    def _tramos_bajo_trazo(
        self,
        tipo_entidad: Any,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        nivel_elegido: Any | None,
        desfase: float | None,
    ) -> list[dict[str, Any]]:
        """O057: muros bajo el trazo que de verdad sostienen el cerramiento.

        De todos los muros colineales bajo el trazo solo valen los de la corona
        más alta que queda a la cara inferior del cerramiento (o por debajo): los
        muros de pisos de abajo que tienen otro muro apilado encima se ignoran.
        """
        largo = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        tramos: list[dict[str, Any]] = []
        for muro in self.modelo.by_type("IfcWall"):
            datos = self._datos_muro(muro)
            longitud = datos["longitud"]
            if longitud <= TOLERANCIA_CALCULO:
                continue
            wx, wy = datos["x1"], datos["y1"]
            mux, muy = datos["dx"], datos["dy"]
            tolerancia = datos["espesor"] / 2.0 + TOLERANCIA
            dist1 = abs(mux * (y1 - wy) - muy * (x1 - wx))
            dist2 = abs(mux * (y2 - wy) - muy * (x2 - wx))
            if dist1 > tolerancia or dist2 > tolerancia:
                continue
            t1 = (x1 - wx) * mux + (y1 - wy) * muy
            t2 = (x2 - wx) * mux + (y2 - wy) * muy
            inicio = max(0.0, min(t1, t2))
            fin = min(longitud, max(t1, t2))
            if fin - inicio <= TOLERANCIA:
                continue
            qx1, qy1 = wx + mux * inicio, wy + muy * inicio
            qx2, qy2 = wx + mux * fin, wy + muy * fin
            s1 = ((qx1 - x1) * ux + (qy1 - y1) * uy) / largo
            s2 = ((qx2 - x1) * ux + (qy2 - y1) * uy) / largo
            tramos.append(
                {
                    "muro": muro,
                    "inicio": inicio,
                    "fin": fin,
                    "x1": qx1, "y1": qy1, "x2": qx2, "y2": qy2,
                    "s0": min(s1, s2), "s1": max(s1, s2),
                    "corona": datos["z"] + datos["altura"],
                }
            )
        _, seccion_tipo, _ = self._seccion_y_armado(tipo_entidad)
        peralte = float(seccion_tipo.get("H") or 0.20)
        if nivel_elegido is not None:
            tope_cara = float(nivel_elegido.Elevation or 0.0) + (
                0.0 if desfase is None else float(desfase)
            )
            cara_inferior = tope_cara - peralte
        else:
            cara_inferior = max(
                (tramo["corona"] for tramo in tramos), default=None
            )
            tope_cara = (
                None if cara_inferior is None else cara_inferior + peralte
            )
        if cara_inferior is None:
            return []
        debajo = [
            tramo
            for tramo in tramos
            if tramo["corona"] <= cara_inferior + TOLERANCIA
        ]
        if not debajo:
            # O045/O050: el cerramiento va embebido en un muro que sube por encima
            # de su cara superior; si ningún muro queda por debajo de su cara
            # inferior, se mantiene la regla anterior y se liga a esos muros.
            if tope_cara is not None and any(
                tramo["corona"] > tope_cara + TOLERANCIA for tramo in tramos
            ):
                return tramos
            return []
        corona_maxima = max(tramo["corona"] for tramo in debajo)
        return [
            tramo
            for tramo in debajo
            if abs(tramo["corona"] - corona_maxima) <= TOLERANCIA
        ]

    def cerramiento_crear_en_muro(
        self,
        tipo: str,
        muro: str,
        nivel: str | None = None,
        desfase: float | None = None,
        desde_planta: bool = False,
    ) -> dict[str, Any]:
        return self._lineal_en_muro(
            tipo,
            muro,
            "cerramiento",
            nivel_elegido=nivel,
            desfase_elegido=desfase,
            desde_planta=desde_planta,
        )

    def dala_crear_en_muro(self, tipo: str, muro: str) -> dict[str, Any]:
        return self._lineal_en_muro(tipo, muro, "dala")

    @crea_openrvt
    def cerramiento_crear(
        self,
        tipo: str,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        nivel: str | None = None,
        desfase: float | None = None,
    ) -> dict[str, Any]:
        """O045: cerramiento dibujado con dos puntos, embebido en el muro.

        El tramo dibujado se liga a cada muro colineal que tenga debajo (dentro de
        la mitad de su espesor y de su largo) y se corta en las juntas; lo que no
        cae sobre un muro queda libre. El muro no cambia de altura.
        """
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcBeamType",))
        if self._estructura_de_tipo(tipo_entidad) != "cerramiento":
            raise self._error("El tipo no es un cerramiento.", -32602)
        try:
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
            if desfase is not None:
                desfase = float(desfase)
        except (TypeError, ValueError) as exc:
            raise self._error("Los datos del cerramiento no son números.", -32602) from exc
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El cerramiento necesita dos puntos distintos.", -32602)
        nivel_elegido = self._nivel_por_gid(str(nivel)) if nivel else None
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        tramos = self._tramos_bajo_trazo(
            tipo_entidad, x1, y1, x2, y2, nivel_elegido, desfase
        )
        for tramo in tramos:
            if nivel_elegido is not None:
                restriccion = {
                    "NivelBase": _gid(nivel_elegido),
                    "DesfaseBase": 0.0 if desfase is None else float(desfase),
                }
            else:
                restriccion = self._restricciones_cerramiento_ligado(tramo["muro"])
                if desfase is not None:
                    restriccion["DesfaseBase"] = float(desfase)
            tramo["restriccion"] = restriccion
            tramo["nivel"] = _texto(restriccion.get("NivelBase"))
            for dependiente in self._dependientes_de(tramo["muro"]):
                if (
                    self._estructura_de_tipo(self._tipo_entidad(dependiente))
                    != "cerramiento"
                ):
                    continue
                otro_nivel = _texto(
                    self._restricciones_de(dependiente).get("NivelBase")
                )
                if otro_nivel != tramo["nivel"]:
                    continue
                liga = self._leer_liga(dependiente)
                datos_muro = self._datos_muro(tramo["muro"])
                if liga.get("Inicio") is None:
                    a, b = 0.0, datos_muro["longitud"]
                else:
                    a = float(liga.get("Inicio") or 0.0)
                    b = float(liga.get("Fin") or a)
                if min(b, tramo["fin"]) - max(a, tramo["inicio"]) > TOLERANCIA:
                    entidad_nivel = self._nivel_por_gid(tramo["nivel"])
                    raise self._error(
                        f"Ese tramo ya tiene cerramiento en {_nombre(entidad_nivel)}.",
                        -32602,
                    )
        tramos.sort(key=lambda t: t["s0"])
        huecos: list[tuple[float, float]] = []
        cursor = 0.0
        for tramo in tramos:
            if tramo["s0"] > cursor + TOLERANCIA:
                huecos.append((cursor, tramo["s0"]))
            cursor = max(cursor, tramo["s1"])
        if cursor < 1.0 - TOLERANCIA:
            huecos.append((cursor, 1.0))
        if not tramos and not huecos:
            raise self._error("El cerramiento no cae sobre ningún muro.", -32602)
        libre_nivel = nivel_elegido
        if libre_nivel is None:
            niveles = sorted(
                self.modelo.by_type("IfcBuildingStorey"),
                key=lambda n: float(n.Elevation or 0.0),
            )
            libre_nivel = niveles[0] if niveles else None
        self._instantanea()
        creados: list[Any] = []
        for tramo in tramos:
            creados.append(
                self._cerramiento_tramo(
                    tipo_entidad,
                    tramo["muro"],
                    tramo["x1"], tramo["y1"], tramo["x2"], tramo["y2"],
                    tramo["restriccion"],
                    tramo["inicio"],
                    tramo["fin"],
                )
            )
        for s0, s1 in huecos:
            if libre_nivel is None:
                raise self._error("Indique el nivel del cerramiento.", -32602)
            restriccion = {
                "NivelBase": _gid(libre_nivel),
                "DesfaseBase": 0.0 if desfase is None else float(desfase),
            }
            px1, py1 = x1 + ux * largo * s0, y1 + uy * largo * s0
            px2, py2 = x1 + ux * largo * s1, y1 + uy * largo * s1
            if math.hypot(px2 - px1, py2 - py1) <= TOLERANCIA:
                continue
            creados.append(
                self._cerramiento_tramo(
                    tipo_entidad, None, px1, py1, px2, py2, restriccion
                )
            )
        # O050: los castillos de los muros tocados bajan a la cara inferior del
        # cerramiento recién creado.
        for muro in {id(tramo["muro"]): tramo["muro"] for tramo in tramos}.values():
            self._actualizar_castillos(muro)
        self.con_cambios = True
        if len(creados) == 1 and creados[0] is not None:
            datos_viga = self._leer_pset(creados[0], "OPENRVT_Estructura")
            mensaje = (
                f"Cerramiento creado ({float(datos_viga.get('Longitud') or 0.0):.2f} m)."
            )
        else:
            mensaje = f"Cerramientos creados ({len(creados)})."
        return self._resultado(creados, mensaje=mensaje)

    def _es_cerramiento(self, elemento: Any) -> bool:
        try:
            return (
                self._estructura_de_tipo(self._tipo_entidad(elemento))
                == "cerramiento"
            )
        except Exception:
            return False

    def _muros_validos_cerramiento(
        self, cerramiento: Any
    ) -> tuple[list[dict[str, Any]], Any | None]:
        """O057: tramos que de verdad sostienen un cerramiento ya existente."""
        restriccion = self._restricciones_de(cerramiento)
        gid_nivel = _texto(restriccion.get("NivelBase"))
        if not gid_nivel:
            return [], None
        nivel = self._nivel_por_gid(gid_nivel)
        datos = self._leer_pset(cerramiento, "OPENRVT_Estructura")
        try:
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
        except (TypeError, ValueError):
            return [], nivel
        if math.hypot(x2 - x1, y2 - y1) <= TOLERANCIA_CALCULO:
            return [], nivel
        tramos = self._tramos_bajo_trazo(
            self._tipo_entidad(cerramiento),
            x1, y1, x2, y2,
            nivel,
            float(restriccion.get("DesfaseBase") or 0.0),
        )
        return tramos, nivel

    def _muros_de_cerramiento(self, cerramiento: Any) -> list[Any]:
        """O061: muros que sostienen un cerramiento, por liga o por geometría."""
        liga = self._leer_liga(cerramiento)
        gid = _texto(liga.get("Muro"))
        if gid:
            try:
                return [self._entidad_por_gid(gid, ("IfcWall",))]
            except Exception:
                pass
        tramos, _nivel = self._muros_validos_cerramiento(cerramiento)
        vistos: dict[int, Any] = {}
        for tramo in tramos:
            vistos[id(tramo["muro"])] = tramo["muro"]
        return list(vistos.values())
