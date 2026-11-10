"""Borrado y copia de entidades."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class BorrarMixin:
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
        cimentacion_borrada = False
        # GlobalId en lugar de id(): los envoltorios de IfcOpenShell se liberan al
        # borrarlos y Python puede reutilizar su dirección de memoria.
        vistos: set[str] = set()
        # O052: al borrar una puerta/ventana (o su vano) el muro debe regenerarse
        # para cerrar el hueco; si no, el área neta sigue descontando la abertura.
        muros_a_regenerar: set[str] = set()
        for gid in expandidos:
            try:
                entidad = self._entidad_por_gid(gid)
            except Exception:
                continue
            if self._es_cimentacion_bajo_muro(entidad):
                cimentacion_borrada = True
            productos = self._productos_de(_gid(entidad))
            # De relleno a vano y de vano a muro, para no dejar relaciones colgando.
            for producto in reversed(productos):
                if _gid(producto) in vistos:
                    continue
                vistos.add(_gid(producto))
                if producto.is_a("IfcOpeningElement"):
                    datos_vano = self._datos_abertura(producto)
                    if datos_vano and datos_vano["muro"]:
                        muros_a_regenerar.add(datos_vano["muro"])
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
        for muro_gid in muros_a_regenerar:
            try:
                muro = self._entidad_por_gid(muro_gid, ("IfcWall",))
                self._regenerar_muro(muro)
            except Exception:
                LOG.debug("no se pudo regenerar el muro %s", muro_gid, exc_info=True)
        self._recalcular_uniones_estructura()
        # O035: al borrar la cimentación, los muros vuelven a nacer en su nivel.
        if cimentacion_borrada:
            self._actualizar_muros_sobre_cimentacion()
        self.con_cambios = True
        return self._resultado(borrados=borrados, mensaje=f"{len(borrados)} elemento(s) borrado(s).")

    def _copiar_entidad(self, entidad: Any) -> Any:
        copia = ifcopenshell.util.element.copy(self.modelo, entidad)
        copia.GlobalId = ifcopenshell.guid.new()
        return copia

    def _desvincular_representacion(self, entidad: Any) -> None:
        """La copia superficial de IFC comparte la representación: se separa.

        Sin esto, regenerar el cuerpo de la copia borra la malla del original.
        """
        if getattr(entidad, "Representation", None) is not None:
            entidad.Representation = self.modelo.create_entity(
                "IfcProductDefinitionShape", Representations=[]
            )

    def _copiar_restricciones(self, original: Any, copia: Any) -> None:
        """O036: copiar un elemento enlazado conserva su enlace y sus niveles."""
        datos = self._leer_pset(original, PSET_RESTRICCIONES)
        if datos:
            self._guardar_pset(copia, PSET_RESTRICCIONES, datos)

