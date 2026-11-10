"""O066: ¿el IFC lo creó OPEN-RVT?

Un archivo es ajeno cuando no tiene ningún pset ``OPENRVT_*`` (ni en elementos
ni en materiales) y ninguna :class:`IfcApplication` declara OPEN-RVT.
"""

from __future__ import annotations

from typing import Any

PREFIJO = "OPENRVT_"
NOMBRE_APLICACION = "OPEN-RVT"


def _empieza_openrvt(nombre: Any) -> bool:
    return str(nombre or "").startswith(PREFIJO)


def es_ifc_ajeno(modelo: Any) -> bool:
    if modelo is None:
        return False
    for pset in modelo.by_type("IfcPropertySet"):
        if _empieza_openrvt(getattr(pset, "Name", "")):
            return False
    for propiedades in modelo.by_type("IfcMaterialProperties"):
        if _empieza_openrvt(getattr(propiedades, "Name", "")):
            return False
    for aplicacion in modelo.by_type("IfcApplication"):
        if NOMBRE_APLICACION in str(
            getattr(aplicacion, "ApplicationFullName", "") or ""
        ):
            return False
    return True
