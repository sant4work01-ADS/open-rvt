"""O070: los paneles de la pantalla dividida se guardan en OPENRVT_Vistas.

Valores a mano: pantalla dividida en vertical, separador al 70 % (0.70), panel 0
en «planta-n0» y panel 1 en «iso»; al reabrir el IFC debe leerse lo mismo sin
tocar la lista de vistas guardada en la propiedad «Datos».
"""

from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O070")
    return nucleo


def test_paneles_se_guardan_y_releen_del_pset_de_vistas(tmp_path: Path):
    nucleo = _nuevo()
    paneles = {
        "dividida": True,
        "orientacion": "vertical",
        "proporcion": 0.7,
        "paneles": [{"vistaId": "planta-n0"}, {"vistaId": "iso"}],
        "panelActivo": 1,
    }
    nucleo.guardar_paneles(paneles)
    assert nucleo.leer_paneles() == paneles

    destino = tmp_path / "paneles.ifc"
    nucleo.guardar(str(destino))
    otro = ModeloNucleo()
    otro.abrir(str(destino))
    assert otro.leer_paneles() == paneles


def test_las_vistas_y_los_paneles_conviven_en_el_mismo_pset():
    nucleo = _nuevo()
    vistas = [
        {"id": "planta-n0", "nombre": "Planta Nivel 0", "tipo": "planta"},
        {"id": "iso", "nombre": "3D Isométrica", "tipo": "iso"},
    ]
    paneles = {
        "dividida": True,
        "orientacion": "horizontal",
        "proporcion": 0.5,
        "paneles": [{"vistaId": "planta-n0"}, {"vistaId": "iso"}],
        "panelActivo": 0,
    }
    nucleo.guardar_vistas(vistas)
    nucleo.guardar_paneles(paneles)
    # Guardar de nuevo las vistas no borra la propiedad de los paneles.
    nucleo.guardar_vistas(vistas)
    assert nucleo.leer_vistas() == vistas
    assert nucleo.leer_paneles() == paneles


def test_sin_paneles_guardados_se_devuelve_none_y_tipo_invalido_falla():
    nucleo = _nuevo()
    assert nucleo.leer_paneles() is None
    try:
        nucleo.guardar_paneles(["no", "es", "objeto"])
    except Exception as error:  # noqa: BLE001 - el servidor usa ErrorNucleo
        assert getattr(error, "codigo", None) == -32602
    else:  # pragma: no cover - si acepta la lista, la prueba debe fallar
        raise AssertionError("guardar_paneles aceptó una lista")
    assert nucleo.leer_paneles() is None


def test_el_servidor_expone_paneles_leer_y_guardar(tmp_path: Path):
    from openrvt_nucleo.servidor import Servidor  # noqa: PLC0415

    nucleo = _nuevo()
    servidor = Servidor()
    servidor.modelo = nucleo  # noqa: SLF001 - prueba interna del despacho
    paneles = {
        "dividida": False,
        "orientacion": "vertical",
        "proporcion": 0.5,
        "paneles": [{"vistaId": "planta-n0"}, {"vistaId": None}],
        "panelActivo": 0,
    }
    assert servidor.despachar("paneles.guardar", {"datos": paneles}) == paneles
    assert servidor.despachar("paneles.leer", {}) == paneles
