"""Pruebas de O007a: biblioteca de materiales, tipos y muros multicapa."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402

CAPAS_SEIS = [
    {"material": "Pintura", "espesor": 0.0005, "funcion": "acabado"},
    {"material": "Aplanado fino", "espesor": 0.005, "funcion": "acabado"},
    {"material": "Aplanado de mortero (repellado)", "espesor": 0.015, "funcion": "acabado"},
    {"material": "Block de concreto 15", "espesor": 0.15, "funcion": "núcleo"},
    {"material": "Yeso", "espesor": 0.010, "funcion": "acabado"},
    {"material": "Pintura", "espesor": 0.0005, "funcion": "acabado"},
]


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O007a")
    return nucleo


def _tipo(nucleo: ModeloNucleo, nombre: str) -> dict:
    return next(t for t in nucleo.tipos_listar("IfcWallType") if t["nombre"] == nombre)


def test_semilla_de_materiales_completa() -> None:
    nucleo = _nuevo()
    materiales = {m["nombre"]: m for m in nucleo.materiales_listar()}
    assert len(materiales) == 15
    assert materiales["Block de concreto 15"]["categoria"] == "núcleo"
    assert materiales["Block de concreto 15"]["espesor_tipico"] == 0.15
    assert materiales["Aplanado de mortero (repellado)"]["color"] == "#d9d2c5"
    assert materiales["Azulejo"]["rayado"] == "diagonal"
    assert materiales["Pintura"]["unidad"] == "m²"
    # Cada material guarda su pset como IfcMaterialProperties.
    material = nucleo._material_entidad("Block de concreto 15")
    psets = [p.Name for p in material.HasProperties]
    assert psets == ["OPENRVT_Material"]


def test_crear_tipo_de_seis_capas_y_espesor_exacto() -> None:
    nucleo = _nuevo()
    resultado = nucleo.tipos_crear(
        "IfcWallType", "Muro de prueba", {"capas": CAPAS_SEIS}
    )
    tipo = resultado["tipo"]
    # La suma real de las seis capas es 0.181; el espesor publicado debe coincidir.
    assert tipo["parametros"]["Espesor"] == pytest.approx(0.181, abs=1e-12)
    assert tipo["parametros"]["LineaUbicacion"] == "eje_nucleo"
    assert [c["funcion"] for c in tipo["capas"]] == [
        "acabado",
        "acabado",
        "acabado",
        "núcleo",
        "acabado",
        "acabado",
    ]
    assert [round(c["espesor"], 4) for c in tipo["capas"]] == [
        0.0005,
        0.005,
        0.015,
        0.15,
        0.01,
        0.0005,
    ]
    # El IfcMaterialLayerSet conserva el orden exterior→interior y las funciones.
    capa_set = nucleo._material_set_de(nucleo._tipo_por_gid(tipo["globalid"]))
    assert [c.Category for c in capa_set.MaterialLayers] == [
        "acabado",
        "acabado",
        "acabado",
        "núcleo",
        "acabado",
        "acabado",
    ]


def test_error_con_cero_o_dos_nucleos_separados() -> None:
    nucleo = _nuevo()
    sin_nucleo = [
        {"material": "Pintura", "espesor": 0.001, "funcion": "acabado"},
        {"material": "Yeso", "espesor": 0.01, "funcion": "acabado"},
    ]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.tipos_crear("IfcWallType", "Sin núcleo", {"capas": sin_nucleo})
    assert exc.value.codigo == -32033
    assert "núcleo" in exc.value.mensaje

    dos_nucleos = [
        {"material": "Block de concreto 15", "espesor": 0.15, "funcion": "núcleo"},
        {"material": "Yeso", "espesor": 0.01, "funcion": "acabado"},
        {"material": "Block de concreto 12", "espesor": 0.12, "funcion": "núcleo"},
    ]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.tipos_crear("IfcWallType", "Dos núcleos", {"capas": dos_nucleos})
    assert exc.value.codigo == -32034
    assert "dos núcleos" in exc.value.mensaje


def test_editar_capa_cambia_espesor_y_conserva_el_eje_del_nucleo() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "Block 15 aplanado-yeso")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear(tipo["nombre"], nivel, 1.0, 2.0, 5.0, 2.0)["creados"][0]
    entidad = nucleo._entidad_por_gid(muro)
    import ifcopenshell.util.placement as placement

    antes = placement.get_local_placement(entidad.ObjectPlacement)
    capas = nucleo.tipos_obtener(tipo["globalid"])["capas"]
    for capa in capas:
        if capa["funcion"] == "núcleo":
            capa["espesor"] = 0.20
    nucleo.tipos_editar(tipo["globalid"], {"capas": capas})
    datos = nucleo._datos_muro(entidad)
    assert datos["espesor"] == pytest.approx(0.231, abs=1e-9)
    despues = placement.get_local_placement(entidad.ObjectPlacement)
    assert list(antes[0]) == list(despues[0])
    assert list(antes[1]) == list(despues[1])
    # El eje de ubicación (centro del núcleo) sigue en el eje local 0.
    posicionadas = nucleo.capas_con_posicion(entidad, datos["espesor"])
    nucleo_capa = next(c for c in posicionadas if c["funcion"] == "núcleo")
    assert nucleo_capa["centro"] == pytest.approx(0.0, abs=1e-9)
    # Y la instancia se puede regenerar (tiene sólido).
    assert entidad.Representation is not None


def test_no_se_borra_tipo_con_instancias_ni_material_en_uso() -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0)
    tipo = _tipo(nucleo, "Block 15")
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.tipos_borrar(tipo["globalid"])
    assert exc.value.codigo == -32037
    assert "1 instancia(s)" in exc.value.mensaje

    with pytest.raises(ErrorNucleo) as exc:
        nucleo.material_borrar("Block de concreto 15")
    assert exc.value.codigo == -32032
    assert "Block de concreto 15" in exc.value.mensaje


def test_material_crear_editar_y_borrar_sin_uso() -> None:
    nucleo = _nuevo()
    creado = nucleo.material_crear(
        "Mármol",
        {"categoria": "acabado", "color": "#dddddd", "rayado": "diagonal", "unidad": "m²"},
    )
    assert creado["material"]["nombre"] == "Mármol"
    nucleo.material_editar("Mármol", {"espesor_tipico": 0.02, "color": "#eeeeee"})
    marmol = next(m for m in nucleo.materiales_listar() if m["nombre"] == "Mármol")
    assert marmol["espesor_tipico"] == pytest.approx(0.02)
    assert marmol["color"] == "#eeeeee"
    nucleo.material_borrar("Mármol")
    assert "Mármol" not in {m["nombre"] for m in nucleo.materiales_listar()}


def test_deshacer_revierte_la_edicion_del_tipo() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "Block 15")
    capas = nucleo.tipos_obtener(tipo["globalid"])["capas"]
    capas[0]["espesor"] = 0.25
    nucleo.tipos_editar(tipo["globalid"], {"capas": capas})
    assert _tipo(nucleo, "Block 15")["espesor"] == pytest.approx(0.25)
    assert nucleo.deshacer()["hecho"] is True
    assert _tipo(nucleo, "Block 15")["espesor"] == pytest.approx(0.15)


def test_guardar_y_reabrir_conserva_capas_funciones_y_psets(tmp_path: Path) -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "Block 15 baño")
    nivel = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear(tipo["nombre"], nivel, 0, 0, 3, 0)["creados"][0]
    destino = tmp_path / "muro.ifc"
    nucleo.guardar(str(destino))

    otro = ModeloNucleo()
    otro.abrir(str(destino))
    tipo2 = _tipo(otro, "Block 15 baño")
    datos = otro.tipos_obtener(tipo2["globalid"])
    assert datos["parametros"]["Espesor"] == pytest.approx(0.196)
    assert datos["parametros"]["LineaUbicacion"] == "eje_nucleo"
    assert [c["funcion"] for c in datos["capas"]] == [
        "acabado",
        "acabado",
        "núcleo",
        "acabado",
        "acabado",
        "acabado",
    ]
    assert datos["instancias"] == 1
    assert otro._datos_muro(otro._entidad_por_gid(muro))["espesor"] == pytest.approx(0.196)
    material = otro._material_entidad("Azulejo")
    assert otro._leer_material_pset(material)["Rayado"] == "diagonal"


def test_cambiar_tipo_de_una_instancia_y_servidor() -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    muro = nucleo.muro_crear("Block 15", nivel, 0, 0, 4, 0)["creados"][0]
    resultado = nucleo.elemento_cambiar_tipo(muro, "Block 15 baño")
    assert muro in resultado["modificados"]
    assert nucleo._datos_muro(nucleo._entidad_por_gid(muro))["espesor"] == pytest.approx(
        0.196
    )

    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O007a"})
    materiales = servidor.despachar("materiales.listar", {})
    assert len(materiales) == 15
    tipos = servidor.despachar("tipos.listar", {"clase": "IfcWallType"})
    assert {t["nombre"] for t in tipos} >= {"Block 15 aplanado-yeso", "Block 15 baño"}
    datos = servidor.despachar("tipos.obtener", {"globalid": tipos[0]["globalid"]})
    assert datos["globalid"] == tipos[0]["globalid"]
    duplicado = servidor.despachar(
        "tipos.duplicar",
        {"globalid": tipos[0]["globalid"], "nombre": "Copia RPC"},
    )
    assert duplicado["tipo"]["nombre"] == "Copia RPC"
    assert servidor.despachar("tipos.instancias", {"globalid": tipos[0]["globalid"]}) == []
