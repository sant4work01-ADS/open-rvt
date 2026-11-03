"""ED2: espejo y matriz de elementos.

Valores calculados a mano (spec ED2):

- Muro de (1,0) a (3,0) con 0,15 m de espesor y la capa exterior hacia y−:
  su cuerpo ocupa y ∈ [−0,15, 0]. Al reflejarlo respecto a x=0 con copia, el
  cuerpo reflejado sigue en y ∈ [−0,15, 0] y el eje va de (−1,0) a (−3,0).
  Al reflejarlo respecto a y=1 sin copia, el cuerpo pasa a y ∈ [2, 2,15]
  (la capa exterior queda hacia y+).
- Puerta a 1,00 m del inicio de un muro de 4,00 m: su origen de colocación
  está en x=1,00 (la hoja mide 0,90 m hacia +x). Reflejada respecto a x=0, el
  origen queda en x=−1,00 y el sentido de giro se invierte.
- Matriz lineal: columna en (0,0); «Al segundo» con vector (3,0) y 4
  elementos deja columnas en x = 0, 3, 6 y 9. «Al último» con vector (9,0)
  reparte 9/(4−1) = 3 m y da el mismo resultado.
- Matriz polar: columna en (5,0), centro (0,0), 360° y 4 elementos deja
  (5,0), (0,5), (−5,0) y (0,−5), cada una girada 90° más que la anterior.
- Un muro con una ventana copiado en matriz de 3 elementos produce 3 muros
  y 3 ventanas.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import ifcopenshell.geom as geom
import ifcopenshell.util.placement as placement
import numpy as np
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES  # noqa: E402
from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> tuple[ModeloNucleo, str]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("ED2")
    return nucleo, nucleo.niveles()[0]["globalid"]


def _muro(nucleo: ModeloNucleo, nivel: str, x1, y1, x2, y2, **kw):
    gid = nucleo.muro_crear("Block 15", nivel, x1, y1, x2, y2, **kw)["creados"][0]
    return next(e for e in nucleo.modelo.by_type("IfcWall") if e.GlobalId == gid)


def _caja(nucleo: ModeloNucleo, entidad) -> tuple[float, float, float, float]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, entidad)
    vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
    return (
        float(vertices[:, 0].min()),
        float(vertices[:, 0].max()),
        float(vertices[:, 1].min()),
        float(vertices[:, 1].max()),
    )


def _posicion(entidad) -> tuple[float, float, float]:
    matriz = placement.get_local_placement(entidad.ObjectPlacement)
    return float(matriz[0][3]), float(matriz[1][3]), float(matriz[2][3])


def _columnas(nucleo: ModeloNucleo) -> list[tuple[float, float, float]]:
    salida = []
    for columna in nucleo.modelo.by_type("IfcColumn"):
        datos = nucleo._leer_pset(columna, "OPENRVT_Estructura")
        salida.append(
            (
                float(datos.get("X") or 0.0),
                float(datos.get("Y") or 0.0),
                float(datos.get("Rotacion") or 0.0),
            )
        )
    return salida


def test_espejo_muro_x0_conserva_el_lado_exterior() -> None:
    nucleo, nivel = _nuevo()
    original = _muro(nucleo, nivel, 1, 0, 3, 0, alineacion="exterior")
    assert _caja(nucleo, original) == pytest.approx((1.0, 3.0, -0.15, 0.0), abs=1e-6)

    resultado = nucleo.elementos_espejo([original.GlobalId], (0, 0), (0, 1), True)
    assert len(resultado["creados"]) == 1
    copia = next(
        e for e in nucleo.modelo.by_type("IfcWall") if e.GlobalId == resultado["creados"][0]
    )
    # Reflexión respecto a x=0: el cuerpo no cambia de lado en y.
    assert _caja(nucleo, copia) == pytest.approx((-3.0, -1.0, -0.15, 0.0), abs=1e-6)
    datos = nucleo._leer_pset(copia, "OPENRVT_Muro")
    assert datos["Volteado"] is True
    # El original no se toca al copiar.
    assert _caja(nucleo, original) == pytest.approx((1.0, 3.0, -0.15, 0.0), abs=1e-6)


def test_espejo_muro_y1_pone_la_capa_exterior_hacia_y_mas() -> None:
    nucleo, nivel = _nuevo()
    original = _muro(nucleo, nivel, 1, 0, 3, 0, alineacion="exterior")
    nucleo.elementos_espejo([original.GlobalId], (0, 1), (1, 1), False)
    reflejado = next(e for e in nucleo.modelo.by_type("IfcWall") if e.GlobalId == original.GlobalId)
    assert _caja(nucleo, reflejado) == pytest.approx((1.0, 3.0, 2.0, 2.15), abs=1e-6)
    assert nucleo._leer_pset(reflejado, "OPENRVT_Muro")["Volteado"] is True
    assert len(nucleo.modelo.by_type("IfcWall")) == 1


def test_espejo_puerta_copia_en_el_muro_reflejado_y_giro_invertido() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 0, 0, 4, 0)
    nucleo.abertura_crear("IfcDoor", muro.GlobalId, 1.0, 0.9, 2.1, 0.0, False)
    puerta = next(e for e in nucleo.modelo.by_type("IfcDoor"))
    assert _posicion(puerta)[0] == pytest.approx(1.0, abs=1e-9)

    resultado = nucleo.elementos_espejo([muro.GlobalId], (0, 0), (0, 1), True)
    copia_muro = next(
        e for e in nucleo.modelo.by_type("IfcWall") if e.GlobalId == resultado["creados"][0]
    )
    puertas = list(nucleo.modelo.by_type("IfcDoor"))
    assert len(puertas) == 2
    copia_puerta = next(p for p in puertas if p.GlobalId != puerta.GlobalId)
    datos = nucleo._datos_abertura(next(iter(copia_muro.HasOpenings)).RelatedOpeningElement)
    assert datos["muro"] == copia_muro.GlobalId
    assert datos["volteado"] is True
    assert _posicion(copia_puerta)[0] == pytest.approx(-1.0, abs=1e-9)
    # El original conserva su puerta y su giro.
    original_datos = nucleo._datos_abertura(next(iter(muro.HasOpenings)).RelatedOpeningElement)
    assert original_datos["muro"] == muro.GlobalId
    assert original_datos["volteado"] is False
    assert _posicion(puerta)[0] == pytest.approx(1.0, abs=1e-9)


def test_espejo_sin_copia_conserva_los_globalid() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 1, 0, 3, 0)
    puerta = nucleo.abertura_crear("IfcDoor", muro.GlobalId, 0.5)["creados"][1]
    gids_antes = {e.GlobalId for e in nucleo.modelo.by_type("IfcProduct")}

    nucleo.elementos_espejo([muro.GlobalId], (0, 0), (0, 1), False)

    gids_despues = {e.GlobalId for e in nucleo.modelo.by_type("IfcProduct")}
    assert gids_despues == gids_antes
    # El muro y la puerta siguen siendo los mismos objetos, reflejados.
    muro_reflejado = nucleo._entidad_por_gid(muro.GlobalId)
    assert _caja(nucleo, muro_reflejado) == pytest.approx((-3.0, -1.0, -0.075, 0.075), abs=1e-6)
    assert _posicion(nucleo._entidad_por_gid(puerta))[0] == pytest.approx(-1.5, abs=1e-9)


def test_matriz_lineal_columnas_al_segundo_y_al_ultimo() -> None:
    for modo, vector in (("al_segundo", (3.0, 0.0)), ("al_ultimo", (9.0, 0.0))):
        nucleo, nivel = _nuevo()
        gid = nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0)["creados"][0]
        nucleo.elementos_matriz_lineal([gid], vector, 4, modo)
        xs = sorted(round(x, 6) for x, _y, _r in _columnas(nucleo))
        assert xs == [0.0, 3.0, 6.0, 9.0], modo
        assert len({c.GlobalId for c in nucleo.modelo.by_type("IfcColumn")}) == 4


def test_matriz_polar_columnas_360_grados() -> None:
    nucleo, nivel = _nuevo()
    gid = nucleo.columna_crear("C-1 Columna 30×30", nivel, 5.0, 0.0)["creados"][0]
    nucleo.elementos_matriz_polar([gid], (0.0, 0.0), 360.0, 4)
    columnas = _columnas(nucleo)
    assert len(columnas) == 4
    posiciones = sorted((round(x, 6), round(y, 6)) for x, y, _r in columnas)
    assert posiciones == [(-5.0, 0.0), (0.0, -5.0), (0.0, 5.0), (5.0, 0.0)]
    rotaciones = sorted(
        round(((r + math.pi) % (2 * math.pi)) - math.pi, 9) for _x, _y, r in columnas
    )
    assert rotaciones == pytest.approx(
        [-math.pi, -math.pi / 2, 0.0, math.pi / 2], abs=1e-9
    )


def test_matriz_muro_con_ventana_copia_los_vanos() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 0, 0, 4, 0)
    nucleo.abertura_crear("IfcWindow", muro.GlobalId, 1.5, 1.2, 1.2, 0.9)
    nucleo.elementos_matriz_lineal([muro.GlobalId], (5.0, 0.0), 3, "al_segundo")
    assert len(nucleo.modelo.by_type("IfcWall")) == 3
    assert len(nucleo.modelo.by_type("IfcWindow")) == 3
    for pared in nucleo.modelo.by_type("IfcWall"):
        vanos = [rel.RelatedOpeningElement for rel in (pared.HasOpenings or ())]
        assert len(vanos) == 1
        relleno = next(iter(vanos[0].HasFillings)).RelatedBuildingElement
        assert relleno.is_a("IfcWindow")


def test_deshacer_devuelve_todo_en_un_solo_paso() -> None:
    nucleo, nivel = _nuevo()
    muro = _muro(nucleo, nivel, 1, 0, 3, 0)
    nucleo.abertura_crear("IfcDoor", muro.GlobalId, 0.5)
    antes_muros = [round(v, 9) for v in _caja(nucleo, muro)]
    antes_count = (
        len(nucleo.modelo.by_type("IfcWall")),
        len(nucleo.modelo.by_type("IfcDoor")),
        len(nucleo.modelo.by_type("IfcOpeningElement")),
    )
    historial = len(nucleo._deshacer)
    nucleo.elementos_espejo([muro.GlobalId], (0, 0), (0, 1), True)
    assert len(nucleo._deshacer) == historial + 1
    assert len(nucleo.modelo.by_type("IfcWall")) == 2
    assert nucleo.deshacer()["hecho"] is True
    assert (
        len(nucleo.modelo.by_type("IfcWall")),
        len(nucleo.modelo.by_type("IfcDoor")),
        len(nucleo.modelo.by_type("IfcOpeningElement")),
    ) == antes_count
    restaurado = nucleo._entidad_por_gid(muro.GlobalId)
    assert [round(v, 9) for v in _caja(nucleo, restaurado)] == antes_muros


def test_servidor_expone_las_tres_puertas_del_nucleo() -> None:
    nucleo, nivel = _nuevo()
    servidor = Servidor()
    servidor.modelo = nucleo
    muro = _muro(nucleo, nivel, 1, 0, 3, 0)
    columna = nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0)["creados"][0]

    espejo = servidor.despachar(
        "elementos.espejo",
        {"globalids": [muro.GlobalId], "p1": [0, 0], "p2": [0, 1], "copiar": True},
    )
    assert len(espejo["creados"]) == 1
    matriz = servidor.despachar(
        "elementos.matriz_lineal",
        {"globalids": [columna], "vector": [3, 0], "numero": 2, "modo": "al_segundo"},
    )
    assert len(matriz["creados"]) == 1
    polar = servidor.despachar(
        "elementos.matriz_polar",
        {"globalids": [columna], "centro": [0, 0], "angulo_total": 180, "numero": 2},
    )
    assert len(polar["creados"]) == 1
