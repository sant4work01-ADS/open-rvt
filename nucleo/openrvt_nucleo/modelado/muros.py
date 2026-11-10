"""Muros: datos, cuerpo y creación."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class MurosMixin:
    # ------------------------------------------------------------------ muros
    def _datos_muro(self, muro: Any) -> dict[str, Any]:
        datos = self._leer_pset(muro, "OPENRVT_Muro")
        import ifcopenshell.util.placement as placement

        matriz = placement.get_local_placement(muro.ObjectPlacement)
        x = float(matriz[0][3])
        y = float(matriz[1][3])
        z = float(matriz[2][3])
        dx = float(matriz[0][0])
        dy = float(matriz[1][0])
        largo = float(datos.get("Longitud") or 0.0)
        if largo <= 0:
            largo = float(datos.get("Largo") or 0.0)
        espesor = float(datos.get("Espesor") or 0.0)
        if largo <= 0 or espesor <= 0:
            # Muros de archivos abiertos: se toman del eje y del tipo/material.
            forma = getattr(muro, "Representation", None)
            for rep in getattr(forma, "Representations", ()) or []:
                if getattr(rep, "RepresentationIdentifier", "") != "Axis":
                    continue
                for item in getattr(rep, "Items", ()) or []:
                    puntos = []
                    for punto in getattr(item, "Points", ()) or ():
                        coords = list(getattr(punto, "Coordinates", ()) or ())
                        if len(coords) >= 2:
                            puntos.append(coords)
                    if len(puntos) >= 2 and largo <= 0:
                        largo = math.hypot(
                            float(puntos[-1][0]) - float(puntos[0][0]),
                            float(puntos[-1][1]) - float(puntos[0][1]),
                        )
        if espesor <= 0:
            tipo = self._tipo_entidad(muro)
            if tipo is not None and tipo.is_a("IfcWallType"):
                espesor = self._espesor_tipo(tipo)
            else:
                espesor = 0.20
        return {
            "x1": x,
            "y1": y,
            "z": z,
            "dx": dx,
            "dy": dy,
            "longitud": largo,
            "altura": float(datos.get("Altura") or 2.6),
            "espesor": espesor,
            "alineacion": str(datos.get("Alineacion") or "centro"),
            "linea_ubicacion": self._linea_de_muro(muro, datos),
            "desfase_ubicacion": float(datos.get("DesfaseUbicacion") or 0.0),
            "volteado": datos.get("Volteado") in (True, "True", "true", 1, "1"),
            # O035: por omisión la base baja hasta la cimentación de debajo.
            "bajar_a_cimentacion": datos.get("BajarACimentacion", True)
            not in (False, "False", "false", 0, "0"),
            "x2": x + dx * largo,
            "y2": y + dy * largo,
        }

    def _aberturas_de(self, muro: Any) -> list[Any]:
        salida = []
        for rel in getattr(muro, "HasOpenings", ()) or ():
            vano = getattr(rel, "RelatedOpeningElement", None)
            if vano is None:
                continue
            salida.append(vano)
            for relleno in getattr(vano, "HasFillings", ()) or ():
                elemento = getattr(relleno, "RelatedBuildingElement", None)
                if elemento is not None:
                    salida.append(elemento)
        return salida

    def _relleno_de(self, vano: Any) -> Any | None:
        for rel in getattr(vano, "HasFillings", ()) or ():
            return getattr(rel, "RelatedBuildingElement", None)
        return None

    def _caja_local(
        self,
        largo: float,
        alto: float,
        espesor: float,
        z0: float = 0.0,
        dx: float = 0.0,
    ) -> Any:
        """Caja de pared (largo × espesor × alto) como cuerpo simple."""
        hx, hy = largo / 2.0, espesor / 2.0
        vertices = [
            [dx, -hy, z0],
            [dx + largo, -hy, z0],
            [dx + largo, hy, z0],
            [dx, hy, z0],
            [dx, -hy, z0 + alto],
            [dx + largo, -hy, z0 + alto],
            [dx + largo, hy, z0 + alto],
            [dx, hy, z0 + alto],
        ]
        caras = [
            [0, 3, 2, 1],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [1, 2, 6, 5],
            [2, 3, 7, 6],
            [3, 0, 4, 7],
        ]
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        rep.RepresentationIdentifier = "Body"
        return rep

    def _cuerpo_hueco(
        self,
        largo: float,
        alto: float,
        espesor: float,
        z0: float,
        dx: float,
        offset: float = 0.0,
    ) -> Any:
        """Prisma de un vano, ligeramente más grueso que el muro para cortarlo bien.

        Se usa una extrusión de muro (no una malla) porque el recorte de vanos de
        IfcOpenShell necesita sólidos limpios.
        """
        rep = geometry_api.add_wall_representation(
            self.modelo,
            context=self._contexto(),
            length=max(largo, 0.001),
            height=max(alto, 0.001),
            thickness=max(espesor + 0.20, 0.001),
            offset=offset,
        )
        rep.RepresentationIdentifier = "Body"
        return rep

    def _cuerpo_muro(self, muro: Any) -> Any:
        """O010/O012b: cuerpo del muro con esquinas ingleteadas y jerarquía.

        En planta el muro termina en las caras de castillos y columnas. En alzado
        su base arranca en la cara superior de la contratrabe, la dala o la losa
        que lo soporta, y su corona se recorta en la cara inferior del cerramiento
        o de la losa que lo cubre.
        """
        datos = self._datos_muro(muro)
        poligonos = self._huellas_muro(muro, datos)
        base, cima = self._limites_verticales_muro_nivel(muro, datos)
        # O058: los elementos horizontales que no tocan base ni corona parten el
        # cuerpo en tramos verticales (muro abajo, elemento, muro arriba).
        intervalos = self._intervalos_intermedios_muro(muro, datos, base, cima)
        # O035: la base baja por tramos hasta la cara superior de la zapata
        # corrida o la contratrabe que esté debajo en planta.
        bajadas = self._tramos_bajada_muro(muro, datos)
        if base > float(datos["z"]) + TOLERANCIA_CALCULO:
            # El muro ya se apoya en algo por encima de su nivel: no se baja.
            bajadas = []
        items: list[Any] = []
        temporales = []
        offset_cuerpo = self._desfase_de_muro(muro, datos["espesor"])
        for poligono in poligonos:
            for pieza, z0 in self._partir_por_bajadas(poligono, base, bajadas):
                alto = cima - z0
                if alto <= TOLERANCIA_CALCULO:
                    continue
                # O062: el muro es un solo prisma de base a corona; los
                # intermedios se restan como bolsillos que dejan una piel de
                # 0.015 m en las caras exteriores. Sin tramos apilados no hay
                # tapas internas ni aristas horizontales sobre la cara plana.
                rep = geometry_api.add_slab_representation(
                    self.modelo,
                    context=self._contexto(),
                    depth=alto,
                    direction_sense="POSITIVE",
                    offset=z0 - datos["z"],
                    polyline=pieza,
                )
                temporales.append(rep)
                if not rep.Items:
                    continue
                item = rep.Items[0]
                cortes = self._cortes_intermedios_muro(
                    pieza, datos, intervalos, z0, cima, offset_cuerpo
                )
                temporales.extend(cortes[0])
                if cortes[1]:
                    try:
                        creados = geometry_api.add_boolean(
                            self.modelo,
                            first_item=item,
                            second_items=cortes[1],
                            operator="DIFFERENCE",
                        )
                    except Exception:
                        LOG.warning(
                            "no se pudo restar un intermedio del muro", exc_info=True
                        )
                        creados = None
                    if creados:
                        item = (
                            creados[-1]
                            if isinstance(creados, (list, tuple))
                            else creados
                        )
                items.append(item)
        # O062: si hay varias piezas (castillos o bajadas) se funden en un solo
        # sólido compartido.
        items = self._unir_solidos(items)
        # La representación final es una sola con el sólido del muro.
        context = self._contexto()
        cuerpo = self.modelo.create_entity(
            "IfcShapeRepresentation",
            context,
            context.ContextIdentifier,
            "SweptSolid",
            items,
        )
        for rep in temporales:
            try:
                self.modelo.remove(rep)
            except Exception:
                LOG.debug("no se pudo quitar una representación temporal", exc_info=True)
        vanos = []
        for rel in getattr(muro, "HasOpenings", ()) or ():
            vano = getattr(rel, "RelatedOpeningElement", None)
            if vano is None:
                continue
            info = self._datos_abertura(vano)
            if info is None:
                continue
            vanos.append(
                self._cuerpo_hueco(
                    info["ancho"],
                    info["alto"],
                    datos["espesor"],
                    info["antepecho"],
                    info["distancia"],
                    self._desfase_de_muro(muro, datos["espesor"]),
                )
            )
        cuerpo.RepresentationIdentifier = "Body"
        if vanos:
            for item in items:
                try:
                    geometry_api.add_boolean(
                        self.modelo,
                        first_item=item,
                        second_items=vanos,
                        operator="DIFFERENCE",
                    )
                except Exception:
                    LOG.warning(
                        "no se pudo descontar los vanos del muro", exc_info=True
                    )
        return cuerpo


    @crea_openrvt
    def muro_crear(
        self,
        tipo: str,
        nivel: str,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        altura: float = 2.60,
        alineacion: str = "centro",
        linea_ubicacion: str | None = None,
        desfase_ubicacion: float = 0.0,
        volteado: bool = False,
        desfase_base: float = 0.0,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_muro(tipo)
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
            altura = float(altura)
            desfase_ubicacion = float(desfase_ubicacion)
            desfase_base = float(desfase_base)
        except (TypeError, ValueError) as exc:
            raise self._error("Los datos del muro no son números.", -32602) from exc
        if not math.isfinite(desfase_base):
            raise self._error("El desfase de base del muro no es un número.", -32602)
        if alineacion not in ALINEACIONES:
            raise self._error(
                f"Alineación «{alineacion}» no válida; use centro, interior o exterior.",
                -32602,
            )
        if linea_ubicacion is None:
            linea_ubicacion = {
                "centro": "eje_nucleo",
                "interior": "cara_interior",
                "exterior": "cara_exterior",
            }[alineacion]
        if linea_ubicacion not in LINEAS_UBICACION:
            raise self._error(
                "«Línea de ubicación» no válida; use eje_nucleo, cara_exterior, "
                "cara_interior o centro.",
                -32602,
            )
        x1, y1, x2, y2 = self._ajustar_extremos_a_ejes(x1, y1, x2, y2)
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El muro necesita dos puntos distintos.", -32602)
        if altura <= 0:
            raise self._error("La altura del muro debe ser positiva.", -32602)

        elevacion = float(nivel_entidad.Elevation or 0.0)
        superior = self._nivel_inmediato_superior(elevacion)
        restriccion = {
            "NivelBase": _gid(nivel_entidad),
            "DesfaseBase": desfase_base,
            "NivelTope": _gid(superior) if superior is not None else "",
            "DesfaseTope": 0.0,
            "AlturaSinConexion": altura,
        }
        if superior is not None:
            elev_tope = float(superior.Elevation or 0.0)
            try:
                _, altura = altura_restringida(
                    elevacion, desfase_base, elev_tope, 0.0, altura
                )
            except ValueError as exc:
                raise self._error(str(exc), -32602) from exc
        self._instantanea()
        espesor = self._espesor_tipo(tipo_entidad)
        muro = root.create_entity(self.modelo, ifc_class="IfcWall")
        muro.Name = f"Muro {_nombre(tipo_entidad)}"
        type_api.assign_type(self.modelo, related_objects=[muro], relating_type=tipo_entidad)
        self._guardar_pset(
            muro,
            "OPENRVT_Muro",
            {
                "Longitud": largo,
                "Altura": altura,
                "Espesor": espesor,
                "Alineacion": alineacion,
                "LineaUbicacion": linea_ubicacion,
                "DesfaseUbicacion": desfase_ubicacion,
                "DesfaseBase": desfase_base,
                "Volteado": bool(volteado),
                "BajarACimentacion": True,
            },
        )
        self._guardar_pset(muro, PSET_RESTRICCIONES, restriccion)
        # O036: dos clics sobre cruces de ejes enlazan el muro al eje común.
        self._enlazar_auto_tramo(muro, x1, y1, x2, y2)
        cuerpo = self._cuerpo_muro(muro)
        geometry_api.assign_representation(self.modelo, product=muro, representation=cuerpo)
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        matriz = np.array(
            [
                [ux, -uy, 0.0, x1],
                [uy, ux, 0.0, y1],
                [0.0, 0.0, 1.0, elevacion + desfase_base],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )
        geometry_api.edit_object_placement(self.modelo, product=muro, matrix=matriz)
        spatial_api.assign_container(
            self.modelo, products=[muro], relating_structure=nivel_entidad
        )
        self._regenerar_eje(muro)
        uniones = self._unir_muros(muro)
        self.con_cambios = True
        return self._resultado(
            [muro],
            mensaje=(
                f"Muro creado ({largo:.2f} m)."
                + (f" Unido a {len(uniones)} muro(s)." if uniones else "")
            ),
            uniones=[_gid(u) for u in uniones],
        )

