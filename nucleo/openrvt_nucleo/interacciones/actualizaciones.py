"""Interacciones de Recolocación y actualización de dependientes de un muro.

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


class ActualizacionesMixin:
    """Recolocación y actualización de dependientes de un muro."""


    def _recolocar_cerramiento_vertical(self, elemento: Any) -> None:
        """O041: re-deriva la cota de un cerramiento tras cambiar tipo o peralte.

        El tope sale de la restricción (nivel + desfase) y no cambia; el fondo se
        mueve con el peralte. Si está ligado a un muro, el muro y los castillos lo
        siguen.
        """
        if self._estructura_de_tipo(self._tipo_entidad(elemento)) != "cerramiento":
            return
        restriccion = self._restricciones_de(elemento)
        nivel = self._nivel_por_gid(_texto(restriccion.get("NivelBase")))
        tope = float(nivel.Elevation or 0.0) + float(
            restriccion.get("DesfaseBase") or 0.0
        )
        peralte = self._peralte_de(elemento)
        datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
        datos["Z"] = tope - peralte / 2.0
        self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
        self._regenerar_estructura(elemento)

    def _actualizar_castillos(self, muro: Any) -> None:
        """O050: el castillo llega a la cara inferior del cerramiento del muro.

        Sin cerramiento llega al tope del muro. Si el cerramiento queda por
        encima del muro, el castillo no lo atraviesa: termina en la corona.
        """
        datos = self._datos_muro(muro)
        tope = datos["z"] + datos["altura"]
        fondos: list[float] = []
        for dependiente in self._dependientes_de(muro):
            if (
                self._estructura_de_tipo(self._tipo_entidad(dependiente))
                != "cerramiento"
            ):
                continue
            try:
                restriccion = self._restricciones_de(dependiente)
                nivel = self._nivel_por_gid(_texto(restriccion.get("NivelBase")))
                cara_superior = float(nivel.Elevation or 0.0) + float(
                    restriccion.get("DesfaseBase") or 0.0
                )
                fondo = cara_superior - self._peralte_de(dependiente)
            except Exception:
                continue
            if datos["z"] + TOLERANCIA_CALCULO < fondo < tope - TOLERANCIA_CALCULO:
                fondos.append(fondo)
        tope_castillo = min([tope, *fondos])
        for castillo in self._dependientes_de(muro):
            if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                continue
            # O054: el castillo de esquina manda sobre el cerramiento: atraviesa
            # la franja para cerrar el cruce (el cerramiento se corta en su cara).
            es_esquina = self._ajustar_castillo(castillo, muro)
            restriccion_castillo = self._restricciones_de(castillo)
            # O057: si el usuario puso NivelTope, manda su altura
            # (elevación del tope + DesfaseTope − base) y ninguna operación
            # automática la pisa. Sin NivelTope sigue la regla O050/O054.
            if _texto(restriccion_castillo.get("NivelTope")):
                nivel_tope = self._nivel_por_gid(
                    _texto(restriccion_castillo.get("NivelTope"))
                )
                base = float(
                    self._nivel_por_gid(
                        _texto(restriccion_castillo.get("NivelBase"))
                    ).Elevation
                    or 0.0
                ) + float(restriccion_castillo.get("DesfaseBase") or 0.0)
                tope_usuario = float(nivel_tope.Elevation or 0.0) + float(
                    restriccion_castillo.get("DesfaseTope") or 0.0
                )
                pset = {
                    **self._leer_pset(castillo, "OPENRVT_Estructura"),
                    "Base": base,
                    "Altura": max(tope_usuario - base, 0.05),
                }
                self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
                self._regenerar_estructura(castillo)
                continue
            altura = tope if es_esquina else tope_castillo
            pset = {
                **self._leer_pset(castillo, "OPENRVT_Estructura"),
                "Base": datos["z"],
                "Altura": max(altura - datos["z"], 0.05),
            }
            self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
            self._regenerar_estructura(castillo)

    def _es_cimentacion_bajo_muro(self, elemento: Any) -> bool:
        """O035: ¿es una zapata corrida o una contratrabe?"""
        if elemento is None:
            return False
        predef = _texto(getattr(elemento, "PredefinedType", ""))
        if elemento.is_a("IfcFooting") and predef == "STRIP_FOOTING":
            return True
        try:
            return self._estructura_de_tipo(self._tipo_entidad(elemento)) == "contratrabe"
        except Exception:
            return False

    def _actualizar_muros_sobre_cimentacion(self) -> list[Any]:
        """O035: recalcula la base de todos los muros al cambiar la cimentación.

        Es el mismo mecanismo de dependientes que castillos y cerramientos: en lote,
        una sola regeneración por muro.
        """
        modificados: list[Any] = []
        for muro in list(self.modelo.by_type("IfcWall")):
            if not self._leer_pset(muro, "OPENRVT_Muro"):
                continue
            self._actualizar_dependientes_muro(muro)
            self._regenerar_muro(muro)
            self._anotar_rebote(muro)
            modificados.append(_gid(muro))
        return modificados

    def _actualizar_dependientes_muro(self, muro: Any) -> list[Any]:
        """Recoloca castillos, cerramientos y dalas cuando el muro cambia."""
        datos = self._datos_muro(muro)
        nucleo, _centro = self._capas_nucleo(muro)
        modificados: list[Any] = []
        dependientes = list(self._dependientes_de(muro))
        vistos = {id(dependiente) for dependiente in dependientes}
        # O061: los cerramientos viejos sin liga «Muro» se reconocen por su
        # geometría; al cambiar el tipo del muro también recuperan su ancho.
        for candidato in self.modelo.by_type("IfcBeam"):
            if id(candidato) in vistos or not self._es_cerramiento(candidato):
                continue
            if self._leer_liga(candidato).get("Muro"):
                continue
            if muro in self._muros_de_cerramiento(candidato):
                dependientes.append(candidato)
                vistos.add(id(candidato))
        for dependiente in dependientes:
            alias = self._estructura_de_tipo(self._tipo_entidad(dependiente))
            pset = dict(self._leer_pset(dependiente, "OPENRVT_Estructura"))
            if not pset:
                continue
            if alias == "castillo":
                # O054: también aquí se recalcula la sección y, en un cruce, el
                # castillo se vuelve a centrar en el eje del muro vecino.
                self._ajustar_castillo(dependiente, muro)
                modificados.append(dependiente)
                continue
            elif alias in ("cerramiento", "dala"):
                _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(dependiente))
                alto = float(pset.get("H") or seccion.get("H") or 0.20)
                del_nucleo = self._del_nucleo(pset.get("AnchoDelMuro", True))
                ancho = nucleo if del_nucleo else float(
                    seccion.get("B") or nucleo
                )
                liga = self._leer_liga(dependiente)
                # O045: el cerramiento puede cubrir solo un tramo del muro; sus
                # distancias al inicio se guardan en la liga y se conservan.
                if (
                    alias == "cerramiento"
                    and liga.get("Inicio") is not None
                    and not liga.get("Completo")
                ):
                    d1 = min(max(float(liga.get("Inicio") or 0.0), 0.0), datos["longitud"])
                    d2 = min(max(float(liga.get("Fin") or 0.0), d1), datos["longitud"])
                else:
                    d1, d2 = 0.0, datos["longitud"]
                x1 = datos["x1"] + datos["dx"] * d1
                y1 = datos["y1"] + datos["dy"] * d1
                x2 = datos["x1"] + datos["dx"] * d2
                y2 = datos["y1"] + datos["dy"] * d2
                pset.update(
                    {
                        "X1": x1, "Y1": y1,
                        "X2": x2, "Y2": y2,
                        "Longitud": d2 - d1, "B": ancho,
                    }
                )
                if not del_nucleo:
                    pset["H"] = float(seccion.get("H") or alto)
                if alias == "dala":
                    pset["Z"] = datos["z"] + alto / 2.0
                else:
                    liga["Inicio"], liga["Fin"] = d1, d2
                    self._guardar_liga(dependiente, liga)
                # O045: la altura del cerramiento no cambia la del muro.
            else:
                continue
            self._guardar_pset(dependiente, "OPENRVT_Estructura", pset)
            self._regenerar_estructura(dependiente)
            modificados.append(dependiente)
        if any(
            self._estructura_de_tipo(self._tipo_entidad(d)) == "castillo"
            for d in self._dependientes_de(muro)
        ):
            self._actualizar_castillos(muro)
        return modificados
