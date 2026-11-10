"""Tipos de muro y materiales de proyecto."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class TiposMixin:
    # ------------------------------------------------------------------ tipos de muro
    def _crear_tipo_muro(self, nombre: str, espesor: float) -> Any:
        modelo = self.modelo
        tipo = root.create_entity(modelo, ifc_class="IfcWallType", name=nombre)
        if hasattr(tipo, "PredefinedType"):
            tipo.PredefinedType = "SOLIDWALL"
        capa_set = material_api.add_material_set(
            modelo, name=nombre, set_type="IfcMaterialLayerSet"
        )
        material = material_api.add_material(modelo, name=nombre, category="concrete" if "Concreto" in nombre else "block")
        capa = material_api.add_layer(modelo, layer_set=capa_set, material=material, name=nombre)
        material_api.edit_layer(
            modelo, layer=capa, attributes={"LayerThickness": float(espesor)}
        )
        capa_set.LayerSetName = nombre
        material_api.assign_material(
            modelo,
            products=[tipo],
            type="IfcMaterialLayerSet",
            material=capa_set,
        )
        self._guardar_pset(tipo, "OPENRVT_TipoMuro", {"Espesor": float(espesor)})
        return tipo

    def crear_tipos_muro(self) -> list[Any]:
        """Crea los cinco tipos de muro de la especificación si faltan."""
        existentes = self.modelo.by_type("IfcWallType")
        por_nombre = {_nombre(t): t for t in existentes}
        creados = []
        for nombre, espesor in TIPOS_MURO:
            if nombre in por_nombre:
                continue
            creados.append(self._crear_tipo_muro(nombre, espesor))
        return creados

    def _asegurar_tipos_muro(self) -> None:
        # En archivos abiertos puede haber tipos propios pero no los de OPEN-RVT:
        # se agregan los que falten al crear el primer muro.
        self.crear_tipos_muro()

    def _tipo_muro(self, nombre: str) -> Any:
        self._asegurar_tipos_muro()
        buscado = (nombre or "").strip()
        for tipo in self.modelo.by_type("IfcWallType"):
            if _nombre(tipo).casefold() == buscado.casefold():
                return tipo
        disponibles = ", ".join(_nombre(t) for t in self.modelo.by_type("IfcWallType"))
        raise self._error(
            f"No existe el tipo de muro «{nombre}». Disponibles: {disponibles}.", -32020
        )

    def _espesor_tipo(self, tipo: Any) -> float:
        datos = self._leer_pset(tipo, "OPENRVT_TipoMuro")
        if datos.get("Espesor") is not None:
            return float(datos["Espesor"])
        import ifcopenshell.util.element as util_elemento

        for material in util_elemento.get_materials(tipo):
            capas = getattr(material, "MaterialLayers", ()) or ()
            if capas:
                return float(sum(float(c.LayerThickness or 0.0) for c in capas))
        return 0.15

    def tipos_listar(self, clase: str = "IfcWallType") -> list[dict[str, Any]]:
        self._exigir_modelo()
        clase = (clase or "IfcWallType").strip()
        if not clase.startswith("Ifc"):
            clase = "Ifc" + clase
        salida = []
        for tipo in self.modelo.by_type(clase):
            datos = {
                "globalid": _gid(tipo),
                "nombre": _nombre(tipo),
                "clase": tipo.is_a(),
            }
            if tipo.is_a("IfcWallType"):
                datos["espesor"] = self._espesor_tipo(tipo)
            salida.append(datos)
        salida.sort(key=lambda d: d["nombre"])
        return salida

