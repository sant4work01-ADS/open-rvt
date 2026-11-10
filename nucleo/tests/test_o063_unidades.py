"""O063 punto 5: abrir un IFC que no está en metros se rechaza con mensaje claro."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

import ifcopenshell.api.unit as unit  # noqa: E402

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402


def test_ifc_en_milimetros_se_rechaza_con_la_unidad_en_el_mensaje(tmp_path: Path):
    autor = ModeloNucleo()
    autor.nuevo("Milímetros O063")
    unit.assign_unit(
        autor.modelo,
        length={"is_metric": True, "raw": "MILLIMETERS"},
        area={"is_metric": True, "raw": "SQUARE_MILLIMETERS"},
        volume={"is_metric": True, "raw": "CUBIC_MILLIMETERS"},
    )
    archivo = tmp_path / "milimetros.ifc"
    autor.guardar(str(archivo))

    lector = ModeloNucleo()
    with pytest.raises(ErrorNucleo) as fallo:
        lector.abrir(str(archivo))
    assert fallo.value.codigo == -32030
    assert "El archivo está en milímetros" in fallo.value.mensaje
    assert "solo abre IFC en metros" in fallo.value.mensaje
    assert lector.modelo is None


def test_ifc_en_metros_se_abre_como_antes(tmp_path: Path):
    autor = ModeloNucleo()
    autor.nuevo("Metros O063")
    autor.nivel_crear("Nivel 1", 3.0)
    archivo = tmp_path / "metros.ifc"
    autor.guardar(str(archivo))

    lector = ModeloNucleo()
    info = lector.abrir(str(archivo))
    assert info["esquema"] == "IFC4"
    assert [n["nombre"] for n in lector.niveles()] == ["Nivel 0", "Nivel 1"]
