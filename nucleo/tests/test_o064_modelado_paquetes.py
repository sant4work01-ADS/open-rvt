"""O064: el paquete ``modelado`` conserva la interfaz y ya no es un archivo gigante."""

from __future__ import annotations

import ast
import pathlib

import openrvt_nucleo.modelado as modelado
from openrvt_nucleo.modelado import (
    PSET_RESTRICCIONES,
    TOLERANCIA_CALCULO,
    ModeladoMixin,
    _gid,
    _nombre,
    _poligono_area,
    _texto,
    altura_restringida,
)

CARPETA = pathlib.Path(modelado.__file__).parent
TOPE = 1000


def test_reexporta_los_nombres_que_importan_los_demas_modulos():
    assert PSET_RESTRICCIONES == "OPENRVT_Restricciones"
    assert TOLERANCIA_CALCULO == 1e-6


def test_altura_restringida_conserva_el_calculo_de_O016():
    # Base 0.15 m sobre el nivel, tope en 2.85 m: altura 2.70 m (a mano).
    assert altura_restringida(0.0, 0.15, 2.25, 0.60, None) == (0.15, 2.70)
    # Sin tope usa la altura fija.
    assert altura_restringida(1.0, 0.0, None, 0.0, 2.5) == (1.0, 2.5)


def test_helpers_de_entidad_siguen_siendo_puros():
    # Cuadrado unitario: área 1.0 (a mano).
    assert _poligono_area([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]) == 1.0
    assert _gid(None) == ""
    assert _nombre(None) == ""
    assert _texto(None) == ""


def test_todos_los_py_del_paquete_respetan_el_tope_de_O064():
    archivos = sorted(CARPETA.glob("*.py"))
    assert len(archivos) >= 10
    for archivo in archivos:
        with archivo.open(encoding="utf-8") as manejador:
            lineas = sum(1 for _ in manejador)
        assert lineas <= TOPE, f"{archivo.name} tiene {lineas} líneas"


def test_modelado_mixin_se_arma_con_los_mixins_tematicos():
    mro = {clase.__name__ for clase in ModeladoMixin.__mro__}
    for tema in (
        "MuroPielMixin",
        "MurosMixin",
        "LosasMixin",
        "AberturasMixin",
        "EstructuraCrearMixin",
        "NivelesMixin",
        "EjesMixin",
        "TiposMixin",
        "ReferenciasMixin",
    ):
        assert tema in mro, f"falta {tema}"


def test_conserva_las_operaciones_publicas_de_cada_tema():
    for nombre in (
        "muro_crear",
        "losa_crear",
        "generico_crear",
        "abertura_crear",
        "columna_crear",
        "viga_crear",
        "zapata_crear",
        "nivel_crear",
        "eje_crear",
        "nota_crear",
        "elementos_copiar",
        "elementos_borrar",
        "elementos_mover",
        "elemento_editar",
        "referencias",
        "validar",
    ):
        assert callable(getattr(ModeladoMixin, nombre))


def test_cada_import_from_modelado_de_los_otros_modulos_resuelve():
    paquete = CARPETA.parent
    def es_modelado(nodo):
        return (nodo.level == 1 and nodo.module == "modelado") or nodo.module == "openrvt_nucleo.modelado"
    revisados = 0
    for archivo in sorted(paquete.glob("*.py")):
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.ImportFrom) and es_modelado(nodo):
                revisados += 1
                for alias in nodo.names:
                    assert hasattr(modelado, alias.name), f"{archivo.name}: falta {alias.name}"
    assert revisados >= 3, "no se encontraron los imports de los otros módulos"
