"""O034: el desfase de un borde de losa que produce el arrastre del asa.

Valores calculados a mano:
- losa 4×3 en (0,0)-(4,3): área 12.00 m²;
- borde norte (índice 2) a +0.20: de y=0..3 a y=0..3.20 → 4×3.20 = 12.80 m²;
- después, borde sur (índice 0) a −0.10: de y=0..3.20 a y=0.10..3.20 →
  4×3.10 = 12.40 m².
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from shapely import wkt

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _losa(nucleo: ModeloNucleo):
    return next(e for e in nucleo.modelo.by_type("IfcSlab"))


def _pset(nucleo: ModeloNucleo, losa) -> dict:
    return nucleo._leer_pset(losa, "OPENRVT_Losa")


def _bordes(nucleo: ModeloNucleo, losa) -> list[dict]:
    return json.loads(str(_pset(nucleo, losa)["Bordes"]))


def test_borde_norte_020_area_12_80_y_un_solo_deshacer() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O034")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.losa_crear(nivel, [(0, 0), (4, 0), (4, 3), (0, 3)])["creados"][0]
    losa = _losa(nucleo)
    assert losa.GlobalId == gid
    assert _pset(nucleo, losa)["Area"] == pytest.approx(12.0, abs=1e-9)

    # Lo que hace soltar el asa: el mismo cambio_borde que la tabla de Propiedades.
    nucleo.elemento_editar(gid, {"cambio_borde": {"indice": 2, "desfase": 0.20}})
    losa = _losa(nucleo)
    assert losa.GlobalId == gid, "el arrastre no debe cambiar el GlobalId"
    datos = _pset(nucleo, losa)
    assert datos["Area"] == pytest.approx(12.80, abs=1e-9)
    contorno = wkt.loads(str(datos["Contorno"]))
    assert contorno.bounds == pytest.approx((0.0, 0.0, 4.0, 3.2), abs=1e-9)
    assert _bordes(nucleo, losa)[2]["desfase"] == pytest.approx(0.20, abs=1e-9)

    nucleo.deshacer()
    losa = _losa(nucleo)
    assert losa.GlobalId == gid
    assert _pset(nucleo, losa)["Area"] == pytest.approx(12.0, abs=1e-9)
    assert _bordes(nucleo, losa)[2]["desfase"] == pytest.approx(0.0, abs=1e-9)

    nucleo.rehacer()
    assert _pset(nucleo, _losa(nucleo))["Area"] == pytest.approx(12.80, abs=1e-9)


def test_dos_bordes_seguidos_sur_menos_010_area_12_40() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O034 bordes")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.losa_crear(nivel, [(0, 0), (4, 0), (4, 3), (0, 3)])["creados"][0]
    nucleo.elemento_editar(gid, {"cambio_borde": {"indice": 2, "desfase": 0.20}})
    nucleo.elemento_editar(gid, {"cambio_borde": {"indice": 0, "desfase": -0.10}})
    losa = _losa(nucleo)
    datos = _pset(nucleo, losa)
    assert datos["Area"] == pytest.approx(12.40, abs=1e-9)
    contorno = wkt.loads(str(datos["Contorno"]))
    assert contorno.bounds == pytest.approx((0.0, 0.10, 4.0, 3.20), abs=1e-9)
    bordes = _bordes(nucleo, losa)
    assert bordes[0]["desfase"] == pytest.approx(-0.10, abs=1e-9)
    assert bordes[2]["desfase"] == pytest.approx(0.20, abs=1e-9)


def test_flujo_rpc_del_asa_escribe_el_pset() -> None:
    """Puerta JSON-RPC: mismo comando que la interfaz, dato guardado y área."""
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "O034 RPC"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    gid = servidor.despachar(
        "losas.crear",
        {"nivel": nivel, "puntos": [(0, 0), (4, 0), (4, 3), (0, 3)]},
    )["creados"][0]
    servidor.despachar(
        "elementos.editar",
        {"globalid": gid, "cambios": {"cambio_borde": {"indice": 2, "desfase": 0.20}}},
    )
    props = servidor.despachar("modelo.propiedades", {"globalid": gid})
    pset = props["psets"]["OPENRVT_Losa"]
    assert pset["Area"] == pytest.approx(12.80, abs=1e-9)
    assert json.loads(pset["Bordes"])[2]["desfase"] == pytest.approx(0.20, abs=1e-9)
