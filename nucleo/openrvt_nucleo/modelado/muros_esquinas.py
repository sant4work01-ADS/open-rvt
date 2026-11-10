"""Esquinas e ingletes de muros (O010)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class MurosEsquinasMixin:
    # ------------------------------------------------ esquinas de muros (O010)
    @staticmethod
    def _punto_local(datos: dict[str, Any], u: float, v: float) -> tuple[float, float]:
        dx, dy = datos["dx"], datos["dy"]
        return (
            datos["x1"] + dx * u - dy * v,
            datos["y1"] + dy * u + dx * v,
        )

    @staticmethod
    def _punto_en_local(
        datos: dict[str, Any], x: float, y: float
    ) -> tuple[float, float]:
        dx, dy = datos["dx"], datos["dy"]
        wx, wy = x - datos["x1"], y - datos["y1"]
        return (wx * dx + wy * dy, -wx * dy + wy * dx)

    @staticmethod
    def _corta_rectas(
        p1: tuple[float, float],
        n1: tuple[float, float],
        p2: tuple[float, float],
        n2: tuple[float, float],
    ) -> tuple[float, float] | None:
        """Intersección de las rectas n1·x = n1·p1 y n2·x = n2·p2."""
        det = n1[0] * n2[1] - n1[1] * n2[0]
        if abs(det) <= 1e-9:
            return None
        c1 = n1[0] * p1[0] + n1[1] * p1[1]
        c2 = n2[0] * p2[0] + n2[1] * p2[1]
        return (
            (c1 * n2[1] - c2 * n1[1]) / det,
            (n1[0] * c2 - n2[0] * c1) / det,
        )

    def _huella_local_muro(
        self, muro: Any, datos: dict[str, Any], offset: float
    ) -> list[tuple[float, float]]:
        largo = max(datos["longitud"], 0.001)
        espesor = max(datos["espesor"], 0.001)
        bajo, alto = offset, offset + espesor
        # Polígono convexo en coordenadas locales (u a lo largo, v a lo ancho).
        poligono: list[tuple[float, float]] = [
            (0.0, bajo),
            (largo, bajo),
            (largo, alto),
            (0.0, alto),
        ]
        otros = [otro for otro in self.modelo.by_type("IfcWall") if otro != muro]
        x1, y1, x2, y2 = datos["x1"], datos["y1"], datos["x2"], datos["y2"]
        for otro in otros:
            datos_otro = self._datos_muro(otro)
            offset_otro = self._desfase_de_muro(otro, datos_otro["espesor"])
            ox1, oy1 = datos_otro["x1"], datos_otro["y1"]
            ox2, oy2 = datos_otro["x2"], datos_otro["y2"]
            # Unión en L: coinciden los extremos de los dos muros.
            for px, py, fin in ((x1, y1, "ATSTART"), (x2, y2, "ATEND")):
                for qx, qy, fin_otro in (
                    (ox1, oy1, "ATSTART"),
                    (ox2, oy2, "ATEND"),
                ):
                    if math.hypot(px - qx, py - qy) <= TOLERANCIA:
                        poligono = self._ingletear(
                            poligono,
                            datos,
                            offset,
                            datos_otro,
                            offset_otro,
                            fin,
                            fin_otro,
                        )
            # Unión en T: el extremo de este muro llega al interior del otro.
            for px, py, fin in ((x1, y1, "ATSTART"), (x2, y2, "ATEND")):
                proyeccion = self._proyectar_en_eje(px, py, ox1, oy1, ox2, oy2)
                if proyeccion is None:
                    continue
                t, _qx, _qy, separacion = proyeccion
                if not (0.01 < t < 0.99):
                    continue
                if separacion <= max(datos_otro["espesor"], 0.001) / 2.0 + TOLERANCIA:
                    poligono = self._recortar_en_cara(
                        poligono, datos, datos_otro, offset_otro, fin
                    )
        return poligono

    def _ingletear(
        self,
        poligono: list[tuple[float, float]],
        datos: dict[str, Any],
        offset: float,
        datos_otro: dict[str, Any],
        offset_otro: float,
        fin: str,
        fin_otro: str,
    ) -> list[tuple[float, float]]:
        """Corta el extremo del muro con la línea de inglete común a los dos muros."""
        dx, dy = datos["dx"], datos["dy"]
        odx, ody = datos_otro["dx"], datos_otro["dy"]
        # Normal izquierda de cada muro (coordenada v local).
        n = (-dy, dx)
        no = (-ody, odx)
        # Punto de la esquina.
        if fin == "ATEND":
            esquina = (datos["x2"], datos["y2"])
        else:
            esquina = (datos["x1"], datos["y1"])
        # Dirección del otro muro alejándose de la esquina.
        if fin_otro == "ATEND":
            alejado_otro = (-odx, -ody)
        else:
            alejado_otro = (odx, ody)
        # ¿El otro cuerpo queda del lado izquierdo de este muro?
        otro_izquierda = alejado_otro[0] * n[0] + alejado_otro[1] * n[1] >= 0.0
        # Dirección de este muro entrando desde la esquina.
        if fin == "ATEND":
            dentro = (-dx, -dy)
        else:
            dentro = (dx, dy)
        # ¿Este cuerpo queda del lado izquierdo del otro muro?
        este_izquierda = dentro[0] * no[0] + dentro[1] * no[1] >= 0.0

        espesor = max(datos["espesor"], 0.001)
        espesor_otro = max(datos_otro["espesor"], 0.001)
        v_bajo, v_alto = offset, offset + espesor
        v_otro_bajo = offset_otro
        v_otro_alto = offset_otro + espesor_otro
        v_inner = v_alto if otro_izquierda else v_bajo
        v_outer = v_bajo if otro_izquierda else v_alto
        v_otro_inner = v_otro_alto if este_izquierda else v_otro_bajo
        v_otro_outer = v_otro_bajo if este_izquierda else v_otro_alto

        def linea(punto: tuple[float, float], normal: tuple[float, float], v: float):
            # Punto de la recta de la cara v del muro con esa normal.
            return (punto[0] + normal[0] * v, punto[1] + normal[1] * v)

        # Las coordenadas v son distancias sobre la normal, y la recta pasa por el
        # origen local del muro: se usa el punto del extremo correspondiente.
        origen = (datos["x1"], datos["y1"])
        origen_otro = (datos_otro["x1"], datos_otro["y1"])
        p_inner = self._corta_rectas(
            linea(origen, n, v_inner), n, linea(origen_otro, no, v_otro_inner), no
        )
        p_outer = self._corta_rectas(
            linea(origen, n, v_outer), n, linea(origen_otro, no, v_otro_outer), no
        )
        if p_inner is None or p_outer is None:
            return poligono
        # Una esquina sana no puede alejarse más que unos espesores del extremo.
        limite = 3.0 * max(espesor, espesor_otro) + 0.05
        for p in (p_inner, p_outer):
            if math.hypot(p[0] - esquina[0], p[1] - esquina[1]) > limite:
                return poligono
        li = self._punto_en_local(datos, *p_inner)
        lo = self._punto_en_local(datos, *p_outer)
        if fin == "ATEND":
            if otro_izquierda:
                # (largo,bajo) es la cara exterior y (largo,alto) la interior.
                poligono[1] = lo
                poligono[2] = li
            else:
                poligono[1] = li
                poligono[2] = lo
        else:
            if otro_izquierda:
                poligono[3] = li
                poligono[0] = lo
            else:
                poligono[3] = lo
                poligono[0] = li
        return poligono

    def _recortar_en_cara(
        self,
        poligono: list[tuple[float, float]],
        datos: dict[str, Any],
        datos_otro: dict[str, Any],
        offset_otro: float,
        fin: str,
    ) -> list[tuple[float, float]]:
        """Recorta el muro que llega contra la cara próxima del muro pasante."""
        odx, ody = datos_otro["dx"], datos_otro["dy"]
        no = (-ody, odx)
        if fin == "ATEND":
            dentro = (-datos["dx"], -datos["dy"])
        else:
            dentro = (datos["dx"], datos["dy"])
        este_izquierda = dentro[0] * no[0] + dentro[1] * no[1] >= 0.0
        cara = offset_otro + (datos_otro["espesor"] if este_izquierda else 0.0)
        # n·p = c define la cara del muro pasante.
        c = no[0] * datos_otro["x1"] + no[1] * datos_otro["y1"] + cara
        # n·p - c >= 0 es el lado exterior del pasante (el que mira al muro que llega).
        signo = 1.0 if este_izquierda else -1.0
        salida: list[tuple[float, float]] = []
        for i, actual in enumerate(poligono):
            siguiente = poligono[(i + 1) % len(poligono)]
            wa = self._punto_local(datos, *actual)
            wb = self._punto_local(datos, *siguiente)
            da = signo * (no[0] * wa[0] + no[1] * wa[1] - c)
            db = signo * (no[0] * wb[0] + no[1] * wb[1] - c)
            dentro_a = da >= -1e-9
            dentro_b = db >= -1e-9
            if dentro_a:
                salida.append(actual)
            if dentro_a != dentro_b:
                t = da / (da - db)
                u = actual[0] + (siguiente[0] - actual[0]) * t
                v = actual[1] + (siguiente[1] - actual[1]) * t
                salida.append((u, v))
        return salida if len(salida) >= 3 else poligono


    @staticmethod
    def _desfase_alineacion(alineacion: str, espesor: float) -> float:
        # El cuerpo del muro se extiende desde `offset` hasta `offset + espesor`
        # en el eje local Y. «Centro» deja el eje en la mitad del muro.
        if alineacion == "exterior":
            return -espesor
        if alineacion == "interior":
            return 0.0
        return -espesor / 2.0

    def _quitar_representaciones(self, producto: Any, identificador: str) -> None:
        forma = getattr(producto, "Representation", None)
        if forma is None:
            return
        conservar = []
        quitar = []
        for rep in list(getattr(forma, "Representations", ()) or []):
            if getattr(rep, "RepresentationIdentifier", None) == identificador:
                quitar.append(rep)
            else:
                conservar.append(rep)
        if not quitar:
            return
        forma.Representations = conservar
        for rep in quitar:
            try:
                geometry_api.remove_representation(self.modelo, representation=rep)
            except Exception:
                LOG.debug("no se pudo quitar una representación", exc_info=True)
        if not conservar:
            producto.Representation = None
            try:
                self.modelo.remove(forma)
            except Exception:
                pass

    def _regenerar_muro(self, muro: Any) -> None:
        self._quitar_representaciones(muro, "Body")
        cuerpo = self._cuerpo_muro(muro)
        cuerpo.RepresentationIdentifier = "Body"
        geometry_api.assign_representation(self.modelo, product=muro, representation=cuerpo)
        self._regenerar_eje(muro)
        self._unir_muros(muro)
        # O032: las losas cuyos bordes se apoyan en este muro se regeneran.
        self._regenerar_losas_de_bordes({_gid(muro)})

    def _regenerar_eje(self, muro: Any) -> None:
        datos = self._datos_muro(muro)
        try:
            self._quitar_representaciones(muro, "Axis")
            contexto = self._contexto("Axis", "GRAPH_VIEW")
            eje = geometry_api.add_axis_representation(
                self.modelo,
                context=contexto,
                axis=[(0.0, 0.0, 0.0), (datos["longitud"], 0.0, 0.0)],
            )
            eje.RepresentationIdentifier = "Axis"
            geometry_api.assign_representation(self.modelo, product=muro, representation=eje)
        except Exception:
            LOG.debug("no se pudo crear el eje del muro", exc_info=True)

