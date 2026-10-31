"""O016: restricciones de base y tope por nivel.

Los valores salen de la norma del enunciado y de cuentas a mano:
- base 0.00 + tope 3.00 = altura 3.00;
- base +0.10 y tope −0.20 sobre 3.00 → 0.10 + 2.70 = 2.80 de base a tope, altura 2.70;
- mover la base a −0.10 con tope fijo en 3.00 → 3.00 − (−0.10) = 3.10;
- ventana con antepecho 1.00 y alto 1.20 necesita 2.20 m: tope en 2.00 no cabe.
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.util.placement as placement
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES, altura_restringida  # noqa: E402
from openrvt_nucleo.modelo import ErrorNucleo, ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O016")
    return nucleo


def _niveles(nucleo: ModeloNucleo) -> dict[str, dict]:
    return {n["nombre"]: n for n in nucleo.niveles()}


def _muro(nucleo: ModeloNucleo, gid: str) -> dict:
    return next(e for e in nucleo.elementos() if e["globalid"] == gid)


def _pset(nucleo: ModeloNucleo, gid: str, nombre: str) -> dict:
    return nucleo.propiedades(gid)["psets"].get(nombre, {})


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    entidad = next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)
    return float(placement.get_local_placement(entidad.ObjectPlacement)[2][3])


def _montaje() -> tuple[ModeloNucleo, str, str, str]:
    nucleo = _nuevo()
    n0 = _niveles(nucleo)["Nivel 0"]["globalid"]
    n1 = nucleo.nivel_crear("Nivel 1", 3.0)["creados"][0]
    muro = nucleo.muro_crear("Block 15", n0, 0, 0, 5, 0)["creados"][0]
    return nucleo, n0, n1, muro


def test_funcion_pura_valores_de_la_norma() -> None:
    assert altura_restringida(0.0, 0.0, 3.0, 0.0, None) == (0.0, 3.0)
    assert altura_restringida(0.0, 0.10, 3.0, -0.20, None) == pytest.approx((0.10, 2.70))
    assert altura_restringida(0.0, 0.0, None, 0.0, 2.60) == (0.0, 2.60)
    with pytest.raises(ValueError):
        altura_restringida(3.0, 0.0, 3.0, 0.0, None)


def test_muro_tope_n1_y_al_subir_el_nivel() -> None:
    nucleo, n0, n1, muro = _montaje()
    restricciones = _pset(nucleo, muro, PSET_RESTRICCIONES)
    assert restricciones["NivelBase"] == n0
    assert restricciones["NivelTope"] == n1
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.0)
    nucleo.nivel_editar(n1, elevacion=3.20)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.20)
    assert _z(nucleo, muro) == pytest.approx(0.0)


def test_mover_la_base_con_tope_fijo() -> None:
    nucleo, n0, _n1, muro = _montaje()
    nucleo.nivel_editar(n0, elevacion=-0.10)
    assert _z(nucleo, muro) == pytest.approx(-0.10)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.10)


def test_columna_con_nivel_superior_guarda_restriccion_y_se_recalcula() -> None:
    nucleo, _n0, n1, _muro = _montaje()
    tipo = nucleo.tipos_listar("IfcColumnType")[0]["nombre"]
    columna = nucleo.columna_crear(
        tipo, _niveles(nucleo)["Nivel 0"]["globalid"], 1.0, 1.0, nivel_superior=n1
    )["creados"][0]
    restricciones = _pset(nucleo, columna, PSET_RESTRICCIONES)
    assert restricciones["NivelTope"] == n1
    assert _pset(nucleo, columna, "OPENRVT_Estructura")["Altura"] == pytest.approx(3.0)
    nucleo.nivel_editar(n1, elevacion=3.20)
    assert _pset(nucleo, columna, "OPENRVT_Estructura")["Altura"] == pytest.approx(3.20)
    assert _pset(nucleo, columna, "OPENRVT_Estructura")["Base"] == pytest.approx(0.0)


def test_bajar_el_tope_deja_una_ventana_fuera_y_no_cambia_nada() -> None:
    nucleo, _n0, n1, muro = _montaje()
    nucleo.abertura_crear("IfcWindow", muro, 1.0, 1.0, 1.2, 1.0)
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.nivel_editar(n1, elevacion=2.0)
    assert exc.value.codigo == -32023
    assert "abertura" in exc.value.mensaje.lower()
    assert _niveles(nucleo)["Nivel 1"]["elevacion"] == pytest.approx(3.0)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.0)
    assert _z(nucleo, muro) == pytest.approx(0.0)


def test_borrar_nivel_usado_como_tope_da_error_con_nombre() -> None:
    nucleo, _n0, n1, muro = _montaje()
    nombre = _muro(nucleo, muro)["nombre"]
    with pytest.raises(ErrorNucleo) as exc:
        nucleo.nivel_borrar(n1)
    assert exc.value.codigo == -32021
    assert nombre in exc.value.mensaje
    assert _niveles(nucleo)["Nivel 1"]["elevacion"] == pytest.approx(3.0)


def test_restricciones_editar_y_un_solo_deshacer() -> None:
    nucleo, _n0, _n1, muro = _montaje()
    nucleo.restricciones_editar(muro, desfase_base=0.10)
    assert _z(nucleo, muro) == pytest.approx(0.10)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(2.90)
    assert nucleo.deshacer()["hecho"] is True
    assert _z(nucleo, muro) == pytest.approx(0.0)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.0)


def test_altura_manual_desconecta_el_tope() -> None:
    nucleo, _n0, _n1, muro = _montaje()
    nucleo.elemento_editar(muro, {"altura": 2.50})
    restricciones = _pset(nucleo, muro, PSET_RESTRICCIONES)
    assert restricciones["NivelTope"] == ""
    assert restricciones["AlturaSinConexion"] == pytest.approx(2.50)
    assert _pset(nucleo, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(2.50)


def test_guardar_reabrir_conserva_pset_y_alturas(tmp_path: Path) -> None:
    nucleo, _n0, n1, muro = _montaje()
    destino = tmp_path / "o016.ifc"
    nucleo.guardar(str(destino))
    otro = ModeloNucleo()
    otro.abrir(str(destino))
    restricciones = _pset(otro, muro, PSET_RESTRICCIONES)
    assert restricciones["NivelTope"] == n1
    assert _pset(otro, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.0)
    otro.nivel_editar(n1, elevacion=3.20)
    assert _pset(otro, muro, "OPENRVT_Muro")["Altura"] == pytest.approx(3.20)


def test_ifc_viejo_sin_pset_se_lee_tolerante(tmp_path: Path) -> None:
    nucleo, n0, _n1, muro = _montaje()
    for rel in list(nucleo.modelo.by_type("IfcRelDefinesByProperties")):
        if getattr(rel.RelatingPropertyDefinition, "Name", "") == PSET_RESTRICCIONES:
            nucleo.modelo.remove(rel)
    destino = tmp_path / "viejo.ifc"
    nucleo.guardar(str(destino))
    otro = ModeloNucleo()
    otro.abrir(str(destino))
    restricciones = otro._restricciones_de(
        next(e for e in otro.modelo.by_type("IfcWall") if e.GlobalId == muro)
    )
    assert restricciones["NivelBase"] == n0
    assert restricciones["NivelTope"] == ""
    assert restricciones["DesfaseBase"] == pytest.approx(0.0)
    assert restricciones["AlturaSinConexion"] == pytest.approx(3.0)


def test_servidor_despacha_restricciones_y_mueve_niveles() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O016"})
    n0 = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    n1 = servidor.despachar("niveles.crear", {"nombre": "Nivel 1", "elevacion": 3})[
        "creados"
    ][0]
    muro = servidor.despachar(
        "muros.crear",
        {"tipo": "Block 15", "nivel": n0, "x1": 0, "y1": 0, "x2": 5, "y2": 0},
    )["creados"][0]
    servidor.despachar(
        "restricciones.editar",
        {"globalid": muro, "desfase_base": 0.10, "nivel_tope": "", "altura_sin_conexion": 2.5},
    )
    props = servidor.despachar("modelo.propiedades", {"globalid": muro})
    assert props["psets"][PSET_RESTRICCIONES]["AlturaSinConexion"] == pytest.approx(2.5)
    servidor.despachar(
        "restricciones.editar",
        {"globalid": muro, "desfase_base": 0.0, "nivel_tope": n1},
    )
    servidor.despachar("niveles.editar", {"globalid": n1, "elevacion": 3.2})
    props = servidor.despachar("modelo.propiedades", {"globalid": muro})
    assert props["psets"]["OPENRVT_Muro"]["Altura"] == pytest.approx(3.2)
