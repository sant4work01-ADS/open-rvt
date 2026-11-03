"""O035: el muro baja hasta el lecho superior de la cimentación.

Los valores esperados salen de la norma de la spec y se calcularon a mano:

- Muro Block 15 (0.15) de 4 m y 2.60 m sobre contratrabe con cara superior en
  −0.30: altura total 2.90 m; bruto 4 · 2.90 · 0.15 = 1.74 m³.
- El mismo muro sobre zapata corrida con cara superior en −0.50: 3.10 m de alto;
  bruto 4 · 3.10 · 0.15 = 1.86 m³.
- Muro de 6 m con solo 3 m sobre contratrabe: 3 · 2.60 · 0.15 + 3 · 2.90 · 0.15
  = 1.17 + 1.305 = 2.475 m³.
- Desfase de base puesto a mano (−0.10): no baja; 4 · 2.60 · 0.15 = 1.56 m³.
- Firme de 0.10 m y 4 × 2 m: conserva 4 · 2 · 0.10 = 0.80 m³; el muro cede su
  parte del traslape (prioridad de la losa, igual que el dado de O041):
  1.74 − 4 · 0.15 · 0.10 = 1.68 m³.
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

MURO = "Block 15"
CT = "CT-1 Contratrabe 20×40"
ZC = "ZC-1 Zapata corrida 60"


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O035")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._datos_muro(_entidad(nucleo, gid))


def _bajadas(nucleo: ModeloNucleo, gid: str) -> list[tuple[float, float, float]]:
    return nucleo._tramos_bajada_muro(_entidad(nucleo, gid), _datos(nucleo, gid))


def _info(nucleo: ModeloNucleo, gid: str) -> dict:
    return next(
        e for e in nucleo.cantidades_estructura()["elementos"] if e["globalid"] == gid
    )


def _caja(nucleo: ModeloNucleo, gid: str) -> tuple[float, ...]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == _entidad(nucleo, gid).id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            return (
                float(vertices[:, 0].min()), float(vertices[:, 0].max()),
                float(vertices[:, 1].min()), float(vertices[:, 1].max()),
                float(vertices[:, 2].min()), float(vertices[:, 2].max()),
            )
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {gid}")


def _volumen_malla(nucleo: ModeloNucleo, gid: str) -> float:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == _entidad(nucleo, gid).id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            return abs(
                sum(
                    float(
                        np.dot(
                            vertices[c[0]],
                            np.cross(vertices[c[1]], vertices[c[2]]),
                        )
                    )
                    / 6.0
                    for c in caras
                )
            )
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {gid}")


def _contratrabe(
    nucleo: ModeloNucleo, nivel: str, x1: float, y1: float, x2: float, y2: float,
    desfase: float = -0.30,
) -> str:
    return nucleo.viga_crear(CT, nivel, x1, y1, x2, y2, desfase=desfase)["creados"][0]


def test_muro_sobre_contratrabe_baja_a_la_cara_superior() -> None:
    nucleo, nivel = _nuevo()
    _contratrabe(nucleo, nivel, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]

    # El desplazamiento del muro no cambia: la base baja solo al modelar.
    assert _datos(nucleo, muro)["z"] == pytest.approx(0.0, abs=1e-9)
    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.30)], abs=1e-9)

    x0, x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (x0, x1) == pytest.approx((0.0, 4.0), abs=1e-9)
    assert z0 == pytest.approx(-0.30, abs=1e-9)
    assert z1 == pytest.approx(2.60, abs=1e-9)

    info = _info(nucleo, muro)
    assert info["volumen_bruto_m3"] == pytest.approx(1.74, abs=1e-9)
    assert info["volumen_neto_m3"] == pytest.approx(1.74, abs=1e-9)
    assert info["detalle"]["area_neta_m2"] == pytest.approx(11.60, abs=1e-9)
    assert info["detalle"]["base_m"] == pytest.approx(-0.30, abs=1e-9)
    assert _volumen_malla(nucleo, muro) == pytest.approx(1.74, abs=1e-6)


def test_muro_sobre_zapata_corrida_baja_a_su_cara_superior() -> None:
    nucleo, nivel = _nuevo()
    # Peralte 0.20 y desplante 0.70: cara superior en 0 − 0.70 + 0.20 = −0.50.
    nucleo.zapata_corrida_crear(ZC, nivel, 0, 0, 4, 0, desplante=0.70)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]

    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.50)], abs=1e-9)
    assert _caja(nucleo, muro)[4] == pytest.approx(-0.50, abs=1e-9)
    info = _info(nucleo, muro)
    assert info["volumen_bruto_m3"] == pytest.approx(1.86, abs=1e-9)
    assert info["volumen_neto_m3"] == pytest.approx(1.86, abs=1e-9)


def test_solo_baja_el_tramo_que_queda_sobre_la_contratrabe() -> None:
    nucleo, nivel = _nuevo()
    _contratrabe(nucleo, nivel, 0, 0, 3, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 6, 0, altura=2.60)["creados"][0]

    tramos = _bajadas(nucleo, muro)
    assert len(tramos) == 1
    assert tramos[0] == pytest.approx((0.0, 3.0, -0.30), abs=1e-9)
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert z0 == pytest.approx(-0.30, abs=1e-9)
    assert z1 == pytest.approx(2.60, abs=1e-9)
    info = _info(nucleo, muro)
    assert info["volumen_bruto_m3"] == pytest.approx(2.475, abs=1e-9)
    assert info["volumen_neto_m3"] == pytest.approx(2.475, abs=1e-9)
    assert _volumen_malla(nucleo, muro) == pytest.approx(2.475, abs=1e-6)


def test_desfase_de_base_a_mano_no_baja_el_muro() -> None:
    nucleo, nivel = _nuevo()
    _contratrabe(nucleo, nivel, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    nucleo.restricciones_editar(muro, desfase_base=-0.10)

    assert _datos(nucleo, muro)["z"] == pytest.approx(-0.10, abs=1e-9)
    assert _bajadas(nucleo, muro) == []
    assert _caja(nucleo, muro)[4] == pytest.approx(-0.10, abs=1e-9)
    info = _info(nucleo, muro)
    assert info["volumen_bruto_m3"] == pytest.approx(1.56, abs=1e-9)
    assert info["volumen_neto_m3"] == pytest.approx(1.56, abs=1e-9)


def test_casilla_desactivada_vuelve_a_nacer_en_el_nivel() -> None:
    nucleo, nivel = _nuevo()
    _contratrabe(nucleo, nivel, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]

    nucleo.elemento_editar(muro, {"bajar_a_cimentacion": False})
    assert _bajadas(nucleo, muro) == []
    assert _caja(nucleo, muro)[4] == pytest.approx(0.0, abs=1e-9)
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.56, abs=1e-9)

    nucleo.elemento_editar(muro, {"bajar_a_cimentacion": True})
    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.30)], abs=1e-9)
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.74, abs=1e-9)


def test_mover_y_borrar_la_contratrabe_recalcula_y_deshacer_restaura() -> None:
    nucleo, nivel = _nuevo()
    ct = _contratrabe(nucleo, nivel, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]

    nucleo.elementos_mover([ct], 0.0, 1.0, 0.0)
    assert _bajadas(nucleo, muro) == []
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.56, abs=1e-9)

    nucleo.deshacer()
    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.30)], abs=1e-9)
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.74, abs=1e-9)

    nucleo.elementos_borrar([ct])
    assert _bajadas(nucleo, muro) == []
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.56, abs=1e-9)

    nucleo.deshacer()
    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.30)], abs=1e-9)


def test_cambiar_el_peralte_y_el_desplante_recalcula_la_base() -> None:
    nucleo, nivel = _nuevo()
    ct = _contratrabe(nucleo, nivel, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    tipo = _entidad(nucleo, ct)
    _, _seccion, _armado = nucleo._seccion_y_armado(nucleo._tipo_entidad(tipo))
    tipo_gid = nucleo._tipo_entidad(tipo).GlobalId

    # Peralte 0.40 → 0.60: la cara superior sube a −0.20.
    nucleo.tipos_editar(tipo_gid, {"seccion": {"H": 0.60}})
    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.20)], abs=1e-9)
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.68, abs=1e-9)

    # Desplante (desfase) a −0.50: la cara superior baja a −0.50.
    nucleo.elemento_editar(ct, {"desfase": -0.50})
    assert _bajadas(nucleo, muro) == pytest.approx([(0.0, 4.0, -0.50)], abs=1e-9)
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.86, abs=1e-9)


def test_el_firme_conserva_su_volumen_y_la_losa_tiene_prioridad() -> None:
    nucleo, nivel = _nuevo()
    _contratrabe(nucleo, nivel, 0, 0, 4, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]
    firme = nucleo.losa_crear(
        nivel, [(0, -1), (4, -1), (4, 1), (0, 1)], espesor=0.10
    )["creados"][0]

    info_firme = _info(nucleo, firme)
    assert info_firme["volumen_bruto_m3"] == pytest.approx(0.80, abs=1e-9)
    assert info_firme["volumen_neto_m3"] == pytest.approx(0.80, abs=1e-9)
    # El muro pierde exactamente el traslape con el firme (4 · 0.15 · 0.10).
    assert _info(nucleo, muro)["volumen_neto_m3"] == pytest.approx(1.68, abs=1e-9)


def test_zapata_aislada_debajo_no_baja_el_muro() -> None:
    nucleo, nivel = _nuevo()
    nucleo.zapata_crear(
        "Z-1 Zapata 1.20×1.20", nivel, 2.0, 0.0, desplante=1.00
    )
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0]

    assert _bajadas(nucleo, muro) == []
    assert _caja(nucleo, muro)[4] == pytest.approx(0.0, abs=1e-9)
    assert _info(nucleo, muro)["volumen_bruto_m3"] == pytest.approx(1.56, abs=1e-9)


def test_todo_se_tesela_sin_elementos_sin_geometria() -> None:
    nucleo, nivel = _nuevo()
    ct = _contratrabe(nucleo, nivel, 0, 0, 3, 0, desfase=-0.30)
    muro = nucleo.muro_crear(MURO, nivel, 0, 0, 6, 0, altura=2.60)["creados"][0]
    nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel, 2.0, 1.5, desplante=1.00)
    firme = nucleo.losa_crear(
        nivel, [(0, -1), (4, -1), (4, 1), (0, 1)], espesor=0.10
    )["creados"][0]

    esperados = {
        ct,
        muro,
        firme,
        *[
            nucleo._entidad_por_gid(e.GlobalId).GlobalId
            for e in nucleo.modelo.by_type("IfcFooting")
        ],
    }
    teselados = {e["globalid"] for e in nucleo.teselar(None)["elementos"]}
    assert esperados <= teselados
    assert teselados == {
        e.GlobalId for e in nucleo.modelo.by_type("IfcElement")
    }
