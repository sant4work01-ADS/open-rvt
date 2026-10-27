"""O010: esquinas de muro limpias en L, T y cruz, con espesores iguales y distintos.

Se comprueba el área de la huella (volumen / altura) contra la fórmula geométrica
independiente del inglete. Si hubiera solapes el área sumada sería mayor; si hubiera
muescas sería menor. No se ajustan datos para que pase.
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

ALTURA = 2.6


def _areas(nucleo: ModeloNucleo) -> dict[str, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    salida: dict[str, float] = {}
    while True:
        forma = iterador.get()
        entidad = nucleo.modelo.by_id(forma.id)
        if entidad.is_a("IfcWall"):
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            volumen = sum(
                float(np.dot(vertices[c[0]], np.cross(vertices[c[1]], vertices[c[2]]))) / 6.0
                for c in caras
            )
            salida[entidad.GlobalId] = salida.get(entidad.GlobalId, 0.0) + volumen / ALTURA
        if not iterador.next():
            break
    return salida


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O010")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _datos(nucleo: ModeloNucleo, globalid: str):
    entidad = nucleo._entidad_por_gid(globalid)
    datos = nucleo._datos_muro(entidad)
    centro = nucleo._desfase_de_muro(entidad, datos["espesor"]) + datos["espesor"] / 2.0
    return datos, centro


@pytest.mark.parametrize(
    "tipo_a,tipo_b",
    [
        ("Block 15", "Block 15"),
        ("Block 15", "Block 20"),
        ("Block 15 aplanado-yeso", "Block 12"),
    ],
)
def test_esquina_en_l_area_exacta_sin_solapes(tipo_a: str, tipo_b: str) -> None:
    nucleo, nivel = _nuevo()
    a = nucleo.muro_crear(tipo_a, nivel, 0, 0, 4, 0, altura=ALTURA)["creados"][0]
    b = nucleo.muro_crear(tipo_b, nivel, 4, 0, 4, 3, altura=ALTURA)["creados"][0]
    areas = _areas(nucleo)
    da, ca = _datos(nucleo, a)
    db, cb = _datos(nucleo, b)
    # Inglete: cada cuerpo llega a la cara exterior del otro. El área de la unión
    # es la suma de los dos largos por su espesor, descontando el corrimiento de
    # cada eje respecto de la línea de ubicación.
    esperado = (4 - cb) * da["espesor"] + (3 - ca) * db["espesor"]
    assert sum(areas.values()) == pytest.approx(esperado, abs=1e-6)
    # Cada muro aporta su parte: ni uno se queda con todo ni desaparece.
    assert areas[a] == pytest.approx((4 - cb) * da["espesor"], abs=1e-6)
    assert areas[b] == pytest.approx((3 - ca) * db["espesor"], abs=1e-6)


def test_esquina_en_t_recorta_el_que_llega_en_la_cara_del_pasante() -> None:
    nucleo, nivel = _nuevo()
    a = nucleo.muro_crear("Block 15", nivel, 0, 0, 8, 0, altura=ALTURA)["creados"][0]
    b = nucleo.muro_crear("Block 20", nivel, 4, 0, 4, 3, altura=ALTURA)["creados"][0]
    areas = _areas(nucleo)
    da, ca = _datos(nucleo, a)
    db, cb = _datos(nucleo, b)
    esperado_a = 8 * da["espesor"]
    esperado_b = (3 - (ca + da["espesor"] / 2)) * db["espesor"]
    assert areas[a] == pytest.approx(esperado_a, abs=1e-6)
    assert areas[b] == pytest.approx(esperado_b, abs=1e-6)
    assert sum(areas.values()) == pytest.approx(esperado_a + esperado_b, abs=1e-6)


def test_cruce_en_x_conserva_los_dos_muros_completos() -> None:
    nucleo, nivel = _nuevo()
    a = nucleo.muro_crear("Block 15", nivel, 0, 4, 8, 4, altura=ALTURA)["creados"][0]
    b = nucleo.muro_crear("Block 20", nivel, 4, 0, 4, 8, altura=ALTURA)["creados"][0]
    areas = _areas(nucleo)
    da, _ca = _datos(nucleo, a)
    db, _cb = _datos(nucleo, b)
    assert areas[a] == pytest.approx(8 * da["espesor"], abs=1e-6)
    assert areas[b] == pytest.approx(8 * db["espesor"], abs=1e-6)
