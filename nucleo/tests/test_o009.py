"""Pruebas de O009: partidas de medición, cantidades exactas y exportación a PP."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo(nombre: str = "O009") -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo(nombre)
    return nucleo


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def _tipo_muro(nucleo: ModeloNucleo, nombre: str) -> str:
    return next(
        t["globalid"] for t in nucleo.tipos_listar("IfcWallType") if t["nombre"] == nombre
    )


def _tipo_por_nombre(nucleo: ModeloNucleo, clase: str, nombre: str) -> str:
    return next(
        t["globalid"] for t in nucleo.tipos_listar(clase) if t["nombre"] == nombre
    )


def _rectangulo(
    nucleo: ModeloNucleo,
    tipo: str,
    ancho: float = 7.0,
    fondo: float = 5.0,
    altura: float = 2.6,
) -> list[str]:
    nivel = _nivel(nucleo)
    muros: list[str] = []
    for x1, y1, x2, y2 in (
        (0, 0, ancho, 0),
        (ancho, 0, ancho, fondo),
        (ancho, fondo, 0, fondo),
        (0, fondo, 0, 0),
    ):
        muros += nucleo.muro_crear(tipo, nivel, x1, y1, x2, y2, altura)["creados"]
    return muros


def _crear_tipo_prueba(nucleo: ModeloNucleo) -> str:
    respuesta = nucleo.tipos_crear(
        "IfcWallType",
        "Muro prueba 15",
        {
            "capas": [
                {
                    "material": "Aplanado de mortero (repellado)",
                    "espesor": 0.015,
                    "funcion": "acabado",
                },
                {"material": "Block de concreto 15", "espesor": 0.15, "funcion": "núcleo"},
                {"material": "Yeso", "espesor": 0.015, "funcion": "acabado"},
            ]
        },
    )
    return respuesta["tipo"]["globalid"]


def _por_nombre(calculo: dict, nombre: str) -> dict:
    for partida in calculo["partidas"]:
        if partida["nombre"] == nombre:
            return partida
    raise AssertionError(f"No está la partida «{nombre}»: {calculo['partidas']}")


def test_partidas_de_omision_de_los_tipos_semilla() -> None:
    nucleo = _nuevo()
    muro = nucleo.tipos_obtener(_tipo_muro(nucleo, "Block 15 aplanado-yeso"))
    criterios = [p["Criterio"] for p in muro["partidas"]]
    assert criterios == ["area_nucleo"] + ["area_capa"] * 5
    assert [p["Capa"] for p in muro["partidas"][1:]] == [0, 1, 2, 4, 5]
    assert muro["partidas"][3]["Nombre"] == "Aplanado exterior"
    assert muro["partidas"][4]["Nombre"] == "Yeso interior"

    columna = nucleo.tipos_obtener(_tipo_por_nombre(nucleo, "IfcColumnType", "C-1 Columna 30×30"))
    assert [p["Criterio"] for p in columna["partidas"]] == ["volumen", "acero", "cimbra"]
    zapata = nucleo.tipos_obtener(_tipo_por_nombre(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20"))
    assert [p["Criterio"] for p in zapata["partidas"]] == [
        "volumen", "acero", "plantilla", "excavacion",
    ]
    cerramiento = nucleo.tipos_obtener(
        _tipo_por_nombre(nucleo, "IfcBeamType", "CE-1 Cerramiento 15×20")
    )
    assert [p["Criterio"] for p in cerramiento["partidas"]] == ["volumen", "acero"]


def test_rectangulo_sin_vanos_da_las_areas_exactas() -> None:
    nucleo = _nuevo()
    tipo = _crear_tipo_prueba(nucleo)
    _rectangulo(nucleo, "Muro prueba 15")
    calculo = nucleo.medicion_calcular()
    assert _por_nombre(calculo, "Muro de Block de concreto 15")["total"] == pytest.approx(62.40)
    assert _por_nombre(calculo, "Aplanado exterior")["total"] == pytest.approx(64.116)
    assert _por_nombre(calculo, "Yeso interior")["total"] == pytest.approx(60.684)
    # Cada renglón es un muro y conserva su GlobalId.
    aplanado = _por_nombre(calculo, "Aplanado exterior")
    assert len(aplanado["renglones"]) == 4
    assert sum(r["resultado"] for r in aplanado["renglones"]) == pytest.approx(64.116)
    assert sorted(r["resultado"] for r in aplanado["renglones"]) == pytest.approx(
        [13.429, 13.429, 18.629, 18.629]
    )
    assert all(r["globalid"] for r in aplanado["renglones"])
    assert aplanado["renglones"][0]["tramo"] == "Nivel 0"
    assert "capa: Aplanado exterior" in aplanado["renglones"][0]["descripcion"]


def test_una_puerta_descuenta_el_mismo_vano_en_las_tres_areas() -> None:
    nucleo = _nuevo()
    _crear_tipo_prueba(nucleo)
    muros = _rectangulo(nucleo, "Muro prueba 15")
    nucleo.abertura_crear("IfcDoor", muros[0], 2.0, 0.90, 2.10, 0.0)
    calculo = nucleo.medicion_calcular()
    assert _por_nombre(calculo, "Muro de Block de concreto 15")["total"] == pytest.approx(60.51)
    assert _por_nombre(calculo, "Aplanado exterior")["total"] == pytest.approx(62.226)
    assert _por_nombre(calculo, "Yeso interior")["total"] == pytest.approx(58.794)


def test_los_castillos_bajan_el_nucleo_pero_no_los_acabados() -> None:
    nucleo = _nuevo()
    _crear_tipo_prueba(nucleo)
    muros = _rectangulo(nucleo, "Muro prueba 15")
    antes = nucleo.medicion_calcular()
    assert len(nucleo.castillos_automaticos(muros, 3.0)["creados"]) == 10
    despues = nucleo.medicion_calcular()
    nucleo_antes = _por_nombre(antes, "Muro de Block de concreto 15")["total"]
    nucleo_despues = _por_nombre(despues, "Muro de Block de concreto 15")["total"]
    assert nucleo_despues == pytest.approx(nucleo_antes - 10 * 0.15 * 2.60)
    assert _por_nombre(despues, "Aplanado exterior")["total"] == pytest.approx(
        _por_nombre(antes, "Aplanado exterior")["total"]
    )
    assert _por_nombre(despues, "Yeso interior")["total"] == pytest.approx(
        _por_nombre(antes, "Yeso interior")["total"]
    )


def test_columna_y_zapata_cimbra_plantilla_y_excavacion() -> None:
    nucleo = _nuevo()
    nivel = _nivel(nucleo)
    columna = nucleo.columna_crear(
        "C-1 Columna 30×30", nivel, 2.0, 2.0, altura=3.00
    )["creados"][0]
    nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel, 2.0, 2.0, 0.0, 1.00)
    calculo = nucleo.medicion_calcular()
    cimbra = [
        p for p in calculo["partidas"]
        if p["nombre"] == "Cimbra" and p["renglones"][0]["globalid"] == columna
    ][0]
    assert cimbra["total"] == pytest.approx(3.60)
    assert cimbra["renglones"][0]["largo"] is None
    assert any(
        p["nombre"] == "Plantilla de concreto pobre" and p["total"] == pytest.approx(1.44)
        for p in calculo["partidas"]
    )
    assert any(
        p["nombre"] == "Excavación" and p["total"] == pytest.approx(2.56)
        for p in calculo["partidas"]
    )


def test_ejes_de_los_renglones_de_muro_y_columna() -> None:
    nucleo = _nuevo()
    _crear_tipo_prueba(nucleo)
    _rectangulo(nucleo, "Muro prueba 15")
    nucleo.eje_crear("1", 0.0, -1.0, 0.0, 6.0)
    nucleo.eje_crear("2", 7.0, -1.0, 7.0, 6.0)
    nucleo.eje_crear("A", -1.0, 0.0, 8.0, 0.0)
    nucleo.eje_crear("B", -1.0, 5.0, 8.0, 5.0)
    calculo = nucleo.medicion_calcular()
    aplanado = _por_nombre(calculo, "Aplanado exterior")
    ejes = sorted(r["eje"] for r in aplanado["renglones"])
    assert ejes == ["1 / A-B", "2 / A-B", "A / 1-2", "B / 1-2"]


def test_guardar_partidas_no_regenera_la_geometria_y_va_en_un_paso() -> None:
    nucleo = _nuevo()
    muros = _rectangulo(nucleo, "Block 15")
    tipo = _tipo_muro(nucleo, "Block 15")
    muro = nucleo._entidad_por_gid(muros[0])
    representacion = muro.Representation
    partidas = [
        {
            "Nombre": "Muro de block",
            "ClavePP": "MUR-15",
            "Criterio": "area_nucleo",
            "Capa": None,
        }
    ]
    respuesta = nucleo.medicion_guardar_partidas(tipo, partidas)
    assert respuesta["partidas"][0]["Unidad"] == "m2"
    assert muro.Representation == representacion
    assert nucleo.tipos_obtener(tipo)["partidas"][0]["ClavePP"] == "MUR-15"
    nucleo.deshacer()
    assert nucleo.tipos_obtener(tipo)["partidas"][0]["ClavePP"] == ""


def test_guardar_y_reabrir_conserva_las_partidas(tmp_path: Path) -> None:
    nucleo = _nuevo("Persistencia")
    ruta = tmp_path / "partidas.ifc"
    nucleo.guardar(str(ruta))
    tipo = _tipo_muro(nucleo, "Block 15")
    nucleo.medicion_guardar_partidas(
        tipo,
        [
            {
                "Nombre": "Muro de block 15",
                "ClavePP": "MUR-B15",
                "Criterio": "area_nucleo",
                "Capa": None,
            }
        ],
    )
    nucleo.guardar(str(ruta))
    otro = ModeloNucleo()
    otro.abrir(str(ruta))
    partidas = otro.tipos_obtener(_tipo_muro(otro, "Block 15"))["partidas"]
    assert len(partidas) == 1
    assert partidas[0]["ClavePP"] == "MUR-B15"
    assert partidas[0]["Criterio"] == "area_nucleo"


def test_exportar_cumple_el_contrato_y_total_es_la_suma(tmp_path: Path) -> None:
    nucleo = _nuevo("Casa prueba")
    _crear_tipo_prueba(nucleo)
    _rectangulo(nucleo, "Muro prueba 15")
    tipo = _tipo_muro(nucleo, "Muro prueba 15")
    nucleo.medicion_guardar_partidas(
        tipo,
        [
            {
                "Nombre": "Muro de block 15",
                "ClavePP": "MUR-B15",
                "Criterio": "area_nucleo",
                "Capa": None,
            },
            {
                "Nombre": "Aplanado exterior",
                "ClavePP": "",
                "Criterio": "area_capa",
                "Capa": 0,
            },
        ],
    )
    ruta = tmp_path / "rectangulo.openrvt-medicion.json"
    nucleo.medicion_exportar(str(ruta))
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    assert datos["formato"] == "openrvt-medicion"
    assert datos["version"] == 1
    assert datos["proyecto"] == "Casa prueba"
    assert datos["archivo_ifc"] == ""
    assert len(datos["fecha"]) == 19 and "T" in datos["fecha"]
    assert len(datos["partidas"]) == 2
    assert {p["clave"] for p in datos["partidas"]} == {"MUR-B15", ""}
    for partida in datos["partidas"]:
        assert partida["unidad"] in ("m", "m2", "m3", "kg", "pza")
        assert isinstance(partida["total"], (int, float))
        assert partida["total"] == pytest.approx(
            sum(r["resultado"] for r in partida["renglones"])
        )
        for renglon in partida["renglones"]:
            assert isinstance(renglon["resultado"], (int, float))
            for campo in ("piezas", "largo", "ancho", "alto"):
                assert renglon[campo] is None or isinstance(renglon[campo], (int, float))
            assert isinstance(renglon["globalid"], str)
    muro = next(p for p in datos["partidas"] if p["clave"] == "MUR-B15")
    assert muro["total"] == pytest.approx(62.40)
    assert muro["renglones"][0]["eje"] == ""


def test_rpc_de_medicion_calcula_y_exporta(tmp_path: Path) -> None:
    from openrvt_nucleo.servidor import Servidor

    servidor = Servidor()
    servidor._exigir().nuevo("RPC")
    nivel = servidor._exigir().niveles()[0]["globalid"]
    servidor.despachar(
        "muros.crear",
        {"tipo": "Block 15", "nivel": nivel, "x1": 0, "y1": 0, "x2": 4, "y2": 0},
    )
    calculo = servidor.despachar("medicion.calcular", {})
    assert calculo["partidas"][0]["total"] == pytest.approx(4 * 2.6)
    ruta = tmp_path / "rpc.openrvt-medicion.json"
    salida = servidor.despachar("medicion.exportar", {"ruta": str(ruta)})
    assert salida["formato"] == "openrvt-medicion"
    assert ruta.is_file()
