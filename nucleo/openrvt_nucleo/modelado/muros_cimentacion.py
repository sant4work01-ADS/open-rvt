"""Bajada de muros a cimentación y partición por huecos."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class MurosCimentacionMixin:
    def _partir_huecos(self, datos: dict[str, Any], piezas: list[Any]) -> list[Any]:
        """Parte en el castillo las piezas que quedaron con hueco.

        Con acabados más anchos que el castillo, el castillo queda encerrado por el
        aplanado de ambos lados y la huella resulta un polígono con hueco. El cuerpo
        se extruye solo con el anillo exterior, así que el hueco se perdía y el muro
        rellenaba el castillo (reporte 2-nov). Se corta con una recta perpendicular
        al eje por el centro de cada hueco: quedan piezas sin huecos.
        """
        from shapely.geometry import LineString
        from shapely.ops import split

        salida: list[Any] = []
        pendientes = list(piezas)
        vueltas = 0
        while pendientes and vueltas < 64:
            vueltas += 1
            pieza = pendientes.pop()
            if pieza.is_empty or pieza.geom_type != "Polygon" or not pieza.interiors:
                salida.append(pieza)
                continue
            centro = pieza.interiors[0].centroid
            u, _v = self._punto_en_local(datos, centro.x, centro.y)
            ancho = 10.0 * max(datos["espesor"], 1.0)
            corte = LineString(
                [self._punto_local(datos, u, -ancho), self._punto_local(datos, u, ancho)]
            )
            partes = list(split(pieza, corte).geoms)
            if len(partes) < 2:
                salida.append(pieza)
                continue
            pendientes.extend(partes)
        salida.extend(pendientes)
        return salida

    def _huellas_muro(
        self, muro: Any, datos: dict[str, Any] | None = None
    ) -> list[list[tuple[float, float]]]:
        """Huellas locales del muro recortadas en las caras de columnas y castillos."""
        from shapely.geometry import Polygon

        datos = datos or self._datos_muro(muro)
        offset = self._desfase_de_muro(muro, datos["espesor"])
        poligono = self._huella_local_muro(muro, datos, offset)
        if len(poligono) < 3:
            return [poligono]
        huella = Polygon([self._punto_local(datos, u, v) for u, v in poligono])
        if not huella.is_valid:
            huella = huella.buffer(0)
        z0 = datos["z"]
        z1 = z0 + datos["altura"]
        for columna in self.modelo.by_type("IfcColumn"):
            barra = self._barra_de_elemento(columna)
            if barra is None:
                continue
            if min(z1, barra.z1) - max(z0, barra.z0) <= TOLERANCIA_CALCULO:
                continue
            recorte = Polygon(uniones.huella(barra))
            if not recorte.is_valid:
                recorte = recorte.buffer(0)
            if not huella.intersects(recorte):
                continue
            huella = huella.difference(recorte)
            if huella.is_empty:
                break
        if huella.is_empty:
            return [poligono]
        piezas = [huella] if huella.geom_type == "Polygon" else list(huella.geoms)
        piezas = self._partir_huecos(datos, piezas)
        salida: list[list[tuple[float, float]]] = []
        for pieza in piezas:
            if pieza.is_empty or pieza.area <= TOLERANCIA_CALCULO:
                continue
            # O040: el recorte con castillos deja vértices casi repetidos
            # (2.925, 0.075) y (2.925, 0.07499999999999982) que IfcOpenShell no
            # tesela: el muro desaparece de planta, alzado y 3D. Se limpian aquí.
            pieza = pieza.simplify(1e-7, preserve_topology=True)
            anillo = _limpiar_anillo(
                [self._punto_en_local(datos, x, y) for x, y in list(pieza.exterior.coords)[:-1]]
            )
            if len(anillo) >= 3:
                salida.append(anillo)
        return salida or [poligono]

    def _bajar_a_cimentacion(self, muro: Any, datos: dict[str, Any]) -> bool:
        """O035: ¿la base del muro debe bajar hasta la cimentación de debajo?

        La casilla viene activada por omisión; un desfase de base puesto a mano
        distinto de cero manda y el muro nace en su nivel.
        """
        valor = datos.get("bajar_a_cimentacion", True)
        if valor in (False, "False", "false", 0, "0"):
            return False
        restriccion = self._restricciones_de(muro)
        try:
            desfase = float(restriccion.get("DesfaseBase") or 0.0)
        except (TypeError, ValueError):
            desfase = 0.0
        return abs(desfase) <= TOLERANCIA_CALCULO

    def _huellas_cimentacion_bajo_muro(
        self,
    ) -> list[tuple[list[tuple[float, float]], float]]:
        """(huella en planta, cara superior) de contratrabes y zapatas corridas."""
        salida: list[tuple[list[tuple[float, float]], float]] = []
        for elemento in self.modelo.by_type("IfcElement"):
            predef = _texto(getattr(elemento, "PredefinedType", ""))
            alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
            if elemento.is_a("IfcFooting") and predef == "STRIP_FOOTING":
                datos = self._leer_pset(elemento, "OPENRVT_Estructura")
                if not datos:
                    continue
                _alias, seccion, _armado = self._seccion_y_armado(
                    self._tipo_entidad(elemento)
                )
                x1 = float(datos.get("X1") or 0.0)
                y1 = float(datos.get("Y1") or 0.0)
                x2 = float(datos.get("X2") or 0.0)
                y2 = float(datos.get("Y2") or 0.0)
                largo = math.hypot(x2 - x1, y2 - y1)
                if largo <= TOLERANCIA_CALCULO:
                    continue
                ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
                pi = float(datos.get("ProlongacionInicio") or 0.0)
                pf = float(datos.get("ProlongacionFin") or 0.0)
                peralte = float(seccion.get("Peralte") or 0.20)
                z = float(datos.get("Z") or 0.0)
                barra = uniones.Barra(
                    gid=_gid(elemento),
                    tipo="viga",
                    x1=x1 - ux * pi,
                    y1=y1 - uy * pi,
                    x2=x2 + ux * pf,
                    y2=y2 + uy * pf,
                    ancho=float(seccion.get("Ancho") or 0.60),
                    z0=z - peralte / 2.0,
                    z1=z + peralte / 2.0,
                )
                salida.append((uniones.huella(barra), barra.z1))
            elif alias == "contratrabe":
                barra = self._barra_de_elemento(elemento)
                if barra is None:
                    continue
                salida.append((uniones.huella(barra), barra.z1))
        return salida

    def _tramos_bajada_muro(
        self, muro: Any, datos: dict[str, Any]
    ) -> list[tuple[float, float, float]]:
        """Tramos (u0, u1, base) donde el muro baja hasta la cimentación."""
        if not self._bajar_a_cimentacion(muro, datos):
            return []
        base = float(datos["z"])
        largo = float(datos["longitud"])
        if largo <= TOLERANCIA_CALCULO:
            return []
        origen = (float(datos["x1"]), float(datos["y1"]))
        direccion = (float(datos["dx"]), float(datos["dy"]))
        candidatos: list[tuple[float, float, float]] = []
        for huella, cara in self._huellas_cimentacion_bajo_muro():
            if cara >= base - TOLERANCIA_CALCULO:
                # Por encima de la base, o al ras: lo resuelve el apoyo normal.
                continue
            try:
                intervalo = uniones.intervalo_en_huella(origen, direccion, huella)
            except Exception:
                continue
            if intervalo is None:
                continue
            u0 = max(0.0, float(intervalo[0]))
            u1 = min(largo, float(intervalo[1]))
            if u1 - u0 <= TOLERANCIA_CALCULO:
                continue
            candidatos.append((u0, u1, float(cara)))
        if not candidatos:
            return []
        cortes = {0.0, largo}
        for u0, u1, _cara in candidatos:
            cortes.update((u0, u1))
        ordenados = sorted(cortes)
        salida: list[tuple[float, float, float]] = []
        for u0, u1 in zip(ordenados, ordenados[1:]):
            if u1 - u0 <= TOLERANCIA_CALCULO:
                continue
            medio = (u0 + u1) / 2.0
            caras = [
                cara
                for a, b, cara in candidatos
                if a < medio < b
            ]
            if not caras:
                continue
            z0 = max(caras)
            if z0 < base - TOLERANCIA_CALCULO:
                salida.append((u0, u1, z0))
        return salida

    def _partir_por_bajadas(
        self,
        poligono: list[tuple[float, float]],
        base: float,
        bajadas: list[tuple[float, float, float]],
    ) -> list[tuple[list[tuple[float, float]], float]]:
        """Parte una huella local en tramos con su cota de base."""
        if not bajadas:
            return [(poligono, base)]
        from shapely.geometry import LineString, Polygon
        from shapely.ops import split

        piezas: list[Any] = [Polygon(poligono)]
        for u in sorted({u for a, b, _z in bajadas for u in (a, b)}):
            if u <= TOLERANCIA_CALCULO:
                continue
            corte = LineString([(u, -1e5), (u, 1e5)])
            nuevas: list[Any] = []
            for pieza in piezas:
                if pieza.is_empty or not corte.intersects(pieza):
                    nuevas.append(pieza)
                    continue
                try:
                    nuevas.extend(list(split(pieza, corte).geoms))
                except Exception:
                    nuevas.append(pieza)
            piezas = nuevas
        salida: list[tuple[list[tuple[float, float]], float]] = []
        for pieza in piezas:
            if pieza.is_empty or pieza.area <= TOLERANCIA_CALCULO:
                continue
            punto = pieza.representative_point()
            z0 = base
            for u0, u1, cara in bajadas:
                if u0 < punto.x < u1:
                    z0 = cara
                    break
            anillo = _limpiar_anillo(
                [(x, y) for x, y in list(pieza.exterior.coords)[:-1]]
            )
            if len(anillo) >= 3:
                salida.append((anillo, z0))
        return salida or [(poligono, base)]

