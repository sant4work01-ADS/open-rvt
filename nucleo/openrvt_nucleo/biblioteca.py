"""Biblioteca de materiales y editor de tipos (O007a).

Los materiales son ``IfcMaterial`` con el pset ``OPENRVT_Material`` y los tipos de
muro usan ``IfcMaterialLayerSet`` ordenado de exterior a interior. La geometría de
las instancias se regenera al editar el tipo; el eje queda fijo según
``OPENRVT_TipoMuro.LineaUbicacion``.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

import ifcopenshell
import ifcopenshell.api.material as material_api
import ifcopenshell.api.root as root
import ifcopenshell.api.type as type_api
import ifcopenshell.guid

CORE = "núcleo"
FUNCIONES = ("núcleo", "acabado", "aislante", "membrana")
RAYADOS = ("sólido", "diagonal", "ladrillo", "block", "concreto", "ninguno")
UNIDADES = ("m²", "m³", "kg")


def _texto(valor: Any) -> str:
    return str(valor or "")


# (nombre, categoría, espesor típico, color, rayado, unidad)
MATERIALES_SEMILLA: tuple[tuple[str, str, float, str, str, str], ...] = (
    ("Block de concreto 12", CORE, 0.12, "#c9b18a", "block", "m³"),
    ("Block de concreto 15", CORE, 0.15, "#c9b18a", "block", "m³"),
    ("Block de concreto 20", CORE, 0.20, "#c9b18a", "block", "m³"),
    ("Tabique rojo recocido", CORE, 0.14, "#b5654a", "ladrillo", "m³"),
    ("Tabique hueco", CORE, 0.12, "#c98b6b", "ladrillo", "m³"),
    ("Tablaroca", CORE, 0.0127, "#e8e0cf", "ninguno", "m²"),
    ("Concreto armado", "concreto", 0.15, "#9aa0a6", "concreto", "m³"),
    ("Aplanado de mortero (repellado)", "acabado", 0.015, "#d9d2c5", "ninguno", "m²"),
    ("Aplanado fino", "acabado", 0.005, "#e6e1d8", "ninguno", "m²"),
    ("Yeso", "acabado", 0.010, "#f2efe9", "ninguno", "m²"),
    ("Pasta / tirol", "acabado", 0.003, "#efece6", "ninguno", "m²"),
    ("Pintura", "acabado", 0.0005, "#f7f5f0", "ninguno", "m²"),
    ("Pegazulejo", "acabado", 0.005, "#cfc8ba", "ninguno", "m²"),
    ("Azulejo", "acabado", 0.006, "#a9c9d6", "diagonal", "m²"),
    ("Poliestireno (aislante)", "aislante", 0.025, "#d8e6f0", "diagonal", "m²"),
)

# Los cinco tipos de O003b quedan como un solo núcleo con el material de la biblioteca.
TIPOS_BASE: tuple[tuple[str, str, float], ...] = (
    ("Block 12", "Block de concreto 12", 0.12),
    ("Block 15", "Block de concreto 15", 0.15),
    ("Block 20", "Block de concreto 20", 0.20),
    ("Tabique", "Tabique rojo recocido", 0.14),
    ("Concreto", "Concreto armado", 0.15),
)

# Tipos de ejemplo de muro multicapa, de exterior a interior.
TIPOS_EJEMPLO: tuple[tuple[str, tuple[tuple[str, str, float], ...], str], ...] = (
    (
        "Block 15 aplanado-yeso",
        (
            ("Pintura", "acabado", 0.0005),
            ("Aplanado fino", "acabado", 0.005),
            ("Aplanado de mortero (repellado)", "acabado", 0.015),
            ("Block de concreto 15", CORE, 0.15),
            ("Yeso", "acabado", 0.010),
            ("Pintura", "acabado", 0.0005),
        ),
        "eje_nucleo",
    ),
    (
        "Tabique 14 aplanado ambos lados",
        (
            ("Aplanado fino", "acabado", 0.005),
            ("Aplanado de mortero (repellado)", "acabado", 0.015),
            ("Tabique rojo recocido", CORE, 0.14),
            ("Aplanado de mortero (repellado)", "acabado", 0.015),
            ("Aplanado fino", "acabado", 0.005),
        ),
        "eje_nucleo",
    ),
    (
        "Block 15 baño",
        (
            ("Aplanado fino", "acabado", 0.005),
            ("Aplanado de mortero (repellado)", "acabado", 0.015),
            ("Block de concreto 15", CORE, 0.15),
            ("Aplanado de mortero (repellado)", "acabado", 0.015),
            ("Pegazulejo", "acabado", 0.005),
            ("Azulejo", "acabado", 0.006),
        ),
        "eje_nucleo",
    ),
)

LINEAS_UBICACION = ("eje_nucleo", "cara_exterior", "cara_interior", "centro")

# ---------------------------------------------------------------- estructura (O007b)
# Alias de tipo → (clase IFC, PredefinedType, ElementType). El alias fija las tres.
ALIAS_ESTRUCTURA: dict[str, tuple[str, str, str | None]] = {
    "zapata": ("IfcFootingType", "PAD_FOOTING", None),
    "zapata_corrida": ("IfcFootingType", "STRIP_FOOTING", None),
    "contratrabe": ("IfcFootingType", "FOOTING_BEAM", None),
    "columna": ("IfcColumnType", "COLUMN", None),
    "castillo": ("IfcColumnType", "USERDEFINED", "CASTILLO"),
    "trabe": ("IfcBeamType", "BEAM", None),
    "cerramiento": ("IfcBeamType", "USERDEFINED", "CERRAMIENTO"),
    "dala": ("IfcBeamType", "USERDEFINED", "DALA_DESPLANTE"),
}

# Tabla única de varillas: diámetro en mm y peso en kg/m.
VARILLAS: dict[str, dict[str, float]] = {
    "#2": {"diametro_mm": 6.35, "peso_kg_m": 0.249},
    "#3": {"diametro_mm": 9.53, "peso_kg_m": 0.560},
    "#4": {"diametro_mm": 12.70, "peso_kg_m": 0.994},
    "#5": {"diametro_mm": 15.88, "peso_kg_m": 1.552},
    "#6": {"diametro_mm": 19.05, "peso_kg_m": 2.235},
    "#8": {"diametro_mm": 25.40, "peso_kg_m": 3.973},
}

# Peso de la malla armex en kg/m.
ARMEX: dict[str, float] = {
    "15x15-4": 1.82,
    "12x20-4": 1.82,
    "15x20-4": 1.95,
    "15x30-4": 2.25,
}

# Tipos semilla: (nombre, alias, sección, armado).
TIPOS_ESTRUCTURA: tuple[
    tuple[str, str, dict[str, float], dict[str, Any]], ...
] = (
    (
        "Z-1 Zapata 1.20×1.20",
        "zapata",
        {"Largo": 1.20, "Ancho": 1.20, "Peralte": 0.25, "DadoB": 0.40, "DadoH": 0.40,
         "DadoAlto": 0.60, "Plantilla": 0.05},
        {"ParrillaVarilla": "#4", "ParrillaSepX": 0.20, "ParrillaSepY": 0.20,
         "Recubrimiento": 0.05},
    ),
    (
        "ZC-1 Zapata corrida 60",
        "zapata_corrida",
        {"Ancho": 0.60, "Peralte": 0.20, "Corona": 0.0, "Plantilla": 0.05},
        {"LongCantidad": 3, "LongVarilla": "#3", "ParrillaVarilla": "#3",
         "ParrillaSepX": 0.20, "Recubrimiento": 0.05},
    ),
    (
        "CT-1 Contratrabe 20×40",
        "contratrabe",
        {"Forma": "rectangular", "B": 0.20, "H": 0.40, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#4", "EstVarilla": "#3",
         "EstSepExtremos": 0.15, "EstSepCentro": 0.15, "EstLongConfinamiento": 0.0},
    ),
    (
        "C-1 Columna 30×30",
        "columna",
        {"Forma": "rectangular", "B": 0.30, "H": 0.30, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#5", "EstVarilla": "#3",
         "EstSepExtremos": 0.10, "EstSepCentro": 0.20, "EstLongConfinamiento": 0.50},
    ),
    (
        "K-1 Castillo 15×15",
        "castillo",
        {"Forma": "rectangular", "B": 0.15, "H": 0.15, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#3", "EstVarilla": "#2",
         "EstSepExtremos": 0.20, "EstSepCentro": 0.20, "EstLongConfinamiento": 0.0},
    ),
    (
        "K-2 Castillo armex 15×15",
        "castillo",
        {"Forma": "rectangular", "B": 0.15, "H": 0.15, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#3", "EstVarilla": "#2",
         "EstSepExtremos": 0.20, "EstSepCentro": 0.20, "EstLongConfinamiento": 0.0,
         "Armex": "15x15-4"},
    ),
    (
        "T-1 Trabe 20×40",
        "trabe",
        {"Forma": "rectangular", "B": 0.20, "H": 0.40, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#4", "EstVarilla": "#3",
         "EstSepExtremos": 0.10, "EstSepCentro": 0.20, "EstLongConfinamiento": 0.80},
    ),
    (
        "CE-1 Cerramiento 15×20",
        "cerramiento",
        {"Forma": "rectangular", "B": 0.15, "H": 0.20, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#3", "EstVarilla": "#2",
         "EstSepExtremos": 0.20, "EstSepCentro": 0.20, "EstLongConfinamiento": 0.0},
    ),
    (
        "DD-1 Dala de desplante 15×20",
        "dala",
        {"Forma": "rectangular", "B": 0.15, "H": 0.20, "D": 0.0},
        {"LongCantidad": 4, "LongVarilla": "#3", "EstVarilla": "#2",
         "EstSepExtremos": 0.20, "EstSepCentro": 0.20, "EstLongConfinamiento": 0.0},
    ),
)

CAMPOS_SECCION = {
    "columna": ("Forma", "B", "H", "D"),
    "castillo": ("Forma", "B", "H", "D"),
    "trabe": ("Forma", "B", "H", "D"),
    "cerramiento": ("Forma", "B", "H", "D"),
    "dala": ("Forma", "B", "H", "D"),
    "contratrabe": ("Forma", "B", "H", "D"),
    "zapata": ("Largo", "Ancho", "Peralte", "DadoB", "DadoH", "DadoAlto", "Plantilla"),
    "zapata_corrida": ("Ancho", "Peralte", "Corona", "Plantilla"),
}

CAMPOS_ARMADO = (
    "LongCantidad", "LongVarilla", "EstVarilla", "EstSepExtremos", "EstSepCentro",
    "EstLongConfinamiento", "ParrillaVarilla", "ParrillaSepX", "ParrillaSepY",
    "Recubrimiento", "Armex",
)

ENTEROS_ESTRUCTURA = ("LongCantidad",)


def _gid(entidad: Any) -> str:
    return str(getattr(entidad, "GlobalId", "") or "")


def _nombre(entidad: Any) -> str:
    return str(getattr(entidad, "Name", "") or "")


def _normalizar_funcion(funcion: Any, categoria_material: str = "") -> str:
    texto = _texto(funcion).strip().casefold()
    if texto in FUNCIONES:
        return texto
    if texto in ("nucleo", "core"):
        return CORE
    categoria = _texto(categoria_material).strip().casefold()
    if categoria in (CORE, "nucleo", "concreto"):
        return CORE
    if categoria in ("aislante", "membrana"):
        return categoria
    return "acabado"


class BibliotecaMixin:
    """Materiales, tipos de muro multicapa e instancias (O007a)."""

    # ------------------------------------------------------------ materiales
    def _leer_material_pset(self, material: Any) -> dict[str, Any]:
        for propiedades in getattr(material, "HasProperties", ()) or ():
            if getattr(propiedades, "Name", "") != "OPENRVT_Material":
                continue
            salida: dict[str, Any] = {}
            for prop in getattr(propiedades, "Properties", ()) or ():
                valor = getattr(prop, "NominalValue", None)
                if valor is not None:
                    salida[_texto(getattr(prop, "Name", ""))] = getattr(
                        valor, "wrappedValue", None
                    )
            return salida
        return {}

    def _guardar_material_pset(self, material: Any, valores: dict[str, Any]) -> None:
        propiedades = next(
            (
                p
                for p in (getattr(material, "HasProperties", ()) or ())
                if getattr(p, "Name", "") == "OPENRVT_Material"
            ),
            None,
        )
        if propiedades is None:
            propiedades = self.modelo.create_entity(
                "IfcMaterialProperties",
                Name="OPENRVT_Material",
                Description="Datos de OPEN-RVT",
                Properties=[],
                Material=material,
            )
        existentes = {
            _texto(getattr(p, "Name", "")): p
            for p in (getattr(propiedades, "Properties", ()) or ())
        }
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
            propiedades.Properties = list(getattr(propiedades, "Properties", ()) or ()) + [
                nueva
            ]
            existentes[clave] = nueva

    def _material_entidad(self, nombre: str) -> Any | None:
        buscado = _texto(nombre).strip().casefold()
        for material in self.modelo.by_type("IfcMaterial"):
            if _texto(material.Name).strip().casefold() == buscado:
                return material
        return None

    def _material_datos(self, material: Any) -> dict[str, Any]:
        datos = self._leer_material_pset(material)
        return {
            "id": _texto(material.Name),
            "nombre": _texto(material.Name),
            "categoria": _texto(datos.get("Categoria") or getattr(material, "Category", "")),
            "color": _texto(datos.get("Color") or "#cccccc"),
            "rayado": _texto(datos.get("Rayado") or "ninguno"),
            "unidad": _texto(datos.get("Unidad") or "m²"),
            "espesor_tipico": float(datos.get("EspesorTipico") or 0.0),
        }

    def _crear_material(
        self,
        nombre: str,
        categoria: str = "acabado",
        espesor_tipico: float = 0.0,
        color: str = "#cccccc",
        rayado: str = "ninguno",
        unidad: str = "m²",
    ) -> Any:
        modelo = self.modelo
        material = material_api.add_material(modelo, name=nombre, category=categoria)
        if hasattr(material, "Category"):
            material.Category = categoria
        self._guardar_material_pset(
            material,
            {
                "Categoria": categoria,
                "Color": color,
                "Rayado": rayado,
                "Unidad": unidad,
                "EspesorTipico": float(espesor_tipico),
            },
        )
        return material

    def _material_por_nombre(self, nombre: str, crear: bool = True) -> Any:
        material = self._material_entidad(nombre)
        if material is not None:
            return material
        if not crear:
            raise self._error(f"No existe el material «{nombre}».", -32030)
        semilla = next((s for s in MATERIALES_SEMILLA if s[0] == nombre), None)
        if semilla is not None:
            return self._crear_material(*semilla)
        return self._crear_material(nombre)

    def _crear_materiales_semilla(self) -> list[Any]:
        creados = []
        for datos in MATERIALES_SEMILLA:
            if self._material_entidad(datos[0]) is None:
                creados.append(self._crear_material(*datos))
        return creados

    def _asegurar_biblioteca(self) -> None:
        """Siembra la biblioteca en archivos abiertos que no la tengan."""
        if self.modelo is None:
            return
        con_pset = [
            m for m in self.modelo.by_type("IfcMaterial") if self._leer_material_pset(m)
        ]
        if not con_pset:
            self._crear_materiales_semilla()

    def materiales_listar(self) -> list[dict[str, Any]]:
        self._exigir_modelo()
        salida = [self._material_datos(m) for m in self.modelo.by_type("IfcMaterial")]
        salida.sort(key=lambda d: (d["categoria"], d["nombre"]))
        return salida

    def material_crear(self, nombre: str, campos: Any = None) -> dict[str, Any]:
        self._exigir_modelo()
        nombre = _texto(nombre).strip()
        if not nombre:
            raise self._error("El material necesita un nombre.", -32602)
        if self._material_entidad(nombre) is not None:
            raise self._error(f"Ya existe el material «{nombre}».", -32031)
        campos = dict(campos or {})
        self._instantanea()
        material = self._crear_material(
            nombre,
            _texto(campos.get("categoria") or campos.get("Categoria") or "acabado"),
            float(campos.get("espesor_tipico", campos.get("EspesorTipico", 0.0)) or 0.0),
            _texto(campos.get("color") or campos.get("Color") or "#cccccc"),
            _texto(campos.get("rayado") or campos.get("Rayado") or "ninguno"),
            _texto(campos.get("unidad") or campos.get("Unidad") or "m²"),
        )
        self.con_cambios = True
        return {
            "creados": [_gid(material)],
            "modificados": [],
            "borrados": [],
            "mensaje": f"Material «{nombre}» creado.",
            "material": self._material_datos(material),
        }

    def material_editar(self, nombre: str, campos: Any = None) -> dict[str, Any]:
        self._exigir_modelo()
        material = self._material_entidad(nombre)
        if material is None:
            raise self._error(f"No existe el material «{nombre}».", -32030)
        campos = dict(campos or {})
        self._instantanea()
        nuevo = _texto(campos.get("nombre") or campos.get("Nombre") or "").strip()
        if nuevo and nuevo.casefold() != _texto(material.Name).casefold():
            if self._material_entidad(nuevo) is not None:
                raise self._error(f"Ya existe el material «{nuevo}».", -32031)
            material.Name = nuevo
        datos = self._material_datos(material)
        categoria = _texto(campos.get("categoria", campos.get("Categoria", datos["categoria"])))
        color = _texto(campos.get("color", campos.get("Color", datos["color"])))
        rayado = _texto(campos.get("rayado", campos.get("Rayado", datos["rayado"])))
        unidad = _texto(campos.get("unidad", campos.get("Unidad", datos["unidad"])))
        espesor = float(
            campos.get("espesor_tipico", campos.get("EspesorTipico", datos["espesor_tipico"]))
            or 0.0
        )
        if hasattr(material, "Category"):
            material.Category = categoria
        self._guardar_material_pset(
            material,
            {
                "Categoria": categoria,
                "Color": color,
                "Rayado": rayado,
                "Unidad": unidad,
                "EspesorTipico": espesor,
            },
        )
        self.con_cambios = True
        return {
            "creados": [],
            "modificados": [_gid(material)],
            "borrados": [],
            "mensaje": f"Material «{_texto(material.Name)}» actualizado.",
            "material": self._material_datos(material),
        }

    def _usos_material(self, material: Any) -> list[str]:
        usos: list[str] = []
        for capa in self.modelo.by_type("IfcMaterialLayer"):
            if getattr(capa, "Material", None) == material:
                capa_set = next(
                    (
                        s
                        for s in self.modelo.by_type("IfcMaterialLayerSet")
                        if capa in (getattr(s, "MaterialLayers", ()) or ())
                    ),
                    None,
                )
                nombre = _texto(getattr(capa_set, "LayerSetName", "")) or "un tipo"
                if nombre not in usos:
                    usos.append(nombre)
        return usos

    def material_borrar(self, nombre: str) -> dict[str, Any]:
        self._exigir_modelo()
        material = self._material_entidad(nombre)
        if material is None:
            raise self._error(f"No existe el material «{nombre}».", -32030)
        usos = self._usos_material(material)
        if usos:
            raise self._error(
                f"No se puede borrar el material «{nombre}»: lo usa {', '.join(usos)}.",
                -32032,
            )
        self._instantanea()
        self.modelo.remove(material)
        self.con_cambios = True
        return {
            "creados": [],
            "modificados": [],
            "borrados": [nombre],
            "mensaje": f"Material «{nombre}» borrado.",
        }

    # ------------------------------------------------------------ capas
    def _material_set_de(self, tipo: Any) -> Any | None:
        import ifcopenshell.util.element as util_elemento

        try:
            material = util_elemento.get_material(tipo)
        except Exception:
            material = None
        if material is not None and material.is_a("IfcMaterialLayerSet"):
            return material
        for rel in getattr(tipo, "HasAssociations", ()) or ():
            if rel.is_a("IfcRelAssociatesMaterial"):
                material = getattr(rel, "RelatingMaterial", None)
                if material is not None and material.is_a("IfcMaterialLayerSet"):
                    return material
        return None

    def _funcion_de_capa(self, capa: Any, material: Any, total: int) -> str:
        categoria = _texto(getattr(capa, "Category", ""))
        if categoria.strip().casefold() in FUNCIONES:
            return _normalizar_funcion(categoria)
        datos = self._material_datos(material) if material is not None else {}
        if total == 1:
            return CORE
        return _normalizar_funcion("", datos.get("categoria", ""))

    def capas_de_tipo(self, tipo: Any) -> list[dict[str, Any]]:
        capa_set = self._material_set_de(tipo)
        if capa_set is None:
            return []
        capas_crudas = list(getattr(capa_set, "MaterialLayers", ()) or ())
        salida: list[dict[str, Any]] = []
        for capa in capas_crudas:
            material = getattr(capa, "Material", None)
            datos = self._material_datos(material) if material is not None else {}
            salida.append(
                {
                    "funcion": self._funcion_de_capa(capa, material, len(capas_crudas)),
                    "material": _texto(datos.get("nombre")),
                    "espesor": float(getattr(capa, "LayerThickness", 0.0) or 0.0),
                    "color": _texto(datos.get("color") or "#cccccc"),
                    "rayado": _texto(datos.get("rayado") or "ninguno"),
                    "categoria": _texto(datos.get("categoria")),
                }
            )
        return salida

    def _normalizar_capas(self, capas: Any) -> list[dict[str, Any]]:
        if not isinstance(capas, (list, tuple)):
            raise self._error("Las capas deben ser una lista.", -32602)
        salida: list[dict[str, Any]] = []
        for entrada in capas:
            if not isinstance(entrada, dict):
                raise self._error("Cada capa debe ser un objeto.", -32602)
            material = _texto(
                entrada.get("material", entrada.get("Material", entrada.get("nombre", "")))
            ).strip()
            if not material:
                raise self._error("Cada capa necesita un material.", -32602)
            try:
                espesor = float(
                    entrada.get(
                        "espesor", entrada.get("Espesor", entrada.get("LayerThickness", 0.0))
                    )
                )
            except (TypeError, ValueError) as exc:
                raise self._error("El espesor de la capa no es un número.", -32602) from exc
            if espesor <= 0:
                raise self._error(
                    f"El espesor de la capa «{material}» debe ser positivo.", -32602
                )
            funcion = _normalizar_funcion(
                entrada.get("funcion", entrada.get("Funcion", entrada.get("Category", "")))
            )
            salida.append({"material": material, "espesor": espesor, "funcion": funcion})
        self._validar_capas(salida)
        return salida

    def _validar_capas(self, capas: list[dict[str, Any]]) -> None:
        posiciones = [i for i, c in enumerate(capas) if c["funcion"] == CORE]
        if not posiciones:
            raise self._error(
                "El tipo de muro necesita al menos una capa de función núcleo.", -32033
            )
        grupos = 1 + sum(1 for a, b in zip(posiciones, posiciones[1:]) if b != a + 1)
        if grupos > 1:
            raise self._error(
                "El tipo de muro no puede tener dos núcleos separados; las capas de "
                "núcleo deben ser contiguas.",
                -32034,
            )

    def _crear_capa_set(self, nombre: str, capas: list[dict[str, Any]]) -> Any:
        modelo = self.modelo
        capa_set = material_api.add_material_set(
            modelo, name=nombre, set_type="IfcMaterialLayerSet"
        )
        capa_set.LayerSetName = nombre
        for datos in capas:
            material = self._material_por_nombre(datos["material"])
            capa = material_api.add_layer(
                modelo, layer_set=capa_set, material=material, name=datos["material"]
            )
            material_api.edit_layer(
                modelo,
                layer=capa,
                attributes={
                    "LayerThickness": float(datos["espesor"]),
                    "Category": datos["funcion"],
                    "IsVentilated": False,
                },
            )
            capa.Category = datos["funcion"]
        return capa_set

    def _quitar_material_set(self, tipo: Any) -> None:
        capa_set = self._material_set_de(tipo)
        if capa_set is None:
            return
        capas = list(getattr(capa_set, "MaterialLayers", ()) or ())
        for rel in list(getattr(tipo, "HasAssociations", ()) or ()):
            if rel.is_a("IfcRelAssociatesMaterial"):
                try:
                    self.modelo.remove(rel)
                except Exception:
                    pass
        for capa in capas:
            try:
                self.modelo.remove(capa)
            except Exception:
                pass
        try:
            self.modelo.remove(capa_set)
        except Exception:
            pass

    def _total_capas(self, capas: Iterable[dict[str, Any]]) -> float:
        return round(sum(float(c["espesor"]) for c in capas), 9)

    @staticmethod
    def _mismas_capas(
        anteriores: Iterable[dict[str, Any]], nuevas: Iterable[dict[str, Any]]
    ) -> bool:
        a = list(anteriores)
        b = list(nuevas)
        if len(a) != len(b):
            return False
        for capa_a, capa_b in zip(a, b):
            if (
                _texto(capa_a.get("material")) != _texto(capa_b.get("material"))
                or _texto(capa_a.get("funcion")) != _texto(capa_b.get("funcion"))
                or abs(float(capa_a.get("espesor") or 0.0)
                       - float(capa_b.get("espesor") or 0.0)) > 1e-9
            ):
                return False
        return True

    def _linea_tipo(self, tipo: Any) -> str:
        if tipo is None:
            return "eje_nucleo"
        datos = self._leer_pset(tipo, "OPENRVT_TipoMuro")
        linea = _texto(datos.get("LineaUbicacion") or "eje_nucleo")
        return linea if linea in LINEAS_UBICACION else "eje_nucleo"

    def capas_con_posicion(self, muro: Any, espesor: float) -> list[dict[str, Any]]:
        """Capas con su centro respecto al eje del muro (local +Y = exterior)."""
        tipo = self._tipo_entidad(muro)
        capas = self.capas_de_tipo(tipo) if tipo is not None else []
        if not capas:
            return []
        inicio = self._desfase_de_muro(muro, espesor)
        borde_exterior = inicio + espesor
        salida = []
        for capa in capas:
            centro = borde_exterior - float(capa["espesor"]) / 2.0
            salida.append({**capa, "centro": centro, "nucleo": capa["funcion"] == CORE})
            borde_exterior -= float(capa["espesor"])
        return salida

    def _offset_de_linea(self, tipo: Any, espesor: float, linea: str) -> float:
        """Inicio del cuerpo en el eje local Y para una línea de ubicación.

        El eje local +Y es el lado exterior del muro. El valor devuelto es la
        coordenada local del paño interior (borde de menor Y) del cuerpo.
        """
        if linea == "cara_exterior":
            return -espesor
        if linea == "cara_interior":
            return 0.0
        if linea == "centro":
            return -espesor / 2.0
        if linea != "eje_nucleo":
            return -espesor / 2.0
        capas = self.capas_de_tipo(tipo) if tipo is not None else []
        if not capas:
            return -espesor / 2.0
        desde_exterior = 0.0
        centro_nucleo = None
        for capa in capas:
            if capa["funcion"] == CORE:
                centro_nucleo = desde_exterior + float(capa["espesor"]) / 2.0
                break
            desde_exterior += float(capa["espesor"])
        if centro_nucleo is None:
            return -espesor / 2.0
        # Eje del núcleo en 0: la cara exterior queda en +centro_nucleo.
        return centro_nucleo - espesor

    def _linea_de_muro(self, muro: Any, datos: dict[str, Any] | None = None) -> str:
        """O032: línea de ubicación del ejemplar, con compatibilidad con O003b."""
        datos = datos if datos is not None else self._leer_pset(muro, "OPENRVT_Muro")
        linea = _texto(datos.get("LineaUbicacion") or "")
        if linea in LINEAS_UBICACION:
            return linea
        alineacion = _texto(datos.get("Alineacion") or "centro")
        # La alineación propia de la instancia manda si el usuario la eligió; «centro»
        # deja que el tipo decida con su línea de ubicación.
        if alineacion == "exterior":
            return "cara_exterior"
        if alineacion == "interior":
            return "cara_interior"
        return self._linea_tipo(self._tipo_entidad(muro))

    def _desfase_de_muro(self, muro: Any, espesor: float) -> float:
        """Inicio del cuerpo en el eje local Y, fijando la línea de ubicación."""
        datos = self._leer_pset(muro, "OPENRVT_Muro")
        linea = self._linea_de_muro(muro, datos)
        offset = self._offset_de_linea(self._tipo_entidad(muro), espesor, linea)
        volteado = datos.get("Volteado") in (True, "True", "true", 1, "1")
        if volteado:
            # Voltear refleja el cuerpo respecto a la línea de ubicación.
            offset = -offset - espesor
        try:
            desfase = float(datos.get("DesfaseUbicacion") or 0.0)
        except (TypeError, ValueError):
            desfase = 0.0
        # Positivo hacia el exterior (+Y, o −Y si el muro está volteado).
        return offset if not desfase else offset + (-desfase if volteado else desfase)

    # ------------------------------------------------------------ tipos
    def _tipo_por_gid(self, globalid: str) -> Any:
        for tipo in self.modelo.by_type("IfcTypeObject"):
            if _gid(tipo) == globalid:
                return tipo
        raise self._error(f"No existe el tipo {globalid}.", -32035)

    def _clase_tipo(self, clase: str) -> str:
        texto = _texto(clase).strip()
        if not texto:
            return "IfcWallType"
        alias = {
            "muro": "IfcWallType",
            "muros": "IfcWallType",
            "wall": "IfcWallType",
            "IfcWallType": "IfcWallType",
        }
        if texto in alias:
            return alias[texto]
        estructura = ALIAS_ESTRUCTURA.get(texto)
        if estructura is not None:
            return estructura[0]
        if not texto.startswith("Ifc"):
            texto = "Ifc" + texto[0].upper() + texto[1:]
        return texto

    def _alias_estructura(self, clase_o_alias: str) -> str | None:
        texto = _texto(clase_o_alias).strip()
        if texto in ALIAS_ESTRUCTURA:
            return texto
        return None

    @staticmethod
    def _es_clase_estructura(clase: str) -> bool:
        return clase in (
            "IfcFooting", "IfcColumn", "IfcBeam",
            "IfcFootingType", "IfcColumnType", "IfcBeamType",
        )

    def _estructura_de_tipo(self, tipo: Any) -> str | None:
        """Alias de estructura del tipo, deducido del PredefinedType/ElementType."""
        if tipo is None:
            return None
        clase = tipo.is_a()
        if clase in ("IfcFooting", "IfcFootingType"):
            predef = _texto(getattr(tipo, "PredefinedType", ""))
            return {
                "STRIP_FOOTING": "zapata_corrida",
                "FOOTING_BEAM": "contratrabe",
            }.get(predef, "zapata")
        if clase in ("IfcColumn", "IfcColumnType"):
            if _texto(getattr(tipo, "PredefinedType", "")) == "USERDEFINED":
                elemento = _texto(
                    getattr(tipo, "ElementType", "")
                    if clase.endswith("Type") else getattr(tipo, "ObjectType", "")
                )
                return "castillo" if elemento == "CASTILLO" else "columna"
            return "columna"
        if clase in ("IfcBeam", "IfcBeamType"):
            if _texto(getattr(tipo, "PredefinedType", "")) == "USERDEFINED":
                elemento = _texto(
                    getattr(tipo, "ElementType", "")
                    if clase.endswith("Type") else getattr(tipo, "ObjectType", "")
                )
                if elemento == "CERRAMIENTO":
                    return "cerramiento"
                if elemento == "DALA_DESPLANTE":
                    return "dala"
            return "trabe"
        return None

    @staticmethod
    def _defaults_seccion(alias: str) -> dict[str, Any]:
        if alias == "zapata":
            return {
                "Largo": 1.20, "Ancho": 1.20, "Peralte": 0.25,
                "DadoB": 0.0, "DadoH": 0.0, "DadoAlto": 0.0, "Plantilla": 0.05,
            }
        if alias == "zapata_corrida":
            return {"Ancho": 0.60, "Peralte": 0.20, "Corona": 0.0, "Plantilla": 0.05}
        return {"Forma": "rectangular", "B": 0.30 if alias == "columna" else 0.15,
                "H": 0.30 if alias == "columna" else 0.20, "D": 0.0}

    @staticmethod
    def _defaults_armado(alias: str) -> dict[str, Any]:
        recubrimiento = 0.05 if alias in ("zapata", "zapata_corrida") else 0.025
        if alias == "zapata":
            return {
                "ParrillaVarilla": "#4", "ParrillaSepX": 0.20, "ParrillaSepY": 0.20,
                "Recubrimiento": recubrimiento, "Armex": "",
            }
        if alias == "zapata_corrida":
            return {
                "LongCantidad": 3, "LongVarilla": "#3", "ParrillaVarilla": "#3",
                "ParrillaSepX": 0.20, "Recubrimiento": recubrimiento, "Armex": "",
            }
        return {
            "LongCantidad": 4, "LongVarilla": "#3", "EstVarilla": "#2",
            "EstSepExtremos": 0.20, "EstSepCentro": 0.20,
            "EstLongConfinamiento": 0.0, "Recubrimiento": recubrimiento, "Armex": "",
        }

    def _normalizar_seccion(self, alias: str, seccion: Any) -> dict[str, Any]:
        if seccion is not None and not isinstance(seccion, dict):
            raise self._error("La sección debe ser un objeto.", -32602)
        datos = self._defaults_seccion(alias)
        for clave, valor in dict(seccion or {}).items():
            if clave not in datos:
                continue
            if clave == "Forma":
                forma = _texto(valor).strip()
                if forma not in ("rectangular", "circular"):
                    raise self._error("La forma de la sección debe ser rectangular o circular.", -32602)
                datos[clave] = forma
                continue
            try:
                datos[clave] = float(valor)
            except (TypeError, ValueError) as exc:
                raise self._error(f"El campo de sección «{clave}» no es un número.", -32602) from exc
        if alias == "columna" and datos.get("Forma") == "circular":
            if float(datos.get("D") or 0.0) <= 0:
                raise self._error("La columna circular necesita un diámetro mayor que cero.", -32602)
        elif alias == "zapata":
            if float(datos["Largo"]) <= 0 or float(datos["Ancho"]) <= 0 or float(datos["Peralte"]) <= 0:
                raise self._error("La zapata necesita largo, ancho y peralte positivos.", -32602)
        elif alias == "zapata_corrida":
            if float(datos["Ancho"]) <= 0 or float(datos["Peralte"]) <= 0:
                raise self._error("La zapata corrida necesita ancho y peralte positivos.", -32602)
        else:
            if float(datos.get("B") or 0.0) <= 0 or float(datos.get("H") or 0.0) <= 0:
                raise self._error("La sección necesita ancho y peralte positivos.", -32602)
        return datos

    def _normalizar_armado(self, alias: str, armado: Any) -> dict[str, Any]:
        if armado is not None and not isinstance(armado, dict):
            raise self._error("El armado debe ser un objeto.", -32602)
        datos = self._defaults_armado(alias)
        for clave, valor in dict(armado or {}).items():
            if clave not in CAMPOS_ARMADO:
                continue
            if clave in ("LongVarilla", "EstVarilla", "ParrillaVarilla"):
                texto = _texto(valor).strip()
                if texto and texto not in VARILLAS:
                    raise self._error(f"La varilla «{texto}» no existe.", -32602)
                datos[clave] = texto
            elif clave == "Armex":
                datos[clave] = _texto(valor).strip()
            elif clave == "LongCantidad":
                try:
                    datos[clave] = int(valor)
                except (TypeError, ValueError) as exc:
                    raise self._error("La cantidad de varillas debe ser entera.", -32602) from exc
                if datos[clave] < 0:
                    raise self._error("La cantidad de varillas no puede ser negativa.", -32602)
            else:
                try:
                    datos[clave] = float(valor)
                except (TypeError, ValueError) as exc:
                    raise self._error(f"El campo de armado «{clave}» no es un número.", -32602) from exc
        if datos.get("Armex") and datos["Armex"] not in ARMEX:
            raise self._error(f"El armex «{datos['Armex']}» no existe.", -32602)
        return datos

    def _seccion_y_armado(self, tipo: Any) -> tuple[str | None, dict[str, Any], dict[str, Any]]:
        alias = self._estructura_de_tipo(tipo)
        if alias is None:
            return None, {}, {}
        seccion = {**self._defaults_seccion(alias), **self._leer_pset(tipo, "OPENRVT_Seccion")}
        armado = {**self._defaults_armado(alias), **self._leer_pset(tipo, "OPENRVT_Armado")}
        return alias, seccion, armado

    def _perfil_de_seccion(self, alias: str, seccion: dict[str, Any]) -> Any | None:
        """IfcProfileDef estándar para columnas, castillos, trabes, dalas y contratrabes."""
        if alias in ("zapata", "zapata_corrida"):
            return None
        forma = _texto(seccion.get("Forma") or "rectangular")
        modelo = self.modelo
        if forma == "circular":
            perfil = modelo.create_entity("IfcCircleProfileDef", ProfileType="AREA")
            perfil.Radius = float(seccion.get("D") or 0.3) / 2.0
            perfil.ProfileName = f"Ø{float(seccion.get('D') or 0.3):.2f}"
            return perfil
        perfil = modelo.create_entity("IfcRectangleProfileDef", ProfileType="AREA")
        perfil.XDim = float(seccion.get("B") or 0.15)
        perfil.YDim = float(seccion.get("H") or 0.2)
        perfil.ProfileName = f"{perfil.XDim:.2f}×{perfil.YDim:.2f}"
        return perfil

    def _quitar_perfil_de_tipo(self, tipo: Any) -> None:
        perfiles: list[Any] = []
        for material in getattr(tipo, "HasAssociations", ()) or ():
            if not material.is_a("IfcRelAssociatesMaterial"):
                continue
            asociado = getattr(material, "RelatingMaterial", None)
            if asociado is not None and asociado.is_a("IfcMaterialProfileSet"):
                for item in getattr(asociado, "MaterialProfiles", ()) or ():
                    perfil = getattr(item, "Profile", None)
                    if perfil is not None:
                        perfiles.append(perfil)
                try:
                    self.modelo.remove(material)
                except Exception:
                    pass
                try:
                    self.modelo.remove(asociado)
                except Exception:
                    pass
        for perfil in perfiles:
            try:
                self.modelo.remove(perfil)
            except Exception:
                pass

    def _aplicar_perfil_de_tipo(self, tipo: Any, alias: str, seccion: dict[str, Any]) -> None:
        material = self._material_por_nombre("Concreto armado")
        if alias in ("zapata", "zapata_corrida"):
            try:
                material_api.unassign_material(self.modelo, products=[tipo])
            except Exception:
                pass
            material_api.assign_material(self.modelo, products=[tipo], material=material)
            return
        self._quitar_perfil_de_tipo(tipo)
        perfil = self._perfil_de_seccion(alias, seccion)
        if perfil is None:
            return
        conjunto = material_api.add_material_set(
            self.modelo, name=_nombre(tipo), set_type="IfcMaterialProfileSet"
        )
        if hasattr(conjunto, "ProfileSetName"):
            conjunto.ProfileSetName = _nombre(tipo)
        material_api.add_profile(
            self.modelo, profile_set=conjunto, material=material, profile=perfil
        )
        material_api.assign_material(self.modelo, products=[tipo], material=conjunto)

    def _crear_tipo_estructura(
        self,
        alias: str,
        nombre: str,
        seccion: Any = None,
        armado: Any = None,
    ) -> Any:
        clase, predefinido, elemento = ALIAS_ESTRUCTURA[alias]
        tipo = root.create_entity(self.modelo, ifc_class=clase, name=nombre)
        if hasattr(tipo, "PredefinedType"):
            tipo.PredefinedType = predefinido
        if elemento is not None:
            tipo.ElementType = elemento
        seccion_norm = self._normalizar_seccion(alias, seccion)
        armado_norm = self._normalizar_armado(alias, armado)
        self._guardar_pset(tipo, "OPENRVT_Seccion", seccion_norm)
        self._guardar_pset(tipo, "OPENRVT_Armado", armado_norm)
        self._aplicar_perfil_de_tipo(tipo, alias, seccion_norm)
        self._guardar_partidas_omision(tipo)
        return tipo

    def crear_tipos_estructura(self) -> list[Any]:
        """Siembra los nueve tipos de estructura que falten por nombre."""
        self._materiales_o_semilla()
        creados = []
        for nombre, alias, seccion, armado in TIPOS_ESTRUCTURA:
            if not self._nombre_tipo_libre(ALIAS_ESTRUCTURA[alias][0], nombre):
                continue
            creados.append(self._crear_tipo_estructura(alias, nombre, seccion, armado))
        return creados

    def acero_varillas(self) -> dict[str, Any]:
        return {
            "varillas": VARILLAS,
            "armex": ARMEX,
        }

    def _nombre_tipo_libre(self, clase: str, nombre: str) -> bool:
        buscado = nombre.strip().casefold()
        return not any(
            _nombre(t).strip().casefold() == buscado
            for t in self.modelo.by_type(clase)
        )

    def _parametros_tipo(self, tipo: Any) -> dict[str, Any]:
        datos = self._leer_pset(tipo, "OPENRVT_TipoMuro")
        if not datos:
            datos = self._leer_pset(tipo, "OPENRVT_Tipo")
        return dict(datos)

    def _datos_tipo(self, tipo: Any) -> dict[str, Any]:
        capas = self.capas_de_tipo(tipo) if tipo.is_a("IfcWallType") else []
        parametros = self._parametros_tipo(tipo)
        if tipo.is_a("IfcWallType"):
            parametros["Espesor"] = round(
                sum(float(c["espesor"]) for c in capas), 9
            ) if capas else float(parametros.get("Espesor") or 0.0)
            parametros.setdefault("LineaUbicacion", "eje_nucleo")
        salida = {
            "globalid": _gid(tipo),
            "nombre": _nombre(tipo),
            "clase": tipo.is_a(),
            "parametros": parametros,
            "capas": capas,
            "instancias": len(self._instancias_de_tipo(tipo)),
            "partidas": self._partidas_de_tipo(tipo),
            "criterios": self._criterios_de_tipo(tipo),
        }
        alias, seccion, armado = self._seccion_y_armado(tipo)
        if alias is not None:
            salida["alias"] = alias
            salida["seccion"] = seccion
            salida["armado"] = armado
            salida["acero"] = self.acero_estimado_tipo(tipo)
        return salida

    def tipos_obtener(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        return self._datos_tipo(self._tipo_por_gid(globalid))

    def _instancias_de_tipo(self, tipo: Any) -> list[Any]:
        salida: list[Any] = []
        for rel in self.modelo.by_type("IfcRelDefinesByType"):
            if getattr(rel, "RelatingType", None) == tipo:
                salida.extend(getattr(rel, "RelatedObjects", ()) or ())
        return salida

    def crear_tipos_muro(self) -> list[Any]:
        """Crea los cinco tipos base con un solo núcleo."""
        self._materiales_o_semilla()
        existentes = {_nombre(t) for t in self.modelo.by_type("IfcWallType")}
        creados = []
        for nombre, material, espesor in TIPOS_BASE:
            if nombre in existentes:
                continue
            creados.append(
                self._crear_tipo_muro(
                    nombre,
                    espesor,
                    capas=[{"material": material, "espesor": espesor, "funcion": CORE}],
                )
            )
        return creados

    def crear_tipos_ejemplo(self) -> list[Any]:
        self._materiales_o_semilla()
        existentes = {_nombre(t) for t in self.modelo.by_type("IfcWallType")}
        creados = []
        for nombre, capas, linea in TIPOS_EJEMPLO:
            if nombre in existentes:
                continue
            creados.append(
                self._crear_tipo_muro(
                    nombre,
                    sum(c[2] for c in capas),
                    capas=[
                        {"material": material, "espesor": espesor, "funcion": funcion}
                        for material, funcion, espesor in capas
                    ],
                    linea=linea,
                )
            )
        return creados

    def _materiales_o_semilla(self) -> None:
        if self.modelo is None:
            return
        if not any(self.modelo.by_type("IfcMaterial")):
            self._crear_materiales_semilla()

    def _crear_tipo_muro(
        self,
        nombre: str,
        espesor: float,
        capas: Any = None,
        linea: str = "eje_nucleo",
    ) -> Any:
        modelo = self.modelo
        tipo = root.create_entity(modelo, ifc_class="IfcWallType", name=nombre)
        if hasattr(tipo, "PredefinedType"):
            tipo.PredefinedType = "SOLIDWALL"
        if capas is None:
            capas = [
                {
                    "material": next(
                        (m for n, m, _e in TIPOS_BASE if n == nombre), "Concreto armado"
                    ),
                    "espesor": float(espesor),
                    "funcion": CORE,
                }
            ]
        normalizadas = self._normalizar_capas(capas)
        capa_set = self._crear_capa_set(nombre, normalizadas)
        material_api.assign_material(
            modelo,
            products=[tipo],
            type="IfcMaterialLayerSet",
            material=capa_set,
        )
        self._guardar_pset(
            tipo,
            "OPENRVT_TipoMuro",
            {
                "Espesor": self._total_capas(normalizadas),
                "LineaUbicacion": linea if linea in LINEAS_UBICACION else "eje_nucleo",
            },
        )
        self._guardar_partidas_omision(tipo)
        return tipo

    def _asegurar_tipos_muro(self) -> None:
        self.crear_tipos_muro()

    def _tipo_muro(self, nombre: str) -> Any:
        self._asegurar_tipos_muro()
        buscado = _texto(nombre).strip().casefold()
        for tipo in self.modelo.by_type("IfcWallType"):
            if _nombre(tipo).casefold() == buscado:
                return tipo
        disponibles = ", ".join(_nombre(t) for t in self.modelo.by_type("IfcWallType"))
        raise self._error(
            f"No existe el tipo de muro «{nombre}». Disponibles: {disponibles}.", -32020
        )

    def _espesor_tipo(self, tipo: Any) -> float:
        if tipo is not None and tipo.is_a("IfcWallType"):
            capas = self.capas_de_tipo(tipo)
            if capas:
                return self._total_capas(capas)
        datos = self._leer_pset(tipo, "OPENRVT_TipoMuro") if tipo is not None else {}
        if datos.get("Espesor") is not None:
            return float(datos["Espesor"])
        return 0.15

    def tipos_listar(self, clase: str = "IfcWallType") -> list[dict[str, Any]]:
        self._exigir_modelo()
        clase = self._clase_tipo(clase)
        salida = []
        for tipo in self.modelo.by_type(clase):
            datos = {
                "globalid": _gid(tipo),
                "nombre": _nombre(tipo),
                "clase": tipo.is_a(),
                "instancias": len(self._instancias_de_tipo(tipo)),
            }
            if tipo.is_a("IfcWallType"):
                datos["espesor"] = self._espesor_tipo(tipo)
            alias, seccion, armado = self._seccion_y_armado(tipo)
            if alias is not None:
                datos["alias"] = alias
                datos["seccion"] = seccion
                datos["armado"] = armado
                datos["acero"] = self.acero_estimado_tipo(tipo)
            salida.append(datos)
        salida.sort(key=lambda d: d["nombre"])
        return salida

    def tipos_crear(self, clase: str, nombre: str, datos: Any = None) -> dict[str, Any]:
        self._exigir_modelo()
        alias_entrada = self._alias_estructura(clase)
        clase = self._clase_tipo(clase)
        nombre = _texto(nombre).strip()
        if not nombre:
            raise self._error("El tipo necesita un nombre.", -32602)
        if not self.modelo.schema:
            raise self._error("No hay modelo.", -32001)
        if not self._nombre_tipo_libre(clase, nombre):
            raise self._error(f"Ya existe el tipo «{nombre}» en {clase}.", -32036)
        datos = dict(datos or {})
        self._instantanea()
        if clase == "IfcWallType":
            capas = datos.get("capas")
            if capas is None:
                capas = [
                    {
                        "material": _texto(datos.get("material") or "Concreto armado"),
                        "espesor": float(datos.get("espesor", 0.15) or 0.15),
                        "funcion": CORE,
                    }
                ]
            parametros = dict(datos.get("parametros") or {})
            tipo = self._crear_tipo_muro(
                nombre,
                float(parametros.get("Espesor", 0.0) or 0.0),
                capas=capas,
                linea=_texto(
                    datos.get("linea_ubicacion")
                    or parametros.get("LineaUbicacion")
                    or "eje_nucleo"
                ),
            )
        elif alias_entrada is not None or self._es_clase_estructura(clase):
            alias = alias_entrada or {
                "IfcFooting": "zapata", "IfcColumn": "columna", "IfcBeam": "trabe",
            }.get(clase, "trabe")
            tipo = self._crear_tipo_estructura(
                alias, nombre, datos.get("seccion"), datos.get("armado")
            )
        else:
            if not hasattr(ifcopenshell, "file"):
                raise self._error("IfcOpenShell no disponible.", -32010)
            tipo = root.create_entity(self.modelo, ifc_class=clase, name=nombre)
            parametros = dict(datos.get("parametros") or {})
            if parametros:
                self._guardar_pset(tipo, "OPENRVT_Tipo", parametros)
            self._guardar_partidas_omision(tipo)
        self.con_cambios = True
        return self._resultado(
            creados=[tipo],
            mensaje=f"Tipo «{nombre}» creado.",
            tipo=self._datos_tipo(tipo),
        )

    def tipos_duplicar(self, globalid: str, nombre: str) -> dict[str, Any]:
        self._exigir_modelo()
        origen = self._tipo_por_gid(globalid)
        nombre = _texto(nombre).strip()
        if not nombre:
            raise self._error("El tipo duplicado necesita un nombre.", -32602)
        if not self._nombre_tipo_libre(origen.is_a(), nombre):
            raise self._error(f"Ya existe el tipo «{nombre}».", -32036)
        datos = self._datos_tipo(origen)
        self._instantanea()
        if origen.is_a("IfcWallType"):
            tipo = self._crear_tipo_muro(
                nombre,
                float(datos["parametros"].get("Espesor") or 0.0),
                capas=[
                    {
                        "material": c["material"],
                        "espesor": c["espesor"],
                        "funcion": c["funcion"],
                    }
                    for c in datos["capas"]
                ],
                linea=_texto(datos["parametros"].get("LineaUbicacion") or "eje_nucleo"),
            )
        elif datos.get("alias"):
            tipo = self._crear_tipo_estructura(
                datos["alias"], nombre, datos.get("seccion"), datos.get("armado")
            )
        else:
            tipo = root.create_entity(self.modelo, ifc_class=origen.is_a(), name=nombre)
            if datos["parametros"]:
                self._guardar_pset(tipo, "OPENRVT_Tipo", datos["parametros"])
        self.con_cambios = True
        return self._resultado(
            creados=[tipo],
            mensaje=f"Tipo «{_nombre(origen)}» duplicado como «{nombre}».",
            tipo=self._datos_tipo(tipo),
        )

    def tipos_editar(self, globalid: str, datos: Any = None) -> dict[str, Any]:
        self._exigir_modelo()
        tipo = self._tipo_por_gid(globalid)
        datos = dict(datos or {})
        self._instantanea()
        nombre = _texto(datos.get("nombre") or "").strip()
        if nombre and nombre.casefold() != _nombre(tipo).casefold():
            if not self._nombre_tipo_libre(tipo.is_a(), nombre):
                raise self._error(f"Ya existe el tipo «{nombre}».", -32036)
            tipo.Name = nombre
        parametros = dict(self._parametros_tipo(tipo))
        if isinstance(datos.get("parametros"), dict):
            parametros.update(datos["parametros"])
        if "partidas" in datos:
            # O009: las partidas se guardan en su pset; nunca regeneran geometría.
            partidas = self._normalizar_partidas(tipo, datos["partidas"])
            self._guardar_pset(
                tipo,
                "OPENRVT_Medicion",
                {"Partidas": json.dumps(partidas, ensure_ascii=False)},
            )
        if tipo.is_a("IfcWallType"):
            capas_previas = self.capas_de_tipo(tipo)
            if "capas" in datos:
                capas = self._normalizar_capas(datos["capas"])
            else:
                capas = capas_previas
                self._validar_capas(capas)
            linea = _texto(
                datos.get("linea_ubicacion")
                or parametros.get("LineaUbicacion")
                or self._linea_tipo(tipo)
            )
            if linea not in LINEAS_UBICACION:
                raise self._error(f"Línea de ubicación «{linea}» no válida.", -32602)
            cambio_geometria = (
                linea != self._linea_tipo(tipo)
                or not self._mismas_capas(capas_previas, capas)
            )
            if cambio_geometria and "capas" in datos:
                self._quitar_material_set(tipo)
                capa_set = self._crear_capa_set(_nombre(tipo), capas)
                material_api.assign_material(
                    self.modelo,
                    products=[tipo],
                    type="IfcMaterialLayerSet",
                    material=capa_set,
                )
            parametros["LineaUbicacion"] = linea
            parametros["Espesor"] = self._total_capas(capas)
            self._guardar_pset(tipo, "OPENRVT_TipoMuro", parametros)
            espesor = parametros["Espesor"]
            modificados: list[Any] = []
            if cambio_geometria:
                for instancia in self._instancias_de_tipo(tipo):
                    if instancia.is_a("IfcWall"):
                        info = self._datos_muro(instancia)
                        self._guardar_pset(
                            instancia,
                            "OPENRVT_Muro",
                            {
                                "Longitud": info["longitud"],
                                "Altura": info["altura"],
                                "Espesor": espesor,
                                "Alineacion": info["alineacion"],
                            },
                        )
                        self._regenerar_muro(instancia)
                        for vano in self._aberturas_del_muro(instancia):
                            relleno = self._relleno_de(vano[0])
                            if relleno is not None:
                                self._regenerar_relleno(relleno, vano[0])
                        modificados.append(instancia)
        elif self._es_clase_estructura(tipo.is_a()):
            alias = self._estructura_de_tipo(tipo) or "trabe"
            _, seccion_previa, armado_previo = self._seccion_y_armado(tipo)
            seccion = self._normalizar_seccion(
                alias, {**seccion_previa, **dict(datos.get("seccion") or {})}
            )
            armado = self._normalizar_armado(
                alias, {**armado_previo, **dict(datos.get("armado") or {})}
            )
            cambio_geometria = (
                seccion != seccion_previa or armado != armado_previo
            )
            self._guardar_pset(tipo, "OPENRVT_Seccion", seccion)
            self._guardar_pset(tipo, "OPENRVT_Armado", armado)
            if cambio_geometria:
                self._aplicar_perfil_de_tipo(tipo, alias, seccion)
            modificados = list(self._instancias_de_tipo(tipo)) if cambio_geometria else []
            for instancia in modificados:
                self._regenerar_estructura(instancia)
                self._recolocar_cerramiento_vertical(instancia)
            # O035: si cambia el peralte de la cimentación, los muros encima
            # vuelven a calcular su base.
            if cambio_geometria and alias in ("contratrabe", "zapata_corrida"):
                self._actualizar_muros_sobre_cimentacion()
        else:
            if parametros:
                self._guardar_pset(tipo, "OPENRVT_Tipo", parametros)
            modificados = []
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Tipo «{_nombre(tipo)}» actualizado.",
            tipo=self._datos_tipo(tipo),
        )

    def tipos_borrar(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        tipo = self._tipo_por_gid(globalid)
        instancias = self._instancias_de_tipo(tipo)
        if instancias:
            raise self._error(
                f"No se puede borrar el tipo «{_nombre(tipo)}»: tiene "
                f"{len(instancias)} instancia(s) en el modelo.",
                -32037,
            )
        self._instantanea()
        nombre = _nombre(tipo)
        self._quitar_material_set(tipo)
        for pset in list(getattr(tipo, "HasPropertySets", ()) or ()):
            try:
                self.modelo.remove(pset)
            except Exception:
                pass
        self.modelo.remove(tipo)
        self.con_cambios = True
        return self._resultado(
            borrados=[nombre],
            mensaje=f"Tipo «{nombre}» borrado.",
        )

    def tipos_instancias(self, globalid: str) -> list[dict[str, Any]]:
        self._exigir_modelo()
        tipo = self._tipo_por_gid(globalid)
        salida = []
        for instancia in self._instancias_de_tipo(tipo):
            salida.append(
                {
                    "globalid": _gid(instancia),
                    "nombre": _nombre(instancia),
                    "clase": instancia.is_a(),
                }
            )
        salida.sort(key=lambda d: (d["clase"], d["nombre"], d["globalid"]))
        return salida

    def elemento_cambiar_tipo(self, globalid: str, tipo: Any) -> dict[str, Any]:
        self._exigir_modelo()
        elemento = self._entidad_por_gid(globalid)
        if isinstance(tipo, str) and tipo.startswith("Ifc"):
            tipo_entidad = self._tipo_por_gid(tipo)
        else:
            texto = _texto(tipo).strip().casefold()
            tipo_entidad = next(
                (t for t in self.modelo.by_type("IfcTypeObject")
                 if _nombre(t).casefold() == texto),
                None,
            )
            if tipo_entidad is None:
                tipo_entidad = self._tipo_muro(_texto(tipo))
        if not elemento.is_a("IfcWall") and not elemento.is_a("IfcElement"):
            raise self._error("Este elemento no puede cambiar de tipo.", -32038)
        self._instantanea()
        type_api.assign_type(
            self.modelo, related_objects=[elemento], relating_type=tipo_entidad
        )
        modificados = [elemento]
        if elemento.is_a("IfcWall"):
            datos = self._datos_muro(elemento)
            espesor = self._espesor_tipo(tipo_entidad)
            # Reporte 2-nov: con castillos, al pasar de Block 12 a uno de 15 con
            # acabados el núcleo nuevo se metía en los castillos (seguían de 12) y
            # se perdían línea de ubicación, desfase y volteo. Mismo orden que la
            # edición del muro: pset completo → dependientes → cuerpo.
            self._guardar_pset(
                elemento,
                "OPENRVT_Muro",
                {
                    "Longitud": datos["longitud"],
                    "Altura": datos["altura"],
                    "Espesor": espesor,
                    "Alineacion": datos["alineacion"],
                    "LineaUbicacion": datos["linea_ubicacion"],
                    "DesfaseUbicacion": datos["desfase_ubicacion"],
                    "Volteado": bool(datos["volteado"]),
                },
            )
            modificados.extend(self._actualizar_dependientes_muro(elemento))
            self._regenerar_muro(elemento)
            for vano in self._aberturas_del_muro(elemento):
                relleno = self._relleno_de(vano[0])
                if relleno is not None:
                    self._regenerar_relleno(relleno, vano[0])
                    modificados.append(relleno)
        elif self._es_clase_estructura(elemento.is_a()) and self._leer_pset(
            elemento, "OPENRVT_Estructura"
        ):
            self._regenerar_estructura(elemento)
            self._recolocar_cerramiento_vertical(elemento)
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Tipo cambiado a «{_nombre(tipo_entidad)}».",
        )
