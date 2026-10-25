"""Pruebas de edición O001b. Correr con:
    ~/.venvs/openrvt/bin/python -m pytest evaluacion/test_editar.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom as geom
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from a_editar import (  # noqa: E402
    MURO_ESTE,
    MURO_NORTE,
    MURO_OESTE,
    MURO_SUR,
    comprobar_grosor,
    crear_modelo,
    editar_modelo,
    validar_con_ifcopenshell,
)
from geometria import volumen_malla  # noqa: E402

# Volúmenes esperados tras la edición, con uniones a eje y espesor 0.20 m.
VOLUMEN_SUR = (9.0 * 3.0 - 0.90 * 2.10) * 0.20  # 5.022 m³
VOLUMEN_NORTE = 9.0 * 3.0 * 0.20  # 5.400 m³
VOLUMEN_ESTE = 6.0 * 3.0 * 0.20  # 3.600 m³
VOLUMEN_OESTE = 6.0 * 3.0 * 0.20  # 3.600 m³


@pytest.fixture(scope="module")
def editado(tmp_path_factory):
    modelo, ids = crear_modelo()
    editar_modelo(modelo, ids)
    ruta = tmp_path_factory.mktemp("o001b") / "edicion_a.ifc"
    modelo.write(str(ruta))
    return modelo, ids, ruta


def _volumenes(ruta):
    modelo = ifcopenshell.open(str(ruta))
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    ajustes.set(ajustes.WELD_VERTICES, True)
    mallas = {}
    it = geom.iterator(ajustes, modelo)
    if it.initialize():
        while True:
            forma = it.get()
            mallas[forma.id] = (list(forma.geometry.verts), list(forma.geometry.faces))
            if not it.next():
                break
    return {muro.Name: volumen_malla(*mallas[muro.id()]) for muro in modelo.by_type("IfcWall")}


def test_conteos_exactos(editado):
    modelo, _ids, _ruta = editado
    assert len(modelo.by_type("IfcWall")) == 4
    assert len(modelo.by_type("IfcSlab")) == 1
    assert len(modelo.by_type("IfcDoor")) == 1
    assert len(modelo.by_type("IfcOpeningElement")) == 1


def test_relaciones_de_vano_y_relleno(editado):
    modelo, ids, _ruta = editado
    assert len(modelo.by_type("IfcRelVoidsElement")) == 1
    assert len(modelo.by_type("IfcRelFillsElement")) == 1
    assert ids["vano"].VoidsElements[0].RelatingBuildingElement == ids["muros"][MURO_SUR]
    assert ids["puerta"].FillsVoids[0].RelatingOpeningElement == ids["vano"]


def test_volumen_muro_sur_dentro_del_1_por_ciento(editado):
    _modelo, _ids, ruta = editado
    volumenes = _volumenes(ruta)
    assert volumenes["Muro Sur"] == pytest.approx(VOLUMEN_SUR, rel=0.01)


def test_volumenes_de_los_demas_muros(editado):
    _modelo, _ids, ruta = editado
    volumenes = _volumenes(ruta)
    assert volumenes["Muro Norte"] == pytest.approx(VOLUMEN_NORTE, rel=0.01)
    assert volumenes["Muro Este"] == pytest.approx(VOLUMEN_ESTE, rel=0.01)
    assert volumenes["Muro Oeste"] == pytest.approx(VOLUMEN_OESTE, rel=0.01)


def test_el_tipo_propaga_el_espesor_a_los_cuatro_muros(editado):
    modelo, ids, _ruta = editado
    assert comprobar_grosor(modelo, ids, 0.20)["ok"] is True
    assert modelo.by_type("IfcWallType")[0].Name == "Block 15"
    assert ids["capa"].LayerThickness == pytest.approx(0.20, abs=1e-9)


def test_el_ifc_es_ifc4_y_valida_sin_errores(editado):
    _modelo, _ids, ruta = editado
    assert ifcopenshell.open(str(ruta)).schema == "IFC4"
    resultado = validar_con_ifcopenshell(ruta)
    assert resultado["errores"] == 0
    assert resultado["ok"] is True


def test_geometria_del_muro_sur_tiene_el_ajuste_de_ejes(editado):
    """El sur va de (0,0) a (9,0) y el este de (9,0) a (9,6)."""
    _modelo, ids, _ruta = editado
    sur = ids["muros"][MURO_SUR]
    este = ids["muros"][MURO_ESTE]
    norte = ids["muros"][MURO_NORTE]
    oeste = ids["muros"][MURO_OESTE]
    assert sur.ObjectPlacement.RelativePlacement.Location.Coordinates == pytest.approx((0.0, 0.0, 0.0))
    assert este.ObjectPlacement.RelativePlacement.Location.Coordinates == pytest.approx((9.0, 0.0, 0.0))
    assert norte.ObjectPlacement.RelativePlacement.Location.Coordinates == pytest.approx((9.0, 6.0, 0.0))
    assert oeste.ObjectPlacement.RelativePlacement.Location.Coordinates == pytest.approx((0.0, 6.0, 0.0))
    cuerpo = next(r for r in sur.Representation.Representations if r.RepresentationIdentifier == "Body")
    assert cuerpo.Items[0].SweptArea.OuterCurve.Points.CoordList[2][0] == pytest.approx(9.0)
