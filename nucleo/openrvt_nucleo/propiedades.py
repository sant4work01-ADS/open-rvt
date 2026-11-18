"""Propiedades de un elemento para el panel derecho (O067 lo separa de modelo.py)."""

from __future__ import annotations

import logging
import math
from typing import Any

LOG = logging.getLogger("openrvt_nucleo.propiedades")


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


class PropiedadesMixin:
    def _nivel_globalid_de(self, elemento: Any) -> str:
        """O067: GlobalId del nivel que contiene al elemento (no solo su nombre)."""
        for rel in getattr(elemento, "ContainedInStructure", ()) or ():
            estructura = getattr(rel, "RelatingStructure", None)
            if estructura is not None and estructura.is_a("IfcBuildingStorey"):
                return _texto(estructura.GlobalId)
        nombre = self._nivel_de(elemento)
        if nombre:
            for nivel in self.modelo.by_type("IfcBuildingStorey"):
                if _texto(nivel.Name) == nombre:
                    return _texto(nivel.GlobalId)
        return ""

    def propiedades(self, globalid: str) -> dict[str, Any]:
        from .modelo import ErrorNucleo

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

        # O054: en Propiedades, «Nivel» se muestra con el nombre del nivel (el
        # GlobalId guardado en el IFC no cambia).
        estructura = psets.get("OPENRVT_Estructura")
        if isinstance(estructura, dict) and estructura.get("Nivel"):
            try:
                nivel = self._nivel_por_gid(_texto(estructura["Nivel"]))
                estructura["Nivel"] = _texto(nivel.Name)
            except Exception:
                pass

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
            # O067: el panel necesita el GlobalId del nivel actual, no el nombre.
            "nivel_globalid": self._nivel_globalid_de(elemento),
            "tipo": self._tipo_de(elemento),
            "atributos": atributos,
            "materiales": materiales,
            "psets": psets,
        }
        # O059: el uso efectivo de una losa se calcula en un solo lugar, también
        # para los IFC viejos que no traen la propiedad.
        if elemento.is_a("IfcSlab"):
            try:
                salida["uso"] = self.uso_de_losa(elemento)
            except Exception:
                LOG.debug("no se pudo leer el uso de la losa", exc_info=True)
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
