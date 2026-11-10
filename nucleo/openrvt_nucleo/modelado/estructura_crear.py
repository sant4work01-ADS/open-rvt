"""Creación de columnas, vigas y zapatas."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class EstructuraCrearMixin:
    @crea_openrvt
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
        desfase: float = 0.0,
    ) -> dict[str, Any]:
        self._exigir_modelo()
        tipo_entidad = self._tipo_estructura(tipo, ("IfcColumnType",))
        nivel_entidad = self._nivel_por_gid(nivel)
        try:
            x, y, rotacion = float(x), float(y), float(rotacion)
            desfase = float(desfase)
        except (TypeError, ValueError) as exc:
            raise self._error("La posición de la columna no es numérica.", -32602) from exc
        if not math.isfinite(desfase):
            raise self._error("El desfase de la columna no es un número.", -32602)
        elevacion = float(nivel_entidad.Elevation or 0.0) + desfase
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
                "DesfaseBase": desfase,
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

    @crea_openrvt
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
        # O036: contratrabes y trabes trazados entre cruces quedan enlazados.
        if alias in ("contratrabe", "trabe"):
            self._enlazar_auto_tramo(viga, x1, y1, x2, y2)
        self._regenerar_estructura(viga)
        spatial_api.assign_container(
            self.modelo, products=[viga], relating_structure=nivel_entidad
        )
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado([viga], mensaje=f"Viga creada ({largo:.2f} m).")

    def _alinear_corrida_a_eje(
        self, x1: float, y1: float, x2: float, y2: float, ancho: float
    ) -> tuple[float, float, float, float, float, float]:
        """O033: centra una zapata corrida sobre el eje que sigue su trazo.

        Devuelve los extremos proyectados y las prolongaciones por omisión: medio
        ancho cuando el extremo cae en un cruce de ejes, cero si no.
        """
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            return x1, y1, x2, y2, 0.0, 0.0
        ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
        grids = self.modelo.by_type("IfcGrid")
        if not grids:
            return x1, y1, x2, y2, 0.0, 0.0
        mejor: tuple[float, Any] | None = None
        for grid in grids:
            for eje in self._ejes(grid):
                ax, ay, bx, by, vx, vy, _largo_eje = self._direccion_eje(eje)
                if abs(ux * vy - uy * vx) > 0.02:
                    continue
                nx, ny = -vy, vx
                d1 = (x1 - ax) * nx + (y1 - ay) * ny
                d2 = (x2 - ax) * nx + (y2 - ay) * ny
                distancia = max(abs(d1), abs(d2))
                if distancia > max(0.75, ancho):
                    continue
                if mejor is None or distancia < mejor[0]:
                    mejor = (distancia, eje)
        if mejor is None:
            return x1, y1, x2, y2, 0.0, 0.0
        eje = mejor[1]
        ax, ay, bx, by, vx, vy, largo_eje = self._direccion_eje(eje)
        # Proyección perpendicular de los extremos sobre la recta del eje.
        t1 = (x1 - ax) * vx + (y1 - ay) * vy
        t2 = (x2 - ax) * vx + (y2 - ay) * vy
        x1, y1 = ax + vx * t1, ay + vy * t1
        x2, y2 = ax + vx * t2, ay + vy * t2
        prolongacion = ancho / 2.0
        pi = pf = 0.0
        umbral = max(0.60, ancho)
        for otro in self._ejes(self._grid_de(eje)):
            if otro is eje:
                continue
            ox, oy, _obx, _oby, wx, wy, largo_otro = self._direccion_eje(otro)
            den = vx * wy - vy * wx
            if abs(den) <= TOLERANCIA_CALCULO:
                continue
            t = ((ox - ax) * wy - (oy - ay) * wx) / den
            s = ((ox - ax) * vy - (oy - ay) * vx) / den
            if s < -TOLERANCIA or s > largo_otro + TOLERANCIA:
                continue
            cx, cy = ax + vx * t, ay + vy * t
            if math.hypot(cx - x1, cy - y1) <= umbral:
                x1, y1, pi = cx, cy, prolongacion
            if math.hypot(cx - x2, cy - y2) <= umbral:
                x2, y2, pf = cx, cy, prolongacion
        return x1, y1, x2, y2, pi, pf

    def _grid_de(self, eje: Any) -> Any:
        for grid in self.modelo.by_type("IfcGrid"):
            if eje in self._ejes(grid):
                return grid
        return self._grid()

    @crea_openrvt
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
        _alias, seccion, _armado = self._seccion_y_armado(tipo_entidad)
        if (
            float(seccion.get("DadoB") or 0.0) > 0
            and float(seccion.get("DadoH") or 0.0) > 0
            and desplante <= float(seccion.get("Peralte") or 0.25) + TOLERANCIA_CALCULO
        ):
            raise self._error(
                "El desplante es menor que el peralte: el dado no cabe.", -32602
            )
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
        # O033: el único dato vertical de la zapata es su desplante bajo el nivel.
        self._guardar_pset(
            zapata,
            PSET_RESTRICCIONES,
            {"NivelBase": _gid(nivel_entidad), "Desplante": desplante},
        )
        self._guardar_enlace_punto(zapata, eje_a, eje_b, x, y)
        self._regenerar_estructura(zapata)
        spatial_api.assign_container(
            self.modelo, products=[zapata], relating_structure=nivel_entidad
        )
        self.con_cambios = True
        return self._resultado([zapata], mensaje="Zapata creada.")

    @crea_openrvt
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
        ancho = float(seccion.get("Ancho") or 0.60)
        # O033: al trazar sobre un eje, la pieza queda centrada y llega a los
        # cruces prolongándose medio ancho para cerrar las esquinas.
        x1, y1, x2, y2, prolongacion_inicio, prolongacion_fin = (
            self._alinear_corrida_a_eje(x1, y1, x2, y2, ancho)
        )
        largo = math.hypot(x2 - x1, y2 - y1)
        if largo <= TOLERANCIA_CALCULO:
            raise self._error("La zapata corrida necesita dos puntos distintos.", -32602)
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
                "ProlongacionInicio": prolongacion_inicio,
                "ProlongacionFin": prolongacion_fin,
                "Desplante": desplante, "Z": elevacion - desplante + alto / 2.0,
                "Nivel": nivel,
            },
        )
        # O033: el único dato vertical de la zapata es su desplante bajo el nivel.
        self._guardar_pset(
            zapata,
            PSET_RESTRICCIONES,
            {"NivelBase": _gid(nivel_entidad), "Desplante": desplante},
        )
        self._regenerar_estructura(zapata)
        spatial_api.assign_container(
            self.modelo, products=[zapata], relating_structure=nivel_entidad
        )
        self.con_cambios = True
        return self._resultado([zapata], mensaje=f"Zapata corrida creada ({largo:.2f} m).")

