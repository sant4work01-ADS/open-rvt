"""O061: losas sin cortes falsos y muro que cubre cerramientos y losa.

Valores a mano (spec O061, obra del dueño 2026-11-09):
- Niveles N0 0.00, N1 0.12, N2 2.20, N3 2.40, N4 3.00, N5 3.20, N6 3.60.
- Retícula 2.50 × 1.50; firme en N1 (0.00–0.12) y azotea en N5 (3.08–3.20),
  contorno −0.10…2.60 × −0.10…1.60 = 2.70 × 1.70 = 4.59 m²; volumen
  4.59 × 0.12 = 0.5508 m³. Las cuatro zapatas tienen dado 0.40 × 0.40 con cara
  superior en 0.00 y los castillos van de 0.00 a 3.60.
- Castillo de esquina (0, 0): 0.15 × 0.15 × (3.60 − 0.12 firme − 0.12 azotea)
  = 0.0225 × 3.36 = 0.0756 m³.
- Cerramientos de 2.20 a 2.40 con AnchoDelMuro = True; el muro es Block 20
  (Espesor 0.20), así que B = 0.20 al abrir: caras en 1.40–1.60 (eje B) y
  −0.10–0.10 (eje A).
- Muro del eje A (2.50 × 0.20, 0.12–3.60) con un cerramiento forzado a 0.15:
  el muro conserva dos franjas de (0.20 − 0.15) / 2 = 0.025 a los lados; su
  volumen baja solo 0.15 × 0.20 por metro de muro, es decir
  A × (3.48 − 0.12 azotea − 0.15) = A × 3.21.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import ifcopenshell.geom as geom
import numpy as np
import pytest
from shapely import set_precision, wkt
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo import uniones  # noqa: E402
from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402

DUENO = RAIZ / "nucleo" / "tests" / "datos" / "o061-fallo-dueno.ifc"
FIRME_AREA = 2.70 * 1.70
FIRME_VOLUMEN = FIRME_AREA * 0.12
CASTILLO_VOLUMEN = 0.15 * 0.15 * (3.60 - 0.12 - 0.12)


def _entidad(nucleo: ModeloNucleo, gid: str):
    return nucleo._entidad_por_gid(gid)


def _pset(nucleo: ModeloNucleo, entidad, nombre: str) -> dict:
    return nucleo._leer_pset(entidad, nombre)


def _alias(nucleo: ModeloNucleo, entidad) -> str | None:
    return nucleo._estructura_de_tipo(nucleo._tipo_entidad(entidad))


def _caja(nucleo: ModeloNucleo, entidad) -> tuple[float, ...]:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == entidad.id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            return (
                float(vertices[:, 0].min()), float(vertices[:, 0].max()),
                float(vertices[:, 1].min()), float(vertices[:, 1].max()),
                float(vertices[:, 2].min()), float(vertices[:, 2].max()),
            )
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {entidad.GlobalId}")


def _vertices(nucleo: ModeloNucleo, entidad) -> np.ndarray:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == entidad.id():
            return np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {entidad.GlobalId}")


def _volumen_malla(nucleo: ModeloNucleo, entidad) -> float:
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == entidad.id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            return abs(
                sum(
                    float(
                        np.dot(
                            vertices[c[0]],
                            np.cross(vertices[c[1]], vertices[c[2]]),
                        )
                    )
                    / 6.0
                    for c in caras
                )
            )
        if not iterador.next():
            break
    raise AssertionError(f"no se teseló {entidad.GlobalId}")


def _seccion_horizontal(nucleo: ModeloNucleo, entidad, z: float):
    """Sección real de la malla teselada del sólido en el plano horizontal z."""
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    iterador = geom.iterator(ajustes, nucleo.modelo, 1)
    iterador.initialize()
    while True:
        forma = iterador.get()
        if forma.id == entidad.id():
            vertices = np.asarray(forma.geometry.verts, dtype=float).reshape(-1, 3)
            caras = np.asarray(forma.geometry.faces, dtype=int).reshape(-1, 3)
            break
        if not iterador.next():
            raise AssertionError(f"no se teseló {entidad.GlobalId}")
    lineas = []
    for cara in caras:
        puntos = []
        for a, b in ((cara[0], cara[1]), (cara[1], cara[2]), (cara[2], cara[0])):
            za, zb = vertices[a, 2], vertices[b, 2]
            if (za - z) * (zb - z) < 0:
                t = (z - za) / (zb - za)
                puntos.append(vertices[a] + t * (vertices[b] - vertices[a]))
        if len(puntos) >= 2:
            p, q = puntos[0], puntos[1]
            if abs(p[0] - q[0]) > 1e-12 or abs(p[1] - q[1]) > 1e-12:
                lineas.append(LineString([(p[0], p[1]), (q[0], q[1])]))
    if not lineas:
        return Polygon()
    # El teselado reparte cada arista entre dos triángulos: se sueldan las
    # coordenadas a 1e-9 para que los anillos cierren y polygonize los arme.
    nodos = set_precision(unary_union(lineas), 1e-9)
    poligonos = list(polygonize(nodos))
    return unary_union(poligonos) if poligonos else Polygon()


def _huella_global(nucleo: ModeloNucleo, muro) -> Polygon:
    datos = nucleo._datos_muro(muro)
    return unary_union(
        [
            Polygon([nucleo._punto_local(datos, u, v) for u, v in anillo])
            for anillo in nucleo._huellas_muro(muro, datos)
        ]
    )


def _losa(nucleo: ModeloNucleo, uso: str):
    for losa in nucleo.modelo.by_type("IfcSlab"):
        datos = _pset(nucleo, losa, "OPENRVT_Losa")
        if datos and datos.get("Uso") == uso:
            return losa
    raise AssertionError(f"no hay losa de uso {uso}")


def _cerramientos(nucleo: ModeloNucleo) -> list:
    return [
        viga
        for viga in nucleo.modelo.by_type("IfcBeam")
        if _alias(nucleo, viga) == "cerramiento"
    ]


def _castillo_esquina(nucleo: ModeloNucleo):
    for columna in nucleo.modelo.by_type("IfcColumn"):
        if _alias(nucleo, columna) != "castillo":
            continue
        datos = _pset(nucleo, columna, "OPENRVT_Estructura")
        if (
            abs(float(datos.get("X") or 0.0)) < 1e-9
            and abs(float(datos.get("Y") or 0.0)) < 1e-9
        ):
            return columna
    raise AssertionError("no hay castillo en la esquina (0, 0)")


def _muro_en_y(nucleo: ModeloNucleo, y: float):
    for muro in nucleo.modelo.by_type("IfcWall"):
        datos = nucleo._datos_muro(muro)
        if abs(datos["y1"] - y) < 1e-9 and abs(datos["y2"] - y) < 1e-9:
            return muro
    raise AssertionError(f"no hay muro en y = {y}")


def test_losas_del_dueno_no_se_cortan_por_castillos_ni_dados() -> None:
    """(a) Firme y azotea conservan todo su contorno: 4.59 m² y 0.5508 m³."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))

    for uso, z0, z1 in (("firme", 0.00, 0.12), ("azotea", 3.08, 3.20)):
        losa = _losa(nucleo, uso)
        datos = _pset(nucleo, losa, "OPENRVT_Losa")
        recorte = wkt.loads(str(datos["Recorte"]))
        assert isinstance(recorte, Polygon)
        assert len(recorte.interiors) == 0, f"{uso}: el recorte tiene huecos"
        assert recorte.area == pytest.approx(FIRME_AREA, abs=1e-9)
        assert float(datos["Area"]) == pytest.approx(FIRME_AREA, abs=1e-9)
        assert _volumen_malla(nucleo, losa) == pytest.approx(
            FIRME_VOLUMEN, abs=1e-9
        )
        _x0, _x1, _y0, _y1, zmin, zmax = _caja(nucleo, losa)
        assert (zmin, zmax) == pytest.approx((z0, z1), abs=1e-9)


def test_cerramientos_toman_el_ancho_del_muro_al_abrir() -> None:
    """(b) AnchoDelMuro = True: B = 0.20, caras 1.40–1.60 y −0.10–0.10."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    cerramientos = _cerramientos(nucleo)
    assert len(cerramientos) == 4
    for viga in cerramientos:
        datos = _pset(nucleo, viga, "OPENRVT_Estructura")
        assert datos["AnchoDelMuro"] is True
        assert float(datos["B"]) == pytest.approx(0.20, abs=1e-9)
        assert float(datos["Z"]) == pytest.approx(2.30, abs=1e-9)
        x0, x1, y0, y1, zmin, zmax = _caja(nucleo, viga)
        assert (zmin, zmax) == pytest.approx((2.20, 2.40), abs=1e-9)
        if abs(float(datos["X1"]) - float(datos["X2"])) < 1e-9:
            # Eje A (vertical en planta): ancho 0.20 centrado en el muro.
            assert (x0, x1) == pytest.approx(
                (float(datos["X1"]) - 0.10, float(datos["X1"]) + 0.10),
                abs=1e-9,
            )
        else:
            # Eje B (horizontal en planta): y = 1.40…1.60 (o 1.40 para y=1.5).
            assert (y0, y1) == pytest.approx(
                (float(datos["Y1"]) - 0.10, float(datos["Y1"]) + 0.10),
                abs=1e-9,
            )


def test_castillo_de_esquina_se_parte_en_firme_y_azotea() -> None:
    """(c) El castillo (0, 0) va de 0.00 a 3.60 y pierde las dos losas."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    castillo = _castillo_esquina(nucleo)
    datos = _pset(nucleo, castillo, "OPENRVT_Estructura")
    assert float(datos["Base"]) == pytest.approx(0.00, abs=1e-9)
    assert float(datos["Altura"]) == pytest.approx(3.60, abs=1e-9)
    _x0, _x1, _y0, _y1, _zmin, zmax = _caja(nucleo, castillo)
    assert zmax == pytest.approx(3.60, abs=1e-9)
    # El castillo se parte: su malla ya no ocupa las franjas 0.00–0.12 ni
    # 3.08–3.20, pero el volumen total es el de 0.15 × 0.15 × 3.36.
    assert _volumen_malla(nucleo, castillo) == pytest.approx(
        CASTILLO_VOLUMEN, abs=1e-9
    )
    zs = set(np.round(_vertices(nucleo, castillo)[:, 2], 9))
    for corte in (0.12, 3.08, 3.20):
        assert corte in zs, f"el castillo no se parte en z = {corte}"


def test_muro_conserva_franjas_junto_a_cerramiento_estrecho() -> None:
    """(d) Cerramiento de 0.15 en muro de 0.20: dos franjas de 0.025."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    muro = _muro_en_y(nucleo, 0.0)
    datos_muro = nucleo._datos_muro(muro)
    assert datos_muro["longitud"] == pytest.approx(2.50, abs=1e-9)
    assert datos_muro["espesor"] == pytest.approx(0.20, abs=1e-9)

    cerramiento = next(
        viga
        for viga in _cerramientos(nucleo)
        if abs(float(_pset(nucleo, viga, "OPENRVT_Estructura")["Y1"]) - 0.0) < 1e-9
        and abs(float(_pset(nucleo, viga, "OPENRVT_Estructura")["Y2"]) - 0.0) < 1e-9
    )
    pset = dict(_pset(nucleo, cerramiento, "OPENRVT_Estructura"))
    pset["B"] = 0.15
    pset["AnchoDelMuro"] = False
    nucleo._guardar_pset(cerramiento, "OPENRVT_Estructura", pset)
    nucleo._regenerar_estructura(cerramiento)
    nucleo._regenerar_representacion_unida(muro)

    huella_muro = unary_union(
        [Polygon(anillo) for anillo in nucleo._huellas_muro(muro, datos_muro)]
    )
    x0, x1, y0, y1, _z0, _z1 = _caja(nucleo, cerramiento)
    huella_cerramiento = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    # Altura 3.48: −0.12 de azotea; el cerramiento de 0.20 de alto resta
    # solo los 0.15 de ancho que ocupa, no la franja entera del muro.
    # O062: main + piel de 2 mm en las dos caras que cruza la azotea
    # (0.12 × (2.30 + 2.70) × 0.002 = 0.0012). El cerramiento de 0.15 deja
    # franjas de 0.025, así que no toca la piel.
    esperado = (
        huella_muro.area * (3.48 - 0.12)
        - 0.20 * huella_muro.intersection(huella_cerramiento).area
        + 0.12 * (2.30 + 2.70) * 0.002
    )
    assert _volumen_malla(nucleo, muro) == pytest.approx(esperado, abs=1e-3)

    vertices = _vertices(nucleo, muro)
    # La cara exterior y = −0.10 es una piel continua de 0.12 a 3.60: O062 no
    # deja vértices de corte en 2.20 ni en 2.40 sobre esa cara.
    cara = vertices[np.abs(vertices[:, 1] + 0.10) < 1e-6]
    assert cara[:, 2].min() == pytest.approx(0.12, abs=1e-9)
    assert cara[:, 2].max() == pytest.approx(3.60, abs=1e-9)
    for corte in (2.20, 2.40):
        assert not np.any(np.abs(cara[:, 2] - corte) < 1e-9), (
            f"la cara exterior tiene un vértice de corte en z = {corte}"
        )
    # El cerramiento deja dos franjas: el borde interior está en y = −0.075.
    franja = vertices[np.abs(vertices[:, 1] + 0.075) < 1e-6]
    assert franja.size > 0, "no aparecen las franjas laterales del muro"
    for corte in (2.20, 2.40):
        assert np.any(np.abs(franja[:, 2] - corte) < 1e-9), (
            f"la franja no tiene vértice en z = {corte}"
        )


def test_dado_que_toca_no_recorta_y_trabe_que_traslapa_si() -> None:
    """(e) La regla vieja sigue viva: tocar una cara no recorta, traslapar sí."""
    poligono = [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)]
    # Dado con cara superior en 0.00 y firme de 0.00 a 0.12: solo toca la cara.
    dado = uniones.Barra(
        gid="dado", tipo="columna", x1=1.0, y1=1.0, x2=1.0, y2=1.0,
        ancho=0.40, fondo=0.40, z0=-1.0, z1=0.0, clase="dado",
    )
    recorte = uniones.recortar_losa(poligono, [], [dado], 0.0, 0.12)
    assert recorte.area == pytest.approx(4.0, abs=1e-9)

    # Un castillo que atraviesa la losa tampoco la recorta.
    castillo = uniones.Barra(
        gid="castillo", tipo="columna", x1=1.0, y1=1.0, x2=1.0, y2=1.0,
        ancho=0.15, fondo=0.15, z0=0.0, z1=0.12, clase="castillo",
    )
    recorte = uniones.recortar_losa(poligono, [], [castillo], 0.0, 0.12)
    assert recorte.area == pytest.approx(4.0, abs=1e-9)

    # Una trabe que se traslapa 0.06 con la losa sí la recorta: 2.00 × 0.20.
    trabe = uniones.Barra(
        gid="trabe", tipo="viga", x1=-1.0, y1=1.0, x2=3.0, y2=1.0,
        ancho=0.20, z0=0.06, z1=0.30,
    )
    recorte = uniones.recortar_losa(poligono, [trabe], [], 0.0, 0.12)
    assert recorte.area == pytest.approx(4.0 - 2.0 * 0.20, abs=1e-9)


def test_flujo_completo_abrir_guardar_reabrir_conserva_las_reglas() -> None:
    """Flujo: abrir la obra del dueño → guardar → reabrir → datos y geometría."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "o061.ifc"
        nucleo.guardar(str(ruta))
        otro = ModeloNucleo()
        otro.abrir(str(ruta))
        for uso in ("firme", "azotea"):
            losa = _losa(otro, uso)
            datos = _pset(otro, losa, "OPENRVT_Losa")
            assert float(datos["Area"]) == pytest.approx(FIRME_AREA, abs=1e-9)
            assert _volumen_malla(otro, losa) == pytest.approx(
                FIRME_VOLUMEN, abs=1e-9
            )
        for viga in _cerramientos(otro):
            assert float(_pset(otro, viga, "OPENRVT_Estructura")["B"]) == pytest.approx(
                0.20, abs=1e-9
            )
        castillo = _castillo_esquina(otro)
        assert _volumen_malla(otro, castillo) == pytest.approx(
            CASTILLO_VOLUMEN, abs=1e-9
        )
        # El reporte de cantidades ve el castillo ya partido por las losas.
        filas = otro.cantidades_estructura()["elementos"]
        fila = next(f for f in filas if f["globalid"] == castillo.GlobalId)
        assert fila["volumen_neto_m3"] == pytest.approx(
            CASTILLO_VOLUMEN, abs=1e-6
        )


def test_cambiar_tipo_actualiza_nombre_de_omision_y_ancho() -> None:
    """(f) Block 20 → Block 15: Name «Muro Block 15» y cerramientos B = 0.15."""
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    muro = _muro_en_y(nucleo, 0.0)
    assert nucleo._espesor_tipo(nucleo._tipo_entidad(muro)) == pytest.approx(0.20)
    ligados = [
        viga
        for viga in _cerramientos(nucleo)
        if muro in nucleo._muros_de_cerramiento(viga)
    ]
    assert len(ligados) >= 1
    nucleo.elemento_cambiar_tipo(muro.GlobalId, "Block 15")
    assert muro.Name == "Muro Block 15"
    assert nucleo._espesor_tipo(nucleo._tipo_entidad(muro)) == pytest.approx(0.15)
    for viga in ligados:
        assert float(_pset(nucleo, viga, "OPENRVT_Estructura")["B"]) == pytest.approx(
            0.15, abs=1e-9
        )

    # Un Name de usuario no se toca al cambiar de tipo.
    otro = ModeloNucleo()
    otro.nuevo("O061 nombre")
    n0 = otro.niveles()[0]["globalid"]
    creado = otro.muro_crear("Block 20", n0, 0, 0, 4, 0, altura=2.60)["creados"][0]
    entidad = _entidad(otro, creado)
    assert entidad.Name == "Muro Block 20"
    otro.elemento_cambiar_tipo(creado, "Block 15")
    assert entidad.Name == "Muro Block 15"
    otro.elemento_editar(creado, {"nombre": "Muro de la fachada"})
    otro.elemento_cambiar_tipo(creado, "Block 20")
    assert entidad.Name == "Muro de la fachada"


def test_invariante_secciones_cubren_la_huella_del_muro() -> None:
    """La obra terminada no deja huecos: todo muro queda cubierto por sólidos.

    A z = 0.06 manda el firme; a 1.00 y 3.40 los muros y castillos; a 2.30 la
    franja del cerramiento; a 3.14 la azotea. En cada altura, la unión de las
    secciones horizontales reales (malla teselada) de muros, cerramientos,
    castillos y losas recortada a la huella del muro debe ser la huella misma.
    """
    nucleo = ModeloNucleo()
    nucleo.abrir(str(DUENO))
    solidos = [
        elemento
        for tipo in ("IfcWall", "IfcSlab", "IfcBeam", "IfcColumn")
        for elemento in nucleo.modelo.by_type(tipo)
    ]
    muros = list(nucleo.modelo.by_type("IfcWall"))
    for z in (0.06, 1.00, 2.30, 3.14, 3.40):
        union = unary_union([_seccion_horizontal(nucleo, e, z) for e in solidos])
        for muro in muros:
            huella = _huella_global(nucleo, muro)
            diferencia = huella.difference(union).area
            assert diferencia < 1e-6, (
                f"z = {z}: el muro {muro.GlobalId} deja un hueco de "
                f"{diferencia:.9f} m²"
            )
