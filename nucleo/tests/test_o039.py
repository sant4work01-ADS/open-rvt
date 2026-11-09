"""O039: árbol del presupuesto (modo Obra) y capítulos guardados en el IFC.

Modelo de la spec, con valores calculados a mano:

- 4 muros «Block 15» de 4.00 × 2.60 m, con aplanado en las dos caras.
  Área de núcleo = 4 muros × 4.00 × 2.60 = 41.60 m².
  La puerta descuenta su vano: 0.90 × 2.10 = 1.89 m².
  Total de block y de cada aplanado = 41.60 − 1.89 = 39.71 m².
- Una losa de 4.00 × 4.00 × 0.10: volumen = 16.00 × 0.10 = 1.60 m³.
- Una zapata y una puerta (1 pza).

Capítulos por omisión: Preliminares, Cimentación, Estructura, Albañilería,
Acabados, Cancelería e Instalaciones (identificaciones 01…07).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo(nombre: str = "O039") -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo(nombre)
    return nucleo


def _tipo_muro(nucleo: ModeloNucleo, nombre: str) -> str:
    return next(
        t["globalid"] for t in nucleo.tipos_listar("IfcWallType") if t["nombre"] == nombre
    )


def _modelo(nucleo: ModeloNucleo) -> dict:
    """Crea el modelo de la spec y devuelve los GlobalId creados."""
    nivel = nucleo.niveles()[0]["globalid"]
    nucleo.tipos_crear(
        "IfcWallType",
        "Block 15 dos caras",
        {
            "capas": [
                {
                    "material": "Aplanado de mortero (repellado)",
                    "espesor": 0.015,
                    "funcion": "acabado",
                },
                {"material": "Block de concreto 15", "espesor": 0.15, "funcion": "núcleo"},
                {
                    "material": "Aplanado de mortero (repellado)",
                    "espesor": 0.015,
                    "funcion": "acabado",
                },
            ]
        },
    )
    muros = []
    for y in (0.0, 2.0, 4.0, 6.0):
        muros += nucleo.muro_crear(
            "Block 15 dos caras", nivel, 0.0, y, 4.0, y, 2.60
        )["creados"]
    losa = nucleo.losa_crear(
        nivel, [(0, 0), (4, 0), (4, 4), (0, 4)], espesor=0.10
    )["creados"][0]
    # Clave PP propia para el volumen de la zapata: así no se mezcla con el
    # volumen de la losa (misma unidad y nombre por omisión) y cada capítulo
    # conserva su partida.
    tipo_zapata = next(
        t["globalid"]
        for t in nucleo.tipos_listar("IfcFootingType")
        if t["nombre"] == "Z-1 Zapata 1.20×1.20"
    )
    partidas_zapata = nucleo.tipos_obtener(tipo_zapata)["partidas"]
    for partida in partidas_zapata:
        if partida["Criterio"] == "volumen":
            partida["ClavePP"] = "CIM-VOL"
    nucleo.medicion_guardar_partidas(tipo_zapata, partidas_zapata)
    zapata = nucleo.zapata_crear(
        "Z-1 Zapata 1.20×1.20", nivel, 6.0, 0.0, desplante=1.00
    )["creados"][0]
    nucleo.abertura_crear("IfcDoor", muros[0], 1.0)
    return {"nivel": nivel, "muros": muros, "losa": losa, "zapata": zapata}


def _capitulo(arbol: dict, nombre: str) -> dict:
    for capitulo in arbol["capitulos"]:
        if capitulo["nombre"] == nombre:
            return capitulo
    raise AssertionError(f"No está el capítulo «{nombre}»: {arbol['capitulos']}")


def _partida(arbol: dict, nombre: str) -> tuple[dict, dict]:
    for capitulo in arbol["capitulos"]:
        for partida in capitulo["partidas"]:
            if partida["nombre"] == nombre:
                return capitulo, partida
    raise AssertionError(f"No está la partida «{nombre}»")


def _partida_calculo(calculo: dict, nombre: str) -> dict:
    for partida in calculo["partidas"]:
        if partida["nombre"] == nombre:
            return partida
    raise AssertionError(f"No está la partida «{nombre}» en el cálculo")


def test_capitulos_por_omision_en_orden() -> None:
    """Los siete capítulos salen en el orden de la spec con identificación 01…07."""
    nucleo = _nuevo()
    _modelo(nucleo)
    arbol = nucleo.arbol_obra()
    assert arbol["tipo"] == "obra"
    assert [c["nombre"] for c in arbol["capitulos"]] == [
        "Preliminares",
        "Cimentación",
        "Estructura",
        "Albañilería",
        "Acabados",
        "Cancelería",
        "Instalaciones",
    ]
    assert [c["identificacion"] for c in arbol["capitulos"]] == [
        "01", "02", "03", "04", "05", "06", "07",
    ]
    assert [c["orden"] for c in arbol["capitulos"]] == [1, 2, 3, 4, 5, 6, 7]
    # Preliminares e Instalaciones quedan vacíos y se muestran con (0).
    assert _capitulo(arbol, "Preliminares")["conteo"] == 0
    assert _capitulo(arbol, "Instalaciones")["conteo"] == 0
    assert _capitulo(arbol, "Preliminares")["partidas"] == []


def test_partidas_en_su_capitulo_y_totales_a_mano() -> None:
    """Cada partida cae en su capítulo con el total calculado a mano."""
    nucleo = _nuevo()
    creados = _modelo(nucleo)
    arbol = nucleo.arbol_obra()

    # 4 × 4.00 × 2.60 = 41.60; menos la puerta 0.90 × 2.10 = 1.89 → 39.71.
    capitulo, block = _partida(arbol, "Muro de Block de concreto 15")
    assert capitulo["nombre"] == "Albañilería"
    assert block["unidad"] == "m2"
    assert block["total"] == pytest.approx(39.71)
    assert block["conteo"] == 4

    capitulo, aplanado = _partida(arbol, "Aplanado exterior")
    assert capitulo["nombre"] == "Acabados"
    assert aplanado["total"] == pytest.approx(39.71)

    # La losa mide 4 × 4 × 0.10 = 1.60 m³ y va a Estructura; la zapata tiene su
    # propia clave CIM-VOL y va a Cimentación.
    estructura = _capitulo(arbol, "Estructura")
    losa = next(
        p
        for p in estructura["partidas"]
        if p["nombre"] == "Volumen de losa de entrepiso" and p["clave_pp"] == ""
    )
    assert losa["unidad"] == "m3"
    assert losa["total"] == pytest.approx(1.60)

    cimentacion = _capitulo(arbol, "Cimentación")
    zapata = next(p for p in cimentacion["partidas"] if p["clave_pp"] == "CIM-VOL")
    assert zapata["unidad"] == "m3"
    assert zapata["total"] > 0
    assert any(p["nombre"] == "Excavación" for p in cimentacion["partidas"])

    capitulo, puerta = _partida(arbol, "Puerta")
    assert capitulo["nombre"] == "Cancelería"
    assert puerta["unidad"] == "pza"
    assert puerta["total"] == pytest.approx(1.0)
    assert puerta["conteo"] == 1

    # Un muro sale en varias partidas (block y los dos aplanados).
    muro = creados["muros"][1]
    apariciones = [
        p["nombre"]
        for c in arbol["capitulos"]
        for p in c["partidas"]
        if any(r["globalid"] == muro for r in p["renglones"])
    ]
    assert sorted(apariciones) == [
        "Aplanado exterior",
        "Aplanado interior",
        "Muro de Block de concreto 15",
    ]


def test_totales_iguales_al_calculo_de_medicion() -> None:
    """El total del árbol es exactamente el de `medicion_calcular`, partida por partida."""
    nucleo = _nuevo()
    _modelo(nucleo)
    arbol = nucleo.arbol_obra()
    calculo = nucleo.medicion_calcular()
    del_arbol = {
        (p["clave_pp"], p["nombre"], p["unidad"]): p["total"]
        for c in arbol["capitulos"]
        for p in c["partidas"]
    }
    assert len(del_arbol) == len(calculo["partidas"])
    for partida in calculo["partidas"]:
        llave = (partida["clave"], partida["nombre"], partida["unidad"])
        assert del_arbol[llave] == pytest.approx(partida["total"])
        assert partida["total"] == pytest.approx(
            sum(r["resultado"] for r in partida["renglones"])
        )


def test_mover_partida_renombrar_reordenar_y_borrar_capitulo() -> None:
    """Las cuatro ediciones cambian el árbol y cada una es un solo paso de deshacer."""
    nucleo = _nuevo()
    _modelo(nucleo)

    # Mover el aplanado exterior a Albañilería (04).
    nucleo.obra_partida_mover("", "Aplanado exterior", "m2", "04")
    arbol = nucleo.arbol_obra()
    assert _partida(arbol, "Aplanado exterior")[0]["nombre"] == "Albañilería"
    assert _partida(arbol, "Aplanado exterior")[1]["total"] == pytest.approx(39.71)
    assert "Aplanado exterior" not in [
        p["nombre"] for p in _capitulo(arbol, "Acabados")["partidas"]
    ]
    nucleo.deshacer()
    assert _partida(nucleo.arbol_obra(), "Aplanado exterior")[0]["nombre"] == "Acabados"

    # Renombrar Acabados.
    nucleo.obra_capitulo_renombrar("05", "Acabados finos")
    assert _capitulo(nucleo.arbol_obra(), "Acabados finos")["identificacion"] == "05"
    nucleo.deshacer()
    assert _capitulo(nucleo.arbol_obra(), "Acabados")["identificacion"] == "05"

    # Subir Cancelería (06) la deja antes de Acabados; se renumeran las identificaciones.
    nucleo.obra_capitulo_mover("06", "subir")
    arbol = nucleo.arbol_obra()
    assert [c["nombre"] for c in arbol["capitulos"]][4:6] == [
        "Cancelería",
        "Acabados",
    ]
    assert _capitulo(arbol, "Cancelería")["identificacion"] == "05"
    assert _capitulo(arbol, "Acabados")["identificacion"] == "06"
    nucleo.deshacer()
    arbol = nucleo.arbol_obra()
    assert _capitulo(arbol, "Acabados")["identificacion"] == "05"

    # Crear «Extras», mover una partida y borrar el capítulo: la partida vuelve a Acabados.
    nucleo.obra_capitulo_crear("Extras")
    arbol = nucleo.arbol_obra()
    extras = _capitulo(arbol, "Extras")
    assert extras["identificacion"] == "08"
    nucleo.obra_partida_mover("", "Aplanado exterior", "m2", "08")
    assert _partida(nucleo.arbol_obra(), "Aplanado exterior")[0]["nombre"] == "Extras"
    nucleo.obra_capitulo_borrar("08")
    arbol = nucleo.arbol_obra()
    assert "Extras" not in [c["nombre"] for c in arbol["capitulos"]]
    assert _partida(arbol, "Aplanado exterior")[0]["nombre"] == "Acabados"
    nucleo.deshacer()
    assert _partida(nucleo.arbol_obra(), "Aplanado exterior")[0]["nombre"] == "Extras"
    nucleo.deshacer()
    assert _partida(nucleo.arbol_obra(), "Aplanado exterior")[0]["nombre"] == "Acabados"
    assert "Extras" in [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]]
    nucleo.deshacer()
    assert "Extras" not in [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]]


def test_persistencia_en_el_ifc(tmp_path: Path) -> None:
    """Guardar, cerrar y abrir conserva capítulos, orden y asignación de partidas."""
    nucleo = _nuevo("Persistencia O039")
    _modelo(nucleo)
    nucleo.obra_capitulo_renombrar("05", "Acabados finos")
    nucleo.obra_partida_mover("", "Aplanado exterior", "m2", "04")
    nucleo.obra_capitulo_crear("Extras")
    nucleo.obra_capitulo_mover("08", "subir")
    ruta = tmp_path / "o039.ifc"
    nucleo.guardar(str(ruta))

    otro = ModeloNucleo()
    otro.abrir(str(ruta))
    arbol = otro.arbol_obra()
    assert [c["nombre"] for c in arbol["capitulos"]] == [
        "Preliminares",
        "Cimentación",
        "Estructura",
        "Albañilería",
        "Acabados finos",
        "Cancelería",
        "Extras",
        "Instalaciones",
    ]
    assert [c["identificacion"] for c in arbol["capitulos"]] == [
        "01", "02", "03", "04", "05", "06", "07", "08",
    ]
    assert _partida(arbol, "Aplanado exterior")[0]["nombre"] == "Albañilería"
    assert _partida(arbol, "Aplanado exterior")[1]["total"] == pytest.approx(39.71)

    # En el IFC quedan como IfcClassification «OPEN-RVT Obra» y sus referencias.
    clasificacion = next(
        c
        for c in otro.modelo.by_type("IfcClassification")
        if c.Name == "OPEN-RVT Obra"
    )
    referencias = [
        r
        for r in otro.modelo.by_type("IfcClassificationReference")
        if r.ReferencedSource == clasificacion
    ]
    assert sorted(r.Identification for r in referencias) == [
        "01", "02", "03", "04", "05", "06", "07", "08",
    ]
    assert {r.Identification: r.Name for r in referencias}["05"] == "Acabados finos"


def test_deshacer_revierte_cada_cambio_de_capitulos() -> None:
    """Cada comando de capítulos deja una sola instantánea y deshacer lo revierte."""
    nucleo = _nuevo()
    _modelo(nucleo)
    original = [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]]

    nucleo.obra_capitulo_crear("Uno")
    nucleo.obra_capitulo_crear("Dos")
    nucleo.obra_capitulo_renombrar("09", "Dos bis")
    nucleo.obra_capitulo_mover("09", "subir")
    assert [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]][-3:] == [
        "Instalaciones", "Dos bis", "Uno",
    ]
    nucleo.deshacer()
    assert [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]][-3:] == [
        "Instalaciones", "Uno", "Dos bis",
    ]
    nucleo.deshacer()
    assert [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]][-3:] == [
        "Instalaciones", "Uno", "Dos",
    ]
    nucleo.deshacer()
    assert [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]][-2:] == [
        "Instalaciones", "Uno",
    ]
    nucleo.deshacer()
    assert [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]] == original
    nucleo.deshacer()
    assert [c["nombre"] for c in nucleo.arbol_obra()["capitulos"]] == original


def test_no_se_puede_borrar_el_unico_capitulo() -> None:
    """El último capítulo no se puede borrar (invariante del árbol)."""
    nucleo = _nuevo()
    _modelo(nucleo)
    for _ in range(6):
        nucleo.obra_capitulo_borrar("01")
    assert len(nucleo.arbol_obra()["capitulos"]) == 1
    with pytest.raises(Exception) as error:
        nucleo.obra_capitulo_borrar("01")
    assert "único" in str(error.value)
    assert len(nucleo.arbol_obra()["capitulos"]) == 1


def test_rpc_de_obra_mueve_y_deshace_en_un_paso() -> None:
    """Flujo completo por JSON-RPC: comando → IFC → árbol del presupuesto."""
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O039"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    servidor.despachar(
        "muros.crear",
        {"tipo": "Block 15", "nivel": nivel, "x1": 0, "y1": 0, "x2": 4, "y2": 0},
    )
    arbol = servidor.despachar("modelo.arbol_obra", {})
    assert [c["identificacion"] for c in arbol["capitulos"]] == [
        "01", "02", "03", "04", "05", "06", "07",
    ]
    block = next(
        p
        for c in arbol["capitulos"]
        for p in c["partidas"]
        if p["nombre"] == "Muro de Block de concreto 15"
    )
    assert block["total"] == pytest.approx(4 * 2.60)

    servidor.despachar(
        "obra.partida_mover",
        {
            "clave": block["clave_pp"],
            "nombre": block["nombre"],
            "unidad": block["unidad"],
            "capitulo": "03",
        },
    )
    arbol = servidor.despachar("modelo.arbol_obra", {})
    assert next(
        c["nombre"]
        for c in arbol["capitulos"]
        for p in c["partidas"]
        if p["nombre"] == "Muro de Block de concreto 15"
    ) == "Estructura"

    servidor.despachar("historial.deshacer", {})
    arbol = servidor.despachar("modelo.arbol_obra", {})
    assert next(
        c["nombre"]
        for c in arbol["capitulos"]
        for p in c["partidas"]
        if p["nombre"] == "Muro de Block de concreto 15"
    ) == "Albañilería"
