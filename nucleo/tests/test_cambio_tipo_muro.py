"""Reporte 2-nov: muro Block 12 con castillos cambiado a un 15 con aplanado y yeso.

El núcleo nuevo (0.15) se metía en los castillos, que seguían con el núcleo viejo
(0.12), y el cambio de tipo perdía la línea de ubicación del muro.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _muro_con_castillos(linea: str) -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("cambio de tipo")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear("Block 12", nivel, 0, 0, 4, 0, 2.6, "centro", linea)["creados"][0]
    nucleo.castillos_automaticos([muro], 3.0, None)
    return nucleo, muro


@pytest.mark.parametrize("ruta", ["panel", "cambiar_tipo"])
@pytest.mark.parametrize("linea", ["eje_nucleo", "cara_exterior", "cara_interior"])
def test_cambiar_a_15_con_acabados_agranda_castillos_y_conserva_linea(linea: str, ruta: str) -> None:
    from shapely.geometry import Polygon

    nucleo, muro = _muro_con_castillos(linea)
    if ruta == "panel":
        # Lo que hace Propiedades → Tipo (elementos.editar).
        nucleo.elemento_editar(muro, {"tipo": "Block 15 aplanado-yeso"})
    else:
        nucleo.elemento_cambiar_tipo(muro, "Block 15 aplanado-yeso")
    entidad = nucleo._entidad_por_gid(muro)
    datos = nucleo._datos_muro(entidad)
    assert datos["linea_ubicacion"] == linea
    castillos = list(nucleo.modelo.by_type("IfcColumn"))
    assert len(castillos) == 3
    for castillo in castillos:
        pset = nucleo._leer_pset(castillo, "OPENRVT_Estructura")
        # El castillo toma el núcleo del muro nuevo: 0.15, no 0.12.
        assert float(pset["H"]) == pytest.approx(0.15)
    # El núcleo del muro termina en las caras de los castillos: las huellas del
    # cuerpo no se traslapan con ningún castillo dentro del espesor del núcleo.
    huellas = [
        Polygon([nucleo._punto_local(datos, u, v) for u, v in h])
        for h in nucleo._huellas_muro(entidad, datos)
    ]
    from openrvt_nucleo import uniones

    for castillo in castillos:
        barra = nucleo._barra_de_elemento(castillo)
        recorte = Polygon(uniones.huella(barra))
        for huella in huellas:
            assert huella.intersection(recorte).area == pytest.approx(0.0, abs=1e-9)
    teselados = {e["globalid"] for e in nucleo.teselar(None)["elementos"]}
    assert {e["globalid"] for e in nucleo.elementos()} <= teselados
