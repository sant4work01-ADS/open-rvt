"""Espejo y matriz de elementos (ED2)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class TransformarMixin:
    # ------------------------------------------------ ED2: espejo y matriz
    @staticmethod
    def _reflejar_punto(
        p1: tuple[float, float], p2: tuple[float, float], x: float, y: float
    ) -> tuple[float, float]:
        """Refleja (x, y) respecto a la recta que pasa por p1 y p2."""
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])
        dx, dy = x2 - x1, y2 - y1
        largo2 = dx * dx + dy * dy
        if largo2 <= TOLERANCIA_CALCULO * TOLERANCIA_CALCULO:
            raise ValueError("El eje de simetría necesita dos puntos distintos.")
        t = ((x - x1) * dx + (y - y1) * dy) / largo2
        px, py = x1 + dx * t, y1 + dy * t
        return (2.0 * px - x, 2.0 * py - y)

    @staticmethod
    def _angulo_eje(p1: tuple[float, float], p2: tuple[float, float]) -> float:
        return math.atan2(float(p2[1]) - float(p1[1]), float(p2[0]) - float(p1[0]))

    def _matriz_muro(
        self, x1: float, y1: float, z: float, ux: float, uy: float
    ) -> np.ndarray:
        return np.array(
            [
                [ux, -uy, 0.0, x1],
                [uy, ux, 0.0, y1],
                [0.0, 0.0, 1.0, z],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )

    def _colocar_muro(
        self, muro: Any, x1: float, y1: float, x2: float, y2: float, z: float
    ) -> None:
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El muro necesita dos puntos distintos.", -32602)
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        geometry_api.edit_object_placement(
            self.modelo,
            product=muro,
            matrix=self._matriz_muro(x1, y1, z, ux, uy),
            is_si=True,
        )

    def _pset_muro_trasformado(
        self, original: Any, espejo: bool
    ) -> dict[str, Any]:
        datos = self._datos_muro(original)
        previos = self._leer_pset(original, "OPENRVT_Muro")
        return {
            "Longitud": datos["longitud"],
            "Altura": datos["altura"],
            "Espesor": datos["espesor"],
            "Alineacion": datos["alineacion"],
            "LineaUbicacion": datos["linea_ubicacion"],
            "DesfaseUbicacion": datos["desfase_ubicacion"],
            "Volteado": bool(datos["volteado"]) != bool(espejo),
            "BajarACimentacion": bool(
                previos.get("BajarACimentacion", datos.get("bajar_a_cimentacion", True))
                not in (False, "False", "false", 0, "0")
            ),
        }

    def _regenerar_vano(self, vano: Any, muro: Any, datos: dict[str, Any]) -> None:
        """Rehace cuerpo y colocación de un vano a partir de sus datos."""
        datos_muro = self._datos_muro(muro)
        self._quitar_representaciones(vano, "Body")
        cuerpo = self._cuerpo_hueco(
            datos["ancho"],
            datos["alto"],
            datos_muro["espesor"],
            datos["antepecho"],
            datos["distancia"],
            self._desfase_de_muro(muro, datos_muro["espesor"]),
        )
        geometry_api.assign_representation(
            self.modelo, product=vano, representation=cuerpo
        )
        geometry_api.edit_object_placement(
            self.modelo,
            product=vano,
            matrix=self._matriz_hueco(muro, datos["distancia"], datos["antepecho"]),
        )
        relaciones = getattr(muro, "ContainedInStructure", ()) or ()
        if relaciones:
            spatial_api.assign_container(
                self.modelo,
                products=[vano],
                relating_structure=relaciones[0].RelatingStructure,
            )
        ya = any(
            getattr(rel, "RelatedOpeningElement", None) == vano
            for rel in (getattr(muro, "HasOpenings", ()) or ())
        )
        if not ya:
            feature_api.add_feature(self.modelo, feature=vano, element=muro)

    def _guardar_vano(self, vano: Any, datos: dict[str, Any]) -> None:
        self._guardar_pset(
            vano,
            "OPENRVT_Abertura",
            {
                "Distancia": datos["distancia"],
                "Ancho": datos["ancho"],
                "Alto": datos["alto"],
                "Antepecho": datos["antepecho"],
                "Muro": datos["muro"],
                "Volteado": bool(datos["volteado"]),
            },
        )

    def _copiar_vano(
        self, vano: Any, muro: Any, espejo: bool = False
    ) -> Any:
        datos = self._datos_abertura(vano) or {
            "distancia": 0.0,
            "ancho": 0.9,
            "alto": 2.1,
            "antepecho": 0.0,
            "muro": _gid(muro),
            "volteado": False,
        }
        copia = self._copiar_entidad(vano)
        self._desvincular_representacion(copia)
        datos = dict(datos)
        datos["muro"] = _gid(muro)
        if espejo:
            datos["volteado"] = not bool(datos["volteado"])
        self._guardar_vano(copia, datos)
        self._regenerar_vano(copia, muro, datos)
        extras = getattr(self, "_creados_de_rebote", None)
        if extras is None:
            extras = []
            self._creados_de_rebote = extras
        extras.append(copia)
        relleno = self._relleno_de(vano)
        if relleno is not None:
            copia_relleno = self._copiar_entidad(relleno)
            self._desvincular_representacion(copia_relleno)
            self._regenerar_relleno(copia_relleno, copia)
            feature_api.add_filling(
                self.modelo, opening=copia, element=copia_relleno
            )
            extras.append(copia_relleno)
        return copia

    def _transformar_vano_en_sitio(self, vano: Any, espejo: bool) -> None:
        datos = self._datos_abertura(vano)
        if datos is None:
            return
        if espejo:
            datos["volteado"] = not bool(datos["volteado"])
            self._guardar_vano(vano, datos)
        muro = None
        if datos["muro"]:
            try:
                muro = self._entidad_por_gid(datos["muro"], ("IfcWall",))
            except Exception:
                muro = None
        if muro is not None:
            self._regenerar_vano(vano, muro, datos)
            relleno = self._relleno_de(vano)
            if relleno is not None:
                self._regenerar_relleno(relleno, vano)

    def _transformar_colocacion(
        self,
        entidad: Any,
        transform: Any,
        angulo_delta: float = 0.0,
        espejo: bool = False,
        theta: float = 0.0,
    ) -> None:
        import ifcopenshell.util.placement as placement

        matriz = placement.get_local_placement(entidad.ObjectPlacement)
        x, y = transform(float(matriz[0][3]), float(matriz[1][3]))
        z = float(matriz[2][3])
        angulo = math.atan2(float(matriz[1][0]), float(matriz[0][0]))
        if espejo:
            angulo = 2.0 * theta - angulo
        else:
            angulo += angulo_delta
        geometry_api.edit_object_placement(
            self.modelo,
            product=entidad,
            matrix=self._matriz_colocacion(x, y, z, angulo),
            is_si=True,
        )

    def _transformar_estructura(
        self,
        entidad: Any,
        transform: Any,
        angulo_delta: float,
        espejo: bool,
        theta: float,
    ) -> None:
        datos = dict(self._leer_pset(entidad, "OPENRVT_Estructura"))
        if not datos:
            return
        predef = _texto(getattr(entidad, "PredefinedType", ""))
        lineal = entidad.is_a("IfcBeam") or (
            entidad.is_a("IfcFooting") and predef in ("FOOTING_BEAM", "STRIP_FOOTING")
        )
        if lineal:
            x1, y1 = transform(float(datos.get("X1") or 0.0), float(datos.get("Y1") or 0.0))
            x2, y2 = transform(float(datos.get("X2") or 0.0), float(datos.get("Y2") or 0.0))
            datos["X1"], datos["Y1"], datos["X2"], datos["Y2"] = x1, y1, x2, y2
            datos["Longitud"] = math.hypot(x2 - x1, y2 - y1)
            if "ProlongacionInicio" in datos:
                # La prolongación es simétrica: basta con conservarla.
                datos["ProlongacionInicio"] = float(datos["ProlongacionInicio"])
                datos["ProlongacionFin"] = float(datos["ProlongacionFin"])
        else:
            x, y = transform(float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0))
            datos["X"], datos["Y"] = x, y
            rotacion = float(datos.get("Rotacion") or 0.0)
            datos["Rotacion"] = (
                2.0 * theta - rotacion if espejo else rotacion + angulo_delta
            )
        self._guardar_pset(entidad, "OPENRVT_Estructura", datos)
        self._regenerar_estructura(entidad)

    def _transformar_losa(
        self, losa: Any, transform: Any
    ) -> None:
        from shapely import wkt
        from shapely.geometry import Polygon

        datos = dict(self._leer_pset(losa, "OPENRVT_Losa"))
        if not datos:
            return
        contorno = datos.get("Contorno")
        if not contorno:
            return
        poligono = wkt.loads(str(contorno))
        puntos = [transform(float(x), float(y)) for x, y in poligono.exterior.coords[:-1]]
        datos["Contorno"] = Polygon(puntos).wkt
        datos["Puntos"] = len(puntos)
        self._quitar_claves_pset(losa, "OPENRVT_Losa", ("Bordes",))
        self._guardar_pset(losa, "OPENRVT_Losa", datos)
        self._regenerar_losa(losa)

    def _transformar_en_sitio(
        self,
        entidad: Any,
        transform: Any,
        angulo_delta: float = 0.0,
        espejo: bool = False,
        theta: float = 0.0,
    ) -> None:
        if entidad.is_a("IfcWall"):
            datos = self._datos_muro(entidad)
            x1, y1 = transform(datos["x1"], datos["y1"])
            x2, y2 = transform(datos["x2"], datos["y2"])
            self._colocar_muro(entidad, x1, y1, x2, y2, datos["z"])
            self._guardar_pset(
                entidad, "OPENRVT_Muro", self._pset_muro_trasformado(entidad, espejo)
            )
            for vano in self._aberturas_de(entidad):
                if vano.is_a("IfcOpeningElement"):
                    self._transformar_vano_en_sitio(vano, espejo)
            self._regenerar_muro(entidad)
        elif entidad.is_a("IfcSlab"):
            self._transformar_losa(entidad, transform)
        elif self._leer_pset(entidad, "OPENRVT_Estructura"):
            self._transformar_estructura(
                entidad, transform, angulo_delta, espejo, theta
            )
        elif entidad.is_a("IfcOpeningElement"):
            self._transformar_vano_en_sitio(entidad, espejo)
        else:
            self._transformar_colocacion(
                entidad, transform, angulo_delta, espejo, theta
            )

    def _copiar_transformado(
        self,
        original: Any,
        transform: Any,
        angulo_delta: float = 0.0,
        espejo: bool = False,
        theta: float = 0.0,
    ) -> Any:
        if original.is_a("IfcWall"):
            datos = self._datos_muro(original)
            x1, y1 = transform(datos["x1"], datos["y1"])
            x2, y2 = transform(datos["x2"], datos["y2"])
            copia = self._copiar_entidad(original)
            self._desvincular_representacion(copia)
            self.modelo.create_entity(
                "IfcRelDefinesByType",
                GlobalId=ifcopenshell.guid.new(),
                OwnerHistory=None,
                Name=None,
                Description=None,
                RelatedObjects=[copia],
                RelatingType=self._tipo_entidad(original),
            )
            self._guardar_pset(
                copia, "OPENRVT_Muro", self._pset_muro_trasformado(original, espejo)
            )
            self._copiar_restricciones(original, copia)
            self._limpiar_enlace(copia)
            self._colocar_muro(copia, x1, y1, x2, y2, datos["z"])
            for rel in getattr(original, "ContainedInStructure", ()) or ():
                spatial_api.assign_container(
                    self.modelo,
                    products=[copia],
                    relating_structure=rel.RelatingStructure,
                )
            for vano in self._aberturas_de(original):
                if vano.is_a("IfcOpeningElement"):
                    self._copiar_vano(vano, copia, espejo)
            self._regenerar_muro(copia)
            return copia
        if original.is_a("IfcSlab"):
            copia = self._copiar_entidad(original)
            self._desvincular_representacion(copia)
            datos_losa = dict(self._leer_pset(original, "OPENRVT_Losa"))
            if datos_losa:
                self._guardar_pset(copia, "OPENRVT_Losa", datos_losa)
            self._transformar_losa(copia, transform)
            for rel in getattr(original, "ContainedInStructure", ()) or ():
                spatial_api.assign_container(
                    self.modelo,
                    products=[copia],
                    relating_structure=rel.RelatingStructure,
                )
            return copia
        if self._leer_pset(original, "OPENRVT_Estructura"):
            copia = self._copiar_entidad(original)
            self._desvincular_representacion(copia)
            self._guardar_pset(
                copia,
                "OPENRVT_Estructura",
                dict(self._leer_pset(original, "OPENRVT_Estructura")),
            )
            tipo = self._tipo_entidad(original)
            if tipo is not None:
                type_api.assign_type(
                    self.modelo, related_objects=[copia], relating_type=tipo
                )
            self._copiar_restricciones(original, copia)
            self._limpiar_enlace(copia)
            self._transformar_estructura(
                copia, transform, angulo_delta, espejo, theta
            )
            for rel in getattr(original, "ContainedInStructure", ()) or ():
                spatial_api.assign_container(
                    self.modelo,
                    products=[copia],
                    relating_structure=rel.RelatingStructure,
                )
            return copia
        copia = self._copiar_entidad(original)
        self._copiar_restricciones(original, copia)
        self._limpiar_enlace(copia)
        self._transformar_colocacion(
            copia, transform, angulo_delta, espejo, theta
        )
        return copia

    def _expandir_seleccion(self, gids: list[str]) -> list[Any]:
        """Elementos a transformar; un muro ya arrastra sus vanos."""
        salida: list[Any] = []
        vistos: set[str] = set()
        for gid in gids:
            original = self._entidad_por_gid(gid)
            if _gid(original) in vistos:
                continue
            if original.is_a("IfcWall"):
                salida.append(original)
                vistos.add(_gid(original))
                for producto in self._aberturas_de(original):
                    vistos.add(_gid(producto))
            elif original.is_a("IfcOpeningElement"):
                relleno = self._relleno_de(original)
                salida.append(original)
                vistos.add(_gid(original))
                if relleno is not None:
                    vistos.add(_gid(relleno))
            else:
                salida.append(original)
                vistos.add(_gid(original))
        return salida

    @crea_openrvt
    def elementos_espejo(
        self, globalids: Any, p1: Any, p2: Any, copiar: bool = True
    ) -> dict[str, Any]:
        """ED2: refleja los elementos respecto a la recta p1-p2."""
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        try:
            p1 = (float(p1[0]), float(p1[1]))
            p2 = (float(p2[0]), float(p2[1]))
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("El eje de simetría no es válido.", -32602) from exc
        if math.hypot(p2[0] - p1[0], p2[1] - p1[1]) <= TOLERANCIA_CALCULO:
            raise self._error("El eje de simetría necesita dos puntos distintos.", -32602)
        transform = lambda x, y: self._reflejar_punto(p1, p2, x, y)  # noqa: E731
        theta = self._angulo_eje(p1, p2)
        copiar = bool(copiar)
        self._instantanea()
        creados: list[Any] = []
        modificados: list[Any] = []
        enlaces = 0
        for entidad in self._expandir_seleccion(gids):
            if copiar:
                creados.append(
                    self._copiar_transformado(entidad, transform, espejo=True, theta=theta)
                )
            else:
                if self._limpiar_enlace(entidad):
                    enlaces += 1
                self._transformar_en_sitio(entidad, transform, espejo=True, theta=theta)
                modificados.append(entidad)
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        mensaje = f"{len(creados) + len(modificados)} elemento(s) reflejado(s)."
        if enlaces:
            mensaje += (
                f" Se quitaron los enlaces a ejes de {enlaces} elemento(s)."
            )
        return self._resultado(
            creados=creados,
            modificados=modificados,
            mensaje=mensaje,
            enlaces_quitados=enlaces,
        )

    @crea_openrvt
    def elementos_matriz_lineal(
        self, globalids: Any, vector: Any, numero: int, modo: str = "al_segundo"
    ) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        try:
            vx, vy = float(vector[0]), float(vector[1])
            numero = int(numero)
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("La matriz lineal no es válida.", -32602) from exc
        if numero < 2:
            raise self._error("La matriz necesita al menos 2 elementos.", -32602)
        modo = _texto(modo).strip().lower().replace(" ", "_")
        if modo not in ("al_segundo", "al_ultimo"):
            raise self._error(
                "El modo de la matriz debe ser «al_segundo» o «al_ultimo».",
                -32602,
            )
        self._instantanea()
        paso = (vx / (numero - 1), vy / (numero - 1)) if modo == "al_ultimo" else (vx, vy)
        creados: list[Any] = []
        for i in range(1, numero):
            resultado = self._copiar_elementos(
                gids, paso[0] * i, paso[1] * i, 0.0
            )
            creados.extend(resultado["creados"])
        self.con_cambios = True
        return self._resultado(
            creados=creados,
            mensaje=f"{len(creados)} elemento(s) copiado(s) en matriz lineal.",
        )

    @crea_openrvt
    def elementos_matriz_polar(
        self, globalids: Any, centro: Any, angulo_total: float, numero: int
    ) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        try:
            cx, cy = float(centro[0]), float(centro[1])
            angulo_total = float(angulo_total)
            numero = int(numero)
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("La matriz polar no es válida.", -32602) from exc
        if numero < 2:
            raise self._error("La matriz necesita al menos 2 elementos.", -32602)
        # 360° reparte entre todas las copias para no duplicar la primera al cerrar.
        divisor = numero if abs(abs(angulo_total) - 360.0) <= 1e-9 else numero - 1
        paso = math.radians(angulo_total / divisor)
        self._instantanea()
        creados: list[Any] = []
        for i in range(1, numero):
            angulo = paso * i
            coseno, seno = math.cos(angulo), math.sin(angulo)
            transform = (
                lambda x, y, c=coseno, s=seno: (
                    cx + (x - cx) * c - (y - cy) * s,
                    cy + (x - cx) * s + (y - cy) * c,
                )
            )
            for entidad in self._expandir_seleccion(gids):
                creados.append(
                    self._copiar_transformado(
                        entidad,
                        transform,
                        angulo_delta=angulo,
                    )
                )
        self.con_cambios = True
        return self._resultado(
            creados=creados,
            mensaje=f"{len(creados)} elemento(s) copiado(s) en matriz polar.",
        )

