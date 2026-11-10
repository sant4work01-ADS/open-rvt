"""Barras y uniones de la estructura."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EstructuraUnionesMixin:
    def _altura_columna(
        self, elevacion: float, nivel_superior: str | None, altura: float | None
    ) -> float:
        if nivel_superior:
            superior = self._nivel_por_gid(nivel_superior)
            tope = float(superior.Elevation or 0.0)
            resultado = tope - elevacion
        elif altura is not None:
            try:
                resultado = float(altura)
            except (TypeError, ValueError) as exc:
                raise self._error("La altura de la columna no es un número.", -32602) from exc
        else:
            superiores = [
                float(n.Elevation or 0.0)
                for n in self.modelo.by_type("IfcBuildingStorey")
                if float(n.Elevation or 0.0) > elevacion + TOLERANCIA_CALCULO
            ]
            resultado = (min(superiores) - elevacion) if superiores else 2.60
        if resultado <= 0:
            raise self._error("La altura de la columna debe ser positiva.", -32602)
        return resultado

    def _es_viga_estructural(self, elemento: Any) -> bool:
        if elemento.is_a("IfcBeam"):
            return True
        return elemento.is_a("IfcFooting") and _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "FOOTING_BEAM"

    def _barra_de_elemento(self, elemento: Any) -> uniones.Barra | None:
        """Convierte una columna o viga del modelo en la barra pura de uniones."""
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        if not datos:
            return None
        tipo = self._tipo_entidad(elemento)
        alias, seccion, _ = self._seccion_y_armado(tipo)
        if alias is None:
            return None
        if elemento.is_a("IfcColumn"):
            base = float(datos.get("Base") or 0.0)
            alto = float(datos.get("Altura") or 2.60)
            return uniones.Barra(
                gid=_gid(elemento),
                tipo="columna",
                x1=float(datos.get("X") or 0.0),
                y1=float(datos.get("Y") or 0.0),
                x2=float(datos.get("X") or 0.0),
                y2=float(datos.get("Y") or 0.0),
                ancho=float(
                    datos.get("B") or seccion.get("B") or seccion.get("D") or 0.30
                ),
                fondo=float(
                    datos.get("H") or seccion.get("H") or seccion.get("D") or 0.30
                ),
                z0=base,
                z1=base + alto,
                rotacion=float(datos.get("Rotacion") or 0.0),
                clase="castillo" if alias == "castillo" else "columna",
            )
        if self._es_viga_estructural(elemento):
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            alto = float(datos.get("H") or seccion.get("H") or 0.40)
            centro = float(datos.get("Z") or 0.0)
            return uniones.Barra(
                gid=_gid(elemento),
                tipo="viga",
                x1=x1,
                y1=y1,
                x2=x2,
                y2=y2,
                ancho=float(datos.get("B") or seccion.get("B") or 0.20),
                z0=centro - alto / 2.0,
                z1=centro + alto / 2.0,
                clase="cerramiento" if alias == "cerramiento" else "viga",
            )
        return None

    def _barras_de_dado(self, elemento: Any) -> list[uniones.Barra]:
        """O012b: el dado de la zapata cuenta como columna para recortar vigas.

        El dado forma parte del cuerpo de la zapata (no es un IFC aparte), así que
        su barra lleva el GlobalId de la zapata para que la relación IFC de la
        unión apunte al elemento real.
        """
        if not elemento.is_a("IfcFooting") or _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "STRIP_FOOTING":
            return []
        tipo = self._tipo_entidad(elemento)
        alias, seccion, _ = self._seccion_y_armado(tipo)
        if alias != "zapata":
            return []
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        if not datos:
            return []
        dado_b = float(seccion.get("DadoB") or 0.0)
        dado_h = float(seccion.get("DadoH") or 0.0)
        peralte = float(seccion.get("Peralte") or 0.25)
        desplante = datos.get("Desplante")
        dado_alto = (
            float(desplante) - peralte
            if desplante is not None
            else float(seccion.get("DadoAlto") or 0.0)
        )
        if dado_b <= 0 or dado_h <= 0 or dado_alto <= 0:
            return []
        z = float(datos.get("Z") or 0.0)
        # O041: el dado termina en la cara inferior del elemento que lo cubre.
        tope_dado = self._tope_dado(elemento)
        if tope_dado is not None:
            dado_alto = max(0.0, tope_dado - z - peralte)
            if dado_alto <= 0:
                return []
        return [
            uniones.Barra(
                gid=_gid(elemento),
                tipo="columna",
                x1=float(datos.get("X") or 0.0),
                y1=float(datos.get("Y") or 0.0),
                x2=float(datos.get("X") or 0.0),
                y2=float(datos.get("Y") or 0.0),
                ancho=dado_b,
                fondo=dado_h,
                z0=z + peralte,
                z1=z + peralte + dado_alto,
                rotacion=float(datos.get("Rotacion") or 0.0),
                clase="dado",
            )
        ]

    def _barras_estructura(self) -> tuple[list[uniones.Barra], list[uniones.Barra]]:
        vigas: list[uniones.Barra] = []
        columnas: list[uniones.Barra] = []
        for elemento in self.modelo.by_type("IfcElement"):
            if not (
                elemento.is_a("IfcColumn")
                or elemento.is_a("IfcFooting")
                or self._es_viga_estructural(elemento)
            ):
                continue
            barra = self._barra_de_elemento(elemento)
            if barra is not None:
                if barra.tipo == "columna":
                    columnas.append(barra)
                else:
                    vigas.append(barra)
            columnas.extend(self._barras_de_dado(elemento))
        return vigas, columnas

    def _tramos_de_viga(self, elemento: Any) -> list[tuple[float, float]]:
        """Tramos recortados de una viga, en metros sobre su eje original."""
        barra = self._barra_de_elemento(elemento)
        if barra is None or barra.tipo != "viga":
            return [(0.0, 1.0)]
        vigas, columnas = self._barras_estructura()
        tramos, _uniones_aplicadas = uniones.calcular(vigas, columnas)
        return tramos.get(barra.gid) or [(0.0, barra.largo)]

    def _recrear_relaciones_uniones(self) -> None:
        """Una relación IFC estándar por unión, con el elemento que manda primero."""
        for rel in list(self.modelo.by_type("IfcRelConnectsElements")):
            if _texto(getattr(rel, "Name", "")) == "OPEN-RVT unión":
                try:
                    self.modelo.remove(rel)
                except Exception:
                    LOG.debug("no se pudo quitar una unión anterior", exc_info=True)
        vigas, columnas = self._barras_estructura()
        _tramos, aplicadas = uniones.calcular(vigas, columnas)
        for union in aplicadas:
            try:
                maestro = self._entidad_por_gid(union["maestro"])
                esclavo = self._entidad_por_gid(union["esclavo"])
            except Exception:
                continue
            existente = False
            for rel in self.modelo.by_type("IfcRelConnectsElements"):
                if (
                    getattr(rel, "RelatingElement", None) == maestro
                    and getattr(rel, "RelatedElement", None) == esclavo
                ):
                    existente = True
                    break
            if existente:
                continue
            try:
                self.modelo.create_entity(
                    "IfcRelConnectsElements",
                    GlobalId=ifcopenshell.guid.new(),
                    OwnerHistory=None,
                    Name="OPEN-RVT unión",
                    Description=None,
                    ConnectionGeometry=None,
                    RelatingElement=maestro,
                    RelatedElement=esclavo,
                )
            except Exception:
                LOG.warning("no se pudo registrar la unión", exc_info=True)

    def _recalcular_uniones_estructura(self) -> None:
        """Vuelve a cortar todas las vigas: al mover, borrar o cambiar un vecino."""
        for elemento in list(self.modelo.by_type("IfcElement")):
            if elemento.is_a("IfcColumn") or self._es_viga_estructural(elemento):
                if self._leer_pset(elemento, "OPENRVT_Estructura"):
                    self._regenerar_estructura(elemento)
        # O012b: losa y muro dependen de las vigas, columnas y castillos vecinos.
        for losa in list(self.modelo.by_type("IfcSlab")):
            if self._leer_pset(losa, "OPENRVT_Losa"):
                self._regenerar_losa(losa)
        for muro in list(self.modelo.by_type("IfcWall")):
            if self._leer_pset(muro, "OPENRVT_Muro"):
                self._regenerar_representacion_unida(muro)
        self._recrear_relaciones_uniones()

    def _regenerar_estructura(self, elemento: Any) -> None:
        tipo = self._tipo_entidad(elemento)
        alias, seccion, _armado = self._seccion_y_armado(tipo)
        if alias is None:
            return
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        # O007c: el castillo usa el núcleo del muro y el cerramiento su espesor;
        # la instancia puede sobrescribir B/H sin tocar el tipo.
        seccion = dict(seccion)
        for clave in ("B", "H"):
            if datos.get(clave):
                seccion[clave] = float(datos[clave])
        # O054: el nombre del ejemplar dice la sección real; el tipo conserva el suyo.
        if alias in ("columna", "castillo", "trabe", "cerramiento", "dala", "contratrabe"):
            b = float(seccion.get("B") or seccion.get("D") or 0.0)
            h = float(seccion.get("H") or seccion.get("D") or 0.0)
            if b > 0 and h > 0:
                elemento.Name = self._nombre_seccion(alias, b, h)
        self._aplicar_predefinido(elemento, tipo)
        self._quitar_representaciones(elemento, "Body")
        if elemento.is_a("IfcColumn"):
            altura = float(datos.get("Altura") or 0.0)
            if altura <= 0:
                altura = 2.60
            # O061: el castillo se parte al cruzar una losa; el concreto de la
            # franja de la losa no se cuenta dos veces.
            tramos_columna = self._tramos_columna_por_losas(elemento, datos, altura)
            if tramos_columna == [(0.0, altura)]:
                cuerpo = self._cuerpo_columna(seccion, altura)
            else:
                cuerpo = self._cuerpo_columna_tramos(seccion, tramos_columna)
            matriz = self._matriz_colocacion(
                float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0),
                float(datos.get("Base") or 0.0), float(datos.get("Rotacion") or 0.0),
            )
        elif elemento.is_a("IfcBeam") or (
            elemento.is_a("IfcFooting")
            and _texto(getattr(elemento, "PredefinedType", "")) == "FOOTING_BEAM"
        ):
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            largo = float(datos.get("Longitud") or math.hypot(x2 - x1, y2 - y1))
            if largo <= TOLERANCIA_CALCULO:
                largo = 1.0
            tramos = self._tramos_de_viga(elemento)
            cuerpo = self._cuerpo_viga_tramos(seccion, tramos)
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            matriz = self._matriz_viga(x1, y1, float(datos.get("Z") or 0.0), ux, uy)
        elif elemento.is_a("IfcFooting") and _texto(
            getattr(elemento, "PredefinedType", "")
        ) == "STRIP_FOOTING":
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            largo = float(datos.get("Longitud") or math.hypot(x2 - x1, y2 - y1))
            if largo <= TOLERANCIA_CALCULO:
                largo = 1.0
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            # O033: el cuerpo se prolonga medio ancho en los extremos que llegan
            # a un cruce; el trazo guardado sigue siendo el de cruce a cruce.
            pi = float(datos.get("ProlongacionInicio") or 0.0)
            pf = float(datos.get("ProlongacionFin") or 0.0)
            cuerpo = self._cuerpo_zapata_corrida(seccion, largo + pi + pf)
            matriz = self._matriz_viga(
                x1 - ux * pi, y1 - uy * pi, float(datos.get("Z") or 0.0), ux, uy
            )
        else:
            desplante = datos.get("Desplante")
            # O041: el dado termina en la cara inferior del elemento que lo cubre.
            dado_alto = None
            tope_dado = self._tope_dado(elemento)
            if tope_dado is not None and desplante is not None:
                z = float(datos.get("Z") or 0.0)
                dado_alto = max(0.0, tope_dado - z - float(seccion.get("Peralte") or 0.25))
            cuerpo = self._cuerpo_zapata(
                seccion, float(desplante) if desplante is not None else None, dado_alto
            )
            matriz = self._matriz_colocacion(
                float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0),
                float(datos.get("Z") or 0.0), float(datos.get("Rotacion") or 0.0),
            )
        geometry_api.assign_representation(self.modelo, product=elemento, representation=cuerpo)
        geometry_api.edit_object_placement(self.modelo, product=elemento, matrix=matriz)

