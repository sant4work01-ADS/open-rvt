"""O037: zapata con dado, bordes de losa y borrado de nivel.

Valores calculados a mano (spec O037 y biblioteca):

- Zapata «Z-1 Zapata 1.20×1.20»: Peralte 0.25, DadoB/DadoH 0.40, Plantilla 0.05.
  Con desplante 1.00 bajo el nivel 0.00: fondo = 0.00 − 1.00 = −1.00; el alto del
  dado se deriva: desplante − peralte = 0.75. Tope del dado = nivel = 0.00.
- Losa [(0,0),(4,0),(4,3),(0,3)] con los 4 bordes «libre»: desfase 0.30 en el borde
  0 mueve el lado inferior a y = −0.30; volver a 0 devuelve exactamente (0,0,4,3).
- Nivel borrado: desaparece de `IfcBuildingStorey` y de `modelo.niveles()`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely import wkt

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O037")
    return nucleo


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _tipo(nucleo: ModeloNucleo, clase: str, nombre: str) -> str:
    return next(
        t["nombre"] for t in nucleo.tipos_listar(clase) if t["nombre"] == nombre
    )


def _zapata(nucleo: ModeloNucleo, desplante: float) -> str:
    tipo = _tipo(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20")
    return nucleo.zapata_crear(tipo, _nivel(nucleo), 0.0, 0.0, desplante=desplante)[
        "creados"
    ][0]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcRoot") if e.GlobalId == gid)


def _caja_z(nucleo: ModeloNucleo, gid: str) -> tuple[float, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, _entidad(nucleo, gid))
    vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
    return float(vertices[:, 2].min()), float(vertices[:, 2].max())


def _huella(nucleo: ModeloNucleo, losa) -> tuple[float, float, float, float]:
    contorno = wkt.loads(str(nucleo._leer_pset(losa, "OPENRVT_Losa")["Contorno"]))
    x0, y0, x1, y1 = contorno.bounds
    return x0, y0, x1, y1


# --------------------------------------------------------------------- 1: zapata


def test_dado_de_la_zapata_llega_al_nivel_y_fondo_al_desplante() -> None:
    nucleo = _nuevo()
    gid = _zapata(nucleo, 1.0)
    fondo, tope = _caja_z(nucleo, gid)
    # Tope del dado = elevación del nivel (0.00); fondo = 0.00 − 1.00 = −1.00,
    # con la plantilla de 0.05 por debajo: mínimo −1.05.
    assert tope == pytest.approx(0.0, abs=1e-6)
    assert fondo == pytest.approx(-1.05, abs=1e-6)


def test_desplante_menor_que_el_peralte_se_rechaza() -> None:
    nucleo = _nuevo()
    # Peralte 0.25: un desplante de 0.20 deja el dado sin altura.
    with pytest.raises(ErrorNucleo):
        _zapata(nucleo, 0.20)


def test_zapata_corrida_sin_residuo_flotante() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "IfcFootingType", "ZC-1 Zapata corrida 60")
    gid = nucleo.zapata_corrida_crear(
        tipo, _nivel(nucleo), 0.0, 0.0, 3.0, 0.0, desplante=0.80
    )["creados"][0]
    fondo, tope = _caja_z(nucleo, gid)
    # Sin dado: fondo = 0.00 − 0.80 − plantilla(0.05) = −0.85;
    # tope = 0.00 − 0.80 + peralte(0.20) = −0.60 (sin franja residual).
    assert fondo == pytest.approx(-0.85, abs=1e-6)
    assert tope == pytest.approx(-0.60, abs=1e-6)


# --------------------------------------------------------------------- 3: losa


def _losa_rectangular(nucleo: ModeloNucleo):
    nucleo.losa_crear(_nivel(nucleo), [(0, 0), (4, 0), (4, 3), (0, 3)])
    return nucleo.modelo.by_type("IfcSlab")[-1]


def test_losa_desfase_030_y_volver_a_0_regresa_al_original() -> None:
    nucleo = _nuevo()
    losa = _losa_rectangular(nucleo)
    nucleo.elemento_editar(losa.GlobalId, {"cambio_borde": {"indice": 0, "desfase": 0.30}})
    x0, y0, x1, y1 = _huella(nucleo, losa)
    assert y0 == pytest.approx(-0.30, abs=1e-9)
    assert (x0, y1, x1) == pytest.approx((0.0, 3.0, 4.0), abs=1e-9)
    # Volver a 0 devuelve el contorno original, sin acumular el desfase anterior.
    nucleo.elemento_editar(losa.GlobalId, {"cambio_borde": {"indice": 0, "desfase": 0.0}})
    assert _huella(nucleo, losa) == pytest.approx((0.0, 0.0, 4.0, 3.0), abs=1e-9)


def test_losa_desfase_idempotente_y_campo_general() -> None:
    nucleo = _nuevo()
    losa = _losa_rectangular(nucleo)
    # Campo general «Desfase de bordes» aplica 0.30 a los cuatro lados, hacia afuera.
    nucleo.elemento_editar(losa.GlobalId, {"desfase_bordes": 0.30})
    assert _huella(nucleo, losa) == pytest.approx((-0.30, -0.30, 4.30, 3.30), abs=1e-9)
    # Repetir el mismo valor no cambia nada (idempotente).
    nucleo.elemento_editar(losa.GlobalId, {"desfase_bordes": 0.30})
    assert _huella(nucleo, losa) == pytest.approx((-0.30, -0.30, 4.30, 3.30), abs=1e-9)


def test_losa_vieja_sin_base_toma_el_contorno_actual_como_base() -> None:
    nucleo = _nuevo()
    losa = _losa_rectangular(nucleo)
    # Archivo viejo: los bordes no traen la línea base (punto_a/punto_b).
    datos = dict(nucleo._leer_pset(losa, "OPENRVT_Losa"))
    bordes = json.loads(datos["Bordes"])
    for borde in bordes:
        borde.pop("punto_a", None)
        borde.pop("punto_b", None)
    datos["Bordes"] = json.dumps(bordes, ensure_ascii=False)
    nucleo._guardar_pset(losa, "OPENRVT_Losa", datos)
    # Desfase 0 sobre todo el contorno lo deja tal cual (el contorno actual es la base).
    nucleo.elemento_editar(losa.GlobalId, {"desfase_bordes": 0.0})
    assert _huella(nucleo, losa) == pytest.approx((0.0, 0.0, 4.0, 3.0), abs=1e-9)


# --------------------------------------------------------------------- 4: nivel


def test_nivel_borrado_no_queda_en_el_ifc_ni_en_modelo_niveles() -> None:
    nucleo = _nuevo()
    for i in range(1, 7):
        nucleo.nivel_crear(f"Nivel {i}", i * 0.6)
    objetivo = next(n["globalid"] for n in nucleo.niveles() if n["nombre"] == "Nivel 6")
    nucleo.nivel_borrar(objetivo)
    restantes = [n["globalid"] for n in nucleo.niveles()]
    assert objetivo not in restantes
    en_ifc = {e.GlobalId for e in nucleo.modelo.by_type("IfcBuildingStorey")}
    assert objetivo not in en_ifc


def test_deshacer_devuelve_el_nivel_borrado() -> None:
    nucleo = _nuevo()
    for i in range(1, 7):
        nucleo.nivel_crear(f"Nivel {i}", i * 0.6)
    objetivo = next(n["globalid"] for n in nucleo.niveles() if n["nombre"] == "Nivel 6")
    nucleo.nivel_borrar(objetivo)
    nucleo.deshacer()
    nombres = {n["nombre"] for n in nucleo.niveles()}
    assert "Nivel 6" in nombres
