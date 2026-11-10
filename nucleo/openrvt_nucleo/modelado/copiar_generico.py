"""O066: copia genérica de elementos ajenos a muro/losa/estructura.

Conserva el contenedor espacial, el tipo y todos los psets y qtos.  Los psets
se recrean como entidades nuevas: editar la copia nunca cambia al original.
"""

from __future__ import annotations

from typing import Any

import ifcopenshell
import ifcopenshell.api.geometry as geometry_api
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api

from .comun import *  # noqa: F401,F403


class CopiarGenericoMixin:
    def _copiar_elemento_generico(
        self, original: Any, dx: float, dy: float, dz: float
    ) -> Any:
        copia = self._copiar_entidad(original)
        self._copiar_psets_y_qtos(original, copia)
        tipo = self._tipo_entidad(original)
        if tipo is not None:
            type_api.assign_type(
                self.modelo, related_objects=[copia], relating_type=tipo
            )
        for rel in getattr(original, "ContainedInStructure", ()) or ():
            spatial_api.assign_container(
                self.modelo,
                products=[copia],
                relating_structure=rel.RelatingStructure,
            )
        geometry_api.edit_object_placement(
            self.modelo,
            product=copia,
            matrix=self._matriz_traslado(copia, dx, dy, dz),
            is_si=True,
        )
        return copia

    def _copiar_psets_y_qtos(self, original: Any, copia: Any) -> None:
        for rel in getattr(original, "IsDefinedBy", ()) or ():
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            definicion = getattr(rel, "RelatingPropertyDefinition", None)
            if definicion is None:
                continue
            nueva = self._copiar_definicion(definicion)
            self.modelo.create_entity(
                "IfcRelDefinesByProperties",
                GlobalId=ifcopenshell.guid.new(),
                OwnerHistory=None,
                Name=None,
                Description=None,
                RelatedObjects=[copia],
                RelatingPropertyDefinition=nueva,
            )

    def _copiar_definicion(self, definicion: Any) -> Any:
        nueva = self.modelo.create_entity(definicion.is_a())
        for i in range(len(definicion)):
            nombre = definicion.attribute_name(i)
            valor = definicion[i]
            if nombre == "GlobalId":
                nueva[i] = ifcopenshell.guid.new()
            elif nombre in ("HasProperties", "Quantities"):
                nueva[i] = [self._copiar_propiedad(p) for p in (valor or [])]
            else:
                nueva[i] = valor
        return nueva

    def _copiar_propiedad(self, propiedad: Any) -> Any:
        nueva = self.modelo.create_entity(propiedad.is_a())
        for i in range(len(propiedad)):
            nombre = propiedad.attribute_name(i)
            valor = propiedad[i]
            if nombre == "GlobalId":
                nueva[i] = ifcopenshell.guid.new()
            elif nombre in (
                "HasProperties",
                "Quantities",
                "EnumerationValues",
                "ListValues",
            ):
                nueva[i] = [
                    self._copiar_propiedad(x) if hasattr(x, "is_a") else x
                    for x in (valor or [])
                ]
            else:
                nueva[i] = valor
        return nueva
