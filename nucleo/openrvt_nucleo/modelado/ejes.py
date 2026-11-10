"""Ejes: listar, crear, editar y borrar."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EjesMixin:
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

