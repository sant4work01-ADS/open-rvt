"""O046: sólido genérico del prototipo Empujar/Tirar.

Valores calculados a mano: un rectángulo de 2 × 3 m con altura 1.5 m tiene
área de base 2 × 3 = 6.000 m² y volumen 6 × 1.5 = 9.000 m³.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402


def _proxy(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcBuildingElementProxy") if e.GlobalId == gid)


def _cantidades(proxy) -> dict:
    for relacion in getattr(proxy, "IsDefinedBy", ()) or ():
        if not relacion.is_a("IfcRelDefinesByProperties"):
            continue
        definicion = relacion.RelatingPropertyDefinition
        if definicion is not None and definicion.is_a("IfcElementQuantity"):
            return {c.Name: c for c in definicion.Quantities or ()}
    return {}


def test_generico_2x3x1_5_da_9_m3_y_6_m2_y_queda_en_el_nivel() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O046 genérico")
    nivel = nucleo.niveles()[0]["globalid"]
    resultado = nucleo.generico_crear(
        nivel,
        [(0, 0), (2, 0), (2, 3), (0, 3)],
        1.5,
    )
    gid = resultado["creados"][0]
    proxy = _proxy(nucleo, gid)
    assert proxy.is_a("IfcBuildingElementProxy")
    assert proxy.Name == "Genérico"
    assert proxy.PredefinedType == "ELEMENT"

    cantidades = _cantidades(proxy)
    assert cantidades["NetArea"].AreaValue == pytest.approx(6.000, abs=1e-9)
    assert cantidades["NetVolume"].VolumeValue == pytest.approx(9.000, abs=1e-9)

    # El sólido está contenido en el nivel activo.
    contenedores = [
        rel.RelatingStructure.GlobalId
        for rel in getattr(proxy, "ContainedInStructure", ()) or ()
    ]
    assert contenedores == [nivel]

    # La extrusión es un IfcExtrudedAreaSolid con la profundidad pedida.
    solido = proxy.Representation.Representations[0].Items[0]
    assert solido.is_a("IfcExtrudedAreaSolid")
    assert float(solido.Depth) == pytest.approx(1.5, abs=1e-9)
    assert tuple(float(v) for v in solido.ExtrudedDirection.DirectionRatios) == (0.0, 0.0, 1.0)

    datos = nucleo._leer_pset(proxy, "OPENRVT_Generico")
    assert float(datos["AreaBase"]) == pytest.approx(6.000, abs=1e-9)
    assert float(datos["Volumen"]) == pytest.approx(9.000, abs=1e-9)


def test_deshacer_quita_el_generico_completo() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O046 deshacer")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.generico_crear(nivel, [(0, 0), (2, 0), (2, 3), (0, 3)], 1.5)["creados"][0]
    assert nucleo.modelo.by_guid(gid) is not None
    nucleo.deshacer()
    assert all(e.GlobalId != gid for e in nucleo.modelo.by_type("IfcBuildingElementProxy"))
    nucleo.rehacer()
    assert nucleo.modelo.by_guid(gid) is not None


def test_altura_negativa_extruye_hacia_abajo_del_nivel() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O046 bajo")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.generico_crear(nivel, [(0, 0), (2, 0), (2, 2), (0, 2)], -1.5)["creados"][0]
    proxy = _proxy(nucleo, gid)
    solido = proxy.Representation.Representations[0].Items[0]
    assert float(solido.Depth) == pytest.approx(1.5, abs=1e-9)
    assert tuple(float(v) for v in solido.ExtrudedDirection.DirectionRatios) == (0.0, 0.0, -1.0)
    assert _cantidades(proxy)["NetVolume"].VolumeValue == pytest.approx(6.0, abs=1e-9)


@pytest.mark.parametrize(
    "puntos, altura, mensaje",
    [
        ([(0, 0), (2, 0)], 1.0, "al menos tres vértices"),
        ([(0, 0), (0, 0), (0, 0)], 1.0, "área cero"),
        ([(0, 0), (2, 0), (2, 3), (0, 3)], 0.0, "distinta de cero"),
    ],
)
def test_contorno_o_altura_invalidos_no_cambian_el_modelo(puntos, altura, mensaje) -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O046 inválido")
    nivel = nucleo.niveles()[0]["globalid"]
    antes = len(nucleo._deshacer)
    with pytest.raises(ErrorNucleo, match=mensaje):
        nucleo.generico_crear(nivel, puntos, altura)
    assert len(nucleo._deshacer) == antes
    assert nucleo.modelo.by_type("IfcBuildingElementProxy") == ()
