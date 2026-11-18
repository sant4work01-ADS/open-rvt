"""O069 — mover una ventana en vertical cambia su antepecho (núcleo).

Valores a mano (spec O069, 18-nov-2026), muro de 2.60 m de alto:

1. Ventana con antepecho 0.90 y alto 1.20: alféizar en z = 0.90, cabeza en 2.10.
2. Mover dz = +0.30 → alféizar 0.90 + 0.30 = 1.20 y cabeza 2.40 ≤ 2.60.
3. Mover otra vez dz = +0.60 → 1.20 + 0.60 + 1.20 = 3.00 > 2.60: error y el
   modelo queda exactamente como estaba (z = 1.20).
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.geom as geom
import ifcopenshell.util.placement as placement
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402


def _nuevo() -> tuple[ModeloNucleo, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O069")
    n0 = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear(
        "Block 15", n0, 0.0, 0.0, 4.0, 0.0, altura=2.60
    )["creados"][0]
    creados = nucleo.abertura_crear(
        "IfcWindow", muro, 1.00, 1.20, 1.20, 0.90, nivel=None
    )["creados"]
    return nucleo, muro, creados[0], creados[1]  # type: ignore[return-value]


def _z_de_vano(nucleo: ModeloNucleo, vano: str) -> float:
    matriz = placement.get_local_placement(
        nucleo._entidad_por_gid(vano).ObjectPlacement
    )
    return float(matriz[2][3])


def _caja_z(entidad) -> tuple[float, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, entidad)
    vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
    return (float(vertices[:, 2].min()), float(vertices[:, 2].max()))


def test_mover_dz_positivo_sube_el_antepecho() -> None:
    nucleo, _muro, vano, relleno = _nuevo()

    assert _z_de_vano(nucleo, vano) == pytest.approx(0.90, abs=1e-9)
    assert _caja_z(nucleo._entidad_por_gid(vano)) == (
        pytest.approx(0.90, abs=1e-6),
        pytest.approx(2.10, abs=1e-6),
    )

    nucleo.elementos_mover([relleno], 0.0, 0.0, 0.30)

    datos = nucleo._leer_pset(nucleo._entidad_por_gid(vano), "OPENRVT_Abertura")
    assert datos["Antepecho"] == pytest.approx(1.20, abs=1e-9)
    assert datos["AntepechoNivel"] == pytest.approx(1.20, abs=1e-9)
    assert _z_de_vano(nucleo, vano) == pytest.approx(1.20, abs=1e-9)
    assert _caja_z(nucleo._entidad_por_gid(vano)) == (
        pytest.approx(1.20, abs=1e-6),
        pytest.approx(2.40, abs=1e-6),
    )


def test_mover_fuera_del_muro_falla_y_no_cambia_nada() -> None:
    nucleo, _muro, vano, relleno = _nuevo()
    nucleo.elementos_mover([relleno], 0.0, 0.0, 0.30)
    antes = nucleo.modelo.to_string()

    with pytest.raises(ErrorNucleo):
        nucleo.elementos_mover([relleno], 0.0, 0.0, 0.60)

    assert nucleo.modelo.to_string() == antes
    assert _z_de_vano(nucleo, vano) == pytest.approx(1.20, abs=1e-9)
    assert _caja_z(nucleo._entidad_por_gid(vano))[1] == pytest.approx(2.40, abs=1e-6)
