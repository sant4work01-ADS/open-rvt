"""Referencias, contornos de losa y validación."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class ReferenciasMixin:
    def _aplicar_medidas_abertura(
        self, entidad: Any, ancho: float, alto: float
    ) -> list[Any]:
        """Cambia el ancho/alto de un vano y regenera vano, relleno y muro."""
        datos = self._datos_abertura(entidad) or {}
        muro = self._entidad_por_gid(datos["muro"], ("IfcWall",))
        info_muro = self._datos_muro(muro)
        if datos["distancia"] + ancho > info_muro["longitud"] + TOLERANCIA:
            raise self._error("La abertura no cabe en el muro.", -32023)
        if datos["antepecho"] + alto > info_muro["altura"] + TOLERANCIA:
            raise self._error("La abertura no cabe en altura.", -32023)
        for _otro, otros in self._aberturas_del_muro(muro, excluir=entidad):
            if datos["distancia"] < otros["distancia"] + otros["ancho"] - TOLERANCIA and (
                datos["distancia"] + ancho > otros["distancia"] + TOLERANCIA
            ):
                raise self._error("La abertura se traslapa con otra.", -32024)
        datos.update({"ancho": ancho, "alto": alto})
        self._guardar_pset(
            entidad,
            "OPENRVT_Abertura",
            {
                "Distancia": datos["distancia"],
                "Ancho": ancho,
                "Alto": alto,
                "Antepecho": datos["antepecho"],
                "Muro": datos["muro"],
                "Volteado": datos.get("volteado", False),
            },
        )
        self._quitar_representaciones(entidad, "Body")
        geometry_api.assign_representation(
            self.modelo,
            product=entidad,
            representation=self._cuerpo_hueco(
                ancho,
                alto,
                info_muro["espesor"],
                datos["antepecho"],
                datos["distancia"],
                self._desfase_de_muro(muro, info_muro["espesor"]),
            ),
        )
        modificados = [entidad]
        relleno = self._relleno_de(entidad)
        if relleno is not None:
            self._regenerar_relleno(relleno, entidad)
            modificados.append(relleno)
        self._regenerar_muro(muro)
        modificados.append(muro)
        return modificados

    def _contorno_de_losa(self, losa: Any) -> list[tuple[float, float]] | None:
        """O063: contorno real de la losa, o None si no se puede leer.

        No hay cuadrado de respaldo: inventar 1×1 hacía que una losa ilegible
        apareciera con área y volumen falsos.
        """
        datos = self._leer_pset(losa, "OPENRVT_Losa")
        if datos.get("Contorno"):
            try:
                from shapely import wkt

                puntos = [
                    (float(p[0]), float(p[1]))
                    for p in wkt.loads(str(datos["Contorno"])).exterior.coords[:-1]
                ]
                limpios = _limpiar_anillo(puntos)
                if len(limpios) >= 3:
                    return limpios
            except Exception:
                LOG.debug("no se pudo leer el contorno guardado de la losa", exc_info=True)
        try:
            item = losa.Representation.Representations[0].Items[0]
            perfil = item.SweptArea
            curva = perfil.OuterCurve
            puntos = []
            for punto in getattr(curva, "Points", ()) or ():
                coords = list(getattr(punto, "Coordinates", ()))
                if len(coords) >= 2:
                    puntos.append((float(coords[0]), float(coords[1])))
            limpios = _limpiar_anillo(puntos)
            if len(limpios) >= 3:
                return limpios
        except Exception:
            LOG.debug("no se pudo leer el contorno de la losa", exc_info=True)
        return None

    def _poligono_de_losa(self, losa: Any) -> list[tuple[float, float]]:
        puntos = self._contorno_de_losa(losa)
        if puntos is None:
            raise self._error("La losa no tiene un contorno legible.", -32029)
        return puntos

    def referencias(self) -> dict[str, Any]:
        """Puntos y ejes para los enganches del dibujo en planta."""
        self._exigir_modelo()
        muros = []
        extremos = []
        medios = []
        for muro in self.modelo.by_type("IfcWall"):
            datos = self._datos_muro(muro)
            if datos["longitud"] <= TOLERANCIA_CALCULO:
                continue
            muros.append(
                {
                    "globalid": _gid(muro),
                    "x1": _redondear(datos["x1"]),
                    "y1": _redondear(datos["y1"]),
                    "x2": _redondear(datos["x2"]),
                    "y2": _redondear(datos["y2"]),
                    "espesor": _redondear(datos["espesor"]),
                    "altura": _redondear(datos["altura"]),
                    # O057: la base distingue los muros apilados en planta.
                    "base": _redondear(datos["z"]),
                }
            )
            extremos.extend(
                [
                    [_redondear(datos["x1"]), _redondear(datos["y1"])],
                    [_redondear(datos["x2"]), _redondear(datos["y2"])],
                ]
            )
            medios.append(
                [
                    _redondear((datos["x1"] + datos["x2"]) / 2),
                    _redondear((datos["y1"] + datos["y2"]) / 2),
                ]
            )
        ejes = self.ejes_listar()
        intersecciones = []
        for i, a in enumerate(ejes):
            for b in ejes[i + 1 :]:
                punto = self._interseccion(
                    a["x1"], a["y1"], a["x2"], a["y2"], b["x1"], b["y1"], b["x2"], b["y2"]
                )
                if punto is not None:
                    intersecciones.append([_redondear(punto[0]), _redondear(punto[1])])
        return {
            "muros": muros,
            "extremos": extremos,
            "medios": medios,
            "ejes": ejes,
            "intersecciones": intersecciones,
            "reticula": self.ejes_reticula(),
        }

    @staticmethod
    def _interseccion(
        x1: float, y1: float, x2: float, y2: float, x3: float, y3: float, x4: float, y4: float
    ) -> tuple[float, float] | None:
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) <= TOLERANCIA_CALCULO:
            return None
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
        if -TOLERANCIA <= t <= 1 + TOLERANCIA and -TOLERANCIA <= u <= 1 + TOLERANCIA:
            return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
        return None

    # ------------------------------------------------------------------ validación
    def validar(self) -> list[dict[str, Any]]:
        self._exigir_modelo()
        import logging as _logging

        import ifcopenshell.validate as validate

        problemas: list[dict[str, Any]] = []

        class Captura(_logging.Handler):
            def emit(self, record: _logging.LogRecord) -> None:
                problemas.append(
                    {
                        "nivel": record.levelname,
                        "mensaje": record.getMessage(),
                    }
                )

        logger = _logging.getLogger("openrvt_validacion")
        logger.setLevel(_logging.DEBUG)
        logger.propagate = False
        for h in list(logger.handlers):
            logger.removeHandler(h)
        logger.addHandler(Captura())
        try:
            validate.validate(self.modelo, logger=logger)
        finally:
            for h in list(logger.handlers):
                logger.removeHandler(h)
        return problemas

