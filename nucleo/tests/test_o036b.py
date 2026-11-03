"""O036b: los ejes solo pueden ser horizontales o verticales.

Valores calculados a mano, sin copiarlos del código:

- un eje de (0,0) a (3,4) es oblicuo: |dx| = 3 > 1e-9 y |dy| = 4 > 1e-9.
- un eje de (0,0) a (5,0) es horizontal y mide 5.00 m.
- el eje horizontal (0,−2)-(5,−2), desplazado +2 m en perpendicular, pasa a
  (0,−4)-(5,−4): sigue horizontal y ambos extremos bajan exactamente 2 m.
- el eje vertical (2,−2)-(2,5), desplazado +2 m en perpendicular, pasa a
  (4,−2)-(4,5): sigue vertical y ambos extremos se mueven exactamente 2 m en x.
- un archivo viejo con el eje X de (0,0) a (5,3) se abre sin error, conserva sus
  extremos y devuelve el aviso «El eje X no es horizontal ni vertical.».
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O036b")
    return nucleo


def _extremos(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float, float]:
    _grid, eje = nucleo._eje_por_gid(gid)
    return nucleo._direccion_eje(eje)[:4]


def test_crear_eje_oblicuo_se_rechaza_sin_tocar_historial() -> None:
    nucleo = _nuevo()
    historial_antes = len(nucleo._deshacer)
    with pytest.raises(ErrorNucleo, match="Los ejes solo pueden ser horizontales o verticales"):
        nucleo.eje_crear("X", 0, 0, 3, 4)
    assert nucleo.ejes_listar() == []
    assert len(nucleo._deshacer) == historial_antes


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


def test_abrir_archivo_viejo_con_eje_oblicuo_avisa_una_vez_y_no_lo_toca(
    tmp_path: Path,
) -> None:
    nucleo = _nuevo()
    gid = nucleo.eje_crear("X", 0, 0, 5, 0)["creados"][0]
    _grid, eje = nucleo._eje_por_gid(gid)
    punto = nucleo._puntos_curva_eje(eje)[-1]
    coords = list(punto.Coordinates)
    coords[1] = 3.0
    punto.Coordinates = tuple(coords)
    ruta = tmp_path / "eje-oblicuo.ifc"
    nucleo.guardar(str(ruta))

    otro = ModeloNucleo()
    resultado = otro.abrir(str(ruta))
    assert resultado["avisos"] == ["El eje X no es horizontal ni vertical."]
    abierto = otro.ejes_listar()
    assert len(abierto) == 1
    assert (abierto[0]["x1"], abierto[0]["y1"], abierto[0]["x2"], abierto[0]["y2"]) == (
        pytest.approx(0.0),
        pytest.approx(0.0),
        pytest.approx(5.0),
        pytest.approx(3.0),
    )
    # El aviso es de la carga: las consultas posteriores no lo repiten.
    assert "avisos" not in otro.info()


def test_rpc_rechaza_eje_oblicuo_y_acepta_horizontal() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O036b"})
    with pytest.raises(ErrorNucleo, match="Los ejes solo pueden ser horizontales o verticales"):
        servidor.despachar(
            "ejes.crear", {"etiqueta": "X", "x1": 0, "y1": 0, "x2": 3, "y2": 4}
        )
    creados = servidor.despachar(
        "ejes.crear", {"etiqueta": "A", "x1": 0, "y1": 0, "x2": 5, "y2": 0}
    )["creados"]
    assert creados
