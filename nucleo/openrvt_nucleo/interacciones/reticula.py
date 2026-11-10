"""Interacciones de Columnas, zapatas y trabes sobre la retícula de ejes.

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


class ReticulaMixin:
    """Columnas, zapatas y trabes sobre la retícula de ejes."""


    def _nivel_de_elemento(self, elemento: Any) -> Any:
        for rel in getattr(elemento, "ContainedInStructure", ()) or ():
            estructura = getattr(rel, "RelatingStructure", None)
            if estructura is not None and estructura.is_a("IfcBuildingStorey"):
                return estructura
        pset = self._leer_pset(elemento, "OPENRVT_Estructura")
        if pset.get("Nivel"):
            return self._nivel_por_gid(_texto(pset["Nivel"]))
        datos = self._datos_muro(elemento) if elemento.is_a("IfcWall") else None
        z = (datos or {}).get("z", 0.0)
        mejor = None
        for nivel in self.modelo.by_type("IfcBuildingStorey"):
            elevacion = float(nivel.Elevation or 0.0)
            if elevacion <= z + 1e-4 and (mejor is None or elevacion > mejor[0]):
                mejor = (elevacion, nivel)
        if mejor is None:
            niveles = self.modelo.by_type("IfcBuildingStorey")
            if not niveles:
                raise self._error("No hay niveles en el modelo.", -32005)
            return niveles[0]
        return mejor[1]

    def columnas_en_cruces(
        self, tipo: str, nivel: str, ejes: Any = None
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcColumnType",))
        nivel_entidad = self._nivel_por_gid(nivel)
        grid = self._grid()
        todos = self._ejes(grid)
        if ejes:
            if isinstance(ejes, str):
                ejes = [ejes]
            buscados = {str(e) for e in ejes}
            todos = [e for e in todos if self._id_eje(grid, e) in buscados]
        self._instantanea()
        creados: list[Any] = []
        omitidos: list[Any] = []
        for i, a in enumerate(todos):
            for b in todos[i + 1 :]:
                ga, gb = self._id_eje(grid, a), self._id_eje(grid, b)
                xa, ya, xb, yb, ux, uy, largo = self._direccion_eje(a)
                xc, yc, xd, yd, vx, vy, largo2 = self._direccion_eje(b)
                den = ux * vy - uy * vx
                if abs(den) <= TOLERANCIA_CALCULO:
                    continue
                # Con vectores unitarios, t y u son distancias sobre cada eje.
                t = ((xc - xa) * vy - (yc - ya) * vx) / den
                u = ((xc - xa) * uy - (yc - ya) * ux) / den
                if t < -TOLERANCIA or t > largo + TOLERANCIA:
                    continue
                if u < -TOLERANCIA or u > largo2 + TOLERANCIA:
                    continue
                px, py = xa + ux * t, ya + uy * t
                existente = None
                for columna in self.modelo.by_type("IfcColumn"):
                    if self._estructura_de_tipo(self._tipo_entidad(columna)) != "columna":
                        continue
                    p = self._leer_pset(columna, "OPENRVT_Estructura")
                    if math.hypot(
                        float(p.get("X") or 0.0) - px, float(p.get("Y") or 0.0) - py
                    ) < 0.05:
                        existente = columna
                        break
                if existente is not None:
                    omitidos.append(existente)
                    continue
                elevacion = float(nivel_entidad.Elevation or 0.0)
                altura = self._altura_columna(elevacion, None, None)
                columna, _ = self._columna_nueva(
                    tipo_entidad, nivel_entidad, px, py, 0.0, altura
                )
                self._guardar_liga(columna, {"EjeA": ga, "EjeB": gb})
                self._guardar_enlace_cruce(columna, ga, gb, px, py)
                creados.append(columna)
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=f"{len(creados)} columna(s) en cruces; {len(omitidos)} ya existían.",
            omitidos=[_gid(o) for o in omitidos],
        )

    def _guardar_enlace_cruce(
        self, elemento: Any, eje_a: str, eje_b: str, px: float, py: float
    ) -> None:
        """Escribe el enlace de cruce sin abrir otra instantánea (O028)."""
        pset = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
        x = float(pset.get("X") or 0.0)
        y = float(pset.get("Y") or 0.0)
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        datos.update(
            {
                "EnlaceTipo": "cruce",
                "EnlaceEjeA": _texto(eje_a),
                "EnlaceEjeB": _texto(eje_b),
                "EnlaceDX": x - px,
                "EnlaceDY": y - py,
            }
        )
        self._guardar_pset(elemento, PSET_RESTRICCIONES, datos)

    def _guardar_enlace_tramo(
        self,
        elemento: Any,
        guia: str,
        inicio: str,
        fin: str,
        desfase: float = 0.0,
        desfase_inicio: float = 0.0,
        desfase_fin: float = 0.0,
    ) -> None:
        """Escribe el enlace de tramo sin abrir otra instantánea (O028)."""
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        datos.update(
            {
                "EnlaceTipo": "tramo",
                "EnlaceEjeGuia": _texto(guia),
                "EnlaceEjeInicio": _texto(inicio),
                "EnlaceEjeFin": _texto(fin),
                "EnlaceDesfase": float(desfase),
                "EnlaceDesfaseInicio": float(desfase_inicio),
                "EnlaceDesfaseFin": float(desfase_fin),
            }
        )
        self._guardar_pset(elemento, PSET_RESTRICCIONES, datos)

    def _cruces_de_eje(self, guia: str) -> list[tuple[float, str, float, float]]:
        """Cruces del eje guía con los ejes transversales, ordenados a lo largo."""
        grid = self._grid()
        gx, gy, ux, uy = self._direccion_de_eje(guia)
        salida: list[tuple[float, str, float, float]] = []
        for eje in self._ejes(grid):
            gid = self._id_eje(grid, eje)
            if gid == guia:
                continue
            x1, y1, x2, y2, vx, vy, largo = self._direccion_eje(eje)
            den = ux * vy - uy * vx
            if abs(den) <= TOLERANCIA_CALCULO:
                continue
            t = ((x1 - gx) * vy - (y1 - gy) * vx) / den
            u = ((x1 - gx) * uy - (y1 - gy) * ux) / den
            if u < -TOLERANCIA or u > largo + TOLERANCIA:
                continue
            px, py = gx + ux * t, gy + uy * t
            salida.append((t, gid, px, py))
        salida.sort(key=lambda c: c[0])
        return salida

    def zapatas_en_cruces(
        self,
        tipo: str,
        nivel: str,
        ejes: Any = None,
        desplante: float = 1.00,
    ) -> dict[str, Any]:
        """O028: una zapata aislada en cada cruce, enlazada al cruce."""
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcFootingType",))
        if self._estructura_de_tipo(tipo_entidad) != "zapata":
            raise self._error("El tipo no es una zapata aislada.", -32602)
        self._nivel_por_gid(nivel)
        grid = self._grid()
        todos = self._ejes(grid)
        if ejes:
            if isinstance(ejes, str):
                ejes = [ejes]
            buscados = {str(e) for e in ejes}
            todos = [e for e in todos if self._id_eje(grid, e) in buscados]
        creados: list[Any] = []
        omitidos: list[Any] = []
        for i, a in enumerate(todos):
            for b in todos[i + 1 :]:
                ga, gb = self._id_eje(grid, a), self._id_eje(grid, b)
                xa, ya, xb, yb, ux, uy, largo = self._direccion_eje(a)
                xc, yc, xd, yd, vx, vy, largo2 = self._direccion_eje(b)
                den = ux * vy - uy * vx
                if abs(den) <= TOLERANCIA_CALCULO:
                    continue
                t = ((xc - xa) * vy - (yc - ya) * vx) / den
                u = ((xc - xa) * uy - (yc - ya) * ux) / den
                if t < -TOLERANCIA or t > largo + TOLERANCIA:
                    continue
                if u < -TOLERANCIA or u > largo2 + TOLERANCIA:
                    continue
                px, py = xa + ux * t, ya + uy * t
                existente = None
                for zapata in self.modelo.by_type("IfcFooting"):
                    if _texto(getattr(zapata, "PredefinedType", "")) not in ("", "PAD_FOOTING"):
                        continue
                    p = self._leer_pset(zapata, "OPENRVT_Estructura")
                    if math.hypot(
                        float(p.get("X") or 0.0) - px, float(p.get("Y") or 0.0) - py
                    ) < 0.05:
                        existente = zapata
                        break
                if existente is not None:
                    omitidos.append(existente)
                    continue
                resultado = self.zapata_crear(tipo, nivel, px, py, 0.0, desplante)
                zapata = next(
                    e
                    for e in self.modelo.by_type("IfcFooting")
                    if e.GlobalId == resultado["creados"][0]
                )
                self._guardar_enlace_cruce(zapata, ga, gb, px, py)
                creados.append(zapata)
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=f"{len(creados)} zapata(s) en cruces; {len(omitidos)} ya existían.",
            omitidos=[_gid(o) for o in omitidos],
        )

    def contratrabes_entre_ejes(
        self, tipo: str, nivel: str, eje_guia: str, desfase: float = -0.10
    ) -> dict[str, Any]:
        """O028: tramos de contratrabe entre cruces consecutivos del eje guía."""
        self._exigir_modelo()
        self._nivel_por_gid(nivel)
        cruces = self._cruces_de_eje(_texto(eje_guia))
        creados: list[Any] = []
        for (_t1, g1, x1, y1), (_t2, g2, x2, y2) in zip(cruces, cruces[1:]):
            if math.hypot(x2 - x1, y2 - y1) <= TOLERANCIA_CALCULO:
                continue
            resultado = self.viga_crear(tipo, nivel, x1, y1, x2, y2, desfase)
            viga = next(
                e
                for e in self.modelo.by_type("IfcProduct")
                if e.GlobalId == resultado["creados"][0]
            )
            self._guardar_enlace_tramo(viga, _texto(eje_guia), g1, g2)
            self._guardar_liga(viga, {"EjeA": _texto(eje_guia)})
            creados.append(viga)
        self.con_cambios = True
        return self._resultado(
            creados, mensaje=f"{len(creados)} contratrabe(s) entre cruces."
        )

    def muros_entre_ejes(
        self,
        tipo: str,
        nivel: str,
        eje_guia: str,
        alineacion: str = "centro",
    ) -> dict[str, Any]:
        """O028: tramos de muro entre cruces consecutivos del eje guía."""
        self._exigir_modelo()
        self._nivel_por_gid(nivel)
        cruces = self._cruces_de_eje(_texto(eje_guia))
        creados: list[Any] = []
        for (_t1, g1, x1, y1), (_t2, g2, x2, y2) in zip(cruces, cruces[1:]):
            if math.hypot(x2 - x1, y2 - y1) <= TOLERANCIA_CALCULO:
                continue
            resultado = self.muro_crear(
                tipo, nivel, x1, y1, x2, y2, alineacion=alineacion
            )
            muro = next(
                e
                for e in self.modelo.by_type("IfcProduct")
                if e.GlobalId == resultado["creados"][0]
            )
            self._guardar_enlace_tramo(muro, _texto(eje_guia), g1, g2)
            creados.append(muro)
        self.con_cambios = True
        return self._resultado(
            creados, mensaje=f"{len(creados)} tramo(s) de muro entre cruces."
        )

    def _mover_producto(self, producto: Any, dx: float, dy: float, dz: float) -> None:
        import ifcopenshell.util.placement as placement

        matriz = placement.get_local_placement(producto.ObjectPlacement)
        matriz[0][3] += dx
        matriz[1][3] += dy
        matriz[2][3] += dz
        ifcopenshell.api.geometry.edit_object_placement(
            self.modelo, product=producto, matrix=matriz, is_si=True
        )
        self._desplazar_pset_estructura(producto, dx, dy, dz)

    def _mover_columnas_de_eje(
        self, eje_gid: str, nx: float, ny: float, distancia: float
    ) -> list[Any]:
        modificados: list[Any] = []
        for columna in self.modelo.by_type("IfcColumn"):
            liga = self._leer_liga(columna)
            if _texto(liga.get("EjeA")) != eje_gid and _texto(liga.get("EjeB")) != eje_gid:
                continue
            self._mover_producto(columna, nx * distancia, ny * distancia, 0.0)
            modificados.append(columna)
            for zapata in self._zapatas_de_columna(columna):
                self._mover_producto(zapata, nx * distancia, ny * distancia, 0.0)
                modificados.append(zapata)
        return modificados
