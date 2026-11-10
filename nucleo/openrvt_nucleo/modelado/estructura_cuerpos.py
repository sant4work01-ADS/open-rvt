"""Cuerpos y mallas de columnas, vigas y zapatas (O007b)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EstructuraCuerposMixin:
    # ------------------------------------------------------------------ estructura (O007b)
    def _tipo_estructura(self, tipo: Any, clases: tuple[str, ...]) -> Any:
        texto = _texto(tipo).strip()
        entidad = None
        for candidato in self.modelo.by_type("IfcTypeObject"):
            if _gid(candidato) == texto:
                entidad = candidato
                break
        if entidad is None:
            buscado = texto.casefold()
            for candidato in self.modelo.by_type("IfcTypeObject"):
                if _nombre(candidato).casefold() == buscado:
                    entidad = candidato
                    break
        if entidad is None or not any(entidad.is_a(c) for c in clases):
            esperado = ", ".join(clases)
            raise self._error(
                f"No existe el tipo estructural «{texto}» ({esperado}).", -32020
            )
        if self._estructura_de_tipo(entidad) is None:
            raise self._error(f"El tipo «{texto}» no es de estructura.", -32020)
        return entidad

    @staticmethod
    def _matriz_colocacion(
        x: float, y: float, z: float, rotacion: float
    ) -> np.ndarray:
        coseno, seno = math.cos(rotacion), math.sin(rotacion)
        return np.array(
            [
                [coseno, -seno, 0.0, x],
                [seno, coseno, 0.0, y],
                [0.0, 0.0, 1.0, z],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )

    @staticmethod
    def _matriz_viga(x1: float, y1: float, z: float, ux: float, uy: float) -> np.ndarray:
        return np.array(
            [
                [-uy, 0.0, ux, x1],
                [ux, 0.0, uy, y1],
                [0.0, 1.0, 0.0, z],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )

    @staticmethod
    def _caja_malla(
        ancho: float,
        fondo: float,
        alto: float,
        z0: float = 0.0,
        dx: float = 0.0,
        dy: float = 0.0,
    ) -> tuple[list[list[float]], list[list[int]]]:
        hx, hy = ancho / 2.0, fondo / 2.0
        x0, x1 = dx - hx, dx + hx
        y0, y1 = dy - hy, dy + hy
        z1 = z0 + alto
        vertices = [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        ]
        caras = [
            [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
            [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        ]
        return vertices, caras

    @staticmethod
    def _caja_entre(
        x0: float, x1: float, y0: float, y1: float, z0: float, z1: float
    ) -> tuple[list[list[float]], list[list[int]]]:
        vertices = [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
        ]
        caras = [
            [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
            [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        ]
        return vertices, caras

    def _malla_de_cajas(self, cajas: list[tuple[list[list[float]], list[list[int]]]]) -> Any:
        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        for lista, indices in cajas:
            base = len(vertices)
            vertices.extend(lista)
            caras.extend([[i + base for i in cara] for cara in indices])
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        # O062: los tramos de un mismo cuerpo se funden en un solo sólido para
        # que no queden tapas internas entre cajas con la misma sección.
        if len(cajas) > 1:
            body = rep.RepresentationIdentifier
            items = self._unir_solidos(list(rep.Items))
            rep.Items = items
            rep.RepresentationIdentifier = body or "Body"
        rep.RepresentationIdentifier = "Body"
        return rep

    @staticmethod
    def _cilindro_malla(radio: float, z0: float, alto: float, lados: int = 24):
        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        for i in range(lados):
            angulo = 2.0 * math.pi * i / lados
            vertices.append([radio * math.cos(angulo), radio * math.sin(angulo), z0])
        for i in range(lados):
            angulo = 2.0 * math.pi * i / lados
            vertices.append([radio * math.cos(angulo), radio * math.sin(angulo), z0 + alto])
        for i in range(lados):
            siguiente = (i + 1) % lados
            caras.append([i, siguiente, lados + siguiente, lados + i])
        caras.append(list(range(lados - 1, -1, -1)))
        caras.append(list(range(lados, 2 * lados)))
        return vertices, caras

    def _tramos_columna_por_losas(
        self, elemento: Any, datos: dict[str, Any], altura: float
    ) -> list[tuple[float, float]]:
        """O061: tramos locales de un castillo, quitando la franja de cada losa.

        El castillo se parte donde cruza una losa para que el concreto no se
        cuente dos veces. Las losas se leen por su contorno completo (no por el
        recorte viejo) para que la esquina del firme/azotea también cuente.
        """
        if self._estructura_de_tipo(self._tipo_entidad(elemento)) != "castillo":
            return [(0.0, altura)]
        barra = self._barra_de_elemento(elemento)
        if barra is None:
            return [(0.0, altura)]
        from shapely import wkt
        from shapely.geometry import Polygon

        base = float(datos.get("Base") or 0.0)
        tope = base + altura
        huella = Polygon(uniones.huella(barra))
        if not huella.is_valid:
            huella = huella.buffer(0)
        import ifcopenshell.util.placement as placement

        bandas: list[tuple[float, float]] = []
        for losa in self.modelo.by_type("IfcSlab"):
            datos_losa = self._leer_pset(losa, "OPENRVT_Losa")
            if not datos_losa:
                continue
            espesor = float(datos_losa.get("Espesor") or 0.12)
            matriz = placement.get_local_placement(losa.ObjectPlacement)
            z1 = float(matriz[2][3])
            z0 = z1 - espesor
            if min(tope, z1) - max(base, z0) <= TOLERANCIA_CALCULO:
                continue
            contorno = datos_losa.get("Contorno")
            if contorno:
                try:
                    huella_losa = wkt.loads(str(contorno))
                except Exception:
                    puntos_losa = self._contorno_de_losa(losa)
                    if puntos_losa is None:
                        continue
                    huella_losa = Polygon(puntos_losa)
            else:
                puntos_losa = self._contorno_de_losa(losa)
                if puntos_losa is None:
                    continue
                huella_losa = Polygon(puntos_losa)
            if not huella_losa.is_valid:
                huella_losa = huella_losa.buffer(0)
            if huella_losa.is_empty:
                continue
            if huella.intersection(huella_losa).area <= TOLERANCIA_CALCULO:
                continue
            bandas.append((max(base, z0), min(tope, z1)))
        if not bandas:
            return [(0.0, altura)]
        bandas.sort()
        unidas: list[tuple[float, float]] = []
        for a, b in bandas:
            if unidas and a <= unidas[-1][1] + TOLERANCIA_CALCULO:
                unidas[-1] = (unidas[-1][0], max(unidas[-1][1], b))
            else:
                unidas.append((a, b))
        tramos: list[tuple[float, float]] = []
        cursor = base
        for a, b in unidas:
            if a - cursor > TOLERANCIA_CALCULO:
                tramos.append((cursor - base, a - base))
            cursor = max(cursor, b)
        if tope - cursor > TOLERANCIA_CALCULO:
            tramos.append((cursor - base, altura))
        return tramos

    def _cuerpo_columna_tramos(
        self, seccion: dict[str, Any], tramos: list[tuple[float, float]]
    ) -> Any:
        cajas = []
        if _texto(seccion.get("Forma") or "rectangular") == "circular":
            radio = float(seccion.get("D") or 0.3) / 2.0
            cajas = [
                self._cilindro_malla(radio, z0, max(z1 - z0, 0.001))
                for z0, z1 in tramos
            ]
        else:
            ancho = float(seccion.get("B") or 0.15)
            fondo = float(seccion.get("H") or 0.15)
            cajas = [
                self._caja_malla(ancho, fondo, max(z1 - z0, 0.001), z0=z0)
                for z0, z1 in tramos
            ]
        return self._malla_de_cajas(cajas)

    def _cuerpo_columna(self, seccion: dict[str, Any], altura: float) -> Any:
        if _texto(seccion.get("Forma") or "rectangular") == "circular":
            vertices, caras = self._cilindro_malla(
                float(seccion.get("D") or 0.3) / 2.0, 0.0, altura
            )
            rep = geometry_api.add_mesh_representation(
                self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
            )
        else:
            rep = self._malla_de_cajas(
                [self._caja_malla(float(seccion.get("B") or 0.15),
                                  float(seccion.get("H") or 0.15), altura)]
            )
        rep.RepresentationIdentifier = "Body"
        return rep

    def _cuerpo_viga(self, seccion: dict[str, Any], largo: float) -> Any:
        b = float(seccion.get("B") or 0.20)
        h = float(seccion.get("H") or 0.40)
        caja = self._caja_entre(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0, 0.0, largo)
        return self._malla_de_cajas([caja])

    def _cuerpo_viga_tramos(
        self, seccion: dict[str, Any], tramos: list[tuple[float, float]]
    ) -> Any:
        """O012: uno o varios prismas en el eje local, ya recortados en las uniones."""
        b = float(seccion.get("B") or 0.20)
        h = float(seccion.get("H") or 0.40)
        cajas = [
            self._caja_entre(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0, a, c)
            for a, c in tramos
            if c - a > TOLERANCIA_CALCULO
        ]
        if not cajas:
            cajas = [self._caja_entre(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0, 0.0, 0.001)]
        return self._malla_de_cajas(cajas)

    def _cuerpo_zapata(
        self, seccion: dict[str, Any], desplante: float | None = None,
        dado_alto: float | None = None,
    ) -> Any:
        largo = float(seccion.get("Largo") or 1.2)
        ancho = float(seccion.get("Ancho") or 1.2)
        peralte = float(seccion.get("Peralte") or 0.25)
        plantilla = float(seccion.get("Plantilla") or 0.05)
        dado_b = float(seccion.get("DadoB") or 0.0)
        dado_h = float(seccion.get("DadoH") or 0.0)
        # O037: el alto del dado sale del desplante (y el peralte), no de un valor
        # fijo del tipo; sin desplante (zapata importada) se conserva el del tipo.
        # O041: si viene limitado por un elemento que lo cubre, se respeta ese tope.
        if desplante is None:
            dado_alto = float(seccion.get("DadoAlto") or 0.0) if dado_alto is None else dado_alto
        elif dado_alto is None:
            dado_alto = self._dado_alto_de(seccion, desplante)
        cajas = []
        if plantilla > 0:
            cajas.append(
                self._caja_entre(-largo / 2.0, largo / 2.0, -ancho / 2.0, ancho / 2.0,
                                 -plantilla, 0.0)
            )
        cajas.append(
            self._caja_entre(-largo / 2.0, largo / 2.0, -ancho / 2.0, ancho / 2.0,
                             0.0, peralte)
        )
        if dado_b > 0 and dado_h > 0 and dado_alto > 0:
            cajas.append(
                self._caja_malla(dado_b, dado_h, dado_alto, z0=peralte)
            )
        return self._malla_de_cajas(cajas)

    def _cuerpo_zapata_corrida(self, seccion: dict[str, Any], largo: float) -> Any:
        ancho = float(seccion.get("Ancho") or 0.60)
        peralte = float(seccion.get("Peralte") or 0.20)
        corona = float(seccion.get("Corona") or 0.0)
        plantilla = float(seccion.get("Plantilla") or 0.05)
        mitad_inferior = ancho / 2.0
        mitad_superior = (corona if corona > 0 else ancho) / 2.0
        vertices = [
            [-mitad_inferior, -peralte / 2.0, 0.0],
            [mitad_inferior, -peralte / 2.0, 0.0],
            [mitad_superior, peralte / 2.0, 0.0],
            [-mitad_superior, peralte / 2.0, 0.0],
            [-mitad_inferior, -peralte / 2.0, largo],
            [mitad_inferior, -peralte / 2.0, largo],
            [mitad_superior, peralte / 2.0, largo],
            [-mitad_superior, peralte / 2.0, largo],
        ]
        caras = [
            [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
            [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
        ]
        cajas = [(vertices, caras)]
        if plantilla > 0:
            cajas.append(
                self._caja_entre(-mitad_inferior, mitad_inferior,
                                 -peralte / 2.0 - plantilla, -peralte / 2.0, 0.0, largo)
            )
        return self._malla_de_cajas(cajas)

    def _aplicar_predefinido(self, elemento: Any, tipo: Any) -> None:
        predefinido = getattr(tipo, "PredefinedType", None)
        if predefinido and hasattr(elemento, "PredefinedType"):
            elemento.PredefinedType = predefinido
        elemento_tipo = getattr(tipo, "ElementType", None)
        if elemento_tipo:
            if hasattr(elemento, "ElementType"):
                elemento.ElementType = elemento_tipo
            elif hasattr(elemento, "ObjectType"):
                elemento.ObjectType = elemento_tipo

