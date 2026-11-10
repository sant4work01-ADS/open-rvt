"""Recortar y extender elementos (ED1)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class RecortarMixin:
    # ------------------------------------------------- ED1: recortar y extender
    def _alias_de_lineal(self, entidad: Any) -> str | None:
        if entidad.is_a("IfcWall"):
            return "muro"
        try:
            alias = self._estructura_de_tipo(self._tipo_entidad(entidad))
        except Exception:
            return None
        return (
            alias
            if alias
            in ("contratrabe", "trabe", "dala", "cerramiento", "zapata_corrida")
            else None
        )

    def _linea_de_recorte(self, entidad: Any) -> tuple[float, float, float, float]:
        if entidad.is_a("IfcWall"):
            datos = self._datos_muro(entidad)
            return datos["x1"], datos["y1"], datos["x2"], datos["y2"]
        datos = self._leer_pset(entidad, "OPENRVT_Estructura")
        if "X1" not in datos or "X2" not in datos:
            raise self._error(
                "El elemento no tiene una línea de ubicación en planta.", -32602
            )
        x1 = float(datos.get("X1") or 0.0)
        y1 = float(datos.get("Y1") or 0.0)
        return x1, y1, float(datos.get("X2") or x1), float(datos.get("Y2") or y1)

    def _linea_de_referencia(
        self, referencia: str
    ) -> tuple[float, float, float, float]:
        try:
            _grid, eje = self._eje_por_gid(referencia)
            return self._direccion_eje(eje)[:4]
        except Exception:
            pass
        entidad = self._entidad_por_gid(referencia)
        alias = self._alias_de_lineal(entidad)
        if alias is None or not (
            entidad.is_a("IfcWall") or entidad.is_a("IfcBeam") or entidad.is_a("IfcFooting")
        ):
            raise self._error(
                "La referencia debe ser un elemento lineal o un eje.", -32602
            )
        return self._linea_de_recorte(entidad)

    def _quitar_enlace_extremo(self, entidad: Any, inicio: bool) -> None:
        datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
        if _texto(datos.get("EnlaceTipo")) != "tramo":
            return
        claves = (
            ("EnlaceEjeInicio", "EnlaceDesfaseInicio")
            if inicio
            else ("EnlaceEjeFin", "EnlaceDesfaseFin")
        )
        self._quitar_claves_pset(entidad, PSET_RESTRICCIONES, claves)
        datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
        if not _texto(datos.get("EnlaceEjeInicio")) and not _texto(
            datos.get("EnlaceEjeFin")
        ):
            self._quitar_claves_pset(
                entidad, PSET_RESTRICCIONES, self.CLAVES_ENLACE
            )

    def _reubicar_dependientes_del_recorte(
        self, muro: Any, desplazamiento: float
    ) -> None:
        if abs(desplazamiento) <= TOLERANCIA_CALCULO:
            return
        for dependiente in self._dependientes_de(muro):
            if _texto(self._leer_liga(dependiente).get("Muro")) != _gid(muro):
                continue
            liga = self._leer_liga(dependiente)
            if "Distancia" not in liga:
                continue
            liga["Distancia"] = float(liga["Distancia"] or 0.0) - desplazamiento
            self._guardar_liga(dependiente, liga)

    def _borrar_vano(self, vano: Any) -> list[Any]:
        productos = [self._relleno_de(vano), vano]
        borrados = []
        for producto in productos:
            if producto is None:
                continue
            self._quitar_conexiones(producto)
            for rel in list(getattr(producto, "Decomposes", ()) or ()):
                try:
                    self.modelo.remove(rel)
                except Exception:
                    LOG.debug("no se pudo quitar la descomposición del vano", exc_info=True)
            try:
                root.remove_product(self.modelo, product=producto)
                borrados.append(producto)
            except Exception:
                LOG.warning("no se pudo borrar un vano", exc_info=True)
        return borrados

    def _vanos_fuera_del_muro(self, muro: Any, largo: float) -> tuple[list[Any], list[str]]:
        borrados: list[Any] = []
        avisos: list[str] = []
        for vano, info in list(self._aberturas_del_muro(muro)):
            if (
                info["distancia"] < -TOLERANCIA
                or info["distancia"] + info["ancho"] > largo + TOLERANCIA
            ):
                relleno = self._relleno_de(vano)
                clase = (
                    "puerta"
                    if relleno is not None and relleno.is_a("IfcDoor")
                    else "ventana"
                )
                nombre = _nombre(relleno) if relleno is not None else ""
                borrados.extend(self._borrar_vano(vano))
                avisos.append(
                    f"Se borró la {clase} {nombre or 'sin nombre'}: "
                    "quedó fuera del muro"
                )
        return borrados, avisos

    def _recortar_extender_impl(
        self, globalid: str, referencia: str, punto_conservar: Any
    ) -> dict[str, Any]:
        entidad = self._entidad_por_gid(str(globalid))
        if self._alias_de_lineal(entidad) is None:
            raise self._error(
                "Solo se recortan o extienden muros, contratrabes, trabes, dalas, "
                "cerramientos y zapatas corridas.",
                -32602,
            )
        if str(globalid) == str(referencia):
            raise self._error("La referencia no puede ser el mismo elemento.", -32602)
        try:
            px, py = float(punto_conservar[0]), float(punto_conservar[1])
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("Falta el punto del lado que se conserva.", -32602) from exc
        ax1, ay1, ax2, ay2 = self._linea_de_recorte(entidad)
        rx1, ry1, rx2, ry2 = self._linea_de_referencia(str(referencia))
        ux, uy = ax2 - ax1, ay2 - ay1
        vx, vy = rx2 - rx1, ry2 - ry1
        la = math.hypot(ux, uy)
        lr = math.hypot(vx, vy)
        if la <= TOLERANCIA_CALCULO or lr <= TOLERANCIA_CALCULO:
            raise self._error("El elemento no tiene una línea de ubicación.", -32602)
        den = ux * vy - uy * vx
        if abs(den) <= TOLERANCIA_CALCULO * la * lr:
            raise self._error("Los elementos son paralelos", -32027)
        t = ((rx1 - ax1) * vy - (ry1 - ay1) * vx) / den
        cx, cy = ax1 + ux * t, ay1 + uy * t
        t_clic = ((px - ax1) * ux + (py - ay1) * uy) / la
        t_corte = ((cx - ax1) * ux + (cy - ay1) * uy) / la
        if t_clic <= t_corte:
            nx1, ny1, nx2, ny2 = ax1, ay1, cx, cy
            inicio_ajustado = False
        else:
            nx1, ny1, nx2, ny2 = cx, cy, ax2, ay2
            inicio_ajustado = True
        largo = math.hypot(nx2 - nx1, ny2 - ny1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El recorte deja el elemento sin longitud.", -32602)
        borrados: list[Any] = []
        avisos: list[str] = []
        if entidad.is_a("IfcWall"):
            desplazamiento = (
                (nx1 - ax1) * ux + (ny1 - ay1) * uy
            ) / la
            self._reubicar_dependientes_del_recorte(entidad, desplazamiento)
            if abs(desplazamiento) > TOLERANCIA_CALCULO:
                for vano, _info in list(self._aberturas_del_muro(entidad)):
                    datos = dict(self._leer_pset(vano, "OPENRVT_Abertura"))
                    if not datos:
                        continue
                    datos["Distancia"] = float(datos.get("Distancia") or 0.0) - desplazamiento
                    self._guardar_pset(vano, "OPENRVT_Abertura", datos)
            borrados, avisos = self._vanos_fuera_del_muro(entidad, largo)
        self._aplicar_planta(entidad, nx1, ny1, nx2, ny2)
        self._quitar_enlace_extremo(entidad, inicio_ajustado)
        self._recalcular_uniones_estructura()
        mensaje = " ".join(avisos) if avisos else "Elemento recortado o extendido."
        return self._resultado(
            modificados=[entidad],
            borrados=borrados,
            mensaje=mensaje,
        )

    def elementos_recortar_extender(
        self, globalid: str, referencia: str, punto_conservar: Any
    ) -> dict[str, Any]:
        self._exigir_modelo()
        self._instantanea()
        try:
            resultado = self._recortar_extender_impl(
                str(globalid), str(referencia), punto_conservar
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return resultado

    def elementos_recortar_esquina(
        self, globalid_a: str, globalid_b: str, punto_a: Any, punto_b: Any
    ) -> dict[str, Any]:
        self._exigir_modelo()
        if str(globalid_a) == str(globalid_b):
            raise self._error("Elija dos elementos distintos.", -32602)
        self._instantanea()
        try:
            primero = self._recortar_extender_impl(
                str(globalid_a), str(globalid_b), punto_a
            )
            segundo = self._recortar_extender_impl(
                str(globalid_b), str(globalid_a), punto_b
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=[str(globalid_a), str(globalid_b)],
            borrados=[*primero.get("borrados", []), *segundo.get("borrados", [])],
            mensaje="Esquina formada.",
        )

