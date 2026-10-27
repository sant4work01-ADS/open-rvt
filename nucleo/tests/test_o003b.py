"""Pruebas de las herramientas de modelado de O003b."""

from __future__ import annotations

import base64
import json
import math
import sys
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _casa() -> tuple[ModeloNucleo, str, list[str]]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("Casa O003b")
    nivel = nucleo.niveles()[0]["globalid"]
    muros = []
    for x1, y1, x2, y2 in ((0, 0, 8, 0), (8, 0, 8, 6), (8, 6, 0, 6), (0, 6, 0, 0)):
        muros.append(
            nucleo.muro_crear(
                "Block 15", nivel, x1, y1, x2, y2, altura=2.60, alineacion="centro"
            )["creados"][0]
        )
    nucleo.losa_desde_muros(nivel, muros)
    nucleo.abertura_crear("IfcDoor", muros[0], 1.0)
    nucleo.abertura_crear("IfcWindow", muros[1], 1.0)
    nucleo.abertura_crear("IfcWindow", muros[1], 3.0)
    return nucleo, nivel, muros


def _volumenes(nucleo: ModeloNucleo, clase: str) -> dict[str, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    salida: dict[str, float] = {}
    while True:
        forma = iterador.get()
        entidad = nucleo.modelo.by_id(forma.id)
        if entidad.is_a(clase):
            geometria = forma.geometry
            vertices = np.asarray(geometria.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(geometria.faces, dtype=int).reshape(-1, 3)
            volumen = sum(
                float(np.dot(vertices[c[0]], np.cross(vertices[c[1]], vertices[c[2]]))) / 6.0
                for c in caras
            )
            salida[entidad.GlobalId] = salida.get(entidad.GlobalId, 0.0) + volumen
        if not iterador.next():
            break
    return salida


def test_tipos_de_muro_con_capas_y_espesores():
    nucleo = ModeloNucleo()
    nucleo.nuevo()
    tipos = {t["nombre"]: t["espesor"] for t in nucleo.tipos_listar("IfcWallType")}
    # O007a: cinco tipos base de un núcleo y tres tipos de ejemplo multicapa.
    assert tipos == {
        "Block 12": 0.12,
        "Block 15": 0.15,
        "Block 20": 0.20,
        "Tabique": 0.14,
        "Concreto": 0.15,
        "Block 15 aplanado-yeso": 0.181,
        "Tabique 14 aplanado ambos lados": 0.18,
        "Block 15 baño": 0.196,
    }
    capa = nucleo.modelo.by_type("IfcMaterialLayer")
    assert len(capa) == 22


def test_casa_guardar_reabrir_conteos_y_validacion(tmp_path: Path):
    nucleo, _nivel, _muros = _casa()
    info = nucleo.info()
    assert info["por_clase"] == {
        "IfcDoor": 1,
        "IfcSlab": 1,
        "IfcWall": 4,
        "IfcWindow": 2,
    }
    assert nucleo.validar() == []

    destino = tmp_path / "casa.ifc"
    nucleo.guardar(str(destino))
    otro = ModeloNucleo()
    abierto = otro.abrir(str(destino))
    assert abierto["por_clase"] == info["por_clase"]
    assert len(otro.niveles()) == 1
    assert otro.validar() == []
    # Los tipos sobreviven y los muros siguen apuntando a ellos.
    assert {t["nombre"] for t in otro.tipos_listar("IfcWallType")} == {
        "Block 12",
        "Block 15",
        "Block 20",
        "Tabique",
        "Concreto",
        "Block 15 aplanado-yeso",
        "Tabique 14 aplanado ambos lados",
        "Block 15 baño",
    }
    assert {e["tipo"] for e in otro.elementos(filtro={"clase": "IfcWall"})} == {"Block 15"}


def test_ejes_etiquetas_automaticas_e_intersecciones():
    nucleo = ModeloNucleo()
    nucleo.nuevo()
    # Verticales (constantes en X) llevan números; horizontales, letras.
    nucleo.eje_crear("", 0, 0, 0, 6)
    nucleo.eje_crear("", 4, 0, 4, 6)
    nucleo.eje_crear("", 0, 0, 8, 0)
    nucleo.eje_crear("", 0, 3, 8, 3)
    ejes = nucleo.ejes_listar()
    assert [(e["etiqueta"], e["vertical"]) for e in ejes] == [
        ("1", True),
        ("2", True),
        ("A", False),
        ("B", False),
    ]
    assert nucleo.referencias()["intersecciones"] == [
        [0.0, 0.0],
        [0.0, 3.0],
        [4.0, 0.0],
        [4.0, 3.0],
    ]
    borrado = nucleo.eje_borrar(ejes[0]["globalid"])
    assert borrado["borrados"] == [ejes[0]["globalid"]]
    assert len(nucleo.ejes_listar()) == 3


def test_volumen_de_muros_descuenta_aberturas():
    nucleo, _nivel, muros = _casa()
    volumenes = _volumenes(nucleo, "IfcWall")
    assert set(volumenes) == set(muros)
    # O010: el inglete limpio hace que cada muro conserve exactamente su largo de
    # eje por el espesor (sin picos ni muescas) antes de descontar sus aberturas.
    esperado = {
        muros[0]: 8 * 2.60 * 0.15 - 0.90 * 2.10 * 0.15,
        muros[1]: 6 * 2.60 * 0.15 - 2 * 1.20 * 1.20 * 0.15,
        muros[2]: 8 * 2.60 * 0.15,
        muros[3]: 6 * 2.60 * 0.15,
    }
    for gid, volumen in esperado.items():
        assert abs(volumenes[gid] - volumen) <= volumen * 0.01, (gid, volumenes[gid], volumen)


def test_losa_desde_muros_es_el_contorno_exterior():
    nucleo, _nivel, _muros = _casa()
    losas = [e for e in nucleo.elementos() if e["clase"] == "IfcSlab"]
    assert len(losas) == 1
    area = nucleo._leer_pset(nucleo.modelo.by_type("IfcSlab")[0], "OPENRVT_Losa")
    assert area["Puntos"] == 4
    # 8 × 6 con muros de 15 cm centrados: el exterior mide 8,15 × 6,15.
    volumenes = _volumenes(nucleo, "IfcSlab")
    assert abs(volumenes[losas[0]["globalid"]] - 8.15 * 6.15 * 0.12) <= 0.05


def test_uniones_en_l_quedan_conectadas():
    nucleo = ModeloNucleo()
    nucleo.nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    muros = [
        nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0)["creados"][0],
        nucleo.muro_crear("Block 15", nivel, 4, 0, 4, 3)["creados"][0],
        nucleo.muro_crear("Block 15", nivel, 4, 3, 0, 3)["creados"][0],
        nucleo.muro_crear("Block 15", nivel, 0, 3, 0, 0)["creados"][0],
    ]
    uniones = nucleo.modelo.by_type("IfcRelConnectsPathElements")
    assert len(uniones) >= 4
    pares = {
        frozenset((r.RelatingElement.GlobalId, r.RelatedElement.GlobalId)) for r in uniones
    }
    for i in range(4):
        assert frozenset((muros[i], muros[(i + 1) % 4])) in pares


def test_ventana_centrada_en_el_cuerpo_del_muro_con_alineacion_interior():
    """O005c: el marco no debe asomar fuera del muro cuando el cuerpo está desplazado."""
    nucleo = ModeloNucleo()
    nucleo.nuevo("Ventana interior")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear(
        "Block 15", nivel, 0, 0, 8, 0, altura=2.60, alineacion="interior"
    )["creados"][0]
    nucleo.abertura_crear("IfcWindow", muro, 3.0)

    ventana = next(e for e in nucleo.modelo.by_type("IfcWindow"))
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, ventana)
    vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
    ys = vertices[:, 1]
    # El cuerpo del muro va de 0 a 0,15; el marco debe quedar dentro, centrado en 0,075.
    assert float(ys.min()) == pytest.approx(0.0, abs=0.002)
    assert float(ys.max()) == pytest.approx(0.15, abs=0.002)
    assert float((ys.min() + ys.max()) / 2.0) == pytest.approx(0.075, abs=0.002)


def test_union_en_t_conecta_el_extremo_con_el_interior_del_otro_muro():
    nucleo = ModeloNucleo()
    nucleo.nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    largo = nucleo.muro_crear("Block 15", nivel, 0, 0, 8, 0)["creados"][0]
    central = nucleo.muro_crear("Block 15", nivel, 4, 0, 4, 3)["creados"][0]
    pares = {
        frozenset((r.RelatingElement.GlobalId, r.RelatedElement.GlobalId))
        for r in nucleo.modelo.by_type("IfcRelConnectsPathElements")
    }
    assert frozenset((largo, central)) in pares
    assert len(pares) == 1  # el otro extremo del muro central no toca nada


def test_mover_muro_mueve_sus_ventanas_y_deshacer_rehacer():
    nucleo, _nivel, muros = _casa()
    muro = muros[1]
    ventanas = [e for e in nucleo.elementos() if e["clase"] == "IfcWindow"]
    assert len(ventanas) == 2
    import ifcopenshell.util.placement as placement

    def mundo(ventana):
        matriz = placement.get_local_placement(ventana.ObjectPlacement)
        return [float(matriz[0][3]), float(matriz[1][3]), float(matriz[2][3])]

    antes = {
        e["globalid"]: mundo(
            next(
                w
                for w in nucleo.modelo.by_type("IfcWindow")
                if w.GlobalId == e["globalid"]
            )
        )
        for e in ventanas
    }
    vanos_antes = [
        str(v.GlobalId) for v in nucleo.modelo.by_type("IfcOpeningElement")
    ]

    resultado = nucleo.elementos_mover([muro], 1.25, -0.5, 0.0)
    assert muro in resultado["modificados"]
    for gid, coordenadas in antes.items():
        ventana = next(
            w for w in nucleo.modelo.by_type("IfcWindow") if w.GlobalId == gid
        )
        despues = mundo(ventana)
        # La ventana cuelga del vano, y el vano del muro: se traslada con él.
        assert despues[0] == pytest.approx(coordenadas[0] + 1.25, abs=1e-6)
        assert despues[1] == pytest.approx(coordenadas[1] - 0.5, abs=1e-6)
    assert sorted(str(v.GlobalId) for v in nucleo.modelo.by_type("IfcOpeningElement")) == sorted(
        vanos_antes
    )


def test_deshacer_tres_veces_y_rehacer_tres_deja_el_mismo_estado():
    nucleo, nivel, muros = _casa()

    def firma() -> tuple:
        return (
            nucleo.info()["por_clase"],
            tuple(sorted(e["globalid"] for e in nucleo.elementos())),
            tuple(
                sorted(
                    (
                        w.GlobalId,
                        round(float(w.ObjectPlacement.RelativePlacement.Location.Coordinates[0]), 6),
                        round(float(w.ObjectPlacement.RelativePlacement.Location.Coordinates[1]), 6),
                    )
                    for w in nucleo.modelo.by_type("IfcWall")
                )
            ),
        )

    inicial = firma()
    nucleo.elementos_mover([muros[0]], 2.0, 0.0, 0.0)
    nucleo.muro_crear("Block 20", nivel, 20, 0, 24, 0)
    nucleo.abertura_crear("IfcDoor", muros[2], 2.0)
    final = firma()
    assert final != inicial

    for _ in range(3):
        assert nucleo.deshacer()["hecho"] is True
    assert firma() == inicial
    for _ in range(3):
        assert nucleo.rehacer()["hecho"] is True
    assert firma() == final


def test_editar_puerta_cambia_su_vano_y_se_deshace_en_un_solo_paso():
    nucleo, _nivel, _muros = _casa()
    puerta = nucleo.modelo.by_type("IfcDoor")[0]
    vano = next(
        rel.RelatingOpeningElement for rel in puerta.FillsVoids
    )
    assert nucleo._leer_pset(vano, "OPENRVT_Abertura")["Ancho"] == pytest.approx(0.90)
    nucleo.elemento_editar(puerta.GlobalId, {"ancho": 1.10})
    assert puerta.OverallWidth == pytest.approx(1.10)
    assert nucleo._leer_pset(vano, "OPENRVT_Abertura")["Ancho"] == pytest.approx(1.10)
    assert nucleo.deshacer()["hecho"] is True
    assert nucleo.modelo.by_type("IfcDoor")[0].OverallWidth == pytest.approx(0.90)
    assert nucleo._leer_pset(
        nucleo.modelo.by_type("IfcOpeningElement")[0], "OPENRVT_Abertura"
    )["Ancho"] == pytest.approx(0.90)


def test_abertura_que_no_cabe_da_error_y_el_servidor_sigue_vivo():
    nucleo, nivel, muros = _casa()
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.abertura_crear("IfcDoor", muros[0], 7.8)
    assert exc.value.codigo == -32023
    assert "no cabe" in exc.value.mensaje
    # Traslape con otra abertura del mismo muro.
    with pytest.raises(ErrorNucleo) as exc2:
        nucleo.abertura_crear("IfcWindow", muros[1], 1.5)
    assert exc2.value.codigo == -32024

    servidor = Servidor()
    peticiones = [
        {"jsonrpc": "2.0", "id": 1, "method": "proyecto.nuevo", "params": {"nombre": "Vivo"}},
        {"jsonrpc": "2.0", "id": 2, "method": "modelo.niveles", "params": {}},
    ]
    respuestas = [servidor.responder(json.dumps(p)) for p in peticiones]
    assert respuestas[1]["result"][0]["nombre"] == "Nivel 0"
    gid_nivel = respuestas[1]["result"][0]["globalid"]
    malo = servidor.responder(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "muros.crear",
                "params": {
                    "tipo": "Block 15",
                    "nivel": gid_nivel,
                    "x1": 0,
                    "y1": 0,
                    "x2": 2,
                    "y2": 0,
                },
            }
        )
    )
    gid_muro = malo["result"]["creados"][0]
    fuera = servidor.responder(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "aberturas.crear",
                "params": {
                    "clase": "IfcDoor",
                    "muro": gid_muro,
                    "distancia": 1.8,
                    "ancho": 0.9,
                },
            }
        )
    )
    assert fuera["error"]["code"] == -32023
    vivo = servidor.responder(
        json.dumps({"jsonrpc": "2.0", "id": 5, "method": "nucleo.ping", "params": {}})
    )
    assert vivo["result"]["disponible"] is True


def test_editar_tipo_y_alto_regenera_geometria():
    nucleo, nivel, muros = _casa()
    muro = nucleo.modelo.by_type("IfcWall")[0]
    antes = _volumenes(nucleo, "IfcWall")[muro.GlobalId]
    nucleo.elemento_editar(muro.GlobalId, {"tipo": "Block 20"})
    assert nucleo.propiedades(muro.GlobalId)["tipo"] == "Block 20"
    despues = _volumenes(nucleo, "IfcWall")[muro.GlobalId]
    # Block 20 es más grueso que Block 15, y el volumen (sin vanos en este muro)
    # crece en la proporción de espesores.
    assert despues > antes
    nucleo.elemento_editar(muro.GlobalId, {"altura": 2.2})
    assert nucleo.propiedades(muro.GlobalId)["atributos"]["Name"].startswith("Muro")
    assert nucleo.validar() == []
