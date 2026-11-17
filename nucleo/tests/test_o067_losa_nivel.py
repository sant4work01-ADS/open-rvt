"""O067: cambiar la losa de nivel y su desfase.

Valores a mano (spec O067, 2026-11-10):
- Niveles N0 0.00, N1 3.00, N2 6.00; losa 4 × 5 = 20.00 m², espesor 0.12.
- Losa en N0: z = 0.00 + 0 = 0.00. A N1 (desfase 0): z = 3.00.
- Desfase −0.05 sobre N1: z = 3.00 − 0.05 = 2.95.
- Nivel N1 movido a 3.50 con desfase −0.05: z = 3.50 − 0.05 = 3.45.
- Muro N1→N2 (3.00…6.00) bajo la losa movida a N2: la losa ocupa
  6.00 − 0.12 = 5.88…6.00, así que la regla O058 baja la corona del muro a
  5.88 (cara inferior de la losa).
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.util.placement as placement
import ifcopenshell.validate as validar
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402

RECTANGULO = [(0.0, 0.0), (4.0, 0.0), (4.0, 5.0), (0.0, 5.0)]
AREA = 20.00


def _nuevo() -> tuple[ModeloNucleo, str, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O067")
    n0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 3.00)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 6.00)["creados"][0]
    return nucleo, n0, n1, n2


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[2][3])


def _contenedor(nucleo: ModeloNucleo, gid: str) -> str:
    entidad = _entidad(nucleo, gid)
    for rel in getattr(entidad, "ContainedInStructure", ()) or ():
        estructura = getattr(rel, "RelatingStructure", None)
        if estructura is not None and estructura.is_a("IfcBuildingStorey"):
            return estructura.GlobalId
    return ""


def _losa_datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Losa")


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


# 1 --------------------------------------------------------------------------
def test_cambiar_losa_de_n0_a_n1_deja_contenedor_cota_area_y_desfase() -> None:
    nucleo, n0, n1, _n2 = _nuevo()
    losa = nucleo.losa_crear(n0, RECTANGULO, espesor=0.12)["creados"][0]
    assert (_contenedor(nucleo, losa), _z(nucleo, losa)) == (n0, 0.00)

    nucleo.elemento_editar(losa, {"nivel": n1})

    assert _contenedor(nucleo, losa) == n1
    assert _z(nucleo, losa) == pytest.approx(3.00, abs=1e-9)
    datos = _losa_datos(nucleo, losa)
    assert datos["Area"] == pytest.approx(AREA, abs=1e-9)
    assert float(datos["Desfase"] or 0.0) == pytest.approx(0.00, abs=1e-9)
    # El panel no adivina el nivel: el núcleo entrega su GlobalId.
    assert nucleo.propiedades(losa)["nivel_globalid"] == n1


# 2 --------------------------------------------------------------------------
def test_desfase_negativo_baja_la_losa_sin_cambiar_de_nivel() -> None:
    nucleo, _n0, n1, _n2 = _nuevo()
    losa = nucleo.losa_crear(n1, RECTANGULO, espesor=0.12)["creados"][0]
    assert _z(nucleo, losa) == pytest.approx(3.00, abs=1e-9)

    nucleo.elemento_editar(losa, {"desfase": -0.05})

    assert _z(nucleo, losa) == pytest.approx(2.95, abs=1e-9)
    assert _contenedor(nucleo, losa) == n1
    assert float(_losa_datos(nucleo, losa)["Desfase"]) == pytest.approx(-0.05, abs=1e-9)


# 3 --------------------------------------------------------------------------
def test_deshacer_dos_veces_regresa_nivel_y_cota() -> None:
    nucleo, n0, n1, _n2 = _nuevo()
    losa = nucleo.losa_crear(n0, RECTANGULO, espesor=0.12)["creados"][0]

    nucleo.elemento_editar(losa, {"nivel": n1})
    nucleo.elemento_editar(losa, {"desfase": -0.05})
    assert _z(nucleo, losa) == pytest.approx(2.95, abs=1e-9)

    assert nucleo.deshacer()["hecho"] is True
    assert nucleo.deshacer()["hecho"] is True

    assert _contenedor(nucleo, losa) == n0
    assert _z(nucleo, losa) == pytest.approx(0.00, abs=1e-9)
    assert float(_losa_datos(nucleo, losa)["Desfase"] or 0.0) == pytest.approx(
        0.00, abs=1e-9
    )


# 4 --------------------------------------------------------------------------
def test_cantidades_por_nivel_cuentan_la_losa_donde_esta() -> None:
    nucleo, n0, n1, _n2 = _nuevo()
    losa = nucleo.losa_crear(n0, RECTANGULO, espesor=0.12)["creados"][0]

    en_n0 = {e["globalid"] for e in nucleo.cantidades_estructura(nivel=n0)["elementos"]}
    assert losa in en_n0

    nucleo.elemento_editar(losa, {"nivel": n1})

    en_n0 = {e["globalid"] for e in nucleo.cantidades_estructura(nivel=n0)["elementos"]}
    en_n1 = {e["globalid"] for e in nucleo.cantidades_estructura(nivel=n1)["elementos"]}
    assert losa not in en_n0
    assert losa in en_n1


# 5 --------------------------------------------------------------------------
def test_muro_n1_n2_queda_cubierto_por_la_losa_movida_a_n2() -> None:
    nucleo, n0, n1, n2 = _nuevo()
    muro = nucleo.muro_crear("Block 15", n1, 0.0, 0.0, 4.0, 0.0, altura=3.0)[
        "creados"
    ][0]
    nucleo.restricciones_editar(muro, nivel_base=n1, nivel_tope=n2)
    assert _caja(nucleo, muro)[5] == pytest.approx(6.00, abs=1e-9)

    losa = nucleo.losa_crear(n0, RECTANGULO, espesor=0.12)["creados"][0]
    nucleo.elemento_editar(losa, {"nivel": n2})

    # O058: la losa 5.88…6.00 toca la corona nominal 6.00; el muro baja a 5.88.
    _x0, _x1, _y0, _y1, z0, z1 = _caja(nucleo, muro)
    assert (z0, z1) == pytest.approx((3.00, 5.88), abs=1e-9)
    assert (_contenedor(nucleo, losa), _z(nucleo, losa)) == (n2, 6.00)


# 6 --------------------------------------------------------------------------
def test_nivel_inexistente_y_desfase_no_numerico_no_tocan_el_modelo() -> None:
    nucleo, n0, n1, _n2 = _nuevo()
    losa = nucleo.losa_crear(n0, RECTANGULO, espesor=0.12)["creados"][0]

    with pytest.raises(ErrorNucleo) as error:
        nucleo.elemento_editar(losa, {"nivel": "NIVEL-QUE-NO-EXISTE"})
    assert error.value.codigo == -32602
    assert error.value.mensaje
    assert (_contenedor(nucleo, losa), _z(nucleo, losa)) == (n0, 0.00)

    with pytest.raises(ErrorNucleo) as error:
        nucleo.elemento_editar(losa, {"nivel": n1, "desfase": "no-es-numero"})
    assert error.value.codigo == -32602
    assert (_contenedor(nucleo, losa), _z(nucleo, losa)) == (n0, 0.00)


# 7 --------------------------------------------------------------------------
def test_mover_el_nivel_arrastra_la_losa_con_su_desfase() -> None:
    nucleo, _n0, n1, _n2 = _nuevo()
    losa = nucleo.losa_crear(n1, RECTANGULO, espesor=0.12)["creados"][0]
    nucleo.elemento_editar(losa, {"desfase": -0.05})
    assert _z(nucleo, losa) == pytest.approx(2.95, abs=1e-9)

    nucleo.nivel_editar(n1, elevacion=3.50)

    assert _z(nucleo, losa) == pytest.approx(3.45, abs=1e-9)
    assert _contenedor(nucleo, losa) == n1


# 8 --------------------------------------------------------------------------
def test_ifc_guardado_del_flujo_valida_sin_errores() -> None:
    nucleo, _n0, n1, n2 = _nuevo()
    losa = nucleo.losa_crear(n1, RECTANGULO, espesor=0.12)["creados"][0]
    nucleo.elemento_editar(losa, {"nivel": n2})
    nucleo.elemento_editar(losa, {"desfase": -0.05})

    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "o067.ifc"
        nucleo.guardar(str(ruta))
        logger = validar.json_logger()
        validar.validate(ifcopenshell.open(str(ruta)), logger)
        assert logger.statements == []

        reabierto = ModeloNucleo()
        reabierto.abrir(str(ruta))
        assert _contenedor(reabierto, losa) == n2
        assert _z(reabierto, losa) == pytest.approx(5.95, abs=1e-9)
