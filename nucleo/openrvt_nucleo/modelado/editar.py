"""Edición de propiedades de un elemento."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EditarMixin:
    def elemento_editar(self, globalid: str, cambios: Any) -> dict[str, Any]:
        """Edita sin dejar una instantánea perdida si el núcleo rechaza el valor."""
        profundidad = len(self._deshacer)
        try:
            return self._elemento_editar_impl(globalid, cambios)
        except Exception:
            if len(self._deshacer) > profundidad:
                self.modelo = ifcopenshell.file.from_string(self._deshacer.pop())
            raise

    def _elemento_editar_impl(self, globalid: str, cambios: Any) -> dict[str, Any]:
        self._exigir_modelo()
        if not isinstance(cambios, dict) or not cambios:
            raise self._error("No hay cambios para el elemento.", -32602)
        entidad = self._entidad_por_gid(globalid)
        self._instantanea()
        modificados: list[Any] = [entidad]
        if "nombre" in cambios or "Nombre" in cambios:
            nombre = cambios.get("nombre", cambios.get("Nombre"))
            if not str(nombre or "").strip():
                raise self._error("El nombre no puede quedar vacío.", -32602)
            entidad.Name = str(nombre).strip()

        if entidad.is_a("IfcWall"):
            datos = self._datos_muro(entidad)
            tipo = cambios.get("tipo", cambios.get("Tipo"))
            if tipo is not None and str(tipo) != _nombre(self._tipo_entidad(entidad) or ""):
                self._cambiar_tipo_muro(entidad, self._tipo_muro(str(tipo)))
                datos = self._datos_muro(entidad)
            altura = cambios.get("altura", cambios.get("Altura"))
            longitud = cambios.get("longitud", cambios.get("Longitud"))
            if altura is not None:
                altura = float(altura)
                if altura <= 0:
                    raise self._error("La altura debe ser positiva.", -32602)
                for vano, info in self._aberturas_del_muro(entidad):
                    if info["antepecho"] + info["alto"] > altura + TOLERANCIA:
                        raise self._error(
                            "La nueva altura deja una abertura fuera del muro.", -32023
                        )
                datos["altura"] = altura
                # O016: editar la altura a mano desconecta el tope y fija la altura.
                restriccion = self._restricciones_de(entidad)
                restriccion["NivelTope"] = ""
                restriccion["AlturaSinConexion"] = altura
                self._guardar_pset(entidad, PSET_RESTRICCIONES, restriccion)
            if longitud is not None:
                longitud = float(longitud)
                if longitud <= 0:
                    raise self._error("La longitud del muro debe ser positiva.", -32602)
                for vano, info in self._aberturas_del_muro(entidad):
                    if info["distancia"] + info["ancho"] > longitud + TOLERANCIA:
                        raise self._error(
                            "La nueva longitud deja una abertura fuera del muro.", -32023
                        )
                datos["longitud"] = longitud
            # O032: línea de ubicación, desfase y volteo del ejemplar.
            linea = cambios.get("linea_ubicacion", cambios.get("LineaUbicacion"))
            if linea is not None:
                linea = str(linea)
                if linea not in LINEAS_UBICACION:
                    raise self._error(
                        "«Línea de ubicación» no válida; use eje_nucleo, "
                        "cara_exterior, cara_interior o centro.",
                        -32602,
                    )
                datos["linea_ubicacion"] = linea
            if "desfase_ubicacion" in cambios or "DesfaseUbicacion" in cambios:
                try:
                    datos["desfase_ubicacion"] = float(
                        cambios.get("desfase_ubicacion", cambios.get("DesfaseUbicacion"))
                    )
                except (TypeError, ValueError) as exc:
                    raise self._error("El desfase de ubicación no es un número.", -32602) from exc
            if "volteado" in cambios or "Volteado" in cambios:
                datos["volteado"] = bool(cambios.get("volteado", cambios.get("Volteado")))
            if cambios.get("voltear"):
                datos["volteado"] = not bool(datos.get("volteado"))
            # O035: casilla «Bajar hasta la cimentación».
            if "bajar_a_cimentacion" in cambios or "BajarACimentacion" in cambios:
                valor = cambios.get(
                    "bajar_a_cimentacion", cambios.get("BajarACimentacion")
                )
                datos["bajar_a_cimentacion"] = valor not in (
                    False, "False", "false", 0, "0"
                )
            if (
                altura is not None
                or longitud is not None
                or linea is not None
                or "desfase_ubicacion" in cambios
                or "DesfaseUbicacion" in cambios
                or "volteado" in cambios
                or "Volteado" in cambios
                or "bajar_a_cimentacion" in cambios
                or "BajarACimentacion" in cambios
                or cambios.get("voltear")
            ):
                self._guardar_pset(
                    entidad,
                    "OPENRVT_Muro",
                    {
                        "Longitud": datos["longitud"],
                        "Altura": datos["altura"],
                        "Espesor": datos["espesor"],
                        "Alineacion": datos["alineacion"],
                        "LineaUbicacion": datos["linea_ubicacion"],
                        "DesfaseUbicacion": datos["desfase_ubicacion"],
                        "Volteado": bool(datos["volteado"]),
                        "BajarACimentacion": bool(
                            datos.get("bajar_a_cimentacion", True)
                        ),
                    },
                )
            # O007c: el castillo, el cerramiento y la dala se recalculan con el muro.
            # Primero los dependientes y después el cuerpo: si el núcleo cambió (otro
            # tipo), el muro se recorta con los castillos ya del ancho nuevo.
            modificados.extend(self._actualizar_dependientes_muro(entidad))
            self._regenerar_muro(entidad)
            for vano, info in self._aberturas_del_muro(entidad):
                relleno = self._relleno_de(vano)
                if relleno is not None:
                    self._regenerar_relleno(relleno, vano)
                    modificados.append(relleno)
        elif entidad.is_a("IfcSlab"):
            # O050: toda edición sanea antes el contorno viejo; si no, un borde
            # de cierre repetido haría fallar «cambio_borde» para siempre.
            self._reparar_contorno_losa(entidad)
            datos = self._leer_pset(entidad, "OPENRVT_Losa")
            if "uso" in cambios or "Uso" in cambios:
                clave_uso = self._normalizar_uso_losa(
                    cambios.get("uso", cambios.get("Uso"))
                )
                nombre_actual = _texto(getattr(entidad, "Name", "")).strip()
                entidad.PredefinedType = USOS_LOSA[clave_uso]["predefinido"]
                if not nombre_actual or nombre_actual in NOMBRES_LOSA_OMISION:
                    entidad.Name = USOS_LOSA[clave_uso]["nombre"]
                datos["Uso"] = clave_uso
                self._guardar_pset(entidad, "OPENRVT_Losa", datos)
            poligono = self._poligono_de_losa(entidad)
            bordes_actuales = self._bordes_de_losa(entidad) or self._normalizar_bordes_losa(
                None, poligono
            )
            bordes_nuevos = None
            if "bordes" in cambios or "Bordes" in cambios:
                crudos = cambios.get("bordes", cambios.get("Bordes"))
                bordes_nuevos = self._normalizar_bordes_losa(crudos, poligono)
            if "desfase_bordes" in cambios or "DesfaseBordes" in cambios:
                try:
                    comun = float(
                        cambios.get("desfase_bordes", cambios.get("DesfaseBordes"))
                    )
                except (TypeError, ValueError) as exc:
                    raise self._error(
                        "El desfase de bordes no es un número.", -32602
                    ) from exc
                base = bordes_nuevos or bordes_actuales
                for borde in base:
                    borde["desfase"] = comun
                bordes_nuevos = self._normalizar_bordes_losa(base, poligono)
            if "cambio_borde" in cambios or "CambioBorde" in cambios:
                cambio = cambios.get("cambio_borde", cambios.get("CambioBorde"))
                if not isinstance(cambio, dict):
                    raise self._error("El cambio de borde no es válido.", -32602)
                indice = int(cambio.get("indice", -1))
                if indice < 0 or indice >= len(bordes_actuales):
                    raise self._error("El borde indicado no existe.", -32602)
                base = [dict(b) for b in (bordes_nuevos or bordes_actuales)]
                for clave in ("referencia", "objetivo", "lado", "desfase"):
                    if clave in cambio:
                        base[indice][clave] = cambio[clave]
                bordes_nuevos = self._normalizar_bordes_losa(base, poligono)
            if bordes_nuevos is not None:
                datos["Bordes"] = json.dumps(bordes_nuevos, ensure_ascii=False)
                self._guardar_pset(entidad, "OPENRVT_Losa", datos)
                self._regenerar_losa(entidad)
            if "espesor" in cambios or "Espesor" in cambios:
                espesor = float(cambios.get("espesor", cambios.get("Espesor")))
                if espesor <= 0:
                    raise self._error("El espesor debe ser positivo.", -32602)
                poligono = self._poligono_de_losa(entidad)
                self._quitar_representaciones(entidad, "Body")
                nueva = geometry_api.add_slab_representation(
                    self.modelo,
                    context=self._contexto(),
                    depth=espesor,
                    direction_sense="NEGATIVE",
                    polyline=poligono,
                )
                nueva.RepresentationIdentifier = "Body"
                geometry_api.assign_representation(self.modelo, product=entidad, representation=nueva)
                datos["Espesor"] = espesor
                self._guardar_pset(entidad, "OPENRVT_Losa", datos)
        elif self._es_clase_estructura(entidad.is_a()) and self._leer_pset(
            entidad, "OPENRVT_Estructura"
        ):
            datos = dict(self._leer_pset(entidad, "OPENRVT_Estructura"))
            antes_x = float(datos.get("X") or 0.0)
            antes_y = float(datos.get("Y") or 0.0)
            claves = {
                "desplante": "Desplante", "Desplante": "Desplante",
                "desfase": "Desfase", "Desfase": "Desfase",
                "altura": "Altura", "Altura": "Altura",
                "rotacion": "Rotacion", "Rotacion": "Rotacion",
                "nivel_superior": "NivelSuperior", "NivelSuperior": "NivelSuperior",
                "x": "X", "X": "X", "y": "Y", "Y": "Y",
                "x1": "X1", "X1": "X1", "y1": "Y1", "Y1": "Y1",
                "x2": "X2", "X2": "X2", "y2": "Y2", "Y2": "Y2",
                "prolongacion_inicio": "ProlongacionInicio",
                "ProlongacionInicio": "ProlongacionInicio",
                "prolongacion_fin": "ProlongacionFin",
                "ProlongacionFin": "ProlongacionFin",
            }
            predef_actual = _texto(getattr(entidad, "PredefinedType", ""))
            if (
                entidad.is_a("IfcFooting")
                and predef_actual != "FOOTING_BEAM"
                and any(clave in cambios for clave in ("altura", "Altura", "desfase", "Desfase"))
            ):
                raise self._error(
                    "La zapata no tiene altura ni desfase: use el desplante.", -32602
                )
            for clave, valor in cambios.items():
                destino = claves.get(clave)
                if destino is None:
                    continue
                if destino in ("NivelSuperior",):
                    datos[destino] = _texto(valor)
                else:
                    try:
                        datos[destino] = float(valor)
                    except (TypeError, ValueError) as exc:
                        raise self._error(f"«{destino}» no es un número.", -32602) from exc
            if "Altura" in datos and float(datos["Altura"]) <= 0:
                raise self._error("La altura debe ser positiva.", -32602)
            if "Desplante" in datos and float(datos["Desplante"]) <= 0:
                raise self._error("El desplante debe ser positivo.", -32602)
            for clave in ("ProlongacionInicio", "ProlongacionFin"):
                if clave in datos and float(datos[clave]) < 0:
                    raise self._error("Las prolongaciones no pueden ser negativas.", -32602)
            tipo = self._tipo_entidad(entidad)
            _, seccion, _ = self._seccion_y_armado(tipo)
            nivel = self._nivel_por_gid(_texto(datos.get("Nivel") or "")) if datos.get("Nivel") else None
            if nivel is None:
                nivel = self._nivel_que_contiene(entidad)
            elevacion = float(nivel.Elevation or 0.0) if nivel is not None else 0.0
            alias = self._estructura_de_tipo(tipo) or "trabe"
            if entidad.is_a("IfcColumn"):
                datos["Base"] = elevacion
                if "Altura" in cambios and "NivelSuperior" not in cambios:
                    datos["NivelSuperior"] = ""
                if datos.get("NivelSuperior"):
                    superior = self._nivel_por_gid(_texto(datos["NivelSuperior"]))
                    datos["Altura"] = float(superior.Elevation or 0.0) - elevacion
                if float(datos.get("Altura") or 0.0) <= 0:
                    raise self._error("La altura de la columna debe ser positiva.", -32602)
            elif entidad.is_a("IfcBeam") or _texto(
                getattr(entidad, "PredefinedType", "")
            ) == "FOOTING_BEAM":
                alto = float(seccion.get("H") or 0.40)
                datos["Longitud"] = math.hypot(
                    float(datos.get("X2") or 0.0) - float(datos.get("X1") or 0.0),
                    float(datos.get("Y2") or 0.0) - float(datos.get("Y1") or 0.0),
                )
                if datos["Longitud"] <= TOLERANCIA_CALCULO:
                    raise self._error("La viga necesita dos puntos distintos.", -32602)
                lecho_bajo = alias == "dala"
                datos["Z"] = elevacion + (
                    alto / 2.0
                    if lecho_bajo
                    else float(datos.get("Desfase") or 0.0) - alto / 2.0
                )
            elif _texto(getattr(entidad, "PredefinedType", "")) == "STRIP_FOOTING":
                alto = float(seccion.get("Peralte") or 0.20)
                datos["Longitud"] = math.hypot(
                    float(datos.get("X2") or 0.0) - float(datos.get("X1") or 0.0),
                    float(datos.get("Y2") or 0.0) - float(datos.get("Y1") or 0.0),
                )
                if datos["Longitud"] <= TOLERANCIA_CALCULO:
                    raise self._error("La zapata corrida necesita dos puntos distintos.", -32602)
                datos["Z"] = elevacion - float(datos.get("Desplante") or 0.80) + alto / 2.0
            else:
                datos["Z"] = elevacion - float(datos.get("Desplante") or 1.0)
            # O054: «Ancho: del núcleo / del tipo» para castillos, trabes, dalas y
            # cerramientos ligados a un muro.
            if "AnchoDelMuro" in cambios or "ancho_del_muro" in cambios:
                datos["AnchoDelMuro"] = self._del_nucleo(
                    cambios.get("AnchoDelMuro", cambios.get("ancho_del_muro"))
                )
                if alias in ("cerramiento", "dala", "trabe", "contratrabe"):
                    liga = self._leer_liga(entidad)
                    muro = None
                    if liga.get("Muro"):
                        try:
                            muro = self._entidad_por_gid(
                                _texto(liga["Muro"]), ("IfcWall",)
                            )
                        except Exception:
                            muro = None
                    if muro is not None and self._del_nucleo(datos["AnchoDelMuro"]):
                        datos["B"] = self._capas_nucleo(muro)[0]
                    else:
                        datos["B"] = float(seccion.get("B") or 0.20)
                    datos["H"] = float(seccion.get("H") or datos.get("H") or 0.40)
            self._guardar_pset(entidad, "OPENRVT_Estructura", datos)
            if (
                entidad.is_a("IfcColumn")
                and self._estructura_de_tipo(self._tipo_entidad(entidad)) == "castillo"
            ):
                liga = self._leer_liga(entidad)
                muro = None
                if liga.get("Muro"):
                    try:
                        muro = self._entidad_por_gid(_texto(liga["Muro"]), ("IfcWall",))
                    except Exception:
                        muro = None
                if muro is not None:
                    self._ajustar_castillo(entidad, muro)
            if entidad.is_a("IfcColumn"):
                restriccion = self._restricciones_de(entidad)
                restriccion["NivelTope"] = _texto(datos.get("NivelSuperior"))
                restriccion["AlturaSinConexion"] = float(datos.get("Altura") or 0.0)
                self._guardar_pset(entidad, PSET_RESTRICCIONES, restriccion)
            self._regenerar_estructura(entidad)
            # O035: editar la cimentación recalcula la base de los muros encima.
            if self._es_cimentacion_bajo_muro(entidad):
                self._actualizar_muros_sobre_cimentacion()
            if entidad.is_a("IfcColumn"):
                dx = float(datos.get("X") or 0.0) - antes_x
                dy = float(datos.get("Y") or 0.0) - antes_y
                if abs(dx) + abs(dy) > TOLERANCIA_CALCULO:
                    for zapata in self._zapatas_de_columna(entidad):
                        self._mover_producto(zapata, dx, dy, 0.0)
                        modificados.append(zapata)
        elif entidad.is_a("IfcOpeningElement"):
            datos = self._datos_abertura(entidad) or {}
            ancho = float(cambios.get("ancho", cambios.get("Ancho", datos.get("ancho", 0.9))))
            alto = float(cambios.get("alto", cambios.get("Alto", datos.get("alto", 2.1))))
            modificados.extend(self._aplicar_medidas_abertura(entidad, ancho, alto))
        elif entidad.is_a("IfcDoor") or entidad.is_a("IfcWindow"):
            for clave in ("ancho", "Ancho"):
                if clave in cambios:
                    entidad.OverallWidth = float(cambios[clave])
            for clave in ("alto", "Alto"):
                if clave in cambios:
                    entidad.OverallHeight = float(cambios[clave])
            for rel in getattr(entidad, "FillsVoids", ()) or ():
                vano = getattr(rel, "RelatingOpeningElement", None)
                if vano is not None:
                    modificados.extend(
                        self._aplicar_medidas_abertura(
                            vano,
                            float(entidad.OverallWidth),
                            float(entidad.OverallHeight),
                        )
                    )
        else:
            raise self._error("Este elemento no tiene propiedades editables.", -32025)
        self._recalcular_uniones_estructura()
        self.con_cambios = True
        return self._resultado(modificados=modificados, mensaje="Elemento actualizado.")

