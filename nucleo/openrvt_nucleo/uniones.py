"""O012: uniones de vigas, contratrabes y columnas en planta.

La geometría de una viga se recorta con las mismas reglas que Revit para concreto:
la columna manda sobre la viga; entre vigas manda la más larga (empate: la que va
en X). En L la más larga llega a la cara exterior de la otra y la otra se recorta
en la cara interior; en T la pasante queda entera y la que llega se recorta; en X
la más larga queda entera y la otra se parte en dos tramos. Un hueco de hasta 5 cm
se considera unido y se cierra.

El módulo es puro (sin IFC) para que la geometría del cuerpo, la medición y las
pruebas usen exactamente la misma regla.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

TOLERANCIA = 1e-6
HUECO_UNION = 0.05


@dataclass(frozen=True)
class Barra:
    """Viga (eje + ancho) o columna (centro + sección girada)."""

    gid: str
    tipo: str  # "viga" | "columna"
    x1: float
    y1: float
    x2: float
    y2: float
    ancho: float
    z0: float
    z1: float
    fondo: float = 0.0
    rotacion: float = 0.0

    @property
    def largo(self) -> float:
        return math.hypot(self.x2 - self.x1, self.y2 - self.y1)

    @property
    def direccion(self) -> tuple[float, float]:
        largo = self.largo
        if largo <= TOLERANCIA:
            return (1.0, 0.0)
        return ((self.x2 - self.x1) / largo, (self.y2 - self.y1) / largo)


def _limpiar_poligono(puntos: list[tuple[float, float]]) -> list[tuple[float, float]]:
    area = 0.0
    for i, (x1, y1) in enumerate(puntos):
        x2, y2 = puntos[(i + 1) % len(puntos)]
        area += x1 * y2 - x2 * y1
    return puntos if area >= 0 else list(reversed(puntos))


def huella(barra: Barra) -> list[tuple[float, float]]:
    """Polígono convexo (CCW) de la sección en planta."""
    if barra.tipo == "columna":
        coseno, seno = math.cos(barra.rotacion), math.sin(barra.rotacion)
        hx, hy = barra.ancho / 2.0, (barra.fondo or barra.ancho) / 2.0
        puntos = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            lx, ly = sx * hx, sy * hy
            puntos.append(
                (
                    barra.x1 + lx * coseno - ly * seno,
                    barra.y1 + lx * seno + ly * coseno,
                )
            )
        return _limpiar_poligono(puntos)
    ux, uy = barra.direccion
    nx, ny = -uy, ux
    h = barra.ancho / 2.0
    return _limpiar_poligono(
        [
            (barra.x1 - nx * h, barra.y1 - ny * h),
            (barra.x2 - nx * h, barra.y2 - ny * h),
            (barra.x2 + nx * h, barra.y2 + ny * h),
            (barra.x1 + nx * h, barra.y1 + ny * h),
        ]
    )


def intervalo_en_huella(
    origen: tuple[float, float],
    direccion: tuple[float, float],
    poligono: list[tuple[float, float]],
) -> tuple[float, float] | None:
    """Intervalo (en metros) de la recta que queda dentro del polígono convexo."""
    t_min, t_max = -math.inf, math.inf
    for i, a in enumerate(poligono):
        b = poligono[(i + 1) % len(poligono)]
        ex, ey = b[0] - a[0], b[1] - a[1]
        nx, ny = -ey, ex  # normal izquierda; el interior es n·(x-a) >= 0
        denominador = nx * direccion[0] + ny * direccion[1]
        numero = nx * (origen[0] - a[0]) + ny * (origen[1] - a[1])
        if abs(denominador) <= TOLERANCIA:
            if numero < -TOLERANCIA:
                return None
            continue
        corte = -numero / denominador
        if denominador > 0:
            t_min = max(t_min, corte)
        else:
            t_max = min(t_max, corte)
        if t_min > t_max + TOLERANCIA:
            return None
    if not math.isfinite(t_min) or not math.isfinite(t_max):
        return None
    if t_max - t_min <= TOLERANCIA:
        return None
    return (t_min, t_max)


def punto_en_huella(
    punto: tuple[float, float], poligono: list[tuple[float, float]]
) -> bool:
    x, y = punto
    dentro = False
    for i, (xi, yi) in enumerate(poligono):
        xj, yj = poligono[(i + 1) % len(poligono)]
        if (yi > y) != (yj > y):
            corte = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < corte:
                dentro = not dentro
    return dentro


def distancia_a_huella(
    punto: tuple[float, float], poligono: list[tuple[float, float]]
) -> float:
    if punto_en_huella(punto, poligono):
        return 0.0
    minimo = math.inf
    for i, a in enumerate(poligono):
        b = poligono[(i + 1) % len(poligono)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        largo2 = dx * dx + dy * dy
        if largo2 <= TOLERANCIA:
            distancia = math.hypot(punto[0] - a[0], punto[1] - a[1])
        else:
            t = ((punto[0] - a[0]) * dx + (punto[1] - a[1]) * dy) / largo2
            t = max(0.0, min(1.0, t))
            distancia = math.hypot(punto[0] - (a[0] + t * dx), punto[1] - (a[1] + t * dy))
        minimo = min(minimo, distancia)
    return minimo


def _se_traslapan_z(a: Barra, b: Barra) -> bool:
    # Una contratrabe queda bajo el nivel y la columna arranca en él: se tocan en
    # el plano superior y la unión también cuenta.
    return min(a.z1, b.z1) - max(a.z0, b.z0) >= -TOLERANCIA


def _punto(barra: Barra, t: float) -> tuple[float, float]:
    if barra.tipo == "columna":
        return (barra.x1, barra.y1)
    ux, uy = barra.direccion
    return (barra.x1 + ux * t, barra.y1 + uy * t)


def _proyeccion(punto: tuple[float, float], barra: Barra) -> tuple[float, float]:
    """(t en metros, distancia a la recta) de un punto sobre el eje de una viga."""
    ux, uy = barra.direccion
    t = (punto[0] - barra.x1) * ux + (punto[1] - barra.y1) * uy
    dx = punto[0] - (barra.x1 + ux * t)
    dy = punto[1] - (barra.y1 + uy * t)
    return t, math.hypot(dx, dy)


def _gana_x(barra: Barra) -> bool:
    ux, uy = barra.direccion
    return abs(ux) >= abs(uy)


def _clasificar(
    a: Barra, b: Barra
) -> tuple[str, Barra, Barra, int, int] | None:
    """Devuelve (tipo, ganadora, perdedora, extremo_ganadora, extremo_perdedora)."""
    if not _se_traslapan_z(a, b):
        return None
    ux, uy = a.direccion
    vx, vy = b.direccion
    paralelas = abs(ux * vy - uy * vx) < 0.05
    la, lb = a.largo, b.largo
    if la <= TOLERANCIA or lb <= TOLERANCIA:
        return None
    extremos_a = [(0, _punto(a, 0.0)), (1, _punto(a, la))]
    extremos_b = [(0, _punto(b, 0.0)), (1, _punto(b, lb))]

    # L: dos extremos se encuentran (o quedan a 5 cm).
    mejor = None
    for ea, pa in extremos_a:
        for eb, pb in extremos_b:
            distancia = math.hypot(pa[0] - pb[0], pa[1] - pb[1])
            if mejor is None or distancia < mejor[0]:
                mejor = (distancia, ea, eb)
    if mejor is not None and mejor[0] <= HUECO_UNION + TOLERANCIA and not paralelas:
        _d, ea, eb = mejor
        if la > lb + TOLERANCIA:
            return ("L", a, b, ea, eb)
        if lb > la + TOLERANCIA:
            return ("L", b, a, eb, ea)
        if _gana_x(a):
            return ("L", a, b, ea, eb)
        return ("L", b, a, eb, ea)

    # X: los dos ejes se cruzan en el interior de ambos.
    t_a, t_b = _cruce(a, b)
    if t_a is not None and t_b is not None:
        interior_a = 0.02 * la < t_a < 0.98 * la
        interior_b = 0.02 * lb < t_b < 0.98 * lb
        if interior_a and interior_b:
            if la > lb + TOLERANCIA:
                return ("X", a, b, 0, 0)
            if lb > la + TOLERANCIA:
                return ("X", b, a, 0, 0)
            if _gana_x(a):
                return ("X", a, b, 0, 0)
            return ("X", b, a, 0, 0)

    # T: un extremo llega al interior de la otra.
    llega_a = _extremo_interior(a, b)
    llega_b = _extremo_interior(b, a)
    if llega_a is not None and llega_b is None:
        return ("T", b, a, 0, llega_a)
    if llega_b is not None and llega_a is None:
        return ("T", a, b, 0, llega_b)
    if llega_a is not None and llega_b is not None:
        # Los dos llegan: manda la más larga.
        if la > lb + TOLERANCIA:
            return ("T", a, b, 0, llega_b)
        return ("T", b, a, 0, llega_a)
    return None


def _cruce(a: Barra, b: Barra) -> tuple[float | None, float | None]:
    ax, ay = a.x1, a.y1
    bx, by = a.x2, a.y2
    cx, cy = b.x1, b.y1
    dx, dy = b.x2, b.y2
    den = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx)
    if abs(den) <= TOLERANCIA:
        return (None, None)
    t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / den
    u = ((ax - cx) * (ay - by) - (ay - cy) * (ax - bx)) / den
    return (t * a.largo, u * b.largo)


def _extremo_interior(que_llega: Barra, pasante: Barra) -> int | None:
    """Extremo de `que_llega` dentro del ancho de la pasante (o a <=5 cm)."""
    for extremo in (0, 1):
        punto = _punto(que_llega, 0.0 if extremo == 0 else que_llega.largo)
        t, distancia = _proyeccion(punto, pasante)
        if not (0.02 * pasante.largo < t < 0.98 * pasante.largo):
            continue
        if distancia <= pasante.ancho / 2.0 + HUECO_UNION + TOLERANCIA:
            return extremo
    return None


def _aplicar_columnas(
    viga: Barra,
    columnas: list[Barra],
    lo: float,
    hi: float,
    cortes: list[tuple[float, float]],
    uniones: list[dict[str, str]],
) -> tuple[float, float]:
    ux, uy = viga.direccion
    largo = viga.largo
    for columna in columnas:
        if not _se_traslapan_z(viga, columna):
            continue
        intervalo = intervalo_en_huella((viga.x1, viga.y1), (ux, uy), huella(columna))
        if intervalo is None:
            continue
        ta, tb = intervalo
        cubre_inicio = ta <= 0.0 <= tb
        cubre_fin = ta <= largo <= tb
        toca = (
            cubre_inicio
            or cubre_fin
            or (0.0 < ta < largo and 0.0 < tb < largo)
            or (largo < ta <= largo + HUECO_UNION + TOLERANCIA)
            or (-HUECO_UNION - TOLERANCIA <= tb < 0.0)
        )
        if not toca:
            continue
        if cubre_inicio:
            lo = max(lo, tb)
        if cubre_fin:
            hi = min(hi, ta)
        if not cubre_inicio and not cubre_fin:
            if 0.0 < ta and tb < largo:
                cortes.append((ta, tb))
            elif largo < ta <= largo + HUECO_UNION + TOLERANCIA:
                hi = max(hi, ta)
            elif -HUECO_UNION - TOLERANCIA <= tb < 0.0:
                lo = min(lo, tb)
        uniones.append({"maestro": columna.gid, "esclavo": viga.gid, "tipo": "columna"})
    return lo, hi


def _aplicar_l(
    ganadora: Barra,
    perdedora: Barra,
    extremo_ganadora: int,
    extremo_perdedora: int,
    estado: dict[str, dict[str, object]],
) -> None:
    e_gan = estado[ganadora.gid]
    e_per = estado[perdedora.gid]
    ux, uy = ganadora.direccion
    lg = ganadora.largo
    intervalo = intervalo_en_huella(
        (ganadora.x1, ganadora.y1), (ux, uy), huella(perdedora)
    )
    if intervalo is not None:
        ta, tb = intervalo
        if extremo_ganadora == 0:
            if ta <= HUECO_UNION + TOLERANCIA and tb >= -HUECO_UNION - TOLERANCIA:
                e_gan["lo"] = min(float(e_gan["lo"]), ta)
        else:
            if tb >= lg - HUECO_UNION - TOLERANCIA and ta <= lg + HUECO_UNION + TOLERANCIA:
                e_gan["hi"] = max(float(e_gan["hi"]), tb)
    vx, vy = perdedora.direccion
    lp = perdedora.largo
    intervalo = intervalo_en_huella(
        (perdedora.x1, perdedora.y1), (vx, vy), huella(ganadora)
    )
    if intervalo is None:
        return
    ta, tb = intervalo
    if extremo_perdedora == 0:
        if ta <= 0.0 <= tb:
            e_per["lo"] = max(float(e_per["lo"]), tb)
        elif tb < 0.0 and -tb <= HUECO_UNION + TOLERANCIA:
            e_per["lo"] = min(float(e_per["lo"]), tb)
    else:
        if ta <= lp <= tb:
            e_per["hi"] = min(float(e_per["hi"]), ta)
        elif lp < ta <= lp + HUECO_UNION + TOLERANCIA:
            e_per["hi"] = max(float(e_per["hi"]), ta)
        elif tb < lp and lp - tb <= HUECO_UNION + TOLERANCIA:
            e_per["hi"] = min(float(e_per["hi"]), tb)


def _aplicar_t(
    perdedora: Barra,
    ganadora: Barra,
    extremo: int,
    estado: dict[str, dict[str, object]],
) -> None:
    e_per = estado[perdedora.gid]
    vx, vy = perdedora.direccion
    lp = perdedora.largo
    intervalo = intervalo_en_huella(
        (perdedora.x1, perdedora.y1), (vx, vy), huella(ganadora)
    )
    if intervalo is None:
        return
    ta, tb = intervalo
    if extremo == 0:
        if ta <= 0.0 <= tb:
            e_per["lo"] = max(float(e_per["lo"]), tb)
        elif tb < 0.0 and -tb <= HUECO_UNION + TOLERANCIA:
            e_per["lo"] = min(float(e_per["lo"]), tb)
    else:
        if ta <= lp <= tb:
            e_per["hi"] = min(float(e_per["hi"]), ta)
        elif lp < ta <= lp + HUECO_UNION + TOLERANCIA:
            e_per["hi"] = max(float(e_per["hi"]), ta)
        elif tb < lp and lp - tb <= HUECO_UNION + TOLERANCIA:
            e_per["hi"] = min(float(e_per["hi"]), tb)


def _aplicar_x(
    perdedora: Barra, ganadora: Barra, estado: dict[str, dict[str, object]]
) -> None:
    vx, vy = perdedora.direccion
    intervalo = intervalo_en_huella(
        (perdedora.x1, perdedora.y1), (vx, vy), huella(ganadora)
    )
    if intervalo is None:
        return
    ta, tb = intervalo
    lp = perdedora.largo
    if 0.0 < ta and tb < lp:
        estado[perdedora.gid]["cortes"].append((ta, tb))


def _segmentos(lo: float, hi: float, cortes: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if hi - lo <= TOLERANCIA:
        return []
    salida: list[tuple[float, float]] = []
    cursor = lo
    for a, b in sorted(cortes):
        a = max(a, lo)
        b = min(b, hi)
        if b <= cursor + TOLERANCIA:
            continue
        if a > cursor + TOLERANCIA:
            salida.append((cursor, a))
        cursor = max(cursor, b)
    if hi > cursor + TOLERANCIA:
        salida.append((cursor, hi))
    return salida


def calcular(
    vigas: list[Barra], columnas: list[Barra]
) -> tuple[dict[str, list[tuple[float, float]]], list[dict[str, str]]]:
    """Tramos de cada viga (en metros desde su eje) y uniones aplicadas."""
    estado: dict[str, dict[str, object]] = {
        v.gid: {"lo": 0.0, "hi": v.largo, "cortes": []} for v in vigas
    }
    uniones: list[dict[str, str]] = []
    for i, a in enumerate(vigas):
        for b in vigas[i + 1 :]:
            relacion = _clasificar(a, b)
            if relacion is None:
                continue
            tipo, ganadora, perdedora, e_gan, e_per = relacion
            uniones.append(
                {"maestro": ganadora.gid, "esclavo": perdedora.gid, "tipo": tipo}
            )
            if tipo == "L":
                _aplicar_l(ganadora, perdedora, e_gan, e_per, estado)
            elif tipo == "T":
                _aplicar_t(perdedora, ganadora, e_per, estado)
            elif tipo == "X":
                _aplicar_x(perdedora, ganadora, estado)

    for viga in vigas:
        e = estado[viga.gid]
        lo, hi = float(e["lo"]), float(e["hi"])
        lo, hi = _aplicar_columnas(
            viga, columnas, lo, hi, e["cortes"], uniones  # type: ignore[arg-type]
        )
        e["lo"], e["hi"] = lo, hi

    tramos: dict[str, list[tuple[float, float]]] = {}
    for viga in vigas:
        e = estado[viga.gid]
        tramos[viga.gid] = _segmentos(
            float(e["lo"]), float(e["hi"]), e["cortes"]  # type: ignore[arg-type]
        )
    # Una unión por par, sin duplicar la del mismo nodo.
    vistas: set[tuple[str, str, str]] = set()
    limpias: list[dict[str, str]] = []
    for union in uniones:
        clave = (union["maestro"], union["esclavo"], union["tipo"])
        if clave in vistas:
            continue
        vistas.add(clave)
        limpias.append(union)
    return tramos, limpias


def volumen(tramos: list[tuple[float, float]], ancho: float, alto: float) -> float:
    return sum(max(b - a, 0.0) for a, b in tramos) * ancho * alto
