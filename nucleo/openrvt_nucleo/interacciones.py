"""O007c: interacciones entre muros, castillos, cerramientos, dalas y estructura.

Las ligas viven en el pset ``OPENRVT_Liga`` de la instancia dependiente (los psets
mandan). Además se crea la relación IFC estándar ``IfcRelConnectsElements`` para el
intercambio: muro → castillo/cerramiento/dala y zapata → columna.
"""

from __future__ import annotations

import math
from typing import Any

import ifcopenshell
import ifcopenshell.api.root as root
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api

from .modelado import (
    PSET_RESTRICCIONES,
    TOLERANCIA,
    TOLERANCIA_CALCULO,
    _gid,
    _nombre,
    _texto,
)
from . import uniones

LIGA = "OPENRVT_Liga"
PRIORIDAD = {
    "zapata": 0,
    "zapata_corrida": 0,
    "contratrabe": 1,
    "columna": 2,
    "trabe": 3,
    "losa": 4,
    "castillo": 5,
    "cerramiento": 6,
    "dala": 6,
    "muro": 7,
    "acabado": 8,
}

# Largo de referencia para expresar el acero de una pieza tipo en kg/m (O007c §7).
LARGOS_REFERENCIA = {
    "columna": 3.00,
    "castillo": 3.00,
    "trabe": 4.00,
    "cerramiento": 4.00,
    "dala": 4.00,
    "contratrabe": 4.00,
    "zapata_corrida": 4.00,
}


class InteraccionesMixin:
    """Ligas, alojamiento en el muro, retícula y cuantificación por prioridad."""

    # ------------------------------------------------------------------ ligas
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

    # ------------------------------------------------------------------ núcleo del muro
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

    # ------------------------------------------------------- O054: medida real
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

    # ------------------------------------------------------------------ columnas / vigas base
    def _columna_nueva(
        self,
        tipo_entidad: Any,
        nivel_entidad: Any,
        x: float,
        y: float,
        rotacion: float,
        altura: float,
        recalcular: bool = True,
    ) -> tuple[Any, float]:
        elevacion = float(nivel_entidad.Elevation or 0.0)
        if altura <= 0:
            raise self._error("La altura de la columna debe ser positiva.", -32602)
        columna = root.create_entity(self.modelo, ifc_class="IfcColumn")
        alias = self._estructura_de_tipo(tipo_entidad) or "columna"
        columna.Name = f"{alias.capitalize()} {_nombre(tipo_entidad)}"
        type_api.assign_type(
            self.modelo, related_objects=[columna], relating_type=tipo_entidad
        )
        self._guardar_pset(
            columna,
            "OPENRVT_Estructura",
            {
                "X": x, "Y": y, "Rotacion": rotacion, "Base": elevacion,
                "Nivel": _gid(nivel_entidad), "NivelSuperior": "",
                "Altura": altura,
            },
        )
        self._regenerar_estructura(columna)
        spatial_api.assign_container(
            self.modelo, products=[columna], relating_structure=nivel_entidad
        )
        # O041: en lotes se recalcula una sola vez al final.
        if recalcular:
            self._recalcular_uniones_estructura()
        return columna, elevacion

    def _viga_nueva(
        self,
        tipo_entidad: Any,
        nivel_entidad: Any,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        desfase: float = 0.0,
    ) -> Any:
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("La viga necesita dos puntos distintos.", -32602)
        alias = self._estructura_de_tipo(tipo_entidad) or "trabe"
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        alto = float(seccion.get("H") or 0.40)
        elevacion = float(nivel_entidad.Elevation or 0.0)
        clase = "IfcFooting" if tipo_entidad.is_a("IfcFootingType") else "IfcBeam"
        viga = root.create_entity(self.modelo, ifc_class=clase)
        viga.Name = f"{alias.capitalize()} {_nombre(tipo_entidad)}"
        type_api.assign_type(self.modelo, related_objects=[viga], relating_type=tipo_entidad)
        lecho_bajo = alias == "dala"
        centro = elevacion + (alto / 2.0 if lecho_bajo else desfase - alto / 2.0)
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {
                "X1": x1, "Y1": y1, "X2": x2, "Y2": y2, "Longitud": largo,
                "Desfase": desfase, "Z": centro, "Nivel": _gid(nivel_entidad),
            },
        )
        self._regenerar_estructura(viga)
        spatial_api.assign_container(
            self.modelo, products=[viga], relating_structure=nivel_entidad
        )
        self._recalcular_uniones_estructura()
        return viga

    # ------------------------------------------------------------------ castillos
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

    # ------------------------------------------------------------------ cerramiento y dala
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

    def _reparar_ancho_del_muro(self) -> int:
        """O061 regla 3: AnchoDelMuro = True recupera el espesor real del muro."""
        reparados = 0
        for viga in list(self.modelo.by_type("IfcBeam")):
            if not self._es_cerramiento(viga):
                continue
            pset = dict(self._leer_pset(viga, "OPENRVT_Estructura"))
            if not pset:
                continue
            if not self._del_nucleo(pset.get("AnchoDelMuro", True)):
                continue
            muros = self._muros_de_cerramiento(viga)
            if not muros:
                continue
            ancho = max(self._capas_nucleo(muro)[0] for muro in muros)
            if abs(float(pset.get("B") or 0.0) - ancho) <= TOLERANCIA_CALCULO:
                continue
            pset["B"] = ancho
            self._guardar_pset(viga, "OPENRVT_Estructura", pset)
            self._regenerar_estructura(viga)
            reparados += 1
        return reparados

    def validar_cerramientos(self) -> list[dict[str, Any]]:
        """O057: reporta cerramientos mal ligados o fuera del storey de su base."""
        self._exigir_modelo()
        problemas: list[dict[str, Any]] = []
        for viga in self.modelo.by_type("IfcBeam"):
            if not self._es_cerramiento(viga):
                continue
            motivos: list[str] = []
            restriccion = self._restricciones_de(viga)
            gid_nivel = _texto(restriccion.get("NivelBase"))
            nivel = None
            if not gid_nivel:
                motivos.append("sin_nivel")
            else:
                nivel = self._nivel_por_gid(gid_nivel)
                contenedor = self._nivel_de_elemento(viga)
                if _gid(contenedor) != gid_nivel:
                    motivos.append("storey_incorrecto")
            liga = self._leer_liga(viga)
            muro_gid = _texto(liga.get("Muro"))
            if muro_gid and nivel is not None:
                tramos, _nivel = self._muros_validos_cerramiento(viga)
                correctos = {_gid(tramo["muro"]) for tramo in tramos}
                if muro_gid not in correctos:
                    motivos.append("muro_incorrecto")
            if motivos:
                problemas.append(
                    {"globalid": _gid(viga), "motivos": motivos}
                )
        return problemas

    def reparar_cerramientos(self) -> dict[str, Any]:
        """O057: recoloca los cerramientos mal ligados y respeta el tope del usuario."""
        self._exigir_modelo()
        self._instantanea()
        reparados: list[Any] = []
        borrados: list[str] = []
        for viga in list(self.modelo.by_type("IfcBeam")):
            if not self._es_cerramiento(viga):
                continue
            restriccion = self._restricciones_de(viga)
            gid_nivel = _texto(restriccion.get("NivelBase"))
            if not gid_nivel:
                continue
            nivel = self._nivel_por_gid(gid_nivel)
            if _gid(self._nivel_de_elemento(viga)) != gid_nivel:
                spatial_api.assign_container(
                    self.modelo, products=[viga], relating_structure=nivel
                )
            liga = self._leer_liga(viga)
            muro_gid = _texto(liga.get("Muro"))
            if not muro_gid:
                continue
            tramos, _nivel = self._muros_validos_cerramiento(viga)
            correctos = {_gid(tramo["muro"]) for tramo in tramos}
            if muro_gid in correctos:
                continue
            # El muro ligado no es el que sostiene el cerramiento. Si ya hay un
            # cerramiento válido en el muro correcto y el mismo nivel, este es el
            # duplicado que dejó el error del paso 5: se borra. Si no, se re-liga.
            duplicado = False
            destino: dict[str, Any] | None = None
            for tramo in tramos:
                for dependiente in self._dependientes_de(tramo["muro"]):
                    if dependiente == viga or not self._es_cerramiento(dependiente):
                        continue
                    if _texto(
                        self._restricciones_de(dependiente).get("NivelBase")
                    ) != gid_nivel:
                        continue
                    otra = self._leer_liga(dependiente)
                    if otra.get("Inicio") is None:
                        a, b = 0.0, self._datos_muro(tramo["muro"])["longitud"]
                    else:
                        a = float(otra.get("Inicio") or 0.0)
                        b = float(otra.get("Fin") or a)
                    if (
                        min(b, tramo["fin"]) - max(a, tramo["inicio"])
                        > TOLERANCIA
                    ):
                        duplicado = True
                        break
                if duplicado:
                    break
                if destino is None:
                    destino = tramo
            if duplicado:
                self._quitar_conexiones(viga)
                borrados.append(_gid(viga))
                self.modelo.remove(viga)
                continue
            if destino is not None:
                self._guardar_liga(
                    viga,
                    {
                        **liga,
                        "Muro": _gid(destino["muro"]),
                        "Inicio": float(destino["inicio"]),
                        "Fin": float(destino["fin"]),
                        "Completo": False,
                    },
                )
                self._conectar(viga, destino["muro"])
            else:
                self._quitar_claves_pset(viga, LIGA, ("Muro", "Inicio", "Fin", "Completo"))
                self._quitar_conexiones(viga)
            reparados.append(viga)
        # Los castillos con NivelTope del usuario recuperan su altura real (regla 2).
        muros: dict[int, Any] = {}
        for castillo in self.modelo.by_type("IfcColumn"):
            if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                continue
            liga = self._leer_liga(castillo)
            if not liga.get("Muro"):
                continue
            try:
                muro = self._entidad_por_gid(_texto(liga["Muro"]), ("IfcWall",))
            except Exception:
                continue
            muros[id(muro)] = muro
        for muro in muros.values():
            self._actualizar_castillos(muro)
        self.con_cambios = True
        return self._resultado(
            reparados,
            borrados=borrados,
            mensaje=f"{len(reparados)} cerramiento(s) reparado(s); {len(borrados)} borrado(s).",
        )

    def _cerramiento_tramo(
        self,
        tipo_entidad: Any,
        muro: Any | None,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        restriccion: dict[str, Any],
        inicio: float | None = None,
        fin: float | None = None,
    ) -> Any:
        """Crea un cerramiento embebido en un tramo; sin muro queda libre.

        O057: el cerramiento se contiene siempre en el storey de su NivelBase,
        aunque cuelgue de un muro de otro nivel.
        """
        nivel_restriccion = self._nivel_por_gid(
            _texto(restriccion.get("NivelBase"))
        )
        nucleo = (
            self._capas_nucleo(muro)[0]
            if muro is not None
            else float(self._seccion_y_armado(tipo_entidad)[1].get("B") or 0.15)
        )
        elevacion = float(nivel_restriccion.Elevation or 0.0)
        desfase = float(restriccion.get("DesfaseBase") or 0.0)
        tope = elevacion + desfase
        alto = float(self._seccion_y_armado(tipo_entidad)[1].get("H") or 0.20)
        viga = self._viga_nueva(
            tipo_entidad,
            nivel_restriccion,
            x1, y1, x2, y2,
            desfase,
        )
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {
                **self._leer_pset(viga, "OPENRVT_Estructura"),
                "B": nucleo, "AnchoDelMuro": True,
                "Z": tope - alto / 2.0,
                "Nivel": restriccion["NivelBase"],
                "Desfase": restriccion["DesfaseBase"],
            },
        )
        self._regenerar_estructura(viga)
        self._guardar_pset(viga, PSET_RESTRICCIONES, restriccion)
        if muro is not None:
            datos_muro = self._datos_muro(muro)
            completo = float(inicio or 0.0) <= TOLERANCIA and float(
                fin or 0.0
            ) >= datos_muro["longitud"] - TOLERANCIA
            self._guardar_liga(
                viga,
                {
                    "Muro": _gid(muro),
                    "Inicio": float(inicio or 0.0),
                    "Fin": float(fin or 0.0),
                    "Completo": completo,
                },
            )
            self._conectar(viga, muro)
        return viga

    def _lineal_en_muro(
        self,
        tipo: str,
        muro: str,
        esperado: str,
        nivel_elegido: str | None = None,
        desfase_elegido: float | None = None,
        desde_planta: bool = False,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcBeamType",))
        if self._estructura_de_tipo(tipo_entidad) != esperado:
            raise self._error(f"El tipo no es un {esperado}.", -32602)
        muro_entidad = self._entidad_por_gid(muro, ("IfcWall",))
        datos = self._datos_muro(muro_entidad)
        nivel = self._nivel_de_elemento(muro_entidad)
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        alto = float(seccion.get("H") or 0.20)
        nucleo, _centro = self._capas_nucleo(muro_entidad)
        restriccion_cerramiento: dict[str, Any] | None = None
        explicito = False
        if esperado == "cerramiento":
            # O043: el nivel del cerramiento sale del elegido o del tope del muro,
            # y nunca se crea otro cerramiento en el mismo nivel del mismo muro.
            restriccion_cerramiento = self._restricciones_cerramiento_ligado(
                muro_entidad
            )
            explicito = bool(nivel_elegido) or desfase_elegido is not None
            if explicito:
                if nivel_elegido:
                    restriccion_cerramiento["NivelBase"] = _gid(
                        self._nivel_por_gid(str(nivel_elegido))
                    )
                if desfase_elegido is not None:
                    try:
                        restriccion_cerramiento["DesfaseBase"] = float(desfase_elegido)
                    except (TypeError, ValueError) as exc:
                        raise self._error("El desfase no es un número.", -32602) from exc
            nivel_destino = _texto(restriccion_cerramiento.get("NivelBase"))
            if nivel_destino:
                for dependiente in self._dependientes_de(muro_entidad):
                    if (
                        self._estructura_de_tipo(self._tipo_entidad(dependiente))
                        != "cerramiento"
                    ):
                        continue
                    existente = _texto(
                        self._restricciones_de(dependiente).get("NivelBase")
                    )
                    if existente == nivel_destino:
                        nivel_entidad = self._nivel_por_gid(nivel_destino)
                        raise self._error(
                            f"Ese muro ya tiene cerramiento en {_nombre(nivel_entidad)}.",
                            -32602,
                        )
        self._instantanea()
        if esperado == "cerramiento":
            desfase = datos["z"] + datos["altura"]
        else:
            desfase = datos["z"] + alto
        viga = self._viga_nueva(
            tipo_entidad, nivel, datos["x1"], datos["y1"], datos["x2"], datos["y2"], desfase
        )
        centro = (
            datos["z"] + datos["altura"] - alto / 2.0
            if esperado == "cerramiento"
            else datos["z"] + alto / 2.0
        )
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {
                **self._leer_pset(viga, "OPENRVT_Estructura"),
                "B": nucleo, "AnchoDelMuro": True,
                "Z": centro,
            },
        )
        self._regenerar_estructura(viga)
        self._guardar_liga(
            viga,
            {"Muro": _gid(muro_entidad), "Completo": esperado == "cerramiento"},
        )
        if esperado == "cerramiento":
            restriccion = restriccion_cerramiento or self._restricciones_cerramiento_ligado(
                muro_entidad
            )
            # O041: la barra de opciones deja elegir nivel y desfase antes del
            # clic; el desfase se mide del nivel a la cara superior.
            self._guardar_pset(viga, PSET_RESTRICCIONES, restriccion)
            # O057: el cerramiento vive en el storey de su NivelBase, no en el
            # del muro del que cuelga (regla 3).
            nivel_base_cerramiento = self._nivel_por_gid(
                _texto(restriccion.get("NivelBase"))
            )
            if nivel_base_cerramiento is not None:
                spatial_api.assign_container(
                    self.modelo,
                    products=[viga],
                    relating_structure=nivel_base_cerramiento,
                )
            self._guardar_pset(
                viga,
                "OPENRVT_Estructura",
                {
                    **self._leer_pset(viga, "OPENRVT_Estructura"),
                    "Nivel": restriccion["NivelBase"],
                    "Desfase": restriccion["DesfaseBase"],
                },
            )
            if explicito:
                # Recalcula Z en la misma instantánea (un solo paso de Deshacer).
                # O045: el cerramiento va embebido; el muro conserva su altura.
                self._aplicar_restriccion(viga, restriccion)
        self._conectar(viga, muro_entidad)
        if esperado == "cerramiento":
            self._actualizar_castillos(muro_entidad)
        self._actualizar_dependientes_muro(muro_entidad)
        self.con_cambios = True
        return self._resultado(
            [viga],
            modificados=[muro_entidad],
            mensaje=f"{esperado.capitalize()} ligado al muro ({datos['longitud']:.2f} m).",
        )

    def soltar_del_muro(self, globalid: str) -> dict[str, Any]:
        """O040: suelta un cerramiento o dala de su muro, dejándolo donde está."""
        self._exigir_modelo()
        entidad = self._entidad_por_gid(str(globalid), ("IfcBeam",))
        liga = dict(self._leer_liga(entidad))
        if not liga.get("Muro"):
            raise self._error("El elemento no está ligado a un muro.", -32602)
        self._instantanea()
        self._quitar_claves_pset(
            entidad, LIGA, ("Muro", "Distancia", "Inicio", "Fin", "Completo")
        )
        self._quitar_conexiones(entidad)
        self.con_cambios = True
        return self._resultado([entidad], mensaje="Soltado del muro.")

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

    # ------------------------------------------------------------------ retícula
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

    # ------------------------------------------------------------------ zapata bajo columna
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

    # ------------------------------------------------------------------ contratrabes y trabes
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

    # ------------------------------------------------------------------ cantidades
    def cantidades_estructura(self, nivel: str | None = None) -> dict[str, Any]:
        self._exigir_modelo()
        from shapely.geometry import Polygon
        from shapely.ops import unary_union

        elementos: list[dict[str, Any]] = []
        piezas: list[dict[str, Any]] = []
        for elemento in self.modelo.by_type("IfcElement"):
            if not self._es_elemento(elemento):
                continue
            if elemento.is_a("IfcDoor") or elemento.is_a("IfcWindow"):
                continue
            if nivel and _gid(self._nivel_de_elemento(elemento)) != nivel:
                continue
            info = self._piezas_de_elemento(elemento)
            if info is None or not info["piezas"]:
                continue
            for pieza in info["piezas"]:
                piezas.append({**pieza, "indice": len(elementos)})
            elementos.append(info)
        if not piezas:
            return {
                "elementos": [], "totales_por_tipo": {}, "total": {
                    "volumen_bruto_m3": 0.0, "volumen_neto_m3": 0.0, "acero_kg": 0.0,
                },
            }
        # Rebanadas en z por todas las elevaciones de inicio y fin.
        zetas = sorted({
            round(z, 6)
            for pieza in piezas
            for z in (pieza["z0"], pieza["z1"])
        })
        union_total = 0.0
        neto_por_indice: dict[int, float] = {i: 0.0 for i in range(len(elementos))}
        for z0, z1 in zip(zetas, zetas[1:]):
            dz = z1 - z0
            if dz <= TOLERANCIA_CALCULO:
                continue
            z = (z0 + z1) / 2.0
            activas = [p for p in piezas if p["z0"] <= z < p["z1"]]
            if not activas:
                continue
            agrupadas: dict[int, dict[str, Any]] = {}
            for pieza in activas:
                poligono = pieza["poligono"]()
                if poligono is None or poligono.is_empty:
                    continue
                grupo = agrupadas.setdefault(
                    pieza["indice"],
                    {"prioridad": pieza["prioridad"], "poligonos": []},
                )
                grupo["poligonos"].append(poligono)
            if not agrupadas:
                continue
            # Se asigna cada punto al elemento de mayor prioridad. Dentro de la misma
            # prioridad el orden por GlobalId es estable, de modo que la suma de netos
            # es exactamente el volumen de la unión (sin contar dos veces traslapes).
            ordenadas = sorted(
                agrupadas.items(),
                key=lambda par: (par[1]["prioridad"], elementos[par[0]]["globalid"]),
            )
            acumulado = None
            for indice, grupo in ordenadas:
                propio = unary_union(grupo["poligonos"])
                neto = propio if acumulado is None else propio.difference(acumulado)
                neto_por_indice[indice] += neto.area * dz
                acumulado = propio if acumulado is None else unary_union([acumulado, propio])
            if acumulado is not None:
                union_total += acumulado.area * dz
        for indice, info in enumerate(elementos):
            bruto = info.get("volumen_bruto_m3", 0.0)
            neto = neto_por_indice[indice]
            if info["alias"] == "zapata_corrida":
                # El bruto es el área real de la sección; el neto usa el prisma completo.
                neto = info.get("volumen_neto_aproximado", neto)
            info["volumen_bruto_m3"] = round(bruto, 6)
            info["volumen_neto_m3"] = round(neto, 6)
            info["acero_kg"] = round(info.get("acero_kg", 0.0), 3)
            info.pop("piezas", None)
            info.pop("volumen_neto_aproximado", None)
        totales: dict[str, dict[str, float]] = {}
        for info in elementos:
            tipo = info["tipo"] or info["clase"]
            acumulado = totales.setdefault(
                tipo, {"volumen_bruto_m3": 0.0, "volumen_neto_m3": 0.0, "acero_kg": 0.0}
            )
            acumulado["volumen_bruto_m3"] += info["volumen_bruto_m3"]
            acumulado["volumen_neto_m3"] += info["volumen_neto_m3"]
            acumulado["acero_kg"] += info["acero_kg"]
        for acumulado in totales.values():
            for clave in acumulado:
                acumulado[clave] = round(acumulado[clave], 6)
        return {
            "elementos": elementos,
            "totales_por_tipo": totales,
            "total": {
                "volumen_bruto_m3": round(
                    sum(i["volumen_bruto_m3"] for i in elementos), 6
                ),
                "volumen_neto_m3": round(
                    sum(i["volumen_neto_m3"] for i in elementos), 6
                ),
                "acero_kg": round(sum(i["acero_kg"] for i in elementos), 3),
            },
            "union_m3": round(union_total, 6),
        }

    def _partir_base_muro_por_bajadas(
        self,
        base: Any,
        z0: float,
        bajadas: list[tuple[float, float, float]],
        datos: dict[str, Any],
    ) -> list[tuple[Any, float]]:
        """O035: parte la huella del muro en tramos con su cota de base."""
        if not bajadas:
            return [(base, z0)]
        from shapely.geometry import LineString
        from shapely.ops import split

        ux, uy = float(datos["dx"]), float(datos["dy"])
        nx, ny = -uy, ux
        x1, y1 = float(datos["x1"]), float(datos["y1"])
        piezas = [base]
        for u in sorted({u for a, b, _z in bajadas for u in (a, b)}):
            if u <= TOLERANCIA_CALCULO:
                continue
            px, py = x1 + ux * u, y1 + uy * u
            corte = LineString(
                [
                    (px - nx * 1e5, py - ny * 1e5),
                    (px + nx * 1e5, py + ny * 1e5),
                ]
            )
            nuevas: list[Any] = []
            for pieza in piezas:
                if pieza.is_empty or not corte.intersects(pieza):
                    nuevas.append(pieza)
                    continue
                try:
                    nuevas.extend(list(split(pieza, corte).geoms))
                except Exception:
                    nuevas.append(pieza)
            piezas = nuevas
        salida: list[tuple[Any, float]] = []
        for pieza in piezas:
            if pieza.is_empty or pieza.area <= TOLERANCIA_CALCULO:
                continue
            punto = pieza.representative_point()
            u, _v = self._punto_en_local(datos, punto.x, punto.y)
            z = z0
            for u0, u1, cara in bajadas:
                if u0 < u < u1:
                    z = cara
                    break
            salida.append((pieza, z))
        return salida or [(base, z0)]

    def _area_embebida_muro(
        self, muro: Any, datos: dict[str, Any], nucleo: float
    ) -> float:
        """O045: área del muro ocupada por cerramientos y castillos embebidos.

        Se mide en el plano del muro (largo × alto) y se limita al espesor del
        núcleo. La huella de los castillos ya viene recortada en la base del muro;
        por eso se suma su unión y luego se le resta la de los propios castillos,
        para no descontarla dos veces.
        """
        if nucleo <= TOLERANCIA_CALCULO:
            return 0.0
        from shapely.geometry import box
        from shapely.ops import unary_union

        def area_de(cajas: list[Any]) -> float:
            if not cajas:
                return 0.0
            return float(unary_union(cajas).area)

        cerramientos: list[Any] = []
        castillos: list[Any] = []
        for dependiente in self._dependientes_de(muro):
            alias = self._estructura_de_tipo(self._tipo_entidad(dependiente))
            if alias not in ("cerramiento", "castillo"):
                continue
            pset = self._leer_pset(dependiente, "OPENRVT_Estructura")
            if not pset:
                continue
            alto = float(pset.get("H") or self._peralte_de(dependiente) or 0.20)
            if alias == "cerramiento":
                x1 = float(pset.get("X1") or 0.0)
                y1 = float(pset.get("Y1") or 0.0)
                x2 = float(pset.get("X2") or 0.0)
                y2 = float(pset.get("Y2") or 0.0)
                u1 = (x1 - datos["x1"]) * datos["dx"] + (
                    y1 - datos["y1"]
                ) * datos["dy"]
                u2 = (x2 - datos["x1"]) * datos["dx"] + (
                    y2 - datos["y1"]
                ) * datos["dy"]
                z = float(pset.get("Z") or 0.0)
                z0 = max(float(datos["z"]), z - alto / 2.0)
                z1 = min(float(datos["z"]) + float(datos["altura"]), z + alto / 2.0)
            else:
                liga = self._leer_liga(dependiente)
                distancia = float(liga.get("Distancia") or 0.0)
                ancho = float(
                    pset.get("B")
                    or self._seccion_y_armado(self._tipo_entidad(dependiente))[1].get(
                        "B"
                    )
                    or 0.15
                )
                u1 = distancia - ancho / 2.0
                u2 = distancia + ancho / 2.0
                # O050: el castillo ya no atraviesa el cerramiento, pero la huella
                # del muro lo excluye en todo su alto; para descontar bien el
                # cerramiento se proyecta el castillo a la altura completa.
                z0 = float(datos["z"])
                z1 = float(datos["z"]) + float(datos["altura"])
            u1, u2 = max(0.0, min(u1, u2)), min(datos["longitud"], max(u1, u2))
            if u2 - u1 <= TOLERANCIA_CALCULO or z1 - z0 <= TOLERANCIA_CALCULO:
                continue
            (cerramientos if alias == "cerramiento" else castillos).append(
                box(u1, z0, u2, z1)
            )
        if not cerramientos:
            return 0.0
        if not castillos:
            return area_de(cerramientos)
        return max(area_de(cerramientos + castillos) - area_de(castillos), 0.0)

    def _piezas_de_elemento(self, elemento: Any) -> dict[str, Any] | None:
        from shapely.geometry import Polygon

        clase = elemento.is_a()
        tipo_entidad = self._tipo_entidad(elemento)
        alias = self._estructura_de_tipo(tipo_entidad)
        if elemento.is_a("IfcWall"):
            alias = "muro"
        elif elemento.is_a("IfcSlab"):
            alias = "losa"
        if alias is None:
            return None
        pset = self._leer_pset(elemento, "OPENRVT_Estructura")
        tipo_nombre = _nombre(tipo_entidad)
        acero = 0.0
        try:
            if alias not in ("muro", "losa"):
                acero = float(self.acero_estimar(_gid(elemento)).get("total_kg") or 0.0)
        except Exception:
            acero = 0.0
        piezas: list[dict[str, Any]] = []
        bruto = 0.0
        detalle: dict[str, Any] = {}
        area_neta = None

        def caja(cx: float, cy: float, rot: float, largo: float, ancho: float,
                 z0: float, z1: float, volumen: float | None = None) -> None:
            coseno, seno = math.cos(rot), math.sin(rot)
            puntos = []
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = sx * largo / 2.0, sy * ancho / 2.0
                puntos.append((cx + lx * coseno - ly * seno, cy + lx * seno + ly * coseno))
            poligono = Polygon(puntos)
            piezas.append(
                {
                    "poligono": (lambda p=poligono: p),
                    "z0": z0, "z1": z1,
                    "prioridad": PRIORIDAD.get(alias, 9),
                    "volumen": volumen,
                }
            )
            return poligono.area * (z1 - z0) if volumen is None else volumen

        if alias in ("columna", "castillo"):
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            b = float(pset.get("B") or seccion.get("B") or 0.30)
            h = float(pset.get("H") or seccion.get("H") or 0.30)
            if _texto(seccion.get("Forma")) == "circular" and not pset.get("B"):
                b = h = float(seccion.get("D") or 0.30)
            base = float(pset.get("Base") or 0.0)
            alto = float(pset.get("Altura") or 0.0)
            bruto = caja(
                float(pset.get("X") or 0.0), float(pset.get("Y") or 0.0),
                float(pset.get("Rotacion") or 0.0), b, h, base, base + alto,
            )
        elif alias in ("trabe", "cerramiento", "dala", "contratrabe"):
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            b = float(pset.get("B") or seccion.get("B") or 0.20)
            h = float(pset.get("H") or seccion.get("H") or 0.40)
            x1, y1 = float(pset.get("X1") or 0.0), float(pset.get("Y1") or 0.0)
            x2, y2 = float(pset.get("X2") or 0.0), float(pset.get("Y2") or 0.0)
            largo = math.hypot(x2 - x1, y2 - y1)
            if largo <= TOLERANCIA_CALCULO:
                return None
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            rot = math.atan2(uy, ux)
            z = float(pset.get("Z") or 0.0)
            bruto = b * h * largo
            # O012: el neto sale de los tramos ya recortados por las uniones.
            tramos = self._tramos_de_viga(elemento)
            for s0, s1 in tramos:
                if s1 - s0 <= TOLERANCIA_CALCULO:
                    continue
                cx = x1 + ux * (s0 + s1) / 2.0
                cy = y1 + uy * (s0 + s1) / 2.0
                caja(cx, cy, rot, s1 - s0, b, z - h / 2.0, z + h / 2.0)
        elif alias == "zapata":
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            largo = float(seccion.get("Largo") or 1.20)
            ancho = float(seccion.get("Ancho") or 1.20)
            peralte = float(seccion.get("Peralte") or 0.25)
            plantilla = float(seccion.get("Plantilla") or 0.05)
            dado_b = float(seccion.get("DadoB") or 0.0)
            dado_h = float(seccion.get("DadoH") or 0.0)
            dado_alto = float(seccion.get("DadoAlto") or 0.0)
            z = float(pset.get("Z") or 0.0)
            cx, cy = float(pset.get("X") or 0.0), float(pset.get("Y") or 0.0)
            rot = float(pset.get("Rotacion") or 0.0)
            if plantilla > 0:
                bruto += caja(cx, cy, rot, largo, ancho, z - plantilla, z)
            bruto += caja(cx, cy, rot, largo, ancho, z, z + peralte)
            if dado_b > 0 and dado_h > 0 and dado_alto > 0:
                bruto += caja(cx, cy, rot, dado_b, dado_h, z + peralte, z + peralte + dado_alto)
        elif alias == "zapata_corrida":
            _, seccion, _ = self._seccion_y_armado(tipo_entidad)
            ancho = float(seccion.get("Ancho") or 0.60)
            peralte = float(seccion.get("Peralte") or 0.20)
            corona = float(seccion.get("Corona") or 0.0)
            plantilla = float(seccion.get("Plantilla") or 0.05)
            x1, y1 = float(pset.get("X1") or 0.0), float(pset.get("Y1") or 0.0)
            x2, y2 = float(pset.get("X2") or 0.0), float(pset.get("Y2") or 0.0)
            largo = math.hypot(x2 - x1, y2 - y1)
            if largo <= TOLERANCIA_CALCULO:
                return None
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            rot = math.atan2(uy, ux)
            z = float(pset.get("Z") or 0.0)
            area_seccion = (ancho + (corona if corona > 0 else ancho)) / 2.0 * peralte
            bruto = area_seccion * largo
            if plantilla > 0:
                bruto += ancho * plantilla * largo
            caja((x1 + x2) / 2.0, (y1 + y2) / 2.0, rot, largo, ancho,
                 z - peralte / 2.0 - plantilla, z + peralte / 2.0)
            detalle["seccion_trapecial"] = True
        elif alias == "muro":
            datos = self._datos_muro(elemento)
            nucleo, centro = self._capas_nucleo(elemento)
            x1, y1 = datos["x1"], datos["y1"]
            x2, y2 = datos["x2"], datos["y2"]
            largo = datos["longitud"]
            if largo <= TOLERANCIA_CALCULO:
                return None
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            rot = math.atan2(uy, ux)
            nx, ny = -uy * centro, ux * centro
            cx, cy = (x1 + x2) / 2.0 + nx, (y1 + y2) / 2.0 + ny
            z0, z1 = self._limites_verticales_muro_nivel(elemento, datos)
            from shapely.geometry import Polygon as _Polygon

            coseno, seno = math.cos(rot), math.sin(rot)
            puntos = []
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = sx * largo / 2.0, sy * nucleo / 2.0
                puntos.append((cx + lx * coseno - ly * seno, cy + lx * seno + ly * coseno))
            base = _Polygon(puntos)
            # O012b: el muro (y sus capas) termina en las caras de castillos y columnas.
            for columna in self.modelo.by_type("IfcColumn"):
                barra = self._barra_de_elemento(columna)
                if barra is None:
                    continue
                if min(z1, barra.z1) - max(z0, barra.z0) <= TOLERANCIA_CALCULO:
                    continue
                recorte = _Polygon(uniones.huella(barra))
                if not recorte.is_valid:
                    recorte = recorte.buffer(0)
                if not base.intersects(recorte):
                    continue
                base = base.difference(recorte)
                if base.is_empty:
                    break
            if base.is_empty:
                base = _Polygon(puntos)
            vanos = self._aberturas_del_muro(elemento)
            # O035: por tramos, la base puede bajar hasta la cimentación.
            bajadas = self._tramos_bajada_muro(elemento, datos)
            if z0 > float(datos["z"]) + TOLERANCIA_CALCULO:
                bajadas = []
            subtramos = self._partir_base_muro_por_bajadas(base, z0, bajadas, datos)
            bruto = sum(b.area * (z1 - z) for b, z in subtramos)
            # Los vanos se descuentan del cuerpo y también del volumen bruto.
            for _vano, info in vanos:
                bruto -= info["ancho"] * info["alto"] * nucleo
            for sub, z_base in subtramos:
                for _vano, info in vanos:
                    vz0 = float(datos["z"]) + info["antepecho"]
                    vz1 = vz0 + info["alto"]
                    a, b = max(z_base, vz0), min(z1, vz1)
                    if b - a <= TOLERANCIA_CALCULO:
                        continue
                    vx = x1 + ux * (info["distancia"] + info["ancho"] / 2.0)
                    vy = y1 + uy * (info["distancia"] + info["ancho"] / 2.0)
                    vcos, vsen = math.cos(rot), math.sin(rot)
                    vp = []
                    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                        lx, ly = sx * info["ancho"] / 2.0, sy * (nucleo + 0.02) / 2.0
                        vp.append((vx + lx * vcos - ly * vsen, vy + lx * vsen + ly * vcos))
                    hueco = _Polygon(vp)
                    piezas.append(
                        {
                            "poligono": (lambda p=sub, h=hueco: p.difference(h)),
                            "z0": a, "z1": b,
                            "prioridad": PRIORIDAD["muro"],
                            "volumen": None,
                        }
                    )
                # Rebanadas fuera de los vanos: el polígono completo.
                fronteras = sorted({
                    z_base, z1,
                    *[
                        max(z_base, min(z1, float(datos["z"]) + info["antepecho"]))
                        for _v, info in vanos
                    ],
                    *[
                        max(
                            z_base,
                            min(
                                z1,
                                float(datos["z"])
                                + info["antepecho"]
                                + info["alto"],
                            ),
                        )
                        for _v, info in vanos
                    ],
                })
                for a, b in zip(fronteras, fronteras[1:]):
                    if b - a <= TOLERANCIA_CALCULO:
                        continue
                    medio = (a + b) / 2.0
                    cubierto = any(
                        float(datos["z"]) + info["antepecho"]
                        < medio
                        < float(datos["z"]) + info["antepecho"] + info["alto"]
                        for _v, info in vanos
                    )
                    if cubierto:
                        continue
                    piezas.append(
                        {
                            "poligono": (lambda p=sub: p),
                            "z0": a, "z1": b,
                            "prioridad": PRIORIDAD["muro"],
                            "volumen": None,
                        }
                    )
            # Área neta del núcleo: largo efectivo del sólido recortado por la altura
            # también recortada, menos los vanos.
            area_neta = (
                sum(b.area * (z1 - z) for b, z in subtramos) / nucleo
                if nucleo > TOLERANCIA_CALCULO
                else sum(b.area * (z1 - z) for b, z in subtramos)
            )
            for _vano, info in vanos:
                area_neta -= info["ancho"] * info["alto"]
            # O045: el cerramiento va embebido; su sección dentro del espesor se
            # descuenta del área de block (los castillos ya vienen recortados de la
            # huella por ser IfcColumn). Los recubrimientos miden la cara completa.
            area_neta -= self._area_embebida_muro(elemento, datos, nucleo)
            detalle["area_neta_m2"] = round(max(area_neta, 0.0), 6)
            detalle["base_m"] = round(min(z for _b, z in subtramos), 6)
            detalle["cima_m"] = round(z1, 6)
        elif alias == "losa":
            datos = self._leer_pset(elemento, "OPENRVT_Losa")
            espesor = float(datos.get("Espesor") or 0.12)
            nivel_e = self._nivel_de_elemento(elemento)
            z1 = float(nivel_e.Elevation or 0.0) + float(datos.get("Desfase") or 0.0)
            # O012b: la huella ya viene recortada contra trabes y columnas.
            poligono = self._geometria_losa(elemento)
            piezas.append(
                {
                    "poligono": (lambda p=poligono: p),
                    "z0": z1 - espesor, "z1": z1,
                    "prioridad": PRIORIDAD["losa"], "volumen": None,
                }
            )
            bruto = poligono.area * espesor
        else:
            return None
        if bruto <= 0:
            return None
        return {
            "globalid": _gid(elemento),
            "clase": clase,
            "nombre": _texto(getattr(elemento, "Name", "")),
            "tipo": tipo_nombre,
            "alias": alias,
            "volumen_bruto_m3": round(bruto, 6),
            "volumen_neto_m3": 0.0,
            "acero_kg": acero,
            "detalle": detalle,
            "piezas": piezas,
            "area_neta_m2": round(area_neta, 6) if area_neta is not None else None,
        }
