"""Interacciones de Ligas de psets y relaciones IFC entre elementos.

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


class LigasMixin:
    """Ligas de psets y relaciones IFC entre elementos."""


    def _leer_liga(self, elemento: Any) -> dict[str, Any]:
        return self._leer_pset(elemento, LIGA)

    def _guardar_liga(self, elemento: Any, valores: dict[str, Any]) -> None:
        self._guardar_pset(elemento, LIGA, valores)

    def _conectar(self, relacionado: Any, relacionante: Any) -> None:
        """Crea IfcRelConnectsElements si el par todavía no está relacionado."""
        for rel in self.modelo.by_type("IfcRelConnectsElements"):
            if (
                getattr(rel, "RelatingElement", None) == relacionante
                and getattr(rel, "RelatedElement", None) == relacionado
            ):
                return
        self.modelo.create_entity(
            "IfcRelConnectsElements",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name="OPEN-RVT liga",
            Description=None,
            ConnectionGeometry=None,
            RelatingElement=relacionante,
            RelatedElement=relacionado,
        )

    def _quitar_conexiones(self, elemento: Any) -> None:
        for rel in list(self.modelo.by_type("IfcRelConnectsElements")):
            if (
                getattr(rel, "RelatingElement", None) == elemento
                or getattr(rel, "RelatedElement", None) == elemento
            ):
                try:
                    self.modelo.remove(rel)
                except Exception:
                    pass

    def _dependientes_de(self, elemento: Any, campo: str = "Muro") -> list[Any]:
        gid = _gid(elemento)
        salida = []
        for candidato in self.modelo.by_type("IfcElement"):
            if candidato == elemento or not self._es_elemento(candidato):
                continue
            if _texto(self._leer_liga(candidato).get(campo)) == gid:
                salida.append(candidato)
        return salida

    def _zapatas_de_columna(self, columna: Any) -> list[Any]:
        return self._dependientes_de(columna, "Columna")
