"""O049: el contorno dibujado sobre una cara superior nace con su desfase.

Caso calculado a mano: una losa de 5 × 4 × 0.12 tiene su cara superior en
z = 0.12. Un muro de 4 m de largo y 2.6 m de alto creado sobre esa cara debe
tener su base en 0.12 (no en 0) y su tope en 2.72.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from ifcopenshell.util import placement

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES  # noqa: E402
from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    entidad = nucleo.modelo.by_guid(gid)
    return float(placement.get_local_placement(entidad.ObjectPlacement)[2][3])


def _pset(nucleo: ModeloNucleo, gid: str, nombre: str) -> dict:
    return nucleo.propiedades(gid)["psets"].get(nombre, {})


def test_muro_sobre_losa_nace_a_z_0_12_y_su_tope_queda_a_2_72() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O049 muro sobre losa")
    nivel = nucleo.niveles()[0]["globalid"]

    losa = nucleo.losa_crear(nivel, [(0, 0), (5, 0), (5, 4), (0, 4)], 0.12)["creados"][0]
    muro = nucleo.muro_crear(
        "Block 15", nivel, 0, 0, 4, 0, altura=2.6, desfase_base=0.12
    )["creados"][0]

    assert _z(nucleo, losa) == pytest.approx(0.0, abs=1e-9)
    assert _z(nucleo, muro) == pytest.approx(0.12, abs=1e-9)
    restricciones = _pset(nucleo, muro, PSET_RESTRICCIONES)
    assert restricciones["DesfaseBase"] == pytest.approx(0.12, abs=1e-9)
    assert restricciones["AlturaSinConexion"] == pytest.approx(2.6, abs=1e-9)
    # 0.12 + 2.60 = 2.72
    assert _z(nucleo, muro) + 2.6 == pytest.approx(2.72, abs=1e-9)


def test_losa_columna_y_generico_aceptan_el_desfase_de_la_cara() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O049 desfase")
    nivel = nucleo.niveles()[0]["globalid"]

    losa = nucleo.losa_crear(
        nivel, [(0, 0), (2, 0), (2, 2), (0, 2)], 0.12, desfase=0.12
    )["creados"][0]
    columna = nucleo.columna_crear(
        "C-1 Columna 30×30", nivel, 1, 1, altura=2.6, desfase=0.12
    )["creados"][0]
    generico = nucleo.generico_crear(
        nivel, [(0, 0), (2, 0), (2, 2), (0, 2)], 1.0, desfase=0.12
    )["creados"][0]

    assert _z(nucleo, losa) == pytest.approx(0.12, abs=1e-9)
    assert _z(nucleo, columna) == pytest.approx(0.12, abs=1e-9)
    assert _z(nucleo, generico) == pytest.approx(0.12, abs=1e-9)
    assert _pset(nucleo, generico, "OPENRVT_Generico")["Desfase"] == pytest.approx(
        0.12, abs=1e-9
    )
    assert _pset(nucleo, losa, "OPENRVT_Losa")["Desfase"] == pytest.approx(
        0.12, abs=1e-9
    )
    assert _pset(nucleo, columna, PSET_RESTRICCIONES)["DesfaseBase"] == pytest.approx(
        0.12, abs=1e-9
    )


def test_al_mover_el_nivel_el_desfase_se_conserva() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O049 nivel")
    nivel = nucleo.niveles()[0]
    muro = nucleo.muro_crear(
        "Block 15", nivel["globalid"], 0, 0, 4, 0, altura=2.6, desfase_base=0.12
    )["creados"][0]

    # El nivel sube 1 m: la base debe quedar en 1.12, no en 1.00.
    nucleo.nivel_editar(nivel["globalid"], elevacion=1.0)
    assert _z(nucleo, muro) == pytest.approx(1.12, abs=1e-9)
    assert _pset(nucleo, muro, PSET_RESTRICCIONES)["DesfaseBase"] == pytest.approx(
        0.12, abs=1e-9
    )


def test_el_servidor_pasa_desfase_base_y_desfase() -> None:
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor.modelo.nuevo("O049 servidor")
    nivel = servidor.modelo.niveles()[0]["globalid"]

    muro = servidor.despachar(
        "muros.crear",
        {
            "tipo": "Block 15",
            "nivel": nivel,
            "x1": 0,
            "y1": 0,
            "x2": 4,
            "y2": 0,
            "altura": 2.6,
            "desfase_base": 0.12,
        },
    )["creados"][0]
    generico = servidor.despachar(
        "genericos.crear",
        {
            "nivel": nivel,
            "puntos": [[0, 0], [2, 0], [2, 2], [0, 2]],
            "altura": 1.0,
            "desfase": 0.12,
        },
    )["creados"][0]
    assert _z(servidor.modelo, muro) == pytest.approx(0.12, abs=1e-9)
    assert _z(servidor.modelo, generico) == pytest.approx(0.12, abs=1e-9)
