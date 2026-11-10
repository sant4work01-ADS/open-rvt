"""Tramos, huellas y límites verticales de muros."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class MurosGeometriaMixin:
    def _limites_verticales_muro(
        self, muro: Any, datos: dict[str, Any] | None = None
    ) -> tuple[float, float]:
        """(base, cima) efectivas; si baja por tramos devuelve la base más baja."""
        datos = datos or self._datos_muro(muro)
        base, cima = self._limites_verticales_muro_nivel(muro, datos)
        bajadas = self._tramos_bajada_muro(muro, datos)
        if base > float(datos["z"]) + TOLERANCIA_CALCULO:
            return (base, cima)
        if bajadas:
            return (min(cara for _u0, _u1, cara in bajadas), cima)
        return (base, cima)

    def _huella_planta_muro(self, muro: Any, datos: dict[str, Any]) -> Any:
        """Huella del muro en planta (coordenadas de mundo) para cruzar elementos."""
        from shapely.geometry import Polygon

        offset = self._desfase_de_muro(muro, datos["espesor"])
        poligono = self._huella_local_muro(muro, datos, offset)
        huella = Polygon([self._punto_local(datos, u, v) for u, v in poligono])
        if not huella.is_valid:
            huella = huella.buffer(0)
        return huella

    def _horizontales_de_muro(
        self, muro: Any, datos: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Elementos horizontales que cruzan la huella del muro (O058).

        Devuelve huella en planta, cara inferior, cara superior y si es losa.
        Incluye losa, dala, contratrabe, cerramiento y zapata corrida.
        """
        from shapely.geometry import Polygon
        from shapely.ops import unary_union

        salida: list[dict[str, Any]] = []
        tramos_vigas: dict[str, list[tuple[float, float]]] | None = None
        for elemento in self.modelo.by_type("IfcElement"):
            if elemento is muro:
                continue
            alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
            try:
                if elemento.is_a("IfcSlab"):
                    datos_losa = self._leer_pset(elemento, "OPENRVT_Losa")
                    if not datos_losa:
                        continue
                    nivel = self._nivel_de_elemento(elemento)
                    if nivel is None:
                        continue
                    zeta1 = float(nivel.Elevation or 0.0) + float(
                        datos_losa.get("Desfase") or 0.0
                    )
                    zeta0 = zeta1 - float(datos_losa.get("Espesor") or 0.12)
                    recorte = self._geometria_losa(elemento)
                    es_losa = True
                elif elemento.is_a("IfcFooting") and _texto(
                    getattr(elemento, "PredefinedType", "")
                ) == "STRIP_FOOTING":
                    datos_f = self._leer_pset(elemento, "OPENRVT_Estructura")
                    if not datos_f:
                        continue
                    _alias, seccion, _armado = self._seccion_y_armado(
                        self._tipo_entidad(elemento)
                    )
                    x1 = float(datos_f.get("X1") or 0.0)
                    y1 = float(datos_f.get("Y1") or 0.0)
                    x2 = float(datos_f.get("X2") or 0.0)
                    y2 = float(datos_f.get("Y2") or 0.0)
                    largo = math.hypot(x2 - x1, y2 - y1)
                    if largo <= TOLERANCIA_CALCULO:
                        continue
                    ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
                    pi = float(datos_f.get("ProlongacionInicio") or 0.0)
                    pf = float(datos_f.get("ProlongacionFin") or 0.0)
                    peralte = float(seccion.get("Peralte") or 0.20)
                    z = float(datos_f.get("Z") or 0.0)
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
                    zeta0, zeta1 = barra.z0, barra.z1
                    recorte = Polygon(uniones.huella(barra))
                    es_losa = False
                elif alias in ("contratrabe", "dala", "cerramiento"):
                    barra = self._barra_de_elemento(elemento)
                    if barra is None:
                        continue
                    zeta0, zeta1 = barra.z0, barra.z1
                    # O061 regla 4: se resta el sólido que de verdad ocupa la
                    # viga, ya recortada contra columnas y castillos, no su eje
                    # nominal de punta a punta. Así el muro conserva las franjas
                    # que quedan alrededor del castillo cuando el cerramiento
                    # termina en su cara.
                    if tramos_vigas is None:
                        vigas, columnas = self._barras_estructura()
                        tramos_vigas, _aplicadas = uniones.calcular(
                            vigas, columnas
                        )
                    tramos = tramos_vigas.get(barra.gid) or [
                        (0.0, barra.largo)
                    ]
                    ux, uy = barra.direccion
                    piezas = []
                    for lo, hi in tramos:
                        if hi - lo <= TOLERANCIA_CALCULO:
                            continue
                        trozo = uniones.Barra(
                            gid=barra.gid,
                            tipo=barra.tipo,
                            x1=barra.x1 + ux * lo,
                            y1=barra.y1 + uy * lo,
                            x2=barra.x1 + ux * hi,
                            y2=barra.y1 + uy * hi,
                            ancho=barra.ancho,
                            z0=barra.z0,
                            z1=barra.z1,
                            fondo=barra.fondo,
                            rotacion=barra.rotacion,
                            clase=barra.clase,
                        )
                        piezas.append(Polygon(uniones.huella(trozo)))
                    recorte = (
                        unary_union(piezas) if piezas else Polygon()
                    )
                    es_losa = False
                else:
                    continue
            except Exception:
                LOG.debug("no se pudo leer un horizontal del muro", exc_info=True)
                continue
            if recorte is None or recorte.is_empty:
                continue
            if not recorte.is_valid:
                recorte = recorte.buffer(0)
            if recorte.is_empty:
                continue
            salida.append(
                {
                    "huella": recorte,
                    "z0": float(zeta0),
                    "z1": float(zeta1),
                    "losa": es_losa,
                    "uso": self.uso_de_losa(elemento) if es_losa else None,
                }
            )
        return salida

    @staticmethod
    def _tramos_verticales_muro(
        z0: float, z1: float, intervalos: list[dict[str, Any]]
    ) -> list[tuple[float, float, list[dict[str, Any]]]]:
        """Tramos [a, b] del muro entre z0 y z1 con sus intermedios activos.

        O061: un elemento intermedio no borra toda la franja del muro; solo se
        resta su huella. Por eso cada tramo viaja con los intermedios que lo
        cubren y el cuerpo decide qué parte de la pieza desaparece.
        """
        if z1 - z0 <= TOLERANCIA_CALCULO:
            return [(z0, z1, [])]
        cortes = {z0, z1}
        for intervalo in intervalos:
            a, b = float(intervalo["z0"]), float(intervalo["z1"])
            if min(z1, b) - max(z0, a) <= TOLERANCIA_CALCULO:
                continue
            cortes.update((max(z0, a), min(z1, b)))
        ordenados = sorted(cortes)
        salida: list[tuple[float, float, list[dict[str, Any]]]] = []
        for a, b in zip(ordenados, ordenados[1:]):
            if b - a <= TOLERANCIA_CALCULO:
                continue
            medio = (a + b) / 2.0
            activos = [
                intervalo
                for intervalo in intervalos
                if float(intervalo["z0"]) <= medio < float(intervalo["z1"])
            ]
            salida.append((a, b, activos))
        return salida or [(z0, z1, [])]

    def _intervalos_intermedios_muro(
        self, muro: Any, datos: dict[str, Any], base: float, cima: float
    ) -> list[dict[str, Any]]:
        """Intervalos verticales y huella real de los elementos intermedios.

        O058 regla 3: solo cuenta el elemento cuya cara inferior está por encima de
        la base y cuya cara superior está por debajo de la corona; los que tocan
        base o corona ya son apoyo/cubierta y no se restan. O061: se guarda su
        huella para restar únicamente lo que el elemento ocupa.
        """
        huella = self._huella_planta_muro(muro, datos)
        intervalos: list[dict[str, Any]] = []
        for elemento in self._horizontales_de_muro(muro, datos):
            z0, z1 = elemento["z0"], elemento["z1"]
            if z1 - z0 <= TOLERANCIA_CALCULO:
                continue
            if z0 <= base + TOLERANCIA_CALCULO or z1 >= cima - TOLERANCIA_CALCULO:
                continue
            try:
                if huella.intersection(elemento["huella"]).area <= TOLERANCIA_CALCULO:
                    continue
            except Exception:
                continue
            intervalos.append(
                {"z0": z0, "z1": z1, "huella": elemento["huella"]}
            )
        return intervalos

    def _limites_verticales_muro_nivel(
        self, muro: Any, datos: dict[str, Any] | None = None
    ) -> tuple[float, float]:
        """(base, cima) del nivel: apoyos y cubiertas, sin la bajada O035.

        O058: un elemento solo es apoyo si su cara inferior queda en la base
        nominal y su cara superior la toca; solo es cubierta si toca la corona
        nominal. Los elementos a media altura no mueven ni la base ni la corona.
        """
        datos = datos or self._datos_muro(muro)
        base_nominal = float(datos["z"])
        corona_nominal = base_nominal + float(datos["altura"])
        base, cima = base_nominal, corona_nominal
        huella = self._huella_planta_muro(muro, datos)
        for elemento in self._horizontales_de_muro(muro, datos):
            zeta0, zeta1 = elemento["z0"], elemento["z1"]
            try:
                if huella.intersection(elemento["huella"]).area <= TOLERANCIA_CALCULO:
                    continue
            except Exception:
                continue
            # Apoyo: toca la base nominal (cara inferior ≤ base ≤ cara superior).
            if (
                zeta0 <= base_nominal + TOLERANCIA_CALCULO
                and zeta1 >= base_nominal - TOLERANCIA_CALCULO
                and zeta1 < corona_nominal - TOLERANCIA_CALCULO
            ):
                base = max(base, zeta1)
            # Cubierta: toca la corona nominal. O045: solo la losa recorta el
            # muro; el cerramiento va embebido. O059: un firme nunca cubre la
            # corona (solo apoya), así que no la baja.
            if (
                elemento["losa"]
                and elemento.get("uso") != "firme"
                and zeta1 >= corona_nominal - TOLERANCIA_CALCULO
                and zeta0 <= corona_nominal + TOLERANCIA_CALCULO
                and zeta0 > base_nominal + TOLERANCIA_CALCULO
            ):
                cima = min(cima, zeta0)
        if cima - base <= TOLERANCIA_CALCULO:
            return (base_nominal, corona_nominal)
        return (base, cima)

