"""O032: línea de ubicación del muro y bordes de losa.

Valores calculados a mano (spec O032):
- muro de 0.15 a eje en x=1, dibujado (1,0)->(1,3) con el exterior a la
  izquierda (−X): «paño exterior» deja la cara exterior en x=1 y el cuerpo de
  x=1 a x=1.15. Voltear conserva la cara exterior en x=1 y lleva el cuerpo a
  x=0.85..1.
- losa entre muros de 0.15 centrados en un rectángulo 4×3: «paño exterior»
  mide 4.15×3.15 (área 13.0725 m²), con el contorno de −0.075 a 4.075 y de
  −0.075 a 3.075.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.geometry as geometry_api
import ifcopenshell.api.root as root
import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely import wkt

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O032")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _muro(nucleo: ModeloNucleo, nivel: str, x1: float, y1: float, x2: float, y2: float, **kw):
    gid = nucleo.muro_crear("Block 15", nivel, x1, y1, x2, y2, **kw)["creados"][0]
    return next(e for e in nucleo.modelo.by_type("IfcWall") if e.GlobalId == gid)


def _rectangulo(nucleo: ModeloNucleo, nivel: str, **kw):
    puntos = ((0, 0, 4, 0), (4, 0, 4, 3), (4, 3, 0, 3), (0, 3, 0, 0))
    return [_muro(nucleo, nivel, *p, **kw) for p in puntos]


def _losa(nucleo: ModeloNucleo):
    return nucleo.modelo.by_type("IfcSlab")[-1]


def _pset_losa(nucleo: ModeloNucleo, losa) -> dict:
    return nucleo._leer_pset(losa, "OPENRVT_Losa")


def _huella(nucleo: ModeloNucleo, losa) -> tuple[float, float, float, float]:
    datos = _pset_losa(nucleo, losa)
    contorno = wkt.loads(str(datos["Contorno"]))
    x0, y0, x1, y1 = contorno.bounds
    return x0, y0, x1, y1


def _caja_muro(nucleo: ModeloNucleo, muro) -> tuple[float, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, muro)
    vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
    return float(vertices[:, 0].min()), float(vertices[:, 0].max())


def test_muro_a_eje_pano_exterior_deja_la_cara_en_el_eje() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 1, 0, 1, 3)
    nucleo.elemento_editar(muro.GlobalId, {"linea_ubicacion": "cara_exterior"})
    xmin, xmax = _caja_muro(nucleo, muro)
    # El lado exterior es −X: su cara queda sobre el eje x=1 y el cuerpo crece
    # hacia +X hasta 1.15.
    assert xmin == pytest.approx(1.0, abs=1e-6)
    assert xmax == pytest.approx(1.15, abs=1e-6)


def test_voltear_conserva_la_linea_de_ubicacion() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 1, 0, 1, 3, linea_ubicacion="cara_exterior")
    xmin, xmax = _caja_muro(nucleo, muro)
    assert xmin == pytest.approx(1.0, abs=1e-6)
    nucleo.muro_voltear(muro.GlobalId)
    datos = nucleo._leer_pset(muro, "OPENRVT_Muro")
    assert datos["Volteado"] is True
    xmin2, xmax2 = _caja_muro(nucleo, muro)
    # La cara exterior sigue en el eje; el cuerpo pasa al otro lado.
    assert xmax2 == pytest.approx(1.0, abs=1e-6)
    assert xmin2 == pytest.approx(0.85, abs=1e-6)
    assert xmax2 - xmin2 == pytest.approx(0.15, abs=1e-6)


def test_deshacer_la_linea_de_ubicacion_en_un_paso() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 1, 0, 1, 3)
    antes = nucleo._leer_pset(muro, "OPENRVT_Muro")["LineaUbicacion"]
    nucleo.elemento_editar(muro.GlobalId, {"linea_ubicacion": "cara_interior"})
    assert nucleo._leer_pset(muro, "OPENRVT_Muro")["LineaUbicacion"] == "cara_interior"
    nucleo.deshacer()
    actual = next(e for e in nucleo.modelo.by_type("IfcWall") if e.GlobalId == muro.GlobalId)
    assert nucleo._leer_pset(actual, "OPENRVT_Muro")["LineaUbicacion"] == antes


def test_losa_entre_muros_al_pano_exterior() -> None:
    nucleo, nivel = _nuevo()
    muros = _rectangulo(nucleo, nivel)
    nucleo.losa_desde_muros(nivel, [m.GlobalId for m in muros], lado="exterior")
    losa = _losa(nucleo)
    x0, y0, x1, y1 = _huella(nucleo, losa)
    assert (x0, y0, x1, y1) == pytest.approx((-0.075, -0.075, 4.075, 3.075), abs=1e-6)
    assert (x1 - x0) * (y1 - y0) == pytest.approx(13.0725, abs=1e-6)


def test_eje_y_desfase_075_llega_al_mismo_pano() -> None:
    nucleo, nivel = _nuevo()
    muros = _rectangulo(nucleo, nivel)
    nucleo.losa_desde_muros(
        nivel, [m.GlobalId for m in muros], lado="eje", desfase=0.075
    )
    losa = _losa(nucleo)
    assert _huella(nucleo, losa) == pytest.approx(
        (-0.075, -0.075, 4.075, 3.075), abs=1e-6
    )


def test_mover_eje_regenera_losa_y_muro() -> None:
    nucleo, nivel = _nuevo()
    eje1 = nucleo.eje_crear("1", 0, -2, 0, 5)["creados"][0]
    eje2 = nucleo.eje_crear("2", 4, -2, 4, 5)["creados"][0]
    ejea = nucleo.eje_crear("A", -2, 0, 6, 0)["creados"][0]
    ejeb = nucleo.eje_crear("B", -2, 3, 6, 3)["creados"][0]
    muros = []
    for eje in (eje1, eje2, ejea, ejeb):
        muros.extend(
            nucleo._entidad_por_gid(g)
            for g in nucleo.muros_entre_ejes("Block 15", nivel, eje)["creados"]
        )
    nucleo.losa_desde_muros(
        nivel, [m.GlobalId for m in muros], lado="exterior", desfase=0.0
    )
    losa = _losa(nucleo)
    nucleo.ejes_mover(eje2, 0.5)
    x0, y0, x1, y1 = _huella(nucleo, losa)
    # Muro de 0.15 centrado en x=4.5: paño exterior 4.575; A y B no se mueven.
    assert x1 == pytest.approx(4.575, abs=1e-6)
    assert x0 == pytest.approx(-0.075, abs=1e-6)
    assert y0 == pytest.approx(-0.075, abs=1e-6)
    assert y1 == pytest.approx(3.075, abs=1e-6)
    derecho = next(
        m for m in muros
        if abs(nucleo._datos_muro(m)["x1"] - 4.5) < 1e-6
        or abs(nucleo._datos_muro(m)["x2"] - 4.5) < 1e-6
    )
    xmin, xmax = _caja_muro(nucleo, derecho)
    assert xmin == pytest.approx(4.425, abs=1e-6)
    assert xmax == pytest.approx(4.575, abs=1e-6)


def test_desfase_asimetrico_por_borde() -> None:
    nucleo, nivel = _nuevo()
    puntos = [(0, 0), (4, 0), (4, 3), (0, 3)]
    nucleo.losa_crear(nivel, puntos)
    losa = _losa(nucleo)
    nucleo.elemento_editar(
        losa.GlobalId,
        {
            "cambio_borde": {"indice": 0, "desfase": 0.10},
        },
    )
    x0, y0, x1, y1 = _huella(nucleo, losa)
    # El lado 0 va de (0,0) a (4,0); positivo hacia afuera lo lleva a y=−0.10.
    assert y0 == pytest.approx(-0.10, abs=1e-6)
    assert y1 == pytest.approx(3.0, abs=1e-6)
    assert x0 == pytest.approx(0.0, abs=1e-6)
    assert x1 == pytest.approx(4.0, abs=1e-6)


def test_losa_vieja_sin_bordes_abre_igual() -> None:
    nucleo, nivel = _nuevo()
    puntos = [(0, 0), (4, 0), (4, 3), (0, 3)]
    nucleo.losa_crear(nivel, puntos)
    losa = _losa(nucleo)
    antes = _pset_losa(nucleo, losa)["Contorno"]
    nucleo._quitar_claves_pset(losa, "OPENRVT_Losa", ("Bordes",))
    nucleo._regenerar_losa(losa)
    assert _pset_losa(nucleo, losa)["Contorno"] == antes
    assert _huella(nucleo, losa) == pytest.approx((0, 0, 4, 3), abs=1e-6)


def test_losa_importada_no_se_toca() -> None:
    nucleo, nivel = _nuevo()
    losa = root.create_entity(nucleo.modelo, ifc_class="IfcSlab")
    rep = geometry_api.add_slab_representation(
        nucleo.modelo,
        context=nucleo._contexto(),
        depth=0.12,
        direction_sense="NEGATIVE",
        polyline=[(0, 0), (2, 0), (2, 2), (0, 2)],
    )
    rep.RepresentationIdentifier = "Body"
    geometry_api.assign_representation(nucleo.modelo, product=losa, representation=rep)
    antes = losa.Representation.Representations[0].id()
    nucleo._regenerar_losas_de_bordes({nucleo.modelo.by_type("IfcWall")[0].GlobalId if nucleo.modelo.by_type("IfcWall") else ""})
    assert losa.Representation.Representations[0].id() == antes
    assert not nucleo._leer_pset(losa, "OPENRVT_Losa")


def test_flujo_rpc_muro_y_losa_de_bordes() -> None:
    """De punta a punta: RPC → pset guardado → contorno regenerado."""
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "O032 flujo"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    tipo = next(
        t["nombre"] for t in servidor.despachar("tipos.listar", {"clase": "IfcWallType"})
    )
    gids = []
    for x1, y1, x2, y2 in ((0, 0, 4, 0), (4, 0, 4, 3), (4, 3, 0, 3), (0, 3, 0, 0)):
        gids.append(
            servidor.despachar(
                "muros.crear",
                {
                    "tipo": tipo,
                    "nivel": nivel,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "linea_ubicacion": "cara_exterior",
                },
            )["creados"][0]
        )
    servidor.despachar(
        "losas.desde_muros",
        {"nivel": nivel, "globalids": gids, "lado": "eje", "desfase": 0.075},
    )
    losa_gid = servidor.despachar("modelo.elementos", {})
    losa_gid = next(e["globalid"] for e in losa_gid if e["clase"] == "IfcSlab")
    props = servidor.despachar("modelo.propiedades", {"globalid": losa_gid})
    crudo = json.loads(props["psets"]["OPENRVT_Losa"]["Bordes"])
    assert [b["lado"] for b in crudo] == ["eje", "eje", "eje", "eje"]
    assert all(b["desfase"] == pytest.approx(0.075) for b in crudo)
    contorno = wkt.loads(props["psets"]["OPENRVT_Losa"]["Contorno"])
    # Muro de 0.15 a eje + 0.075: la losa llega al paño exterior en los cuatro lados.
    assert contorno.bounds == pytest.approx((-0.075, -0.075, 4.075, 3.075), abs=1e-6)
    muro = servidor.despachar("modelo.propiedades", {"globalid": gids[0]})
    assert muro["psets"]["OPENRVT_Muro"]["LineaUbicacion"] == "cara_exterior"
    servidor.despachar("muros.voltear", {"globalid": gids[0]})
    muro = servidor.despachar("modelo.propiedades", {"globalid": gids[0]})
    assert muro["psets"]["OPENRVT_Muro"]["Volteado"] is True


def test_cambiar_un_muro_a_pano_interior_mueve_la_losa() -> None:
    nucleo, nivel = _nuevo()
    muros = _rectangulo(nucleo, nivel)
    nucleo.losa_desde_muros(nivel, [m.GlobalId for m in muros], lado="exterior")
    losa = _losa(nucleo)
    assert _huella(nucleo, losa)[2] == pytest.approx(4.075, abs=1e-6)
    nucleo.elemento_editar(muros[1].GlobalId, {"linea_ubicacion": "cara_interior"})
    # Muro derecho a eje: paño exterior 4.075; con paño interior la cara exterior
    # queda sobre el eje x=4.
    assert _huella(nucleo, losa)[2] == pytest.approx(4.0, abs=1e-6)
    # Y la losa conserva los otros tres lados.
    x0, y0, _x1, y1 = _huella(nucleo, losa)
    assert (x0, y0, y1) == pytest.approx((-0.075, -0.075, 3.075), abs=1e-6)
