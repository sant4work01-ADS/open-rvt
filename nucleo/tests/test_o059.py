"""O059: losas por uso (firme, entrepiso, azotea).

Valores a mano (spec O059, 2026-11-09):
- Rectángulo 4 × 5 = 20.00 m².
- Firme: BASESLAB, «Firme», espesor 0.10 → 20 × 0.10 = 2.00 m³.
- Entrepiso: FLOOR, «Losa de entrepiso», espesor 0.12 → 2.40 m³.
- Azotea: ROOF, «Losa de azotea», espesor 0.12 → 2.40 m³.
- Total de las tres: área 60.00 m²; volumen 2.00 + 2.40 + 2.40 = 6.80 m³.
- IFC viejo `o057-fallo-dueno.ifc`: su única losa es FLOOR sin `Uso` en N0
  (el nivel más bajo) → firme. Una losa FLOOR creada en N1 → entrepiso.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402

RECTANGULO = [(0.0, 0.0), (4.0, 0.0), (4.0, 5.0), (0.0, 5.0)]
AREA = 20.00
VIEJO = RAIZ / "nucleo" / "tests" / "datos" / "o057-fallo-dueno.ifc"


def _nuevo() -> tuple[ModeloNucleo, str, str, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O059")
    n0 = nucleo.niveles()[0]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 2.20)["creados"][0]
    n2 = nucleo.nivel_crear("Nivel 2", 4.40)["creados"][0]
    return nucleo, n0, n1, n2


def _pset(nucleo: ModeloNucleo, gid: str, nombre: str) -> dict:
    return nucleo._leer_pset(nucleo._entidad_por_gid(gid), nombre)


def _info(nucleo: ModeloNucleo, gid: str) -> dict:
    return next(
        e for e in nucleo.cantidades_estructura()["elementos"] if e["globalid"] == gid
    )


def _crear(nucleo: ModeloNucleo, nivel: str, uso: str, **extra):
    return nucleo.losa_crear(nivel, RECTANGULO, uso=uso, **extra)["creados"][0]


def _partida(nucleo: ModeloNucleo, nombre: str) -> dict:
    partidas = nucleo.medicion_calcular()["partidas"]
    encontrada = [p for p in partidas if p["nombre"] == nombre]
    assert len(encontrada) == 1, f"partida «{nombre}»: {[p['nombre'] for p in partidas]}"
    return encontrada[0]


# (a) -------------------------------------------------------------------------
def test_tres_usos_predefinido_nombre_uso_espesor_y_volumen() -> None:
    nucleo, n0, n1, n2 = _nuevo()
    firme = _crear(nucleo, n0, "firme")
    entrepiso = _crear(nucleo, n1, "entrepiso")
    azotea = _crear(nucleo, n2, "azotea")

    esperado = [
        (firme, "BASESLAB", "Firme", 0.10, 2.00),
        (entrepiso, "FLOOR", "Losa de entrepiso", 0.12, 2.40),
        (azotea, "ROOF", "Losa de azotea", 0.12, 2.40),
    ]
    for gid, predefinido, nombre, espesor, volumen in esperado:
        entidad = nucleo._entidad_por_gid(gid)
        datos = _pset(nucleo, gid, "OPENRVT_Losa")
        assert entidad.PredefinedType == predefinido
        assert entidad.Name == nombre
        assert datos["Uso"] == nombre_usuario(predefinido)
        assert datos["Espesor"] == pytest.approx(espesor, abs=1e-9)
        assert datos["Area"] == pytest.approx(AREA, abs=1e-9)
        assert _info(nucleo, gid)["volumen_neto_m3"] == pytest.approx(
            volumen, abs=1e-9
        )


def nombre_usuario(predefinido: str) -> str:
    return {"BASESLAB": "firme", "FLOOR": "entrepiso", "ROOF": "azotea"}[predefinido]


def test_espesor_explicito_manda_sobre_la_tabla() -> None:
    nucleo, n0, _n1, _n2 = _nuevo()
    gid = _crear(nucleo, n0, "firme", espesor=0.25)
    assert _pset(nucleo, gid, "OPENRVT_Losa")["Espesor"] == pytest.approx(0.25)
    assert _info(nucleo, gid)["volumen_neto_m3"] == pytest.approx(5.00, abs=1e-9)


# (b) -------------------------------------------------------------------------
def test_uso_de_losa_con_ifc_viejo_y_archivo_intacto() -> None:
    antes = hashlib.sha256(VIEJO.read_bytes()).hexdigest()
    nucleo = ModeloNucleo()
    nucleo.abrir(str(VIEJO))
    assert hashlib.sha256(VIEJO.read_bytes()).hexdigest() == antes, "abrir escribió"

    losa = nucleo.modelo.by_type("IfcSlab")[0]
    datos = nucleo._leer_pset(losa, "OPENRVT_Losa")
    assert "Uso" not in datos
    assert losa.PredefinedType == "FLOOR"
    assert nucleo.uso_de_losa(losa) == "firme"

    n1 = nucleo.niveles()[1]["globalid"]
    nueva = _crear(nucleo, n1, "entrepiso")
    assert nucleo.uso_de_losa(nucleo._entidad_por_gid(nueva)) == "entrepiso"
    # El archivo sigue intacto: solo se abrió y se trabajó en memoria.
    assert hashlib.sha256(VIEJO.read_bytes()).hexdigest() == antes


def test_uso_de_losa_respeta_predefinido_sin_uso() -> None:
    nucleo, n0, _n1, _n2 = _nuevo()
    baseslab = _crear(nucleo, n0, "firme")
    roof = _crear(nucleo, n0, "azotea")
    for gid in (baseslab, roof):
        entidad = nucleo._entidad_por_gid(gid)
        datos = dict(nucleo._leer_pset(entidad, "OPENRVT_Losa"))
        datos.pop("Uso")
        nucleo._guardar_pset(entidad, "OPENRVT_Losa", datos)
    assert nucleo.uso_de_losa(nucleo._entidad_por_gid(baseslab)) == "firme"
    assert nucleo.uso_de_losa(nucleo._entidad_por_gid(roof)) == "azotea"


# (c) -------------------------------------------------------------------------
def test_cambiar_uso_entrepiso_a_azotea_y_deshacer() -> None:
    nucleo, _n0, n1, _n2 = _nuevo()
    gid = _crear(nucleo, n1, "entrepiso")
    entidad = nucleo._entidad_por_gid(gid)
    assert entidad.Name == "Losa de entrepiso"

    nucleo.elemento_editar(gid, {"uso": "azotea"})
    entidad = nucleo._entidad_por_gid(gid)
    assert entidad.PredefinedType == "ROOF"
    assert entidad.Name == "Losa de azotea"
    assert _pset(nucleo, gid, "OPENRVT_Losa")["Uso"] == "azotea"

    nucleo.deshacer()
    entidad = nucleo._entidad_por_gid(gid)
    assert entidad.PredefinedType == "FLOOR"
    assert entidad.Name == "Losa de entrepiso"
    assert _pset(nucleo, gid, "OPENRVT_Losa")["Uso"] == "entrepiso"


def test_cambiar_uso_no_pisa_un_nombre_personalizado() -> None:
    nucleo, _n0, n1, _n2 = _nuevo()
    gid = _crear(nucleo, n1, "entrepiso")
    nucleo.elemento_editar(gid, {"nombre": "Losa de mi cuarto"})
    nucleo.elemento_editar(gid, {"uso": "firme"})
    entidad = nucleo._entidad_por_gid(gid)
    assert entidad.Name == "Losa de mi cuarto"
    assert entidad.PredefinedType == "BASESLAB"
    assert _pset(nucleo, gid, "OPENRVT_Losa")["Uso"] == "firme"


# (d) -------------------------------------------------------------------------
def test_firme_en_la_corona_no_baja_el_muro() -> None:
    nucleo, n0, n1, _n2 = _nuevo()
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 4, 0, altura=2.20)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    _crear(nucleo, n1, "firme")

    entidad = nucleo._entidad_por_gid(muro)
    base, cima = nucleo._limites_verticales_muro_nivel(
        entidad, nucleo._datos_muro(entidad)
    )
    assert base == pytest.approx(0.00, abs=1e-9)
    assert cima == pytest.approx(2.20, abs=1e-9), "el firme no debe cubrir la corona"


def test_entrepiso_en_la_corona_si_baja_el_muro() -> None:
    nucleo, n0, n1, _n2 = _nuevo()
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 4, 0, altura=2.20)["creados"][0]
    nucleo.restricciones_editar(muro, nivel_tope=n1)
    _crear(nucleo, n1, "entrepiso")
    entidad = nucleo._entidad_por_gid(muro)
    _base, cima = nucleo._limites_verticales_muro_nivel(
        entidad, nucleo._datos_muro(entidad)
    )
    assert cima == pytest.approx(2.08, abs=1e-9)


# (e) -------------------------------------------------------------------------
def test_cantidades_separadas_por_uso_y_totales() -> None:
    nucleo, n0, n1, n2 = _nuevo()
    _crear(nucleo, n0, "firme")
    _crear(nucleo, n1, "entrepiso")
    _crear(nucleo, n2, "azotea")

    areas = {
        "Área de firme": 20.00,
        "Área de losa de entrepiso": 20.00,
        "Área de losa de azotea": 20.00,
    }
    volumenes = {
        "Volumen de firme": 2.00,
        "Volumen de losa de entrepiso": 2.40,
        "Volumen de losa de azotea": 2.40,
    }
    for nombre, total in {**areas, **volumenes}.items():
        assert _partida(nucleo, nombre)["total"] == pytest.approx(total, abs=1e-9)

    assert sum(_partida(nucleo, n)["total"] for n in areas) == pytest.approx(60.00)
    assert sum(_partida(nucleo, n)["total"] for n in volumenes) == pytest.approx(6.80)


def test_flujo_guardar_reabrir_y_reportar() -> None:
    nucleo, n0, n1, n2 = _nuevo()
    firme = _crear(nucleo, n0, "firme")
    entrepiso = _crear(nucleo, n1, "entrepiso")
    azotea = _crear(nucleo, n2, "azotea")
    destino = RAIZ / "resultados" / "o059-flujo.ifc"
    destino.parent.mkdir(parents=True, exist_ok=True)
    nucleo.guardar(str(destino))

    reabierto = ModeloNucleo()
    reabierto.abrir(str(destino))
    por_gid = {
        gid: reabierto.uso_de_losa(reabierto._entidad_por_gid(gid))
        for gid in (firme, entrepiso, azotea)
    }
    assert por_gid == {firme: "firme", entrepiso: "entrepiso", azotea: "azotea"}
    assert reabierto._entidad_por_gid(azotea).PredefinedType == "ROOF"
    assert _partida(reabierto, "Volumen de firme")["total"] == pytest.approx(2.00)
    assert _partida(reabierto, "Volumen de losa de azotea")["total"] == pytest.approx(2.40)
    # Cinco partidas: tres áreas, tres volúmenes y tres cimbras de borde.
    nombres = {p["nombre"] for p in reabierto.medicion_calcular()["partidas"]}
    for uso in ("firme", "losa de entrepiso", "losa de azotea"):
        assert f"Área de {uso}" in nombres
        assert f"Volumen de {uso}" in nombres


# (f) -------------------------------------------------------------------------
def test_uso_invalido_es_error_32602() -> None:
    nucleo, n0, _n1, _n2 = _nuevo()
    with pytest.raises(ErrorNucleo) as info:
        nucleo.losa_crear(n0, RECTANGULO, uso="techo")
    assert info.value.codigo == -32602
    assert "uso" in info.value.mensaje.lower()


def test_uso_invalido_en_desde_muros_es_error_32602() -> None:
    nucleo, n0, _n1, _n2 = _nuevo()
    lados = [(0, 0, 4, 0), (4, 0, 4, 5), (4, 5, 0, 5), (0, 5, 0, 0)]
    muros = [
        nucleo.muro_crear("Block 15", n0, *lado, altura=2.60)["creados"][0]
        for lado in lados
    ]
    with pytest.raises(ErrorNucleo) as info:
        nucleo.losa_desde_muros(n0, muros, uso="techo")
    assert info.value.codigo == -32602
    assert "uso" in info.value.mensaje.lower()
