"""Pruebas de O006e: esquinas de muros recortadas y referencias de ejes al día."""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _volumenes(nucleo: ModeloNucleo, clase: str = "IfcWall") -> dict[str, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    salida: dict[str, float] = {}
    while True:
        forma = iterador.get()
        entidad = nucleo.modelo.by_id(forma.id)
        if entidad.is_a(clase):
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            volumen = sum(
                float(np.dot(vertices[c[0]], np.cross(vertices[c[1]], vertices[c[2]]))) / 6.0
                for c in caras
            )
            salida[entidad.GlobalId] = salida.get(entidad.GlobalId, 0.0) + volumen
        if not iterador.next():
            break
    return salida


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O006e")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _espesor(nucleo: ModeloNucleo, tipo: str) -> float:
    return next(t["espesor"] for t in nucleo.tipos_listar("IfcWallType") if t["nombre"] == tipo)


@pytest.mark.parametrize("tipo", ["Block 15", "Block 15 aplanado-yeso"])
def test_esquina_en_l_recorta_los_dos_muros_y_suma_su_volumen(tipo: str) -> None:
    nucleo, nivel = _nuevo()
    muros = [
        nucleo.muro_crear(tipo, nivel, 0, 0, 4, 0, altura=2.60)["creados"][0],
        nucleo.muro_crear(tipo, nivel, 4, 0, 4, 3, altura=2.60)["creados"][0],
    ]
    volumenes = _volumenes(nucleo)
    assert set(volumenes) == set(muros)
    espesor = _espesor(nucleo, tipo)
    esperado = (4 + 3 - espesor) * espesor * 2.60
    assert sum(volumenes.values()) == pytest.approx(esperado, abs=0.001)
    # Los dos cuerpos se recortan: ninguno conserva el volumen rectangular completo.
    assert volumenes[muros[0]] < 4 * espesor * 2.60
    assert volumenes[muros[1]] < 3 * espesor * 2.60
    uniones = nucleo.modelo.by_type("IfcRelConnectsPathElements")
    assert len(uniones) == 1


@pytest.mark.parametrize("tipo", ["Block 15", "Block 15 aplanado-yeso"])
@pytest.mark.parametrize("forma", ["T", "X"])
def test_union_en_t_y_x_sin_doble_conteo(tipo: str, forma: str) -> None:
    nucleo, nivel = _nuevo()
    if forma == "T":
        nucleo.muro_crear(tipo, nivel, 0, 0, 8, 0, altura=2.60)
        nucleo.muro_crear(tipo, nivel, 4, 0, 4, 3, altura=2.60)
    else:
        # Cruce en X: dos muros continuos que se atraviesan.
        nucleo.muro_crear(tipo, nivel, 0, 4, 8, 4, altura=2.60)
        nucleo.muro_crear(tipo, nivel, 4, 0, 4, 8, altura=2.60)
    volumenes = _volumenes(nucleo)
    espesor = _espesor(nucleo, tipo)
    assert len(volumenes) == 2
    assert all(volumen > 0 for volumen in volumenes.values())
    if forma == "T":
        # El pasante conserva su volumen; el que llega se recorta en la cara.
        completo = 8 * espesor * 2.60 + 3 * espesor * 2.60
        assert sum(volumenes.values()) < completo - 0.001
        assert sum(volumenes.values()) > 8 * espesor * 2.60
        assert len(nucleo.modelo.by_type("IfcRelConnectsPathElements")) == 1
    else:
        assert nucleo.validar() == []
        # En un cruce continuo ambos muros conservan su longitud completa.
        assert len(nucleo.modelo.by_type("IfcRelConnectsPathElements")) == 0


def test_extremo_a_cinco_centimetros_del_eje_se_une() -> None:
    nucleo, nivel = _nuevo()
    pasante = nucleo.muro_crear("Block 15", nivel, 0, 0, 8, 0)["creados"][0]
    llega = nucleo.muro_crear("Block 15", nivel, 4, 0.05, 4, 3.05)["creados"][0]
    datos = nucleo._datos_muro(nucleo._entidad_por_gid(llega))
    assert datos["y1"] == pytest.approx(0.0, abs=1e-9)
    pares = {
        frozenset((r.RelatingElement.GlobalId, r.RelatedElement.GlobalId))
        for r in nucleo.modelo.by_type("IfcRelConnectsPathElements")
    }
    assert frozenset((pasante, llega)) in pares
    volumenes = _volumenes(nucleo)
    assert all(volumen > 0 for volumen in volumenes.values())


def test_las_intersecciones_se_recalculan_al_mover_un_eje() -> None:
    nucleo, _nivel = _nuevo()
    vertical = nucleo.eje_crear("", 0, 0, 0, 6)["creados"][0]
    nucleo.eje_crear("", 4, 0, 4, 6)
    nucleo.eje_crear("", 0, 0, 8, 0)
    antes = nucleo.referencias()["intersecciones"]
    assert [0.0, 0.0] in antes and [4.0, 0.0] in antes
    nucleo.ejes_mover(vertical, 1.0)
    despues = nucleo.referencias()["intersecciones"]
    assert [0.0, 0.0] not in despues
    # El cruce se recalcula en la posición nueva, sea a un lado u otro.
    assert any(punto[1] == 0.0 and abs(abs(punto[0]) - 1.0) < 1e-9 for punto in despues)
    assert [4.0, 0.0] in despues
