"""Losas: geometría, bordes, uso y creación."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403

from ..siembra import crea_openrvt


class LosasMixin:
    # ------------------------------------------------------------------ losas
    def _geometria_losa(self, losa: Any):
        """Huella recortada de la losa (o su contorno si todavía no se recortó)."""
        from shapely import wkt
        from shapely.geometry import Polygon

        datos = self._leer_pset(losa, "OPENRVT_Losa")
        texto = datos.get("Recorte")
        if texto:
            try:
                return wkt.loads(str(texto))
            except Exception:
                LOG.debug("no se pudo leer el recorte de la losa", exc_info=True)
        return Polygon(self._poligono_de_losa(losa))

    def _prisma_de_huella(
        self, geometria: Any, z0: float, z1: float
    ) -> tuple[list[list[float]], list[list[int]]]:
        """Prisma vertical de una huella arbitraria (con huecos o varias piezas)."""
        from shapely.ops import triangulate

        triangulos: list[list[tuple[float, float]]] = []
        for triangulo in triangulate(geometria):
            if not geometria.covers(triangulo.representative_point()):
                continue
            puntos = [(float(p[0]), float(p[1])) for p in triangulo.exterior.coords[:3]]
            area2 = sum(
                puntos[i][0] * puntos[(i + 1) % 3][1]
                - puntos[(i + 1) % 3][0] * puntos[i][1]
                for i in range(3)
            )
            if area2 < 0:
                puntos.reverse()
            triangulos.append(puntos)

        vertices: list[list[float]] = []
        caras: list[list[int]] = []
        bordes: dict[tuple, dict[str, Any]] = {}

        def _redondo(punto: tuple[float, float]) -> tuple[float, float]:
            return (round(punto[0], 9), round(punto[1], 9))

        for triangulo in triangulos:
            base = len(vertices)
            for x, y in triangulo:
                vertices.append([x, y, z0])
            for x, y in triangulo:
                vertices.append([x, y, z1])
            caras.append([base + 3, base + 4, base + 5])
            caras.append([base + 2, base + 1, base])
            for i in range(3):
                j = (i + 1) % 3
                a, b = triangulo[i], triangulo[j]
                clave = tuple(sorted((_redondo(a), _redondo(b))))
                registro = bordes.setdefault(clave, {"cuenta": 0, "a": a, "b": b})
                registro["cuenta"] += 1

        for registro in bordes.values():
            if registro["cuenta"] != 1:
                continue
            a, b = registro["a"], registro["b"]
            base = len(vertices)
            vertices.extend(
                [
                    [a[0], a[1], z0], [b[0], b[1], z0],
                    [b[0], b[1], z1], [a[0], a[1], z1],
                ]
            )
            caras.append([base, base + 1, base + 2, base + 3])
        return vertices, caras

    def _normalizar_bordes_losa(
        self, bordes: Any, poligono: list[tuple[float, float]]
    ) -> list[dict[str, Any]]:
        """O032: cada borde guarda referencia y desfase; sin datos, todos «libre»."""
        from shapely.geometry import Polygon

        area = _poligono_area(poligono)
        signo_poligono = 1.0 if area >= 0 else -1.0
        if bordes is None:
            bordes = [{"referencia": "libre"} for _ in poligono]
        if not isinstance(bordes, (list, tuple)):
            raise self._error("Los bordes de la losa deben ser una lista.", -32602)
        if len(bordes) != len(poligono):
            raise self._error(
                "Debe haber un borde por cada lado del contorno.", -32602
            )
        salida: list[dict[str, Any]] = []
        for i, crudo in enumerate(bordes):
            if not isinstance(crudo, dict):
                raise self._error("Cada borde debe ser un objeto.", -32602)
            referencia = str(crudo.get("referencia") or "libre")
            if referencia not in ("libre", "eje", "muro"):
                raise self._error(
                    f"Referencia de borde «{referencia}» no válida.", -32602
                )
            try:
                desfase = float(crudo.get("desfase") or 0.0)
            except (TypeError, ValueError) as exc:
                raise self._error("El desfase del borde no es un número.", -32602) from exc
            a = poligono[i]
            b = poligono[(i + 1) % len(poligono)]
            # O037: la línea base (sin desfase) se conserva entre ediciones; solo se
            # deriva del contorno cuando el borde aún no la trae (creación o archivo
            # viejo). Así el contorno final es siempre «base + desfase» (idempotente).
            punto_a = crudo.get("punto_a")
            punto_b = crudo.get("punto_b")
            if punto_a is None or punto_b is None:
                punto_a = [float(a[0]), float(a[1])]
                punto_b = [float(b[0]), float(b[1])]
            else:
                punto_a = [float(punto_a[0]), float(punto_a[1])]
                punto_b = [float(punto_b[0]), float(punto_b[1])]
            dx, dy = b[0] - a[0], b[1] - a[1]
            largo = math.hypot(dx, dy) or 1.0
            ux, uy = dx / largo, dy / largo
            # Normal exterior del polígono en este lado.
            ox, oy = signo_poligono * uy, -signo_poligono * ux
            lado = str(crudo.get("lado") or "")
            objetivo = str(crudo.get("objetivo") or "")
            signo = 1
            refdir = (ux, uy)
            if referencia == "muro" and objetivo:
                entidad = self._entidad_por_gid(objetivo)
                if not entidad.is_a("IfcWall"):
                    raise self._error(f"{objetivo} no es un muro.", -32022)
                datos = self._datos_muro(entidad)
                refdir = (datos["dx"], datos["dy"])
                if lado not in ("exterior", "eje", "interior"):
                    lado = "exterior"
            elif referencia == "eje" and objetivo:
                _x1, _y1, _x2, _y2, ux_e, uy_e, _l = self._direccion_eje(
                    self._eje_por_gid(objetivo)[1]
                )
                refdir = (ux_e, uy_e)
                lado = "eje"
            else:
                if referencia != "libre":
                    raise self._error("Falta la referencia del borde.", -32602)
                lado = "libre"
            izquierda = (-refdir[1], refdir[0])
            signo = 1 if ox * izquierda[0] + oy * izquierda[1] >= 0 else -1
            salida.append(
                {
                    "referencia": referencia,
                    "objetivo": objetivo,
                    "lado": lado,
                    "desfase": desfase,
                    "signo": signo,
                    "punto_a": punto_a,
                    "punto_b": punto_b,
                }
            )
        return salida

    def _linea_de_borde(
        self, borde: dict[str, Any]
    ) -> tuple[tuple[float, float], tuple[float, float]] | None:
        """Recta soporte del borde ya desplazada por su referencia y desfase."""
        referencia = str(borde.get("referencia") or "libre")
        desfase = float(borde.get("desfase") or 0.0)
        signo = int(borde.get("signo") or 1)
        lado = str(borde.get("lado") or "libre")
        if referencia == "muro":
            try:
                entidad = self._entidad_por_gid(str(borde.get("objetivo") or ""))
            except Exception:
                return None
            if not entidad.is_a("IfcWall"):
                return None
            datos = self._datos_muro(entidad)
            p = (datos["x1"], datos["y1"])
            d = (datos["dx"], datos["dy"])
            # Cara del cuerpo del muro que da al exterior de la losa, medida
            # desde el eje y contada en el sentido exterior del borde.
            offset = self._desfase_de_muro(entidad, datos["espesor"])
            if lado == "eje":
                cara = 0.0
            elif signo > 0:
                cara = offset + datos["espesor"] if lado == "exterior" else offset
            else:
                cara = -offset if lado == "exterior" else -offset - datos["espesor"]
            desplazamiento = cara + desfase
        elif referencia == "eje":
            try:
                x1, y1, _x2, _y2, ux, uy, _l = self._direccion_eje(
                    self._eje_por_gid(str(borde.get("objetivo") or ""))[1]
                )
            except Exception:
                return None
            p = (x1, y1)
            d = (ux, uy)
            desplazamiento = desfase
        else:
            a = borde.get("punto_a") or [0.0, 0.0]
            b = borde.get("punto_b") or [0.0, 0.0]
            dx, dy = float(b[0]) - float(a[0]), float(b[1]) - float(a[1])
            largo = math.hypot(dx, dy)
            if largo <= TOLERANCIA_CALCULO:
                return None
            p = (float(a[0]), float(a[1]))
            d = (dx / largo, dy / largo)
            desplazamiento = desfase
        n = (-d[1], d[0])
        p = (p[0] + signo * n[0] * desplazamiento, p[1] + signo * n[1] * desplazamiento)
        return p, d

    def _contorno_de_bordes(
        self, bordes: list[dict[str, Any]]
    ) -> list[tuple[float, float]] | None:
        lineas = [self._linea_de_borde(b) for b in bordes]
        if any(linea is None for linea in lineas) or len(lineas) < 3:
            return None
        puntos: list[tuple[float, float]] = []
        total = len(lineas)
        for i, (p, d) in enumerate(lineas):
            # El vértice i cierra el borde i-1 y abre el borde i.
            q, e = lineas[(i - 1) % total]
            punto = self._corta_rectas(q, (-e[1], e[0]), p, (-d[1], d[0]))
            puntos.append(punto if punto is not None else p)
        if abs(_poligono_area(puntos)) <= TOLERANCIA_CALCULO:
            return None
        return puntos

    def _bordes_de_losa(self, losa: Any) -> list[dict[str, Any]] | None:
        datos = self._leer_pset(losa, "OPENRVT_Losa")
        crudo = datos.get("Bordes")
        if not crudo:
            return None
        if isinstance(crudo, str):
            try:
                crudo = json.loads(crudo)
            except Exception:
                return None
        if not isinstance(crudo, list) or len(crudo) < 3:
            return None
        return [dict(b) for b in crudo if isinstance(b, dict)]

    def _regenerar_losas_de_bordes(self, referencias: set[str]) -> list[Any]:
        """O032: las losas con bordes ligados a esos muros o ejes se regeneran."""
        salida: list[Any] = []
        for losa in self.modelo.by_type("IfcSlab"):
            bordes = self._bordes_de_losa(losa)
            if not bordes:
                continue
            objetivos = {
                str(b.get("objetivo") or "")
                for b in bordes
                if b.get("referencia") in ("muro", "eje")
            }
            if not objetivos & referencias:
                continue
            self._regenerar_losa(losa)
            salida.append(losa)
        return salida

    def muro_voltear(self, globalid: str) -> dict[str, Any]:
        """O032: intercambia los lados exterior/interior sin mover la línea."""
        return self.elemento_editar(globalid, {"voltear": True})

    def _reparar_contorno_losa(self, losa: Any) -> bool:
        """O050: quita el punto de cierre repetido de una losa guardada.

        El contorno y sus bordes se sanean con ``_limpiar_anillo``; el borde
        degenerado que dejaba el clic sobre el primer vértice se descarta y los
        lados reales conservan su referencia y su desfase.
        """
        datos = dict(self._leer_pset(losa, "OPENRVT_Losa"))
        if not datos:
            return False
        crudo = datos.get("Contorno")
        if crudo:
            try:
                from shapely import wkt

                puntos = [
                    (float(p[0]), float(p[1]))
                    for p in wkt.loads(str(crudo)).exterior.coords[:-1]
                ]
            except Exception:
                puntos = self._contorno_de_losa(losa)
        else:
            puntos = self._contorno_de_losa(losa)
        if puntos is None:
            return False
        limpios = _limpiar_anillo(list(puntos))
        if len(limpios) < 3:
            return False
        cambio = len(limpios) != len(puntos) or int(datos.get("Puntos") or 0) != len(
            limpios
        )
        bordes: list[dict[str, Any]] | None = None
        crudo_bordes = datos.get("Bordes")
        if crudo_bordes:
            if isinstance(crudo_bordes, str):
                try:
                    crudo_bordes = json.loads(crudo_bordes)
                except Exception:
                    crudo_bordes = None
            if isinstance(crudo_bordes, list):
                bordes = [dict(b) for b in crudo_bordes if isinstance(b, dict)]
                if len(bordes) != len(limpios):
                    filtrados = []
                    for borde in bordes:
                        a = borde.get("punto_a")
                        b = borde.get("punto_b")
                        try:
                            cero = (
                                a is not None
                                and b is not None
                                and math.hypot(float(a[0]) - float(b[0]), float(a[1]) - float(b[1]))
                                <= 1e-7
                            )
                        except (TypeError, ValueError, IndexError):
                            cero = False
                        if not cero:
                            filtrados.append(borde)
                    bordes = filtrados if len(filtrados) == len(limpios) else None
        if bordes is not None:
            normalizados = self._normalizar_bordes_losa(bordes, limpios)
            datos["Bordes"] = json.dumps(normalizados, ensure_ascii=False)
        elif "Bordes" in datos and len(crudo_bordes or []) != len(limpios):
            datos.pop("Bordes", None)
        if cambio or bordes is not None:
            from shapely.geometry import Polygon

            datos["Contorno"] = Polygon(limpios).wkt
            datos["Puntos"] = len(limpios)
            self._guardar_pset(losa, "OPENRVT_Losa", datos)
            self._regenerar_losa(losa)
            return True
        return False

    def _reparar_losas_antiguas(self) -> int:
        reparadas = 0
        for losa in self.modelo.by_type("IfcSlab"):
            if self._reparar_contorno_losa(losa):
                reparadas += 1
        return reparadas

    def _regenerar_losa(self, losa: Any) -> None:
        """O012b: recorta la losa en planta contra trabes y columnas."""
        self._anotar_rebote(losa)
        from shapely import wkt
        from shapely.geometry import Polygon

        datos = dict(self._leer_pset(losa, "OPENRVT_Losa"))
        if not datos:
            return
        espesor = float(datos.get("Espesor") or 0.12)
        if espesor <= 0:
            return
        bordes = self._bordes_de_losa(losa)
        contorno = self._contorno_de_bordes(bordes) if bordes else None
        if contorno is not None:
            huella = Polygon(contorno)
        else:
            original = datos.get("Contorno")
            if original:
                try:
                    huella = wkt.loads(str(original))
                except Exception:
                    puntos_losa = self._contorno_de_losa(losa)
                    if puntos_losa is None:
                        return
                    huella = Polygon(puntos_losa)
            else:
                puntos_losa = self._contorno_de_losa(losa)
                if puntos_losa is None:
                    return
                huella = Polygon(puntos_losa)
        vigas, columnas = self._barras_estructura()
        # O061: la losa se coloca en su elevación absoluta (nivel + desfase), pero
        # el cuerpo se extruye en coordenadas locales. El recorte debe compararse
        # con las barras en cotas absolutas, no con −espesor…0.
        import ifcopenshell.util.placement as placement

        matriz = placement.get_local_placement(losa.ObjectPlacement)
        elevacion = float(matriz[2][3])
        recorte = uniones.recortar_losa(
            list(huella.exterior.coords)[:-1],
            vigas,
            columnas,
            elevacion - espesor,
            elevacion,
        )
        if recorte.is_empty:
            # Nunca se deja una losa sin cuerpo: se conserva la huella original.
            recorte = huella
        vertices, caras = self._prisma_de_huella(recorte, -espesor, 0.0)
        self._quitar_representaciones(losa, "Body")
        rep = geometry_api.add_mesh_representation(
            self.modelo, context=self._contexto(), vertices=[vertices], faces=[caras]
        )
        rep.RepresentationIdentifier = "Body"
        geometry_api.assign_representation(self.modelo, product=losa, representation=rep)
        datos["Contorno"] = huella.wkt
        datos["Recorte"] = recorte.wkt
        datos["Area"] = round(float(recorte.area), 9)
        datos["Perimetro"] = round(float(recorte.length), 9)
        self._guardar_pset(losa, "OPENRVT_Losa", datos)

    def _normalizar_uso_losa(self, uso: Any) -> str:
        """O059: clave de uso validada; cualquier otra cosa es error -32602."""
        clave = _texto(uso).strip().lower()
        if clave not in USOS_LOSA:
            raise self._error(
                "El uso de la losa no es válido; use firme, entrepiso o azotea.",
                -32602,
            )
        return clave

    def uso_de_losa(self, losa: Any) -> str:
        """O059: lectura única del uso de una losa (no escribe en el modelo).

        Orden: ``Uso`` del pset OPENRVT_Losa → PredefinedType (BASESLAB/ROOF) →
        FLOOR sin Uso en el nivel más bajo del proyecto = firme; si no, entrepiso.
        """
        entidad = losa
        if isinstance(losa, str):
            entidad = self._entidad_por_gid(losa, ("IfcSlab",))
        datos = self._leer_pset(entidad, "OPENRVT_Losa")
        clave = _texto(datos.get("Uso")).strip().lower()
        if clave in USOS_LOSA:
            return clave
        predefinido = _texto(getattr(entidad, "PredefinedType", "")).upper()
        if predefinido == "BASESLAB":
            return "firme"
        if predefinido == "ROOF":
            return "azotea"
        nivel = self._nivel_de_elemento(entidad)
        inferiores = self._niveles_ordenados()
        if nivel is not None and inferiores and _gid(nivel) == _gid(inferiores[0]):
            return "firme"
        return "entrepiso"

    @crea_openrvt
    def losa_crear(
        self,
        nivel: str,
        puntos: Any,
        espesor: float | None = None,
        desfase: float = 0.0,
        bordes: Any = None,
        uso: str = "entrepiso",
    ) -> dict[str, Any]:
        self._exigir_modelo()
        nivel_entidad = self._nivel_por_gid(nivel)
        clave_uso = self._normalizar_uso_losa(uso)
        try:
            poligono = [(float(p[0]), float(p[1])) for p in puntos]
            espesor = float(
                USOS_LOSA[clave_uso]["espesor"] if espesor is None else espesor
            )
            desfase = float(desfase)
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("El contorno de la losa no es válido.", -32602) from exc
        # O050: cualquier cliente (pantalla, asistente o importación) entrega el
        # contorno por el mismo saneado; el punto de cierre repetido nunca cuenta
        # como un lado más.
        poligono = _limpiar_anillo(poligono)
        if len(poligono) < 3:
            raise self._error("La losa necesita al menos tres vértices.", -32602)
        if abs(_poligono_area(poligono)) <= TOLERANCIA_CALCULO:
            raise self._error("La losa tiene área cero.", -32602)
        if espesor <= 0:
            raise self._error("El espesor de la losa debe ser positivo.", -32602)
        bordes_normalizados = self._normalizar_bordes_losa(bordes, poligono)

        from shapely.geometry import Polygon

        self._instantanea()
        losa = root.create_entity(self.modelo, ifc_class="IfcSlab")
        losa.Name = USOS_LOSA[clave_uso]["nombre"]
        losa.PredefinedType = USOS_LOSA[clave_uso]["predefinido"]
        elevacion = float(nivel_entidad.Elevation or 0.0) + desfase
        matriz = np.identity(4)
        matriz[0][3] = 0.0
        matriz[1][3] = 0.0
        matriz[2][3] = elevacion
        geometry_api.edit_object_placement(self.modelo, product=losa, matrix=matriz)
        self._guardar_pset(
            losa,
            "OPENRVT_Losa",
            {
                "Espesor": espesor,
                "Desfase": desfase,
                "Uso": clave_uso,
                "Puntos": len(poligono),
                "Contorno": Polygon(poligono).wkt,
                "Bordes": json.dumps(bordes_normalizados, ensure_ascii=False),
            },
        )
        self._regenerar_losa(losa)
        spatial_api.assign_container(
            self.modelo, products=[losa], relating_structure=nivel_entidad
        )
        # O012b: la losa puede cubrir o soportar muros ya creados.
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado(
            [losa], mensaje=f"Losa creada ({abs(_poligono_area(poligono)):.2f} m²)."
        )

