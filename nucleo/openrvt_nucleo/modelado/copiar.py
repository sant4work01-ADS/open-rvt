"""Copia de elementos y cambio de tipo."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class CopiarMixin:
    @crea_openrvt
    def elementos_copiar(self, globalids: Any, dx: float, dy: float, dz: float) -> dict[str, Any]:
        """ED2: un solo paso de deshacer para todas las copias."""
        self._instantanea()
        resultado = self._copiar_elementos(globalids, dx, dy, dz)
        self.con_cambios = True
        return resultado

    def _copiar_elementos(
        self, globalids: Any, dx: float, dy: float, dz: float
    ) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        try:
            dx, dy, dz = float(dx), float(dy), float(dz)
        except (TypeError, ValueError) as exc:
            raise self._error("El desplazamiento no es numérico.", -32602) from exc
        # O041: copiar un cerramiento ligado dejaría una copia colgando del muro
        # original; se avisa y se deja soltar primero.
        for gid in gids:
            entidad = self._entidad_por_gid(gid)
            if self._muro_ligado_de(entidad):
                raise self._error(
                    f"El cerramiento «{_nombre(entidad)}» está ligado al muro: "
                    "use «Soltar del muro» antes de copiarlo.",
                    -32602,
                )
        creados: list[Any] = []
        for gid in gids:
            original = self._entidad_por_gid(gid)
            if original.is_a("IfcWall"):
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
                datos = self._datos_muro(original)
                self._guardar_pset(
                    copia,
                    "OPENRVT_Muro",
                    {
                        "Longitud": datos["longitud"],
                        "Altura": datos["altura"],
                        "Espesor": datos["espesor"],
                        "Alineacion": datos["alineacion"],
                    },
                )
                self._copiar_restricciones(original, copia)
                geometry_api.assign_representation(
                    self.modelo, product=copia, representation=self._cuerpo_muro(copia)
                )
                geometry_api.edit_object_placement(
                    self.modelo,
                    product=copia,
                    matrix=self._matriz_traslado(copia, dx, dy, dz),
                    is_si=True,
                )
                for rel in getattr(original, "ContainedInStructure", ()) or ():
                    spatial_api.assign_container(
                        self.modelo,
                        products=[copia],
                        relating_structure=rel.RelatingStructure,
                    )
                # ED2: el muro copiado arrastra sus vanos y sus puertas/ventanas.
                for vano in self._aberturas_de(original):
                    if vano.is_a("IfcOpeningElement"):
                        self._copiar_vano(vano, copia)
                self._regenerar_muro(copia)
                self._unir_muros(copia)
                creados.append(copia)
            elif original.is_a("IfcSlab"):
                copia = self._copiar_entidad(original)
                datos_losa = dict(self._leer_pset(original, "OPENRVT_Losa"))
                if datos_losa:
                    # El contorno vive en coordenadas locales; el traslado va en la
                    # colocación, así que se conserva el pset tal cual.
                    self._guardar_pset(copia, "OPENRVT_Losa", datos_losa)
                geometry_api.edit_object_placement(
                    self.modelo,
                    product=copia,
                    matrix=self._matriz_traslado(copia, dx, dy, dz),
                    is_si=True,
                )
                for rel in getattr(original, "ContainedInStructure", ()) or ():
                    spatial_api.assign_container(
                        self.modelo,
                        products=[copia],
                        relating_structure=rel.RelatingStructure,
                    )
                creados.append(copia)
            elif self._es_clase_estructura(original.is_a()) and self._leer_pset(
                original, "OPENRVT_Estructura"
            ):
                copia = self._copiar_entidad(original)
                tipo = self._tipo_entidad(original)
                if tipo is not None:
                    type_api.assign_type(
                        self.modelo, related_objects=[copia], relating_type=tipo
                    )
                self._guardar_pset(
                    copia,
                    "OPENRVT_Estructura",
                    dict(self._leer_pset(original, "OPENRVT_Estructura")),
                )
                self._copiar_restricciones(original, copia)
                geometry_api.edit_object_placement(
                    self.modelo,
                    product=copia,
                    matrix=self._matriz_traslado(copia, dx, dy, dz),
                    is_si=True,
                )
                self._desplazar_pset_estructura(copia, dx, dy, dz)
                self._regenerar_estructura(copia)
                for rel in getattr(original, "ContainedInStructure", ()) or ():
                    spatial_api.assign_container(
                        self.modelo,
                        products=[copia],
                        relating_structure=rel.RelatingStructure,
                    )
                creados.append(copia)
            else:
                # O066: cualquier clase conserva nivel, tipo, psets y qtos.
                creados.append(
                    self._copiar_elemento_generico(original, dx, dy, dz)
                )
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado(creados=creados, mensaje=f"{len(creados)} elemento(s) copiado(s).")

    def _tipo_entidad(self, elemento: Any) -> Any:
        relaciones = list(getattr(elemento, "IsTypedBy", ()) or ())
        relaciones += [
            rel
            for rel in (getattr(elemento, "IsDefinedBy", ()) or ())
            if rel.is_a("IfcRelDefinesByType")
        ]
        for rel in relaciones:
            return getattr(rel, "RelatingType", None)
        return None

    def _actualizar_nombre_muro_por_tipo(self, muro: Any, tipo: Any) -> None:
        """O061 regla 5: el Name de omisión de un tipo pasa al del nuevo tipo."""
        actual = _texto(getattr(muro, "Name", ""))
        omisiones = {
            f"Muro {_nombre(candidato)}"
            for candidato in self.modelo.by_type("IfcWallType")
        }
        if actual not in omisiones:
            return
        nuevo = f"Muro {_nombre(tipo)}"
        if nuevo.strip() and muro.Name != nuevo:
            muro.Name = nuevo

    def _cambiar_tipo_muro(self, muro: Any, tipo: Any) -> None:
        type_api.assign_type(self.modelo, related_objects=[muro], relating_type=tipo)
        self._actualizar_nombre_muro_por_tipo(muro, tipo)
        datos = self._datos_muro(muro)
        espesor = self._espesor_tipo(tipo)
        self._guardar_pset(
            muro,
            "OPENRVT_Muro",
            {
                "Longitud": datos["longitud"],
                "Altura": datos["altura"],
                "Espesor": espesor,
                "Alineacion": datos["alineacion"],
            },
        )

