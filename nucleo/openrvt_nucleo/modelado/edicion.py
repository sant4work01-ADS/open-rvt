"""Edición general: mover elementos."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EdicionMixin:
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
        if entidad.is_a("IfcDoor") or entidad.is_a("IfcWindow"):
            # O052: mover o borrar la hoja debe arrastrar su vano; si no, queda un
            # hueco en el muro sin puerta y el área neta del muro no cuadra.
            for rel in getattr(entidad, "FillsVoids", ()) or ():
                vano = getattr(rel, "RelatingOpeningElement", None)
                if vano is not None:
                    return [entidad, vano]
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
        # O041: un cerramiento ligado no se mueve solo; su eje lo manda el muro.
        for gid in gids:
            entidad = self._entidad_por_gid(gid)
            muro_liga = self._muro_ligado_de(entidad)
            if muro_liga and muro_liga not in gids:
                raise self._error(
                    f"El cerramiento «{_nombre(entidad)}» está ligado al muro "
                    f"«{muro_liga}»: mueva el muro o use «Soltar del muro».",
                    -32602,
                )
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
        # O052: al mover una puerta/ventana se mueve su vano y se actualiza la
        # distancia sobre el muro; si el muro también va en la selección, sus vanos
        # cuelgan de él y no hay que tocar el pset.
        muros_movidos = {
            _gid(self._entidad_por_gid(gid))
            for gid in gids
            if self._entidad_por_gid(gid).is_a("IfcWall")
        }
        cambios_vanos: list[tuple[Any, Any, dict[str, Any]]] = []
        for producto in afectados:
            if not producto.is_a("IfcOpeningElement"):
                continue
            datos = self._datos_abertura(producto)
            if not datos or datos["muro"] in muros_movidos:
                continue
            muro = self._entidad_por_gid(datos["muro"], ("IfcWall",))
            info_muro = self._datos_muro(muro)
            distancia = datos["distancia"] + dx * info_muro["dx"] + dy * info_muro["dy"]
            antepecho = datos["antepecho"] + dz
            if distancia < -TOLERANCIA_CALCULO or (
                distancia + datos["ancho"] > info_muro["longitud"] + TOLERANCIA
            ):
                raise self._error("La abertura se sale del muro al moverla.", -32023)
            if antepecho < -TOLERANCIA_CALCULO or (
                antepecho + datos["alto"] > info_muro["altura"] + TOLERANCIA
            ):
                raise self._error("La abertura se sale de la altura del muro.", -32023)
            cambios_vanos.append(
                (producto, muro, {**datos, "distancia": distancia, "antepecho": antepecho})
            )
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
        for vano, muro, datos in cambios_vanos:
            self._guardar_vano(vano, datos)
            self._regenerar_muro(muro)
            relleno = self._relleno_de(vano)
            if relleno is not None:
                self._regenerar_relleno(relleno, vano)
        for producto in afectados:
            if producto.is_a("IfcWall"):
                self._unir_muros(producto)
                # O007c: castillos, cerramientos y dalas siguen al muro.
                self._actualizar_dependientes_muro(producto)
        self._recalcular_uniones_estructura()
        # O035: mover la cimentación recalcula la base de los muros encima.
        if any(self._es_cimentacion_bajo_muro(p) for p in afectados):
            self._actualizar_muros_sobre_cimentacion()
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

    def _muro_ligado_de(self, entidad: Any) -> str:
        """O041: GlobalId del muro al que cuelga un cerramiento, o cadena vacía."""
        try:
            if self._estructura_de_tipo(self._tipo_entidad(entidad)) != "cerramiento":
                return ""
            return _texto(self._leer_liga(entidad).get("Muro"))
        except Exception:
            return ""

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

