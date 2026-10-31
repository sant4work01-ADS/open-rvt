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

from . import uniones

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

# O016: restricciones de base y tope por nivel.
PSET_RESTRICCIONES = "OPENRVT_Restricciones"


def altura_restringida(
    elev_base: float,
    desf_base: float,
    elev_tope: float | None,
    desf_tope: float,
    altura_sin: float | None,
) -> tuple[float, float]:
    """Devuelve ``(z_inferior, altura)`` de un elemento vertical restringido.

    Función pura, sin IFC: la base sale de su nivel más el desfase y el tope de
    su nivel más su desfase (o de la altura fija si no hay conexión).
    """
    z_inferior = float(elev_base) + float(desf_base)
    if elev_tope is not None:
        altura = float(elev_tope) + float(desf_tope) - z_inferior
    else:
        altura = float(altura_sin or 0.0)
    if altura <= TOLERANCIA_CALCULO:
        raise ValueError("La altura restringida debe ser positiva.")
    return z_inferior, altura


def _gid(entidad: Any) -> str:
    return str(getattr(entidad, "GlobalId", "") or "")


def _nombre(entidad: Any) -> str:
    return str(getattr(entidad, "Name", "") or "")


def _texto(valor: Any) -> str:
    return str(valor or "")


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

    # ------------------------------------------------------------------ restricciones (O016)
    def _nivel_inmediato_superior(self, elevacion: float) -> Any | None:
        superiores = [
            n
            for n in self.modelo.by_type("IfcBuildingStorey")
            if float(n.Elevation or 0.0) > float(elevacion) + TOLERANCIA_CALCULO
        ]
        if not superiores:
            return None
        return min(superiores, key=lambda n: float(n.Elevation or 0.0))

    def _nivel_que_contiene(self, elemento: Any) -> Any | None:
        for rel in getattr(elemento, "ContainedInStructure", ()) or ():
            estructura = getattr(rel, "RelatingStructure", None)
            if estructura is not None and estructura.is_a("IfcBuildingStorey"):
                return estructura
        return None

    def _peralte_de(self, elemento: Any) -> float:
        """Peralte del tipo o de la instancia de un elemento horizontal."""
        tipo = self._tipo_entidad(elemento)
        _alias, seccion, _armado = self._seccion_y_armado(tipo)
        return float(seccion.get("H") or seccion.get("Peralte") or 0.20)

    def _lecho_bajo(self, elemento: Any) -> bool:
        """Las dalas y cerramientos se cuelgan del nivel por su lecho inferior."""
        alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
        return alias in ("dala", "cerramiento")

    def _z_de_elemento(self, elemento: Any) -> float:
        """Cota de referencia vertical (base del muro/columna, lecho de vigas)."""
        import ifcopenshell.util.placement as placement

        if elemento.is_a("IfcColumn"):
            datos = self._leer_pset(elemento, "OPENRVT_Estructura")
            if datos.get("Base") is not None:
                return float(datos.get("Base") or 0.0)
        if elemento.is_a("IfcWall"):
            return float(placement.get_local_placement(elemento.ObjectPlacement)[2][3])
        z = float(placement.get_local_placement(elemento.ObjectPlacement)[2][3])
        if elemento.is_a("IfcFooting"):
            predef = _texto(getattr(elemento, "PredefinedType", ""))
            if predef == "STRIP_FOOTING":
                return z - self._peralte_de(elemento) / 2.0
            if predef != "FOOTING_BEAM":
                return z
        peralte = self._peralte_de(elemento)
        return z - peralte / 2.0 if self._lecho_bajo(elemento) else z + peralte / 2.0

    def _altura_actual(self, elemento: Any) -> float:
        if elemento.is_a("IfcColumn"):
            datos = self._leer_pset(elemento, "OPENRVT_Estructura")
            return float(datos.get("Altura") or 2.60)
        if elemento.is_a("IfcWall"):
            return float(self._datos_muro(elemento)["altura"])
        return self._peralte_de(elemento)

    def _restricciones_de(self, elemento: Any) -> dict[str, Any]:
        """Lee las restricciones; un modelo viejo se interpreta sin pset (tolerante)."""
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        altura_actual = self._altura_actual(elemento)
        if datos:
            base = _texto(datos.get("NivelBase"))
            tope = _texto(datos.get("NivelTope"))
            if base:
                return {
                    "NivelBase": base,
                    "DesfaseBase": float(datos.get("DesfaseBase") or 0.0),
                    "NivelTope": tope,
                    "DesfaseTope": float(datos.get("DesfaseTope") or 0.0),
                    "AlturaSinConexion": float(
                        datos.get("AlturaSinConexion") or altura_actual
                    ),
                }
        nivel = self._nivel_que_contiene(elemento)
        if nivel is None:
            pset = self._leer_pset(elemento, "OPENRVT_Estructura")
            if pset.get("Nivel"):
                nivel = self._nivel_por_gid(_texto(pset["Nivel"]))
        if nivel is None:
            niveles = self.modelo.by_type("IfcBuildingStorey")
            nivel = niveles[0] if niveles else None
        elevacion = float(getattr(nivel, "Elevation", 0.0) or 0.0) if nivel else 0.0
        z = self._z_de_elemento(elemento)
        return {
            "NivelBase": _gid(nivel) if nivel is not None else "",
            "DesfaseBase": z - elevacion,
            "NivelTope": "",
            "DesfaseTope": 0.0,
            "AlturaSinConexion": altura_actual,
        }

    def _validar_altura_muro(self, muro: Any, altura: float) -> None:
        for _vano, info in self._aberturas_del_muro(muro):
            if info["antepecho"] + info["alto"] > altura + TOLERANCIA:
                raise self._error(
                    "La nueva altura deja una abertura fuera del muro.", -32023
                )

    def _revertir_instantanea(self) -> None:
        if self._deshacer:
            self.modelo = ifcopenshell.file.from_string(self._deshacer.pop())

    def _aplicar_restriccion(self, elemento: Any, restriccion: dict[str, Any]) -> None:
        """Recalcula z y altura de un muro o columna desde sus restricciones."""
        # O026: conserva los datos de alineación guardados en el mismo pset.
        restriccion = {
            **self._leer_pset(elemento, PSET_RESTRICCIONES),
            **restriccion,
        }
        nivel_base = self._nivel_por_gid(_texto(restriccion.get("NivelBase")))
        elev_base = float(nivel_base.Elevation or 0.0)
        tope = _texto(restriccion.get("NivelTope"))
        elev_tope = None
        if tope:
            nivel_tope = self._nivel_por_gid(tope)
            elev_tope = float(nivel_tope.Elevation or 0.0)
        z, altura = altura_restringida(
            elev_base,
            float(restriccion.get("DesfaseBase") or 0.0),
            elev_tope,
            float(restriccion.get("DesfaseTope") or 0.0),
            float(restriccion.get("AlturaSinConexion") or 0.0),
        )
        if elemento.is_a("IfcWall"):
            self._validar_altura_muro(elemento, altura)
            datos = self._datos_muro(elemento)
            matriz = np.array(
                [
                    [datos["dx"], -datos["dy"], 0.0, datos["x1"]],
                    [datos["dy"], datos["dx"], 0.0, datos["y1"]],
                    [0.0, 0.0, 1.0, z],
                    [0.0, 0.0, 0.0, 1.0],
                ]
            )
            geometry_api.edit_object_placement(self.modelo, product=elemento, matrix=matriz)
            pset = self._leer_pset(elemento, "OPENRVT_Muro")
            if pset:
                pset["Altura"] = altura
                self._guardar_pset(elemento, "OPENRVT_Muro", pset)
            self._guardar_pset(elemento, PSET_RESTRICCIONES, restriccion)
            self._regenerar_muro(elemento)
        elif elemento.is_a("IfcColumn"):
            datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
            datos["Base"] = z
            datos["Altura"] = altura
            datos["NivelSuperior"] = tope
            self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
            self._guardar_pset(elemento, PSET_RESTRICCIONES, restriccion)
            self._regenerar_estructura(elemento)
        elif elemento.is_a("IfcBeam") or elemento.is_a("IfcFooting"):
            # O028: trabes, cerramientos, dalas, contratrabes y zapatas siguen al
            # nivel. Para las piezas horizontales el desfase se mide al lecho de
            # referencia (tope salvo dala/cerramiento) y el peralte sale del tipo.
            predef = _texto(getattr(elemento, "PredefinedType", ""))
            datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
            peralte = self._peralte_de(elemento)
            if elemento.is_a("IfcFooting") and predef not in ("FOOTING_BEAM", "STRIP_FOOTING"):
                datos["Z"] = z
                datos["Desplante"] = float(nivel_base.Elevation or 0.0) - z
            elif elemento.is_a("IfcFooting") and predef == "STRIP_FOOTING":
                datos["Z"] = z + peralte / 2.0
                datos["Desplante"] = float(nivel_base.Elevation or 0.0) - z
            else:
                centro = z + peralte / 2.0 if self._lecho_bajo(elemento) else z - peralte / 2.0
                datos["Z"] = centro
                datos["Desfase"] = z - float(nivel_base.Elevation or 0.0)
            self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
            self._guardar_pset(elemento, PSET_RESTRICCIONES, restriccion)
            self._regenerar_estructura(elemento)

    def _recalcular_restricciones(self, niveles: set[str]) -> list[Any]:
        """Recalcula los elementos ligados a cualquiera de esos niveles."""
        modificados: list[Any] = []
        elementos = (
            self.modelo.by_type("IfcWall")
            + self.modelo.by_type("IfcColumn")
            + self.modelo.by_type("IfcBeam")
            + self.modelo.by_type("IfcFooting")
        )
        for elemento in elementos:
            # O028: vigas y zapatas importadas (sin datos de OPEN-RVT) no se
            # regeneran; las mueve el desplazamiento genérico del nivel.
            if (elemento.is_a("IfcBeam") or elemento.is_a("IfcFooting")) and not self._leer_pset(
                elemento, "OPENRVT_Estructura"
            ):
                continue
            restriccion = self._restricciones_de(elemento)
            if (
                restriccion["NivelBase"] in niveles
                or restriccion["NivelTope"] in niveles
            ):
                self._aplicar_restriccion(elemento, restriccion)
                modificados.append(elemento)
        return modificados

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
    def _niveles_ordenados(self) -> list[Any]:
        niveles = [n for n in self.modelo.by_type("IfcBuildingStorey") if n.Elevation is not None]
        niveles.sort(key=lambda n: float(n.Elevation or 0.0))
        return niveles

    def _nombre_nivel_automatico(self, elevacion: float) -> str:
        """O029: nombre por posición, p. ej. entre «Nivel 1» y «Nivel 2» a 1.50
        sale «Nivel 1.5»; sobre el nivel más alto, el siguiente número libre."""
        import re

        def numero(nombre: str):
            m = re.match(r"^nivel\s+(-?\d+(?:\.\d+)?)(?![0-9.])", nombre.strip(), re.I)
            return float(m.group(1)) if m else None

        niveles = [
            n for n in self.modelo.by_type("IfcBuildingStorey") if n.Elevation is not None
        ]
        ordenados = sorted(niveles, key=lambda n: float(n.Elevation or 0.0))
        inferiores = [n for n in ordenados if float(n.Elevation or 0.0) < elevacion - 1e-6]
        superiores = [n for n in ordenados if float(n.Elevation or 0.0) > elevacion + 1e-6]
        inferior = inferiores[-1] if inferiores else None
        superior = superiores[0] if superiores else None
        usados = {_nombre(n).strip().lower() for n in niveles}
        if inferior is not None and superior is not None:
            n_inf = numero(_nombre(inferior))
            n_sup = numero(_nombre(superior))
            if n_inf is not None and n_sup is not None and n_sup > n_inf + 1e-9:
                bajo, alto = n_inf, n_sup
                for _ in range(12):
                    medio = round(((bajo + alto) / 2) * 1000) / 1000
                    nombre = f"Nivel {medio:g}"
                    if nombre.strip().lower() not in usados:
                        return nombre
                    bajo = medio
        numeros = [v for v in (numero(_nombre(n)) for n in niveles) if v is not None]
        if numeros:
            return f"Nivel {max(numeros) + 1:g}"
        return f"Nivel {len(niveles)}"

    def _nombre_nivel_unico(self, nombre: str) -> str:
        """O029: dos niveles no comparten nombre; se añade « (2)», « (3)»…"""
        existentes = {_nombre(n) for n in self.modelo.by_type("IfcBuildingStorey")}
        if nombre not in existentes:
            return nombre
        i = 2
        while f"{nombre} ({i})" in existentes:
            i += 1
        return f"{nombre} ({i})"

    def _validar_elevacion_nivel(self, elevacion: float, excluir: str = "") -> None:
        """O029: dos niveles a la misma elevación (±1 mm) no se permiten."""
        for nivel in self.modelo.by_type("IfcBuildingStorey"):
            if _gid(nivel) == excluir or nivel.Elevation is None:
                continue
            if abs(float(nivel.Elevation) - elevacion) <= 0.001:
                raise self._error(
                    f"Ya existe el nivel «{_nombre(nivel)}» a la misma elevación "
                    f"({elevacion:.3f} m).",
                    -32022,
                )

    def _crear_vista_planta(self, nivel: Any) -> dict[str, Any] | None:
        """O029: la vista de planta del nivel se crea en el mismo paso (y el mismo Deshacer)."""
        gid = _gid(nivel)
        vistas = self.leer_vistas()
        if any(v.get("tipo") == "planta" and v.get("nivel") == gid for v in vistas if isinstance(v, dict)):
            return None
        elevacion = float(nivel.Elevation or 0.0)
        inferiores = [
            float(n.Elevation)
            for n in self.modelo.by_type("IfcBuildingStorey")
            if n.Elevation is not None and float(n.Elevation) < elevacion - 1e-9
        ]
        inferior = max(inferiores) if inferiores else elevacion - 1.0
        vista = {
            "id": f"planta-{gid}",
            "nombre": f"Planta {_nombre(nivel)}",
            "tipo": "planta",
            "nivel": gid,
            "alturaPlano": elevacion + 1.2,
            "profundidad": inferior,
            "nivelesVisibles": [gid],
            "categorias": {
                "muros": True,
                "losas": True,
                "columnas": True,
                "vigas": True,
                "puertas": True,
                "ventanas": True,
                "cubiertas": True,
                "escaleras": True,
                "otros": True,
            },
            "estilo": "lineas-ocultas",
            "escala": 100,
            "alturaArriba": 3,
            "cotasEjes": True,
        }
        self._guardar_datos_pset(
            self._pset_vistas(crear=True),
            [*vistas, vista],
            "JSON de las vistas",
        )
        return vista

    def _crear_nivel_sin_instantanea(
        self,
        nombre: str,
        elevacion: float,
        crear_planta: bool = True,
    ) -> tuple[Any, dict[str, Any] | None]:
        nombre = (nombre or "").strip()
        if not nombre:
            raise self._error("El nivel necesita un nombre.", -32602)
        try:
            elevacion = float(elevacion)
        except (TypeError, ValueError) as exc:
            raise self._error("La elevación del nivel no es un número.", -32602) from exc
        if not math.isfinite(elevacion):
            raise self._error("La elevación del nivel no es un número.", -32602)
        self._validar_elevacion_nivel(elevacion)
        nombre = self._nombre_nivel_unico(nombre)
        nivel = root.create_entity(self.modelo, ifc_class="IfcBuildingStorey", name=nombre)
        nivel.Elevation = elevacion
        aggregate.assign_object(self.modelo, products=[nivel], relating_object=self._edificio())
        vista = self._crear_vista_planta(nivel) if crear_planta else None
        return nivel, vista

    def nivel_crear(
        self,
        nombre: str,
        elevacion: float,
        crear_planta: bool = True,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        self._instantanea()
        try:
            nivel, vista = self._crear_nivel_sin_instantanea(
                nombre, elevacion, bool(crear_planta)
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            [nivel],
            mensaje=f"Nivel «{_nombre(nivel)}» creado.",
            nivel={"globalid": _gid(nivel), "nombre": _nombre(nivel), "elevacion": nivel.Elevation},
            vista=vista,
        )

    def nivel_copiar(
        self,
        globalid: str,
        desfase: float,
        crear_planta: bool = True,
    ) -> dict[str, Any]:
        """O029: Copiar/Desfasar un nivel con un desfase vertical, en un solo paso."""
        self._exigir_modelo()
        origen = self._nivel_por_gid(globalid)
        try:
            desfase = float(desfase)
        except (TypeError, ValueError) as exc:
            raise self._error("El desfase del nivel no es un número.", -32602) from exc
        if not math.isfinite(desfase) or abs(desfase) <= 0.001:
            raise self._error("El desfase del nivel debe ser distinto de cero.", -32602)
        elevacion = float(origen.Elevation or 0.0) + desfase
        self._instantanea()
        try:
            nivel, vista = self._crear_nivel_sin_instantanea(
                self._nombre_nivel_automatico(elevacion), elevacion, bool(crear_planta)
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            [nivel],
            mensaje=f"Nivel «{_nombre(nivel)}» copiado a {elevacion:.3f} m.",
            nivel={"globalid": _gid(nivel), "nombre": _nombre(nivel), "elevacion": nivel.Elevation},
            vista=vista,
        )

    def niveles_arreglo(
        self,
        globalid: str,
        cantidad: int,
        separacion: float,
        crear_planta: bool = True,
    ) -> dict[str, Any]:
        """O029: arreglo de N niveles a separación fija sobre un nivel base."""
        self._exigir_modelo()
        origen = self._nivel_por_gid(globalid)
        try:
            cantidad = int(cantidad)
            separacion = float(separacion)
        except (TypeError, ValueError) as exc:
            raise self._error("El arreglo de niveles necesita números.", -32602) from exc
        if cantidad < 1 or cantidad > 50:
            raise self._error("El arreglo debe tener entre 1 y 50 niveles.", -32602)
        if not math.isfinite(separacion) or abs(separacion) <= 0.001:
            raise self._error("La separación del arreglo debe ser distinta de cero.", -32602)
        base = float(origen.Elevation or 0.0)
        self._instantanea()
        creados: list[Any] = []
        vistas: list[dict[str, Any]] = []
        try:
            for i in range(1, cantidad + 1):
                nivel, vista = self._crear_nivel_sin_instantanea(
                    self._nombre_nivel_automatico(base + separacion * i),
                    base + separacion * i,
                    bool(crear_planta),
                )
                creados.append(nivel)
                if vista is not None:
                    vistas.append(vista)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            creados,
            mensaje=f"{cantidad} nivel(es) creados cada {separacion:.2f} m.",
            vista=vistas or None,
        )

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
        try:
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
                # O016: además de los contenidos, se recalculan los elementos cuya base o
                # tope apunta a este nivel, en la misma instantánea.
                modificados.extend(self._recalcular_restricciones({_gid(nivel)}))
        except Exception:
            self._revertir_instantanea()
            raise
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

    # ------------------------------------------------------------------ alinear (O026)
    def _linea_de(self, entidad: Any) -> tuple[float, float, float, float, float]:
        """Eje medio en planta y medio ancho perpendicular de un elemento."""
        if entidad.is_a("IfcWall"):
            datos = self._datos_muro(entidad)
            largo = math.hypot(datos["dx"], datos["dy"]) or 1.0
            return (
                datos["x1"],
                datos["y1"],
                datos["dx"] / largo,
                datos["dy"] / largo,
                float(datos["espesor"]) / 2.0,
            )
        if entidad.is_a("IfcSlab"):
            contorno = _texto(self._leer_pset(entidad, "OPENRVT_Losa").get("Contorno"))
            try:
                from shapely import wkt as shapely_wkt

                poligono = shapely_wkt.loads(contorno)
                x1, y1, x2, y2 = poligono.bounds
                anillo = list(poligono.exterior.coords)
                dx = float(anillo[1][0]) - float(anillo[0][0])
                dy = float(anillo[1][1]) - float(anillo[0][1])
                largo = math.hypot(dx, dy) or 1.0
                return (
                    (x1 + x2) / 2.0,
                    (y1 + y2) / 2.0,
                    dx / largo,
                    dy / largo,
                    min(x2 - x1, y2 - y1) / 2.0,
                )
            except Exception as exc:  # pragma: no cover - contorno ajeno
                raise self._error("La losa no tiene un contorno editable.", -32028) from exc
        datos = self._leer_pset(entidad, "OPENRVT_Estructura")
        if entidad.is_a("IfcColumn"):
            x = float(datos.get("X") or 0.0)
            y = float(datos.get("Y") or 0.0)
            rotacion = float(datos.get("Rotacion") or 0.0)
            ux, uy = math.cos(rotacion), math.sin(rotacion)
            _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(entidad))
            ancho = float(seccion.get("B") or seccion.get("Ancho") or 0.30)
            alto = float(seccion.get("H") or seccion.get("Largo") or 0.30)
            return x, y, ux, uy, alto / 2.0
        if entidad.is_a("IfcBeam") or entidad.is_a("IfcFooting"):
            x1 = float(datos.get("X1") or datos.get("X") or 0.0)
            y1 = float(datos.get("Y1") or datos.get("Y") or 0.0)
            x2 = float(datos.get("X2") or x1)
            y2 = float(datos.get("Y2") or y1)
            dx, dy = x2 - x1, y2 - y1
            largo = math.hypot(dx, dy)
            if largo <= TOLERANCIA_CALCULO:
                rotacion = float(datos.get("Rotacion") or 0.0)
                dx, dy = math.cos(rotacion), math.sin(rotacion)
                largo = 1.0
            _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(entidad))
            ancho = float(
                seccion.get("B")
                or seccion.get("Ancho")
                or seccion.get("Largo")
                or 0.30
            )
            return x1, y1, dx / largo, dy / largo, ancho / 2.0
        raise self._error("Ese elemento no se puede alinear.", -32602)

    def _linea_referencia(self, referencia: Any) -> tuple[float, float, float, float, str]:
        """Punto, dirección y tipo de la línea de referencia de una alineación."""
        if isinstance(referencia, str):
            referencia = {"tipo": "eje", "globalid": referencia}
        if not isinstance(referencia, dict):
            raise self._error("La referencia de la alineación no es válida.", -32602)
        tipo = _texto(referencia.get("tipo") or "eje").casefold()
        gid = _texto(referencia.get("globalid") or referencia.get("id") or "")
        cara = _texto(referencia.get("cara") or "centro").casefold()
        if tipo == "eje":
            _grid, eje = self._eje_por_gid(gid)
            x1, y1, _x2, _y2, ux, uy, _largo = self._direccion_eje(eje)
            return x1, y1, ux, uy, "eje"
        if tipo == "nivel":
            self._nivel_por_gid(gid)
            return 0.0, 0.0, 1.0, 0.0, "nivel"
        entidad = self._entidad_por_gid(gid)
        x, y, ux, uy, medio = self._linea_de(entidad)
        if cara in ("cara1", "derecha", "positiva"):
            nx, ny = uy, -ux
            x, y = x + nx * medio, y + ny * medio
        elif cara in ("cara2", "izquierda", "negativa"):
            nx, ny = uy, -ux
            x, y = x - nx * medio, y - ny * medio
        return x, y, ux, uy, "elemento"

    @staticmethod
    def _alineacion_bloqueada(datos: dict[str, Any]) -> bool:
        return datos.get("AlinearBloqueada") in (True, "True", "true", 1, "1")

    def _alineados_de(self, referencia_gid: str) -> list[Any]:
        """Elementos con candado cerrado sobre esa referencia."""
        salida: list[Any] = []
        for clase in ("IfcWall", "IfcColumn", "IfcBeam", "IfcFooting", "IfcSlab"):
            for entidad in self.modelo.by_type(clase):
                datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
                if not self._alineacion_bloqueada(datos):
                    continue
                if _texto(datos.get("AlinearReferencia")) != referencia_gid:
                    continue
                salida.append(entidad)
        return salida

    def _mover_alineados_de_referencia(
        self, referencia_gid: str, dx: float, dy: float, excluir: set[str] | None = None
    ) -> list[Any]:
        """O026: los elementos con candado siguen a su referencia."""
        excluir = excluir or set()
        movidos: list[Any] = []
        for entidad in self._alineados_de(referencia_gid):
            gid = _gid(entidad)
            if gid in excluir:
                continue
            for producto in self._productos_de(gid):
                self._mover_productos([producto], dx, dy, 0.0)
                self._desplazar_pset_estructura(producto, dx, dy, 0.0)
            if entidad.is_a("IfcWall"):
                self._unir_muros(entidad)
                self._actualizar_dependientes_muro(entidad)
            movidos.append(entidad)
        return movidos

    def alinear(
        self,
        referencia: Any,
        elemento: str,
        cara: str = "cercana",
        bloquear: bool = False,
    ) -> dict[str, Any]:
        """O026: alinea un elemento con un eje, nivel o cara de otro elemento."""
        self._exigir_modelo()
        if not elemento:
            raise self._error("Seleccione el elemento que quiere alinear.", -32602)
        entidad = self._entidad_por_gid(str(elemento))
        if not (
            entidad.is_a("IfcWall")
            or entidad.is_a("IfcColumn")
            or entidad.is_a("IfcBeam")
            or entidad.is_a("IfcFooting")
            or entidad.is_a("IfcSlab")
        ):
            raise self._error("Ese elemento no se puede alinear.", -32602)
        cara = _texto(cara or "cercana").casefold()
        rx, ry, rux, ruy, tipo_ref = self._linea_referencia(referencia)
        datos_ref = referencia if isinstance(referencia, dict) else {}
        ref_gid = _texto(datos_ref.get("globalid") or datos_ref.get("id") or referencia)
        if tipo_ref == "nivel":
            cara_nivel = cara if cara in ("base", "tope") else "base"
            if cara_nivel == "tope":
                resultado = self.restricciones_editar(str(elemento), nivel_tope=ref_gid)
            else:
                resultado = self.restricciones_editar(str(elemento), nivel_base=ref_gid)
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            datos.update(
                {
                    "AlinearTipo": "nivel",
                    "AlinearReferencia": ref_gid,
                    "AlinearCara": cara_nivel,
                    "AlinearBloqueada": bool(bloquear),
                }
            )
            self._guardar_pset(entidad, PSET_RESTRICCIONES, datos)
            salida = dict(resultado)
            salida["alineacion"] = {
                "elemento": str(elemento),
                "referencia": ref_gid,
                "tipo": "nivel",
                "cara": cara_nivel,
                "bloqueada": bool(bloquear),
            }
            return salida
        if ref_gid and ref_gid == str(elemento):
            raise self._error("La referencia y el elemento deben ser distintos.", -32602)
        ex, ey, eux, euy, medio = self._linea_de(entidad)
        if abs(rux * euy - ruy * eux) > 1e-6 and (
            entidad.is_a("IfcColumn") or entidad.is_a("IfcFooting")
        ):
            # Una columna o zapata rectangular tiene dos pares de caras: se usa el
            # par paralelo a la referencia (el otro eje local).
            otro_medio = medio
            if entidad.is_a("IfcColumn"):
                _s, seccion, _a = self._seccion_y_armado(self._tipo_entidad(entidad))
                otro_medio = float(seccion.get("B") or seccion.get("Ancho") or 0.30) / 2.0
            eux, euy = -euy, eux
            medio = otro_medio
        if abs(rux * euy - ruy * eux) > 1e-6:
            raise self._error(
                "La cara del elemento no es paralela a la referencia; no se movió nada.",
                -32027,
            )
        nx, ny = ruy, -rux
        s_ref = rx * nx + ry * ny
        s_elemento = ex * nx + ey * ny
        if cara in ("centro", "eje"):
            objetivo = s_ref
        elif cara in ("cara1", "derecha", "positiva"):
            objetivo = s_ref + medio
        elif cara in ("cara2", "izquierda", "negativa"):
            objetivo = s_ref - medio
        else:
            # Cara más cercana: el elemento queda del mismo lado que ya estaba.
            lado = 1.0 if s_elemento >= s_ref else -1.0
            objetivo = s_ref + lado * medio
        delta = objetivo - s_elemento
        self._instantanea()
        try:
            if abs(delta) > TOLERANCIA_CALCULO:
                for producto in self._productos_de(str(elemento)):
                    self._mover_productos([producto], nx * delta, ny * delta, 0.0)
                    self._desplazar_pset_estructura(producto, nx * delta, ny * delta, 0.0)
                if entidad.is_a("IfcWall"):
                    self._unir_muros(entidad)
                    self._actualizar_dependientes_muro(entidad)
                elif entidad.is_a("IfcColumn"):
                    for zapata in self._zapatas_de_columna(entidad):
                        self._mover_productos([zapata], nx * delta, ny * delta, 0.0)
            self._recalcular_uniones_estructura()
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            datos.update(
                {
                    "AlinearTipo": tipo_ref,
                    "AlinearReferencia": ref_gid,
                    "AlinearCara": cara,
                    "AlinearBloqueada": bool(bloquear),
                }
            )
            self._guardar_pset(entidad, PSET_RESTRICCIONES, datos)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=[entidad],
            mensaje=(
                "Elemento alineado."
                if abs(delta) > TOLERANCIA_CALCULO
                else "El elemento ya estaba alineado."
            ),
            desplazamiento=delta,
            alineacion={
                "elemento": str(elemento),
                "referencia": ref_gid,
                "tipo": tipo_ref,
                "cara": cara,
                "bloqueada": bool(bloquear),
            },
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
        try:
            modificados: list[Any] = [nivel_superior]
            nivel_superior.Elevation = destino
            cambiados = {_gid(nivel_superior)}
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
                    cambiados.add(_gid(nivel))
                    if abs(delta) > TOLERANCIA_CALCULO:
                        modificados.extend(self._mover_elementos_nivel(nivel, delta))
            modificados.extend(self._recalcular_restricciones(cambiados))
        except Exception:
            self._revertir_instantanea()
            raise
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
        gid_nivel = _gid(nivel)
        ligados = []
        for elemento in (
            self.modelo.by_type("IfcWall")
            + self.modelo.by_type("IfcColumn")
            + self.modelo.by_type("IfcBeam")
            + self.modelo.by_type("IfcFooting")
        ):
            restriccion = self._restricciones_de(elemento)
            if gid_nivel in (restriccion["NivelBase"], restriccion["NivelTope"]):
                ligados.append(_nombre(elemento) or elemento.is_a())
        if ligados:
            raise self._error(
                f"El nivel «{_nombre(nivel)}» lo usan {len(ligados)} elemento(s) como "
                "base o tope: " + ", ".join(ligados) + ". Cámbielos antes de borrar el nivel.",
                -32021,
            )
        self._instantanea()
        gid = _gid(nivel)
        self.modelo.remove(nivel)
        self.con_cambios = True
        return self._resultado(borrados=[gid], mensaje="Nivel borrado.")

    def restricciones_editar(
        self,
        globalid: str,
        nivel_base: str | None = None,
        desfase_base: float | None = None,
        nivel_tope: str | None = None,
        desfase_tope: float | None = None,
        altura_sin_conexion: float | None = None,
    ) -> dict[str, Any]:
        """O016: cambia base/tope de un muro o columna en una sola instantánea."""
        self._exigir_modelo()
        entidad = self._entidad_por_gid(globalid, ("IfcWall", "IfcColumn"))
        if not (entidad.is_a("IfcWall") or entidad.is_a("IfcColumn")):
            raise self._error("Solo los muros y las columnas admiten restricciones.", -32602)
        restriccion = dict(self._restricciones_de(entidad))
        if nivel_base is not None:
            nivel = self._nivel_por_gid(str(nivel_base))
            restriccion["NivelBase"] = _gid(nivel)
        if desfase_base is not None:
            try:
                restriccion["DesfaseBase"] = float(desfase_base)
            except (TypeError, ValueError) as exc:
                raise self._error("El desfase de base no es un número.", -32602) from exc
        if nivel_tope is not None:
            if _texto(nivel_tope):
                nivel = self._nivel_por_gid(str(nivel_tope))
                restriccion["NivelTope"] = _gid(nivel)
            else:
                restriccion["NivelTope"] = ""
        if desfase_tope is not None:
            try:
                restriccion["DesfaseTope"] = float(desfase_tope)
            except (TypeError, ValueError) as exc:
                raise self._error("El desfase de tope no es un número.", -32602) from exc
        if altura_sin_conexion is not None:
            try:
                restriccion["AlturaSinConexion"] = float(altura_sin_conexion)
            except (TypeError, ValueError) as exc:
                raise self._error(
                    "La altura sin conexión no es un número.", -32602
                ) from exc
        nivel_base_entidad = self._nivel_por_gid(restriccion["NivelBase"])
        elev_base = float(nivel_base_entidad.Elevation or 0.0)
        elev_tope = None
        if restriccion["NivelTope"]:
            elev_tope = float(
                self._nivel_por_gid(restriccion["NivelTope"]).Elevation or 0.0
            )
        try:
            altura_restringida(
                elev_base,
                restriccion["DesfaseBase"],
                elev_tope,
                restriccion["DesfaseTope"],
                restriccion["AlturaSinConexion"],
            )
        except ValueError as exc:
            raise self._error(str(exc), -32602) from exc
        self._instantanea()
        try:
            self._aplicar_restriccion(entidad, restriccion)
            spatial_api.assign_container(
                self.modelo, products=[entidad], relating_structure=nivel_base_entidad
            )
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=[entidad], mensaje="Restricciones actualizadas."
        )

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
        self, enlace: dict[str, Any]
    ) -> tuple[float, float, float, float]:
        guia = _texto(enlace.get("EnlaceEjeGuia"))
        gx, gy, ux, uy = self._direccion_de_eje(guia)
        nx, ny = -uy, ux
        desfase = float(enlace.get("EnlaceDesfase") or 0.0)
        inicio = self._cruce_de_ejes(guia, _texto(enlace.get("EnlaceEjeInicio")))
        fin = self._cruce_de_ejes(guia, _texto(enlace.get("EnlaceEjeFin")))
        di = float(enlace.get("EnlaceDesfaseInicio") or 0.0)
        df = float(enlace.get("EnlaceDesfaseFin") or 0.0)
        return (
            inicio[0] + nx * desfase + ux * di,
            inicio[1] + ny * desfase + uy * di,
            fin[0] + nx * desfase + ux * df,
            fin[1] + ny * desfase + uy * df,
        )

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
            x1, y1, x2, y2 = self._extremos_tramo(enlace)
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
        gx, gy, ux, uy = self._direccion_de_eje(str(eje_guia))
        nx, ny = -uy, ux
        inicio = self._cruce_de_ejes(str(eje_guia), str(eje_inicio))
        fin = self._cruce_de_ejes(str(eje_guia), str(eje_fin))
        x1, y1, x2, y2 = self._extremos_de_elemento(entidad)
        if desfase is None:
            desfase = ((x1 + x2) / 2.0 - gx) * nx + ((y1 + y2) / 2.0 - gy) * ny
        if desfase_inicio is None:
            desfase_inicio = (x1 - inicio[0]) * ux + (y1 - inicio[1]) * uy
        if desfase_fin is None:
            desfase_fin = (x2 - fin[0]) * ux + (y2 - fin[1]) * uy
        self._instantanea()
        try:
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            datos.update(
                {
                    "EnlaceTipo": "tramo",
                    "EnlaceEjeGuia": _texto(eje_guia),
                    "EnlaceEjeInicio": _texto(eje_inicio),
                    "EnlaceEjeFin": _texto(eje_fin),
                    "EnlaceDesfase": float(desfase),
                    "EnlaceDesfaseInicio": float(desfase_inicio),
                    "EnlaceDesfaseFin": float(desfase_fin),
                }
            )
            self._guardar_pset(entidad, PSET_RESTRICCIONES, datos)
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
        soltados = self._soltar_enlaces_de_eje(globalid)
        grid_api.remove_grid_axis(self.modelo, axis=eje)
        self.con_cambios = True
        mensaje = "Eje borrado."
        if soltados:
            mensaje += " Se soltaron: " + ", ".join(soltados) + "."
        return self._resultado(borrados=[globalid], mensaje=mensaje, soltados=soltados)

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
        # O007c: las columnas ligadas al eje se mueven con él (y sus zapatas).
        modificados = [globalid]
        columnas = self._mover_columnas_de_eje(globalid, nx, ny, desplazamiento)
        modificados.extend(_gid(e) for e in columnas)
        # O026: los elementos con candado cerrado siguen a su eje de referencia.
        modificados.extend(
            _gid(e)
            for e in self._mover_alineados_de_referencia(
                globalid,
                nx * desplazamiento,
                ny * desplazamiento,
                {_gid(e) for e in columnas},
            )
        )
        # O028: los enlaces a cruces y tramos se recalculan con la posición nueva.
        modificados.extend(_gid(e) for e in self._propagar_enlaces_de_eje(globalid))
        self.con_cambios = True
        return self._resultado(
            modificados=modificados,
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
        modificados.extend(
            _gid(e) for e in self._mover_columnas_de_eje(mover, nx, ny, delta)
        )
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
                    gid_candidato = self._id_eje(grid, candidato)
                    modificados.append(gid_candidato)
                    modificados.extend(
                        _gid(e) for e in self._mover_columnas_de_eje(
                            gid_candidato, nx, ny, delta
                        )
                    )
        # O006d: al cambiar una separación se recalculan los extremos de la otra familia.
        self._recalcular_reticula(grid)
        # O026: los elementos con candado siguen a cada eje desplazado.
        movidos = set()
        for gid_eje in list(dict.fromkeys(modificados)):
            if gid_eje in movidos:
                continue
            movidos.add(gid_eje)
            modificados.extend(
                _gid(e)
                for e in self._mover_alineados_de_referencia(
                    gid_eje, nx * delta, ny * delta
                )
            )
            modificados.extend(
                _gid(e) for e in self._propagar_enlaces_de_eje(gid_eje)
            )
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
        """O010/O012b: cuerpo del muro con esquinas ingleteadas y jerarquía.

        En planta el muro termina en las caras de castillos y columnas. En alzado
        su base arranca en la cara superior de la contratrabe, la dala o la losa
        que lo soporta, y su corona se recorta en la cara inferior del cerramiento
        o de la losa que lo cubre.
        """
        datos = self._datos_muro(muro)
        poligonos = self._huellas_muro(muro, datos)
        base, cima = self._limites_verticales_muro(muro, datos)
        offset_z = base - datos["z"]
        alto = max(cima - base, 0.001)
        items = []
        temporales = []
        for poligono in poligonos:
            rep = geometry_api.add_slab_representation(
                self.modelo,
                context=self._contexto(),
                depth=alto,
                direction_sense="POSITIVE",
                offset=offset_z,
                polyline=poligono,
            )
            temporales.append(rep)
            items.extend(rep.Items)
        # La representación final es una sola con todos los tramos del muro.
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

    def _huellas_muro(
        self, muro: Any, datos: dict[str, Any] | None = None
    ) -> list[list[tuple[float, float]]]:
        """Huellas locales del muro recortadas en las caras de columnas y castillos."""
        from shapely.geometry import Polygon

        datos = datos or self._datos_muro(muro)
        offset = self._desfase_de_muro(muro, datos["espesor"])
        poligono = self._huella_local_muro(muro, datos, offset)
        if len(poligono) < 3:
            return [poligono]
        huella = Polygon([self._punto_local(datos, u, v) for u, v in poligono])
        if not huella.is_valid:
            huella = huella.buffer(0)
        z0 = datos["z"]
        z1 = z0 + datos["altura"]
        for columna in self.modelo.by_type("IfcColumn"):
            barra = self._barra_de_elemento(columna)
            if barra is None:
                continue
            if min(z1, barra.z1) - max(z0, barra.z0) <= TOLERANCIA_CALCULO:
                continue
            recorte = Polygon(uniones.huella(barra))
            if not recorte.is_valid:
                recorte = recorte.buffer(0)
            if not huella.intersects(recorte):
                continue
            huella = huella.difference(recorte)
            if huella.is_empty:
                break
        if huella.is_empty:
            return [poligono]
        piezas = [huella] if huella.geom_type == "Polygon" else list(huella.geoms)
        salida: list[list[tuple[float, float]]] = []
        for pieza in piezas:
            if pieza.is_empty or pieza.area <= TOLERANCIA_CALCULO:
                continue
            salida.append(
                [
                    self._punto_en_local(datos, x, y)
                    for x, y in list(pieza.exterior.coords)[:-1]
                ]
            )
        return salida or [poligono]

    def _limites_verticales_muro(
        self, muro: Any, datos: dict[str, Any] | None = None
    ) -> tuple[float, float]:
        """(base, cima) del muro después de apoyarse y cubrirse con otros elementos."""
        from shapely.geometry import Polygon

        datos = datos or self._datos_muro(muro)
        base = float(datos["z"])
        cima = base + float(datos["altura"])
        offset = self._desfase_de_muro(muro, datos["espesor"])
        poligono = self._huella_local_muro(muro, datos, offset)
        huella = Polygon([self._punto_local(datos, u, v) for u, v in poligono])
        if not huella.is_valid:
            huella = huella.buffer(0)
        for elemento in self.modelo.by_type("IfcElement"):
            alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
            if elemento.is_a("IfcSlab"):
                try:
                    datos_losa = self._leer_pset(elemento, "OPENRVT_Losa")
                    if not datos_losa:
                        continue
                    nivel = self._nivel_de_elemento(elemento)
                    zeta1 = float(nivel.Elevation or 0.0) + float(
                        datos_losa.get("Desfase") or 0.0
                    )
                    zeta0 = zeta1 - float(datos_losa.get("Espesor") or 0.12)
                    recorte = self._geometria_losa(elemento)
                except Exception:
                    continue
            elif alias in ("contratrabe", "dala", "cerramiento"):
                barra = self._barra_de_elemento(elemento)
                if barra is None:
                    continue
                zeta0, zeta1 = barra.z0, barra.z1
                recorte = Polygon(uniones.huella(barra))
            else:
                continue
            try:
                if not recorte.is_valid:
                    recorte = recorte.buffer(0)
                if huella.intersection(recorte).area <= TOLERANCIA_CALCULO:
                    continue
            except Exception:
                continue
            if alias in ("contratrabe", "dala") or elemento.is_a("IfcSlab"):
                # Elemento que soporta: la base sube a su cara superior.
                if base + TOLERANCIA_CALCULO < zeta1 < cima - TOLERANCIA_CALCULO:
                    base = max(base, zeta1)
            if alias == "cerramiento" or elemento.is_a("IfcSlab"):
                # Elemento que cubre: la corona baja a su cara inferior.
                if base + TOLERANCIA_CALCULO < zeta0 < cima - TOLERANCIA_CALCULO:
                    cima = min(cima, zeta0)
        if cima - base <= TOLERANCIA_CALCULO:
            return (float(datos["z"]), float(datos["z"]) + float(datos["altura"]))
        return (base, cima)

    # ------------------------------------------------ esquinas de muros (O010)
    @staticmethod
    def _punto_local(datos: dict[str, Any], u: float, v: float) -> tuple[float, float]:
        dx, dy = datos["dx"], datos["dy"]
        return (
            datos["x1"] + dx * u - dy * v,
            datos["y1"] + dy * u + dx * v,
        )

    @staticmethod
    def _punto_en_local(
        datos: dict[str, Any], x: float, y: float
    ) -> tuple[float, float]:
        dx, dy = datos["dx"], datos["dy"]
        wx, wy = x - datos["x1"], y - datos["y1"]
        return (wx * dx + wy * dy, -wx * dy + wy * dx)

    @staticmethod
    def _corta_rectas(
        p1: tuple[float, float],
        n1: tuple[float, float],
        p2: tuple[float, float],
        n2: tuple[float, float],
    ) -> tuple[float, float] | None:
        """Intersección de las rectas n1·x = n1·p1 y n2·x = n2·p2."""
        det = n1[0] * n2[1] - n1[1] * n2[0]
        if abs(det) <= 1e-9:
            return None
        c1 = n1[0] * p1[0] + n1[1] * p1[1]
        c2 = n2[0] * p2[0] + n2[1] * p2[1]
        return (
            (c1 * n2[1] - c2 * n1[1]) / det,
            (n1[0] * c2 - n2[0] * c1) / det,
        )

    def _huella_local_muro(
        self, muro: Any, datos: dict[str, Any], offset: float
    ) -> list[tuple[float, float]]:
        largo = max(datos["longitud"], 0.001)
        espesor = max(datos["espesor"], 0.001)
        bajo, alto = offset, offset + espesor
        # Polígono convexo en coordenadas locales (u a lo largo, v a lo ancho).
        poligono: list[tuple[float, float]] = [
            (0.0, bajo),
            (largo, bajo),
            (largo, alto),
            (0.0, alto),
        ]
        otros = [otro for otro in self.modelo.by_type("IfcWall") if otro != muro]
        x1, y1, x2, y2 = datos["x1"], datos["y1"], datos["x2"], datos["y2"]
        for otro in otros:
            datos_otro = self._datos_muro(otro)
            offset_otro = self._desfase_de_muro(otro, datos_otro["espesor"])
            ox1, oy1 = datos_otro["x1"], datos_otro["y1"]
            ox2, oy2 = datos_otro["x2"], datos_otro["y2"]
            # Unión en L: coinciden los extremos de los dos muros.
            for px, py, fin in ((x1, y1, "ATSTART"), (x2, y2, "ATEND")):
                for qx, qy, fin_otro in (
                    (ox1, oy1, "ATSTART"),
                    (ox2, oy2, "ATEND"),
                ):
                    if math.hypot(px - qx, py - qy) <= TOLERANCIA:
                        poligono = self._ingletear(
                            poligono,
                            datos,
                            offset,
                            datos_otro,
                            offset_otro,
                            fin,
                            fin_otro,
                        )
            # Unión en T: el extremo de este muro llega al interior del otro.
            for px, py, fin in ((x1, y1, "ATSTART"), (x2, y2, "ATEND")):
                proyeccion = self._proyectar_en_eje(px, py, ox1, oy1, ox2, oy2)
                if proyeccion is None:
                    continue
                t, _qx, _qy, separacion = proyeccion
                if not (0.01 < t < 0.99):
                    continue
                if separacion <= max(datos_otro["espesor"], 0.001) / 2.0 + TOLERANCIA:
                    poligono = self._recortar_en_cara(
                        poligono, datos, datos_otro, offset_otro, fin
                    )
        return poligono

    def _ingletear(
        self,
        poligono: list[tuple[float, float]],
        datos: dict[str, Any],
        offset: float,
        datos_otro: dict[str, Any],
        offset_otro: float,
        fin: str,
        fin_otro: str,
    ) -> list[tuple[float, float]]:
        """Corta el extremo del muro con la línea de inglete común a los dos muros."""
        dx, dy = datos["dx"], datos["dy"]
        odx, ody = datos_otro["dx"], datos_otro["dy"]
        # Normal izquierda de cada muro (coordenada v local).
        n = (-dy, dx)
        no = (-ody, odx)
        # Punto de la esquina.
        if fin == "ATEND":
            esquina = (datos["x2"], datos["y2"])
        else:
            esquina = (datos["x1"], datos["y1"])
        # Dirección del otro muro alejándose de la esquina.
        if fin_otro == "ATEND":
            alejado_otro = (-odx, -ody)
        else:
            alejado_otro = (odx, ody)
        # ¿El otro cuerpo queda del lado izquierdo de este muro?
        otro_izquierda = alejado_otro[0] * n[0] + alejado_otro[1] * n[1] >= 0.0
        # Dirección de este muro entrando desde la esquina.
        if fin == "ATEND":
            dentro = (-dx, -dy)
        else:
            dentro = (dx, dy)
        # ¿Este cuerpo queda del lado izquierdo del otro muro?
        este_izquierda = dentro[0] * no[0] + dentro[1] * no[1] >= 0.0

        espesor = max(datos["espesor"], 0.001)
        espesor_otro = max(datos_otro["espesor"], 0.001)
        v_bajo, v_alto = offset, offset + espesor
        v_otro_bajo = offset_otro
        v_otro_alto = offset_otro + espesor_otro
        v_inner = v_alto if otro_izquierda else v_bajo
        v_outer = v_bajo if otro_izquierda else v_alto
        v_otro_inner = v_otro_alto if este_izquierda else v_otro_bajo
        v_otro_outer = v_otro_bajo if este_izquierda else v_otro_alto

        def linea(punto: tuple[float, float], normal: tuple[float, float], v: float):
            # Punto de la recta de la cara v del muro con esa normal.
            return (punto[0] + normal[0] * v, punto[1] + normal[1] * v)

        # Las coordenadas v son distancias sobre la normal, y la recta pasa por el
        # origen local del muro: se usa el punto del extremo correspondiente.
        origen = (datos["x1"], datos["y1"])
        origen_otro = (datos_otro["x1"], datos_otro["y1"])
        p_inner = self._corta_rectas(
            linea(origen, n, v_inner), n, linea(origen_otro, no, v_otro_inner), no
        )
        p_outer = self._corta_rectas(
            linea(origen, n, v_outer), n, linea(origen_otro, no, v_otro_outer), no
        )
        if p_inner is None or p_outer is None:
            return poligono
        # Una esquina sana no puede alejarse más que unos espesores del extremo.
        limite = 3.0 * max(espesor, espesor_otro) + 0.05
        for p in (p_inner, p_outer):
            if math.hypot(p[0] - esquina[0], p[1] - esquina[1]) > limite:
                return poligono
        li = self._punto_en_local(datos, *p_inner)
        lo = self._punto_en_local(datos, *p_outer)
        if fin == "ATEND":
            if otro_izquierda:
                # (largo,bajo) es la cara exterior y (largo,alto) la interior.
                poligono[1] = lo
                poligono[2] = li
            else:
                poligono[1] = li
                poligono[2] = lo
        else:
            if otro_izquierda:
                poligono[3] = li
                poligono[0] = lo
            else:
                poligono[3] = lo
                poligono[0] = li
        return poligono

    def _recortar_en_cara(
        self,
        poligono: list[tuple[float, float]],
        datos: dict[str, Any],
        datos_otro: dict[str, Any],
        offset_otro: float,
        fin: str,
    ) -> list[tuple[float, float]]:
        """Recorta el muro que llega contra la cara próxima del muro pasante."""
        odx, ody = datos_otro["dx"], datos_otro["dy"]
        no = (-ody, odx)
        if fin == "ATEND":
            dentro = (-datos["dx"], -datos["dy"])
        else:
            dentro = (datos["dx"], datos["dy"])
        este_izquierda = dentro[0] * no[0] + dentro[1] * no[1] >= 0.0
        cara = offset_otro + (datos_otro["espesor"] if este_izquierda else 0.0)
        # n·p = c define la cara del muro pasante.
        c = no[0] * datos_otro["x1"] + no[1] * datos_otro["y1"] + cara
        # n·p - c >= 0 es el lado exterior del pasante (el que mira al muro que llega).
        signo = 1.0 if este_izquierda else -1.0
        salida: list[tuple[float, float]] = []
        for i, actual in enumerate(poligono):
            siguiente = poligono[(i + 1) % len(poligono)]
            wa = self._punto_local(datos, *actual)
            wb = self._punto_local(datos, *siguiente)
            da = signo * (no[0] * wa[0] + no[1] * wa[1] - c)
            db = signo * (no[0] * wb[0] + no[1] * wb[1] - c)
            dentro_a = da >= -1e-9
            dentro_b = db >= -1e-9
            if dentro_a:
                salida.append(actual)
            if dentro_a != dentro_b:
                t = da / (da - db)
                u = actual[0] + (siguiente[0] - actual[0]) * t
                v = actual[1] + (siguiente[1] - actual[1]) * t
                salida.append((u, v))
        return salida if len(salida) >= 3 else poligono


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

        elevacion = float(nivel_entidad.Elevation or 0.0)
        superior = self._nivel_inmediato_superior(elevacion)
        restriccion = {
            "NivelBase": _gid(nivel_entidad),
            "DesfaseBase": 0.0,
            "NivelTope": _gid(superior) if superior is not None else "",
            "DesfaseTope": 0.0,
            "AlturaSinConexion": altura,
        }
        if superior is not None:
            elev_tope = float(superior.Elevation or 0.0)
            try:
                _, altura = altura_restringida(elevacion, 0.0, elev_tope, 0.0, altura)
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
            },
        )
        self._guardar_pset(muro, PSET_RESTRICCIONES, restriccion)
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

    # ------------------------------------------------------------------ estructura (O007b)
    def _tipo_estructura(self, tipo: Any, clases: tuple[str, ...]) -> Any:
        texto = _texto(tipo).strip()
        entidad = None
        for candidato in self.modelo.by_type("IfcTypeObject"):
            if _gid(candidato) == texto:
                entidad = candidato
                break
        if entidad is None:
            buscado = texto.casefold()
            for candidato in self.modelo.by_type("IfcTypeObject"):
                if _nombre(candidato).casefold() == buscado:
                    entidad = candidato
                    break
        if entidad is None or not any(entidad.is_a(c) for c in clases):
            esperado = ", ".join(clases)
            raise self._error(
                f"No existe el tipo estructural «{texto}» ({esperado}).", -32020
            )
        if self._estructura_de_tipo(entidad) is None:
            raise self._error(f"El tipo «{texto}» no es de estructura.", -32020)
        return entidad

    @staticmethod
    def _matriz_colocacion(
        x: float, y: float, z: float, rotacion: float
    ) -> np.ndarray:
        coseno, seno = math.cos(rotacion), math.sin(rotacion)
        return np.array(
            [
                [coseno, -seno, 0.0, x],
                [seno, coseno, 0.0, y],
                [0.0, 0.0, 1.0, z],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )

    @staticmethod
    def _matriz_viga(x1: float, y1: float, z: float, ux: float, uy: float) -> np.ndarray:
        return np.array(
            [
                [-uy, 0.0, ux, x1],
                [ux, 0.0, uy, y1],
                [0.0, 1.0, 0.0, z],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )

    @staticmethod
    def _caja_malla(
        ancho: float,
        fondo: float,
        alto: float,
        z0: float = 0.0,
        dx: float = 0.0,
        dy: float = 0.0,
    ) -> tuple[list[list[float]], list[list[int]]]:
        hx, hy = ancho / 2.0, fondo / 2.0
        x0, x1 = dx - hx, dx + hx
        y0, y1 = dy - hy, dy + hy
        z1 = z0 + alto
        vertices = [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        ]
        caras = [
            [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
            [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        ]
        return vertices, caras

    @staticmethod
    def _caja_entre(
        x0: float, x1: float, y0: float, y1: float, z0: float, z1: float
    ) -> tuple[list[list[float]], list[list[int]]]:
        vertices = [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        ]
        caras = [
            [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
            [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        ]
        return vertices, caras

    def _malla_de_cajas(self, cajas: list[tuple[list[list[float]], list[list[int]]]]) -> Any:
        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        for lista, indices in cajas:
            base = len(vertices)
            vertices.extend(lista)
            caras.extend([[i + base for i in cara] for cara in indices])
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        rep.RepresentationIdentifier = "Body"
        return rep

    @staticmethod
    def _cilindro_malla(radio: float, z0: float, alto: float, lados: int = 24):
        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        for i in range(lados):
            angulo = 2.0 * math.pi * i / lados
            vertices.append([radio * math.cos(angulo), radio * math.sin(angulo), z0])
        for i in range(lados):
            angulo = 2.0 * math.pi * i / lados
            vertices.append([radio * math.cos(angulo), radio * math.sin(angulo), z0 + alto])
        for i in range(lados):
            siguiente = (i + 1) % lados
            caras.append([i, siguiente, lados + siguiente, lados + i])
        caras.append(list(range(lados - 1, -1, -1)))
        caras.append(list(range(lados, 2 * lados)))
        return vertices, caras

    def _cuerpo_columna(self, seccion: dict[str, Any], altura: float) -> Any:
        if _texto(seccion.get("Forma") or "rectangular") == "circular":
            vertices, caras = self._cilindro_malla(
                float(seccion.get("D") or 0.3) / 2.0, 0.0, altura
            )
            rep = geometry_api.add_mesh_representation(
                self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
            )
        else:
            rep = self._malla_de_cajas(
                [self._caja_malla(float(seccion.get("B") or 0.15),
                                  float(seccion.get("H") or 0.15), altura)]
            )
        rep.RepresentationIdentifier = "Body"
        return rep

    def _cuerpo_viga(self, seccion: dict[str, Any], largo: float) -> Any:
        b = float(seccion.get("B") or 0.20)
        h = float(seccion.get("H") or 0.40)
        caja = self._caja_entre(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0, 0.0, largo)
        return self._malla_de_cajas([caja])

    def _cuerpo_viga_tramos(
        self, seccion: dict[str, Any], tramos: list[tuple[float, float]]
    ) -> Any:
        """O012: uno o varios prismas en el eje local, ya recortados en las uniones."""
        b = float(seccion.get("B") or 0.20)
        h = float(seccion.get("H") or 0.40)
        cajas = [
            self._caja_entre(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0, a, c)
            for a, c in tramos
            if c - a > TOLERANCIA_CALCULO
        ]
        if not cajas:
            cajas = [self._caja_entre(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0, 0.0, 0.001)]
        return self._malla_de_cajas(cajas)

    def _cuerpo_zapata(self, seccion: dict[str, Any]) -> Any:
        largo = float(seccion.get("Largo") or 1.2)
        ancho = float(seccion.get("Ancho") or 1.2)
        peralte = float(seccion.get("Peralte") or 0.25)
        plantilla = float(seccion.get("Plantilla") or 0.05)
        dado_b = float(seccion.get("DadoB") or 0.0)
        dado_h = float(seccion.get("DadoH") or 0.0)
        dado_alto = float(seccion.get("DadoAlto") or 0.0)
        cajas = []
        if plantilla > 0:
            cajas.append(
                self._caja_entre(-largo / 2.0, largo / 2.0, -ancho / 2.0, ancho / 2.0,
                                 -plantilla, 0.0)
            )
        cajas.append(
            self._caja_entre(-largo / 2.0, largo / 2.0, -ancho / 2.0, ancho / 2.0,
                             0.0, peralte)
        )
        if dado_b > 0 and dado_h > 0 and dado_alto > 0:
            cajas.append(
                self._caja_malla(dado_b, dado_h, dado_alto, z0=peralte)
            )
        return self._malla_de_cajas(cajas)

    def _cuerpo_zapata_corrida(self, seccion: dict[str, Any], largo: float) -> Any:
        ancho = float(seccion.get("Ancho") or 0.60)
        peralte = float(seccion.get("Peralte") or 0.20)
        corona = float(seccion.get("Corona") or 0.0)
        plantilla = float(seccion.get("Plantilla") or 0.05)
        mitad_inferior = ancho / 2.0
        mitad_superior = (corona if corona > 0 else ancho) / 2.0
        vertices = [
            [-mitad_inferior, -peralte / 2.0, 0.0],
            [mitad_inferior, -peralte / 2.0, 0.0],
            [mitad_superior, peralte / 2.0, 0.0],
            [-mitad_superior, peralte / 2.0, 0.0],
            [-mitad_inferior, -peralte / 2.0, largo],
            [mitad_inferior, -peralte / 2.0, largo],
            [mitad_superior, peralte / 2.0, largo],
            [-mitad_superior, peralte / 2.0, largo],
        ]
        caras = [
            [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
            [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        ]
        cajas = [(vertices, caras)]
        if plantilla > 0:
            cajas.append(
                self._caja_entre(-mitad_inferior, mitad_inferior,
                                 -peralte / 2.0 - plantilla, -peralte / 2.0, 0.0, largo)
            )
        return self._malla_de_cajas(cajas)

    def _aplicar_predefinido(self, elemento: Any, tipo: Any) -> None:
        predefinido = getattr(tipo, "PredefinedType", None)
        if predefinido and hasattr(elemento, "PredefinedType"):
            elemento.PredefinedType = predefinido
        elemento_tipo = getattr(tipo, "ElementType", None)
        if elemento_tipo:
            if hasattr(elemento, "ElementType"):
                elemento.ElementType = elemento_tipo
            elif hasattr(elemento, "ObjectType"):
                elemento.ObjectType = elemento_tipo

    def _altura_columna(
        self, elevacion: float, nivel_superior: str | None, altura: float | None
    ) -> float:
        if nivel_superior:
            superior = self._nivel_por_gid(nivel_superior)
            tope = float(superior.Elevation or 0.0)
            resultado = tope - elevacion
        elif altura is not None:
            try:
                resultado = float(altura)
            except (TypeError, ValueError) as exc:
                raise self._error("La altura de la columna no es un número.", -32602) from exc
        else:
            superiores = [
                float(n.Elevation or 0.0)
                for n in self.modelo.by_type("IfcBuildingStorey")
                if float(n.Elevation or 0.0) > elevacion + TOLERANCIA_CALCULO
            ]
            resultado = (min(superiores) - elevacion) if superiores else 2.60
        if resultado <= 0:
            raise self._error("La altura de la columna debe ser positiva.", -32602)
        return resultado

    def _es_viga_estructural(self, elemento: Any) -> bool:
        if elemento.is_a("IfcBeam"):
            return True
        return elemento.is_a("IfcFooting") and _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "FOOTING_BEAM"

    def _barra_de_elemento(self, elemento: Any) -> uniones.Barra | None:
        """Convierte una columna o viga del modelo en la barra pura de uniones."""
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        if not datos:
            return None
        tipo = self._tipo_entidad(elemento)
        alias, seccion, _ = self._seccion_y_armado(tipo)
        if alias is None:
            return None
        if elemento.is_a("IfcColumn"):
            base = float(datos.get("Base") or 0.0)
            alto = float(datos.get("Altura") or 2.60)
            return uniones.Barra(
                gid=_gid(elemento),
                tipo="columna",
                x1=float(datos.get("X") or 0.0),
                y1=float(datos.get("Y") or 0.0),
                x2=float(datos.get("X") or 0.0),
                y2=float(datos.get("Y") or 0.0),
                ancho=float(
                    datos.get("B") or seccion.get("B") or seccion.get("D") or 0.30
                ),
                fondo=float(
                    datos.get("H") or seccion.get("H") or seccion.get("D") or 0.30
                ),
                z0=base,
                z1=base + alto,
                rotacion=float(datos.get("Rotacion") or 0.0),
            )
        if self._es_viga_estructural(elemento):
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            alto = float(datos.get("H") or seccion.get("H") or 0.40)
            centro = float(datos.get("Z") or 0.0)
            return uniones.Barra(
                gid=_gid(elemento),
                tipo="viga",
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                ancho=float(datos.get("B") or seccion.get("B") or 0.20),
                z0=centro - alto / 2.0,
                z1=centro + alto / 2.0,
            )
        return None

    def _barras_de_dado(self, elemento: Any) -> list[uniones.Barra]:
        """O012b: el dado de la zapata cuenta como columna para recortar vigas.

        El dado forma parte del cuerpo de la zapata (no es un IFC aparte), así que
        su barra lleva el GlobalId de la zapata para que la relación IFC de la
        unión apunte al elemento real.
        """
        if not elemento.is_a("IfcFooting") or _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "STRIP_FOOTING":
            return []
        tipo = self._tipo_entidad(elemento)
        alias, seccion, _ = self._seccion_y_armado(tipo)
        if alias != "zapata":
            return []
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        if not datos:
            return []
        dado_b = float(seccion.get("DadoB") or 0.0)
        dado_h = float(seccion.get("DadoH") or 0.0)
        dado_alto = float(seccion.get("DadoAlto") or 0.0)
        peralte = float(seccion.get("Peralte") or 0.25)
        if dado_b <= 0 or dado_h <= 0 or dado_alto <= 0:
            return []
        z = float(datos.get("Z") or 0.0)
        return [
            uniones.Barra(
                gid=_gid(elemento),
                tipo="columna",
                x1=float(datos.get("X") or 0.0),
                y1=float(datos.get("Y") or 0.0),
                x2=float(datos.get("X") or 0.0),
                y2=float(datos.get("Y") or 0.0),
                ancho=dado_b,
                fondo=dado_h,
                z0=z + peralte,
                z1=z + peralte + dado_alto,
                rotacion=float(datos.get("Rotacion") or 0.0),
            )
        ]

    def _barras_estructura(self) -> tuple[list[uniones.Barra], list[uniones.Barra]]:
        vigas: list[uniones.Barra] = []
        columnas: list[uniones.Barra] = []
        for elemento in self.modelo.by_type("IfcElement"):
            if not (
                elemento.is_a("IfcColumn")
                or elemento.is_a("IfcFooting")
                or self._es_viga_estructural(elemento)
            ):
                continue
            barra = self._barra_de_elemento(elemento)
            if barra is not None:
                if barra.tipo == "columna":
                    columnas.append(barra)
                else:
                    vigas.append(barra)
            columnas.extend(self._barras_de_dado(elemento))
        return vigas, columnas

    def _tramos_de_viga(self, elemento: Any) -> list[tuple[float, float]]:
        """Tramos recortados de una viga, en metros sobre su eje original."""
        barra = self._barra_de_elemento(elemento)
        if barra is None or barra.tipo != "viga":
            return [(0.0, 1.0)]
        vigas, columnas = self._barras_estructura()
        tramos, _uniones_aplicadas = uniones.calcular(vigas, columnas)
        return tramos.get(barra.gid) or [(0.0, barra.largo)]

    def _recrear_relaciones_uniones(self) -> None:
        """Una relación IFC estándar por unión, con el elemento que manda primero."""
        for rel in list(self.modelo.by_type("IfcRelConnectsElements")):
            if _texto(getattr(rel, "Name", "")) == "OPEN-RVT unión":
                try:
                    self.modelo.remove(rel)
                except Exception:
                    LOG.debug("no se pudo quitar una unión anterior", exc_info=True)
        vigas, columnas = self._barras_estructura()
        _tramos, aplicadas = uniones.calcular(vigas, columnas)
        for union in aplicadas:
            try:
                maestro = self._entidad_por_gid(union["maestro"])
                esclavo = self._entidad_por_gid(union["esclavo"])
            except Exception:
                continue
            existente = False
            for rel in self.modelo.by_type("IfcRelConnectsElements"):
                if (
                    getattr(rel, "RelatingElement", None) == maestro
                    and getattr(rel, "RelatedElement", None) == esclavo
                ):
                    existente = True
                    break
            if existente:
                continue
            try:
                self.modelo.create_entity(
                    "IfcRelConnectsElements",
                    GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=None,
                    Name="OPEN-RVT unión",
                    Description=None,
                    ConnectionGeometry=None,
                    RelatingElement=maestro,
                    RelatedElement=esclavo,
                )
            except Exception:
                LOG.warning("no se pudo registrar la unión", exc_info=True)

    def _recalcular_uniones_estructura(self) -> None:
        """Vuelve a cortar todas las vigas: al mover, borrar o cambiar un vecino."""
        for elemento in list(self.modelo.by_type("IfcElement")):
            if elemento.is_a("IfcColumn") or self._es_viga_estructural(elemento):
                if self._leer_pset(elemento, "OPENRVT_Estructura"):
                    self._regenerar_estructura(elemento)
        # O012b: losa y muro dependen de las vigas, columnas y castillos vecinos.
        for losa in list(self.modelo.by_type("IfcSlab")):
            if self._leer_pset(losa, "OPENRVT_Losa"):
                self._regenerar_losa(losa)
        for muro in list(self.modelo.by_type("IfcWall")):
            if self._leer_pset(muro, "OPENRVT_Muro"):
                self._regenerar_representacion_unida(muro)
        self._recrear_relaciones_uniones()

    def _regenerar_estructura(self, elemento: Any) -> None:
        tipo = self._tipo_entidad(elemento)
        alias, seccion, _armado = self._seccion_y_armado(tipo)
        if alias is None:
            return
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        # O007c: el castillo usa el núcleo del muro y el cerramiento su espesor;
        # la instancia puede sobrescribir B/H sin tocar el tipo.
        seccion = dict(seccion)
        for clave in ("B", "H"):
            if datos.get(clave):
                seccion[clave] = float(datos[clave])
        self._aplicar_predefinido(elemento, tipo)
        self._quitar_representaciones(elemento, "Body")
        if elemento.is_a("IfcColumn"):
            altura = float(datos.get("Altura") or 0.0)
            if altura <= 0:
                altura = 2.60
            cuerpo = self._cuerpo_columna(seccion, altura)
            matriz = self._matriz_colocacion(
                float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0),
                float(datos.get("Base") or 0.0), float(datos.get("Rotacion") or 0.0),
            )
        elif elemento.is_a("IfcBeam") or (
            elemento.is_a("IfcFooting")
            and _texto(getattr(elemento, "PredefinedType", "")) == "FOOTING_BEAM"
        ):
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            largo = float(datos.get("Longitud") or math.hypot(x2 - x1, y2 - y1))
            if largo <= TOLERANCIA_CALCULO:
                largo = 1.0
            tramos = self._tramos_de_viga(elemento)
            cuerpo = self._cuerpo_viga_tramos(seccion, tramos)
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            matriz = self._matriz_viga(x1, y1, float(datos.get("Z") or 0.0), ux, uy)
        elif elemento.is_a("IfcFooting") and _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "STRIP_FOOTING":
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            largo = float(datos.get("Longitud") or math.hypot(x2 - x1, y2 - y1))
            if largo <= TOLERANCIA_CALCULO:
                largo = 1.0
            cuerpo = self._cuerpo_zapata_corrida(seccion, largo)
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            matriz = self._matriz_viga(x1, y1, float(datos.get("Z") or 0.0), ux, uy)
        else:
            cuerpo = self._cuerpo_zapata(seccion)
            matriz = self._matriz_colocacion(
                float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0),
                float(datos.get("Z") or 0.0), float(datos.get("Rotacion") or 0.0),
            )
        geometry_api.assign_representation(self.modelo, product=elemento, representation=cuerpo)
        geometry_api.edit_object_placement(self.modelo, product=elemento, matrix=matriz)

    def columna_crear(
        self,
        tipo: str,
        nivel: str,
        x: float,
        y: float,
        rotacion: float = 0.0,
        nivel_superior: str | None = None,
        altura: float | None = None,
        eje_a: str = "",
        eje_b: str = "",
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcColumnType",))
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x, y, rotacion = float(x), float(y), float(rotacion)
        except (TypeError, ValueError) as exc:
            raise self._error("La posición de la columna no es numérica.", -32602) from exc
        elevacion = float(nivel_entidad.Elevation or 0.0)
        alto = self._altura_columna(elevacion, nivel_superior, altura)
        tope = _texto(nivel_superior)
        if not tope:
            inmediato = self._nivel_inmediato_superior(elevacion)
            tope = _gid(inmediato) if inmediato is not None else ""
        self._instantanea()
        columna = root.create_entity(self.modelo, ifc_class="IfcColumn")
        alias = self._estructura_de_tipo(tipo_entidad) or "columna"
        columna.Name = f"{alias.capitalize()} {_nombre(tipo_entidad)}"
        type_api.assign_type(
            self.modelo, related_objects=[columna], relating_type=tipo_entidad
        )
        self._guardar_pset(
            columna,
            "OPENRVT_Estructura",
            {
                "X": x, "Y": y, "Rotacion": rotacion, "Base": elevacion,
                "Nivel": nivel, "NivelSuperior": tope,
                "Altura": alto,
            },
        )
        self._guardar_pset(
            columna,
            PSET_RESTRICCIONES,
            {
                "NivelBase": _gid(nivel_entidad),
                "DesfaseBase": 0.0,
                "NivelTope": tope,
                "DesfaseTope": 0.0,
                "AlturaSinConexion": alto,
            },
        )
        self._guardar_enlace_punto(columna, eje_a, eje_b, x, y)
        self._regenerar_estructura(columna)
        spatial_api.assign_container(
            self.modelo, products=[columna], relating_structure=nivel_entidad
        )
        self._recalcular_uniones_estructura()
        if eje_a or eje_b:
            self._guardar_liga(columna, {"EjeA": _texto(eje_a), "EjeB": _texto(eje_b)})
        self.con_cambios = True
        return self._resultado(
            [columna], mensaje=f"Columna creada ({alto:.2f} m)."
        )

    def viga_crear(
        self,
        tipo: str,
        nivel: str,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        desfase: float = 0.0,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcBeamType", "IfcFootingType"))
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x1, y1, x2, y2, desfase = (
                float(x1), float(y1), float(x2), float(y2), float(desfase)
            )
        except (TypeError, ValueError) as exc:
            raise self._error("Los datos de la viga no son números.", -32602) from exc
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("La viga necesita dos puntos distintos.", -32602)
        alias = self._estructura_de_tipo(tipo_entidad) or "trabe"
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        alto = float(seccion.get("H") or 0.40)
        elevacion = float(nivel_entidad.Elevation or 0.0)
        clase = "IfcFooting" if tipo_entidad.is_a("IfcFootingType") else "IfcBeam"
        self._instantanea()
        viga = root.create_entity(self.modelo, ifc_class=clase)
        viga.Name = f"{alias.capitalize()} {_nombre(tipo_entidad)}"
        type_api.assign_type(self.modelo, related_objects=[viga], relating_type=tipo_entidad)
        lecho_bajo = alias == "dala"
        centro = (
            elevacion + (alto / 2.0 if lecho_bajo else desfase - alto / 2.0)
        )
        self._guardar_pset(
            viga,
            "OPENRVT_Estructura",
            {
                "X1": x1, "Y1": y1, "X2": x2, "Y2": y2, "Longitud": largo,
                "Desfase": desfase, "Z": centro, "Nivel": nivel,
            },
        )
        self._regenerar_estructura(viga)
        spatial_api.assign_container(
            self.modelo, products=[viga], relating_structure=nivel_entidad
        )
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado([viga], mensaje=f"Viga creada ({largo:.2f} m).")

    def zapata_crear(
        self,
        tipo: str,
        nivel: str,
        x: float,
        y: float,
        rotacion: float = 0.0,
        desplante: float = 1.00,
        eje_a: str = "",
        eje_b: str = "",
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcFootingType",))
        if self._estructura_de_tipo(tipo_entidad) != "zapata":
            raise self._error("El tipo no es una zapata aislada.", -32602)
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x, y, rotacion, desplante = float(x), float(y), float(rotacion), float(desplante)
        except (TypeError, ValueError) as exc:
            raise self._error("La posición de la zapata no es numérica.", -32602) from exc
        if desplante <= 0:
            raise self._error("El desplante de la zapata debe ser positivo.", -32602)
        elevacion = float(nivel_entidad.Elevation or 0.0)
        self._instantanea()
        zapata = root.create_entity(self.modelo, ifc_class="IfcFooting")
        zapata.Name = f"Zapata {_nombre(tipo_entidad)}"
        type_api.assign_type(
            self.modelo, related_objects=[zapata], relating_type=tipo_entidad
        )
        self._guardar_pset(
            zapata,
            "OPENRVT_Estructura",
            {
                "X": x, "Y": y, "Rotacion": rotacion, "Z": elevacion - desplante,
                "Desplante": desplante, "Nivel": nivel,
            },
        )
        self._guardar_enlace_punto(zapata, eje_a, eje_b, x, y)
        self._regenerar_estructura(zapata)
        spatial_api.assign_container(
            self.modelo, products=[zapata], relating_structure=nivel_entidad
        )
        self.con_cambios = True
        return self._resultado([zapata], mensaje="Zapata creada.")

    def zapata_corrida_crear(
        self,
        tipo: str,
        nivel: str,
        x1: float,
        y1: float,
        x2: float,
        y2: float,
        desplante: float = 0.80,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcFootingType",))
        if self._estructura_de_tipo(tipo_entidad) != "zapata_corrida":
            raise self._error("El tipo no es una zapata corrida.", -32602)
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x1, y1, x2, y2, desplante = (
                float(x1), float(y1), float(x2), float(y2), float(desplante)
            )
        except (TypeError, ValueError) as exc:
            raise self._error("El trazo de la zapata no es numérico.", -32602) from exc
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("La zapata corrida necesita dos puntos distintos.", -32602)
        if desplante <= 0:
            raise self._error("El desplante de la zapata debe ser positivo.", -32602)
        elevacion = float(nivel_entidad.Elevation or 0.0)
        _, seccion, _ = self._seccion_y_armado(tipo_entidad)
        alto = float(seccion.get("Peralte") or 0.20)
        self._instantanea()
        zapata = root.create_entity(self.modelo, ifc_class="IfcFooting")
        zapata.Name = f"Zapata corrida {_nombre(tipo_entidad)}"
        type_api.assign_type(
            self.modelo, related_objects=[zapata], relating_type=tipo_entidad
        )
        self._guardar_pset(
            zapata,
            "OPENRVT_Estructura",
            {
                "X1": x1, "Y1": y1, "X2": x2, "Y2": y2, "Longitud": largo,
                "Desplante": desplante, "Z": elevacion - desplante + alto / 2.0,
                "Nivel": nivel,
            },
        )
        self._regenerar_estructura(zapata)
        spatial_api.assign_container(
            self.modelo, products=[zapata], relating_structure=nivel_entidad
        )
        self.con_cambios = True
        return self._resultado([zapata], mensaje=f"Zapata corrida creada ({largo:.2f} m).")

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
        """O010: reconstruye el cuerpo con el inglete/recorte de sus uniones."""
        try:
            self._quitar_representaciones(muro, "Body")
            cuerpo = self._cuerpo_muro(muro)
            cuerpo.RepresentationIdentifier = "Body"
            geometry_api.assign_representation(
                self.modelo, product=muro, representation=cuerpo
            )
        except Exception:
            LOG.warning("no se pudo regenerar la unión del muro %s", _gid(muro), exc_info=True)
            return False
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
    def _geometria_losa(self, losa: Any):
        """Huella recortada de la losa (o su contorno si todavía no se recortó)."""
        from shapely import wkt
        from shapely.geometry import Polygon

        datos = self._leer_pset(losa, "OPENRVT_Losa")
        texto = datos.get("Recorte")
        if texto:
            try:
                return wkt.loads(str(texto))
            except Exception:
                LOG.debug("no se pudo leer el recorte de la losa", exc_info=True)
        return Polygon(self._poligono_de_losa(losa))

    def _prisma_de_huella(
        self, geometria: Any, z0: float, z1: float
    ) -> tuple[list[list[float]], list[list[int]]]:
        """Prisma vertical de una huella arbitraria (con huecos o varias piezas)."""
        from shapely.ops import triangulate

        triangulos: list[list[tuple[float, float]]] = []
        for triangulo in triangulate(geometria):
            if not geometria.covers(triangulo.representative_point()):
                continue
            puntos = [(float(p[0]), float(p[1])) for p in triangulo.exterior.coords[:3]]
            area2 = sum(
                puntos[i][0] * puntos[(i + 1) % 3][1]
                - puntos[(i + 1) % 3][0] * puntos[i][1]
                for i in range(3)
            )
            if area2 < 0:
                puntos.reverse()
            triangulos.append(puntos)

        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        bordes: dict[tuple, dict[str, Any]] = {}

        def _redondo(punto: tuple[float, float]) -> tuple[float, float]:
            return (round(punto[0], 9), round(punto[1], 9))

        for triangulo in triangulos:
            base = len(vertices)
            for x, y in triangulo:
                vertices.append([x, y, z0])
            for x, y in triangulo:
                vertices.append([x, y, z1])
            caras.append([base + 3, base + 4, base + 5])
            caras.append([base + 2, base + 1, base])
            for i in range(3):
                j = (i + 1) % 3
                a, b = triangulo[i], triangulo[j]
                clave = tuple(sorted((_redondo(a), _redondo(b))))
                registro = bordes.setdefault(clave, {"cuenta": 0, "a": a, "b": b})
                registro["cuenta"] += 1

        for registro in bordes.values():
            if registro["cuenta"] != 1:
                continue
            a, b = registro["a"], registro["b"]
            base = len(vertices)
            vertices.extend(
                [
                    [a[0], a[1], z0], [b[0], b[1], z0],
                    [b[0], b[1], z1], [a[0], a[1], z1],
                ]
            )
            caras.append([base, base + 1, base + 2, base + 3])
        return vertices, caras

    def _regenerar_losa(self, losa: Any) -> None:
        """O012b: recorta la losa en planta contra trabes y columnas."""
        from shapely import wkt
        from shapely.geometry import Polygon

        datos = dict(self._leer_pset(losa, "OPENRVT_Losa"))
        if not datos:
            return
        espesor = float(datos.get("Espesor") or 0.12)
        if espesor <= 0:
            return
        original = datos.get("Contorno")
        if original:
            try:
                huella = wkt.loads(str(original))
            except Exception:
                huella = Polygon(self._poligono_de_losa(losa))
        else:
            huella = Polygon(self._poligono_de_losa(losa))
        vigas, columnas = self._barras_estructura()
        recorte = uniones.recortar_losa(
            list(huella.exterior.coords)[:-1], vigas, columnas, -espesor, 0.0
        )
        if recorte.is_empty:
            # Nunca se deja una losa sin cuerpo: se conserva la huella original.
            recorte = huella
        vertices, caras = self._prisma_de_huella(recorte, -espesor, 0.0)
        self._quitar_representaciones(losa, "Body")
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        rep.RepresentationIdentifier = "Body"
        geometry_api.assign_representation(self.modelo, product=losa, representation=rep)
        datos["Contorno"] = huella.wkt
        datos["Recorte"] = recorte.wkt
        datos["Area"] = round(float(recorte.area), 9)
        datos["Perimetro"] = round(float(recorte.length), 9)
        self._guardar_pset(losa, "OPENRVT_Losa", datos)

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

        from shapely.geometry import Polygon

        self._instantanea()
        losa = root.create_entity(self.modelo, ifc_class="IfcSlab")
        losa.Name = "Losa"
        losa.PredefinedType = "FLOOR"
        elevacion = float(nivel_entidad.Elevation or 0.0) + desfase
        matriz = np.identity(4)
        matriz[0][3] = 0.0
        matriz[1][3] = 0.0
        matriz[2][3] = elevacion
        geometry_api.edit_object_placement(self.modelo, product=losa, matrix=matriz)
        self._guardar_pset(
            losa,
            "OPENRVT_Losa",
            {
                "Espesor": espesor,
                "Desfase": desfase,
                "Puntos": len(poligono),
                "Contorno": Polygon(poligono).wkt,
            },
        )
        self._regenerar_losa(losa)
        spatial_api.assign_container(
            self.modelo, products=[losa], relating_structure=nivel_entidad
        )
        # O012b: la losa puede cubrir o soportar muros ya creados.
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado(
            [losa], mensaje=f"Losa creada ({abs(_poligono_area(poligono)):.2f} m²)."
        )

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
        # Se comparan GlobalId, no id() de los envoltorios: un envoltorio liberado
        # puede reutilizar la dirección de memoria y saltarse un elemento.
        vistos: set[str] = set()
        for gid in gids:
            for producto in self._productos_de(gid):
                if _gid(producto) in vistos:
                    continue
                vistos.add(_gid(producto))
                afectados.append(producto)
                # O007c: mover la columna mueve su zapata.
                if producto.is_a("IfcColumn"):
                    for zapata in self._zapatas_de_columna(producto):
                        if _gid(zapata) not in vistos:
                            vistos.add(_gid(zapata))
                            afectados.append(zapata)
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
            self._desplazar_pset_estructura(producto, dx, dy, dz)
        for producto in afectados:
            if producto.is_a("IfcWall"):
                self._unir_muros(producto)
                # O007c: castillos, cerramientos y dalas siguen al muro.
                self._actualizar_dependientes_muro(producto)
        self._recalcular_uniones_estructura()
        # O026: al mover una referencia, los elementos con candado la siguen.
        movidos = {_gid(p) for p in afectados}
        for gid in gids:
            movidos.update(
                _gid(e)
                for e in self._mover_alineados_de_referencia(gid, dx, dy, movidos)
            )
        self.con_cambios = True
        return self._resultado(
            modificados=[g for g in afectados if not g.is_a("IfcOpeningElement")],
            mensaje=f"{len(afectados)} elemento(s) movido(s).",
        )

    def _desplazar_pset_estructura(
        self, producto: Any, dx: float, dy: float, dz: float
    ) -> None:
        """Mantiene las coordenadas del pset al día para que regenerar no lo devuelva."""
        datos = self._leer_pset(producto, "OPENRVT_Estructura")
        if not datos:
            return
        for clave, delta in (
            ("X", dx), ("X1", dx), ("X2", dx),
            ("Y", dy), ("Y1", dy), ("Y2", dy),
            ("Z", dz), ("Base", dz),
        ):
            if clave in datos:
                datos[clave] = float(datos[clave] or 0.0) + delta
        self._guardar_pset(producto, "OPENRVT_Estructura", datos)

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

    def elementos_borrar(self, globalids: Any, dependientes: bool = True) -> dict[str, Any]:
        self._exigir_modelo()
        gids = self._todos_los_gids(globalids)
        # O007c: al borrar un muro caen sus castillos, cerramientos y dalas; al borrar
        # una columna se puede decidir si cae también su zapata.
        expandidos: list[str] = []
        pendientes = list(gids)
        while pendientes:
            gid = pendientes.pop(0)
            if gid in expandidos:
                continue
            try:
                entidad = self._entidad_por_gid(gid)
            except Exception:
                continue
            expandidos.append(gid)
            if entidad.is_a("IfcWall"):
                pendientes.extend(
                    _gid(d) for d in self._dependientes_de(entidad, "Muro")
                )
            elif entidad.is_a("IfcColumn") and dependientes:
                pendientes.extend(
                    _gid(z) for z in self._zapatas_de_columna(entidad)
                )
        self._instantanea()
        borrados: list[str] = []
        # GlobalId en lugar de id(): los envoltorios de IfcOpenShell se liberan al
        # borrarlos y Python puede reutilizar su dirección de memoria.
        vistos: set[str] = set()
        for gid in expandidos:
            try:
                entidad = self._entidad_por_gid(gid)
            except Exception:
                continue
            productos = self._productos_de(_gid(entidad))
            # De relleno a vano y de vano a muro, para no dejar relaciones colgando.
            for producto in reversed(productos):
                if _gid(producto) in vistos:
                    continue
                vistos.add(_gid(producto))
                if producto.is_a("IfcWall"):
                    self._quitar_uniones(producto)
                self._quitar_conexiones(producto)
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
        self._recalcular_uniones_estructura()
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
                copia = self._copiar_entidad(original)
                geometry_api.edit_object_placement(
                    self.modelo,
                    product=copia,
                    matrix=self._matriz_traslado(copia, dx, dy, dz),
                    is_si=True,
                )
                creados.append(copia)
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
            longitud = cambios.get("longitud", cambios.get("Longitud"))
            if altura is not None:
                altura = float(altura)
                if altura <= 0:
                    raise self._error("La altura debe ser positiva.", -32602)
                for vano, info in self._aberturas_del_muro(entidad):
                    if info["antepecho"] + info["alto"] > altura + TOLERANCIA:
                        raise self._error(
                            "La nueva altura deja una abertura fuera del muro.", -32023
                        )
                datos["altura"] = altura
                # O016: editar la altura a mano desconecta el tope y fija la altura.
                restriccion = self._restricciones_de(entidad)
                restriccion["NivelTope"] = ""
                restriccion["AlturaSinConexion"] = altura
                self._guardar_pset(entidad, PSET_RESTRICCIONES, restriccion)
            if longitud is not None:
                longitud = float(longitud)
                if longitud <= 0:
                    raise self._error("La longitud del muro debe ser positiva.", -32602)
                for vano, info in self._aberturas_del_muro(entidad):
                    if info["distancia"] + info["ancho"] > longitud + TOLERANCIA:
                        raise self._error(
                            "La nueva longitud deja una abertura fuera del muro.", -32023
                        )
                datos["longitud"] = longitud
            if altura is not None or longitud is not None:
                self._guardar_pset(
                    entidad,
                    "OPENRVT_Muro",
                    {
                        "Longitud": datos["longitud"],
                        "Altura": datos["altura"],
                        "Espesor": datos["espesor"],
                        "Alineacion": datos["alineacion"],
                    },
                )
            self._regenerar_muro(entidad)
            # O007c: el castillo, el cerramiento y la dala se recalculan con el muro.
            modificados.extend(self._actualizar_dependientes_muro(entidad))
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
        elif self._es_clase_estructura(entidad.is_a()) and self._leer_pset(
            entidad, "OPENRVT_Estructura"
        ):
            datos = dict(self._leer_pset(entidad, "OPENRVT_Estructura"))
            antes_x = float(datos.get("X") or 0.0)
            antes_y = float(datos.get("Y") or 0.0)
            claves = {
                "desplante": "Desplante", "Desplante": "Desplante",
                "desfase": "Desfase", "Desfase": "Desfase",
                "altura": "Altura", "Altura": "Altura",
                "rotacion": "Rotacion", "Rotacion": "Rotacion",
                "nivel_superior": "NivelSuperior", "NivelSuperior": "NivelSuperior",
                "x": "X", "X": "X", "y": "Y", "Y": "Y",
                "x1": "X1", "X1": "X1", "y1": "Y1", "Y1": "Y1",
                "x2": "X2", "X2": "X2", "y2": "Y2", "Y2": "Y2",
            }
            for clave, valor in cambios.items():
                destino = claves.get(clave)
                if destino is None:
                    continue
                if destino in ("NivelSuperior",):
                    datos[destino] = _texto(valor)
                else:
                    try:
                        datos[destino] = float(valor)
                    except (TypeError, ValueError) as exc:
                        raise self._error(f"«{destino}» no es un número.", -32602) from exc
            if "Altura" in datos and float(datos["Altura"]) <= 0:
                raise self._error("La altura debe ser positiva.", -32602)
            if "Desplante" in datos and float(datos["Desplante"]) <= 0:
                raise self._error("El desplante debe ser positivo.", -32602)
            tipo = self._tipo_entidad(entidad)
            _, seccion, _ = self._seccion_y_armado(tipo)
            nivel = self._nivel_por_gid(_texto(datos.get("Nivel") or "")) if datos.get("Nivel") else None
            elevacion = float(nivel.Elevation or 0.0) if nivel is not None else 0.0
            alias = self._estructura_de_tipo(tipo) or "trabe"
            if entidad.is_a("IfcColumn"):
                datos["Base"] = elevacion
                if "Altura" in cambios and "NivelSuperior" not in cambios:
                    datos["NivelSuperior"] = ""
                if datos.get("NivelSuperior"):
                    superior = self._nivel_por_gid(_texto(datos["NivelSuperior"]))
                    datos["Altura"] = float(superior.Elevation or 0.0) - elevacion
                if float(datos.get("Altura") or 0.0) <= 0:
                    raise self._error("La altura de la columna debe ser positiva.", -32602)
            elif entidad.is_a("IfcBeam") or _texto(
                getattr(entidad, "PredefinedType", "")
            ) == "FOOTING_BEAM":
                alto = float(seccion.get("H") or 0.40)
                datos["Longitud"] = math.hypot(
                    float(datos.get("X2") or 0.0) - float(datos.get("X1") or 0.0),
                    float(datos.get("Y2") or 0.0) - float(datos.get("Y1") or 0.0),
                )
                if datos["Longitud"] <= TOLERANCIA_CALCULO:
                    raise self._error("La viga necesita dos puntos distintos.", -32602)
                lecho_bajo = alias == "dala"
                datos["Z"] = elevacion + (
                    alto / 2.0
                    if lecho_bajo
                    else float(datos.get("Desfase") or 0.0) - alto / 2.0
                )
            elif _texto(getattr(entidad, "PredefinedType", "")) == "STRIP_FOOTING":
                alto = float(seccion.get("Peralte") or 0.20)
                datos["Longitud"] = math.hypot(
                    float(datos.get("X2") or 0.0) - float(datos.get("X1") or 0.0),
                    float(datos.get("Y2") or 0.0) - float(datos.get("Y1") or 0.0),
                )
                if datos["Longitud"] <= TOLERANCIA_CALCULO:
                    raise self._error("La zapata corrida necesita dos puntos distintos.", -32602)
                datos["Z"] = elevacion - float(datos.get("Desplante") or 0.80) + alto / 2.0
            else:
                datos["Z"] = elevacion - float(datos.get("Desplante") or 1.0)
            self._guardar_pset(entidad, "OPENRVT_Estructura", datos)
            if entidad.is_a("IfcColumn"):
                restriccion = self._restricciones_de(entidad)
                restriccion["NivelTope"] = _texto(datos.get("NivelSuperior"))
                restriccion["AlturaSinConexion"] = float(datos.get("Altura") or 0.0)
                self._guardar_pset(entidad, PSET_RESTRICCIONES, restriccion)
            self._regenerar_estructura(entidad)
            if entidad.is_a("IfcColumn"):
                dx = float(datos.get("X") or 0.0) - antes_x
                dy = float(datos.get("Y") or 0.0) - antes_y
                if abs(dx) + abs(dy) > TOLERANCIA_CALCULO:
                    for zapata in self._zapatas_de_columna(entidad):
                        self._mover_producto(zapata, dx, dy, 0.0)
                        modificados.append(zapata)
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
        self._recalcular_uniones_estructura()
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

        datos = self._leer_pset(losa, "OPENRVT_Losa")
        if datos.get("Contorno"):
            try:
                from shapely import wkt

                return [
                    (float(p[0]), float(p[1]))
                    for p in wkt.loads(str(datos["Contorno"])).exterior.coords[:-1]
                ]
            except Exception:
                pass
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
