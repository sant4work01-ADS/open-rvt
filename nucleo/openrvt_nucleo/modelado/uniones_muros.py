"""Unión de muros y ajuste a ejes."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class UnionesMurosMixin:
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

    def _anotar_rebote(self, elemento: Any) -> None:
        if not hasattr(self, "_regenerados_de_rebote") or self._regenerados_de_rebote is None:
            self._regenerados_de_rebote = []
        gid = _gid(elemento)
        if gid and gid not in self._regenerados_de_rebote:
            self._regenerados_de_rebote.append(gid)

    def _regenerar_representacion_unida(self, muro: Any) -> bool:
        """O010: reconstruye el cuerpo con el inglete/recorte de sus uniones."""
        self._anotar_rebote(muro)
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

