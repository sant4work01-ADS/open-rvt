"""Herramientas de modelado de O003b.

Todas las operaciones usan la API de IfcOpenShell. La clase es un *mixin* de
:class:`openrvt_nucleo.modelo.ModeloNucleo`: usa ``self.modelo``, ``self._instantanea``
y el resto de utilidades del núcleo O003a.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Iterable

import ifcopenshell
import ifcopenshell.api.aggregate as aggregate
import ifcopenshell.api.context as context_api
import ifcopenshell.api.feature as feature_api
import ifcopenshell.api.geometry as geometry_api
import ifcopenshell.api.grid as grid_api
import ifcopenshell.api.material as material_api
import ifcopenshell.api.root as root
import ifcopenshell.api.spatial as spatial_api
import ifcopenshell.api.type as type_api
import ifcopenshell.api.unit as unit_api
import numpy as np

LOG = logging.getLogger("openrvt_nucleo.modelado")

# Tipos de muro que crea un proyecto nuevo. El nombre es el que ve el usuario.
TIPOS_MURO = (
    ("Block 12", 0.12),
    ("Block 15", 0.15),
    ("Block 20", 0.20),
    ("Tabique", 0.14),
    ("Concreto", 0.15),
)

ALINEACIONES = ("centro", "interior", "exterior")

TOLERANCIA = 0.01  # unión automática de muros: ±1 cm
# O006e: un extremo a menos de 25 cm de la cara o del eje de otro muro se lleva al eje.
TOLERANCIA_UNION = 0.25
TOLERANCIA_CALCULO = 1e-6


def _gid(entidad: Any) -> str:
    return str(getattr(entidad, "GlobalId", "") or "")


def _nombre(entidad: Any) -> str:
    return str(getattr(entidad, "Name", "") or "")


def _etiqueta_eje(entidad: Any) -> str:
    return str(getattr(entidad, "AxisTag", "") or "")


def _redondear(valor: float) -> float:
    return round(float(valor), 6)


def _poligono_area(puntos: list[tuple[float, float]]) -> float:
    area = 0.0
    for i, (x1, y1) in enumerate(puntos):
        x2, y2 = puntos[(i + 1) % len(puntos)]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def _distancia_punto_segmento(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> tuple[float, float]:
    dx, dy = x2 - x1, y2 - y1
    largo2 = dx * dx + dy * dy
    if largo2 <= TOLERANCIA_CALCULO:
        return math.hypot(px - x1, py - y1), 0.0
    t = ((px - x1) * dx + (py - y1) * dy) / largo2
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)), t


class ModeladoMixin:
    """Métodos de modelado; se mezclan en ``ModeloNucleo``."""

    # ------------------------------------------------------------------ utilidades
    def _resultado(
        self,
        creados: Iterable[Any] | None = None,
        modificados: Iterable[Any] | None = None,
        borrados: Iterable[Any] | None = None,
        mensaje: str = "",
        **extra: Any,
    ) -> dict[str, Any]:
        salida: dict[str, Any] = {
            "creados": [_gid(e) if not isinstance(e, str) else e for e in (creados or [])],
            "modificados": [
                _gid(e) if not isinstance(e, str) else e for e in (modificados or [])
            ],
            "borrados": [_gid(e) if not isinstance(e, str) else e for e in (borrados or [])],
            "mensaje": mensaje,
        }
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
        candidatas = self.modelo.by_type(clases[0]) if clases else self.modelo.by_type("IfcRoot")
        for entidad in candidatas:
            if _gid(entidad) == globalid:
                return entidad
        raise self._error(f"No existe el elemento {globalid}.", -32005)

    @staticmethod
    def _error(mensaje: str, codigo: int = -32000) -> Exception:
        from .modelo import ErrorNucleo

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

    # ------------------------------------------------------------------ niveles
    def nivel_crear(self, nombre: str, elevacion: float) -> dict[str, Any]:
        self._exigir_modelo()
        nombre = (nombre or "").strip()
        if not nombre:
            raise self._error("El nivel necesita un nombre.", -32602)
        try:
            elevacion = float(elevacion)
        except (TypeError, ValueError) as exc:
            raise self._error("La elevación del nivel no es un número.", -32602) from exc
        self._instantanea()
        nivel = root.create_entity(self.modelo, ifc_class="IfcBuildingStorey", name=nombre)
        nivel.Elevation = elevacion
        aggregate.assign_object(self.modelo, products=[nivel], relating_object=self._edificio())
        self.con_cambios = True
        return self._resultado([nivel], mensaje=f"Nivel «{nombre}» creado.")

    def nivel_editar(
        self, globalid: str, nombre: str | None = None, elevacion: float | None = None
    ) -> dict[str, Any]:
        self._exigir_modelo()
        nivel = self._nivel_por_gid(globalid)
        if nombre is None and elevacion is None:
            raise self._error("No hay cambios para el nivel.", -32602)
        delta = 0.0
        if elevacion is not None:
            try:
                elevacion = float(elevacion)
            except (TypeError, ValueError) as exc:
                raise self._error("La elevación del nivel no es un número.", -32602) from exc
            delta = elevacion - float(nivel.Elevation or 0.0)
        self._instantanea()
        if nombre is not None:
            if not str(nombre).strip():
                raise self._error("El nivel necesita un nombre.", -32602)
            nivel.Name = str(nombre).strip()
        modificados: list[Any] = [nivel]
        if elevacion is not None:
            nivel.Elevation = elevacion
            # O006a: los elementos contenidos acompañan al nivel. En las muestras y en
            # las casas de O003b las colocaciones son independientes del storey, así que
            # se desplazan una sola vez (nunca se mueve también el ObjectPlacement del
            # nivel, que podría duplicar el movimiento).
            if abs(delta) > TOLERANCIA_CALCULO:
                modificados.extend(self._mover_elementos_nivel(nivel, delta))
        self.con_cambios = True
        return self._resultado(modificados=modificados, mensaje="Nivel actualizado.")

    def _mover_elementos_nivel(self, nivel: Any, dz: float) -> list[Any]:
        """Desplaza en Z los elementos del nivel y sus vanos (sin instantánea)."""
        productos: list[Any] = []
        vistos: set[int] = set()
        for elemento in self._elementos_de_nivel(nivel):
            for producto in self._productos_de(_gid(elemento)):
                if id(producto) not in vistos:
                    vistos.add(id(producto))
                    productos.append(producto)
        self._mover_productos(productos, 0.0, 0.0, dz)
        return [p for p in productos if not p.is_a("IfcOpeningElement")]

    def _mover_productos(self, productos: list[Any], dx: float, dy: float, dz: float) -> None:
        """Aplica una traslación en mundo a una lista de productos, sin deshacer."""
        matrices = {
            id(producto): self._matriz_traslado(producto, dx, dy, dz)
            for producto in productos
        }
        for producto in productos:
            geometry_api.edit_object_placement(
                self.modelo,
                product=producto,
                matrix=matrices[id(producto)],
                is_si=True,
                should_transform_children=False,
            )

    def niveles_separacion(
        self, inferior: str, superior: str, altura: float, cadena: bool = True
    ) -> dict[str, Any]:
        """O006a: fija la altura entre dos niveles y, en cadena, arrastra los de arriba."""
        self._exigir_modelo()
        if inferior == superior:
            raise self._error("El nivel inferior y el superior deben ser distintos.", -32602)
        nivel_inferior = self._nivel_por_gid(inferior)
        nivel_superior = self._nivel_por_gid(superior)
        try:
            altura = float(altura)
        except (TypeError, ValueError) as exc:
            raise self._error("La altura entre niveles no es un número.", -32602) from exc
        if altura <= 0:
            raise self._error("La altura entre niveles debe ser mayor que cero.", -32602)
        base = float(nivel_inferior.Elevation or 0.0)
        anterior = float(nivel_superior.Elevation or 0.0)
        destino = base + altura
        delta = destino - anterior
        self._instantanea()
        modificados: list[Any] = [nivel_superior]
        nivel_superior.Elevation = destino
        if abs(delta) > TOLERANCIA_CALCULO:
            modificados.extend(self._mover_elementos_nivel(nivel_superior, delta))
        if cadena:
            arrastrados = [
                n
                for n in self.modelo.by_type("IfcBuildingStorey")
                if n != nivel_superior
                and float(n.Elevation or 0.0) > anterior + TOLERANCIA_CALCULO
            ]
            arrastrados.sort(key=lambda n: float(n.Elevation or 0.0))
            for nivel in arrastrados:
                nivel.Elevation = float(nivel.Elevation or 0.0) + delta
                modificados.append(nivel)
                if abs(delta) > TOLERANCIA_CALCULO:
                    modificados.extend(self._mover_elementos_nivel(nivel, delta))
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Separación entre niveles fijada en {altura:.2f} m.",
        )

    def nivel_borrar(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        nivel = self._nivel_por_gid(globalid)
        elementos = [
            e
            for rel in (getattr(nivel, "ContainsElements", ()) or ())
            for e in (getattr(rel, "RelatedElements", ()) or ())
        ]
        if elementos:
            raise self._error(
                f"El nivel «{_nombre(nivel)}» tiene {len(elementos)} elemento(s); "
                "bórrelos antes de borrar el nivel.",
                -32021,
            )
        self._instantanea()
        gid = _gid(nivel)
        self.modelo.remove(nivel)
        self.con_cambios = True
        return self._resultado(borrados=[gid], mensaje="Nivel borrado.")

    # ------------------------------------------------------------------ ejes
    def _grid(self) -> Any:
        grids = self.modelo.by_type("IfcGrid")
        if grids:
            return grids[0]
        grid = root.create_entity(self.modelo, ifc_class="IfcGrid")
        grid.Name = "Ejes"
        grid.UAxes = []
        grid.VAxes = []
        try:
            spatial_api.assign_container(
                self.modelo, products=[grid], relating_structure=self._edificio()
            )
        except Exception:  # un IfcGrid sin contenedor sigue siendo válido
            LOG.debug("no se pudo contener el IfcGrid", exc_info=True)
        return grid

    def _etiqueta_libre(self, vertical: bool) -> str:
        grid = self._grid()
        usadas = {
            _etiqueta_eje(a).casefold()
            for a in self._ejes(grid)
            if getattr(a, "AxisTag", None)
        }
        if vertical:
            i = 1
            while str(i) in usadas:
                i += 1
            return str(i)
        i = 0
        while chr(ord("A") + i).casefold() in usadas:
            i += 1
        return chr(ord("A") + i)

    @staticmethod
    def _ejes(grid: Any) -> list[Any]:
        return list(getattr(grid, "UAxes", ()) or ()) + list(
            getattr(grid, "VAxes", ()) or ()
        )

    @staticmethod
    def _id_eje(grid: Any, eje: Any) -> str:
        # IfcGridAxis no es IfcRoot y no tiene GlobalId propio: se usa el del IfcGrid
        # junto con la etiqueta, que es única dentro de cada conjunto de ejes.
        return _gid(eje) or f"{_gid(grid)}/{_etiqueta_eje(eje)}"

    def ejes_listar(self) -> list[dict[str, Any]]:
        self._exigir_modelo()
        salida = []
        for grid in self.modelo.by_type("IfcGrid"):
            for eje in self._ejes(grid):
                puntos = []
                curva = getattr(eje, "AxisCurve", None)
                if curva is not None:
                    for punto in getattr(curva, "Points", ()) or ():
                        coords = list(getattr(punto, "Coordinates", ()) or ())
                        if len(coords) >= 2:
                            puntos.append([float(coords[0]), float(coords[1])])
                if len(puntos) >= 2:
                    x1, y1 = puntos[0]
                    x2, y2 = puntos[-1]
                else:
                    x1 = y1 = x2 = y2 = 0.0
                salida.append(
                    {
                        "globalid": self._id_eje(grid, eje),
                        "etiqueta": _etiqueta_eje(eje),
                        "x1": _redondear(x1),
                        "y1": _redondear(y1),
                        "x2": _redondear(x2),
                        "y2": _redondear(y2),
                        "vertical": abs(x2 - x1) < abs(y2 - y1),
                    }
                )
        salida.sort(key=lambda e: (not e["vertical"], e["etiqueta"]))
        return salida

    def eje_crear(
        self, etiqueta: str, x1: float, y1: float, x2: float, y2: float
    ) -> dict[str, Any]:
        self._exigir_modelo()
        try:
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
        except (TypeError, ValueError) as exc:
            raise self._error("Las coordenadas del eje no son números.", -32602) from exc
        if math.hypot(x2 - x1, y2 - y1) <= TOLERANCIA_CALCULO:
            raise self._error("El eje necesita dos puntos distintos.", -32602)
        self._instantanea()
        vertical = abs(x2 - x1) < abs(y2 - y1)
        etiqueta = (etiqueta or "").strip()
        if not etiqueta:
            etiqueta = self._etiqueta_libre(vertical)
        grid = self._grid()
        eje = grid_api.create_grid_axis(
            self.modelo,
            grid=grid,
            axis_tag=etiqueta,
            uvw_axes="UAxes" if vertical else "VAxes",
        )
        grid_api.create_axis_curve(
            self.modelo, p1=(x1, y1, 0.0), p2=(x2, y2, 0.0), grid_axis=eje, is_si=True
        )
        self.con_cambios = True
        modificados: list[str] = []
        # Un eje ortogonal en una retícula con rebase alarga la familia opuesta.
        if min(abs(x2 - x1), abs(y2 - y1)) <= TOLERANCIA_CALCULO:
            gid = self._id_eje(grid, eje)
            modificados = [g for g in self._recalcular_reticula(grid) if g != gid]
        return self._resultado(
            [self._id_eje(grid, eje)],
            modificados=modificados,
            mensaje=f"Eje «{etiqueta}» creado.",
        )

    def eje_editar(self, globalid: str, etiqueta: str) -> dict[str, Any]:
        self._exigir_modelo()
        etiqueta = (etiqueta or "").strip()
        if not etiqueta:
            raise self._error("La etiqueta del eje no puede quedar vacía.", -32602)
        for grid in self.modelo.by_type("IfcGrid"):
            for eje in self._ejes(grid):
                if self._id_eje(grid, eje) != globalid:
                    continue
                for otro in self._ejes(grid):
                    if otro != eje and _etiqueta_eje(otro).casefold() == etiqueta.casefold():
                        raise self._error(
                            f"Ya existe un eje con la etiqueta «{etiqueta}».", -32026
                        )
                self._instantanea()
                eje.AxisTag = etiqueta
                self.con_cambios = True
                return self._resultado(
                    modificados=[self._id_eje(grid, eje)],
                    mensaje=f"Eje renombrado a «{etiqueta}».",
                )
        raise self._error(f"No existe el eje {globalid}.", -32005)

    def eje_borrar(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        eje = None
        for grid in self.modelo.by_type("IfcGrid"):
            for candidato in self._ejes(grid):
                if self._id_eje(grid, candidato) == globalid:
                    eje = candidato
                    break
        if eje is None:
            raise self._error(f"No existe el eje {globalid}.", -32005)
        self._instantanea()
        grid_api.remove_grid_axis(self.modelo, axis=eje)
        self.con_cambios = True
        return self._resultado(borrados=[globalid], mensaje="Eje borrado.")

    # ------------------------------------------------------- O006a: cotas de ejes
    def _eje_por_gid(self, globalid: str) -> tuple[Any, Any]:
        for grid in self.modelo.by_type("IfcGrid"):
            for eje in self._ejes(grid):
                if self._id_eje(grid, eje) == globalid:
                    return grid, eje
        raise self._error(f"No existe el eje {globalid}.", -32005)

    def _puntos_curva_eje(self, eje: Any) -> list[Any]:
        curva = getattr(eje, "AxisCurve", None)
        puntos = list(getattr(curva, "Points", ()) or ())
        if len(puntos) < 2:
            raise self._error("El eje no tiene una curva de dos puntos editable.", -32028)
        return puntos

    def _direccion_eje(self, eje: Any) -> tuple[float, float, float, float, float, float, float]:
        """Devuelve (x1, y1, x2, y2, ux, uy, largo) de un IfcGridAxis."""
        puntos = self._puntos_curva_eje(eje)
        c1 = list(getattr(puntos[0], "Coordinates", ()) or ())
        c2 = list(getattr(puntos[-1], "Coordinates", ()) or ())
        x1, y1 = float(c1[0]), float(c1[1])
        x2, y2 = float(c2[0]), float(c2[1])
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El eje no tiene longitud.", -32028)
        return x1, y1, x2, y2, (x2 - x1) / largo, (y2 - y1) / largo, largo

    def _desplazar_eje(self, eje: Any, nx: float, ny: float, distancia: float) -> None:
        for punto in self._puntos_curva_eje(eje):
            coords = list(getattr(punto, "Coordinates", ()) or ())
            coords[0] = float(coords[0]) + nx * distancia
            coords[1] = float(coords[1]) + ny * distancia
            punto.Coordinates = tuple(coords)

    def ejes_mover(self, globalid: str, desplazamiento: float) -> dict[str, Any]:
        """O006a: desplaza un eje en perpendicular a su dirección (signo incluido)."""
        self._exigir_modelo()
        try:
            desplazamiento = float(desplazamiento)
        except (TypeError, ValueError) as exc:
            raise self._error("El desplazamiento del eje no es un número.", -32602) from exc
        grid, eje = self._eje_por_gid(globalid)
        _x1, _y1, _x2, _y2, ux, uy, _largo = self._direccion_eje(eje)
        # Normal derecha de la dirección: positiva hacia la derecha del eje dibujado.
        nx, ny = uy, -ux
        self._instantanea()
        self._desplazar_eje(eje, nx, ny, desplazamiento)
        # O006d: los extremos de la familia opuesta siguen rebasando la misma distancia.
        self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            modificados=[globalid],
            mensaje=f"Eje desplazado {desplazamiento:.2f} m.",
        )

    def ejes_separacion(
        self,
        referencia: str,
        mover: str,
        distancia: float,
        cadena: bool = True,
    ) -> dict[str, Any]:
        """O006a: deja `mover` a `distancia` de `referencia`; el resto conserva sus huecos."""
        self._exigir_modelo()
        if referencia == mover:
            raise self._error("El eje de referencia y el que se mueve deben ser distintos.", -32602)
        try:
            distancia = float(distancia)
        except (TypeError, ValueError) as exc:
            raise self._error("La distancia entre ejes no es un número.", -32602) from exc
        if distancia <= 0:
            raise self._error("La distancia entre ejes debe ser mayor que cero.", -32602)
        grid, eje_ref = self._eje_por_gid(referencia)
        _g, eje_mover = self._eje_por_gid(mover)
        xr, yr, _xr2, _yr2, ux, uy, _lr = self._direccion_eje(eje_ref)
        xm, ym, _xm2, _ym2, umx, umy, _lm = self._direccion_eje(eje_mover)
        if abs(ux * umy - uy * umx) > 1e-6:
            raise self._error(
                "Los ejes deben ser paralelos para acotar la separación entre ellos.",
                -32027,
            )
        nx, ny = uy, -ux
        s_ref = xr * nx + yr * ny
        s_mover = xm * nx + ym * ny
        lado = 1.0 if s_mover - s_ref >= 0 else -1.0
        objetivo = s_ref + distancia * lado
        delta = objetivo - s_mover
        self._instantanea()
        modificados = [mover]
        self._desplazar_eje(eje_mover, nx, ny, delta)
        if cadena:
            for candidato in self._ejes(grid):
                if candidato == eje_mover:
                    continue
                try:
                    cx1, cy1, _cx2, _cy2, cux, cuy, _cl = self._direccion_eje(candidato)
                except Exception:
                    continue
                if abs(ux * cuy - uy * cux) > 1e-6:
                    continue
                s_c = cx1 * nx + cy1 * ny
                # «Más allá» de mover: del lado contrario a la referencia.
                if (s_c - s_mover) * lado > 1e-6:
                    self._desplazar_eje(candidato, nx, ny, delta)
                    modificados.append(self._id_eje(grid, candidato))
        # O006d: al cambiar una separación se recalculan los extremos de la otra familia.
        self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Separación entre ejes fijada en {distancia:.2f} m.",
        )

    def _etiqueta_siguiente(self, primera: str, indice: int) -> str:
        if primera.isdigit():
            return str(int(primera) + indice)
        if len(primera) == 1 and primera.isalpha():
            return chr(ord(primera.upper()) + indice)
        raise self._error(
            "La primera etiqueta debe ser un número (1) o una letra (A).", -32602
        )

    def _distancias_ejes(self, separaciones: Any) -> list[float]:
        if isinstance(separaciones, str):
            crudas = [s for s in separaciones.replace(";", ",").split(",")]
        elif isinstance(separaciones, (list, tuple)):
            crudas = list(separaciones)
        else:
            raise self._error("Las separaciones deben ser una lista de números.", -32602)
        distancias: list[float] = []
        for cruda in crudas:
            texto = str(cruda).strip()
            if not texto:
                continue
            try:
                valor = float(texto.replace(",", "."))
            except ValueError as exc:
                raise self._error(
                    f"La separación «{texto}» no es un número.", -32602
                ) from exc
            if valor <= 0:
                raise self._error("Las separaciones deben ser mayores que cero.", -32602)
            distancias.append(valor)
        return distancias

    def _etiquetas_ejes(
        self, direccion: str, primera_etiqueta: str, cantidad: int
    ) -> list[str]:
        primera = (primera_etiqueta or "").strip()
        if not primera:
            primera = "1" if direccion == "vertical" else "A"
        return [self._etiqueta_siguiente(primera, i) for i in range(cantidad + 1)]

    def _crear_familia_ejes(
        self,
        grid: Any,
        direccion: str,
        origen: float,
        distancias: list[float],
        longitud: float,
        etiquetas: list[str],
    ) -> list[str]:
        creados: list[str] = []
        posicion = origen
        for indice, etiqueta in enumerate(etiquetas):
            if indice > 0:
                posicion += distancias[indice - 1]
            eje = grid_api.create_grid_axis(
                self.modelo,
                grid=grid,
                axis_tag=etiqueta,
                uvw_axes="UAxes" if direccion == "vertical" else "VAxes",
            )
            if direccion == "vertical":
                p1 = (posicion, 0.0, 0.0)
                p2 = (posicion, longitud, 0.0)
            else:
                p1 = (0.0, posicion, 0.0)
                p2 = (longitud, posicion, 0.0)
            grid_api.create_axis_curve(
                self.modelo, p1=p1, p2=p2, grid_axis=eje, is_si=True
            )
            creados.append(self._id_eje(grid, eje))
        return creados

    def _guardar_reticula(self, grid: Any, modo: str, rebase: float) -> None:
        self._guardar_pset(
            grid, "OPENRVT_Reticula", {"Modo": modo, "Rebase": float(rebase)}
        )

    def _leer_reticula(self, grid: Any) -> tuple[str, float]:
        datos = self._leer_pset(grid, "OPENRVT_Reticula")
        modo = str(datos.get("Modo") or "origen")
        try:
            rebase = float(datos.get("Rebase") or 1.5)
        except (TypeError, ValueError):
            rebase = 1.5
        return modo, rebase

    @staticmethod
    def _familia_eje(eje: Any) -> str:
        """«vertical» si el eje corre en Y; «horizontal» si corre en X."""
        try:
            puntos = list(getattr(getattr(eje, "AxisCurve", None), "Points", ()) or ())
            c1 = list(getattr(puntos[0], "Coordinates", ()) or ())
            c2 = list(getattr(puntos[-1], "Coordinates", ()) or ())
            return "vertical" if abs(float(c2[0]) - float(c1[0])) < abs(
                float(c2[1]) - float(c1[1])
            ) else "horizontal"
        except (IndexError, TypeError, ValueError):
            return "vertical"

    def _recalcular_reticula(self, grid: Any) -> list[str]:
        """O006d: extiende cada familia hasta rebasar la perpendicular."""
        modo, rebase = self._leer_reticula(grid)
        if modo != "rebase":
            return []
        verticales = [e for e in self._ejes(grid) if self._familia_eje(e) == "vertical"]
        horizontales = [
            e for e in self._ejes(grid) if self._familia_eje(e) == "horizontal"
        ]
        if not verticales or not horizontales:
            return []
        xs = [self._direccion_eje(e)[0] for e in verticales]
        ys = [self._direccion_eje(e)[1] for e in horizontales]
        y1, y2 = min(ys) - rebase, max(ys) + rebase
        x1, x2 = min(xs) - rebase, max(xs) + rebase
        modificados: list[str] = []
        for eje in verticales:
            x = self._direccion_eje(eje)[0]
            puntos = self._puntos_curva_eje(eje)
            for punto, (px, py) in zip(puntos, ((x, y1), (x, y2))):
                coords = list(getattr(punto, "Coordinates", ()) or ())
                coords[0], coords[1] = px, py
                punto.Coordinates = tuple(coords)
            modificados.append(self._id_eje(grid, eje))
        for eje in horizontales:
            y = self._direccion_eje(eje)[1]
            puntos = self._puntos_curva_eje(eje)
            for punto, (px, py) in zip(puntos, ((x1, y), (x2, y))):
                coords = list(getattr(punto, "Coordinates", ()) or ())
                coords[0], coords[1] = px, py
                punto.Coordinates = tuple(coords)
            modificados.append(self._id_eje(grid, eje))
        return modificados

    def ejes_reticula(self) -> dict[str, Any]:
        """O006d: modo y rebase guardados en el pset OPENRVT_Reticula del IfcGrid."""
        self._exigir_modelo()
        grids = self.modelo.by_type("IfcGrid")
        modo, rebase = self._leer_reticula(grids[0]) if grids else ("origen", 1.5)
        return {"modo": modo, "rebase": rebase}

    def ejes_rebase(self, rebase: Any) -> dict[str, Any]:
        """O006d: cambia el rebase de la retícula y recalcula los extremos."""
        self._exigir_modelo()
        try:
            valor = float(rebase)
        except (TypeError, ValueError) as exc:
            raise self._error("El rebase debe ser un número.", -32602) from exc
        if valor <= 0:
            raise self._error("El rebase debe ser mayor que cero.", -32602)
        grid = self._grid()
        modo, _ = self._leer_reticula(grid)
        self._instantanea()
        self._guardar_reticula(grid, modo, valor)
        modificados = self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
            mensaje=f"Rebase de la retícula fijado en {valor:.2f} m.",
        )

    def ejes_crear_por_separaciones(
        self,
        direccion: str,
        origen: float,
        separaciones: Any,
        longitud: float,
        primera_etiqueta: str,
        modo: str = "origen",
        rebase: float = 1.5,
    ) -> dict[str, Any]:
        """O006a/O006d: crea una familia de ejes a partir de las separaciones."""
        self._exigir_modelo()
        direccion = (direccion or "").strip().casefold()
        if direccion not in ("vertical", "horizontal"):
            raise self._error("La dirección debe ser «vertical» u «horizontal».", -32602)
        try:
            origen = float(origen)
            longitud = float(longitud)
            rebase = float(rebase)
        except (TypeError, ValueError) as exc:
            raise self._error("El origen y la longitud deben ser números.", -32602) from exc
        if longitud <= 0:
            raise self._error("La longitud de los ejes debe ser mayor que cero.", -32602)
        distancias = self._distancias_ejes(separaciones)
        if not distancias:
            raise self._error("Indique al menos una separación entre ejes.", -32602)
        etiquetas = self._etiquetas_ejes(direccion, primera_etiqueta, len(distancias))
        grid = self._grid()
        usadas = {_etiqueta_eje(a).casefold() for a in self._ejes(grid)}
        repetidas = [e for e in etiquetas if e.casefold() in usadas]
        if repetidas:
            raise self._error(
                f"Ya existe un eje con la etiqueta «{repetidas[0]}».", -32026
            )
        self._instantanea()
        creados = self._crear_familia_ejes(
            grid, direccion, origen, distancias, longitud, etiquetas
        )
        self._guardar_reticula(grid, modo, rebase)
        if modo == "rebase":
            self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            creados=creados,
            etiquetas=etiquetas,
            mensaje=f"{len(creados)} eje(s) creado(s) por separaciones.",
        )

    def ejes_crear_reticula(
        self,
        vertical: dict[str, Any] | None,
        horizontal: dict[str, Any] | None,
        modo: str = "rebase",
        rebase: float = 1.5,
    ) -> dict[str, Any]:
        """O006d: retícula en ambos sentidos, desde el origen o rebasando la opuesta."""
        self._exigir_modelo()
        modo = (modo or "rebase").strip().casefold()
        if modo not in ("origen", "rebase"):
            raise self._error("El modo debe ser «origen» o «rebase».", -32602)
        try:
            rebase = float(rebase)
        except (TypeError, ValueError) as exc:
            raise self._error("El rebase debe ser un número.", -32602) from exc
        if rebase <= 0:
            raise self._error("El rebase debe ser mayor que cero.", -32602)
        bloques: list[tuple[str, dict[str, Any]]] = []
        for direccion, bloque in (("vertical", vertical), ("horizontal", horizontal)):
            if bloque is None:
                continue
            separaciones = bloque.get("separaciones")
            distancias = self._distancias_ejes(separaciones if separaciones is not None else [])
            if not distancias:
                continue
            try:
                origen = float(bloque.get("origen", 0.0))
                longitud = float(bloque.get("longitud", 20.0))
            except (TypeError, ValueError) as exc:
                raise self._error(
                    "El origen y la longitud deben ser números.", -32602
                ) from exc
            if longitud <= 0:
                raise self._error(
                    "La longitud de los ejes debe ser mayor que cero.", -32602
                )
            etiquetas = self._etiquetas_ejes(
                direccion, str(bloque.get("primera_etiqueta") or ""), len(distancias)
            )
            bloques.append(
                (direccion, {
                    "origen": origen,
                    "longitud": longitud,
                    "distancias": distancias,
                    "etiquetas": etiquetas,
                })
            )
        if not bloques:
            raise self._error("Indique al menos una familia de ejes.", -32602)
        # Con una sola familia se usa el modo origen (regla de O006d).
        modo_efectivo = "origen" if len(bloques) == 1 else modo
        grid = self._grid()
        usadas = {_etiqueta_eje(a).casefold() for a in self._ejes(grid)}
        for _direccion, bloque in bloques:
            repetidas = [e for e in bloque["etiquetas"] if e.casefold() in usadas]
            if repetidas:
                raise self._error(
                    f"Ya existe un eje con la etiqueta «{repetidas[0]}».", -32026
                )
            usadas.update(e.casefold() for e in bloque["etiquetas"])
        self._instantanea()
        creados: list[str] = []
        etiquetas: list[str] = []
        for direccion, bloque in bloques:
            creados.extend(
                self._crear_familia_ejes(
                    grid,
                    direccion,
                    bloque["origen"],
                    bloque["distancias"],
                    bloque["longitud"],
                    bloque["etiquetas"],
                )
            )
            etiquetas.extend(bloque["etiquetas"])
        self._guardar_reticula(grid, modo_efectivo, rebase)
        if modo_efectivo == "rebase":
            self._recalcular_reticula(grid)
        self.con_cambios = True
        return self._resultado(
            creados=creados,
            etiquetas=etiquetas,
            modo=modo_efectivo,
            rebase=rebase,
            mensaje=f"{len(creados)} eje(s) creado(s) para la retícula.",
        )


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
        """Genera el cuerpo del muro con los vanos ya descontados."""
        datos = self._datos_muro(muro)
        # O007a: el desplazamiento sale de la línea de ubicación del tipo (o de la
        # alineación propia de la instancia cuando el usuario la eligió).
        offset = self._desfase_de_muro(muro, datos["espesor"])
        cuerpo = geometry_api.add_wall_representation(
            self.modelo,
            context=self._contexto(),
            length=max(datos["longitud"], 0.001),
            height=max(datos["altura"], 0.001),
            thickness=max(datos["espesor"], 0.001),
            offset=offset,
        )
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
                    offset,
                )
            )
        cuerpo.RepresentationIdentifier = "Body"
        if vanos:
            # add_boolean acepta el sólido del cuerpo como primer operando.
            try:
                item = cuerpo.Items[0]
                geometry_api.add_boolean(
                    self.modelo, first_item=item, second_items=vanos, operator="DIFFERENCE"
                )
            except Exception:
                LOG.warning("no se pudo descontar los vanos del muro", exc_info=True)
        return cuerpo

    @staticmethod
    def _desfase_alineacion(alineacion: str, espesor: float) -> float:
        # El cuerpo del muro se extiende desde `offset` hasta `offset + espesor`
        # en el eje local Y. «Centro» deja el eje en la mitad del muro.
        if alineacion == "exterior":
            return -espesor
        if alineacion == "interior":
            return 0.0
        return -espesor / 2.0

    def _quitar_representaciones(self, producto: Any, identificador: str) -> None:
        forma = getattr(producto, "Representation", None)
        if forma is None:
            return
        conservar = []
        quitar = []
        for rep in list(getattr(forma, "Representations", ()) or []):
            if getattr(rep, "RepresentationIdentifier", None) == identificador:
                quitar.append(rep)
            else:
                conservar.append(rep)
        if not quitar:
            return
        forma.Representations = conservar
        for rep in quitar:
            try:
                geometry_api.remove_representation(self.modelo, representation=rep)
            except Exception:
                LOG.debug("no se pudo quitar una representación", exc_info=True)
        if not conservar:
            producto.Representation = None
            try:
                self.modelo.remove(forma)
            except Exception:
                pass

    def _regenerar_muro(self, muro: Any) -> None:
        self._quitar_representaciones(muro, "Body")
        cuerpo = self._cuerpo_muro(muro)
        cuerpo.RepresentationIdentifier = "Body"
        geometry_api.assign_representation(self.modelo, product=muro, representation=cuerpo)
        self._regenerar_eje(muro)
        self._unir_muros(muro)

    def _regenerar_eje(self, muro: Any) -> None:
        datos = self._datos_muro(muro)
        try:
            self._quitar_representaciones(muro, "Axis")
            contexto = self._contexto("Axis", "GRAPH_VIEW")
            eje = geometry_api.add_axis_representation(
                self.modelo,
                context=contexto,
                axis=[(0.0, 0.0, 0.0), (datos["longitud"], 0.0, 0.0)],
            )
            eje.RepresentationIdentifier = "Axis"
            geometry_api.assign_representation(self.modelo, product=muro, representation=eje)
        except Exception:
            LOG.debug("no se pudo crear el eje del muro", exc_info=True)

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
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_muro(tipo)
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x1, y1, x2, y2 = float(x1), float(y1), float(x2), float(y2)
            altura = float(altura)
        except (TypeError, ValueError) as exc:
            raise self._error("Los datos del muro no son números.", -32602) from exc
        if alineacion not in ALINEACIONES:
            raise self._error(
                f"Alineación «{alineacion}» no válida; use centro, interior o exterior.",
                -32602,
            )
        x1, y1, x2, y2 = self._ajustar_extremos_a_ejes(x1, y1, x2, y2)
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("El muro necesita dos puntos distintos.", -32602)
        if altura <= 0:
            raise self._error("La altura del muro debe ser positiva.", -32602)

        self._instantanea()
        espesor = self._espesor_tipo(tipo_entidad)
        muro = root.create_entity(self.modelo, ifc_class="IfcWall")
        muro.Name = f"Muro {_nombre(tipo_entidad)}"
        type_api.assign_type(self.modelo, related_objects=[muro], relating_type=tipo_entidad)
        elevacion = float(nivel_entidad.Elevation or 0.0)
        self._guardar_pset(
            muro,
            "OPENRVT_Muro",
            {
                "Longitud": largo,
                "Altura": altura,
                "Espesor": espesor,
                "Alineacion": alineacion,
            },
        )
        cuerpo = self._cuerpo_muro(muro)
        geometry_api.assign_representation(self.modelo, product=muro, representation=cuerpo)
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        matriz = np.array(
            [
                [ux, -uy, 0.0, x1],
                [uy, ux, 0.0, y1],
                [0.0, 0.0, 1.0, elevacion],
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

    def _extremos_muro(self, muro: Any) -> tuple[float, float, float, float, float]:
        datos = self._datos_muro(muro)
        return datos["x1"], datos["y1"], datos["x2"], datos["y2"], datos["espesor"]

    def _proyectar_en_eje(
        self, px: float, py: float, ax: float, ay: float, bx: float, by: float
    ) -> tuple[float, float, float, float] | None:
        """Proyección de un punto sobre la recta de un eje; t y distancia perpendicular."""
        dx, dy = bx - ax, by - ay
        largo2 = dx * dx + dy * dy
        if largo2 <= TOLERANCIA_CALCULO:
            return None
        t = ((px - ax) * dx + (py - ay) * dy) / largo2
        qx, qy = ax + t * dx, ay + t * dy
        return t, qx, qy, math.hypot(px - qx, py - qy)

    def _ajustar_extremos_a_ejes(
        self, x1: float, y1: float, x2: float, y2: float
    ) -> tuple[float, float, float, float]:
        """O006e: lleva al eje del muro vecino un extremo próximo a su cara o eje."""
        extremos = [[x1, y1], [x2, y2]]
        for otro in self.modelo.by_type("IfcWall"):
            ox1, oy1, ox2, oy2, espesor = self._extremos_muro(otro)
            dx, dy = ox2 - ox1, oy2 - oy1
            largo = math.hypot(dx, dy)
            if largo <= TOLERANCIA_CALCULO:
                continue
            # Solo muros no paralelos: dos muros alineados no se enganchan al eje.
            ux, uy = dx / largo, dy / largo
            for indice, (px, py) in enumerate(extremos):
                proyeccion = self._proyectar_en_eje(px, py, ox1, oy1, ox2, oy2)
                if proyeccion is None:
                    continue
                t, qx, qy, separacion = proyeccion
                if t < -0.02 or t > 1.02:
                    continue
                if separacion > espesor / 2.0 + TOLERANCIA_UNION:
                    continue
                # El extremo del propio muro no debe ser el extremo del vecino.
                if separacion <= TOLERANCIA_CALCULO:
                    continue
                extremos[indice] = [qx, qy]
        return extremos[0][0], extremos[0][1], extremos[1][0], extremos[1][1]

    def _conexion_entre(self, a: Any, b: Any) -> tuple[str, str] | None:
        """Tipo de conexión (ATSTART/ATEND) entre dos muros, o None si no se tocan."""
        ax1, ay1, ax2, ay2, _ = self._extremos_muro(a)
        bx1, by1, bx2, by2, espesor_b = self._extremos_muro(b)
        for px, py, fin_a in ((ax1, ay1, "ATSTART"), (ax2, ay2, "ATEND")):
            for qx, qy, fin_b in ((bx1, by1, "ATSTART"), (bx2, by2, "ATEND")):
                if math.hypot(px - qx, py - qy) <= TOLERANCIA:
                    return fin_a, fin_b
        # El extremo de `a` toca el interior de `b` (unión en T).
        for px, py, fin_a in ((ax1, ay1, "ATSTART"), (ax2, ay2, "ATEND")):
            proyeccion = self._proyectar_en_eje(px, py, bx1, by1, bx2, by2)
            if proyeccion is None:
                continue
            t, _qx, _qy, separacion = proyeccion
            if not (0.01 < t < 0.99):
                continue
            if separacion <= espesor_b / 2.0 + TOLERANCIA:
                # `a` llega al interior de `b`: `b` es el pasante.
                return fin_a, "ATPATH"
        # El extremo de `b` toca el interior de `a`.
        espesor_a = self._extremos_muro(a)[4]
        for px, py, fin_b in ((bx1, by1, "ATSTART"), (bx2, by2, "ATEND")):
            proyeccion = self._proyectar_en_eje(px, py, ax1, ay1, ax2, ay2)
            if proyeccion is None:
                continue
            t, _qx, _qy, separacion = proyeccion
            if not (0.01 < t < 0.99):
                continue
            if separacion <= espesor_a / 2.0 + TOLERANCIA:
                return "ATSTART" if t < 0.5 else "ATEND", "ATPATH"
        return None

    def _descontar_vanos(self, muro: Any, cuerpo: Any) -> None:
        """Vuelve a descontar las aberturas tras regenerar una unión."""
        if cuerpo is None:
            return
        datos = self._datos_muro(muro)
        offset = self._desfase_de_muro(muro, datos["espesor"])
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
                    offset,
                )
            )
        if not vanos:
            return
        try:
            item = cuerpo.Items[0]
            geometry_api.add_boolean(
                self.modelo, first_item=item, second_items=vanos, operator="DIFFERENCE"
            )
        except Exception:
            LOG.warning("no se pudieron descontar los vanos al regenerar la unión", exc_info=True)

    def _regenerar_representacion_unida(self, muro: Any) -> bool:
        """O006e: recorta o extiende el cuerpo del muro según sus uniones IFC."""
        try:
            cuerpo = geometry_api.regenerate_wall_representation(self.modelo, muro)
        except Exception:
            LOG.warning("no se pudo regenerar la unión del muro %s", _gid(muro), exc_info=True)
            return False
        if cuerpo is None:
            return False
        self._descontar_vanos(muro, cuerpo)
        return True

    def _unir_muros(self, muro: Any) -> list[Any]:
        """Une muros que tocan sus extremos (L) o el interior de otro (T) y regenera."""
        unidos: list[Any] = []
        muros = [otro for otro in self.modelo.by_type("IfcWall") if otro != muro]
        existentes: dict[int, Any] = {}
        for rel in list(getattr(muro, "ConnectedTo", ()) or ()) + list(
            getattr(muro, "ConnectedFrom", ()) or ()
        ):
            if not rel.is_a("IfcRelConnectsPathElements"):
                continue
            otro = (
                rel.RelatedElement
                if getattr(rel, "RelatingElement", None) == muro
                else rel.RelatingElement
            )
            existentes[id(otro)] = rel
        afectados: list[Any] = []
        for otro in muros:
            conexion = self._conexion_entre(muro, otro)
            if conexion is None:
                # Al mover un muro, la unión vieja deja de ser válida.
                rel = existentes.get(id(otro))
                if rel is not None:
                    try:
                        self.modelo.remove(rel)
                    except Exception:
                        LOG.debug("no se pudo quitar una unión obsoleta", exc_info=True)
                    afectados.append(otro)
                continue
            tipo_muro, tipo_otro = conexion
            if id(otro) in existentes:
                continue
            try:
                geometry_api.connect_path(
                    self.modelo,
                    relating_element=muro,
                    related_element=otro,
                    relating_connection=tipo_muro,
                    related_connection=tipo_otro,
                )
                unidos.append(otro)
                afectados.append(otro)
            except Exception:
                LOG.warning("no se pudo unir %s con %s", _gid(muro), _gid(otro), exc_info=True)
        for afectado in [muro, *afectados]:
            self._regenerar_representacion_unida(afectado)
        return unidos

    # ------------------------------------------------------------------ losas
    def losa_crear(
        self,
        nivel: str,
        puntos: Any,
        espesor: float = 0.12,
        desfase: float = 0.0,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            poligono = [(float(p[0]), float(p[1])) for p in puntos]
            espesor = float(espesor)
            desfase = float(desfase)
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("El contorno de la losa no es válido.", -32602) from exc
        if len(poligono) < 3:
            raise self._error("La losa necesita al menos tres vértices.", -32602)
        if abs(_poligono_area(poligono)) <= TOLERANCIA_CALCULO:
            raise self._error("La losa tiene área cero.", -32602)
        if espesor <= 0:
            raise self._error("El espesor de la losa debe ser positivo.", -32602)

        self._instantanea()
        losa = root.create_entity(self.modelo, ifc_class="IfcSlab")
        losa.Name = "Losa"
        losa.PredefinedType = "FLOOR"
        elevacion = float(nivel_entidad.Elevation or 0.0) + desfase
        # El contorno se guarda local y la losa se coloca en la elevación del nivel.
        rep = geometry_api.add_slab_representation(
            self.modelo,
            context=self._contexto(),
            depth=espesor,
            direction_sense="NEGATIVE",
            polyline=poligono,
        )
        rep.RepresentationIdentifier = "Body"
        geometry_api.assign_representation(self.modelo, product=losa, representation=rep)
        matriz = np.identity(4)
        matriz[0][3] = 0.0
        matriz[1][3] = 0.0
        matriz[2][3] = elevacion
        geometry_api.edit_object_placement(self.modelo, product=losa, matrix=matriz)
        spatial_api.assign_container(
            self.modelo, products=[losa], relating_structure=nivel_entidad
        )
        self._guardar_pset(
            losa,
            "OPENRVT_Losa",
            {
                "Espesor": espesor,
                "Desfase": desfase,
                "Puntos": len(poligono),
            },
        )
        self.con_cambios = True
        return self._resultado([losa], mensaje=f"Losa creada ({abs(_poligono_area(poligono)):.2f} m²).")

    def _circuito_muros(self, globalids: list[str]) -> list[Any]:
        muros = []
        for gid in globalids:
            entidad = self._entidad_por_gid(gid)
            if not entidad.is_a("IfcWall"):
                raise self._error(f"{gid} no es un muro.", -32022)
            muros.append(entidad)
        if len(muros) < 3:
            raise self._error("Seleccione al menos tres muros para el circuito.", -32022)
        sin_usar = list(muros)
        primero = sin_usar.pop(0)
        orden = [primero]
        x1, y1, x2, y2, _ = self._extremos_muro(primero)
        actual = (x2, y2)
        inicio = (x1, y1)
        while sin_usar:
            elegido = None
            for candidato in sin_usar:
                a = self._extremos_muro(candidato)
                if math.hypot(a[0] - actual[0], a[1] - actual[1]) <= TOLERANCIA:
                    elegido = (candidato, (a[2], a[3]))
                    break
                if math.hypot(a[2] - actual[0], a[3] - actual[1]) <= TOLERANCIA:
                    elegido = (candidato, (a[0], a[1]))
                    break
            if elegido is None:
                raise self._error("Los muros seleccionados no forman un circuito cerrado.", -32022)
            orden.append(elegido[0])
            sin_usar.remove(elegido[0])
            actual = elegido[1]
        if math.hypot(actual[0] - inicio[0], actual[1] - inicio[1]) > TOLERANCIA:
            raise self._error("Los muros seleccionados no forman un circuito cerrado.", -32022)
        return orden

    def losa_desde_muros(self, nivel: str, globalids: Any) -> dict[str, Any]:
        self._exigir_modelo()
        if not isinstance(globalids, (list, tuple)):
            raise self._error("globalids debe ser una lista de muros.", -32602)
        nivel_entidad = self._nivel_por_gid(nivel)
        muros = self._circuito_muros([str(g) for g in globalids])
        # Línea Media del circuito, recorrida en el orden de la cadena y con cada
        # muro orientado desde el vértice anterior al siguiente.
        puntos: list[tuple[float, float]] = []
        lados: list[tuple[float, float, float]] = []
        primero = self._datos_muro(muros[0])
        actual = (primero["x1"], primero["y1"])
        for muro in muros:
            datos = self._datos_muro(muro)
            if datos["longitud"] <= TOLERANCIA_CALCULO:
                continue
            if math.hypot(datos["x1"] - actual[0], datos["y1"] - actual[1]) <= TOLERANCIA:
                siguiente = (datos["x2"], datos["y2"])
            elif math.hypot(datos["x2"] - actual[0], datos["y2"] - actual[1]) <= TOLERANCIA:
                siguiente = (datos["x1"], datos["y1"])
            else:
                raise self._error(
                    "Los muros seleccionados no forman un circuito cerrado.", -32022
                )
            lados.append((actual[0], actual[1], datos["espesor"]))
            actual = siguiente
        if len(lados) < 3:
            raise self._error("El circuito no tiene muros suficientes.", -32022)
        area = _poligono_area([(x, y) for x, y, _ in lados])
        signo = 1.0 if area >= 0 else -1.0
        for i, (x, y, espesor) in enumerate(lados):
            nx, ny = lados[(i + 1) % len(lados)][:2]
            sx, sy = lados[i - 1][:2]
            # Normal exterior media de los dos lados que llegan al vértice.
            d1x, d1y = x - sx, y - sy
            d2x, d2y = nx - x, ny - y
            n1 = math.hypot(d1x, d1y)
            n2 = math.hypot(d2x, d2y)
            if n1 <= TOLERANCIA_CALCULO or n2 <= TOLERANCIA_CALCULO:
                continue
            u1 = (d1x / n1, d1y / n1)
            u2 = (d2x / n2, d2y / n2)
            # Normales hacia fuera: para un polígono CCW, (dy, -dx).
            m1 = (u1[1] * signo, -u1[0] * signo)
            m2 = (u2[1] * signo, -u2[0] * signo)
            puntos.append(
                (x + (m1[0] + m2[0]) * espesor / 2.0, y + (m1[1] + m2[1]) * espesor / 2.0)
            )
        # Simplifica vértices duplicados.
        limpio = []
        for punto in puntos:
            if not limpio or math.hypot(punto[0] - limpio[-1][0], punto[1] - limpio[-1][1]) > TOLERANCIA_CALCULO:
                limpio.append(punto)
        if len(limpio) < 3:
            raise self._error("No se pudo calcular el contorno exterior.", -32022)
        return self.losa_crear(nivel, limpio, espesor=0.12, desfase=0.0)

    # ------------------------------------------------------------------ aberturas
    def _datos_abertura(self, vano: Any) -> dict[str, Any] | None:
        datos = self._leer_pset(vano, "OPENRVT_Abertura")
        if not datos:
            return None
        return {
            "distancia": float(datos.get("Distancia") or 0.0),
            "ancho": float(datos.get("Ancho") or 0.9),
            "alto": float(datos.get("Alto") or 2.1),
            "antepecho": float(datos.get("Antepecho") or 0.0),
            "muro": str(datos.get("Muro") or ""),
            "volteado": bool(datos.get("Volteado") or False),
        }

    def _aberturas_del_muro(self, muro: Any, excluir: Any = None) -> list[tuple[Any, dict[str, Any]]]:
        salida = []
        for rel in getattr(muro, "HasOpenings", ()) or ():
            vano = getattr(rel, "RelatedOpeningElement", None)
            if vano is None or vano == excluir:
                continue
            datos = self._datos_abertura(vano)
            if datos is not None:
                salida.append((vano, datos))
        return salida

    def _matriz_hueco(self, muro: Any, distancia: float, antepecho: float) -> np.ndarray:
        datos = self._datos_muro(muro)
        matriz = np.array(
            [
                [datos["dx"], -datos["dy"], 0.0, datos["x1"] + datos["dx"] * distancia],
                [datos["dy"], datos["dx"], 0.0, datos["y1"] + datos["dy"] * distancia],
                [0.0, 0.0, 1.0, datos["z"] + antepecho],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )
        return matriz

    def _cuerpo_relleno(
        self,
        ancho: float,
        alto: float,
        profundidad: float,
        clase: str,
        volteado: bool,
        desfase: float = 0.0,
    ) -> Any:
        """Marco de cuatro barras y hoja (puerta) o vidrio (ventana).

        O005c: `desfase` centra el marco en el cuerpo del muro. Con alineación
        «interior» o «exterior» el cuerpo no está sobre el eje, y antes el marco se
        quedaba en el eje: en planta asomaba un rectángulo fuera del muro.
        """
        barra = min(0.06, ancho / 6.0, alto / 6.0)
        # Cada caja: (x0, z0, ancho, alto, media profundidad).
        cajas = [
            (0.0, 0.0, ancho, barra, profundidad / 2.0),
            (0.0, alto - barra, ancho, barra, profundidad / 2.0),
            (0.0, barra, barra, alto - 2 * barra, profundidad / 2.0),
            (ancho - barra, barra, barra, alto - 2 * barra, profundidad / 2.0),
        ]
        if clase == "IfcWindow":
            cajas.append((barra, barra, ancho - 2 * barra, alto - 2 * barra, 0.006))
        else:
            cajas.append(
                (
                    barra,
                    barra,
                    ancho - 2 * barra,
                    alto - 2 * barra,
                    min(0.025, profundidad / 3.0),
                )
            )
        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        for indice, (x0, z0, w, h, t) in enumerate(cajas):
            # La hoja de la puerta se desplaza a un lado u otro del marco: así se ve
            # el lado de abatimiento que elige el usuario con Espacio.
            desplazamiento = 0.0
            if indice == 4 and clase == "IfcDoor":
                desplazamiento = 0.03 if volteado else -0.03
            base = len(vertices)
            vertices.extend(
                [
                    [x0, -t + desplazamiento + desfase, z0],
                    [x0 + w, -t + desplazamiento + desfase, z0],
                    [x0 + w, t + desplazamiento + desfase, z0],
                    [x0, t + desplazamiento + desfase, z0],
                    [x0, -t + desplazamiento + desfase, z0 + h],
                    [x0 + w, -t + desplazamiento + desfase, z0 + h],
                    [x0 + w, t + desplazamiento + desfase, z0 + h],
                    [x0, t + desplazamiento + desfase, z0 + h],
                ]
            )
            caras.extend(
                [
                    [base, base + 3, base + 2, base + 1],
                    [base + 4, base + 5, base + 6, base + 7],
                    [base, base + 1, base + 5, base + 4],
                    [base + 1, base + 2, base + 6, base + 5],
                    [base + 2, base + 3, base + 7, base + 6],
                    [base + 3, base, base + 4, base + 7],
                ]
            )
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        rep.RepresentationIdentifier = "Body"
        return rep

    def _regenerar_relleno(self, relleno: Any, vano: Any) -> None:
        datos = self._datos_abertura(vano)
        if datos is None:
            return
        muro = self._entidad_por_gid(datos["muro"], ("IfcWall",)) if datos["muro"] else None
        espesor = self._datos_muro(muro)["espesor"] if muro is not None else 0.15
        # O005c: centro del cuerpo del muro en el eje local Y, para que el marco no
        # sobresalga cuando la alineación es interior o exterior.
        desfase = (
            self._desfase_alineacion(self._datos_muro(muro)["alineacion"], espesor)
            + espesor / 2.0
            if muro is not None
            else 0.0
        )
        if relleno.is_a("IfcDoor"):
            cuerpo = self._cuerpo_relleno(
                datos["ancho"],
                datos["alto"],
                espesor,
                "IfcDoor",
                datos["volteado"],
                desfase,
            )
        else:
            cuerpo = self._cuerpo_relleno(
                datos["ancho"],
                datos["alto"],
                espesor,
                "IfcWindow",
                datos["volteado"],
                desfase,
            )
        self._quitar_representaciones(relleno, "Body")
        geometry_api.assign_representation(self.modelo, product=relleno, representation=cuerpo)
        geometry_api.edit_object_placement(
            self.modelo,
            product=relleno,
            matrix=self._matriz_hueco(muro, datos["distancia"], datos["antepecho"]),
        )

    def abertura_crear(
        self,
        clase: str,
        muro: str,
        distancia: float,
        ancho: float | None = None,
        alto: float | None = None,
        antepecho: float | None = None,
        volteado: bool = False,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        if clase not in ("IfcDoor", "IfcWindow"):
            raise self._error("La clase debe ser IfcDoor o IfcWindow.", -32602)
        muro_entidad = self._entidad_por_gid(muro, ("IfcWall",))
        if ancho is None:
            ancho = 0.90 if clase == "IfcDoor" else 1.20
        if alto is None:
            alto = 2.10 if clase == "IfcDoor" else 1.20
        if antepecho is None:
            antepecho = 0.0 if clase == "IfcDoor" else 0.90
        try:
            distancia, ancho, alto, antepecho = (
                float(distancia),
                float(ancho),
                float(alto),
                float(antepecho),
            )
        except (TypeError, ValueError) as exc:
            raise self._error("Las medidas de la abertura no son números.", -32602) from exc
        datos_muro = self._datos_muro(muro_entidad)
        if distancia < -TOLERANCIA_CALCULO:
            raise self._error("La distancia no puede ser negativa.", -32602)
        if distancia + ancho > datos_muro["longitud"] + TOLERANCIA:
            raise self._error(
                f"La abertura no cabe en el muro: necesita {(distancia + ancho):.2f} m "
                f"y el muro mide {datos_muro['longitud']:.2f} m.",
                -32023,
            )
        if antepecho < -TOLERANCIA_CALCULO or antepecho + alto > datos_muro["altura"] + TOLERANCIA:
            raise self._error(
                f"La abertura no cabe en altura: {antepecho + alto:.2f} m "
                f"para un muro de {datos_muro['altura']:.2f} m.",
                -32023,
            )
        fin = distancia + ancho
        for otro, otros in self._aberturas_del_muro(muro_entidad):
            otro_fin = otros["distancia"] + otros["ancho"]
            if distancia < otro_fin - TOLERANCIA and fin > otros["distancia"] + TOLERANCIA:
                raise self._error(
                    "La abertura se traslapa con otra abertura del mismo muro.", -32024
                )

        self._instantanea()
        vano = root.create_entity(self.modelo, ifc_class="IfcOpeningElement")
        vano.Name = "Vano"
        self._guardar_pset(
            vano,
            "OPENRVT_Abertura",
            {
                "Distancia": distancia,
                "Ancho": ancho,
                "Alto": alto,
                "Antepecho": antepecho,
                "Muro": _gid(muro_entidad),
                "Volteado": bool(volteado),
            },
        )
        cuerpo_vano = self._cuerpo_hueco(
            ancho,
            alto,
            datos_muro["espesor"],
            antepecho,
            distancia,
            self._desfase_alineacion(datos_muro["alineacion"], datos_muro["espesor"]),
        )
        geometry_api.assign_representation(self.modelo, product=vano, representation=cuerpo_vano)
        geometry_api.edit_object_placement(
            self.modelo,
            product=vano,
            matrix=self._matriz_hueco(muro_entidad, distancia, antepecho),
        )
        spatial_api.assign_container(
            self.modelo,
            products=[vano],
            relating_structure=next(
                (
                    rel.RelatingStructure
                    for rel in (getattr(muro_entidad, "ContainedInStructure", ()) or ())
                ),
                None,
            ),
        ) if (getattr(muro_entidad, "ContainedInStructure", ()) or ()) else None
        feature_api.add_feature(self.modelo, feature=vano, element=muro_entidad)

        relleno = root.create_entity(self.modelo, ifc_class=clase)
        relleno.Name = "Puerta" if clase == "IfcDoor" else "Ventana"
        if clase == "IfcDoor":
            relleno.OverallWidth = ancho
            relleno.OverallHeight = alto
            relleno.PredefinedType = "DOOR"
        else:
            relleno.OverallWidth = ancho
            relleno.OverallHeight = alto
            relleno.PredefinedType = "WINDOW"
        self._regenerar_relleno(relleno, vano)
        feature_api.add_filling(self.modelo, opening=vano, element=relleno)
        self._regenerar_muro(muro_entidad)
        self.con_cambios = True
        return self._resultado(
            [vano, relleno],
            modificados=[muro_entidad],
            mensaje=f"{'Puerta' if clase == 'IfcDoor' else 'Ventana'} colocada a {distancia:.2f} m.",
        )

    # ------------------------------------------------------------------ edición general
    def _todos_los_gids(self, globalids: Any) -> list[str]:
        if isinstance(globalids, str):
            return [globalids]
        if not isinstance(globalids, (list, tuple)) or not globalids:
            raise self._error("Seleccione al menos un elemento.", -32602)
        return [str(g) for g in globalids]

    def _productos_de(self, globalid: str) -> list[Any]:
        entidad = self._entidad_por_gid(globalid)
        if entidad.is_a("IfcWall"):
            return [entidad] + self._aberturas_de(entidad)
        if entidad.is_a("IfcOpeningElement"):
            relleno = self._relleno_de(entidad)
            return [entidad] + ([relleno] if relleno is not None else [])
        return [entidad]

    def elementos_mover(self, globalids: Any, dx: float, dy: float, dz: float) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        try:
            dx, dy, dz = float(dx), float(dy), float(dz)
        except (TypeError, ValueError) as exc:
            raise self._error("El desplazamiento no es numérico.", -32602) from exc
        if abs(dx) + abs(dy) + abs(dz) <= TOLERANCIA_CALCULO:
            return self._resultado(mensaje="Sin desplazamiento.")
        self._instantanea()
        afectados: list[Any] = []
        vistos: set[int] = set()
        for gid in gids:
            for producto in self._productos_de(gid):
                if id(producto) in vistos:
                    continue
                vistos.add(id(producto))
                afectados.append(producto)
        # Se calculan todas las matrices antes de tocar nada: mover un muro desplaza a
        # sus vanos (que cuelgan de él), pero un relleno puede tener colocación propia.
        matrices = {
            id(producto): self._matriz_traslado(producto, dx, dy, dz)
            for producto in afectados
        }
        for producto in afectados:
            geometry_api.edit_object_placement(
                self.modelo,
                product=producto,
                matrix=matrices[id(producto)],
                is_si=True,
                should_transform_children=False,
            )
        for producto in afectados:
            if producto.is_a("IfcWall"):
                self._unir_muros(producto)
        self.con_cambios = True
        return self._resultado(
            modificados=[g for g in afectados if not g.is_a("IfcOpeningElement")],
            mensaje=f"{len(afectados)} elemento(s) movido(s).",
        )

    def _matriz_traslado(self, producto: Any, dx: float, dy: float, dz: float) -> np.ndarray:
        """Matriz de mundo del producto desplazada (no la delta sola)."""
        import ifcopenshell.util.placement as placement

        matriz = placement.get_local_placement(producto.ObjectPlacement)
        matriz[0][3] += dx
        matriz[1][3] += dy
        matriz[2][3] += dz
        return matriz

    def _quitar_uniones(self, muro: Any) -> None:
        for rel in list(getattr(muro, "ConnectedTo", ()) or ()) + list(
            getattr(muro, "ConnectedFrom", ()) or ()
        ):
            try:
                self.modelo.remove(rel)
            except Exception:
                LOG.debug("no se pudo quitar una unión", exc_info=True)

    def elementos_borrar(self, globalids: Any) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        self._instantanea()
        borrados: list[str] = []
        vistos: set[int] = set()
        for gid in gids:
            try:
                entidad = self._entidad_por_gid(gid)
            except Exception:
                continue
            productos = self._productos_de(_gid(entidad))
            # De relleno a vano y de vano a muro, para no dejar relaciones colgando.
            for producto in reversed(productos):
                if id(producto) in vistos:
                    continue
                vistos.add(id(producto))
                if producto.is_a("IfcWall"):
                    self._quitar_uniones(producto)
                for rel in list(getattr(producto, "Decomposes", ()) or ()):
                    try:
                        self.modelo.remove(rel)
                    except Exception:
                        pass
                try:
                    root.remove_product(self.modelo, product=producto)
                    borrados.append(_gid(producto))
                except Exception:
                    LOG.warning("no se pudo borrar %s", _gid(producto), exc_info=True)
        self.con_cambios = True
        return self._resultado(borrados=borrados, mensaje=f"{len(borrados)} elemento(s) borrado(s).")

    def _copiar_entidad(self, entidad: Any) -> Any:
        copia = ifcopenshell.util.element.copy(self.modelo, entidad)
        copia.GlobalId = ifcopenshell.guid.new()
        return copia

    def elementos_copiar(self, globalids: Any, dx: float, dy: float, dz: float) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        try:
            dx, dy, dz = float(dx), float(dy), float(dz)
        except (TypeError, ValueError) as exc:
            raise self._error("El desplazamiento no es numérico.", -32602) from exc
        self._instantanea()
        creados: list[Any] = []
        for gid in gids:
            original = self._entidad_por_gid(gid)
            if original.is_a("IfcWall"):
                copia = self._copiar_entidad(original)
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
                self._regenerar_eje(copia)
                self._unir_muros(copia)
                creados.append(copia)
            elif original.is_a("IfcSlab"):
                copia = self._copiar_entidad(original)
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
            else:
                copia = self._copiar_entidad(original)
                geometry_api.edit_object_placement(
                    self.modelo,
                    product=copia,
                    matrix=self._matriz_traslado(copia, dx, dy, dz),
                    is_si=True,
                )
                creados.append(copia)
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

    def _cambiar_tipo_muro(self, muro: Any, tipo: Any) -> None:
        type_api.assign_type(self.modelo, related_objects=[muro], relating_type=tipo)
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

    def elemento_editar(self, globalid: str, cambios: Any) -> dict[str, Any]:
        self._exigir_modelo()
        if not isinstance(cambios, dict) or not cambios:
            raise self._error("No hay cambios para el elemento.", -32602)
        entidad = self._entidad_por_gid(globalid)
        self._instantanea()
        modificados: list[Any] = [entidad]
        if "nombre" in cambios or "Nombre" in cambios:
            nombre = cambios.get("nombre", cambios.get("Nombre"))
            if not str(nombre or "").strip():
                raise self._error("El nombre no puede quedar vacío.", -32602)
            entidad.Name = str(nombre).strip()

        if entidad.is_a("IfcWall"):
            datos = self._datos_muro(entidad)
            tipo = cambios.get("tipo", cambios.get("Tipo"))
            if tipo is not None and str(tipo) != _nombre(self._tipo_entidad(entidad) or ""):
                self._cambiar_tipo_muro(entidad, self._tipo_muro(str(tipo)))
                datos = self._datos_muro(entidad)
            altura = cambios.get("altura", cambios.get("Altura"))
            if altura is not None:
                altura = float(altura)
                if altura <= 0:
                    raise self._error("La altura debe ser positiva.", -32602)
                for vano, info in self._aberturas_del_muro(entidad):
                    if info["antepecho"] + info["alto"] > altura + TOLERANCIA:
                        raise self._error(
                            "La nueva altura deja una abertura fuera del muro.", -32023
                        )
                self._guardar_pset(
                    entidad,
                    "OPENRVT_Muro",
                    {
                        "Longitud": datos["longitud"],
                        "Altura": altura,
                        "Espesor": datos["espesor"],
                        "Alineacion": datos["alineacion"],
                    },
                )
            self._regenerar_muro(entidad)
            for vano, info in self._aberturas_del_muro(entidad):
                relleno = self._relleno_de(vano)
                if relleno is not None:
                    self._regenerar_relleno(relleno, vano)
                    modificados.append(relleno)
        elif entidad.is_a("IfcSlab"):
            datos = self._leer_pset(entidad, "OPENRVT_Losa")
            if "espesor" in cambios or "Espesor" in cambios:
                espesor = float(cambios.get("espesor", cambios.get("Espesor")))
                if espesor <= 0:
                    raise self._error("El espesor debe ser positivo.", -32602)
                poligono = self._poligono_de_losa(entidad)
                self._quitar_representaciones(entidad, "Body")
                nueva = geometry_api.add_slab_representation(
                    self.modelo,
                    context=self._contexto(),
                    depth=espesor,
                    direction_sense="NEGATIVE",
                    polyline=poligono,
                )
                nueva.RepresentationIdentifier = "Body"
                geometry_api.assign_representation(self.modelo, product=entidad, representation=nueva)
                datos["Espesor"] = espesor
                self._guardar_pset(entidad, "OPENRVT_Losa", datos)
        elif entidad.is_a("IfcOpeningElement"):
            datos = self._datos_abertura(entidad) or {}
            ancho = float(cambios.get("ancho", cambios.get("Ancho", datos.get("ancho", 0.9))))
            alto = float(cambios.get("alto", cambios.get("Alto", datos.get("alto", 2.1))))
            modificados.extend(self._aplicar_medidas_abertura(entidad, ancho, alto))
        elif entidad.is_a("IfcDoor") or entidad.is_a("IfcWindow"):
            for clave in ("ancho", "Ancho"):
                if clave in cambios:
                    entidad.OverallWidth = float(cambios[clave])
            for clave in ("alto", "Alto"):
                if clave in cambios:
                    entidad.OverallHeight = float(cambios[clave])
            for rel in getattr(entidad, "FillsVoids", ()) or ():
                vano = getattr(rel, "RelatingOpeningElement", None)
                if vano is not None:
                    modificados.extend(
                        self._aplicar_medidas_abertura(
                            vano,
                            float(entidad.OverallWidth),
                            float(entidad.OverallHeight),
                        )
                    )
        else:
            raise self._error("Este elemento no tiene propiedades editables.", -32025)
        self.con_cambios = True
        return self._resultado(modificados=modificados, mensaje="Elemento actualizado.")

    def _aplicar_medidas_abertura(
        self, entidad: Any, ancho: float, alto: float
    ) -> list[Any]:
        """Cambia el ancho/alto de un vano y regenera vano, relleno y muro."""
        datos = self._datos_abertura(entidad) or {}
        muro = self._entidad_por_gid(datos["muro"], ("IfcWall",))
        info_muro = self._datos_muro(muro)
        if datos["distancia"] + ancho > info_muro["longitud"] + TOLERANCIA:
            raise self._error("La abertura no cabe en el muro.", -32023)
        if datos["antepecho"] + alto > info_muro["altura"] + TOLERANCIA:
            raise self._error("La abertura no cabe en altura.", -32023)
        for _otro, otros in self._aberturas_del_muro(muro, excluir=entidad):
            if datos["distancia"] < otros["distancia"] + otros["ancho"] - TOLERANCIA and (
                datos["distancia"] + ancho > otros["distancia"] + TOLERANCIA
            ):
                raise self._error("La abertura se traslapa con otra.", -32024)
        datos.update({"ancho": ancho, "alto": alto})
        self._guardar_pset(
            entidad,
            "OPENRVT_Abertura",
            {
                "Distancia": datos["distancia"],
                "Ancho": ancho,
                "Alto": alto,
                "Antepecho": datos["antepecho"],
                "Muro": datos["muro"],
                "Volteado": datos.get("volteado", False),
            },
        )
        self._quitar_representaciones(entidad, "Body")
        geometry_api.assign_representation(
            self.modelo,
            product=entidad,
            representation=self._cuerpo_hueco(
                ancho,
                alto,
                info_muro["espesor"],
                datos["antepecho"],
                datos["distancia"],
                self._desfase_alineacion(info_muro["alineacion"], info_muro["espesor"]),
            ),
        )
        modificados = [entidad]
        relleno = self._relleno_de(entidad)
        if relleno is not None:
            self._regenerar_relleno(relleno, entidad)
            modificados.append(relleno)
        self._regenerar_muro(muro)
        modificados.append(muro)
        return modificados

    def _poligono_de_losa(self, losa: Any) -> list[tuple[float, float]]:
        from ifcopenshell.util.placement import get_local_placement

        try:
            item = losa.Representation.Representations[0].Items[0]
            perfil = item.SweptArea
            curva = perfil.OuterCurve
            puntos = []
            for punto in getattr(curva, "Points", ()) or ():
                coords = list(getattr(punto, "Coordinates", ()))
                if len(coords) >= 2:
                    puntos.append((float(coords[0]), float(coords[1])))
            if len(puntos) >= 3:
                return puntos
        except Exception:
            pass
        return [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]

    def referencias(self) -> dict[str, Any]:
        """Puntos y ejes para los enganches del dibujo en planta."""
        self._exigir_modelo()
        muros = []
        extremos = []
        medios = []
        for muro in self.modelo.by_type("IfcWall"):
            datos = self._datos_muro(muro)
            if datos["longitud"] <= TOLERANCIA_CALCULO:
                continue
            muros.append(
                {
                    "globalid": _gid(muro),
                    "x1": _redondear(datos["x1"]),
                    "y1": _redondear(datos["y1"]),
                    "x2": _redondear(datos["x2"]),
                    "y2": _redondear(datos["y2"]),
                    "espesor": _redondear(datos["espesor"]),
                    "altura": _redondear(datos["altura"]),
                }
            )
            extremos.extend(
                [
                    [_redondear(datos["x1"]), _redondear(datos["y1"])],
                    [_redondear(datos["x2"]), _redondear(datos["y2"])],
                ]
            )
            medios.append(
                [
                    _redondear((datos["x1"] + datos["x2"]) / 2),
                    _redondear((datos["y1"] + datos["y2"]) / 2),
                ]
            )
        ejes = self.ejes_listar()
        intersecciones = []
        for i, a in enumerate(ejes):
            for b in ejes[i + 1 :]:
                punto = self._interseccion(
                    a["x1"], a["y1"], a["x2"], a["y2"], b["x1"], b["y1"], b["x2"], b["y2"]
                )
                if punto is not None:
                    intersecciones.append([_redondear(punto[0]), _redondear(punto[1])])
        return {
            "muros": muros,
            "extremos": extremos,
            "medios": medios,
            "ejes": ejes,
            "intersecciones": intersecciones,
            "reticula": self.ejes_reticula(),
        }

    @staticmethod
    def _interseccion(
        x1: float, y1: float, x2: float, y2: float, x3: float, y3: float, x4: float, y4: float
    ) -> tuple[float, float] | None:
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) <= TOLERANCIA_CALCULO:
            return None
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
        if -TOLERANCIA <= t <= 1 + TOLERANCIA and -TOLERANCIA <= u <= 1 + TOLERANCIA:
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
        return None

    # ------------------------------------------------------------------ validación
    def validar(self) -> list[dict[str, Any]]:
        self._exigir_modelo()
        import logging as _logging

        import ifcopenshell.validate as validate

        problemas: list[dict[str, Any]] = []

        class Captura(_logging.Handler):
            def emit(self, record: _logging.LogRecord) -> None:
                problemas.append(
                    {
                        "nivel": record.levelname,
                        "mensaje": record.getMessage(),
                    }
                )

        logger = _logging.getLogger("openrvt_validacion")
        logger.setLevel(_logging.DEBUG)
        logger.propagate = False
        for h in list(logger.handlers):
            logger.removeHandler(h)
        logger.addHandler(Captura())
        try:
            validate.validate(self.modelo, logger=logger)
        finally:
            for h in list(logger.handlers):
                logger.removeHandler(h)
        return problemas
