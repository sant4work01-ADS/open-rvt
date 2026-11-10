"""Interacciones entre muros, castillos, cerramientos, dalas y estructura (O007c).

Parte de O065: el antiguo ``interacciones.py`` se reparte en mixins temáticos.
``InteraccionesMixin`` se arma con todos ellos y este paquete reexporta las
constantes públicas (``LIGA``, ``PRIORIDAD``, ``LARGOS_REFERENCIA``).
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
from .ligas import LigasMixin
from .muro_nucleo import MuroNucleoMixin
from .estructura_base import EstructuraBaseMixin
from .castillos import CastillosMixin
from .cerramientos import CerramientosMixin
from .cerramientos_reparar import CerramientosRepararMixin
from .actualizaciones import ActualizacionesMixin
from .reticula import ReticulaMixin
from .zapatas import ZapatasMixin
from .trabes import TrabesMixin
from .cantidades import CantidadesMixin


class InteraccionesMixin(
    LigasMixin,
    MuroNucleoMixin,
    EstructuraBaseMixin,
    CastillosMixin,
    CerramientosMixin,
    CerramientosRepararMixin,
    ActualizacionesMixin,
    ReticulaMixin,
    ZapatasMixin,
    TrabesMixin,
    CantidadesMixin,
):
    """Ligas, alojamiento en el muro, retícula y cuantificación por prioridad."""
