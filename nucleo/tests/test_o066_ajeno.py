"""O066 punto 2: abrir un IFC ajeno no modifica nada hasta crear con OPEN-RVT.

El original y el archivo guardado sin editar deben tener exactamente el mismo
número de entidades de cada clase y ningún IfcMaterial nuevo.  Al crear el
primer muro se siembran biblioteca y tipos; un solo deshacer devuelve el conteo
original (la siembra va dentro de la misma instantánea del comando).
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import ifcopenshell
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

FZK = RAIZ / "muestras" / "AC20-FZK-Haus.ifc"


def _conteos(modelo) -> Counter[str]:
    return Counter(entidad.is_a() for entidad in modelo)


def _materiales(modelo) -> set[tuple[str, str]]:
    return {
        (m.Name or "", m.Description or "")
        for m in modelo.by_type("IfcMaterial")
    }


def _nivel(nucleo: ModeloNucleo):
    niveles = nucleo.niveles()
    assert niveles, "FZK debe traer al menos un nivel"
    return niveles[0]["globalid"]


def test_abrir_y_guardar_un_ajeno_no_cambia_ninguna_entidad(tmp_path: Path) -> None:
    original = ifcopenshell.open(str(FZK))
    antes = _conteos(original)
    materiales_antes = _materiales(original)

    nucleo = ModeloNucleo()
    info = nucleo.abrir(str(FZK))
    assert info["ajeno"] is True

    destino = tmp_path / "fzk-sin-editar.ifc"
    nucleo.guardar(str(destino))

    guardado = ifcopenshell.open(str(destino))
    assert _conteos(guardado) == antes
    assert _materiales(guardado) == materiales_antes
    assert not any(
        (p.Name or "").startswith("OPENRVT_") for p in guardado.by_type("IfcPropertySet")
    )


def test_crear_muro_siembra_y_un_deshacer_vuelve_al_ajeno(tmp_path: Path) -> None:
    original = ifcopenshell.open(str(FZK))
    antes = _conteos(original)
    materiales_antes = _materiales(original)

    nucleo = ModeloNucleo()
    nucleo.abrir(str(FZK))
    assert nucleo.ajeno is True

    nucleo.muro_crear("Block 15", _nivel(nucleo), 0.0, 0.0, 4.0, 0.0)
    despues = _conteos(nucleo.modelo)
    assert despues["IfcWall"] == antes["IfcWall"] + 1
    assert despues["IfcMaterial"] > antes["IfcMaterial"]
    assert despues["IfcWallType"] > antes["IfcWallType"]
    assert any(
        (p.Name or "").startswith("OPENRVT_")
        for p in nucleo.modelo.by_type("IfcPropertySet")
    )

    nucleo.deshacer()
    assert _conteos(nucleo.modelo) == antes
    assert _materiales(nucleo.modelo) == materiales_antes


def test_un_propio_sigue_sembrando_al_abrir(tmp_path: Path) -> None:
    creador = ModeloNucleo()
    creador.nuevo("O066 propio")
    creador.muro_crear("Block 15", _nivel(creador), 0.0, 0.0, 3.0, 0.0)
    ruta = tmp_path / "propio.ifc"
    creador.guardar(str(ruta))

    otro = ModeloNucleo()
    info = otro.abrir(str(ruta))
    assert info["ajeno"] is False
    assert any(
        p.is_a("IfcPropertySet") and (p.Name or "").startswith("OPENRVT_")
        for p in otro.modelo
    )


def test_es_ifc_ajeno_exige_pset_openrvt_y_aplicacion_propia() -> None:
    from openrvt_nucleo.ajeno import es_ifc_ajeno

    propio = ifcopenshell.open(str(FZK))
    assert es_ifc_ajeno(propio) is True

    # Un pset OPENRVT_* basta para dejar de ser ajeno.
    pset = propio.create_entity(
        "IfcPropertySet",
        GlobalId=ifcopenshell.guid.new(),
        OwnerHistory=None,
        Name="OPENRVT_Muro",
        Description=None,
        HasProperties=[],
    )
    assert es_ifc_ajeno(propio) is False
    propio.remove(pset)

    # Una IfcApplication de OPEN-RVT también.
    aplicacion = propio.create_entity(
        "IfcApplication",
        ApplicationDeveloper=None,
        Version="1.0",
        ApplicationFullName="OPEN-RVT",
        ApplicationIdentifier="openrvt",
    )
    assert es_ifc_ajeno(propio) is False
    propio.remove(aplicacion)
    assert es_ifc_ajeno(propio) is True
