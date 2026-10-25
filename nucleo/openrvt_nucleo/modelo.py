"""Modelo IFC y comandos del núcleo.

Toda la edición pasa por IfcOpenShell. El servidor solo traduce JSON-RPC a estos
métodos; aquí no se escribe nada en stdout.
"""

from __future__ import annotations

import base64
import json
import math
import os
import uuid
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.api.aggregate as aggregate
import ifcopenshell.api.context as context
import ifcopenshell.api.project as project
import ifcopenshell.api.root as root
import ifcopenshell.api.unit as unit
import ifcopenshell.geom as geom
import numpy as np

__all__ = ["ErrorNucleo", "ModeloNucleo"]

CLASES_OBJETIVO = (
    "IfcWall",
    "IfcWallStandardCase",
    "IfcSlab",
    "IfcColumn",
    "IfcBeam",
    "IfcDoor",
    "IfcWindow",
    "IfcRoof",
    "IfcStair",
)

CATEGORIA = {
    "IfcWall": "muros",
    "IfcWallStandardCase": "muros",
    "IfcCurtainWall": "muros",
    "IfcSlab": "losas",
    "IfcColumn": "columnas",
    "IfcBeam": "vigas",
    "IfcDoor": "puertas",
    "IfcWindow": "ventanas",
    "IfcRoof": "cubiertas",
    "IfcStair": "escaleras",
    "IfcStairFlight": "escaleras",
    "IfcRamp": "escaleras",
    "IfcRampFlight": "escaleras",
}

COLOR = {
    "muros": "#c9c9c9",
    "losas": "#a3a3a3",
    "columnas": "#b5b5b5",
    "vigas": "#999999",
    "puertas": "#b5834b",
    "ventanas": "#8fc3e0",
    "cubiertas": "#b45f4d",
    "escaleras": "#bdbdbd",
    "otros": "#9e9e9e",
}

# Las ventanas se dibujan translúcidas; el resto es opaco.
OPACIDAD = {"ventanas": 0.45}

MAX_HISTORIAL = 50

# Clases que no son elementos del edificio: aperturas, espacios y anotaciones.
NO_ELEMENTOS = ("IfcOpeningElement", "IfcFeatureElementSubtraction", "IfcVirtualElement")


class ErrorNucleo(Exception):
    """Error de comando con un código JSON-RPC y un mensaje para el usuario."""

    def __init__(self, mensaje: str, codigo: int = -32000):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo


def _texto(valor: Any) -> str:
    if valor is None:
        return ""
    return str(valor)


def _json_plano(valor: Any) -> Any:
    """Convierte valores de IfcOpenShell a algo serializable por JSON."""
    if valor is None or isinstance(valor, (bool, int, str)):
        return valor
    if isinstance(valor, float):
        return valor if math.isfinite(valor) else None
    if isinstance(valor, (list, tuple, set)):
        return [_json_plano(v) for v in valor]
    if isinstance(valor, dict):
        return {str(k): _json_plano(v) for k, v in valor.items()}
    if hasattr(valor, "is_a"):
        return {
            "clase": valor.is_a(),
            "globalid": getattr(valor, "GlobalId", None),
            "nombre": getattr(valor, "Name", None),
        }
    try:
        return str(valor)
    except Exception:  # pragma: no cover - protección defensiva
        return None


def _categoria(clase: str) -> str:
    if clase in CATEGORIA:
        return CATEGORIA[clase]
    # IfcWallStandardCase es subtipo de IfcWall; se cubre con la tabla, pero otros
    # subtipos (p. ej. IfcWallElementedCase) caen aquí.
    if "Wall" in clase:
        return "muros"
    if "Slab" in clase or "Plate" in clase:
        return "losas"
    if "Column" in clase:
        return "columnas"
    if "Beam" in clase or "Member" in clase:
        return "vigas"
    if "Door" in clase:
        return "puertas"
    if "Window" in clase:
        return "ventanas"
    if "Roof" in clase:
        return "cubiertas"
    if "Stair" in clase or "Ramp" in clase:
        return "escaleras"
    return "otros"


class ModeloNucleo:
    """Estado del modelo abierto en el proceso Python."""

    def __init__(self) -> None:
        self.modelo: ifcopenshell.file | None = None
        self.ruta: str | None = None
        self.con_cambios = False
        self._deshacer: list[str] = []
        self._rehacer: list[str] = []

    # ------------------------------------------------------------------ utilidades
    def _exigir_modelo(self) -> ifcopenshell.file:
        if self.modelo is None:
            raise ErrorNucleo("No hay ningún modelo abierto.", -32001)
        return self.modelo

    def _instantanea(self) -> None:
        """Guarda el modelo antes de un comando que lo modifica (máximo 50)."""
        if self.modelo is None:
            return
        self._deshacer.append(self.modelo.to_string())
        if len(self._deshacer) > MAX_HISTORIAL:
            del self._deshacer[0 : len(self._deshacer) - MAX_HISTORIAL]
        self._rehacer.clear()

    def _nivel_de(self, elemento: Any) -> str:
        for rel in getattr(elemento, "ContainedInStructure", ()) or ():
            estructura = getattr(rel, "RelatingStructure", None)
            if estructura is not None and estructura.is_a("IfcBuildingStorey"):
                return _texto(estructura.Name)
        # Si el elemento no está contenido (algunos IFC exportados así), se busca a
        # través del vano o por la elevación de su colocación.
        for rel in getattr(elemento, "HasOpenings", ()) or ():
            vano = getattr(rel, "RelatedOpeningElement", None)
            for rel2 in getattr(vano, "ContainedInStructure", ()) or ():
                nivel = getattr(rel2, "RelatingStructure", None)
                if nivel is not None and nivel.is_a("IfcBuildingStorey"):
                    return _texto(nivel.Name)
        try:
            import ifcopenshell.util.placement as placement

            matriz = placement.get_local_placement(elemento.ObjectPlacement)
            z = float(matriz[2][3])
        except Exception:
            return ""
        mejor = None
        for nivel in self.modelo.by_type("IfcBuildingStorey"):
            if nivel.Elevation is None:
                continue
            elevacion = float(nivel.Elevation)
            if elevacion <= z + 1e-4 and (mejor is None or elevacion > mejor[0]):
                mejor = (elevacion, nivel)
        return _texto(mejor[1].Name) if mejor else ""

    def _es_elemento(self, entidad: Any) -> bool:
        if not entidad.is_a("IfcElement"):
            return False
        return not any(entidad.is_a(c) for c in NO_ELEMENTOS)

    def _elementos_ordenados(self) -> list[Any]:
        modelo = self._exigir_modelo()
        elementos = [e for e in modelo.by_type("IfcElement") if self._es_elemento(e)]
        return sorted(
            elementos,
            key=lambda e: (
                _texto(getattr(e, "Name", "")).lower(),
                e.is_a(),
                _texto(getattr(e, "GlobalId", "")),
            ),
        )

    def _tipo_de(self, elemento: Any) -> str:
        for rel in getattr(elemento, "IsDefinedBy", ()) or ():
            if rel.is_a("IfcRelDefinesByType"):
                tipo = getattr(rel, "RelatingType", None)
                if tipo is not None:
                    return _texto(tipo.Name) or tipo.is_a()
        predefinido = getattr(elemento, "PredefinedType", None)
        return _texto(predefinido)

    # ------------------------------------------------------------------ proyecto
    def nuevo(self, nombre: str = "Modelo sin título") -> dict[str, Any]:
        modelo = project.create_file(version="IFC4")
        proyecto = root.create_entity(modelo, ifc_class="IfcProject", name=nombre)
        unit.assign_unit(
            modelo,
            length={"is_metric": True, "raw": "METERS"},
            area={"is_metric": True, "raw": "METERS"},
            volume={"is_metric": True, "raw": "METERS"},
        )
        sitio = root.create_entity(modelo, ifc_class="IfcSite", name="Sitio")
        edificio = root.create_entity(modelo, ifc_class="IfcBuilding", name="Edificio")
        nivel = root.create_entity(modelo, ifc_class="IfcBuildingStorey", name="Nivel 0")
        nivel.Elevation = 0.0
        aggregate.assign_object(modelo, products=[sitio], relating_object=proyecto)
        aggregate.assign_object(modelo, products=[edificio], relating_object=sitio)
        aggregate.assign_object(modelo, products=[nivel], relating_object=edificio)
        context.add_context(
            modelo,
            context_type="Model",
            context_identifier="Body",
            target_view="MODEL_VIEW",
        )
        self.modelo = modelo
        self.ruta = None
        self.con_cambios = True
        self._deshacer.clear()
        self._rehacer.clear()
        return self.info()

    def abrir(self, ruta: str) -> dict[str, Any]:
        if not ruta or not str(ruta).strip():
            raise ErrorNucleo("Falta la ruta del archivo IFC.", -32602)
        archivo = Path(ruta).expanduser()
        if not archivo.is_file():
            raise ErrorNucleo(f"No existe el archivo: {archivo}", -32002)
        try:
            modelo = ifcopenshell.open(str(archivo))
        except Exception as exc:
            raise ErrorNucleo(f"No se pudo abrir el IFC: {exc}", -32003) from exc
        self.modelo = modelo
        self.ruta = str(archivo.resolve())
        self.con_cambios = False
        self._deshacer.clear()
        self._rehacer.clear()
        return self.info()

    def guardar(self, ruta: str | None = None) -> dict[str, Any]:
        modelo = self._exigir_modelo()
        destino = ruta or self.ruta
        if not destino:
            raise ErrorNucleo("El modelo no tiene ruta; use «Guardar como».", -32602)
        archivo = Path(destino).expanduser()
        try:
            archivo.parent.mkdir(parents=True, exist_ok=True)
            modelo.write(str(archivo))
        except Exception as exc:
            raise ErrorNucleo(f"No se pudo guardar el IFC: {exc}", -32004) from exc
        self.ruta = str(archivo.resolve())
        self.con_cambios = False
        return self.info()

    def info(self) -> dict[str, Any]:
        modelo = self._exigir_modelo()
        por_clase: dict[str, int] = {}
        for elemento in self._elementos_ordenados():
            clase = elemento.is_a()
            por_clase[clase] = por_clase.get(clase, 0) + 1
        proyecto = modelo.by_type("IfcProject")
        return {
            "ruta": self.ruta,
            "esquema": modelo.schema,
            "con_cambios": self.con_cambios,
            "elementos": sum(por_clase.values()),
            "por_clase": dict(sorted(por_clase.items())),
            "nombre": _texto(proyecto[0].Name) if proyecto else "",
        }

    def niveles(self) -> list[dict[str, Any]]:
        modelo = self._exigir_modelo()
        niveles = []
        for nivel in modelo.by_type("IfcBuildingStorey"):
            niveles.append(
                {
                    "globalid": _texto(nivel.GlobalId),
                    "nombre": _texto(nivel.Name),
                    "elevacion": float(nivel.Elevation or 0.0),
                }
            )
        niveles.sort(key=lambda n: (n["elevacion"], n["nombre"]))
        return niveles

    def elementos(self, filtro: Any = None) -> list[dict[str, Any]]:
        filtro = filtro or {}
        if isinstance(filtro, str):
            filtro = {"texto": filtro}
        if not isinstance(filtro, dict):
            raise ErrorNucleo("El filtro de elementos debe ser un objeto.", -32602)
        clase = _texto(filtro.get("clase")).lower()
        nivel = _texto(filtro.get("nivel")).lower()
        texto = _texto(filtro.get("texto") or filtro.get("nombre")).lower()
        categoria = _texto(filtro.get("categoria")).lower()
        salida = []
        for elemento in self._elementos_ordenados():
            nombre = _texto(getattr(elemento, "Name", ""))
            clase_e = elemento.is_a()
            nivel_e = self._nivel_de(elemento)
            cat_e = _categoria(clase_e)
            if clase and clase not in clase_e.lower():
                continue
            if nivel and nivel not in nivel_e.lower():
                continue
            if categoria and categoria != cat_e:
                continue
            if texto and texto not in nombre.lower() and texto not in clase_e.lower():
                continue
            salida.append(
                {
                    "globalid": _texto(elemento.GlobalId),
                    "clase": clase_e,
                    "nombre": nombre,
                    "nivel": nivel_e,
                    "tipo": self._tipo_de(elemento),
                    "categoria": cat_e,
                }
            )
        return salida

    def propiedades(self, globalid: str) -> dict[str, Any]:
        modelo = self._exigir_modelo()
        if not globalid:
            raise ErrorNucleo("Falta el GlobalId del elemento.", -32602)
        elementos = modelo.by_type("IfcElement")
        elemento = next(
            (e for e in elementos if getattr(e, "GlobalId", None) == globalid), None
        )
        if elemento is None:
            raise ErrorNucleo(f"No existe el elemento {globalid}.", -32005)

        atributos: dict[str, Any] = {}
        for clave, valor in elemento.get_info().items():
            if clave in ("id", "type"):
                continue
            atributos[clave] = _json_plano(valor)

        materiales = []
        try:
            import ifcopenshell.util.element as util_elemento

            for material in util_elemento.get_materials(elemento):
                capas = []
                for capa in getattr(material, "Layers", ()) or ():
                    capas.append(
                        {
                            "nombre": _texto(getattr(capa, "Name", "")),
                            "material": _texto(
                                getattr(getattr(capa, "Material", None), "Name", "")
                            ),
                            "espesor": getattr(capa, "LayerThickness", None),
                        }
                    )
                materiales.append({"nombre": _texto(material.Name), "capas": capas})
        except Exception:
            materiales = []

        psets: dict[str, Any] = {}
        try:
            import ifcopenshell.util.element as util_elemento

            for nombre, valores in util_elemento.get_psets(elemento).items():
                valores = dict(valores)
                valores.pop("id", None)
                psets[nombre] = _json_plano(valores)
        except Exception:
            psets = {}

        return {
            "globalid": _texto(elemento.GlobalId),
            "clase": elemento.is_a(),
            "nombre": _texto(getattr(elemento, "Name", "")),
            "nivel": self._nivel_de(elemento),
            "tipo": self._tipo_de(elemento),
            "atributos": atributos,
            "materiales": materiales,
            "psets": psets,
        }

    # ------------------------------------------------------------------ geometría
    def teselar(self, globalids: Any = None) -> dict[str, Any]:
        modelo = self._exigir_modelo()
        filtro: set[str] | None = None
        if globalids is not None:
            if not isinstance(globalids, (list, tuple)):
                raise ErrorNucleo("globalids debe ser una lista.", -32602)
            filtro = {str(g) for g in globalids}
        incluir = None
        if filtro is not None:
            incluir = [
                e
                for e in modelo.by_type("IfcElement")
                if _texto(getattr(e, "GlobalId", "")) in filtro
            ]
            if not incluir:
                return {"elementos": [], "triangulos": 0}

        ajustes = geom.settings()
        ajustes.set(ajustes.USE_WORLD_COORDS, True)
        ajustes.set(ajustes.WELD_VERTICES, True)
        ajustes.set(ajustes.NO_NORMALS, True)

        por_id: dict[int, dict[str, Any]] = {}
        triangulos = 0
        hilos = max(1, os.cpu_count() or 1)
        it = geom.iterator(ajustes, modelo, hilos, include=incluir)
        if it.initialize():
            while True:
                forma = it.get()
                producto = modelo.by_id(forma.id)
                geo = forma.geometry
                caras = np.asarray(geo.faces, dtype="<u4")
                # O001 cuenta todos los triángulos del modelo (también aperturas,
                # espacios y anotaciones); el visor solo recibe los elementos.
                triangulos += len(caras) // 3
                if producto is not None and self._es_elemento(producto):
                    gid = _texto(getattr(producto, "GlobalId", ""))
                    datos = por_id.get(forma.id)
                    if datos is None:
                        clase = producto.is_a()
                        categoria = _categoria(clase)
                        datos = {
                            "globalid": gid,
                            "clase": clase,
                            "nombre": _texto(getattr(producto, "Name", "")),
                            "nivel": self._nivel_de(producto),
                            "color": COLOR.get(categoria, COLOR["otros"]),
                            "opacidad": OPACIDAD.get(categoria, 1.0),
                            "categoria": categoria,
                            "vertices": [],
                            "indices": [],
                            "_base": 0,
                        }
                        por_id[forma.id] = datos
                    base = datos["_base"]
                    datos["vertices"].append(np.asarray(geo.verts, dtype="<f4"))
                    datos["indices"].append(caras + np.uint32(base))
                    datos["_base"] = base + len(geo.verts) // 3
                if not it.next():
                    break

        salida = []
        for datos in por_id.values():
            if not datos["indices"]:
                continue
            vertices = np.concatenate(datos["vertices"]).astype("<f4", copy=False)
            indices = np.concatenate(datos["indices"]).astype("<u4", copy=False)
            datos["vertices"] = base64.b64encode(vertices.tobytes()).decode("ascii")
            datos["indices"] = base64.b64encode(indices.tobytes()).decode("ascii")
            datos.pop("_base", None)
            salida.append(datos)
        salida.sort(key=lambda d: (d["clase"], d["nombre"], d["globalid"]))
        return {"elementos": salida, "triangulos": triangulos}

    # ------------------------------------------------------------------ vistas
    def _proyecto(self) -> Any:
        modelo = self._exigir_modelo()
        proyectos = modelo.by_type("IfcProject")
        if not proyectos:
            raise ErrorNucleo("El modelo no tiene IfcProject.", -32006)
        return proyectos[0]

    def _pset_vistas(self, crear: bool) -> Any:
        proyecto = self._proyecto()
        for rel in getattr(proyecto, "IsDefinedBy", ()) or ():
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            pset = getattr(rel, "RelatingPropertyDefinition", None)
            if pset is not None and getattr(pset, "Name", "") == "OPENRVT_Vistas":
                return pset
        if not crear:
            return None
        modelo = self._exigir_modelo()
        pset = modelo.create_entity(
            "IfcPropertySet",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name="OPENRVT_Vistas",
            Description="Vistas guardadas por OPEN-RVT",
            HasProperties=[],
        )
        modelo.create_entity(
            "IfcRelDefinesByProperties",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=None,
            Description=None,
            RelatedObjects=[proyecto],
            RelatingPropertyDefinition=pset,
        )
        return pset

    def leer_vistas(self) -> list[Any]:
        pset = self._pset_vistas(crear=False)
        if pset is None:
            return []
        for propiedad in getattr(pset, "HasProperties", ()) or ():
            if getattr(propiedad, "Name", "") != "Datos":
                continue
            valor = getattr(propiedad, "NominalValue", None)
            texto = getattr(valor, "wrappedValue", None)
            if texto is None:
                texto = getattr(valor, "wrapped_value", None)
            if texto is None:
                continue
            try:
                datos = json.loads(texto)
            except (TypeError, ValueError):
                return []
            return datos if isinstance(datos, list) else []
        return []

    def guardar_vistas(self, lista: Any) -> list[Any]:
        if not isinstance(lista, list):
            raise ErrorNucleo("Las vistas deben ser una lista.", -32602)
        self._exigir_modelo()
        texto = json.dumps(lista, ensure_ascii=False, separators=(",", ":"))
        self._instantanea()
        pset = self._pset_vistas(crear=True)
        modelo = self._exigir_modelo()
        for propiedad in list(getattr(pset, "HasProperties", ()) or ()):
            if getattr(propiedad, "Name", "") == "Datos":
                modelo.remove(propiedad)
        pset.HasProperties = list(getattr(pset, "HasProperties", ()) or ()) + [
            modelo.create_entity(
                "IfcPropertySingleValue",
                Name="Datos",
                Description="JSON de las vistas",
                NominalValue=modelo.create_entity("IfcText", texto),
            )
        ]
        self.con_cambios = True
        return lista

    # ------------------------------------------------------------------ historial
    def deshacer(self) -> dict[str, Any]:
        self._exigir_modelo()
        if not self._deshacer:
            return {"hecho": False, "motivo": "No hay nada que deshacer."}
        actual = self.modelo.to_string()
        self.modelo = ifcopenshell.file.from_string(self._deshacer.pop())
        self._rehacer.append(actual)
        self.con_cambios = True
        return {"hecho": True}

    def rehacer(self) -> dict[str, Any]:
        self._exigir_modelo()
        if not self._rehacer:
            return {"hecho": False, "motivo": "No hay nada que rehacer."}
        actual = self.modelo.to_string()
        self.modelo = ifcopenshell.file.from_string(self._rehacer.pop())
        self._deshacer.append(actual)
        self.con_cambios = True
        return {"hecho": True}
