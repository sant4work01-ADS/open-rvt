"""O055: notas 3D como IfcAnnotation con texto y posición exactos.

Caso calculado a mano: una nota en (1.50, -2.25, 3.00) del nivel «Nivel 0» debe
guardar exactamente esas coordenadas y el texto «Revisar muro norte». Guardar y
reabrir el IFC conserva ambos; borrar y deshacer la devuelve.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from ifcopenshell.util import placement

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _posicion(nucleo: ModeloNucleo, gid: str) -> tuple[float, float, float]:
    entidad = nucleo.modelo.by_guid(gid)
    matriz = placement.get_local_placement(entidad.ObjectPlacement)
    return (
        float(matriz[0][3]),
        float(matriz[1][3]),
        float(matriz[2][3]),
    )


def test_la_nota_se_guarda_como_annotation_con_texto_y_posicion_exactos() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O055 nota")
    nivel = nucleo.niveles()[0]["globalid"]

    resultado = nucleo.nota_crear("Revisar muro norte", 1.50, -2.25, 3.00, nivel)
    assert len(resultado["creados"]) == 1
    gid = resultado["creados"][0]

    entidad = nucleo.modelo.by_guid(gid)
    assert entidad.is_a("IfcAnnotation")
    assert entidad.ObjectType == "OPENRVT_Nota"
    assert entidad.Description == "Revisar muro norte"
    assert _posicion(nucleo, gid) == pytest.approx((1.50, -2.25, 3.00), abs=1e-9)

    # La nota queda contenida en el nivel que se indicó.
    contenedores = [
        rel.RelatingStructure
        for rel in entidad.ContainedInStructure
        if rel.RelatingStructure.is_a("IfcBuildingStorey")
    ]
    assert [c.GlobalId for c in contenedores] == [nivel]


def test_guardar_y_reabrir_conserva_texto_y_posicion() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O055 guardar")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.nota_crear("Cota de nivel +3.00", 4.0, 5.5, 3.0, nivel)["creados"][0]
    ruta = Path(nucleo.ruta or "o055.ifc")
    # `guardar` exige ruta: se guarda en un directorio temporal del propio modelo.
    import tempfile

    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "o055.ifc"
        nucleo.guardar(str(ruta))

        otro = ModeloNucleo()
        otro.abrir(str(ruta))
        notas = otro.notas_listar()
        assert notas == [
            {
                "globalid": gid,
                "texto": "Cota de nivel +3.00",
                "posicion": [4.0, 5.5, 3.0],
                "nivel": "Nivel 0",
                "nivelGlobalid": nivel,
            }
        ]
        assert _posicion(otro, gid) == pytest.approx((4.0, 5.5, 3.0), abs=1e-9)


def test_editar_y_mover_actualizan_la_misma_nota() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O055 editar")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.nota_crear("Primera", 0, 0, 0, nivel)["creados"][0]

    nucleo.nota_editar(gid, "Texto corregido")
    nucleo.nota_mover(gid, 7.0, 8.0, 2.5)
    assert nucleo.modelo.by_guid(gid).Description == "Texto corregido"
    assert _posicion(nucleo, gid) == pytest.approx((7.0, 8.0, 2.5), abs=1e-9)
    assert len(nucleo.notas_listar()) == 1


def test_borrar_y_deshacer_devuelve_la_nota_con_su_texto() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O055 deshacer")
    nivel = nucleo.niveles()[0]["globalid"]
    gid = nucleo.nota_crear("No borrar", 1.0, 2.0, 3.0, nivel)["creados"][0]

    nucleo.nota_borrar(gid)
    assert nucleo.notas_listar() == []
    nucleo.deshacer()
    notas = nucleo.notas_listar()
    assert [n["globalid"] for n in notas] == [gid]
    assert notas[0]["texto"] == "No borrar"
    assert notas[0]["posicion"] == [1.0, 2.0, 3.0]


def test_texto_vacio_o_solo_espacios_no_crea_nota() -> None:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O055 vacío")
    nivel = nucleo.niveles()[0]["globalid"]
    for texto in ("", "   ", "\n\t"):
        with pytest.raises(Exception):
            nucleo.nota_crear(texto, 0, 0, 0, nivel)
    assert nucleo.notas_listar() == []


def test_el_servidor_expone_el_flujo_completo_de_notas() -> None:
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor.modelo.nuevo("O055 servidor")
    nivel = servidor.modelo.niveles()[0]["globalid"]

    creada = servidor.despachar(
        "notas.crear",
        {"texto": "Desde el servidor", "x": 2.5, "y": 3.5, "z": 1.25, "nivel": nivel},
    )
    gid = creada["creados"][0]
    listadas = servidor.despachar("notas.listar", {})
    assert listadas == [
        {
            "globalid": gid,
            "texto": "Desde el servidor",
            "posicion": [2.5, 3.5, 1.25],
            "nivel": "Nivel 0",
            "nivelGlobalid": nivel,
        }
    ]
    servidor.despachar("notas.editar", {"globalid": gid, "texto": "Editada"})
    servidor.despachar("notas.mover", {"globalid": gid, "x": 0.5, "y": 0.75, "z": 2.0})
    servidor.despachar("notas.borrar", {"globalid": gid})
    assert servidor.despachar("notas.listar", {}) == []
    servidor.despachar("historial.deshacer", {})
    assert [n["texto"] for n in servidor.despachar("notas.listar", {})] == ["Editada"]
