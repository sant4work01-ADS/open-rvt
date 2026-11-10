"""Interacciones de Unión de contratrabes y trabes entre piezas.

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


class TrabesMixin:
    """Unión de contratrabes y trabes entre piezas."""


    def contratrabes_unir_zapatas(
        self, tipo: str, nivel: str, desfase: float = -0.10
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcFootingType",))
        if self._estructura_de_tipo(tipo_entidad) != "contratrabe":
            raise self._error("El tipo no es un contratrabe.", -32602)
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            desfase = float(desfase)
        except (TypeError, ValueError) as exc:
            raise self._error("El desfase no es un número.", -32602) from exc
        self._instantanea()
        creados = self._unir_por_eje("zapata", tipo_entidad, nivel_entidad, desfase, True)
        self.con_cambios = True
        return self._resultado(
            creados, mensaje=f"{len(creados)} contratrabe(s) creado(s)."
        )

    def trabes_unir_columnas(
        self, tipo: str, nivel: str, espesor_losa: float = 0.10
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcBeamType",))
        if self._estructura_de_tipo(tipo_entidad) != "trabe":
            raise self._error("El tipo no es una trabe.", -32602)
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            espesor_losa = float(espesor_losa)
        except (TypeError, ValueError) as exc:
            raise self._error("El espesor de la losa no es un número.", -32602) from exc
        elevacion = float(nivel_entidad.Elevation or 0.0)
        superiores = [
            n for n in self.modelo.by_type("IfcBuildingStorey")
            if float(n.Elevation or 0.0) > elevacion + TOLERANCIA_CALCULO
        ]
        if not superiores:
            raise self._error("No hay un nivel superior para las trabes.", -32023)
        superior = min(superiores, key=lambda n: float(n.Elevation or 0.0))
        espesor = espesor_losa
        for losa in self.modelo.by_type("IfcSlab"):
            if _gid(self._nivel_de_elemento(losa)) == _gid(superior):
                datos = self._leer_pset(losa, "OPENRVT_Losa")
                espesor = float(datos.get("Espesor") or espesor)
                break
        lecho_alto = float(superior.Elevation or 0.0) - espesor
        self._instantanea()
        creados = self._unir_por_eje(
            "columna", tipo_entidad, nivel_entidad, lecho_alto, False
        )
        # El nudo es de la columna: su parte de arriba llega al lecho alto de la trabe.
        for trabe in creados:
            datos = self._leer_pset(trabe, "OPENRVT_Estructura")
            for x, y in (
                (float(datos.get("X1") or 0.0), float(datos.get("Y1") or 0.0)),
                (float(datos.get("X2") or 0.0), float(datos.get("Y2") or 0.0)),
            ):
                for columna in self.modelo.by_type("IfcColumn"):
                    pset = self._leer_pset(columna, "OPENRVT_Estructura")
                    if not pset:
                        continue
                    if math.hypot(
                        float(pset.get("X") or 0.0) - x,
                        float(pset.get("Y") or 0.0) - y,
                    ) > 0.05:
                        continue
                    base = float(pset.get("Base") or 0.0)
                    altura = lecho_alto - base
                    if altura <= TOLERANCIA_CALCULO:
                        continue
                    pset["Altura"] = altura
                    self._guardar_pset(columna, "OPENRVT_Estructura", pset)
                    self._regenerar_estructura(columna)
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=(
                f"{len(creados)} trabe(s) creada(s) con lecho alto en "
                f"{lecho_alto:.2f} m."
            ),
        )

    def _unir_por_eje(
        self,
        alias_buscado: str,
        tipo_entidad: Any,
        nivel_entidad: Any,
        desfase: float,
        lecho_bajo: bool,
    ) -> list[Any]:
        grid = self._grid()
        creados: list[Any] = []
        for eje in self._ejes(grid):
            gid = self._id_eje(grid, eje)
            piezas = []
            for elemento in self.modelo.by_type("IfcElement"):
                liga = self._leer_liga(elemento)
                if _texto(liga.get("EjeA")) != gid and _texto(liga.get("EjeB")) != gid:
                    continue
                if self._estructura_de_tipo(self._tipo_entidad(elemento)) != alias_buscado:
                    continue
                pset = self._leer_pset(elemento, "OPENRVT_Estructura")
                x = float(pset.get("X") or 0.0)
                y = float(pset.get("Y") or 0.0)
                piezas.append((x, y, elemento))
            if len(piezas) < 2:
                continue
            x1, y1, x2, y2, ux, uy, _largo = self._direccion_eje(eje)
            piezas.sort(key=lambda p: (p[0] - x1) * ux + (p[1] - y1) * uy)
            for (ax, ay, a), (bx, by, b) in zip(piezas, piezas[1:]):
                if math.hypot(bx - ax, by - ay) <= TOLERANCIA_CALCULO:
                    continue
                if self._existe_pieza_entre(tipo_entidad, ax, ay, bx, by):
                    continue
                if lecho_bajo:
                    elevacion = float(nivel_entidad.Elevation or 0.0)
                    _, seccion, _ = self._seccion_y_armado(tipo_entidad)
                    alto = float(seccion.get("H") or 0.40)
                    centro = elevacion + desfase - alto / 2.0
                else:
                    _, seccion, _ = self._seccion_y_armado(tipo_entidad)
                    alto = float(seccion.get("H") or 0.40)
                    centro = desfase - alto / 2.0
                viga = self._viga_nueva(
                    tipo_entidad, nivel_entidad, ax, ay, bx, by,
                    centro + alto / 2.0,
                )
                # _viga_nueva calcula Z desde el nivel; se fija el centro exacto.
                pset = self._leer_pset(viga, "OPENRVT_Estructura")
                pset.update({"Z": centro, "Desfase": centro + alto / 2.0})
                self._guardar_pset(viga, "OPENRVT_Estructura", pset)
                self._regenerar_estructura(viga)
                self._guardar_liga(
                    viga, {"EjeA": _texto(self._leer_liga(a).get("EjeA")),
                           "EjeB": _texto(self._leer_liga(a).get("EjeB"))}
                )
                creados.append(viga)
        return creados

    def _existe_pieza_entre(
        self, tipo_entidad: Any, ax: float, ay: float, bx: float, by: float
    ) -> bool:
        alias = self._estructura_de_tipo(tipo_entidad)
        for elemento in self.modelo.by_type("IfcElement"):
            if self._estructura_de_tipo(self._tipo_entidad(elemento)) != alias:
                continue
            pset = self._leer_pset(elemento, "OPENRVT_Estructura")
            if not pset:
                continue
            x1 = float(pset.get("X1") or 0.0)
            y1 = float(pset.get("Y1") or 0.0)
            x2 = float(pset.get("X2") or 0.0)
            y2 = float(pset.get("Y2") or 0.0)
            directo = math.hypot(x1 - ax, y1 - ay) + math.hypot(x2 - bx, y2 - by)
            inverso = math.hypot(x1 - bx, y1 - by) + math.hypot(x2 - ax, y2 - ay)
            if min(directo, inverso) < 0.02:
                return True
        return False
