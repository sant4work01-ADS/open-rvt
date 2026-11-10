"""Herramientas de modelado de O003b.

Todas las operaciones usan la API de IfcOpenShell. La clase es un *mixin* de
:class:`openrvt_nucleo.modelo.ModeloNucleo`: usa ``self.modelo``, ``self._instantanea``
y el resto de utilidades del núcleo O003a.
"""

from __future__ import annotations

import logging
import math
import json
from typing import Any, Iterable

import ifcopenshell
import ifcopenshell.api.aggregate as aggregate
import ifcopenshell.api.context as context_api
import ifcopenshell.api.feature as feature_api
import ifcopenshell.api.geometry as geometry_api
import ifcopenshell.api.grid as grid_api
import ifcopenshell.api.material as material_api
import ifcopenshell.api.root as root
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api
import ifcopenshell.api.unit as unit_api
import numpy as np

from .. import uniones
from ..biblioteca import LINEAS_UBICACION
from ..muro_piel import MuroPielMixin, TOLERANCIA_CALCULO, _limpiar_anillo

LOG = logging.getLogger("openrvt_nucleo.modelado")

# Tipos de muro que crea un proyecto nuevo. El nombre es el que ve el usuario.
TIPOS_MURO = (
    ("Block 12", 0.12),
    ("Block 15", 0.15),
    ("Block 20", 0.20),
    ("Tabique", 0.14),
    ("Concreto", 0.15),
)

ALINEACIONES = ("centro", "interior", "exterior")

TOLERANCIA = 0.01  # unión automática de muros: ±1 cm
# O006e: un extremo a menos de 25 cm de la cara o del eje de otro muro se lleva al eje.
TOLERANCIA_UNION = 0.25

# O016: restricciones de base y tope por nivel.
PSET_RESTRICCIONES = "OPENRVT_Restricciones"

# O059: losas por uso. La clave es lo que guarda el pset y manda el cliente.
USOS_LOSA: dict[str, dict[str, Any]] = {
    "firme": {
        "etiqueta": "Firme / losa de cimentación",
        "predefinido": "BASESLAB",
        "nombre": "Firme",
        "espesor": 0.10,
    },
    "entrepiso": {
        "etiqueta": "Entrepiso",
        "predefinido": "FLOOR",
        "nombre": "Losa de entrepiso",
        "espesor": 0.12,
    },
    "azotea": {
        "etiqueta": "Azotea",
        "predefinido": "ROOF",
        "nombre": "Losa de azotea",
        "espesor": 0.12,
    },
}
# Nombres que puso la herramienta: solo esos se pueden reemplazar al cambiar uso.
NOMBRES_LOSA_OMISION = frozenset(datos["nombre"] for datos in USOS_LOSA.values())


def altura_restringida(
    elev_base: float,
    desf_base: float,
    elev_tope: float | None,
    desf_tope: float,
    altura_sin: float | None,
) -> tuple[float, float]:
    """Devuelve ``(z_inferior, altura)`` de un elemento vertical restringido.

    Función pura, sin IFC: la base sale de su nivel más el desfase y el tope de
    su nivel más su desfase (o de la altura fija si no hay conexión).
    """
    z_inferior = float(elev_base) + float(desf_base)
    if elev_tope is not None:
        altura = float(elev_tope) + float(desf_tope) - z_inferior
    else:
        altura = float(altura_sin or 0.0)
    if altura <= TOLERANCIA_CALCULO:
        raise ValueError("La altura restringida debe ser positiva.")
    return z_inferior, altura


def _gid(entidad: Any) -> str:
    return str(getattr(entidad, "GlobalId", "") or "")


def _nombre(entidad: Any) -> str:
    return str(getattr(entidad, "Name", "") or "")


def _texto(valor: Any) -> str:
    return str(valor or "")


def _etiqueta_eje(entidad: Any) -> str:
    return str(getattr(entidad, "AxisTag", "") or "")


def _redondear(valor: float) -> float:
    return round(float(valor), 6)


def _poligono_area(puntos: list[tuple[float, float]]) -> float:
    area = 0.0
    for i, (x1, y1) in enumerate(puntos):
        x2, y2 = puntos[(i + 1) % len(puntos)]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def _distancia_punto_segmento(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> tuple[float, float]:
    dx, dy = x2 - x1, y2 - y1
    largo2 = dx * dx + dy * dy
    if largo2 <= TOLERANCIA_CALCULO:
        return math.hypot(px - x1, py - y1), 0.0
    t = ((px - x1) * dx + (py - y1) * dy) / largo2
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t


__all__ = [
    "ALINEACIONES",
    "Any",
    "Iterable",
    "LINEAS_UBICACION",
    "LOG",
    "MuroPielMixin",
    "NOMBRES_LOSA_OMISION",
    "PSET_RESTRICCIONES",
    "TIPOS_MURO",
    "TOLERANCIA",
    "TOLERANCIA_CALCULO",
    "TOLERANCIA_UNION",
    "USOS_LOSA",
    "_distancia_punto_segmento",
    "_etiqueta_eje",
    "_gid",
    "_limpiar_anillo",
    "_nombre",
    "_poligono_area",
    "_redondear",
    "_texto",
    "aggregate",
    "altura_restringida",
    "annotations",
    "context_api",
    "feature_api",
    "geometry_api",
    "grid_api",
    "ifcopenshell",
    "json",
    "logging",
    "material_api",
    "math",
    "np",
    "root",
    "spatial_api",
    "type_api",
    "uniones",
    "unit_api",
]
