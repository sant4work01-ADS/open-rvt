"""Interacciones de Zapata bajo columna.

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


class ZapatasMixin:
    """Zapata bajo columna."""


    @crea_openrvt
    def zapata_bajo_columna(
        self,
        tipo: str,
        columna: str,
        desplante: float = 1.00,
        lindero: str = "",
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcFootingType",))
        if self._estructura_de_tipo(tipo_entidad) != "zapata":
            raise self._error("El tipo no es una zapata aislada.", -32602)
        columna_entidad = self._entidad_por_gid(columna, ("IfcColumn",))
        lindero = _texto(lindero).strip().upper()
        if lindero not in ("", "N", "S", "E", "O"):
            raise self._error("El lindero debe ser N, S, E, O o vacío.", -32602)
        try:
            desplante = float(desplante)
        except (TypeError, ValueError) as exc:
            raise self._error("El desplante no es un número.", -32602) from exc
        if desplante <= 0:
            raise self._error("El desplante de la zapata debe ser positivo.", -32602)
        pset_columna = self._leer_pset(columna_entidad, "OPENRVT_Estructura")
        datos_columna = dict(pset_columna)
        x = float(datos_columna.get("X") or 0.0)
        y = float(datos_columna.get("Y") or 0.0)
        rotacion = float(datos_columna.get("Rotacion") or 0.0)
        base_columna = float(datos_columna.get("Base") or 0.0)
        altura = float(datos_columna.get("Altura") or 2.60)
        nivel = self._nivel_de_elemento(columna_entidad)
        _, seccion_columna, _ = self._seccion_y_armado(self._tipo_entidad(columna_entidad))
        cb = float(seccion_columna.get("B") or 0.30)
        ch = float(seccion_columna.get("H") or 0.30)
        _, seccion_zapata, _ = self._seccion_y_armado(tipo_entidad)
        largo = float(seccion_zapata.get("Largo") or 1.20)
        ancho = float(seccion_zapata.get("Ancho") or 1.20)
        peralte = float(seccion_zapata.get("Peralte") or 0.25)
        plantilla = float(seccion_zapata.get("Plantilla") or 0.05)
        dado_alto = float(seccion_zapata.get("DadoAlto") or 0.0)
        elevacion = float(nivel.Elevation or 0.0)
        z = elevacion - desplante
        # Desplazamiento local para que el borde quede al ras de la cara de la columna.
        bx = by = 0.0
        if lindero == "E":
            bx = cb / 2.0 - largo / 2.0
        elif lindero == "O":
            bx = -(cb / 2.0 - largo / 2.0)
        elif lindero == "N":
            by = ch / 2.0 - ancho / 2.0
        elif lindero == "S":
            by = -(ch / 2.0 - ancho / 2.0)
        coseno, seno = math.cos(rotacion), math.sin(rotacion)
        zx = x + bx * coseno - by * seno
        zy = y + bx * seno + by * coseno
        self._instantanea()
        zapata = root.create_entity(self.modelo, ifc_class="IfcFooting")
        zapata.Name = f"Zapata {_nombre(tipo_entidad)}"
        type_api.assign_type(
            self.modelo, related_objects=[zapata], relating_type=tipo_entidad
        )
        self._guardar_pset(
            zapata,
            "OPENRVT_Estructura",
            {
                "X": zx, "Y": zy, "Rotacion": rotacion, "Z": z,
                "Desplante": desplante, "Nivel": _gid(nivel),
            },
        )
        self._regenerar_estructura(zapata)
        spatial_api.assign_container(
            self.modelo, products=[zapata], relating_structure=nivel
        )
        # La base de la columna baja a la cara superior del dado o de la zapata.
        tope = z + peralte + dado_alto
        nueva_altura = altura + (base_columna - tope)
        if nueva_altura <= 0:
            raise self._error("La columna no puede bajar hasta la zapata.", -32602)
        datos_columna.update({"Base": tope, "Altura": nueva_altura})
        self._guardar_pset(columna_entidad, "OPENRVT_Estructura", datos_columna)
        self._regenerar_estructura(columna_entidad)
        # O012b: el dado nuevo recorta las vigas y la columna baja: se recalcula todo.
        self._recalcular_uniones_estructura()
        liga_columna = self._leer_liga(columna_entidad)
        self._guardar_liga(
            zapata,
            {
                "Columna": _gid(columna_entidad),
                "Lindero": lindero,
                "EjeA": _texto(liga_columna.get("EjeA")),
                "EjeB": _texto(liga_columna.get("EjeB")),
            },
        )
        self._conectar(columna_entidad, zapata)
        self.con_cambios = True
        return self._resultado(
            [zapata],
            modificados=[columna_entidad],
            mensaje=f"Zapata bajo la columna (desplante {desplante:.2f} m).",
        )
