"""O062: el muro no muestra líneas en las franjas de cerramiento y losa.

La detección imita `THREE.EdgesGeometry(geometria, 30)`: se sueldan vértices a
1e-6 y se marca una arista cuando tiene una sola cara o cuando el ángulo entre
las normales de sus dos caras supera 30°.

Volúmenes a mano (obra del dueño `o061-fallo-dueno.ifc`; base O061):
- Los muros largos (ejes y = 0.00 y y = 1.50) tienen huella A = 0.4775 m² y
  los cortos (x = 0.00 y x = 2.50) A = 0.2775 m². Medidos de la poligonal:
  2.70 × 0.20 menos los recortes de castillos y los ingletes de esquina.
- Cuerpo: 3.48 = 3.60 − 0.12 de base. Los intermedios son el cerramiento
  2.20–2.40 (0.20 de alto) y la azotea 3.08–3.20 (0.12 de alto). El cerramiento
  ocupa todo el espesor del muro, pero no llega a las puntas ingleteadas: deja
  0.008125 m² en cada muro. Volumen de main:
    largo: 0.4775 × (3.48 − 0.20 − 0.12) + 0.008125 × 0.20 = 1.510525
    corto: 0.2775 × 3.16 + 0.008125 × 0.20 = 0.878525
- Piel de 2 mm (decisión del gerente): donde el horizontal cruza la cara del
  muro, el muro conserva 0.002 m. Las franjas continuas miden, en el muro largo,
  2.35 en la cara de 0.10 y 2.30 (+ dos puntas de inglete de 0.002²/2) en la de
  −0.10; en el corto, 1.35 y 1.30. La losa conserva 2.70 y 2.30 en el largo y
  1.70 y 1.30 en el corto. Piel:
    largo cerramiento: 0.20 × (2.35×0.002 + 2.30×0.002 + 2×0.000002) = 0.0018608
    largo losa:        0.12 × (2.70×0.002 + 2.30×0.002 + 2×0.000002) = 0.0012000
    corto cerramiento: 0.20 × (1.35×0.002 + 1.30×0.002 + 2×0.000002) = 0.0010608
    corto losa:        0.12 × (1.70×0.002 + 1.30×0.002 + 2×0.000002) = 0.0007200
  Volumen de la malla = main + piel:
    largo: 1.510525 + 0.0018608 + 0.0012 = 1.5135858
    corto: 0.878525 + 0.0010608 + 0.00072 = 0.8803058
- O058 (`o058-muro-n0-n5.ifc`), valores de main ya documentados en test_o058:
    y = 1.50: 1.5387; piel 0.12 × 2.30 × 0.002 = 0.000552 → 1.539252
    x = 2.50: 0.8697; piel 0.12 × 1.30 × 0.002 = 0.000312 → 0.870012
    y = 0.00: 1.6051125; piel 0.12 × (2.30×0.002 + 0.000002) + 0.20 × 0.15×0.002
              = 0.00055224 + 0.00006 = 0.00061224 → 1.60572474
    x = 0.00: main 0.9361125 = 0.28×3.28 + 0.06625×0.20 + 0.0371875×0.12
              (el cerramiento de 0.15 deja DOS franjas de 0.025 a los lados,
              2×0.025×1.325 = 0.06625); la malla de main vieja daba 0.9294875
              porque su polígono de la franja se solapaba y perdía una franja.
              Piel: 0.12 × (1.30×0.002 + 0.000002) + 0.20 × 0.15×0.002
              = 0.00031224 + 0.00006 = 0.00037224 → 0.93648474
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

DUENO = RAIZ / "nucleo" / "tests" / "datos" / "o061-fallo-dueno.ifc"
O058 = RAIZ / "nucleo" / "tests" / "datos" / "o058-muro-n0-n5.ifc"

PLANOS_EXTERIORES = {
    "y=-0.10": lambda p: abs(p[1] + 0.10) < 1e-6,
    "y=1.60": lambda p: abs(p[1] - 1.60) < 1e-6,
    "x=-0.10": lambda p: abs(p[0] + 0.10) < 1e-6,
    "x=2.60": lambda p: abs(p[0] - 2.60) < 1e-6,
}


def _cara_exterior(nucleo: ModeloNucleo, muro) -> str:
    datos = nucleo._datos_muro(muro)
    if abs(float(datos["dx"])) > 0.5:
        return "y=1.60" if float(datos["y1"]) > 0.75 else "y=-0.10"
    return "x=2.60" if float(datos["x1"]) > 1.25 else "x=-0.10"
Z_BASE = 0.12
Z_CIMA = 3.60
Z_FRANJAS = (2.20, 2.40, 3.08, 3.20)


def _malla(nucleo: ModeloNucleo, entidad) -> tuple[np.ndarray, np.ndarray]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == entidad.id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            return vertices, caras
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {entidad.GlobalId}")


def _volumen_malla(vertices: np.ndarray, caras: np.ndarray) -> float:
    return abs(
        sum(
            float(np.dot(vertices[c[0]], np.cross(vertices[c[1]], vertices[c[2]])))
            / 6.0
            for c in caras
        )
    )


def _clave(vertice: np.ndarray) -> tuple[int, int, int]:
    return tuple(int(round(float(x) * 1e6)) for x in vertice)


def _aristas(
    vertices: np.ndarray, caras: np.ndarray
) -> list[tuple[tuple[int, int], int, bool, np.ndarray, np.ndarray]]:
    """Aristas soldadas a 1e-6: (clave, nº caras, marcada, p0, p1)."""
    claves = [_clave(v) for v in vertices]
    posiciones: dict[tuple[int, int, int], np.ndarray] = {}
    for clave, vertice in zip(claves, vertices):
        posiciones.setdefault(clave, vertice)
    normales = []
    for cara in caras:
        p0, p1, p2 = vertices[cara[0]], vertices[cara[1]], vertices[cara[2]]
        normal = np.cross(p1 - p0, p2 - p0)
        largo = float(np.linalg.norm(normal))
        normales.append(normal / largo if largo > 1e-15 else normal)
    caras_por_arista: dict[tuple[int, int], list[int]] = {}
    for indice, cara in enumerate(caras):
        for a, b in ((0, 1), (1, 2), (2, 0)):
            ia, ib = cara[a], cara[b]
            if claves[ia] == claves[ib]:
                continue
            clave = tuple(sorted((claves[ia], claves[ib])))
            caras_por_arista.setdefault(clave, []).append(indice)
    limite = math.cos(math.radians(30.0))
    salida = []
    for clave, indices in caras_por_arista.items():
        if len(indices) == 2:
            marcada = float(np.dot(normales[indices[0]], normales[indices[1]])) <= limite
        else:
            marcada = True
        salida.append(
            (
                clave,
                len(indices),
                marcada,
                posiciones[clave[0]],
                posiciones[clave[1]],
            )
        )
    return salida


def _paredes(nucleo: ModeloNucleo) -> list:
    muros = list(nucleo.modelo.by_type("IfcWall"))
    for muro in muros:
        nucleo._regenerar_muro(muro)
    return muros


def _es_largo(nucleo: ModeloNucleo, muro) -> bool:
    datos = nucleo._datos_muro(muro)
    return abs(float(datos["dx"])) > 0.5


def test_a_mallas_de_los_muros_son_cerradas_y_manifold() -> None:
    """(a) Ninguna malla de muro tiene aristas de borde ni de más de 2 caras."""
    for ruta in (DUENO, O058):
        nucleo = ModeloNucleo()
        nucleo.abrir(str(ruta))
        for muro in _paredes(nucleo):
            vertices, caras = _malla(nucleo, muro)
            aristas = _aristas(vertices, caras)
            malas = [a for a in aristas if a[1] != 2]
            assert not malas, (
                f"{ruta.name} {muro.GlobalId}: {len(malas)} aristas no manifold; "
                f"primera con {malas[0][1]} caras"
            )


def test_b_sin_aristas_marcadas_sobre_caras_exteriores() -> None:
    """(b) Caras exteriores continuas: sin marcas entre 0.12 y 3.60."""
    for ruta in (DUENO, O058):
        nucleo = ModeloNucleo()
        nucleo.abrir(str(ruta))
        for muro in _paredes(nucleo):
            vertices, caras = _malla(nucleo, muro)
            aristas = _aristas(vertices, caras)
            marcadas = [a for a in aristas if a[2]]
            # La detección no puede ser vacua: el perímetro de la cara exterior
            # (z = 0.12 y z = 3.60) sí está marcado en todos los muros.
            nombre = _cara_exterior(nucleo, muro)
            en_plano = PLANOS_EXTERIORES[nombre]
            en_cara = [a for a in marcadas if en_plano(a[3]) and en_plano(a[4])]
            assert en_cara, f"{ruta.name} {muro.GlobalId}: sin aristas en {nombre}"
            zs = {abs(round(float(p[2]), 6)) for a in en_cara for p in (a[3], a[4])}
            assert Z_BASE in zs or round(Z_CIMA, 6) in zs, (
                f"{ruta.name} {muro.GlobalId}: {nombre} no llega a los extremos"
            )
            malas = [
                a
                for a in en_cara
                if min(float(a[3][2]), float(a[4][2])) > Z_BASE + 1e-9
                and max(float(a[3][2]), float(a[4][2])) < Z_CIMA - 1e-9
            ]
            assert not malas, (
                f"{ruta.name} {muro.GlobalId}: {len(malas)} aristas marcadas "
                f"en {nombre}; z = "
                f"{sorted({round(float(p[2]), 3) for a in malas for p in (a[3], a[4])})}"
            )
            for corte in Z_FRANJAS:
                horizontales = [
                    a
                    for a in en_cara
                    if abs(float(a[3][2]) - corte) < 1e-6
                    and abs(float(a[4][2]) - corte) < 1e-6
                ]
                assert not horizontales, (
                    f"{ruta.name} {muro.GlobalId}: arista horizontal en "
                    f"{nombre}, z = {corte}"
                )


def test_c_volumen_de_la_malla_del_dueno_es_main_mas_piel() -> None:
    """(c) Malla = main + piel de 2 mm, calculada a mano arriba."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    esperados = {"largo": 1.5135858, "corto": 0.8803058}
    for muro in _paredes(nucleo):
        vertices, caras = _malla(nucleo, muro)
        clase = "largo" if _es_largo(nucleo, muro) else "corto"
        assert _volumen_malla(vertices, caras) == pytest.approx(
            esperados[clase], abs=1e-6
        ), f"{muro.GlobalId} ({clase})"


def test_d_muro_de_o058_sin_lineas_y_con_volumen_main_mas_piel() -> None:
    """(d) Lo mismo con el muro de `o058-muro-n0-n5.ifc` (a, b y c)."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(O058))
    esperados = {
        "00gX8hgmr8fROaq_4TRyaB": 1.539252,
        "0KjZGGVCz5uRbquvy4FH$a": 0.870012,
        "2$JKY6B6f4nuTR$iWYRmCb": 1.60572474,
        "0xg3GB_If8tvz7MLS9Vl76": 0.93648474,
    }
    for muro in _paredes(nucleo):
        vertices, caras = _malla(nucleo, muro)
        assert _volumen_malla(vertices, caras) == pytest.approx(
            esperados[muro.GlobalId], abs=1e-6
        )
