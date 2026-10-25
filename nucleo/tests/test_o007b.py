"""Pruebas de O007b: secciones, armado, acero estimado y elementos estructurales."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O007b")
    return nucleo


def _tipo(nucleo: ModeloNucleo, clase: str, nombre: str) -> dict:
    return next(t for t in nucleo.tipos_listar(clase) if t["nombre"] == nombre)


def _caja(nucleo: ModeloNucleo, globalid: str) -> tuple[float, float, float, float]:
    import ifcopenshell.geom as geom

    entidad = nucleo._entidad_por_gid(globalid)
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, entidad)
    zs = forma.geometry.verts[2::3]
    return min(zs), max(zs), 0.0, 0.0


def test_acero_castillo_exacto_y_armex() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "IfcColumnType", "K-1 Castillo 15×15")
    nivel = nucleo.niveles()[0]["globalid"]
    castillo = nucleo.columna_crear(
        tipo["nombre"], nivel, 0.0, 0.0, altura=2.60
    )["creados"][0]
    acero = nucleo.acero_estimar(castillo)
    assert acero["longitudinal_kg"] == pytest.approx(5.824, abs=1e-3)
    assert acero["estribos_kg"] == pytest.approx(2.092, abs=1e-3)
    assert acero["total_kg"] == pytest.approx(7.916, abs=1e-3)
    assert acero["detalle"]["estribos"] == 14
    assert acero["detalle"]["largo_estribo_m"] == pytest.approx(0.60, abs=1e-9)

    armex = _tipo(nucleo, "IfcColumnType", "K-2 Castillo armex 15×15")
    otro = nucleo.columna_crear(
        armex["nombre"], nivel, 2.0, 0.0, altura=2.60
    )["creados"][0]
    acero_armex = nucleo.acero_estimar(otro)
    assert acero_armex["total_kg"] == pytest.approx(4.732, abs=1e-3)
    assert acero_armex["estribos_kg"] == 0.0


def test_acero_zapata_aislada_exacto() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20")
    nivel = nucleo.niveles()[0]["globalid"]
    zapata = nucleo.zapata_crear(
        tipo["nombre"], nivel, 0.0, 0.0, desplante=1.00
    )["creados"][0]
    acero = nucleo.acero_estimar(zapata)
    assert acero["longitudinal_kg"] == pytest.approx(13.121, abs=1e-3)
    assert acero["estribos_kg"] == 0.0
    assert acero["total_kg"] == pytest.approx(13.121, abs=1e-3)
    assert acero["detalle"]["barras_x"] == 6
    assert acero["detalle"]["barras_y"] == 6


def test_acero_columna_con_confinamiento_exacto() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "IfcColumnType", "C-1 Columna 30×30")
    nivel = nucleo.niveles()[0]["globalid"]
    columna = nucleo.columna_crear(
        tipo["nombre"], nivel, 0.0, 0.0, altura=3.00
    )["creados"][0]
    acero = nucleo.acero_estimar(columna)
    assert acero["detalle"]["estribos"] == 21
    assert acero["detalle"]["largo_estribo_m"] == pytest.approx(1.20, abs=1e-9)
    assert acero["estribos_kg"] == pytest.approx(14.112, abs=1e-3)
    assert acero["longitudinal_kg"] == pytest.approx(18.624, abs=1e-3)


def test_semilla_de_nueve_tipos_estructurales() -> None:
    nucleo = _nuevo()
    nombres = {t["nombre"] for clase in (
        "IfcFootingType", "IfcColumnType", "IfcBeamType"
    ) for t in nucleo.tipos_listar(clase)}
    assert nombres == {
        "Z-1 Zapata 1.20×1.20", "ZC-1 Zapata corrida 60", "CT-1 Contratrabe 20×40",
        "C-1 Columna 30×30", "K-1 Castillo 15×15", "K-2 Castillo armex 15×15",
        "T-1 Trabe 20×40", "CE-1 Cerramiento 15×20", "DD-1 Dala de desplante 15×20",
    }
    castillo = _tipo(nucleo, "IfcColumnType", "K-1 Castillo 15×15")
    assert castillo["clase"] == "IfcColumnType"
    assert castillo["seccion"]["B"] == pytest.approx(0.15)
    assert castillo["armado"]["LongVarilla"] == "#3"
    # Perfil y material estándar en las piezas lineales; material en las zapatas.
    tipo = nucleo._tipo_por_gid(castillo["globalid"])
    import ifcopenshell.util.element as util_elemento

    material = util_elemento.get_material(tipo)
    assert material.is_a("IfcMaterialProfileSet")
    perfil = material.MaterialProfiles[0].Profile
    assert perfil.is_a("IfcRectangleProfileDef")
    assert perfil.XDim == pytest.approx(0.15)
    zapata = _tipo(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20")
    material_zapata = util_elemento.get_material(nucleo._tipo_por_gid(zapata["globalid"]))
    assert material_zapata.is_a("IfcMaterial")
    assert material_zapata.Name == "Concreto armado"


def test_crear_columna_castillo_viga_zapata_y_corrida() -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    columna = nucleo.columna_crear("C-1 Columna 30×30", nivel, 3.0, 4.0, 0.0)
    entidad = nucleo._entidad_por_gid(columna["creados"][0])
    assert entidad.is_a("IfcColumn")
    assert entidad.PredefinedType == "COLUMN"
    assert nucleo._tipo_de(entidad) == "C-1 Columna 30×30"
    assert _caja(nucleo, columna["creados"][0])[:2] == pytest.approx((0.0, 2.60))

    castillo = nucleo.columna_crear("K-1 Castillo 15×15", nivel, 0.0, 0.0)
    entidad_c = nucleo._entidad_por_gid(castillo["creados"][0])
    assert entidad_c.is_a("IfcColumn")
    assert entidad_c.PredefinedType == "USERDEFINED"
    assert entidad_c.ObjectType == "CASTILLO"

    viga = nucleo.viga_crear("T-1 Trabe 20×40", nivel, 0.0, 0.0, 4.0, 0.0, 0.5)
    entidad_v = nucleo._entidad_por_gid(viga["creados"][0])
    assert entidad_v.is_a("IfcBeam")
    assert entidad_v.PredefinedType == "BEAM"
    minimo, maximo, _, _ = _caja(nucleo, viga["creados"][0])
    assert minimo == pytest.approx(0.10)
    assert maximo == pytest.approx(0.50)

    dala = nucleo.viga_crear("DD-1 Dala de desplante 15×20", nivel, 0.0, 0.0, 4.0, 0.0)
    entidad_d = nucleo._entidad_por_gid(dala["creados"][0])
    assert entidad_d.is_a("IfcBeam")
    assert entidad_d.ObjectType == "DALA_DESPLANTE"
    minimo, maximo, _, _ = _caja(nucleo, dala["creados"][0])
    assert minimo == pytest.approx(0.0)
    assert maximo == pytest.approx(0.20)

    contratrabe = nucleo.viga_crear(
        "CT-1 Contratrabe 20×40", nivel, 0.0, 0.0, 4.0, 0.0
    )
    entidad_ct = nucleo._entidad_por_gid(contratrabe["creados"][0])
    assert entidad_ct.is_a("IfcFooting")
    assert entidad_ct.PredefinedType == "FOOTING_BEAM"

    zapata = nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel, 0.0, 0.0, desplante=1.00)
    entidad_z = nucleo._entidad_por_gid(zapata["creados"][0])
    assert entidad_z.is_a("IfcFooting")
    assert entidad_z.PredefinedType == "PAD_FOOTING"
    minimo, maximo, _, _ = _caja(nucleo, zapata["creados"][0])
    assert minimo == pytest.approx(-1.05)  # la plantilla va debajo del desplante
    assert maximo == pytest.approx(-0.15)  # el dado llega hasta -0.15

    corrida = nucleo.zapata_corrida_crear(
        "ZC-1 Zapata corrida 60", nivel, 0.0, 0.0, 6.0, 0.0, 0.80
    )
    entidad_zc = nucleo._entidad_por_gid(corrida["creados"][0])
    assert entidad_zc.is_a("IfcFooting")
    assert entidad_zc.PredefinedType == "STRIP_FOOTING"
    minimo, maximo, _, _ = _caja(nucleo, corrida["creados"][0])
    assert minimo == pytest.approx(-0.85)
    assert maximo == pytest.approx(-0.60)

    psets = nucleo._leer_pset(entidad_z, "OPENRVT_Estructura")
    assert psets["Desplante"] == pytest.approx(1.00)
    assert nucleo._leer_pset(entidad_c, "OPENRVT_Estructura")["Altura"] == pytest.approx(2.60)


def test_errores_de_altura_y_puntos_coincidentes() -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0, altura=0.0)
    assert exc.value.codigo == -32602
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.viga_crear("T-1 Trabe 20×40", nivel, 1.0, 1.0, 1.0, 1.0)
    assert exc.value.codigo == -32602
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.zapata_corrida_crear("ZC-1 Zapata corrida 60", nivel, 1.0, 1.0, 1.0, 1.0)
    assert exc.value.codigo == -32602


def test_editar_seccion_regenera_instancias_y_deshace_en_un_paso() -> None:
    nucleo = _nuevo()
    tipo = _tipo(nucleo, "IfcColumnType", "C-1 Columna 30×30")
    nivel = nucleo.niveles()[0]["globalid"]
    primera = nucleo.columna_crear(tipo["nombre"], nivel, 0.0, 0.0)["creados"][0]
    segunda = nucleo.columna_crear(tipo["nombre"], nivel, 4.0, 0.0)["creados"][0]
    resultado = nucleo.tipos_editar(tipo["globalid"], {"seccion": {"B": 0.35, "H": 0.35}})
    assert sorted(resultado["modificados"]) == sorted([primera, segunda])
    assert nucleo.tipos_obtener(tipo["globalid"])["seccion"]["B"] == pytest.approx(0.35)
    import ifcopenshell.geom as geom

    for gid, centro in ((primera, 0.0), (segunda, 4.0)):
        entidad = nucleo._entidad_por_gid(gid)
        ajustes = geom.settings()
        ajustes.set(ajustes.USE_WORLD_COORDS, True)
        forma = geom.create_shape(ajustes, entidad)
        xs = forma.geometry.verts[0::3]
        assert min(xs) == pytest.approx(centro - 0.175)
        assert max(xs) == pytest.approx(centro + 0.175)
    nucleo.deshacer()
    assert nucleo.tipos_obtener(tipo["globalid"])["seccion"]["B"] == pytest.approx(0.30)
    entidad = nucleo._entidad_por_gid(primera)
    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, entidad)
    xs = forma.geometry.verts[0::3]
    assert max(xs) == pytest.approx(0.15)


def test_copiar_y_mover_conservan_tipo_pset_y_geometria() -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    original = nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0)["creados"][0]
    copia = nucleo.elementos_copiar([original], 4.0, 0.0, 0.0)["creados"][0]
    entidad = nucleo._entidad_por_gid(copia)
    datos = nucleo._leer_pset(entidad, "OPENRVT_Estructura")
    assert datos["X"] == pytest.approx(4.0)
    assert nucleo._tipo_de(entidad) == "C-1 Columna 30×30"
    assert nucleo.acero_estimar(copia)["total_kg"] == pytest.approx(28.909, abs=1e-3)
    nucleo.elementos_mover([copia], 1.0, 2.0, 0.0)
    datos = nucleo._leer_pset(entidad, "OPENRVT_Estructura")
    assert (datos["X"], datos["Y"]) == pytest.approx((5.0, 2.0))
    # Regenerar el tipo respeta la nueva posición.
    tipo = _tipo(nucleo, "IfcColumnType", "C-1 Columna 30×30")
    nucleo.tipos_editar(tipo["globalid"], {"seccion": {"B": 0.35, "H": 0.35}})
    import ifcopenshell.geom as geom

    ajustes = geom.settings()
    ajustes.set(ajustes.USE_WORLD_COORDS, True)
    forma = geom.create_shape(ajustes, entidad)
    xs = forma.geometry.verts[0::3]
    assert min(xs) == pytest.approx(4.825)
    assert max(xs) == pytest.approx(5.175)


def test_guardar_reabrir_conserva_tipos_psets_perfil_y_armado(tmp_path: Path) -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0)
    nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel, 0.0, 0.0)
    ruta = tmp_path / "estructura.ifc"
    nucleo.guardar(str(ruta))

    otro = ModeloNucleo()
    otro.abrir(str(ruta))
    castillo = _tipo(otro, "IfcColumnType", "K-2 Castillo armex 15×15")
    assert castillo["armado"]["Armex"] == "15x15-4"
    columna = _tipo(otro, "IfcColumnType", "C-1 Columna 30×30")
    assert columna["seccion"]["B"] == pytest.approx(0.30)
    import ifcopenshell.util.element as util_elemento

    material = util_elemento.get_material(otro._tipo_por_gid(columna["globalid"]))
    assert material.is_a("IfcMaterialProfileSet")
    assert material.MaterialProfiles[0].Profile.XDim == pytest.approx(0.30)
    # Los 9 tipos están una sola vez (abrir no duplica la semilla).
    nombres = [t["nombre"] for clase in (
        "IfcFootingType", "IfcColumnType", "IfcBeamType"
    ) for t in otro.tipos_listar(clase)]
    assert len(nombres) == len(set(nombres)) == 9


def test_modelo_estructural_pasa_validar_sin_errores() -> None:
    nucleo = _nuevo()
    nivel = nucleo.niveles()[0]["globalid"]
    nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel, 0.0, 0.0)
    nucleo.columna_crear("C-1 Columna 30×30", nivel, 0.0, 0.0)
    nucleo.columna_crear("K-1 Castillo 15×15", nivel, 4.0, 0.0)
    nucleo.viga_crear("T-1 Trabe 20×40", nivel, 0.0, 0.0, 4.0, 0.0)
    nucleo.viga_crear("CE-1 Cerramiento 15×20", nivel, 0.0, 0.0, 4.0, 4.0)
    nucleo.viga_crear("DD-1 Dala de desplante 15×20", nivel, 0.0, 4.0, 4.0, 4.0)
    nucleo.viga_crear("CT-1 Contratrabe 20×40", nivel, 0.0, 0.0, 4.0, 0.0)
    nucleo.zapata_corrida_crear("ZC-1 Zapata corrida 60", nivel, 0.0, 2.0, 4.0, 2.0)
    assert nucleo.validar() == []


def test_servidor_expone_los_metodos_de_estructura() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    tipos = servidor.despachar("tipos.listar", {"clase": "IfcColumnType"})
    assert len(tipos) == 3
    varillas = servidor.despachar("acero.varillas", {})
    assert varillas["varillas"]["#5"]["peso_kg_m"] == pytest.approx(1.552)
    creada = servidor.despachar("columnas.crear", {
        "tipo": "C-1 Columna 30×30", "nivel": nivel, "x": 0, "y": 0,
        "altura": 3.0,
    })
    assert len(creada["creados"]) == 1
    acero = servidor.despachar("acero.estimar", {"globalid": creada["creados"][0]})
    assert acero["total_kg"] == pytest.approx(18.624 + 14.112, abs=1e-3)
