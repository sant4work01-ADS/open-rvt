"""Alinear elementos a una referencia (O026)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class AlinearMixin:
    # ------------------------------------------------------------------ alinear (O026)
    def _linea_de(self, entidad: Any) -> tuple[float, float, float, float, float]:
        """Eje medio en planta y medio ancho perpendicular de un elemento."""
        if entidad.is_a("IfcWall"):
            datos = self._datos_muro(entidad)
            largo = math.hypot(datos["dx"], datos["dy"]) or 1.0
            return (
                datos["x1"],
                datos["y1"],
                datos["dx"] / largo,
                datos["dy"] / largo,
                float(datos["espesor"]) / 2.0,
            )
        if entidad.is_a("IfcSlab"):
            contorno = _texto(self._leer_pset(entidad, "OPENRVT_Losa").get("Contorno"))
            try:
                from shapely import wkt as shapely_wkt

                poligono = shapely_wkt.loads(contorno)
                x1, y1, x2, y2 = poligono.bounds
                anillo = list(poligono.exterior.coords)
                dx = float(anillo[1][0]) - float(anillo[0][0])
                dy = float(anillo[1][1]) - float(anillo[0][1])
                largo = math.hypot(dx, dy) or 1.0
                return (
                    (x1 + x2) / 2.0,
                    (y1 + y2) / 2.0,
                    dx / largo,
                    dy / largo,
                    min(x2 - x1, y2 - y1) / 2.0,
                )
            except Exception as exc:  # pragma: no cover - contorno ajeno
                raise self._error("La losa no tiene un contorno editable.", -32028) from exc
        datos = self._leer_pset(entidad, "OPENRVT_Estructura")
        if entidad.is_a("IfcColumn"):
            x = float(datos.get("X") or 0.0)
            y = float(datos.get("Y") or 0.0)
            rotacion = float(datos.get("Rotacion") or 0.0)
            ux, uy = math.cos(rotacion), math.sin(rotacion)
            _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(entidad))
            ancho = float(seccion.get("B") or seccion.get("Ancho") or 0.30)
            alto = float(seccion.get("H") or seccion.get("Largo") or 0.30)
            return x, y, ux, uy, alto / 2.0
        if entidad.is_a("IfcBeam") or entidad.is_a("IfcFooting"):
            x1 = float(datos.get("X1") or datos.get("X") or 0.0)
            y1 = float(datos.get("Y1") or datos.get("Y") or 0.0)
            x2 = float(datos.get("X2") or x1)
            y2 = float(datos.get("Y2") or y1)
            dx, dy = x2 - x1, y2 - y1
            largo = math.hypot(dx, dy)
            if largo <= TOLERANCIA_CALCULO:
                rotacion = float(datos.get("Rotacion") or 0.0)
                dx, dy = math.cos(rotacion), math.sin(rotacion)
                largo = 1.0
            _, seccion, _ = self._seccion_y_armado(self._tipo_entidad(entidad))
            ancho = float(
                seccion.get("B")
                or seccion.get("Ancho")
                or seccion.get("Largo")
                or 0.30
            )
            return x1, y1, dx / largo, dy / largo, ancho / 2.0
        raise self._error("Ese elemento no se puede alinear.", -32602)

    def _linea_referencia(self, referencia: Any) -> tuple[float, float, float, float, str]:
        """Punto, dirección y tipo de la línea de referencia de una alineación."""
        if isinstance(referencia, str):
            referencia = {"tipo": "eje", "globalid": referencia}
        if not isinstance(referencia, dict):
            raise self._error("La referencia de la alineación no es válida.", -32602)
        tipo = _texto(referencia.get("tipo") or "eje").casefold()
        gid = _texto(referencia.get("globalid") or referencia.get("id") or "")
        cara = _texto(referencia.get("cara") or "centro").casefold()
        if tipo == "eje":
            _grid, eje = self._eje_por_gid(gid)
            x1, y1, _x2, _y2, ux, uy, _largo = self._direccion_eje(eje)
            return x1, y1, ux, uy, "eje"
        if tipo == "nivel":
            self._nivel_por_gid(gid)
            return 0.0, 0.0, 1.0, 0.0, "nivel"
        entidad = self._entidad_por_gid(gid)
        x, y, ux, uy, medio = self._linea_de(entidad)
        if cara in ("cara1", "derecha", "positiva"):
            nx, ny = uy, -ux
            x, y = x + nx * medio, y + ny * medio
        elif cara in ("cara2", "izquierda", "negativa"):
            nx, ny = uy, -ux
            x, y = x - nx * medio, y - ny * medio
        return x, y, ux, uy, "elemento"

    @staticmethod
    def _alineacion_bloqueada(datos: dict[str, Any]) -> bool:
        return datos.get("AlinearBloqueada") in (True, "True", "true", 1, "1")

    def _alineados_de(self, referencia_gid: str) -> list[Any]:
        """Elementos con candado cerrado sobre esa referencia."""
        salida: list[Any] = []
        for clase in ("IfcWall", "IfcColumn", "IfcBeam", "IfcFooting", "IfcSlab"):
            for entidad in self.modelo.by_type(clase):
                datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
                if not self._alineacion_bloqueada(datos):
                    continue
                if _texto(datos.get("AlinearReferencia")) != referencia_gid:
                    continue
                salida.append(entidad)
        return salida

    def _mover_alineados_de_referencia(
        self, referencia_gid: str, dx: float, dy: float, excluir: set[str] | None = None
    ) -> list[Any]:
        """O026: los elementos con candado siguen a su referencia."""
        excluir = excluir or set()
        movidos: list[Any] = []
        for entidad in self._alineados_de(referencia_gid):
            gid = _gid(entidad)
            if gid in excluir:
                continue
            for producto in self._productos_de(gid):
                self._mover_productos([producto], dx, dy, 0.0)
                self._desplazar_pset_estructura(producto, dx, dy, 0.0)
            if entidad.is_a("IfcWall"):
                self._unir_muros(entidad)
                self._actualizar_dependientes_muro(entidad)
            movidos.append(entidad)
        return movidos

    def alinear(
        self,
        referencia: Any,
        elemento: str,
        cara: str = "cercana",
        bloquear: bool = False,
    ) -> dict[str, Any]:
        """O026: alinea un elemento con un eje, nivel o cara de otro elemento."""
        self._exigir_modelo()
        if not elemento:
            raise self._error("Seleccione el elemento que quiere alinear.", -32602)
        entidad = self._entidad_por_gid(str(elemento))
        if not (
            entidad.is_a("IfcWall")
            or entidad.is_a("IfcColumn")
            or entidad.is_a("IfcBeam")
            or entidad.is_a("IfcFooting")
            or entidad.is_a("IfcSlab")
        ):
            raise self._error("Ese elemento no se puede alinear.", -32602)
        cara = _texto(cara or "cercana").casefold()
        rx, ry, rux, ruy, tipo_ref = self._linea_referencia(referencia)
        datos_ref = referencia if isinstance(referencia, dict) else {}
        ref_gid = _texto(datos_ref.get("globalid") or datos_ref.get("id") or referencia)
        if tipo_ref == "nivel":
            cara_nivel = cara if cara in ("base", "tope") else "base"
            if cara_nivel == "tope":
                resultado = self.restricciones_editar(str(elemento), nivel_tope=ref_gid)
            else:
                resultado = self.restricciones_editar(str(elemento), nivel_base=ref_gid)
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            datos.update(
                {
                    "AlinearTipo": "nivel",
                    "AlinearReferencia": ref_gid,
                    "AlinearCara": cara_nivel,
                    "AlinearBloqueada": bool(bloquear),
                }
            )
            self._guardar_pset(entidad, PSET_RESTRICCIONES, datos)
            salida = dict(resultado)
            salida["alineacion"] = {
                "elemento": str(elemento),
                "referencia": ref_gid,
                "tipo": "nivel",
                "cara": cara_nivel,
                "bloqueada": bool(bloquear),
            }
            return salida
        if ref_gid and ref_gid == str(elemento):
            raise self._error("La referencia y el elemento deben ser distintos.", -32602)
        ex, ey, eux, euy, medio = self._linea_de(entidad)
        if abs(rux * euy - ruy * eux) > 1e-6 and (
            entidad.is_a("IfcColumn") or entidad.is_a("IfcFooting")
        ):
            # Una columna o zapata rectangular tiene dos pares de caras: se usa el
            # par paralelo a la referencia (el otro eje local).
            otro_medio = medio
            if entidad.is_a("IfcColumn"):
                _s, seccion, _a = self._seccion_y_armado(self._tipo_entidad(entidad))
                otro_medio = float(seccion.get("B") or seccion.get("Ancho") or 0.30) / 2.0
            eux, euy = -euy, eux
            medio = otro_medio
        if abs(rux * euy - ruy * eux) > 1e-6:
            raise self._error(
                "La cara del elemento no es paralela a la referencia; no se movió nada.",
                -32027,
            )
        nx, ny = ruy, -rux
        s_ref = rx * nx + ry * ny
        s_elemento = ex * nx + ey * ny
        if cara in ("centro", "eje"):
            objetivo = s_ref
        elif cara in ("cara1", "derecha", "positiva"):
            objetivo = s_ref + medio
        elif cara in ("cara2", "izquierda", "negativa"):
            objetivo = s_ref - medio
        else:
            # Cara más cercana: el elemento queda del mismo lado que ya estaba.
            lado = 1.0 if s_elemento >= s_ref else -1.0
            objetivo = s_ref + lado * medio
        delta = objetivo - s_elemento
        self._instantanea()
        try:
            if abs(delta) > TOLERANCIA_CALCULO:
                for producto in self._productos_de(str(elemento)):
                    self._mover_productos([producto], nx * delta, ny * delta, 0.0)
                    self._desplazar_pset_estructura(producto, nx * delta, ny * delta, 0.0)
                if entidad.is_a("IfcWall"):
                    self._unir_muros(entidad)
                    self._actualizar_dependientes_muro(entidad)
                elif entidad.is_a("IfcColumn"):
                    for zapata in self._zapatas_de_columna(entidad):
                        self._mover_productos([zapata], nx * delta, ny * delta, 0.0)
            self._recalcular_uniones_estructura()
            datos = self._leer_pset(entidad, PSET_RESTRICCIONES)
            datos.update(
                {
                    "AlinearTipo": tipo_ref,
                    "AlinearReferencia": ref_gid,
                    "AlinearCara": cara,
                    "AlinearBloqueada": bool(bloquear),
                }
            )
            self._guardar_pset(entidad, PSET_RESTRICCIONES, datos)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        return self._resultado(
            modificados=[entidad],
            mensaje=(
                "Elemento alineado."
                if abs(delta) > TOLERANCIA_CALCULO
                else "El elemento ya estaba alineado."
            ),
            desplazamiento=delta,
            alineacion={
                "elemento": str(elemento),
                "referencia": ref_gid,
                "tipo": tipo_ref,
                "cara": cara,
                "bloqueada": bool(bloquear),
            },
        )

