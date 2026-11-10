"""Empujar caras de elementos (O056)."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class EmpujarMixin:
    # --------------------------------------------------- O056: empujar caras
    def _empujar_altura_muro(self, muro: Any, distancia: float) -> str:
        """Muro superior: cambia la altura respetando el nivel de tope."""
        datos = self._datos_muro(muro)
        actual = float(datos["altura"])
        nueva = actual + distancia
        aviso = ""
        if nueva < 0.05:
            nueva = 0.05
            distancia = nueva - actual
            aviso = "La altura mínima es 0.05 m."
        restriccion = dict(self._restricciones_de(muro))
        if _texto(restriccion.get("NivelTope")):
            restriccion["DesfaseTope"] = (
                float(restriccion.get("DesfaseTope") or 0.0) + distancia
            )
        else:
            restriccion["AlturaSinConexion"] = nueva
        self._aplicar_restriccion(muro, restriccion)
        return aviso

    def _empujar_extremo_lineal(
        self,
        elemento: Any,
        normal: tuple[float, float, float],
        punto: tuple[float, float, float],
        distancia: float,
    ) -> str:
        """Muro o viga: mueve el extremo hacia el que apunta la normal."""
        if elemento.is_a("IfcWall"):
            datos = self._datos_muro(elemento)
            x1, y1, x2, y2 = datos["x1"], datos["y1"], datos["x2"], datos["y2"]
            largo = float(datos["longitud"])
            ux, uy = datos["dx"], datos["dy"]
            es_muro = True
        else:
            datos = dict(self._leer_pset(elemento, "OPENRVT_Estructura"))
            x1 = float(datos.get("X1") or 0.0)
            y1 = float(datos.get("Y1") or 0.0)
            x2 = float(datos.get("X2") or 0.0)
            y2 = float(datos.get("Y2") or 0.0)
            largo = math.hypot(x2 - x1, y2 - y1)
            if largo <= TOLERANCIA_CALCULO:
                raise self._error("El elemento no tiene una línea de ubicación.", -32602)
            ux, uy = (x2 - x1) / largo, (y2 - y1) / largo
            es_muro = False
        signo = normal[0] * ux + normal[1] * uy
        if abs(signo) < 0.7:
            raise self._error("No se puede empujar este elemento.", -32602)
        delta = distancia if signo > 0 else -distancia
        nuevo_largo = largo + delta
        aviso = ""
        if nuevo_largo < 0.05:
            delta = 0.05 - largo
            nuevo_largo = 0.05
            aviso = "La longitud mínima es 0.05 m."
        if es_muro:
            for _vano, info in self._aberturas_del_muro(elemento):
                if info["distancia"] + info["ancho"] > nuevo_largo + TOLERANCIA:
                    raise self._error(
                        "La nueva longitud deja una abertura fuera del muro.", -32023
                    )
        if signo > 0:
            nx1, ny1 = x1, y1
            nx2, ny2 = x2 + ux * delta, y2 + uy * delta
        else:
            nx1, ny1 = x1 + ux * delta, y1 + uy * delta
            nx2, ny2 = x2, y2
        self._aplicar_planta(elemento, nx1, ny1, nx2, ny2)
        return aviso

    def _empujar_borde_losa(
        self,
        losa: Any,
        normal: tuple[float, float, float],
        punto: tuple[float, float, float],
        distancia: float,
    ) -> str:
        """Losa lateral: mueve el lado tocado; los lados vecinos se estiran."""
        from shapely.geometry import Polygon

        nx, ny = normal[0], normal[1]
        largo_normal = math.hypot(nx, ny)
        if largo_normal <= TOLERANCIA_CALCULO:
            raise self._error("El espesor lo da el tipo.", -32602)
        nx, ny = nx / largo_normal, ny / largo_normal
        poligono = self._poligono_de_losa(losa)
        proyecciones = [x * nx + y * ny for x, y in poligono]
        extension = max(proyecciones) - min(proyecciones)
        aviso = ""
        if extension + distancia < 0.05:
            distancia = 0.05 - extension
            aviso = "La medida mínima es 0.05 m."
        nuevo: list[tuple[float, float]] = []
        tocados = 0
        for x, y in poligono:
            separacion = (x - punto[0]) * nx + (y - punto[1]) * ny
            if abs(separacion) <= 1e-3:
                nuevo.append((x + nx * distancia, y + ny * distancia))
                tocados += 1
            else:
                nuevo.append((x, y))
        if tocados == 0:
            raise self._error("No se pudo identificar el borde de la losa.", -32602)
        bordes = self._bordes_de_losa(losa)
        if not bordes:
            bordes = self._normalizar_bordes_losa(None, poligono)
        mejor = -1
        menor = float("inf")
        for indice, borde in enumerate(bordes):
            linea = self._linea_de_borde(borde)
            if linea is None:
                continue
            (px, py), (dx, dy) = linea
            separacion = abs(-(punto[0] - px) * dy + (punto[1] - py) * dx)
            if separacion < menor:
                menor = separacion
                mejor = indice
        if mejor >= 0:
            borde = dict(bordes[mejor])
            a = borde.get("punto_a")
            b = borde.get("punto_b")
            if a is None or b is None:
                a = [poligono[mejor][0], poligono[mejor][1]]
                b = [
                    poligono[(mejor + 1) % len(poligono)][0],
                    poligono[(mejor + 1) % len(poligono)][1],
                ]
            borde.update(
                {
                    "referencia": "libre",
                    "objetivo": "",
                    "lado": "libre",
                    "desfase": 0.0,
                    "punto_a": [float(a[0]) + nx * distancia, float(a[1]) + ny * distancia],
                    "punto_b": [float(b[0]) + nx * distancia, float(b[1]) + ny * distancia],
                }
            )
            bordes[mejor] = borde
        bordes = self._normalizar_bordes_losa(bordes, nuevo)
        datos = dict(self._leer_pset(losa, "OPENRVT_Losa"))
        datos["Bordes"] = json.dumps(bordes, ensure_ascii=False)
        datos["Puntos"] = len(nuevo)
        datos["Contorno"] = Polygon(nuevo).wkt
        self._guardar_pset(losa, "OPENRVT_Losa", datos)
        self._regenerar_losa(losa)
        return aviso

    def _empujar_altura_columna(self, columna: Any, distancia: float) -> str:
        datos = dict(self._leer_pset(columna, "OPENRVT_Estructura"))
        actual = float(datos.get("Altura") or 0.0)
        nueva = actual + distancia
        aviso = ""
        if nueva < 0.05:
            nueva = 0.05
            aviso = "La altura mínima es 0.05 m."
        datos["Altura"] = nueva
        datos["NivelSuperior"] = ""
        self._guardar_pset(columna, "OPENRVT_Estructura", datos)
        restriccion = dict(self._restricciones_de(columna))
        restriccion["NivelTope"] = ""
        restriccion["AlturaSinConexion"] = nueva
        self._guardar_pset(columna, PSET_RESTRICCIONES, restriccion)
        self._regenerar_estructura(columna)
        return aviso

    def _empujar_generico(
        self,
        proxy: Any,
        normal: tuple[float, float, float],
        punto: tuple[float, float, float],
        distancia: float,
    ) -> str:
        """Genérico: mueve la cara de la caja y recalcula sus cantidades."""
        datos = dict(self._leer_pset(proxy, "OPENRVT_Generico"))
        altura = float(datos.get("Altura") or 0.0)
        area = float(datos.get("AreaBase") or 0.0)
        solido = None
        for rep in getattr(getattr(proxy, "Representation", None), "Representations", ()) or ():
            for item in getattr(rep, "Items", ()) or ():
                if item.is_a("IfcExtrudedAreaSolid"):
                    solido = item
                    break
            if solido is not None:
                break
        if solido is None:
            raise self._error("El genérico no tiene una extrusión.", -32602)
        aviso = ""
        if abs(normal[2]) >= 0.7:
            nueva = altura + distancia if altura >= 0 else altura - distancia
            if abs(nueva) < 0.05:
                nueva = 0.05 if nueva >= 0 else -0.05
                aviso = "La medida mínima es 0.05 m."
            solido.Depth = abs(nueva)
            solido.ExtrudedDirection.DirectionRatios = (0.0, 0.0, 1.0 if nueva >= 0 else -1.0)
            altura = nueva
            volumen = area * abs(altura)
        else:
            eje = 0 if abs(normal[0]) >= abs(normal[1]) else 1
            positivo = normal[eje] >= 0
            perfil = solido.SweptArea
            curva = perfil.OuterCurve
            puntos = [list(p.Coordinates) for p in curva.Points]
            if len(puntos) < 4:
                raise self._error("El contorno del genérico no es válido.", -32602)
            unicos = puntos[:-1]
            valores = [p[eje] for p in unicos]
            extremo = max(valores) if positivo else min(valores)
            extension = max(valores) - min(valores)
            if extension + distancia < 0.05:
                distancia = 0.05 - extension
                aviso = "La medida mínima es 0.05 m."
            desplazamiento = distancia if positivo else -distancia
            for p in puntos:
                if abs(p[eje] - extremo) <= 1e-5:
                    p[eje] += desplazamiento
            for punto_ifc, coords in zip(curva.Points, puntos):
                punto_ifc.Coordinates = tuple(coords)
            area = abs(_poligono_area([(p[0], p[1]) for p in unicos]))
            volumen = area * abs(altura)
        for relacion in getattr(proxy, "IsDefinedBy", ()) or ():
            if not relacion.is_a("IfcRelDefinesByProperties"):
                continue
            definicion = getattr(relacion, "RelatingPropertyDefinition", None)
            if definicion is None or not definicion.is_a("IfcElementQuantity"):
                continue
            for cantidad in getattr(definicion, "Quantities", ()) or ():
                if cantidad.Name == "NetVolume":
                    cantidad.VolumeValue = volumen
                elif cantidad.Name == "NetArea":
                    cantidad.AreaValue = area
        datos.update({"Altura": altura, "AreaBase": area, "Volumen": volumen})
        self._guardar_pset(proxy, "OPENRVT_Generico", datos)
        return aviso

    def elementos_empujar_cara(
        self,
        globalid: str,
        normal: Any,
        punto: Any,
        distancia: Any,
    ) -> dict[str, Any]:
        """O056: empuja una cara existente editando el parámetro real del IFC.

        La cara se identifica por su normal exterior y un punto de su plano. La
        operación entera va en una sola instantánea (un solo paso de Deshacer).
        """
        self._exigir_modelo()
        entidad = self._entidad_por_gid(globalid)
        try:
            n = [float(v) for v in normal]
            p = [float(v) for v in punto]
            distancia = float(distancia)
        except (TypeError, ValueError, IndexError) as exc:
            raise self._error("La cara a empujar no es válida.", -32602) from exc
        if len(n) != 3 or len(p) != 3:
            raise self._error("La cara a empujar no es válida.", -32602)
        largo_normal = math.hypot(*n)
        if largo_normal <= TOLERANCIA_CALCULO:
            raise self._error("La normal de la cara no es válida.", -32602)
        normal_t = (n[0] / largo_normal, n[1] / largo_normal, n[2] / largo_normal)
        if not math.isfinite(distancia) or abs(distancia) <= TOLERANCIA_CALCULO:
            raise self._error("La distancia debe ser distinta de cero.", -32602)
        punto_t = (p[0], p[1], p[2])
        aviso = ""
        self._instantanea()
        try:
            if entidad.is_a("IfcWall"):
                if abs(normal_t[2]) >= 0.9:
                    if normal_t[2] < 0:
                        raise self._error("El espesor lo da el tipo.", -32602)
                    aviso = self._empujar_altura_muro(entidad, distancia)
                else:
                    datos_muro = self._datos_muro(entidad)
                    a_lo_largo = abs(
                        normal_t[0] * datos_muro["dx"]
                        + normal_t[1] * datos_muro["dy"]
                    )
                    if a_lo_largo < 0.7:
                        raise self._error("El espesor lo da el tipo.", -32602)
                    aviso = self._empujar_extremo_lineal(
                        entidad, normal_t, punto_t, distancia
                    )
            elif entidad.is_a("IfcSlab"):
                if abs(normal_t[2]) >= 0.9:
                    raise self._error("El espesor lo da el tipo.", -32602)
                aviso = self._empujar_borde_losa(entidad, normal_t, punto_t, distancia)
            elif entidad.is_a("IfcColumn"):
                if abs(normal_t[2]) >= 0.9 and normal_t[2] > 0:
                    aviso = self._empujar_altura_columna(entidad, distancia)
                else:
                    raise self._error("No se puede empujar este elemento.", -32602)
            elif entidad.is_a("IfcBeam"):
                aviso = self._empujar_extremo_lineal(entidad, normal_t, punto_t, distancia)
            elif entidad.is_a("IfcBuildingElementProxy"):
                aviso = self._empujar_generico(entidad, normal_t, punto_t, distancia)
            else:
                raise self._error("No se puede empujar este elemento.", -32602)
        except Exception:
            self._revertir_instantanea()
            raise
        self.con_cambios = True
        mensaje = "Cara empujada."
        if aviso:
            mensaje = f"{mensaje} {aviso}"
        return self._resultado(
            modificados=[entidad],
            mensaje=mensaje,
            aviso=aviso,
            distancia=distancia,
        )

