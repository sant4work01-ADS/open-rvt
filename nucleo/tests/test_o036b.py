"""O036b: la interfaz dibuja ejes solo horizontales o verticales.

El núcleo sigue admitiendo cualquier dirección (los ejes especiales oblicuos
vendrán después); la restricción vive en la herramienta de dibujo de la interfaz.

Valores calculados a mano, sin copiarlos del código:

- un eje de (0,0) a (3,4) es oblicuo y el núcleo lo conserva tal cual: mide
  exactamente 5.00 m (3-4-5).
- un eje horizontal (0,−2)-(5,−2), desplazado +2 m en perpendicular, pasa a
  (0,−4)-(5,−4): sigue horizontal y ambos extremos bajan exactamente 2 m.
- un eje vertical (2,−2)-(2,5), desplazado +2 m en perpendicular, pasa a
  (4,−2)-(4,5): sigue vertical y ambos extremos se mueven exactamente 2 m en x.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O036b")
    return nucleo


def _extremos(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    _grid, eje = nucleo._eje_por_gid(gid)
    return nucleo._direccion_eje(eje)[:4]


def test_el_nucleo_conserva_un_eje_oblicuo() -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("X", 0, 0, 3, 4)["creados"][0]
    x1, y1, x2, y2 = _extremos(nucleo, gid)
    assert (x1, y1, x2, y2) == pytest.approx((0.0, 0.0, 3.0, 4.0))
    # 3-4-5: la longitud es exactamente 5.00 m.
    assert nucleo._direccion_eje(nucleo._eje_por_gid(gid)[1])[6] == pytest.approx(5.0)


def test_abrir_un_eje_oblicuo_lo_conserva_sin_aviso(tmp_path: Path) -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("X", 0, 0, 3, 4)["creados"][0]
    ruta = tmp_path / "eje-oblicuo.ifc"
    nucleo.guardar(str(ruta))

    otro = ModeloNucleo()
    resultado = otro.abrir(str(ruta))
    assert "avisos" not in resultado
    abierto = otro.ejes_listar()
    assert len(abierto) == 1
    assert abierto[0]["globalid"] == gid
    assert (
        abierto[0]["x1"],
        abierto[0]["y1"],
        abierto[0]["x2"],
        abierto[0]["y2"],
    ) == (0.0, 0.0, 3.0, 4.0)


def test_crear_eje_horizontal_se_acepta_con_sus_dos_puntos() -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("A", 0, 0, 5, 0)["creados"][0]
    assert _extremos(nucleo, gid) == pytest.approx((0.0, 0.0, 5.0, 0.0))


def test_crear_eje_vertical_se_acepta_con_sus_dos_puntos() -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("1", 2, -1, 2, 4)["creados"][0]
    assert _extremos(nucleo, gid) == pytest.approx((2.0, -1.0, 2.0, 4.0))


def test_mover_eje_horizontal_dos_metros_sigue_horizontal() -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("A", 0, -2, 5, -2)["creados"][0]
    nucleo.ejes_mover(gid, 2.0)
    x1, y1, x2, y2 = _extremos(nucleo, gid)
    # Cálculo a mano: la normal derecha de (1,0) es (0,−1); +2 m baja ambos extremos.
    assert (x1, y1, x2, y2) == pytest.approx((0.0, -4.0, 5.0, -4.0))


def test_mover_eje_vertical_dos_metros_sigue_vertical() -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("1", 2, -2, 2, 5)["creados"][0]
    nucleo.ejes_mover(gid, 2.0)
    x1, y1, x2, y2 = _extremos(nucleo, gid)
    # Cálculo a mano: la normal derecha de (0,1) es (1,0); +2 m sube x a 4.
    assert (x1, y1, x2, y2) == pytest.approx((4.0, -2.0, 4.0, 5.0))


def test_ejes_por_separaciones_son_ortogonales() -> None:
    nucleo = _nuevo()
    nucleo.ejes_crear_por_separaciones(
        "vertical", 0.0, [4.0, 4.0], 10.0, "1", modo="origen"
    )
    nucleo.ejes_crear_por_separaciones(
        "horizontal", 0.0, [3.0], 10.0, "A", modo="origen"
    )
    ejes = {e["etiqueta"]: e for e in nucleo.ejes_listar()}
    assert set(ejes) == {"1", "2", "3", "A", "B"}
    for etiqueta in ("1", "2", "3"):
        assert ejes[etiqueta]["x1"] == pytest.approx(ejes[etiqueta]["x2"])
        assert ejes[etiqueta]["y1"] == pytest.approx(0.0)
        assert ejes[etiqueta]["y2"] == pytest.approx(10.0)
    for etiqueta in ("A", "B"):
        assert ejes[etiqueta]["y1"] == pytest.approx(ejes[etiqueta]["y2"])
        assert ejes[etiqueta]["x1"] == pytest.approx(0.0)
        assert ejes[etiqueta]["x2"] == pytest.approx(10.0)


def test_rpc_acepta_eje_oblicuo_y_horizontal() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O036b"})
    oblicuo = servidor.despachar(
        "ejes.crear", {"etiqueta": "X", "x1": 0, "y1": 0, "x2": 3, "y2": 4}
    )["creados"]
    horizontal = servidor.despachar(
        "ejes.crear", {"etiqueta": "A", "x1": 0, "y1": 0, "x2": 5, "y2": 0}
    )["creados"]
    assert oblicuo and horizontal
