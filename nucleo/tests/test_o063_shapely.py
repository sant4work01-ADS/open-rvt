"""O063 punto 7: shapely declarada e incluida en el Python del instalador."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def test_shapely_esta_en_las_dependencias_del_nucleo():
    with open(RAIZ / "nucleo" / "pyproject.toml", "rb") as archivo:
        datos = tomllib.load(archivo)
    dependencias = datos["project"]["dependencies"]
    assert "shapely==2.2.0" in dependencias


def test_el_instalador_embebe_shapely():
    guion = (RAIZ / "herramientas" / "preparar_python.sh").read_text(encoding="utf-8")
    assert '"shapely==' in guion
    # Y el intérprete que corre las pruebas la importa de verdad.
    import shapely

    assert shapely.__version__.startswith("2.")
