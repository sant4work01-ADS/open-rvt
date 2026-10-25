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

from .modelado import TOLERANCIA, TOLERANCIA_CALCULO, _gid, _nombre, _texto

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

    # ------------------------------------------------------------------ columnas / vigas base
    def _columna_nueva(
        self,
        tipo_entidad: Any,
        nivel_entidad: Any,
        x: float,
        y: float,
        rotacion: float,
        altura: float,
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
    ) -> Any:
        datos = self._datos_muro(muro)
        x, y, rotacion = self._punto_en_muro(muro, distancia)
        nucleo, centro = self._capas_nucleo(muro)
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        ancho = float(seccion.get("B") or 0.15)
        nivel_entidad = self._nivel_de_elemento(muro)
        cerramientos = [
            d for d in self._dependientes_de(muro)
            if self._estructura_de_tipo(self._tipo_entidad(d)) == "cerramiento"
        ]
        if cerramientos:
            alto_cerramiento = float(
                self._leer_pset(cerramientos[0], "OPENRVT_Estructura").get("H")
                or self._seccion_y_armado(self._tipo_entidad(cerramientos[0]))[1].get("H")
                or 0.20
            )
            altura = datos["altura"] - alto_cerramiento
        else:
            altura = datos["altura"]
        if altura <= TOLERANCIA_CALCULO:
            altura = datos["altura"]
        elevacion = datos["z"]
        castillo, _ = self._columna_nueva(
            tipo_entidad, nivel_entidad, x, y, rotacion, max(altura, 0.05)
        )
        pset = {
            **self._leer_pset(castillo, "OPENRVT_Estructura"),
            "X": x, "Y": y, "Rotacion": rotacion, "Base": elevacion,
            "Altura": altura, "B": ancho, "H": nucleo,
            "AnchoDelMuro": abs(ancho - nucleo) > 1e-9,
        }
        self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
        self._regenerar_estructura(castillo)
        self._guardar_liga(castillo, {"Muro": _gid(muro), "Distancia": distancia})
        self._conectar(castillo, muro)
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
            creados.append(self._castillo_en(tipo_entidad, muro, distancia))

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
    def cerramiento_crear_en_muro(self, tipo: str, muro: str) -> dict[str, Any]:
        return self._lineal_en_muro(tipo, muro, "cerramiento")

    def dala_crear_en_muro(self, tipo: str, muro: str) -> dict[str, Any]:
        return self._lineal_en_muro(tipo, muro, "dala")

    def _lineal_en_muro(self, tipo: str, muro: str, esperado: str) -> dict[str, Any]:
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
        self._instantanea()
        if esperado == "cerramiento":
            desfase = datos["z"] + datos["altura"]
        else:
            desfase = datos["z"] + alto
        viga = self._viga_nueva(
            tipo_entidad, nivel, datos["x1"], datos["y1"], datos["x2"], datos["y2"], desfase
        )
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {**self._leer_pset(viga, "OPENRVT_Estructura"), "B": nucleo},
        )
        self._regenerar_estructura(viga)
        self._guardar_liga(viga, {"Muro": _gid(muro_entidad)})
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

    def _actualizar_castillos(self, muro: Any) -> None:
        datos = self._datos_muro(muro)
        cerramientos = [
            d for d in self._dependientes_de(muro)
            if self._estructura_de_tipo(self._tipo_entidad(d)) == "cerramiento"
        ]
        altura = datos["altura"]
        if cerramientos:
            pset = self._leer_pset(cerramientos[0], "OPENRVT_Estructura")
            tipo = self._tipo_entidad(cerramientos[0])
            _, seccion, _ = self._seccion_y_armado(tipo)
            alto = float(pset.get("H") or seccion.get("H") or 0.20)
            altura = datos["altura"] - alto
        for castillo in self._dependientes_de(muro):
            if self._estructura_de_tipo(self._tipo_entidad(castillo)) != "castillo":
                continue
            pset = {
                **self._leer_pset(castillo, "OPENRVT_Estructura"),
                "Base": datos["z"],
                "Altura": max(altura, 0.05),
            }
            self._guardar_pset(castillo, "OPENRVT_Estructura", pset)
            self._regenerar_estructura(castillo)

    def _actualizar_dependientes_muro(self, muro: Any) -> list[Any]:
        """Recoloca castillos, cerramientos y dalas cuando el muro cambia."""
        datos = self._datos_muro(muro)
        nucleo, _centro = self._capas_nucleo(muro)
        modificados: list[Any] = []
        for dependiente in self._dependientes_de(muro):
            alias = self._estructura_de_tipo(self._tipo_entidad(dependiente))
            pset = dict(self._leer_pset(dependiente, "OPENRVT_Estructura"))
            if not pset:
                continue
            if alias == "castillo":
                liga = self._leer_liga(dependiente)
                distancia = min(
                    max(float(liga.get("Distancia") or 0.0), 0.0), datos["longitud"]
                )
                x, y, rotacion = self._punto_en_muro(muro, distancia)
                _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(dependiente))
                pset.update(
                    {
                        "X": x, "Y": y, "Rotacion": rotacion, "Base": datos["z"],
                        "B": float(seccion.get("B") or 0.15), "H": nucleo,
                    }
                )
                liga["Distancia"] = distancia
                self._guardar_liga(dependiente, liga)
            elif alias in ("cerramiento", "dala"):
                _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(dependiente))
                alto = float(pset.get("H") or seccion.get("H") or 0.20)
                pset.update(
                    {
                        "X1": datos["x1"], "Y1": datos["y1"],
                        "X2": datos["x2"], "Y2": datos["y2"],
                        "Longitud": datos["longitud"], "B": nucleo,
                    }
                )
                if alias == "cerramiento":
                    pset["Z"] = datos["z"] + datos["altura"] - alto / 2.0
                else:
                    pset["Z"] = datos["z"] + alto / 2.0
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
                creados.append(columna)
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=f"{len(creados)} columna(s) en cruces; {len(omitidos)} ya existían.",
            omitidos=[_gid(o) for o in omitidos],
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
            bruto = caja((x1 + x2) / 2.0, (y1 + y2) / 2.0, rot, largo, b,
                         z - h / 2.0, z + h / 2.0)
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
            z0 = datos["z"]
            z1 = z0 + datos["altura"]
            from shapely.geometry import Polygon as _Polygon

            coseno, seno = math.cos(rot), math.sin(rot)
            puntos = []
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = sx * largo / 2.0, sy * nucleo / 2.0
                puntos.append((cx + lx * coseno - ly * seno, cy + lx * seno + ly * coseno))
            base = _Polygon(puntos)
            vanos = self._aberturas_del_muro(elemento)
            bruto = base.area * (z1 - z0)
            # Los vanos se descuentan del cuerpo y también del volumen bruto.
            for _vano, info in vanos:
                bruto -= info["ancho"] * info["alto"] * nucleo
                vz0 = z0 + info["antepecho"]
                vz1 = vz0 + info["alto"]
                vx = x1 + ux * (info["distancia"] + info["ancho"] / 2.0)
                vy = y1 + uy * (info["distancia"] + info["ancho"] / 2.0)
                vrot = rot
                vcos, vsen = math.cos(vrot), math.sin(vrot)
                vp = []
                for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    lx, ly = sx * info["ancho"] / 2.0, sy * (nucleo + 0.02) / 2.0
                    vp.append((vx + lx * vcos - ly * vsen, vy + lx * vsen + ly * vcos))
                hueco = _Polygon(vp)
                piezas.append(
                    {
                        "poligono": (lambda p=base, h=hueco: p.difference(h)),
                        "z0": max(z0, vz0), "z1": min(z1, vz1),
                        "prioridad": PRIORIDAD["muro"],
                        "volumen": None,
                    }
                )
            # Rebanadas fuera de los vanos: el polígono completo.
            fronteras = sorted({
                z0, z1,
                *[max(z0, min(z1, z0 + info["antepecho"])) for _v, info in vanos],
                *[max(z0, min(z1, z0 + info["antepecho"] + info["alto"])) for _v, info in vanos],
            })
            for a, b in zip(fronteras, fronteras[1:]):
                if b - a <= TOLERANCIA_CALCULO:
                    continue
                medio = (a + b) / 2.0
                cubierto = any(
                    z0 + info["antepecho"] < medio < z0 + info["antepecho"] + info["alto"]
                    for _v, info in vanos
                )
                if cubierto:
                    continue
                piezas.append(
                    {
                        "poligono": (lambda p=base: p),
                        "z0": a, "z1": b,
                        "prioridad": PRIORIDAD["muro"],
                        "volumen": None,
                    }
                )
            # Área neta del núcleo según la regla de cuantificación.
            area_neta = largo * datos["altura"]
            for _vano, info in vanos:
                area_neta -= info["ancho"] * info["alto"]
            for dependiente in self._dependientes_de(elemento):
                dalias = self._estructura_de_tipo(self._tipo_entidad(dependiente))
                if dalias == "castillo":
                    p = self._leer_pset(dependiente, "OPENRVT_Estructura")
                    b = float(p.get("B") or 0.15)
                    alto = float(p.get("Altura") or datos["altura"])
                    area_neta -= b * alto
                elif dalias in ("cerramiento", "dala"):
                    p = self._leer_pset(dependiente, "OPENRVT_Estructura")
                    _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(dependiente))
                    alto = float(p.get("H") or seccion.get("H") or 0.20)
                    area_neta -= datos["longitud"] * alto
            for columna in self.modelo.by_type("IfcColumn"):
                if self._estructura_de_tipo(self._tipo_entidad(columna)) != "columna":
                    continue
                p = self._leer_pset(columna, "OPENRVT_Estructura")
                dx = float(p.get("X") or 0.0) - (x1 + x2) / 2.0
                dy = float(p.get("Y") or 0.0) - (y1 + y2) / 2.0
                if abs(dx * ux + dy * uy) > largo / 2.0 + 0.5:
                    continue
                if abs(-dx * uy + dy * ux) > nucleo / 2.0 + 0.3:
                    continue
                _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(columna))
                cb = float(p.get("B") or seccion.get("B") or 0.30)
                ch = float(p.get("H") or seccion.get("H") or 0.30)
                rel = float(p.get("Rotacion") or 0.0) - rot
                ancho = abs(cb * math.cos(rel)) + abs(ch * math.sin(rel))
                alto = float(p.get("Altura") or datos["altura"])
                area_neta -= ancho * alto
            detalle["area_neta_m2"] = round(max(area_neta, 0.0), 6)
        elif alias == "losa":
            puntos = self._poligono_de_losa(elemento)
            if len(puntos) < 3:
                return None
            datos = self._leer_pset(elemento, "OPENRVT_Losa")
            espesor = float(datos.get("Espesor") or 0.12)
            nivel_e = self._nivel_de_elemento(elemento)
            z1 = float(nivel_e.Elevation or 0.0) + float(datos.get("Desfase") or 0.0)
            poligono = Polygon(puntos)
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
            "tipo": tipo_nombre,
            "alias": alias,
            "volumen_bruto_m3": round(bruto, 6),
            "volumen_neto_m3": 0.0,
            "acero_kg": acero,
            "detalle": detalle,
            "piezas": piezas,
            "area_neta_m2": round(area_neta, 6) if area_neta is not None else None,
        }
