"""Losa a partir del circuito de muros."""

from __future__ import annotations

from .comun import *  # noqa: F401,F403


class LosasMurosMixin:
    def _circuito_muros(self, globalids: list[str]) -> list[Any]:
        muros = []
        for gid in globalids:
            entidad = self._entidad_por_gid(gid)
            if not entidad.is_a("IfcWall"):
                raise self._error(f"{gid} no es un muro.", -32022)
            muros.append(entidad)
        if len(muros) < 3:
            raise self._error("Seleccione al menos tres muros para el circuito.", -32022)
        sin_usar = list(muros)
        primero = sin_usar.pop(0)
        orden = [primero]
        x1, y1, x2, y2, _ = self._extremos_muro(primero)
        actual = (x2, y2)
        inicio = (x1, y1)
        while sin_usar:
            elegido = None
            for candidato in sin_usar:
                a = self._extremos_muro(candidato)
                if math.hypot(a[0] - actual[0], a[1] - actual[1]) <= TOLERANCIA:
                    elegido = (candidato, (a[2], a[3]))
                    break
                if math.hypot(a[2] - actual[0], a[3] - actual[1]) <= TOLERANCIA:
                    elegido = (candidato, (a[0], a[1]))
                    break
            if elegido is None:
                raise self._error("Los muros seleccionados no forman un circuito cerrado.", -32022)
            orden.append(elegido[0])
            sin_usar.remove(elegido[0])
            actual = elegido[1]
        if math.hypot(actual[0] - inicio[0], actual[1] - inicio[1]) > TOLERANCIA:
            raise self._error("Los muros seleccionados no forman un circuito cerrado.", -32022)
        return orden

    def losa_desde_muros(
        self,
        nivel: str,
        globalids: Any,
        lado: str = "exterior",
        desfase: float = 0.0,
        uso: str = "entrepiso",
    ) -> dict[str, Any]:
        self._exigir_modelo()
        clave_uso = self._normalizar_uso_losa(uso)
        if not isinstance(globalids, (list, tuple)):
            raise self._error("globalids debe ser una lista de muros.", -32602)
        try:
            desfase = float(desfase)
        except (TypeError, ValueError) as exc:
            raise self._error("El desfase de borde no es un número.", -32602) from exc
        lado = str(lado or "exterior")
        if lado not in ("exterior", "eje", "interior"):
            raise self._error("El borde debe ser exterior, eje o interior.", -32602)
        self._nivel_por_gid(nivel)
        muros = self._circuito_muros([str(g) for g in globalids])
        # Línea media del circuito, recorrida en el orden de la cadena.
        puntos: list[tuple[float, float]] = []
        lados: list[tuple[float, float, Any]] = []
        primero = self._datos_muro(muros[0])
        actual = (primero["x1"], primero["y1"])
        for muro in muros:
            datos = self._datos_muro(muro)
            if datos["longitud"] <= TOLERANCIA_CALCULO:
                continue
            if math.hypot(datos["x1"] - actual[0], datos["y1"] - actual[1]) <= TOLERANCIA:
                siguiente = (datos["x2"], datos["y2"])
            elif math.hypot(datos["x2"] - actual[0], datos["y2"] - actual[1]) <= TOLERANCIA:
                siguiente = (datos["x1"], datos["y1"])
            else:
                raise self._error(
                    "Los muros seleccionados no forman un circuito cerrado.", -32022
                )
            lados.append((actual[0], actual[1], muro))
            actual = siguiente
        if len(lados) < 3:
            raise self._error("El circuito no tiene muros suficientes.", -32022)
        puntos = [(x, y) for x, y, _ in lados]
        if abs(_poligono_area(puntos)) <= TOLERANCIA_CALCULO:
            raise self._error("No se pudo calcular el contorno exterior.", -32022)
        bordes = [
            {"referencia": "muro", "objetivo": _gid(muro), "lado": lado, "desfase": desfase}
            for _x, _y, muro in lados
        ]
        bordes_normalizados = self._normalizar_bordes_losa(bordes, puntos)
        contorno = self._contorno_de_bordes(bordes_normalizados)
        if contorno is None:
            raise self._error("No se pudo calcular el contorno exterior.", -32022)
        return self.losa_crear(
            nivel,
            contorno,
            espesor=None,
            desfase=0.0,
            bordes=bordes_normalizados,
            uso=clave_uso,
        )

