"""O068 — Ventana y Puerta con nivel de referencia (núcleo).

Valores a mano (spec O068, 17-nov-2026), niveles N0 = 0.00, N1 = 3.00,
N2 = 6.00 y un muro de 6 m de N0 a N2 (altura 6.00 sobre su base):

1. Ventana nivel=N1, antepecho 0.90, alto 1.20, ancho 1.20, distancia 2.00 →
   vano z = 3.00 + 0.90 = 3.90 a 3.90 + 1.20 = 5.10; x = 2.00 a 3.20.
2. Ventana nivel=N1, antepecho 2.50, alto 1.20 → 3.00 + 2.50 + 1.20 = 6.70,
   mayor que los 6.00 del muro → error y el modelo no cambia.
3. Editar antepecho 0.90 → 1.10 (siempre relativo a N1) → z = 4.10;
   Deshacer devuelve z = 3.90.
4. Editar distancia 2.00 → 4.50 → 4.50 + 1.20 = 5.70 ≤ 6.00, cabe;
   a 5.00 → 5.00 + 1.20 = 6.20 > 6.00, error.
5. Mover la ventana dx = 1.00 → distancia = 3.00.
6. Área neta del muro (6 × 6 = 36.00 m²) con la ventana de 1.20 × 1.20 =
   36.00 − 1.44 = 34.56 m².
7. El IFC guardado y reabierto valida sin errores.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.util.placement as placement
import ifcopenshell.validate
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> tuple[ModeloNucleo, str, str, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O068")
    n0 = nucleo.niveles()[0]["globalid"]
    # El muro se crea cuando su nivel inmediato superior ya es N2: así mide
    # N0→N2 (6.00 m). Crear N1 después no recorta el muro ya creado.
    n2 = nucleo.nivel_crear("Nivel 2", 6.00)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0.0, 0.0, 6.0, 0.0, altura=6.0)["creados"][0]
    n1 = nucleo.nivel_crear("Nivel 1", 3.00)["creados"][0]
    return nucleo, n0, n1, n2, muro


def _caja3(entidad) -> tuple[float, float, float, float, float, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, entidad)
    vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
    return (
        float(vertices[:, 0].min()),
        float(vertices[:, 0].max()),
        float(vertices[:, 1].min()),
        float(vertices[:, 1].max()),
        float(vertices[:, 2].min()),
        float(vertices[:, 2].max()),
    )


def _pset_vano(nucleo: ModeloNucleo, vano: str) -> dict:
    return nucleo._leer_pset(nucleo._entidad_por_gid(vano), "OPENRVT_Abertura")


def _vano_de_relleno(nucleo: ModeloNucleo, relleno: str) -> str:
    for rel in getattr(nucleo._entidad_por_gid(relleno), "FillsVoids", ()) or ():
        return rel.RelatingOpeningElement.GlobalId
    raise AssertionError("el relleno no llena ningún vano")


def _z_de_vano(nucleo: ModeloNucleo, vano: str) -> float:
    matriz = placement.get_local_placement(
        nucleo._entidad_por_gid(vano).ObjectPlacement
    )
    return float(matriz[2][3])


def _ventana(
    nucleo: ModeloNucleo,
    muro: str,
    nivel: str,
    distancia: float = 2.0,
    antepecho: float = 0.90,
) -> tuple[str, str]:
    creados = nucleo.abertura_crear(
        "IfcWindow", muro, distancia, 1.20, 1.20, antepecho, nivel=nivel
    )["creados"]
    return creados[0], creados[1]


# (1) -------------------------------------------------------------------------
def test_ventana_en_n1_queda_a_3_90_sobre_la_base_del_muro() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    vano, relleno = _ventana(nucleo, muro, n1)

    datos = _pset_vano(nucleo, vano)
    assert datos["Nivel"] == n1
    assert datos["Antepecho"] == pytest.approx(3.90, abs=1e-9)
    assert datos["AntepechoNivel"] == pytest.approx(0.90, abs=1e-9)
    assert datos["Distancia"] == pytest.approx(2.00, abs=1e-9)

    x0, x1, _y0, _y1, z0, z1 = _caja3(nucleo._entidad_por_gid(vano))
    assert (x0, x1) == (pytest.approx(2.00, abs=1e-6), pytest.approx(3.20, abs=1e-6))
    assert (z0, z1) == (pytest.approx(3.90, abs=1e-6), pytest.approx(5.10, abs=1e-6))
    # El relleno se coloca en el mismo z inferior real.
    assert _z_de_vano(nucleo, vano) == pytest.approx(3.90, abs=1e-9)
    assert _caja3(nucleo._entidad_por_gid(relleno))[4] == pytest.approx(3.90, abs=1e-6)


# (2) -------------------------------------------------------------------------
def test_ventana_que_se_sale_por_arriba_no_cambia_el_modelo() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    antes = nucleo.modelo.to_string()

    with pytest.raises(ErrorNucleo):
        nucleo.abertura_crear(
            "IfcWindow", muro, 2.0, 1.20, 1.20, 2.50, nivel=n1
        )

    assert nucleo.modelo.to_string() == antes
    assert list(nucleo.modelo.by_type("IfcWindow")) == []
    assert list(nucleo.modelo.by_type("IfcOpeningElement")) == []


# (3) -------------------------------------------------------------------------
def test_editar_antepecho_a_1_10_y_deshacer_vuelve_a_0_90() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    vano, relleno = _ventana(nucleo, muro, n1)

    nucleo.elemento_editar(relleno, {"antepecho": 1.10, "nivel": n1})
    assert _z_de_vano(nucleo, vano) == pytest.approx(4.10, abs=1e-9)
    datos = _pset_vano(nucleo, vano)
    assert datos["Antepecho"] == pytest.approx(4.10, abs=1e-9)
    assert datos["AntepechoNivel"] == pytest.approx(1.10, abs=1e-9)

    assert nucleo.deshacer()["hecho"] is True
    assert _z_de_vano(nucleo, vano) == pytest.approx(3.90, abs=1e-9)
    assert _pset_vano(nucleo, vano)["AntepechoNivel"] == pytest.approx(0.90, abs=1e-9)


# (4) -------------------------------------------------------------------------
def test_editar_distancia_cabe_a_4_50_y_falla_a_5_00() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    vano, relleno = _ventana(nucleo, muro, n1)

    nucleo.elemento_editar(relleno, {"distancia": 4.50})
    datos = _pset_vano(nucleo, vano)
    assert datos["Distancia"] == pytest.approx(4.50, abs=1e-9)
    assert _caja3(nucleo._entidad_por_gid(vano))[1] == pytest.approx(5.70, abs=1e-6)

    with pytest.raises(ErrorNucleo):
        nucleo.elemento_editar(relleno, {"distancia": 5.00})

    assert _pset_vano(nucleo, vano)["Distancia"] == pytest.approx(4.50, abs=1e-9)
    assert _caja3(nucleo._entidad_por_gid(vano))[1] == pytest.approx(5.70, abs=1e-6)


# (5) -------------------------------------------------------------------------
def test_mover_la_ventana_1_m_cambia_su_distancia_a_3_00() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    vano, relleno = _ventana(nucleo, muro, n1)

    nucleo.elementos_mover([relleno], 1.0, 0.0, 0.0)

    datos = _pset_vano(nucleo, vano)
    assert datos["Distancia"] == pytest.approx(3.00, abs=1e-9)
    # Mover no debe perder el nivel ni el antepecho relativo (ficha posterior).
    assert datos["Nivel"] == n1
    assert datos["AntepechoNivel"] == pytest.approx(0.90, abs=1e-9)
    assert _caja3(nucleo._entidad_por_gid(vano))[0] == pytest.approx(3.00, abs=1e-6)


# (6) -------------------------------------------------------------------------
def test_area_neta_del_muro_descuenta_la_ventana() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    _ventana(nucleo, muro, n1)

    info = next(
        e for e in nucleo.cantidades_estructura()["elementos"] if e["globalid"] == muro
    )
    assert info["area_neta_m2"] == pytest.approx(34.56, abs=1e-6)


# (7) -------------------------------------------------------------------------
def test_guardar_y_reabrir_con_validador_sin_errores(tmp_path: Path) -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    _ventana(nucleo, muro, n1)
    destino = tmp_path / "o068.ifc"
    nucleo.guardar(str(destino))

    reabierto = ifcopenshell.open(str(destino))

    class _Captura(logging.Handler):
        def __init__(self) -> None:
            super().__init__()
            self.errores: list[str] = []

        def emit(self, registro: logging.LogRecord) -> None:
            if registro.levelno >= logging.ERROR:
                self.errores.append(registro.getMessage())

    captura = _Captura()
    logger = logging.getLogger("o068-validate")
    logger.handlers = [captura]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False
    ifcopenshell.validate.validate(reabierto, logger)
    assert captura.errores == []

    ventana = reabierto.by_type("IfcWindow")[0]
    vano = ventana.FillsVoids[0].RelatingOpeningElement
    datos = ifcopenshell.util.element.get_psets(vano)["OPENRVT_Abertura"]
    assert datos["Antepecho"] == pytest.approx(3.90, abs=1e-9)
    assert datos["Nivel"] == n1


# Flujo completo por la puerta del servidor: el nivel viaja en los params.
def test_el_servidor_recibe_nivel_y_antepecho_relativo() -> None:
    nucleo, _n0, n1, _n2, muro = _nuevo()
    servidor = Servidor()
    servidor.modelo = nucleo
    respuesta = servidor.despachar(
        "aberturas.crear",
        {
            "clase": "IfcWindow",
            "muro": muro,
            "distancia": 2.0,
            "ancho": 1.20,
            "alto": 1.20,
            "antepecho": 0.90,
            "nivel": n1,
        },
    )
    vano = respuesta["creados"][0]
    datos = _pset_vano(nucleo, vano)
    assert datos["Nivel"] == n1
    assert datos["Antepecho"] == pytest.approx(3.90, abs=1e-9)
