"""O045: el cerramiento se dibuja como un muro y va embebido en él.

El cerramiento se traza con dos puntos (inicio y fin). Si el trazo es colineal con
el eje de un muro, dentro de la mitad de su espesor y de su largo, queda ligado y
se corta en las juntas de muros colineales; si no, queda libre. El muro conserva
su altura y en cantidades se descuenta la sección del cerramiento embebido.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

TIPO = "CE-1 Cerramiento 15×20"


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _cerramientos(nucleo: ModeloNucleo) -> list:
    return [
        e
        for e in nucleo.modelo.by_type("IfcBeam")
        if nucleo._estructura_de_tipo(nucleo._tipo_entidad(e)) == "cerramiento"
    ]


def _datos(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), "OPENRVT_Estructura")


def _escenario() -> tuple[ModeloNucleo, str, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O045")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 7, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n0, desfase_tope=2.60)
    return nucleo, n0, n220, muro


def test_dos_puntos_sobre_el_muro_lo_liga_y_conserva_su_altura() -> None:
    """Trazo de 0 a 7 sobre un muro de 7 m: un cerramiento ligado, muro igual."""
    nucleo, _n0, n220, muro = _escenario()
    altura_antes = nucleo._datos_muro(_entidad(nucleo, muro))["altura"]

    creados = nucleo.cerramiento_crear(
        TIPO, 0.0, 0.0, 7.0, 0.0, nivel=n220, desfase=0
    )["creados"]

    assert len(creados) == 1
    liga = nucleo._leer_liga(_entidad(nucleo, creados[0]))
    assert liga["Muro"] == muro
    assert liga["Inicio"] == pytest.approx(0.0, abs=1e-9)
    assert liga["Fin"] == pytest.approx(7.0, abs=1e-9)
    datos = _datos(nucleo, creados[0])
    assert datos["Longitud"] == pytest.approx(7.0, abs=1e-9)
    assert datos["Z"] == pytest.approx(2.10, abs=1e-9)
    # O045: el muro no se corta ni se acorta.
    assert nucleo._datos_muro(_entidad(nucleo, muro))["altura"] == pytest.approx(
        altura_antes, abs=1e-9
    )
    assert altura_antes == pytest.approx(2.60, abs=1e-9)


def test_sobre_medio_muro_es_parcial() -> None:
    """Trazo de 2 m sobre un muro de 7 m: un cerramiento de 2 m, no de 7."""
    nucleo, _n0, n220, muro = _escenario()
    creados = nucleo.cerramiento_crear(
        TIPO, 1.0, 0.0, 3.0, 0.0, nivel=n220, desfase=0
    )["creados"]

    assert len(creados) == 1
    liga = nucleo._leer_liga(_entidad(nucleo, creados[0]))
    assert liga["Muro"] == muro
    assert liga["Inicio"] == pytest.approx(1.0, abs=1e-9)
    assert liga["Fin"] == pytest.approx(3.0, abs=1e-9)
    assert _datos(nucleo, creados[0])["Longitud"] == pytest.approx(2.0, abs=1e-9)


def test_fuera_de_muros_queda_libre() -> None:
    """Trazo en y = 2, lejos de los muros: un cerramiento sin liga."""
    nucleo, _n0, n220, _muro = _escenario()
    creados = nucleo.cerramiento_crear(
        TIPO, 0.0, 2.0, 3.0, 2.0, nivel=n220, desfase=0
    )["creados"]

    assert len(creados) == 1
    assert nucleo._leer_liga(_entidad(nucleo, creados[0])) == {}
    assert _datos(nucleo, creados[0])["Longitud"] == pytest.approx(3.0, abs=1e-9)


def test_repetido_da_error_claro_y_no_cambia_el_modelo() -> None:
    """El mismo tramo en el mismo nivel no se duplica ni toca el modelo."""
    nucleo, _n0, n220, _muro = _escenario()
    primero = nucleo.cerramiento_crear(
        TIPO, 0.0, 0.0, 3.0, 0.0, nivel=n220, desfase=0
    )["creados"][0]
    vigas_antes = {e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")}
    instantaneas_antes = len(nucleo._deshacer)

    with pytest.raises(Exception, match="ya tiene cerramiento en N 2.20"):
        nucleo.cerramiento_crear(TIPO, 0.0, 0.0, 3.0, 0.0, nivel=n220, desfase=0)

    assert {e.GlobalId for e in nucleo.modelo.by_type("IfcBeam")} == vigas_antes
    assert primero in vigas_antes
    assert len(nucleo._deshacer) == instantaneas_antes


def test_colineal_dentro_de_la_mitad_del_espesor_y_fuera() -> None:
    """Muro de 15 cm: a 7 cm del eje se liga; a 9 cm queda libre."""
    nucleo, _n0, n220, muro = _escenario()
    cerca = nucleo.cerramiento_crear(
        TIPO, 0.0, 0.07, 3.0, 0.07, nivel=n220, desfase=0
    )["creados"][0]
    assert nucleo._leer_liga(_entidad(nucleo, cerca))["Muro"] == muro

    lejos = nucleo.cerramiento_crear(
        TIPO, 0.0, 0.09, 3.0, 0.09, nivel=n220, desfase=0
    )["creados"][0]
    assert nucleo._leer_liga(_entidad(nucleo, lejos)) == {}


def test_dos_muros_colineales_se_cortan_en_la_junta() -> None:
    """Un trazo de 0 a 7 sobre dos muros de 3.5 m crea uno por muro."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O045")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    muro_a = nucleo.muro_crear("Block 15", n0, 0, 0, 3.5, 0)["creados"][0]
    muro_b = nucleo.muro_crear("Block 15", n0, 3.5, 0, 7, 0)["creados"][0]
    nucleo.restricciones_editar(muro_a, nivel_tope=n0, desfase_tope=2.60)
    nucleo.restricciones_editar(muro_b, nivel_tope=n0, desfase_tope=2.60)

    creados = nucleo.cerramiento_crear(
        TIPO, 0.0, 0.0, 7.0, 0.0, nivel=n220, desfase=0
    )["creados"]

    assert len(creados) == 2
    ligas = {nucleo._leer_liga(_entidad(nucleo, c))["Muro"] for c in creados}
    assert ligas == {muro_a, muro_b}
    longitudes = sorted(_datos(nucleo, c)["Longitud"] for c in creados)
    assert longitudes == pytest.approx([3.5, 3.5], abs=1e-9)


def test_cantidades_descuentan_el_cerramiento_y_los_castillos_embebidos() -> None:
    """Muro de 7 × 2.60 de block de 15 cm, cerramiento 15 × 20 y dos castillos 15 × 15.

    Cálculo a mano: 7 × 2.60 = 18.20 m². El cerramiento ocupa el tramo entre
    castillos: (7 − 2 × 0.15) × 0.20 = 1.34 m². Los dos castillos ocupan
    2 × 0.15 × 2.60 = 0.78 m². Área de block = 18.20 − 1.34 − 0.78 = 16.08 m².
    El aplanado no descuenta nada (el recubrimiento cubre el cerramiento): 18.20 m²
    por cada cara.
    """
    nucleo = ModeloNucleo()
    nucleo.nuevo("O045")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    muro = nucleo.muro_crear("Block 15 aplanado-yeso", n0, 0, 0, 7, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n0, desfase_tope=2.60)
    nucleo.cerramiento_crear(TIPO, 0.0, 0.0, 7.0, 0.0, nivel=n220, desfase=0)
    # Castillos centrados a 7.5 cm de cada extremo: quedan completos dentro del muro.
    nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 0.075)
    nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 6.925)

    cantidades = nucleo.cantidades_estructura()
    muro_info = next(e for e in cantidades["elementos"] if e["alias"] == "muro")
    assert muro_info["area_neta_m2"] == pytest.approx(16.08, abs=1e-9)
    assert muro_info["detalle"]["cima_m"] == pytest.approx(2.60, abs=1e-9)

    partidas = nucleo.medicion_calcular()["partidas"]
    block = next(p for p in partidas if p["nombre"] == "Muro de Block de concreto 15")
    assert block["total"] == pytest.approx(16.08, abs=1e-9)
    acabados = [
        p
        for p in partidas
        if p["unidad"] == "m2"
        and p["nombre"].startswith(("Pintura", "Aplanado", "Yeso"))
    ]
    assert len(acabados) >= 4
    for partida in acabados:
        assert partida["total"] == pytest.approx(18.20, abs=1e-9), partida["nombre"]


def test_abrir_un_archivo_viejo_restaura_la_altura_del_muro() -> None:
    """Un muro cortado por su cerramiento recupera sus 3.60 al abrir, una vez."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("O045 viejo")
    n0 = nucleo.niveles()[0]["globalid"]
    n220 = nucleo.nivel_crear("N 2.20", 2.20)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 7, 0)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n0, desfase_tope=2.60)
    nucleo.cerramiento_crear(TIPO, 0.0, 0.0, 7.0, 0.0, nivel=n220, desfase=0)
    # Se simula el archivo viejo: el muro quedó cortado en la cara inferior (2.00).
    datos = dict(nucleo._leer_pset(_entidad(nucleo, muro), "OPENRVT_Muro"))
    datos["Altura"] = 2.00
    nucleo._guardar_pset(_entidad(nucleo, muro), "OPENRVT_Muro", datos)
    ruta = Path(__file__).parent / "_o045_viejo.ifc"
    nucleo.guardar(str(ruta))
    try:
        otro = ModeloNucleo()
        info = otro.abrir(str(ruta))
        assert "restauró la altura" in info.get("migracion", "")
        assert otro._datos_muro(_entidad(otro, muro))["altura"] == pytest.approx(
            2.60, abs=1e-9
        )
        # Guardado el arreglo, una segunda apertura ya no tiene nada que restaurar.
        otro.guardar()
        assert "migracion" not in otro.abrir(str(ruta))
    finally:
        ruta.unlink(missing_ok=True)
