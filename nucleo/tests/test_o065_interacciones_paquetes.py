"""O065A: el paquete ``interacciones`` conserva la interfaz y ya no es un archivo gigante."""

from __future__ import annotations

import ast
import pathlib

import pytest

import openrvt_nucleo.interacciones as interacciones
from openrvt_nucleo.interacciones import (
    LARGOS_REFERENCIA,
    LIGA,
    PRIORIDAD,
    InteraccionesMixin,
)
from openrvt_nucleo.servidor import Servidor

CARPETA = pathlib.Path(interacciones.__file__).parent
TOPE = 1000

# Instantánea tomada del interacciones.py original (2549 líneas) antes de partirlo.
METODOS = {
    "_leer_liga", "_guardar_liga", "_conectar", "_quitar_conexiones",
    "_dependientes_de", "_zapatas_de_columna", "_capas_nucleo", "_punto_en_muro",
    "_del_nucleo", "_medida_texto", "_nombre_seccion", "_castillo_esquina",
    "_seccion_castillo", "_ajustar_castillo", "_reparar_castillos_esquina",
    "_columna_nueva", "_viga_nueva", "castillo_crear_en_muro", "_castillo_en",
    "castillos_automaticos", "_distancia_de_castillo", "_extremo_libre",
    "_cruce_ejes_muro", "_restricciones_cerramiento_ligado", "_tramos_bajo_trazo",
    "cerramiento_crear_en_muro", "dala_crear_en_muro", "cerramiento_crear",
    "_es_cerramiento", "_muros_validos_cerramiento", "_muros_de_cerramiento",
    "_reparar_ancho_del_muro", "validar_cerramientos", "reparar_cerramientos",
    "_cerramiento_tramo", "_lineal_en_muro", "soltar_del_muro",
    "_recolocar_cerramiento_vertical", "_actualizar_castillos",
    "_es_cimentacion_bajo_muro", "_actualizar_muros_sobre_cimentacion",
    "_actualizar_dependientes_muro", "_nivel_de_elemento", "columnas_en_cruces",
    "_guardar_enlace_cruce", "_guardar_enlace_tramo", "_cruces_de_eje",
    "zapatas_en_cruces", "contratrabes_entre_ejes", "muros_entre_ejes",
    "_mover_producto", "_mover_columnas_de_eje", "zapata_bajo_columna",
    "contratrabes_unir_zapatas", "trabes_unir_columnas", "_unir_por_eje",
    "_existe_pieza_entre", "cantidades_estructura", "_partir_base_muro_por_bajadas",
    "_area_embebida_muro", "_piezas_de_elemento",
}


def test_reexporta_las_constantes_con_su_valor_original():
    assert LIGA == "OPENRVT_Liga"
    assert PRIORIDAD["zapata"] == 0
    assert PRIORIDAD["columna"] == 2
    assert PRIORIDAD["muro"] == 7
    # O007c §7: largos de referencia para expresar el acero en kg/m.
    assert LARGOS_REFERENCIA["columna"] == 3.00
    assert LARGOS_REFERENCIA["contratrabe"] == 4.00


def test_el_mixin_conserva_exactamente_los_61_metodos_del_original():
    actuales = {
        nombre for nombre in dir(InteraccionesMixin) if not nombre.startswith("__")
    }
    assert actuales == METODOS


def test_todos_los_py_del_paquete_respetan_el_tope_de_O064():
    archivos = sorted(CARPETA.glob("*.py"))
    assert len(archivos) >= 10
    for archivo in archivos:
        lineas = sum(1 for _ in archivo.open(encoding="utf-8"))
        assert lineas <= TOPE, f"{archivo.name} tiene {lineas} líneas"


def test_interacciones_mixin_se_arma_con_los_mixins_tematicos():
    mro = {clase.__name__ for clase in InteraccionesMixin.__mro__}
    for tema in (
        "LigasMixin",
        "MuroNucleoMixin",
        "EstructuraBaseMixin",
        "CastillosMixin",
        "CerramientosMixin",
        "CerramientosRepararMixin",
        "ActualizacionesMixin",
        "ReticulaMixin",
        "ZapatasMixin",
        "TrabesMixin",
        "CantidadesMixin",
    ):
        assert tema in mro, f"falta {tema}"


def test_conserva_las_operaciones_publicas_de_cada_tema():
    for nombre in (
        "castillo_crear_en_muro",
        "castillos_automaticos",
        "cerramiento_crear_en_muro",
        "cerramiento_crear",
        "dala_crear_en_muro",
        "validar_cerramientos",
        "reparar_cerramientos",
        "soltar_del_muro",
        "columnas_en_cruces",
        "zapatas_en_cruces",
        "contratrabes_entre_ejes",
        "muros_entre_ejes",
        "zapata_bajo_columna",
        "contratrabes_unir_zapatas",
        "trabes_unir_columnas",
        "cantidades_estructura",
    ):
        assert callable(getattr(InteraccionesMixin, nombre))


def test_cada_import_from_interacciones_de_los_otros_modulos_resuelve():
    paquete = CARPETA.parent

    def es_interacciones(nodo):
        return (nodo.level == 1 and nodo.module == "interacciones") or (
            nodo.module == "openrvt_nucleo.interacciones"
        )

    revisados = 0
    for archivo in sorted(paquete.glob("*.py")):
        arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.ImportFrom) and es_interacciones(nodo):
                revisados += 1
                for alias in nodo.names:
                    assert hasattr(interacciones, alias.name), (
                        f"{archivo.name}: falta {alias.name}"
                    )
    assert revisados >= 1, "no se encontró el import de modelo.py"


def test_flujo_por_comandos_guarda_ligas_y_reporta_el_area_neta():
    """Servidor → psets → cantidades: el mismo camino que usa la interfaz.

    Muro de 4.00 × 2.60 = 10.40 m². Dos castillos de 15×15 que bajan a la cara
    inferior del cerramiento (2.60 − 0.20 = 2.40 m): 2 × 0.15 × 2.40 = 0.72 m².
    El cerramiento de 15×20 embebido ocupa 4.00 × 0.20 = 0.80 m². A mano:
    10.40 − 0.72 − 0.80 = 8.88 m².
    """
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "O065A"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    muro = servidor.despachar(
        "muros.crear",
        {
            "tipo": "Block 15", "nivel": nivel,
            "x1": 0, "y1": 0, "x2": 4, "y2": 0, "altura": 2.6,
        },
    )["creados"][0]
    servidor.despachar("cerramientos.crear_en_muro", {"tipo": "CE-1 Cerramiento 15×20", "muro": muro})
    primero = servidor.despachar(
        "castillos.crear_en_muro",
        {"tipo": "K-1 Castillo 15×15", "muro": muro, "distancia": 0.5},
    )["creados"][0]
    servidor.despachar(
        "castillos.crear_en_muro",
        {"tipo": "K-1 Castillo 15×15", "muro": muro, "distancia": 3.5},
    )
    liga = servidor.modelo._leer_liga(servidor.modelo._entidad_por_gid(primero))
    assert liga["Muro"] == muro
    assert liga["Distancia"] == pytest.approx(0.5)
    muro_info = next(
        e for e in servidor.despachar("cantidades.estructura", {})["elementos"]
        if e["alias"] == "muro"
    )
    assert muro_info["detalle"]["area_neta_m2"] == pytest.approx(8.88, abs=1e-9)


def test_borde_por_comandos_rechaza_un_castillo_fuera_del_muro():
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "O065A borde"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    muro = servidor.despachar(
        "muros.crear",
        {
            "tipo": "Block 15", "nivel": nivel,
            "x1": 0, "y1": 0, "x2": 2, "y2": 0, "altura": 2.6,
        },
    )["creados"][0]
    with pytest.raises(Exception) as exc:
        servidor.despachar(
            "castillos.crear_en_muro",
            {"tipo": "K-1 Castillo 15×15", "muro": muro, "distancia": 2.5},
        )
    assert getattr(exc.value, "codigo", None) == -32602
