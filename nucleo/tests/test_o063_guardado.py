"""O063 punto 1: guardado atómico del IFC con respaldo .bak."""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402


def _modelo_con_nivel(tmp_path: Path, nombre: str = "Nivel 0") -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("Casa O063")
    if nombre != "Nivel 0":
        nucleo.nivel_crear(nombre, 3.0)
    return nucleo


def test_guardar_sobre_un_archivo_deja_bak_identico_y_destino_legible(tmp_path: Path):
    nucleo = _modelo_con_nivel(tmp_path)
    destino = tmp_path / "casa.ifc"
    nucleo.guardar(str(destino))
    anterior = destino.read_bytes()

    # Se agrega un nivel y se guarda encima del mismo archivo.
    nucleo.nivel_crear("Nivel 1", 3.0)
    nucleo.guardar(str(destino))

    respaldo = tmp_path / "casa.ifc.bak"
    assert respaldo.is_file(), "debe quedar una copia .bak del archivo anterior"
    assert respaldo.read_bytes() == anterior

    reabierto = ifcopenshell.open(str(destino))
    nombres = {n.Name for n in reabierto.by_type("IfcBuildingStorey")}
    assert nombres == {"Nivel 0", "Nivel 1"}

    # El .bak sigue siendo el archivo viejo, sin el nivel nuevo.
    viejo = ifcopenshell.open(str(respaldo))
    assert {n.Name for n in viejo.by_type("IfcBuildingStorey")} == {"Nivel 0"}


def test_un_fallo_a_media_escritura_no_toca_el_destino(tmp_path: Path, monkeypatch):
    nucleo = _modelo_con_nivel(tmp_path)
    destino = tmp_path / "casa.ifc"
    nucleo.guardar(str(destino))
    anterior = destino.read_bytes()

    def falla(self, path, format=None, zipped=False):
        archivo = Path(path)
        archivo.write_bytes(b"ESCRITURA INCOMPLETA")
        raise OSError("disco lleno a media escritura")

    nucleo.nivel_crear("Nivel 2", 6.0)
    monkeypatch.setattr(ifcopenshell.file, "write", falla, raising=True)
    with pytest.raises(ErrorNucleo):
        nucleo.guardar(str(destino))

    assert destino.read_bytes() == anterior
    assert not (tmp_path / "casa.ifc.tmp").exists(), "el temporal debe borrarse"
    # El modelo sigue en memoria y con cambios, listo para reintentar.
    assert nucleo.con_cambios is True
