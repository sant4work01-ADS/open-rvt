"""Restricciones de base y tope por nivel (O016)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class RestriccionesMixin:
    # ------------------------------------------------------------------ restricciones (O016)
    def _nivel_inmediato_superior(self, elevacion: float) -> Any | None:
        superiores = [
            n
            for n in self.modelo.by_type("IfcBuildingStorey")
            if float(n.Elevation or 0.0) > float(elevacion) + TOLERANCIA_CALCULO
        ]
        if not superiores:
            return None
        return min(superiores, key=lambda n: float(n.Elevation or 0.0))

    def _nivel_que_contiene(self, elemento: Any) -> Any | None:
        for rel in getattr(elemento, "ContainedInStructure", ()) or ():
            estructura = getattr(rel, "RelatingStructure", None)
            if estructura is not None and estructura.is_a("IfcBuildingStorey"):
                return estructura
        return None

    def _peralte_de(self, elemento: Any) -> float:
        """Peralte del tipo o de la instancia de un elemento horizontal."""
        tipo = self._tipo_entidad(elemento)
        _alias, seccion, _armado = self._seccion_y_armado(tipo)
        return float(seccion.get("H") or seccion.get("Peralte") or 0.20)

    def _dado_alto_de(self, seccion: dict[str, Any], desplante: float) -> float:
        """O037: el alto del dado se deriva del desplante y el peralte (no del tipo)."""
        dado_b = float(seccion.get("DadoB") or 0.0)
        dado_h = float(seccion.get("DadoH") or 0.0)
        if dado_b <= 0 or dado_h <= 0:
            return 0.0
        return desplante - float(seccion.get("Peralte") or 0.25)

    def _tope_dado(self, zapata: Any) -> float | None:
        """O041: cota superior del dado, o None si la zapata no lleva dado.

        El dado sube hasta el nivel de la zapata solo si nada lo cubre en planta. Si
        queda debajo de una losa de ese nivel, termina en su cara inferior (la losa
        conserva su volumen). Las contratrabes y trabes no cubren el dado: el dado las
        recorta (jerarquía O012b), así que nunca quedan encima.
        """
        from shapely.geometry import Polygon

        tipo = self._tipo_entidad(zapata)
        _alias, seccion, _armado = self._seccion_y_armado(tipo)
        dado_b = float(seccion.get("DadoB") or 0.0)
        dado_h = float(seccion.get("DadoH") or 0.0)
        datos = self._leer_pset(zapata, "OPENRVT_Estructura")
        if dado_b <= 0 or dado_h <= 0 or not datos or datos.get("Desplante") is None:
            return None
        z = float(datos.get("Z") or 0.0)
        tope = z + float(datos.get("Desplante"))
        x, y = float(datos.get("X") or 0.0), float(datos.get("Y") or 0.0)
        rot = float(datos.get("Rotacion") or 0.0)
        coseno, seno = math.cos(rot), math.sin(rot)
        puntos = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, ly = sx * dado_b / 2.0, sy * dado_h / 2.0
            puntos.append((x + lx * coseno - ly * seno, y + lx * seno + ly * coseno))
        huella_dado = Polygon(puntos)
        nivel = self._nivel_que_contiene(zapata)
        if nivel is None:
            nivel = self._nivel_por_gid(_texto(datos.get("Nivel")))
        nivel_gid = _gid(nivel) if nivel is not None else None
        elev = float(nivel.Elevation or 0.0) if nivel is not None else 0.0
        techo = tope
        for elemento in self.modelo.by_type("IfcSlab"):
            if nivel_gid is not None and _gid(self._nivel_que_contiene(elemento)) != nivel_gid:
                continue
            ldatos = self._leer_pset(elemento, "OPENRVT_Losa")
            if not ldatos:
                continue
            espesor = float(ldatos.get("Espesor") or 0.12)
            desfase = float(ldatos.get("Desfase") or 0.0)
            fondo = elev + desfase - espesor
            if fondo >= tope - 1e-9:
                continue
            puntos_losa = self._contorno_de_losa(elemento)
            if puntos_losa is None:
                # O063: no se ignora en silencio; el aviso sale con las cantidades.
                avisos = getattr(self, "_avisos_losa", None)
                if avisos is not None:
                    aviso = {
                        "globalid": _gid(elemento),
                        "mensaje": "sin contorno legible",
                    }
                    if aviso not in avisos:
                        avisos.append(aviso)
                continue
            huella = Polygon(puntos_losa)
            if not huella.is_empty and huella.intersects(huella_dado):
                techo = min(techo, fondo)
        return techo

    def _lecho_bajo(self, elemento: Any) -> bool:
        """Las dalas se cuelgan del nivel por su lecho inferior.

        O040: el cerramiento mide al lecho **superior** (la corona del muro), no al
        inferior; solo la dala de desplante cuelga por su fondo.
        """
        alias = self._estructura_de_tipo(self._tipo_entidad(elemento))
        return alias == "dala"

    def _z_de_elemento(self, elemento: Any) -> float:
        """Cota de referencia vertical (base del muro/columna, lecho de vigas)."""
        import ifcopenshell.util.placement as placement

        if elemento.is_a("IfcColumn"):
            datos = self._leer_pset(elemento, "OPENRVT_Estructura")
            if datos.get("Base") is not None:
                return float(datos.get("Base") or 0.0)
        if elemento.is_a("IfcWall"):
            return float(placement.get_local_placement(elemento.ObjectPlacement)[2][3])
        z = float(placement.get_local_placement(elemento.ObjectPlacement)[2][3])
        if elemento.is_a("IfcFooting"):
            predef = _texto(getattr(elemento, "PredefinedType", ""))
            if predef == "STRIP_FOOTING":
                return z - self._peralte_de(elemento) / 2.0
            if predef != "FOOTING_BEAM":
                return z
        peralte = self._peralte_de(elemento)
        return z - peralte / 2.0 if self._lecho_bajo(elemento) else z + peralte / 2.0

    def _altura_actual(self, elemento: Any) -> float:
        if elemento.is_a("IfcColumn"):
            datos = self._leer_pset(elemento, "OPENRVT_Estructura")
            return float(datos.get("Altura") or 2.60)
        if elemento.is_a("IfcWall"):
            return float(self._datos_muro(elemento)["altura"])
        return self._peralte_de(elemento)

    def _restricciones_de(self, elemento: Any) -> dict[str, Any]:
        """Lee las restricciones; un modelo viejo se interpreta sin pset (tolerante)."""
        datos = self._leer_pset(elemento, PSET_RESTRICCIONES)
        altura_actual = self._altura_actual(elemento)
        # O033: las zapatas aisladas y corridas solo cuelgan de un nivel con su
        # desplante. Los archivos viejos guardaban además un DesfaseBase que ya no
        # interviene: manda el Desplante guardado (o la geometría si falta).
        predef = _texto(getattr(elemento, "PredefinedType", ""))
        if elemento.is_a("IfcFooting") and predef != "FOOTING_BEAM":
            nivel = self._nivel_que_contiene(elemento)
            if nivel is None:
                pset = self._leer_pset(elemento, "OPENRVT_Estructura")
                if pset.get("Nivel"):
                    nivel = self._nivel_por_gid(_texto(pset["Nivel"]))
            if nivel is None:
                niveles = self.modelo.by_type("IfcBuildingStorey")
                nivel = niveles[0] if niveles else None
            elevacion = float(getattr(nivel, "Elevation", 0.0) or 0.0) if nivel else 0.0
            colocacion = self._leer_pset(elemento, "OPENRVT_Estructura")
            desplante: float | None = None
            if colocacion.get("Desplante") is not None:
                try:
                    desplante = float(colocacion.get("Desplante"))
                except (TypeError, ValueError):
                    desplante = None
            if desplante is None:
                desplante = elevacion - self._z_de_elemento(elemento)
            return {
                "NivelBase": _gid(nivel) if nivel is not None else "",
                "Desplante": float(desplante),
            }
        if datos:
            base = _texto(datos.get("NivelBase"))
            tope = _texto(datos.get("NivelTope"))
            if base:
                return {
                    "NivelBase": base,
                    "DesfaseBase": float(datos.get("DesfaseBase") or 0.0),
                    "NivelTope": tope,
                    "DesfaseTope": float(datos.get("DesfaseTope") or 0.0),
                    "AlturaSinConexion": float(
                        datos.get("AlturaSinConexion") or altura_actual
                    ),
                }
        nivel = self._nivel_que_contiene(elemento)
        if nivel is None:
            pset = self._leer_pset(elemento, "OPENRVT_Estructura")
            if pset.get("Nivel"):
                nivel = self._nivel_por_gid(_texto(pset["Nivel"]))
        if nivel is None:
            niveles = self.modelo.by_type("IfcBuildingStorey")
            nivel = niveles[0] if niveles else None
        elevacion = float(getattr(nivel, "Elevation", 0.0) or 0.0) if nivel else 0.0
        z = self._z_de_elemento(elemento)
        return {
            "NivelBase": _gid(nivel) if nivel is not None else "",
            "DesfaseBase": z - elevacion,
            "NivelTope": "",
            "DesfaseTope": 0.0,
            "AlturaSinConexion": altura_actual,
        }

    def _validar_altura_muro(self, muro: Any, altura: float) -> None:
        for _vano, info in self._aberturas_del_muro(muro):
            if info["antepecho"] + info["alto"] > altura + TOLERANCIA:
                raise self._error(
                    "La nueva altura deja una abertura fuera del muro.", -32023
                )

    def _revertir_instantanea(self) -> None:
        if self._deshacer:
            self.modelo = ifcopenshell.file.from_string(self._deshacer.pop())

    def _aplicar_restriccion(self, elemento: Any, restriccion: dict[str, Any]) -> None:
        """Recalcula z y altura de un muro o columna desde sus restricciones."""
        # O026: conserva los datos de alineación guardados en el mismo pset.
        restriccion = {
            **self._leer_pset(elemento, PSET_RESTRICCIONES),
            **restriccion,
        }
        nivel_base = self._nivel_por_gid(_texto(restriccion.get("NivelBase")))
        elev_base = float(nivel_base.Elevation or 0.0)
        tope = _texto(restriccion.get("NivelTope"))
        elev_tope = None
        if tope:
            nivel_tope = self._nivel_por_gid(tope)
            elev_tope = float(nivel_tope.Elevation or 0.0)
        es_zapata = elemento.is_a("IfcFooting") and _texto(
            getattr(elemento, "PredefinedType", "")
        ) != "FOOTING_BEAM"
        if es_zapata:
            z, altura = 0.0, 0.0
        elif elemento.is_a("IfcBeam"):
            # O041: trabes, cerramientos y dalas no tienen tope ni altura; su
            # lecho de referencia sale del nivel más el desfase, sin exigir
            # altura positiva (esa validación es de muros y columnas).
            z = elev_base + float(restriccion.get("DesfaseBase") or 0.0)
            altura = 0.0
        else:
            z, altura = altura_restringida(
                elev_base,
                float(restriccion.get("DesfaseBase") or 0.0),
                elev_tope,
                float(restriccion.get("DesfaseTope") or 0.0),
                float(restriccion.get("AlturaSinConexion") or 0.0),
            )
        if elemento.is_a("IfcWall"):
            self._validar_altura_muro(elemento, altura)
            datos = self._datos_muro(elemento)
            matriz = np.array(
                [
                    [datos["dx"], -datos["dy"], 0.0, datos["x1"]],
                    [datos["dy"], datos["dx"], 0.0, datos["y1"]],
                    [0.0, 0.0, 1.0, z],
                    [0.0, 0.0, 0.0, 1.0],
                ]
            )
            geometry_api.edit_object_placement(self.modelo, product=elemento, matrix=matriz)
            pset = self._leer_pset(elemento, "OPENRVT_Muro")
            if pset:
                pset["Altura"] = altura
                self._guardar_pset(elemento, "OPENRVT_Muro", pset)
            self._guardar_pset(elemento, PSET_RESTRICCIONES, restriccion)
            self._regenerar_muro(elemento)
            # O040: al cambiar la corona del muro, el cerramiento y los castillos
            # ligados se recalculan en la misma instantánea.
            self._actualizar_dependientes_muro(elemento)
        elif elemento.is_a("IfcColumn"):
            datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
            datos["Base"] = z
            datos["Altura"] = altura
            datos["NivelSuperior"] = tope
            self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
            self._guardar_pset(elemento, PSET_RESTRICCIONES, restriccion)
            self._regenerar_estructura(elemento)
        elif elemento.is_a("IfcBeam") or elemento.is_a("IfcFooting"):
            # O028: trabes, cerramientos, dalas, contratrabes y zapatas siguen al
            # nivel. Para las piezas horizontales el desfase se mide al lecho de
            # referencia (tope, salvo la dala que cuelga por su fondo) y el peralte
            # sale del tipo.
            predef = _texto(getattr(elemento, "PredefinedType", ""))
            datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
            peralte = self._peralte_de(elemento)
            if elemento.is_a("IfcFooting") and predef != "FOOTING_BEAM":
                # O033: un solo parámetro de altura. El desplante se mide desde el
                # nivel de base; la Z se deriva siempre con el peralte del tipo.
                if restriccion.get("Desplante") is None:
                    restriccion["Desplante"] = datos.get("Desplante")
                try:
                    desplante = float(restriccion.get("Desplante") or 0.0)
                except (TypeError, ValueError):
                    desplante = 0.0
                if desplante <= TOLERANCIA_CALCULO:
                    raise self._error("El desplante debe ser positivo.", -32602)
                # O037: con dado, el desplante debe superar el peralte para que el
                # dado llegue exactamente al nivel de base.
                if predef != "STRIP_FOOTING":
                    _alias, seccion, _armado = self._seccion_y_armado(
                        self._tipo_entidad(elemento)
                    )
                    if (
                        float(seccion.get("DadoB") or 0.0) > 0
                        and float(seccion.get("DadoH") or 0.0) > 0
                        and desplante <= peralte + TOLERANCIA_CALCULO
                    ):
                        raise self._error(
                            "El desplante es menor que el peralte: el dado no cabe.",
                            -32602,
                        )
                datos["Desplante"] = desplante
                if predef == "STRIP_FOOTING":
                    datos["Z"] = (
                        float(nivel_base.Elevation or 0.0) - desplante + peralte / 2.0
                    )
                else:
                    datos["Z"] = float(nivel_base.Elevation or 0.0) - desplante
                restriccion["Desplante"] = desplante
                for clave in (
                    "DesfaseBase", "NivelTope", "DesfaseTope", "AlturaSinConexion"
                ):
                    restriccion.pop(clave, None)
            elif elemento.is_a("IfcFooting") and predef == "STRIP_FOOTING":
                datos["Z"] = z + peralte / 2.0
                datos["Desplante"] = float(nivel_base.Elevation or 0.0) - z
            else:
                centro = z + peralte / 2.0 if self._lecho_bajo(elemento) else z - peralte / 2.0
                datos["Z"] = centro
                datos["Desfase"] = z - float(nivel_base.Elevation or 0.0)
                datos["Nivel"] = _gid(nivel_base)
            self._guardar_pset(elemento, "OPENRVT_Estructura", datos)
            self._guardar_pset(elemento, PSET_RESTRICCIONES, restriccion)
            if elemento.is_a("IfcFooting") and predef != "FOOTING_BEAM":
                self._quitar_claves_pset(
                    elemento,
                    PSET_RESTRICCIONES,
                    ("DesfaseBase", "NivelTope", "DesfaseTope", "AlturaSinConexion"),
                )
            self._regenerar_estructura(elemento)
            # O050: el castillo del muro sigue a la cara inferior del cerramiento
            # en la misma instantánea (un solo paso de Deshacer).
            muro_liga = self._muro_ligado_de(elemento)
            if muro_liga:
                try:
                    self._actualizar_castillos(
                        self._entidad_por_gid(muro_liga, ("IfcWall",))
                    )
                except Exception:
                    LOG.debug("no se pudieron actualizar los castillos", exc_info=True)
            # O045: el cerramiento va embebido; no cambia la altura del muro.
            # O035: al cambiar el desplante o la posición de la cimentación, los
            # muros que se apoyan en ella recalculan su base.
            if self._es_cimentacion_bajo_muro(elemento):
                self._actualizar_muros_sobre_cimentacion()

    def _recalcular_restricciones(self, niveles: set[str]) -> list[Any]:
        """Recalcula los elementos ligados a cualquiera de esos niveles."""
        modificados: list[Any] = []
        elementos = (
            self.modelo.by_type("IfcWall")
            + self.modelo.by_type("IfcColumn")
            + self.modelo.by_type("IfcBeam")
            + self.modelo.by_type("IfcFooting")
        )
        for elemento in elementos:
            # O028: vigas y zapatas importadas (sin datos de OPEN-RVT) no se
            # regeneran; las mueve el desplazamiento genérico del nivel.
            if (elemento.is_a("IfcBeam") or elemento.is_a("IfcFooting")) and not self._leer_pset(
                elemento, "OPENRVT_Estructura"
            ):
                continue
            restriccion = self._restricciones_de(elemento)
            if (
                restriccion["NivelBase"] in niveles
                or restriccion.get("NivelTope") in niveles
            ):
                self._aplicar_restriccion(elemento, restriccion)
                modificados.append(elemento)
        return modificados

