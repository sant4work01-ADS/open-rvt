"""O066: detección de IFC ajeno y siembra perezosa.

Un IFC ajeno no se toca al abrirlo.  La biblioteca y los tipos se siembran con
el primer comando que crea un elemento OPEN-RVT, después de que el comando haya
tomado su instantánea: así un solo «Deshacer» devuelve el archivo original.
"""

from __future__ import annotations

import functools
from typing import Any, Callable, TypeVar

from .ajeno import es_ifc_ajeno

F = TypeVar("F", bound=Callable[..., Any])


def crea_openrvt(metodo: F) -> F:
    """Marca el comando como creador de elementos OPEN-RVT."""

    @functools.wraps(metodo)
    def envoltura(self: Any, *args: Any, **kwargs: Any) -> Any:
        anterior = getattr(self, "_comando_crea_openrvt", False)
        self._comando_crea_openrvt = True
        try:
            # O066: en un IFC ajeno la instantánea se toma aquí, antes de que el
            # comando cree tipos; la siembra entra en esa misma instantánea.
            if getattr(self, "_siembra_pendiente", False) and getattr(
                self, "modelo", None
            ) is not None:
                self._instantanea()
                self._instantanea_de_siembra = True
            return metodo(self, *args, **kwargs)
        finally:
            self._instantanea_de_siembra = False
            self._comando_crea_openrvt = anterior

    return envoltura  # type: ignore[return-value]


class SiembraMixin:
    def _preparar_abierto(self, modelo: Any) -> None:
        self.ajeno = es_ifc_ajeno(modelo)
        self._siembra_pendiente = self.ajeno
        self._comando_crea_openrvt = False

    def _sembrar_biblioteca_y_tipos(self) -> None:
        self._asegurar_biblioteca()
        self.crear_tipos_estructura()
        self.crear_tipos_muro()

    def _siembra_en_instantanea(self) -> None:
        if not getattr(self, "_siembra_pendiente", False):
            return
        if not getattr(self, "_comando_crea_openrvt", False):
            return
        self._siembra_pendiente = False
        self._sembrar_biblioteca_y_tipos()
