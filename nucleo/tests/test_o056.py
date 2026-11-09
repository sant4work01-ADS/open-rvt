"""O056: empujar caras de elementos existentes.

Valores calculados a mano:
- muro 4.00 × 0.15 × 2.60 = 1.560 m³; al subir 0.40 m → 3.00 m y 1.800 m³;
- muro de 4.00 m con un extremo +1.00 → 5.00 m, con el castillo de 2.00 m quieto;
- losa 4 × 3 = 12.00 m²; lado este +0.50 → 4.5 × 3 = 13.50 m²;
- genérico 1 × 1 × 1 = 1.000 m³; cara +X +0.25 → 1.25 × 1 × 1 = 1.250 m³.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402


def _pset(nucleo: ModeloNucleo, gid: str, nombre: str) -> dict:
    return nucleo.propiedades(gid)["psets"].get(nombre, {})


def _cantidades(nucleo: ModeloNucleo, gid: str) -> dict:
    entidad = nucleo.modelo.by_guid(gid)
    for relacion in getattr(entidad, "IsDefinedBy", ()) or ():
        if not relacion.is_a("IfcRelDefinesByProperties"):
            continue
        definicion = relacion.RelatingPropertyDefinition
        if definicion is not None and definicion.is_a("IfcElementQuantity"):
            return {c.Name: c for c in definicion.Quantities or ()}
    return {}


def _muro(nucleo: ModeloNucleo, nivel: str, largo: float = 4.0) -> str:
    return nucleo.muro_crear(
        "Block 15", nivel, 0, 0, largo, 0, altura=2.6
    )["creados"][0]


def test_muro_superior_sube_de_2_60_a_3_00_y_el_volumen_es_exacto() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 muro altura")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = _muro(nucleo, nivel)
    antes = _pset(nucleo, muro, "OPENRVT_Muro")
    assert antes["Longitud"] * antes["Altura"] * antes["Espesor"] == pytest.approx(
        1.560, abs=1e-9
    )

    resultado = nucleo.elementos_empujar_cara(
        muro, [0, 0, 1], [2, 0, 2.6], 0.40
    )
    assert resultado["modificados"] == [muro]
    despues = _pset(nucleo, muro, "OPENRVT_Muro")
    assert despues["Altura"] == pytest.approx(3.00, abs=1e-9)
    # 4.00 × 0.15 × 3.00 = 1.800 m³
    assert despues["Longitud"] * despues["Altura"] * despues["Espesor"] == pytest.approx(
        1.800, abs=1e-9
    )


def test_muro_extremo_mas_uno_deja_5_00_y_el_castillo_intermedio_quieto() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 muro extremo")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = _muro(nucleo, nivel)
    castillo = nucleo.castillo_crear_en_muro(
        "K-1 Castillo 15×15", muro, 2.0
    )["creados"][0]
    datos_castillo = _pset(nucleo, castillo, "OPENRVT_Estructura")
    assert datos_castillo["X"] == pytest.approx(2.0, abs=1e-9)

    nucleo.elementos_empujar_cara(muro, [1, 0, 0], [4, 0, 1.3], 1.00)

    datos_muro = _pset(nucleo, muro, "OPENRVT_Muro")
    assert datos_muro["Longitud"] == pytest.approx(5.00, abs=1e-9)
    datos_castillo = _pset(nucleo, castillo, "OPENRVT_Estructura")
    assert datos_castillo["X"] == pytest.approx(2.0, abs=1e-9)
    assert datos_castillo["Y"] == pytest.approx(0.0, abs=1e-9)
    assert datos_castillo["Altura"] == pytest.approx(2.60, abs=1e-9)


def test_losa_lado_este_mas_medio_da_13_5_m2() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 losa")
    nivel = nucleo.niveles()[0]["globalid"]
    losa = nucleo.losa_crear(
        nivel, [(0, 0), (4, 0), (4, 3), (0, 3)], 0.12
    )["creados"][0]
    assert _pset(nucleo, losa, "OPENRVT_Losa")["Area"] == pytest.approx(
        12.0, abs=1e-9
    )

    nucleo.elementos_empujar_cara(losa, [1, 0, 0], [4, 1.5, 0.06], 0.50)

    datos = _pset(nucleo, losa, "OPENRVT_Losa")
    # 4.50 × 3.00 = 13.50 m²
    assert datos["Area"] == pytest.approx(13.50, abs=1e-9)
    assert datos["Contorno"].startswith("POLYGON")


def test_generico_cara_mas_x_mas_025_da_1_25_m3() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 genérico")
    nivel = nucleo.niveles()[0]["globalid"]
    proxy = nucleo.generico_crear(
        nivel, [(0, 0), (1, 0), (1, 1), (0, 1)], 1.0
    )["creados"][0]
    assert _pset(nucleo, proxy, "OPENRVT_Generico")["Volumen"] == pytest.approx(
        1.000, abs=1e-9
    )

    nucleo.elementos_empujar_cara(proxy, [1, 0, 0], [1, 0.5, 0.5], 0.25)

    datos = _pset(nucleo, proxy, "OPENRVT_Generico")
    assert datos["AreaBase"] == pytest.approx(1.25, abs=1e-9)
    assert datos["Volumen"] == pytest.approx(1.250, abs=1e-9)
    cantidades = _cantidades(nucleo, proxy)
    assert cantidades["NetArea"].AreaValue == pytest.approx(1.25, abs=1e-9)
    assert cantidades["NetVolume"].VolumeValue == pytest.approx(1.250, abs=1e-9)


def test_deshacer_y_rehacer_son_un_solo_paso() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 deshacer")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = _muro(nucleo, nivel)
    antes = len(nucleo._deshacer)

    nucleo.elementos_empujar_cara(muro, [0, 0, 1], [2, 0, 2.6], 0.40)
    assert len(nucleo._deshacer) == antes + 1
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.0)

    nucleo.deshacer()
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(2.6)
    nucleo.rehacer()
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.0)


def test_el_empuje_se_detiene_en_0_05_y_lo_avisa() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 mínimo")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = _muro(nucleo, nivel)

    resultado = nucleo.elementos_empujar_cara(muro, [0, 0, 1], [2, 0, 2.6], -10.0)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(0.05, abs=1e-9)
    assert "0.05" in resultado["aviso"]


@pytest.mark.parametrize(
    "clase, normal, punto",
    [
        ("muro_lateral", [0, 1, 0], [2, 0.075, 1.3]),
        ("muro_inferior", [0, 0, -1], [2, 0, 0]),
        ("losa_superior", [0, 0, 1], [2, 1.5, 0.12]),
        ("losa_inferior", [0, 0, -1], [2, 1.5, 0]),
    ],
)
def test_las_caras_sin_efecto_no_cambian_el_modelo(clase, normal, punto) -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 sin efecto")
    nivel = nucleo.niveles()[0]["globalid"]
    if clase.startswith("muro"):
        gid = _muro(nucleo, nivel)
    else:
        gid = nucleo.losa_crear(
            nivel, [(0, 0), (4, 0), (4, 3), (0, 3)], 0.12
        )["creados"][0]
    antes = len(nucleo._deshacer)
    with pytest.raises(ErrorNucleo, match="El espesor lo da el tipo"):
        nucleo.elementos_empujar_cara(gid, normal, punto, 0.5)
    assert len(nucleo._deshacer) == antes


def test_otros_elementos_no_se_pueden_empujar() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O056 otros")
    nivel = nucleo.niveles()[0]["globalid"]
    zapata = nucleo.zapata_crear(
        "Z-1 Zapata 1.20×1.20", nivel, 0, 0, desplante=1.00
    )["creados"][0]
    antes = len(nucleo._deshacer)
    with pytest.raises(ErrorNucleo, match="No se puede empujar este elemento"):
        nucleo.elementos_empujar_cara(zapata, [1, 0, 0], [0, 0, 0], 0.5)
    assert len(nucleo._deshacer) == antes
