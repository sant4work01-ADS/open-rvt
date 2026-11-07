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
from .acero import AceroMixin
from .biblioteca import BibliotecaMixin
from .interacciones import InteraccionesMixin
from .medicion import MedicionMixin
from .modelado import ModeladoMixin

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
    # O049: el sólido genérico de Empujar/Tirar también cuenta en la barra; O046
    # mostraba 4 en el núcleo y 3 en la barra porque esta clase quedaba fuera.
    "IfcBuildingElementProxy",
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

# O038: categorías del árbol del proyecto (modo Modelo), en el orden en que se
# muestran. «otros» recoge los elementos que no encajan en ninguna partida.
CATEGORIAS_ARBOL = (
    ("muros", "Muros"),
    ("losas", "Losas"),
    ("columnas", "Columnas"),
    ("castillos", "Castillos"),
    ("trabes", "Trabes"),
    ("dalas_cerramientos", "Dalas y cerramientos"),
    ("zapatas", "Zapatas"),
    ("contratrabes", "Contratrabes"),
    ("puertas", "Puertas"),
    ("ventanas", "Ventanas"),
    ("otros", "Otros"),
)


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


class ModeloNucleo(
    BibliotecaMixin, ModeladoMixin, InteraccionesMixin, MedicionMixin, AceroMixin
):
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
        # En IFC4 la relación de tipo llega por IsTypedBy; en IFC2X3 por IsDefinedBy.
        relaciones = list(getattr(elemento, "IsTypedBy", ()) or ())
        relaciones += [
            rel
            for rel in (getattr(elemento, "IsDefinedBy", ()) or ())
            if rel.is_a("IfcRelDefinesByType")
        ]
        for rel in relaciones:
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
        # O007a: biblioteca de materiales y tipos de muro multicapa.
        self._crear_materiales_semilla()
        self.crear_tipos_muro()
        self.crear_tipos_ejemplo()
        self.crear_tipos_estructura()
        self._asegurar_capitulos_obra()
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
        # O007a: si el archivo no trae biblioteca, se siembra al abrirlo.
        self._asegurar_biblioteca()
        self.crear_tipos_estructura()
        # O012: los archivos anteriores pueden traer vigas encimadas; se recortan
        # al abrir sin perder elementos.
        self._recalcular_uniones_estructura()
        # O050: las losas con el punto de cierre repetido se reparan sin aviso.
        self._reparar_losas_antiguas()
        # O045: los archivos con la regla vieja (muro cortado por su cerramiento)
        # recuperan la altura de sus propias restricciones, en un solo paso.
        migracion = self._restaurar_altura_muros_embebidos()
        self._asegurar_capitulos_obra()
        info = self.info()
        if migracion:
            info["migracion"] = migracion
        return info

    def _restaurar_altura_muros_embebidos(self) -> str:
        """O045: restaura en una sola pasada la altura de los muros cortados."""
        restaurados = 0
        instantanea = False
        for muro in self.modelo.by_type("IfcWall"):
            datos = self._datos_muro(muro)
            tope_muro = float(datos["z"]) + float(datos["altura"])
            cortado = False
            for dependiente in self._dependientes_de(muro):
                if (
                    self._estructura_de_tipo(self._tipo_entidad(dependiente))
                    != "cerramiento"
                ):
                    continue
                peralte = self._peralte_de(dependiente)
                z = float(
                    self._leer_pset(dependiente, "OPENRVT_Estructura").get("Z") or 0.0
                )
                if abs(tope_muro - (z - peralte / 2.0)) <= 0.005:
                    cortado = True
                    break
            if not cortado:
                continue
            try:
                restriccion = self._restricciones_de(muro)
                if not _texto(restriccion.get("NivelTope")) and restriccion.get(
                    "AlturaSinConexion"
                ) is not None:
                    continue
                if not instantanea:
                    self._instantanea()
                    instantanea = True
                self._aplicar_restriccion(muro, restriccion)
                restaurados += 1
            except Exception:
                LOG.debug("no se pudo restaurar la altura del muro", exc_info=True)
        if not restaurados:
            return ""
        self.con_cambios = True
        return (
            f"O045: se restauró la altura de {restaurados} muro(s) que estaban "
            "cortados por su cerramiento; ahora el cerramiento va embebido."
        )

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
            # Los conteos de la barra de estado siguen las ocho clases medidas en O001;
            # el visor recibe además miembros, barandillas y otros elementos.
            if elemento.is_a() not in CLASES_OBJETIVO:
                continue
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

    # ------------------------------------------------------------------ árbol O038
    def _categoria_arbol(self, elemento: Any) -> str:
        """Categoría del árbol del proyecto para un elemento.

        Los castillos, trabes, dalas, cerramientos, zapatas y contratrabes se separan
        por el alias estructural del tipo (castillo, dala, cerramiento, contratrabe…),
        no por la clase IFC: un castillo es un IfcColumn y una trabe un IfcBeam.
        """
        clase = elemento.is_a()
        if "Wall" in clase:
            return "muros"
        if "Slab" in clase or "Plate" in clase:
            return "losas"
        if "Column" in clase:
            return (
                "castillos"
                if self._estructura_de_tipo(self._tipo_entidad(elemento)) == "castillo"
                else "columnas"
            )
        if "Footing" in clase:
            return (
                "contratrabes"
                if self._estructura_de_tipo(self._tipo_entidad(elemento)) == "contratrabe"
                else "zapatas"
            )
        if "Beam" in clase:
            alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
            if alias == "contratrabe":
                return "contratrabes"
            if alias in ("cerramiento", "dala"):
                return "dalas_cerramientos"
            return "trabes"
        if "Door" in clase:
            return "puertas"
        if "Window" in clase:
            return "ventanas"
        return "otros"

    def arbol(self) -> dict[str, Any]:
        """Jerarquía del modo Modelo ya agrupada, sin N llamadas al núcleo.

        Devuelve un árbol con nodos `{clave, nombre, tipo, conteo, hijos}`:

        - `edificio` → `nivel` (ordenado por elevación) → `categoria` → `tipo` →
          `elemento`.
        - La rama `referencias` contiene los `eje` y `nivel-ref` fuera de los niveles.
        - Los elementos sin nivel cuelgan de un nivel sintético «Sin nivel» al final.
        """
        self._exigir_modelo()
        niveles_info = self.niveles()
        gid_por_nombre = {n["nombre"]: n["globalid"] for n in niveles_info}

        # nombre del nivel -> { categoría -> { (clave_tipo, nombre_tipo, gid_tipo) -> [elementos] } }
        por_nivel: dict[str, dict[str, dict[tuple[str, str, str], list[Any]]]] = {}
        for elemento in self._elementos_ordenados():
            nombre_nivel = self._nivel_de(elemento)
            if nombre_nivel not in gid_por_nombre:
                nombre_nivel = "Sin nivel"
            categoria = self._categoria_arbol(elemento)
            tipo_entidad = self._tipo_entidad(elemento)
            if tipo_entidad is not None:
                clave_tipo = f"tipo:{_texto(tipo_entidad.GlobalId)}"
                nombre_tipo = _texto(tipo_entidad.Name) or tipo_entidad.is_a()
                gid_tipo = _texto(tipo_entidad.GlobalId)
            else:
                clave_tipo = "tipo:sin-tipo"
                nombre_tipo = self._tipo_de(elemento) or "(sin tipo)"
                gid_tipo = ""
            por_nivel.setdefault(nombre_nivel, {}).setdefault(categoria, {}).setdefault(
                (clave_tipo, nombre_tipo, gid_tipo), []
            ).append(elemento)

        def nodo_elemento(elemento: Any) -> dict[str, Any]:
            gid = _texto(elemento.GlobalId)
            return {
                "clave": f"elemento:{gid}",
                "nombre": _texto(elemento.Name) or elemento.is_a(),
                "tipo": "elemento",
                "globalid": gid,
                "clase": elemento.is_a(),
                "conteo": 1,
            }

        def nodo_nivel(info: dict[str, Any], mapa: dict[str, Any]) -> dict[str, Any]:
            gid = info["globalid"]
            hijos: list[dict[str, Any]] = []
            total = 0
            for clave_cat, nombre_cat in CATEGORIAS_ARBOL:
                tipos = mapa.get(clave_cat)
                if not tipos:
                    continue
                hijos_tipos: list[dict[str, Any]] = []
                conteo_cat = 0
                for (clave_tipo, nombre_tipo, gid_tipo), elementos in sorted(
                    tipos.items(), key=lambda kv: kv[0][1].lower()
                ):
                    hijos_tipos.append(
                        {
                            "clave": clave_tipo,
                            "nombre": nombre_tipo,
                            "tipo": "tipo",
                            **({"globalid": gid_tipo} if gid_tipo else {}),
                            "conteo": len(elementos),
                            "hijos": [nodo_elemento(e) for e in elementos],
                        }
                    )
                    conteo_cat += len(elementos)
                total += conteo_cat
                hijos.append(
                    {
                        "clave": f"categoria:{clave_cat}",
                        "nombre": nombre_cat,
                        "tipo": "categoria",
                        "categoria": clave_cat,
                        "conteo": conteo_cat,
                        "hijos": hijos_tipos,
                    }
                )
            return {
                "clave": f"nivel:{gid}",
                "nombre": info["nombre"],
                "tipo": "nivel",
                "globalid": gid,
                "elevacion": info["elevacion"],
                "conteo": total,
                "hijos": hijos,
            }

        # Niveles en orden de elevación; un nivel sin elementos aparece vacío.
        hijos_edificio = [
            nodo_nivel(info, por_nivel.get(info["nombre"], {})) for info in niveles_info
        ]
        # Elementos sueltos que no cuelgan de ningún nivel conocido.
        if "Sin nivel" in por_nivel:
            hijos_edificio.append(
                {
                    "clave": "nivel:sin-nivel",
                    "nombre": "Sin nivel",
                    "tipo": "nivel",
                    "elevacion": None,
                    "conteo": sum(
                        len(elementos)
                        for mapa in por_nivel["Sin nivel"].values()
                        for elementos in mapa.values()
                    ),
                    "hijos": nodo_nivel(
                        {"globalid": "sin-nivel", "nombre": "Sin nivel", "elevacion": 0.0},
                        por_nivel["Sin nivel"],
                    )["hijos"],
                }
            )

        ejes = self.ejes_listar()
        referencias = {
            "clave": "referencias",
            "nombre": "Referencias",
            "tipo": "referencias",
            "conteo": len(ejes) + len(niveles_info),
            "hijos": [
                {
                    "clave": "referencias:ejes",
                    "nombre": "Ejes",
                    "tipo": "grupo",
                    "conteo": len(ejes),
                    "hijos": [
                        {
                            "clave": f"eje:{e['globalid']}",
                            "nombre": e["etiqueta"],
                            "tipo": "eje",
                            "globalid": e["globalid"],
                            "conteo": 1,
                        }
                        for e in ejes
                    ],
                },
                {
                    "clave": "referencias:niveles",
                    "nombre": "Niveles",
                    "tipo": "grupo",
                    "conteo": len(niveles_info),
                    "hijos": [
                        {
                            "clave": f"nivel-ref:{n['globalid']}",
                            "nombre": n["nombre"],
                            "tipo": "nivel-ref",
                            "globalid": n["globalid"],
                            "elevacion": n["elevacion"],
                            "conteo": 1,
                        }
                        for n in niveles_info
                    ],
                },
            ],
        }
        total_elementos = sum(n["conteo"] for n in hijos_edificio)
        return {
            "clave": "edificio",
            "nombre": "Edificio",
            "tipo": "edificio",
            "conteo": total_elementos,
            "hijos": [*hijos_edificio, referencias],
        }

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

        # O052: la hoja no guarda su pset; vive en el vano. Se expone para que la
        # planta sepa el lado de abatimiento (Espacio) y la distancia real.
        if elemento.is_a("IfcDoor") or elemento.is_a("IfcWindow"):
            for rel in getattr(elemento, "FillsVoids", ()) or ():
                vano = getattr(rel, "RelatingOpeningElement", None)
                if vano is None:
                    continue
                datos_vano = self._leer_pset(vano, "OPENRVT_Abertura")
                if datos_vano:
                    psets["OPENRVT_Abertura"] = datos_vano
                break

        salida = {
            "globalid": _texto(elemento.GlobalId),
            "clase": elemento.is_a(),
            "nombre": _texto(getattr(elemento, "Name", "")),
            "nivel": self._nivel_de(elemento),
            "tipo": self._tipo_de(elemento),
            "atributos": atributos,
            "materiales": materiales,
            "psets": psets,
        }
        # O016/O028: base y tope para todo lo estructural, también sin pset.
        if (
            elemento.is_a("IfcWall")
            or elemento.is_a("IfcColumn")
            or elemento.is_a("IfcBeam")
            or elemento.is_a("IfcFooting")
        ):
            try:
                salida["restricciones"] = self._restricciones_de(elemento)
            except Exception:
                LOG.debug("no se pudieron leer las restricciones", exc_info=True)
            try:
                alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
                if alias:
                    salida["alias"] = alias
            except Exception:
                LOG.debug("no se pudo leer el alias de estructura", exc_info=True)
            try:
                enlace = self._enlace_de(elemento)
                if enlace:
                    salida["enlace"] = enlace
            except Exception:
                LOG.debug("no se pudo leer el enlace a ejes", exc_info=True)
            # O040: liga al muro de cerramientos y dalas (para el panel «Soltar del
            # muro» y la leyenda «Sigue la corona del muro …»).
            try:
                liga = self._leer_pset(elemento, "OPENRVT_Liga")
                muro_gid = _texto(liga.get("Muro"))
                if muro_gid:
                    muro = self._entidad_por_gid(muro_gid, ("IfcWall",))
                    salida["muro_liga"] = {
                        "muro": muro_gid,
                        "nombre": _texto(getattr(muro, "Name", "")),
                    }
            except Exception:
                LOG.debug("no se pudo leer la liga al muro", exc_info=True)
        return salida

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
                        capas: list[dict[str, Any]] = []
                        eje_muro: list[float] | None = None
                        try:
                            if producto.is_a("IfcWall"):
                                datos_muro = self._datos_muro(producto)
                                capas = self.capas_con_posicion(
                                    producto, datos_muro["espesor"]
                                )
                                eje_muro = [
                                    datos_muro["x1"],
                                    datos_muro["y1"],
                                    datos_muro["x2"],
                                    datos_muro["y2"],
                                ]
                            else:
                                import ifcopenshell.util.element as util_elemento

                                for material in util_elemento.get_materials(producto):
                                    for capa in (
                                        getattr(material, "MaterialLayers", ())
                                        or getattr(material, "Layers", ())
                                        or ()
                                    ):
                                        capas.append(
                                            {
                                                "material": _texto(
                                                    getattr(
                                                        getattr(capa, "Material", None),
                                                        "Name",
                                                        "",
                                                    )
                                                ),
                                                "espesor": float(
                                                    getattr(capa, "LayerThickness", 0.0) or 0.0
                                                ),
                                            }
                                        )
                        except Exception:
                            capas = []
                        estructura = None
                        try:
                            if producto.is_a("IfcColumn") or producto.is_a(
                                "IfcBeam"
                            ) or producto.is_a("IfcFooting"):
                                tipo = self._tipo_entidad(producto)
                                alias, seccion, armado = self._seccion_y_armado(tipo)
                                colocacion = self._leer_pset(
                                    producto, "OPENRVT_Estructura"
                                )
                                if alias is not None and colocacion:
                                    estructura = {
                                        "alias": alias,
                                        "seccion": seccion,
                                        "armado": armado,
                                        "datos": colocacion,
                                    }
                        except Exception:
                            estructura = None
                        datos = {
                            "globalid": gid,
                            "clase": clase,
                            "nombre": _texto(getattr(producto, "Name", "")),
                            "nivel": self._nivel_de(producto),
                            "color": COLOR.get(categoria, COLOR["otros"]),
                            "opacidad": OPACIDAD.get(categoria, 1.0),
                            "categoria": categoria,
                            "tipo": self._tipo_de(producto),
                            "capas": capas,
                            "eje": eje_muro,
                            "estructura": estructura,
                            "vertices": [],
                            "indices": [],
                            "_base": 0,
                        }
                        if estructura:
                            material_concreto = self._material_entidad("Concreto armado")
                            if material_concreto is not None:
                                datos["color"] = self._material_datos(material_concreto)["color"]
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

    def _pset_proyecto(self, nombre: str, descripcion: str, crear: bool) -> Any:
        proyecto = self._proyecto()
        for rel in getattr(proyecto, "IsDefinedBy", ()) or ():
            if not rel.is_a("IfcRelDefinesByProperties"):
                continue
            pset = getattr(rel, "RelatingPropertyDefinition", None)
            if pset is not None and getattr(pset, "Name", "") == nombre:
                return pset
        if not crear:
            return None
        modelo = self._exigir_modelo()
        pset = modelo.create_entity(
            "IfcPropertySet",
            GlobalId=ifcopenshell.guid.new(),
            OwnerHistory=None,
            Name=nombre,
            Description=descripcion,
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

    def _pset_vistas(self, crear: bool) -> Any:
        return self._pset_proyecto(
            "OPENRVT_Vistas", "Vistas guardadas por OPEN-RVT", crear
        )

    def _pset_estilos(self, crear: bool) -> Any:
        return self._pset_proyecto(
            "OPENRVT_Estilos", "Estilos de dibujo guardados por OPEN-RVT", crear
        )

    def _leer_datos_pset(self, pset: Any) -> Any:
        if pset is None:
            return None
        for propiedad in getattr(pset, "HasProperties", ()) or ():
            if getattr(propiedad, "Name", "") != "Datos":
                continue
            valor = getattr(propiedad, "NominalValue", None)
            texto = getattr(valor, "wrappedValue", None)
            if texto is None:
                texto = getattr(valor, "wrapped_value", None)
            if texto is None:
                return None
            try:
                return json.loads(texto)
            except (TypeError, ValueError):
                return None
        return None

    def _guardar_datos_pset(self, pset: Any, datos: Any, descripcion: str) -> Any:
        texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
        modelo = self._exigir_modelo()
        for propiedad in list(getattr(pset, "HasProperties", ()) or ()):
            if getattr(propiedad, "Name", "") == "Datos":
                modelo.remove(propiedad)
        pset.HasProperties = list(getattr(pset, "HasProperties", ()) or ()) + [
            modelo.create_entity(
                "IfcPropertySingleValue",
                Name="Datos",
                Description=descripcion,
                NominalValue=modelo.create_entity("IfcText", texto),
            )
        ]
        return datos

    def leer_vistas(self) -> list[Any]:
        datos = self._leer_datos_pset(self._pset_vistas(crear=False))
        return datos if isinstance(datos, list) else []

    def guardar_vistas(self, lista: Any) -> list[Any]:
        if not isinstance(lista, list):
            raise ErrorNucleo("Las vistas deben ser una lista.", -32602)
        self._exigir_modelo()
        self._instantanea()
        self._guardar_datos_pset(self._pset_vistas(crear=True), lista, "JSON de las vistas")
        self.con_cambios = True
        return lista

    # ------------------------------------------------------------------ estilos O005
    def leer_estilos(self) -> Any:
        datos = self._leer_datos_pset(self._pset_estilos(crear=False))
        return datos if isinstance(datos, dict) else None

    def guardar_estilos(self, datos: Any) -> Any:
        if not isinstance(datos, dict):
            raise ErrorNucleo("Los estilos deben ser un objeto JSON.", -32602)
        self._exigir_modelo()
        self._instantanea()
        self._guardar_datos_pset(
            self._pset_estilos(crear=True), datos, "JSON de los estilos de dibujo"
        )
        self.con_cambios = True
        return datos

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
