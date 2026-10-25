"""Geometría de malla compartida por la evaluación O001 (motor A).

Las fórmulas son deliberadamente sencillas y se replican en JavaScript
(`b_webifc.mjs`) para que ambos motores midan lo mismo:

* volumen por el teorema de la divergencia sobre triángulos;
* área de la proyección en planta por rasterización de la unión de triángulos;
* malla cerrada si cada arista no degenerada aparece exactamente dos veces.

Todas las medidas salen en metros, metros cuadrados y metros cúbicos.
"""

from __future__ import annotations

import math

TOL_VERTICE = 1e-5  # 0.01 mm: fusiona vértices duplicados por normales/UV.


def _vertice(verts, i):
    j = 3 * i
    return (float(verts[j]), float(verts[j + 1]), float(verts[j + 2]))


def _triangulos(verts, faces):
    n = len(verts) // 3
    for i in range(0, len(faces) - 2, 3):
        a, b, c = int(faces[i]), int(faces[i + 1]), int(faces[i + 2])
        if a >= n or b >= n or c >= n:
            continue
        yield _vertice(verts, a), _vertice(verts, b), _vertice(verts, c)


def volumen_malla(verts, faces) -> float:
    """Volumen en m³ por divergencia: V = |Σ v0 · (v1 × v2)| / 6."""
    total = 0.0
    for v0, v1, v2 in _triangulos(verts, faces):
        ax, ay, az = v0
        bx, by, bz = v1
        cx, cy, cz = v2
        total += (
            ax * (by * cz - bz * cy)
            - ay * (bx * cz - bz * cx)
            + az * (bx * cy - by * cx)
        )
    return abs(total) / 6.0


def area_planta(verts, faces, resolucion: int = 512, min_celdas: int = 16, max_celdas: int = 4_000_000) -> float:
    """Área de la unión de los triángulos proyectados al plano XY.

    Se rasteriza la caja envolvente y se rellenan por scanline las celdas
    cubiertas. La resolución parte de 512 celdas en el lado mayor y se afina
    hasta tener al menos 16 celdas en el lado menor (muros y trabes delgados),
    con un tope de 4 millones de celdas. Así una pared de 12 × 0.3 m no pierde
    precisión por el grosor y una losa grande no dispara el costo.
    """
    tris = []
    x0 = y0 = math.inf
    x1 = y1 = -math.inf
    for v0, v1, v2 in _triangulos(verts, faces):
        ax, ay = v0[0], v0[1]
        bx, by = v1[0], v1[1]
        cx, cy = v2[0], v2[1]
        area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        if abs(area2) < 1e-14:
            continue
        tris.append((ax, ay, bx, by, cx, cy))
        x0 = min(x0, ax, bx, cx)
        x1 = max(x1, ax, bx, cx)
        y0 = min(y0, ay, by, cy)
        y1 = max(y1, ay, by, cy)
    if not tris:
        return 0.0

    dx, dy = x1 - x0, y1 - y0
    mayor = max(dx, dy)
    if mayor <= 0:
        return 0.0
    celda = mayor / float(resolucion)
    while True:
        nx = max(1, int(math.ceil(dx / celda)))
        ny = max(1, int(math.ceil(dy / celda)))
        if min(nx, ny) >= min_celdas or nx * ny >= max_celdas:
            break
        celda /= 2.0
    nx = max(1, min(nx, max_celdas))
    ny = max(1, min(ny, max_celdas))
    ocupado = bytearray(nx * ny)

    for ax, ay, bx, by, cx, cy in tris:
        miny, maxy = min(ay, by, cy), max(ay, by, cy)
        j0 = max(0, int(math.floor((miny - y0) / celda)))
        j1 = min(ny - 1, int(math.floor((maxy - y0) / celda)))
        lados = ((ax, ay, bx, by), (bx, by, cx, cy), (cx, cy, ax, ay))
        for j in range(j0, j1 + 1):
            py = y0 + (j + 0.5) * celda
            xs = []
            for px, py0, qx, qy0 in lados:
                if (py0 <= py <= qy0) or (qy0 <= py <= py0):
                    if abs(qy0 - py0) < 1e-15:
                        xs.append(px)
                        xs.append(qx)
                    else:
                        xs.append(px + (py - py0) * (qx - px) / (qy0 - py0))
            if len(xs) < 2:
                continue
            xmin, xmax = min(xs), max(xs)
            i0 = max(0, int(math.ceil((xmin - x0) / celda - 0.5 - 1e-12)))
            i1 = min(nx - 1, int(math.floor((xmax - x0) / celda - 0.5 + 1e-12)))
            if i1 >= i0:
                fila = j * nx
                ocupado[fila + i0 : fila + i1 + 1] = b"\x01" * (i1 - i0 + 1)

    return float(sum(ocupado)) * celda * celda


def _aristas(verts, faces, tol):
    indice = {}
    caras = []
    for a, b, c in _triangulos(verts, faces):
        ia = _clave(a, tol)
        ib = _clave(b, tol)
        ic = _clave(c, tol)
        if ia == ib or ib == ic or ia == ic:
            continue
        for p in (ia, ib, ic):
            if p not in indice:
                indice[p] = len(indice)
        caras.append((indice[ia], indice[ib], indice[ic]))
    aristas = {}
    for a, b, c in caras:
        for u, v in ((a, b), (b, c), (c, a)):
            clave = (u, v) if u < v else (v, u)
            aristas[clave] = aristas.get(clave, 0) + 1
    return aristas


def estado_malla(verts, faces, tol: float = TOL_VERTICE):
    """Devuelve (cerrada, manifold).

    * cerrada: no hay aristas de borde (conteo impar); la superficie encierra
      volumen aunque dos sólidos se toquen y dejen aristas con 4 caras.
    * manifold: toda arista tiene exactamente 2 caras (malla 2-variedad).
    """
    aristas = _aristas(verts, faces, tol)
    if not aristas:
        return False, False
    cerrada = all(n >= 2 and n % 2 == 0 for n in aristas.values())
    manifold = all(n == 2 for n in aristas.values())
    return cerrada, manifold


def es_cerrada(verts, faces, tol: float = TOL_VERTICE) -> bool:
    """Una malla es cerrada si no tiene aristas de borde."""
    return estado_malla(verts, faces, tol)[0]


def _clave(v, tol):
    return (
        int(round(v[0] / tol)),
        int(round(v[1] / tol)),
        int(round(v[2] / tol)),
    )


def _ejes_horizontales(verts, faces):
    """Devuelve (centro, eje_largo, eje_corto) de la planta por PCA."""
    pts = []
    for v0, v1, v2 in _triangulos(verts, faces):
        pts.extend((v0[0], v0[1], v1[0], v1[1], v2[0], v2[1]))
    if not pts:
        return (0.0, 0.0), (1.0, 0.0), (0.0, 1.0)
    n = len(pts) // 2
    cx = sum(pts[0::2]) / n
    cy = sum(pts[1::2]) / n
    sxx = syy = sxy = 0.0
    for i in range(n):
        x = pts[2 * i] - cx
        y = pts[2 * i + 1] - cy
        sxx += x * x
        syy += y * y
        sxy += x * y
    ang = 0.5 * math.atan2(2.0 * sxy, sxx - syy)
    eje = (math.cos(ang), math.sin(ang))
    return (cx, cy), eje, (-eje[1], eje[0])


def dimensiones(verts, faces):
    """Caja envolvente y largo/alto/ancho según el eje principal de la planta."""
    xs = []
    ys = []
    zs = []
    for v0, v1, v2 in _triangulos(verts, faces):
        for v in (v0, v1, v2):
            xs.append(v[0])
            ys.append(v[1])
            zs.append(v[2])
    if not xs:
        return {"largo": 0.0, "alto": 0.0, "ancho": 0.0, "dx": 0.0, "dy": 0.0, "dz": 0.0}
    centro, eje, _ = _ejes_horizontales(verts, faces)
    proy = [(x - centro[0]) * eje[0] + (y - centro[1]) * eje[1] for x, y in zip(xs, ys)]
    largo = max(proy) - min(proy)
    dx = max(xs) - min(xs)
    dy = max(ys) - min(ys)
    dz = max(zs) - min(zs)
    ancho = max(dx, dy)
    return {"largo": largo, "alto": dz, "ancho": ancho, "dx": dx, "dy": dy, "dz": dz}


def area_lateral(verts, faces) -> float:
    """Área de las caras laterales (normales horizontales y perpendiculares al eje largo).

    Para muros equivale a la superficie neta de sus dos caras grandes: los
    huecos restan porque no hay triángulos allí. No incluye cantos ni jambas.
    """
    centro, eje, _ = _ejes_horizontales(verts, faces)
    total = 0.0
    for v0, v1, v2 in _triangulos(verts, faces):
        ux = v1[0] - v0[0]
        uy = v1[1] - v0[1]
        uz = v1[2] - v0[2]
        wx = v2[0] - v0[0]
        wy = v2[1] - v0[1]
        wz = v2[2] - v0[2]
        nx = uy * wz - uz * wy
        ny = uz * wx - ux * wz
        nz = ux * wy - uy * wx
        norma = math.sqrt(nx * nx + ny * ny + nz * nz)
        if norma < 1e-12:
            continue
        # Normal horizontal y mirando al grosor (no al extremo del muro).
        if abs(nz) / norma < 0.5 and abs(nx * eje[0] + ny * eje[1]) / norma < 0.5:
            total += 0.5 * norma
    # Se suman las dos caras grandes; se reporta el promedio por cara para
    # que sea comparable con Qto_WallBaseQuantities.NetSideArea.
    return total / 2.0
