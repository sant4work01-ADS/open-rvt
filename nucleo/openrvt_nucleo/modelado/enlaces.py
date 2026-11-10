"""Enlaces de elementos a ejes (O028)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EnlacesMixin:
    # --------------------------------------------------- O028: enlaces a ejes
    CLAVES_ENLACE = (
        "EnlaceTipo",
        "EnlaceEjeA",
        "EnlaceEjeB",
        "EnlaceDX",
        "EnlaceDY",
        "EnlaceEjeGuia",
        "EnlaceEjeInicio",
        "EnlaceEjeFin",
        "EnlaceDesfase",
        "EnlaceDesfaseInicio",
        "EnlaceDesfaseFin",
        "EnlaceRotacion",
    )

    def _guardar_enlace_punto(
        self, elemento: Any, eje_a: str, eje_b: str, x: float, y: float
    ) -> None:
        """O028: crea el enlace de cruce al colocar el elemento sobre él."""
        if not (eje_a and eje_b):
            return
        try:
            px, py = self._cruce_de_ejes(_texto(eje_a), _texto(eje_b))
        except Exception:
            return
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        datos.update(
            {
                "EnlaceTipo": "cruce",
                "EnlaceEjeA": _texto(eje_a),
                "EnlaceEjeB": _texto(eje_b),
                "EnlaceDX": float(x) - px,
                "EnlaceDY": float(y) - py,
            }
        )
        self._guardar_pset(elemento, PSET_RESTRICCIONES, datos)

    def _enlace_de(self, elemento: Any) -> dict[str, Any]:
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        tipo = _texto(datos.get("EnlaceTipo"))
        if tipo not in ("cruce", "tramo"):
            return {}
        salida = {"tipo": tipo}
        for clave in self.CLAVES_ENLACE[1:]:
            if clave in datos:
                salida[clave] = datos.get(clave)
        return salida

    def _limpiar_enlace(self, elemento: Any) -> bool:
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        habia = _texto(datos.get("EnlaceTipo")) in ("cruce", "tramo")
        if not habia:
            return False
        self._quitar_claves_pset(elemento, PSET_RESTRICCIONES, self.CLAVES_ENLACE)
        self._quitar_claves_pset(elemento, "OPENRVT_Liga", ("EjeA", "EjeB"))
        return True

    def _direccion_de_eje(self, globalid: str) -> tuple[float, float, float, float]:
        _grid, eje = self._eje_por_gid(globalid)
        x1, y1, _x2, _y2, ux, uy, _largo = self._direccion_eje(eje)
        return x1, y1, ux, uy

    def _cruce_de_ejes(self, eje_a: str, eje_b: str) -> tuple[float, float]:
        xa, ya, ux, uy = self._direccion_de_eje(eje_a)
        xb, yb, vx, vy = self._direccion_de_eje(eje_b)
        den = ux * vy - uy * vx
        if abs(den) <= TOLERANCIA_CALCULO:
            raise self._error(
                "Los ejes son paralelos: no tienen un cruce.", -32027
            )
        t = ((xb - xa) * vy - (yb - ya) * vx) / den
        return xa + ux * t, ya + uy * t

    def _posicion_cruce(self, enlace: dict[str, Any]) -> tuple[float, float]:
        px, py = self._cruce_de_ejes(
            _texto(enlace.get("EnlaceEjeA")), _texto(enlace.get("EnlaceEjeB"))
        )
        return px + float(enlace.get("EnlaceDX") or 0.0), py + float(
            enlace.get("EnlaceDY") or 0.0
        )

    def _extremos_tramo(
        self,
        enlace: dict[str, Any],
        actual: tuple[float, float, float, float] | None = None,
    ) -> tuple[float, float, float, float]:
        guia = _texto(enlace.get("EnlaceEjeGuia"))
        _gx, _gy, ux, uy = self._direccion_de_eje(guia)
        nx, ny = -uy, ux
        desfase = float(enlace.get("EnlaceDesfase") or 0.0)
        eje_inicio = _texto(enlace.get("EnlaceEjeInicio"))
        eje_fin = _texto(enlace.get("EnlaceEjeFin"))
        di = float(enlace.get("EnlaceDesfaseInicio") or 0.0)
        df = float(enlace.get("EnlaceDesfaseFin") or 0.0)
        if eje_inicio:
            inicio = self._cruce_de_ejes(guia, eje_inicio)
            x1, y1 = inicio[0] + nx * desfase + ux * di, inicio[1] + ny * desfase + uy * di
        elif actual is not None:
            x1, y1 = actual[0], actual[1]
        else:
            raise self._error("El tramo no tiene enlace en el extremo inicial.", -32027)
        if eje_fin:
            fin = self._cruce_de_ejes(guia, eje_fin)
            x2, y2 = fin[0] + nx * desfase + ux * df, fin[1] + ny * desfase + uy * df
        elif actual is not None:
            x2, y2 = actual[2], actual[3]
        else:
            raise self._error("El tramo no tiene enlace en el extremo final.", -32027)
        return x1, y1, x2, y2

    def _punto_de_elemento(self, elemento: Any) -> tuple[float, float]:
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        return float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0)

    def _extremos_de_elemento(self, elemento: Any) -> tuple[float, float, float, float]:
        if elemento.is_a("IfcWall"):
            datos = self._datos_muro(elemento)
            return datos["x1"], datos["y1"], datos["x2"], datos["y2"]
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        x1 = float(datos.get("X1") or datos.get("X") or 0.0)
        y1 = float(datos.get("Y1") or datos.get("Y") or 0.0)
        return x1, y1, float(datos.get("X2") or x1), float(datos.get("Y2") or y1)

    def _ejes_que_pasan_por(self, x: float, y: float) -> list[str]:
        """O036: ejes que pasan por el punto, con la tolerancia de columnas y zapatas."""
        salida: list[str] = []
        for grid in self.modelo.by_type("IfcGrid"):
            for eje in self._ejes(grid):
                try:
                    x1, y1, x2, y2, ux, uy, largo = self._direccion_eje(eje)
                except Exception:
                    continue
                t = (x - x1) * ux + (y - y1) * uy
                if t < -TOLERANCIA or t > largo + TOLERANCIA:
                    continue
                separacion = abs((x - x1) * -uy + (y - y1) * ux)
                if separacion <= TOLERANCIA:
                    salida.append(self._id_eje(grid, eje))
        return salida

    def _enlace_auto_tramo(
        self, x1: float, y1: float, x2: float, y2: float
    ) -> tuple[str, str, str] | None:
        """O036: dos extremos en cruces que comparten un eje guía."""
        inicio_ejes = self._ejes_que_pasan_por(x1, y1)
        fin_ejes = self._ejes_que_pasan_por(x2, y2)
        if len(inicio_ejes) < 2 or len(fin_ejes) < 2:
            return None
        comunes = [gid for gid in inicio_ejes if gid in fin_ejes]
        if not comunes:
            return None
        guia = comunes[0]
        inicio = next((gid for gid in inicio_ejes if gid != guia), None)
        fin = next((gid for gid in fin_ejes if gid != guia), None)
        if not inicio or not fin or inicio == fin:
            return None
        return guia, inicio, fin

    def _escribir_enlace_tramo(
        self,
        elemento: Any,
        guia: str,
        inicio: str,
        fin: str,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        desfase: float | None = None,
        desfase_inicio: float | None = None,
        desfase_fin: float | None = None,
    ) -> None:
        """O036: escribe el enlace de tramo sin abrir otra instantánea."""
        gx, gy, ux, uy = self._direccion_de_eje(guia)
        nx, ny = -uy, ux
        cruce_inicio = self._cruce_de_ejes(guia, inicio)
        cruce_fin = self._cruce_de_ejes(guia, fin)
        if desfase is None:
            desfase = ((x1 + x2) / 2.0 - gx) * nx + ((y1 + y2) / 2.0 - gy) * ny
        if desfase_inicio is None:
            desfase_inicio = (x1 - cruce_inicio[0]) * ux + (y1 - cruce_inicio[1]) * uy
        if desfase_fin is None:
            desfase_fin = (x2 - cruce_fin[0]) * ux + (y2 - cruce_fin[1]) * uy
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

    def _enlazar_auto_tramo(
        self, elemento: Any, x1: float, y1: float, x2: float, y2: float
    ) -> bool:
        """O036: enlaza el lineal recién creado si sus dos extremos son cruces."""
        enlace = self._enlace_auto_tramo(x1, y1, x2, y2)
        if enlace is None:
            return False
        guia, inicio, fin = enlace
        self._escribir_enlace_tramo(
            elemento, guia, inicio, fin, x1, y1, x2, y2
        )
        return True

    def _aplicar_planta(
        self, elemento: Any, x1: float, y1: float, x2: float, y2: float
    ) -> None:
        """Coloca en planta un elemento puntual o lineal y regenera su cuerpo."""
        largo = math.hypot(x2 - x1, y2 - y1)
        if elemento.is_a("IfcWall"):
            if largo <= TOLERANCIA_CALCULO:
                return
            datos = self._datos_muro(elemento)
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            matriz = np.array(
                [
                    [ux, -uy, 0.0, x1],
                    [uy, ux, 0.0, y1],
                    [0.0, 0.0, 1.0, datos["z"]],
                    [0.0, 0.0, 0.0, 1.0],
                ]
            )
            geometry_api.edit_object_placement(
                self.modelo, product=elemento, matrix=matriz
            )
            pset = self._leer_pset(elemento, "OPENRVT_Muro")
            pset["Longitud"] = largo
            self._guardar_pset(elemento, "OPENRVT_Muro", pset)
            self._regenerar_muro(elemento)
            self._unir_muros(elemento)
            self._actualizar_dependientes_muro(elemento)
            return
        datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
        if elemento.is_a("IfcColumn") or (
            elemento.is_a("IfcFooting")
            and _texto(getattr(elemento, "PredefinedType", ""))
            not in ("STRIP_FOOTING", "FOOTING_BEAM")
        ):
            dx = x1 - float(datos.get("X") or 0.0)
            dy = y1 - float(datos.get("Y") or 0.0)
            datos["X"] = x1
            datos["Y"] = y1
            self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
            self._regenerar_estructura(elemento)
            if elemento.is_a("IfcColumn"):
                for zapata in self._zapatas_de_columna(elemento):
                    self._mover_producto(zapata, dx, dy, 0.0)
            return
        datos["X1"] = x1
        datos["Y1"] = y1
        datos["X2"] = x2
        datos["Y2"] = y2
        datos["Longitud"] = largo
        if elemento.is_a("IfcFooting") and _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "STRIP_FOOTING":
            # O033: un tramo enlazado empieza y acaba en cruces; si no hay
            # prolongaciones guardadas, por omisión son medio ancho.
            _alias, seccion, _armado = self._seccion_y_armado(self._tipo_entidad(elemento))
            media = float(seccion.get("Ancho") or 0.60) / 2.0
            datos.setdefault("ProlongacionInicio", media)
            datos.setdefault("ProlongacionFin", media)
        self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
        self._regenerar_estructura(elemento)

    def _aplicar_enlace(self, elemento: Any) -> bool:
        enlace = self._enlace_de(elemento)
        if not enlace:
            return False
        if enlace["tipo"] == "cruce":
            x, y = self._posicion_cruce(enlace)
            self._aplicar_planta(elemento, x, y, x, y)
        else:
            actual = self._extremos_de_elemento(elemento)
            x1, y1, x2, y2 = self._extremos_tramo(enlace, actual)
            self._aplicar_planta(elemento, x1, y1, x2, y2)
        return True

    def _validar_enlace(self, elemento: Any) -> None:
        if elemento.is_a("IfcWall") or elemento.is_a("IfcBeam") or elemento.is_a("IfcFooting"):
            return
        if elemento.is_a("IfcColumn"):
            return
        raise self._error("Ese elemento no admite enlace a ejes.", -32602)

    def enlazar_a_cruce(
        self,
        globalid: str,
        eje_a: str,
        eje_b: str,
        dx: float | None = None,
        dy: float | None = None,
    ) -> dict[str, Any]:
        """O028: ancla un elemento puntual a un cruce de ejes con desfase global."""
        self._exigir_modelo()
        entidad = self._entidad_por_gid(str(globalid), ("IfcColumn", "IfcFooting"))
        self._validar_enlace(entidad)
        px, py = self._cruce_de_ejes(str(eje_a), str(eje_b))
        x, y = self._punto_de_elemento(entidad)
        dx = float(x - px if dx is None else dx)
        dy = float(y - py if dy is None else dy)
        self._instantanea()
        try:
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            datos.update(
                {
                    "EnlaceTipo": "cruce",
                    "EnlaceEjeA": _texto(eje_a),
                    "EnlaceEjeB": _texto(eje_b),
                    "EnlaceDX": dx,
                    "EnlaceDY": dy,
                }
            )
            self._guardar_pset(entidad, PSET_RESTRICCIONES, datos)
            if entidad.is_a("IfcColumn"):
                liga = dict(self._leer_pset(entidad, "OPENRVT_Liga"))
                liga.update({"EjeA": _texto(eje_a), "EjeB": _texto(eje_b)})
                self._guardar_liga(entidad, liga)
            self._aplicar_enlace(entidad)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            [entidad],
            mensaje=(
                f"Enlazado al cruce {_texto(eje_a)}-{_texto(eje_b)} "
                f"(dx {dx:.2f}, dy {dy:.2f})."
            ),
            enlace=self._enlace_de(entidad),
        )

    def enlazar_tramo(
        self,
        globalid: str,
        eje_guia: str,
        eje_inicio: str,
        eje_fin: str,
        desfase: float | None = None,
        desfase_inicio: float | None = None,
        desfase_fin: float | None = None,
    ) -> dict[str, Any]:
        """O028: un tramo se apoya en un eje guía y empieza y acaba en cruces."""
        self._exigir_modelo()
        entidad = self._entidad_por_gid(
            str(globalid), ("IfcWall", "IfcBeam", "IfcFooting")
        )
        self._validar_enlace(entidad)
        x1, y1, x2, y2 = self._extremos_de_elemento(entidad)
        self._instantanea()
        try:
            self._escribir_enlace_tramo(
                entidad,
                str(eje_guia),
                str(eje_inicio),
                str(eje_fin),
                x1,
                y1,
                x2,
                y2,
                desfase,
                desfase_inicio,
                desfase_fin,
            )
            self._aplicar_enlace(entidad)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            [entidad],
            mensaje=(
                f"Tramo enlazado al eje {_texto(eje_guia)} de "
                f"{_texto(eje_inicio)} a {_texto(eje_fin)}."
            ),
            enlace=self._enlace_de(entidad),
        )

    def soltar_enlace(self, globalid: str) -> dict[str, Any]:
        """O028: quita el enlace y deja el elemento donde está."""
        self._exigir_modelo()
        entidad = self._entidad_por_gid(str(globalid))
        self._instantanea()
        self._limpiar_enlace(entidad)
        self.con_cambios = True
        return self._resultado([entidad], mensaje="Enlace a ejes eliminado.")

    def _propagar_enlaces_de_eje(self, globalid: str) -> list[Any]:
        """Recoloca los elementos enlazados al eje movido (posiciones absolutas)."""
        modificados: list[Any] = []
        elementos = (
            self.modelo.by_type("IfcWall")
            + self.modelo.by_type("IfcColumn")
            + self.modelo.by_type("IfcBeam")
            + self.modelo.by_type("IfcFooting")
        )
        for entidad in elementos:
            enlace = self._enlace_de(entidad)
            if not enlace:
                continue
            if enlace["tipo"] == "cruce":
                involucrados = {
                    _texto(enlace.get("EnlaceEjeA")),
                    _texto(enlace.get("EnlaceEjeB")),
                }
            else:
                involucrados = {
                    _texto(enlace.get("EnlaceEjeGuia")),
                    _texto(enlace.get("EnlaceEjeInicio")),
                    _texto(enlace.get("EnlaceEjeFin")),
                }
            if globalid not in involucrados:
                continue
            self._aplicar_enlace(entidad)
            modificados.append(entidad)
        if modificados:
            self._recalcular_uniones_estructura()
        return modificados

    def _soltar_enlaces_de_eje(self, globalid: str) -> list[str]:
        """Al borrar un eje sus enlazados se quedan quietos y sin enlace."""
        soltados: list[str] = []
        elementos = (
            self.modelo.by_type("IfcWall")
            + self.modelo.by_type("IfcColumn")
            + self.modelo.by_type("IfcBeam")
            + self.modelo.by_type("IfcFooting")
        )
        for entidad in elementos:
            enlace = self._enlace_de(entidad)
            referencias = {
                _texto(enlace.get("EnlaceEjeA")),
                _texto(enlace.get("EnlaceEjeB")),
                _texto(enlace.get("EnlaceEjeGuia")),
                _texto(enlace.get("EnlaceEjeInicio")),
                _texto(enlace.get("EnlaceEjeFin")),
            }
            if globalid in referencias and self._limpiar_enlace(entidad):
                soltados.append(_nombre(entidad) or _gid(entidad))
        # O026: las alineaciones con candado a ese eje también se sueltan.
        for entidad in elementos:
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            if _texto(datos.get("AlinearReferencia")) != globalid:
                continue
            self._quitar_claves_pset(
                entidad,
                PSET_RESTRICCIONES,
                ("AlinearTipo", "AlinearReferencia", "AlinearCara", "AlinearBloqueada"),
            )
            soltados.append(_nombre(entidad) or _gid(entidad))
        return soltados

