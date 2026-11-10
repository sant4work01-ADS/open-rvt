"""Interacciones de Castillos en muros y colocación automática.

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


class CastillosMixin:
    """Castillos en muros y colocación automática."""


    @crea_openrvt
    def castillo_crear_en_muro(
        self, tipo: str, muro: str, distancia: float
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcColumnType",))
        muro_entidad = self._entidad_por_gid(muro, ("IfcWall",))
        try:
            distancia = float(distancia)
        except (TypeError, ValueError) as exc:
            raise self._error("La distancia del castillo no es numérica.", -32602) from exc
        datos = self._datos_muro(muro_entidad)
        if distancia < -TOLERANCIA_CALCULO or distancia > datos["longitud"] + TOLERANCIA_CALCULO:
            raise self._error(
                f"La distancia {distancia:.2f} m queda fuera del muro "
                f"(0 a {datos['longitud']:.2f} m).",
                -32602,
            )
        distancia = min(max(distancia, 0.0), datos["longitud"])
        self._instantanea()
        castillo = self._castillo_en(
            tipo_entidad, muro_entidad, distancia, corregir_existente=False
        )
        self.con_cambios = True
        return self._resultado(
            [castillo], mensaje=f"Castillo colocado a {distancia:.2f} m del inicio."
        )

    def _castillo_en(
        self,
        tipo_entidad: Any,
        muro: Any,
        distancia: float,
        corregir_existente: bool = True,
        recalcular: bool = True,
    ) -> Any:
        datos = self._datos_muro(muro)
        x, y, rotacion = self._punto_en_muro(muro, distancia)
        nucleo, _centro = self._capas_nucleo(muro)
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        ancho = float(seccion.get("B") or seccion.get("D") or 0.15)
        # O054: en un cruce de muros el castillo se centra y mide núcleo × núcleo;
        # fuera de él, a lo largo del muro manda la medida del tipo y en el
        # espesor el núcleo del muro.
        esquina = self._castillo_esquina(muro, x, y)
        if esquina is not None:
            otro, punto = esquina
            nucleo_otro, _ = self._capas_nucleo(otro)
            x, y = punto
            ancho, alto = nucleo_otro, nucleo
            distancia = min(
                max(
                    (x - datos["x1"]) * datos["dx"]
                    + (y - datos["y1"]) * datos["dy"],
                    0.0,
                ),
                datos["longitud"],
            )
        else:
            alto = nucleo
        nivel_entidad = self._nivel_de_elemento(muro)
        # O045: el castillo va embebido y llega a la altura completa del muro.
        altura = datos["altura"]
        elevacion = datos["z"]
        castillo, _ = self._columna_nueva(
            tipo_entidad, nivel_entidad, x, y, rotacion, max(altura, 0.05),
            recalcular=recalcular,
        )
        pset = {
            **self._leer_pset(castillo, "OPENRVT_Estructura"),
            "X": x, "Y": y, "Rotacion": rotacion, "Base": elevacion,
            "Altura": altura, "B": ancho, "H": alto,
            "AnchoDelMuro": True,
        }
        self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
        self._regenerar_estructura(castillo)
        self._guardar_liga(castillo, {"Muro": _gid(muro), "Distancia": distancia})
        self._conectar(castillo, muro)
        # O050: si el muro ya tiene cerramiento, el castillo nace en su cara
        # inferior aunque se coloque después del cerramiento.
        self._actualizar_castillos(muro)
        # O012b: con B/H del muro ya fijados, se recortan las vigas y el muro vecino.
        # O041: en la colocación por lotes se recalcula una sola vez al final.
        if recalcular:
            self._recalcular_uniones_estructura()
        return castillo

    def castillos_automaticos(
        self,
        muros: Any = None,
        separacion_max: float = 3.0,
        nivel: str | None = None,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        try:
            separacion_max = float(separacion_max)
        except (TypeError, ValueError) as exc:
            raise self._error("La separación máxima no es un número.", -32602) from exc
        if separacion_max <= 0:
            raise self._error("La separación máxima debe ser positiva.", -32602)
        if isinstance(muros, str):
            muros = [muros]
        if muros:
            lista = [self._entidad_por_gid(str(g), ("IfcWall",)) for g in muros]
        else:
            lista = list(self.modelo.by_type("IfcWall"))
            if nivel:
                lista = [
                    m for m in lista if _gid(self._nivel_de_elemento(m)) == nivel
                ]
        if not lista:
            raise self._error("No hay muros para colocar castillos.", -32602)
        tipo_entidad = self._tipo_estructura("K-1 Castillo 15×15", ("IfcColumnType",))
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        ancho = float(seccion.get("B") or 0.15)
        self._instantanea()
        creados: list[Any] = []
        omitidos: list[Any] = []

        def colocar(muro: Any, distancia: float) -> None:
            gid = _gid(muro)
            datos = self._datos_muro(muro)
            distancia = min(max(distancia, 0.0), datos["longitud"])
            for castillo in self._dependientes_de(muro):
                if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                    continue
                liga = self._leer_liga(castillo)
                if abs(float(liga.get("Distancia") or 0.0) - distancia) < 0.05:
                    omitidos.append(castillo)
                    return
            x, y, _r = self._punto_en_muro(muro, distancia)
            for castillo in self.modelo.by_type("IfcColumn"):
                if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                    continue
                p = self._leer_pset(castillo, "OPENRVT_Estructura")
                if math.hypot(
                    float(p.get("X") or 0.0) - x, float(p.get("Y") or 0.0) - y
                ) < 0.05:
                    omitidos.append(castillo)
                    return
            creados.append(self._castillo_en(tipo_entidad, muro, distancia, recalcular=False))

        # 1. Esquinas: un solo castillo por cruce, centrado en la intersección.
        esquinas: list[tuple[float, float, Any, float]] = []
        for i, a in enumerate(lista):
            for b in lista[i + 1 :]:
                if self._conexion_entre(a, b) is None:
                    continue
                punto = self._cruce_ejes_muro(a, b)
                if punto is None:
                    continue
                if any(
                    math.hypot(punto[0] - e[0], punto[1] - e[1]) < 0.05
                    for e in esquinas
                ):
                    continue
                datos_a = self._datos_muro(a)
                t = (
                    (punto[0] - datos_a["x1"]) * datos_a["dx"]
                    + (punto[1] - datos_a["y1"]) * datos_a["dy"]
                )
                if -TOLERANCIA <= t <= datos_a["longitud"] + TOLERANCIA:
                    esquinas.append((punto[0], punto[1], a, min(max(t, 0.0), datos_a["longitud"])))
                else:
                    datos_b = self._datos_muro(b)
                    tb = (
                        (punto[0] - datos_b["x1"]) * datos_b["dx"]
                        + (punto[1] - datos_b["y1"]) * datos_b["dy"]
                    )
                    esquinas.append((punto[0], punto[1], b, min(max(tb, 0.0), datos_b["longitud"])))
        for _x, _y, muro, distancia in esquinas:
            colocar(muro, distancia)

        # 2. Remates: la cara del castillo queda al ras del extremo libre.
        for muro in lista:
            datos = self._datos_muro(muro)
            inicio_libre = self._extremo_libre(muro, True, lista)
            fin_libre = self._extremo_libre(muro, False, lista)
            if inicio_libre:
                colocar(muro, ancho / 2.0)
            if fin_libre:
                colocar(muro, datos["longitud"] - ancho / 2.0)

        # 3. Intermedios: repartidos para que ninguna separación pase del máximo.
        for muro in lista:
            datos = self._datos_muro(muro)
            # Se miran todos los castillos del modelo proyectados sobre este muro: en
            # una esquina el castillo puede estar alojado en el muro vecino y aun así
            # contar como extremo de este.
            existentes = sorted(
                distancia
                for distancia in (
                    self._distancia_de_castillo(muro, castillo)
                    for castillo in self.modelo.by_type("IfcColumn")
                    if self._estructura_de_tipo(self._tipo_entidad(castillo)) == "castillo"
                )
                if distancia is not None
            )
            if not existentes:
                existentes = [0.0, datos["longitud"]]
            puntos = list(existentes)
            for a, b in zip(existentes, existentes[1:]):
                tramo = b - a
                if tramo <= TOLERANCIA_CALCULO:
                    continue
                n = int(math.ceil(tramo / separacion_max - 1e-9))
                for k in range(1, n):
                    puntos.append(a + tramo * k / n)
            for distancia in sorted(set(round(p, 6) for p in puntos)):
                if any(abs(distancia - e) < 0.05 for e in existentes):
                    continue
                colocar(muro, distancia)
        # O041: todos los castillos creados; una sola regeneración de los muros
        # afectados y sus dependientes (antes se hacía por cada castillo).
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=f"{len(creados)} castillo(s) automático(s); {len(omitidos)} omitido(s).",
            omitidos=[_gid(o) for o in omitidos],
        )

    def _distancia_de_castillo(self, muro: Any, castillo: Any) -> float | None:
        datos = self._datos_muro(muro)
        pset = self._leer_pset(castillo, "OPENRVT_Estructura")
        x = float(pset.get("X") or 0.0)
        y = float(pset.get("Y") or 0.0)
        t = (x - datos["x1"]) * datos["dx"] + (y - datos["y1"]) * datos["dy"]
        perpendicular = abs(-(x - datos["x1"]) * datos["dy"] + (y - datos["y1"]) * datos["dx"])
        nucleo, _centro = self._capas_nucleo(muro)
        if perpendicular > max(nucleo, datos["espesor"]) / 2.0 + 0.1:
            return None
        if t < -TOLERANCIA or t > datos["longitud"] + TOLERANCIA:
            return None
        return min(max(t, 0.0), datos["longitud"])

    def _extremo_libre(self, muro: Any, inicio: bool, muros: list[Any]) -> bool:
        datos = self._datos_muro(muro)
        px = datos["x1"] if inicio else datos["x2"]
        py = datos["y1"] if inicio else datos["y2"]
        for otro in muros:
            if otro == muro:
                continue
            if self._conexion_entre(muro, otro) is None:
                continue
            od = self._datos_muro(otro)
            for qx, qy in ((od["x1"], od["y1"]), (od["x2"], od["y2"])):
                if math.hypot(px - qx, py - qy) <= TOLERANCIA:
                    return False
            proyeccion = self._proyectar_en_eje(px, py, od["x1"], od["y1"], od["x2"], od["y2"])
            if proyeccion is None:
                continue
            t, _qx, _qy, separacion = proyeccion
            if 0.01 < t < 0.99 and separacion <= od["espesor"] / 2.0 + TOLERANCIA:
                return False
        return True

    def _cruce_ejes_muro(self, a: Any, b: Any) -> tuple[float, float] | None:
        da, db = self._datos_muro(a), self._datos_muro(b)
        den = da["dx"] * db["dy"] - da["dy"] * db["dx"]
        if abs(den) <= TOLERANCIA_CALCULO:
            return None
        t = (
            (db["x1"] - da["x1"]) * db["dy"] - (db["y1"] - da["y1"]) * db["dx"]
        ) / den
        return (da["x1"] + da["dx"] * t, da["y1"] + da["dy"] * t)
