"""Utilidades internas: resultados, contextos, psets y niveles."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class UtilidadesMixin:
    # ------------------------------------------------------------------ utilidades
    def _resultado(
        self,
        creados: Iterable[Any] | None = None,
        modificados: Iterable[Any] | None = None,
        borrados: Iterable[Any] | None = None,
        mensaje: str = "",
        **extra: Any,
    ) -> dict[str, Any]:
        extra_creados = getattr(self, "_creados_de_rebote", None) or []
        self._creados_de_rebote = []
        todos_creados: list[Any] = list(creados or []) + list(extra_creados)
        vistos_creados: set[str] = set()
        creados_limpios: list[Any] = []
        for entidad in todos_creados:
            gid = _gid(entidad) if not isinstance(entidad, str) else entidad
            if gid in vistos_creados:
                continue
            vistos_creados.add(gid)
            creados_limpios.append(gid)
        salida: dict[str, Any] = {
            "creados": creados_limpios,
            "modificados": [
                _gid(e) if not isinstance(e, str) else e for e in (modificados or [])
            ],
            "borrados": [_gid(e) if not isinstance(e, str) else e for e in (borrados or [])],
            "mensaje": mensaje,
        }
        # Vecinos regenerados de rebote (muros unidos, losas con bordes en muros):
        # la app solo vuelve a teselar lo que se reporta, así que se agregan aquí.
        extra_regenerados = getattr(self, "_regenerados_de_rebote", None) or []
        self._regenerados_de_rebote = []
        ya = set(salida["creados"]) | set(salida["modificados"]) | set(salida["borrados"])
        for gid in extra_regenerados:
            if gid in ya:
                continue
            try:
                self.modelo.by_guid(gid)
            except Exception:
                continue
            salida["modificados"].append(gid)
            ya.add(gid)
        salida.update(extra)
        return salida

    def _contexto(self, identificador: str = "Body", vista: str = "MODEL_VIEW") -> Any:
        modelo = self.modelo
        import ifcopenshell.util.representation as representation

        encontrado = representation.get_context(modelo, "Model", identificador, vista)
        # El contexto base no tiene ContextIdentifier: hace falta un subcontexto real
        # (Model/Body/MODEL_VIEW) para que la regeneración de muros pueda trabajar.
        if encontrado is not None and getattr(encontrado, "ContextIdentifier", None) == identificador:
            return encontrado
        padre = None
        for candidato in modelo.by_type("IfcGeometricRepresentationContext"):
            if (
                getattr(candidato, "ContextType", None) == "Model"
                and not getattr(candidato, "ContextIdentifier", None)
            ):
                padre = candidato
                break
        if padre is None:
            padre = context_api.add_context(modelo, context_type="Model")
        return context_api.add_context(
            modelo,
            context_type="Model",
            context_identifier=identificador,
            target_view=vista,
            parent=padre,
        )

    def _entidad_por_gid(self, globalid: str, clases: tuple[str, ...] | None = None) -> Any:
        if not globalid:
            raise self._error("Falta el GlobalId.", -32602)
        if clases:
            candidatas = [e for clase in clases for e in self.modelo.by_type(clase)]
        else:
            candidatas = self.modelo.by_type("IfcRoot")
        for entidad in candidatas:
            if _gid(entidad) == globalid:
                return entidad
        raise self._error(f"No existe el elemento {globalid}.", -32005)

    @staticmethod
    def _error(mensaje: str, codigo: int = -32000) -> Exception:
        from ..modelo import ErrorNucleo

        return ErrorNucleo(mensaje, codigo)

    def _pset(self, entidad: Any, nombre: str, crear: bool = False) -> Any:
        # O007a: en IFC4 los materiales no son IfcObject; su pset es un
        # IfcMaterialProperties enlazado por el atributo Material.
        if entidad.is_a("IfcMaterial"):
            for propiedades in getattr(entidad, "HasProperties", ()) or ():
                if getattr(propiedades, "Name", "") == nombre:
                    return propiedades
            if not crear:
                return None
            return self.modelo.create_entity(
                "IfcMaterialProperties",
                Name=nombre,
                Description="Datos de OPEN-RVT",
                Properties=[],
                Material=entidad,
            )
        if entidad.is_a("IfcTypeObject"):
            # Los tipos guardan sus psets en HasPropertySets, no en IsDefinedBy.
            for pset in getattr(entidad, "HasPropertySets", ()) or ():
                if getattr(pset, "Name", "") == nombre:
                    return pset
            if not crear:
                return None
            pset = self.modelo.create_entity(
                "IfcPropertySet",
                GlobalId=ifcopenshell.guid.new(),
                OwnerHistory=None,
                Name=nombre,
                Description="Datos de OPEN-RVT",
                HasProperties=[],
            )
            entidad.HasPropertySets = list(
                getattr(entidad, "HasPropertySets", ()) or []
            ) + [pset]
            return pset
        for rel in getattr(entidad, "IsDefinedBy", ()) or ():
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            pset = getattr(rel, "RelatingPropertyDefinition", None)
            if pset is not None and getattr(pset, "Name", "") == nombre:
                return pset
        if not crear:
            return None
        pset = self.modelo.create_entity(
            "IfcPropertySet",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=nombre,
            Description="Datos de OPEN-RVT",
            HasProperties=[],
        )
        self.modelo.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=None,
            Description=None,
            RelatedObjects=[entidad],
            RelatingPropertyDefinition=pset,
        )
        return pset

    def _leer_pset(self, entidad: Any, nombre: str) -> dict[str, Any]:
        pset = self._pset(entidad, nombre)
        if pset is None:
            return {}
        salida: dict[str, Any] = {}
        propiedades = getattr(pset, "HasProperties", ()) or getattr(
            pset, "Properties", ()
        ) or ()
        for prop in propiedades:
            valor = getattr(prop, "NominalValue", None)
            if valor is None:
                continue
            salida[_nombre(prop)] = getattr(valor, "wrappedValue", None)
        return salida

    def _guardar_pset(self, entidad: Any, nombre: str, valores: dict[str, Any]) -> None:
        if entidad.is_a("IfcMaterial") and nombre == "OPENRVT_Material":
            self._guardar_material_pset(entidad, valores)
            return
        pset = self._pset(entidad, nombre, crear=True)
        existentes = {_nombre(p): p for p in (getattr(pset, "HasProperties", ()) or ())}
        for clave, valor in valores.items():
            anterior = existentes.get(clave)
            if anterior is not None:
                self.modelo.remove(anterior)
            if isinstance(valor, bool):
                nominal: Any = self.modelo.create_entity("IfcBoolean", bool(valor))
            elif isinstance(valor, (int, float)):
                nominal = self.modelo.create_entity("IfcReal", float(valor))
            else:
                nominal = self.modelo.create_entity("IfcLabel", str(valor))
            nueva = self.modelo.create_entity(
                "IfcPropertySingleValue",
                Name=clave,
                Description=None,
                NominalValue=nominal,
            )
            pset.HasProperties = list(getattr(pset, "HasProperties", ()) or ()) + [nueva]
            existentes[clave] = nueva

    def _quitar_claves_pset(self, entidad: Any, nombre: str, claves: tuple[str, ...]) -> None:
        """Borra propiedades concretas de un pset (no basta con reescribirlo)."""
        pset = self._pset(entidad, nombre)
        if pset is None:
            return
        existentes = {_nombre(p): p for p in (getattr(pset, "HasProperties", ()) or ())}
        for clave in claves:
            anterior = existentes.get(clave)
            if anterior is not None:
                self.modelo.remove(anterior)
                pset.HasProperties = [
                    p
                    for p in (getattr(pset, "HasProperties", ()) or ())
                    if p != anterior
                ]

    def _nivel_por_gid(self, globalid: str) -> Any:
        return self._entidad_por_gid(globalid, ("IfcBuildingStorey",))

    def _edificio(self) -> Any:
        edificios = self.modelo.by_type("IfcBuilding")
        if edificios:
            return edificios[0]
        return self._proyecto()

    def _elementos_de_nivel(self, nivel: Any) -> list[Any]:
        salida = []
        for rel in getattr(nivel, "ContainsElements", ()) or ():
            salida.extend(getattr(rel, "RelatedElements", ()) or ())
        for rel in getattr(nivel, "ContainsElements", ()) or ():
            for elemento in getattr(rel, "RelatedElements", ()) or ():
                salida.extend(self._aberturas_de(elemento))
        return salida

