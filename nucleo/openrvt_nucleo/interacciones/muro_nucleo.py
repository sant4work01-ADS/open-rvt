"""Interacciones de Núcleo del muro y medida real de sus castillos (O054).

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


class MuroNucleoMixin:
    """Núcleo del muro y medida real de sus castillos (O054)."""


    def _capas_nucleo(self, muro: Any) -> tuple[float, float]:
        """(espesor, centro) del núcleo respecto al eje del muro."""
        tipo = self._tipo_entidad(muro)
        capas = self.capas_de_tipo(tipo) if tipo is not None else []
        espesor_total = self._datos_muro(muro)["espesor"]
        if not capas:
            return espesor_total, 0.0
        posicionadas = self.capas_con_posicion(muro, espesor_total)
        nucleos = [c for c in posicionadas if c["funcion"] == "núcleo"]
        if not nucleos:
            return espesor_total, 0.0
        espesor = sum(float(c["espesor"]) for c in nucleos)
        centro = sum(float(c["centro"]) * float(c["espesor"]) for c in nucleos) / espesor
        return espesor, centro

    def _punto_en_muro(self, muro: Any, distancia: float) -> tuple[float, float, float]:
        datos = self._datos_muro(muro)
        x = datos["x1"] + datos["dx"] * distancia
        y = datos["y1"] + datos["dy"] * distancia
        return x, y, math.atan2(datos["dy"], datos["dx"])

    @staticmethod
    def _del_nucleo(valor: Any) -> bool:
        """O054: AnchoDelMuro verdadero = «del núcleo»; falso = «del tipo»."""
        return valor not in (False, "False", "false", 0, "0")

    @staticmethod
    def _medida_texto(valor: float) -> str:
        cm = round(float(valor) * 100.0, 1)
        if abs(cm - round(cm)) < 1e-6:
            return str(int(round(cm)))
        return f"{cm:.1f}"

    def _nombre_seccion(self, alias: str, b: float, h: float) -> str:
        return (
            f"{alias.capitalize()} {self._medida_texto(b)}×"
            f"{self._medida_texto(h)}"
        )

    def _castillo_esquina(
        self, muro: Any, x: float, y: float
    ) -> tuple[Any, tuple[float, float]] | None:
        """O054: muro vecino y cruce de ejes si el castillo cae a ≤ 0.05 m."""
        for otro in self.modelo.by_type("IfcWall"):
            if otro == muro or self._conexion_entre(muro, otro) is None:
                continue
            punto = self._cruce_ejes_muro(muro, otro)
            if punto is None:
                continue
            if math.hypot(punto[0] - x, punto[1] - y) <= 0.05:
                return otro, punto
        return None

    def _seccion_castillo(
        self, castillo: Any, muro: Any, x: float, y: float
    ) -> tuple[float, float, float, float, float, bool, Any | None]:
        """O054: sección real del castillo y su punto (se centra en el cruce).

        Devuelve (x, y, rotación, B, H, es_esquina, muro_perpendicular).
        """
        datos = self._datos_muro(muro)
        pset = self._leer_pset(castillo, "OPENRVT_Estructura")
        tipo = self._tipo_entidad(castillo)
        _, seccion, _ = self._seccion_y_armado(tipo)
        b_tipo = float(seccion.get("B") or seccion.get("D") or 0.15)
        h_tipo = float(seccion.get("H") or seccion.get("D") or b_tipo)
        nucleo, _centro = self._capas_nucleo(muro)
        rotacion = math.atan2(datos["dy"], datos["dx"])
        esquina = self._castillo_esquina(muro, x, y)
        if esquina is not None and self._del_nucleo(pset.get("AnchoDelMuro", True)):
            otro, punto = esquina
            nucleo_otro, _ = self._capas_nucleo(otro)
            return punto[0], punto[1], rotacion, nucleo_otro, nucleo, True, otro
        if self._del_nucleo(pset.get("AnchoDelMuro", True)):
            return x, y, rotacion, b_tipo, nucleo, False, None
        return x, y, rotacion, b_tipo, h_tipo, False, None

    def _ajustar_castillo(self, castillo: Any, muro: Any) -> bool:
        """O054: recalcula sección, centro y nombre de un castillo en su muro."""
        datos = self._datos_muro(muro)
        liga = dict(self._leer_liga(castillo))
        try:
            distancia = float(liga.get("Distancia") or 0.0)
        except (TypeError, ValueError):
            distancia = 0.0
        distancia = min(max(distancia, 0.0), datos["longitud"])
        x, y, _rot = self._punto_en_muro(muro, distancia)
        x, y, rotacion, b, h, esquina, _otro = self._seccion_castillo(
            castillo, muro, x, y
        )
        if esquina:
            distancia = min(
                max(
                    (x - datos["x1"]) * datos["dx"]
                    + (y - datos["y1"]) * datos["dy"],
                    0.0,
                ),
                datos["longitud"],
            )
            liga["Muro"] = _gid(muro)
            liga["Distancia"] = distancia
            self._guardar_liga(castillo, liga)
        pset = {
            **self._leer_pset(castillo, "OPENRVT_Estructura"),
            "X": x, "Y": y, "Rotacion": rotacion,
            "B": b, "H": h,
        }
        # O061: el castillo conserva su Base y su Altura; una losa puede dejarlo
        # arrancando por debajo del nivel del muro (0.00 frente a 0.12).
        if pset.get("Base") is None:
            pset["Base"] = datos["z"]
        self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
        self._regenerar_estructura(castillo)
        return esquina

    def _reparar_castillos_esquina(self) -> int:
        """O054: repara al abrir los castillos viejos (sección y centro reales)."""
        reparados = 0
        for castillo in self.modelo.by_type("IfcColumn"):
            if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                continue
            pset = self._leer_pset(castillo, "OPENRVT_Estructura")
            if not pset:
                continue
            if "AnchoDelMuro" not in pset:
                pset["AnchoDelMuro"] = True
                self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
            muro = None
            liga = self._leer_liga(castillo)
            if liga.get("Muro"):
                try:
                    muro = self._entidad_por_gid(_texto(liga["Muro"]), ("IfcWall",))
                except Exception:
                    muro = None
            if muro is None:
                x = float(pset.get("X") or 0.0)
                y = float(pset.get("Y") or 0.0)
                cercano = None
                for candidato in self.modelo.by_type("IfcWall"):
                    datos = self._datos_muro(candidato)
                    t = (x - datos["x1"]) * datos["dx"] + (y - datos["y1"]) * datos["dy"]
                    if t < -0.05 or t > datos["longitud"] + 0.05:
                        continue
                    distancia = abs(
                        -(x - datos["x1"]) * datos["dy"] + (y - datos["y1"]) * datos["dx"]
                    )
                    if distancia > datos["espesor"] / 2.0 + 0.05:
                        continue
                    if cercano is None or distancia < cercano[0]:
                        cercano = (distancia, candidato)
                muro = cercano[1] if cercano is not None else None
            if muro is None:
                continue
            if self._ajustar_castillo(castillo, muro):
                reparados += 1
        return reparados
