"""O062: piel de 15 mm del muro en las caras que tapa un horizontal.

El cuerpo del muro se extruye una sola vez; los cerramientos y losas
intermedios se restan como bolsillos que dejan ``PIEL_MURO`` (0.015 m, espesor
típico de un aplanado) de muro en las caras exteriores que el horizontal enrasa
o cruza. Así la cara exterior es continua (sin aristas horizontales en las
franjas) y las aristas del bolsillo quedan lo bastante separadas de la cara
como para que el visor no las dibuje a través de la piel.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import ifcopenshell.api.geometry as geometry_api

LOG = logging.getLogger("openrvt_nucleo.muro_piel")

TOLERANCIA_CALCULO = 1e-6
PIEL_MURO = 0.015


def _limpiar_anillo(
    puntos: list[tuple[float, float]], tolerancia: float = 1e-7
) -> list[tuple[float, float]]:
    """Anillo sin ruido de coma flotante: redondea a 1e-9, quita vértices repetidos
    (incluido el cierre) y los que quedan alineados con sus vecinos."""
    limpios: list[tuple[float, float]] = []
    for x, y in puntos:
        p = (round(float(x), 9) + 0.0, round(float(y), 9) + 0.0)
        if limpios and math.hypot(p[0] - limpios[-1][0], p[1] - limpios[-1][1]) <= tolerancia:
            continue
        limpios.append(p)
    while len(limpios) > 1 and math.hypot(
        limpios[0][0] - limpios[-1][0], limpios[0][1] - limpios[-1][1]
    ) <= tolerancia:
        limpios.pop()
    cambio = True
    while cambio and len(limpios) > 3:
        cambio = False
        for k in range(len(limpios)):
            a, b, c = limpios[k - 1], limpios[k], limpios[(k + 1) % len(limpios)]
            cruz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if abs(cruz) <= tolerancia * max(1.0, math.hypot(c[0] - a[0], c[1] - a[1])):
                del limpios[k]
                cambio = True
                break
    return limpios


def _anillo_desde_arista_corta(
    anillo: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Rota el anillo para que su primer segmento sea el más corto.

    OpenCASCADE descarta una franja fina si el perfil empieza por su arista
    larga; empezando por la corta se tesela sin problema.
    """
    n = len(anillo)
    if n < 3:
        return anillo
    mejor, mejor_largo = 0, None
    for i in range(n):
        x1, y1 = anillo[i]
        x2, y2 = anillo[(i + 1) % n]
        largo = math.hypot(x2 - x1, y2 - y1)
        if mejor_largo is None or largo < mejor_largo - 1e-12:
            mejor, mejor_largo = i, largo
    return anillo[mejor:] + anillo[:mejor]


class MuroPielMixin:
    """Métodos de O062; se mezclan en ``ModeladoMixin``."""

    def _recorte_intermedio_local(
        self, datos: dict[str, Any], huella: Any, offset: float
    ) -> Any:
        """O062: parte del intermedio que sí se resta del muro.

        Si el horizontal queda enrasado con una cara exterior (o la cruza de
        cara a cara), no se resta la franja de PIEL_MURO pegada a esa cara: así el
        muro conserva una piel continua en su cara exterior.
        """
        from shapely.affinity import affine_transform
        from shapely.geometry import Polygon

        dx, dy = datos["dx"], datos["dy"]
        x1, y1 = datos["x1"], datos["y1"]
        local = affine_transform(
            huella, [dx, dy, -dy, dx, -dx * x1 - dy * y1, dy * x1 - dx * y1]
        )
        if local.is_empty:
            return local
        v_bajo = float(offset)
        v_alto = v_bajo + float(datos["espesor"])
        xmin, ymin, xmax, ymax = local.bounds
        u0, u1 = xmin - 1.0, xmax + 1.0
        if ymin <= v_bajo + TOLERANCIA_CALCULO:
            local = local.intersection(
                Polygon(
                    [
                        (u0, v_bajo + PIEL_MURO),
                        (u1, v_bajo + PIEL_MURO),
                        (u1, v_bajo + 1.0),
                        (u0, v_bajo + 1.0),
                    ]
                )
            )
        if ymax >= v_alto - TOLERANCIA_CALCULO:
            local = local.intersection(
                Polygon(
                    [
                        (u0, v_alto - 1.0),
                        (u1, v_alto - 1.0),
                        (u1, v_alto - PIEL_MURO),
                        (u0, v_alto - PIEL_MURO),
                    ]
                )
            )
        return local

    def _cortes_intermedios_muro(
        self,
        pieza: list[tuple[float, float]],
        datos: dict[str, Any],
        intervalos: list[dict[str, Any]],
        z0: float,
        cima: float,
        offset: float,
    ) -> tuple[list[Any], list[Any]]:
        """Prismas que se restan del prisma del muro (representaciones y sólidos)."""
        from shapely.geometry import Polygon

        reps: list[Any] = []
        items: list[Any] = []
        if not intervalos:
            return reps, items
        try:
            base = Polygon([(u, v) for u, v in pieza])
        except Exception:
            return reps, items
        if not base.is_valid:
            base = base.buffer(0)
        for intervalo in intervalos:
            a = max(float(intervalo["z0"]), z0)
            b = min(float(intervalo["z1"]), cima)
            if b - a <= TOLERANCIA_CALCULO:
                continue
            huella = intervalo.get("huella")
            if huella is None or huella.is_empty:
                continue
            recorte = self._recorte_intermedio_local(datos, huella, offset)
            if recorte is None or recorte.is_empty:
                continue
            trozo = recorte.intersection(base)
            piezas = (
                [trozo]
                if trozo.geom_type == "Polygon"
                else list(getattr(trozo, "geoms", []))
            )
            for pol in piezas:
                if pol.is_empty or pol.area <= TOLERANCIA_CALCULO:
                    continue
                anillo = _anillo_desde_arista_corta(
                    _limpiar_anillo(
                        [(x, y) for x, y in list(pol.exterior.coords)[:-1]]
                    )
                )
                if len(anillo) < 3:
                    continue
                rep = geometry_api.add_slab_representation(
                    self.modelo,
                    context=self._contexto(),
                    depth=b - a,
                    direction_sense="POSITIVE",
                    offset=a - datos["z"],
                    polyline=anillo,
                )
                reps.append(rep)
                items.extend(rep.Items)
        return reps, items

    def _recortar_tramo_muro(
        self,
        pieza: list[tuple[float, float]],
        datos: dict[str, Any],
        activos: list[dict[str, Any]],
        offset: float | None = None,
    ) -> list[list[tuple[float, float]]]:
        """O061 regla 4: resta del tramo solo la huella real de cada intermedio.

        O062: si el intermedio queda enrasado con una cara exterior del muro o
        la cruza de cara a cara, no se resta la franja de PIEL_MURO pegada a esa
        cara. Así la cara exterior sigue siendo una superficie continua (sin
        aristas horizontales en las franjas) y el horizontal no parpadea.
        """
        if not activos:
            return [pieza]
        from shapely.affinity import affine_transform
        from shapely.geometry import Polygon

        if offset is None:
            offset = min(v for _u, v in pieza)
        v_bajo = float(offset)
        v_alto = v_bajo + float(datos["espesor"])
        mundo = Polygon([(u, v) for u, v in pieza])
        if not mundo.is_valid:
            mundo = mundo.buffer(0)
        dx, dy = datos["dx"], datos["dy"]
        x1, y1 = datos["x1"], datos["y1"]
        a_mundo = [-dx * x1 - dy * y1, dy * x1 - dx * y1]
        for intervalo in activos:
            huella = intervalo.get("huella")
            if huella is None or huella.is_empty:
                continue
            if not huella.is_valid:
                huella = huella.buffer(0)
            if huella.is_empty:
                continue
            local = affine_transform(huella, [dx, dy, -dy, dx, *a_mundo])
            if local.is_empty:
                continue
            xmin, ymin, xmax, ymax = local.bounds
            recorte = local
            u0, u1 = xmin - 1.0, xmax + 1.0
            if ymin <= v_bajo + TOLERANCIA_CALCULO:
                piel = Polygon(
                    [
                        (u0, v_bajo + PIEL_MURO),
                        (u1, v_bajo + PIEL_MURO),
                        (u1, v_bajo + 1.0),
                        (u0, v_bajo + 1.0),
                    ]
                )
                recorte = recorte.intersection(piel)
            if ymax >= v_alto - TOLERANCIA_CALCULO:
                piel = Polygon(
                    [
                        (u0, v_alto - 1.0),
                        (u1, v_alto - 1.0),
                        (u1, v_alto - PIEL_MURO),
                        (u0, v_alto - PIEL_MURO),
                    ]
                )
                recorte = recorte.intersection(piel)
            if recorte.is_empty or mundo.intersects(recorte) is False:
                continue
            mundo = mundo.difference(recorte)
            if mundo.is_empty:
                return []
        piezas = [mundo] if mundo.geom_type == "Polygon" else list(
            getattr(mundo, "geoms", [])
        )
        salida: list[list[tuple[float, float]]] = []
        for trozo in piezas:
            if trozo.is_empty or trozo.area <= TOLERANCIA_CALCULO:
                continue
            trozo = trozo.simplify(1e-7, preserve_topology=True)
            anillo = _limpiar_anillo(
                [(x, y) for x, y in list(trozo.exterior.coords)[:-1]]
            )
            if len(anillo) >= 3:
                salida.append(_anillo_desde_arista_corta(anillo))
        return salida

    def _unir_solidos(self, items: list[Any]) -> list[Any]:
        """O062: funde los sólidos apilados en uno solo.

        La unión booleana comparte vértices y quita las tapas internas entre
        tramos consecutivos con la misma sección; solo deja las caras donde la
        sección cambia. Si alguna unión falla se conserva el sólido aparte para
        no perder cuerpo.
        """
        if len(items) <= 1:
            return list(items)
        unido = items[0]
        resto: list[Any] = []
        for extra in items[1:]:
            try:
                creados = geometry_api.add_boolean(
                    self.modelo,
                    first_item=unido,
                    second_items=[extra],
                    operator="UNION",
                )
            except Exception:
                LOG.warning("no se pudo unir un tramo del cuerpo", exc_info=True)
                creados = None
            if creados:
                unido = creados[-1] if isinstance(creados, (list, tuple)) else creados
            else:
                resto.append(extra)
        return [unido, *resto]
