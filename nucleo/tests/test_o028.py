"""O028: elementos enlazados a ejes y niveles.

Valores calculados a mano (spec O028):
- ejes A (x=0), B (x=5), 1 (y=0), 2 (y=4); zapata en A-1 con dx 0.10 → (0.10, 0);
  mover A a x=1 → (1.10, 0).
- contratrabe en el eje 1 de A a B → 5.00 m; mover B a x=6 → 6.00 m.
- muro de 0.15 en el eje 2 por su cara exterior → centro y=4 + 0.075 = 4.075;
  mover el eje 2 a y=5 → 5.075.
- nivel de desplante de −1.20 a −1.50: zapata y contratrabe bajan 0.30 y la
  columna con tope en Nivel 1 pasa de 4.20 a 4.50 m.
- borrar el eje B deja el contratrabe con su largo y sin enlace final.
"""

from __future__ import annotations

import sys
from pathlib import Path

import ifcopenshell.util.placement as placement
import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelado import PSET_RESTRICCIONES  # noqa: E402
from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402
from openrvt_nucleo.servidor import Servidor  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O028")
    return nucleo


def _entidad(nucleo: ModeloNucleo, gid: str):
    return next(e for e in nucleo.modelo.by_type("IfcProduct") if e.GlobalId == gid)


def _pset(nucleo: ModeloNucleo, gid: str) -> dict:
    return nucleo._leer_pset(_entidad(nucleo, gid), PSET_RESTRICCIONES)


def _plano(nucleo: ModeloNucleo, gid: str) -> tuple[float, float]:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[0][3]), float(matriz[1][3])


def _z(nucleo: ModeloNucleo, gid: str) -> float:
    matriz = placement.get_local_placement(_entidad(nucleo, gid).ObjectPlacement)
    return float(matriz[2][3])


def _tipo(nucleo: ModeloNucleo, clase: str, nombre: str) -> str:
    return next(t["nombre"] for t in nucleo.tipos_listar(clase) if t["nombre"] == nombre)


def _reticula(nucleo: ModeloNucleo) -> tuple[str, str, str, str]:
    a = nucleo.eje_crear("A", 0, 0, 0, 10)["creados"][0]
    b = nucleo.eje_crear("B", 5, 0, 5, 10)["creados"][0]
    uno = nucleo.eje_crear("1", 0, 0, 5, 0)["creados"][0]
    dos = nucleo.eje_crear("2", 0, 4, 5, 4)["creados"][0]
    return a, b, uno, dos


def _nivel(nucleo: ModeloNucleo) -> str:
    return nucleo.niveles()[0]["globalid"]


def test_zapata_en_cruce_sigue_al_mover_el_eje() -> None:
    nucleo = _nuevo()
    a, _b, uno, _dos = _reticula(nucleo)
    tipo = _tipo(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20")
    zapata = nucleo.zapata_crear(tipo, _nivel(nucleo), 0, 0)["creados"][0]
    nucleo.enlazar_a_cruce(zapata, a, uno, 0.10, 0.0)
    assert _plano(nucleo, zapata) == pytest.approx((0.10, 0.0))
    nucleo.ejes_mover(a, 1.0)
    assert _plano(nucleo, zapata) == pytest.approx((1.10, 0.0))


def test_contratrabe_entre_cruces_se_alarga_al_mover_b() -> None:
    nucleo = _nuevo()
    a, b, uno, _dos = _reticula(nucleo)
    tipo = _tipo(nucleo, "IfcFootingType", "CT-1 Contratrabe 20×40")
    viga = nucleo.viga_crear(tipo, _nivel(nucleo), 0, 0, 5, 0, desfase=-0.10)["creados"][0]
    nucleo.enlazar_tramo(viga, uno, a, b, 0.0, 0.0, 0.0)
    assert _pset(nucleo, viga)["EnlaceDesfase"] == pytest.approx(0.0)
    assert nucleo.propiedades(viga)["psets"]["OPENRVT_Estructura"]["Longitud"] == pytest.approx(5.0)
    nucleo.ejes_mover(b, 1.0)
    assert nucleo.propiedades(viga)["psets"]["OPENRVT_Estructura"]["Longitud"] == pytest.approx(6.0)
    assert _plano(nucleo, viga) == pytest.approx((0.0, 0.0))


def test_muro_por_su_cara_exterior_en_un_eje_guia() -> None:
    nucleo = _nuevo()
    a, b, _uno, dos = _reticula(nucleo)
    muro = nucleo.muro_crear("Block 15", _nivel(nucleo), 0, 4, 5, 4)["creados"][0]
    nucleo.enlazar_tramo(muro, dos, a, b, 0.075, 0.0, 0.0)
    assert _plano(nucleo, muro)[1] == pytest.approx(4.075)
    nucleo.ejes_mover(dos, -1.0)
    assert _plano(nucleo, muro)[1] == pytest.approx(5.075)


def test_mover_el_nivel_de_desplante_baja_y_alarga() -> None:
    nucleo = _nuevo()
    n1 = nucleo.nivel_crear("Nivel 1", 3.0)["creados"][0]
    desplante = nucleo.nivel_crear("Desplante", -1.20)["creados"][0]
    tipo_zapata = _tipo(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20")
    tipo_contratrabe = _tipo(nucleo, "IfcFootingType", "CT-1 Contratrabe 20×40")
    tipo_columna = _tipo(nucleo, "IfcColumnType", "C-1 Columna 30×30")
    zapata = nucleo.zapata_crear(tipo_zapata, desplante, 0, 0)["creados"][0]
    contratrabe = nucleo.viga_crear(
        tipo_contratrabe, desplante, 0, 0, 5, 0, desfase=-0.10
    )["creados"][0]
    columna = nucleo.columna_crear(
        tipo_columna, desplante, 2, 2, nivel_superior=n1
    )["creados"][0]
    assert _z(nucleo, zapata) == pytest.approx(-2.20)
    assert _z(nucleo, contratrabe) == pytest.approx(-1.50)
    assert nucleo.propiedades(columna)["psets"]["OPENRVT_Estructura"]["Altura"] == pytest.approx(4.20)
    nucleo.nivel_editar(desplante, elevacion=-1.50)
    assert _z(nucleo, zapata) == pytest.approx(-2.50)
    assert _z(nucleo, contratrabe) == pytest.approx(-1.80)
    assert nucleo.propiedades(columna)["psets"]["OPENRVT_Estructura"]["Altura"] == pytest.approx(4.50)


def test_borrar_eje_suelta_el_tramo_y_conserva_el_largo() -> None:
    nucleo = _nuevo()
    a, b, uno, _dos = _reticula(nucleo)
    tipo = _tipo(nucleo, "IfcFootingType", "CT-1 Contratrabe 20×40")
    viga = nucleo.viga_crear(tipo, _nivel(nucleo), 0, 0, 5, 0, desfase=-0.10)["creados"][0]
    nucleo.enlazar_tramo(viga, uno, a, b, 0.0, 0.0, 0.0)
    resultado = nucleo.eje_borrar(b)
    assert resultado["soltados"]
    assert _pset(nucleo, viga).get("EnlaceTipo") is None
    assert nucleo.propiedades(viga)["psets"]["OPENRVT_Estructura"]["Longitud"] == pytest.approx(5.0)


def test_deshacer_un_paso_devuelve_zapata_y_contratrabe() -> None:
    nucleo = _nuevo()
    a, b, uno, _dos = _reticula(nucleo)
    tipo = _tipo(nucleo, "IfcFootingType", "Z-1 Zapata 1.20×1.20")
    zapata = nucleo.zapata_crear(tipo, _nivel(nucleo), 0, 0)["creados"][0]
    nucleo.enlazar_a_cruce(zapata, a, uno, 0.10, 0.0)
    nucleo.ejes_mover(a, 1.0)
    assert _plano(nucleo, zapata) == pytest.approx((1.10, 0.0))
    assert nucleo.deshacer()["hecho"] is True
    assert _plano(nucleo, zapata) == pytest.approx((0.10, 0.0))
    assert _pset(nucleo, zapata)["EnlaceEjeA"] == a


def test_herramientas_por_lote_y_rpc() -> None:
    servidor = Servidor()
    servidor.despachar("proyecto.nuevo", {"nombre": "RPC O028"})
    nivel = servidor.despachar("modelo.niveles", {})[0]["globalid"]
    ejes = {}
    for etiqueta, x1, y1, x2, y2 in (
        ("A", 0, 0, 0, 10), ("B", 5, 0, 5, 10), ("C", 10, 0, 10, 10),
        ("1", 0, 0, 10, 0), ("2", 0, 4, 10, 4),
    ):
        ejes[etiqueta] = servidor.despachar(
            "ejes.crear", {"etiqueta": etiqueta, "x1": x1, "y1": y1, "x2": x2, "y2": y2}
        )["creados"][0]
    zapatas = servidor.despachar(
        "zapatas.en_cruces",
        {"tipo": "Z-1 Zapata 1.20×1.20", "nivel": nivel},
    )
    assert len(zapatas["creados"]) == 6
    contratrabes = servidor.despachar(
        "contratrabes.entre_ejes",
        {"tipo": "CT-1 Contratrabe 20×40", "nivel": nivel, "eje_guia": ejes["2"]},
    )
    assert len(contratrabes["creados"]) == 2
    servidor.despachar("ejes.mover", {"globalid": ejes["B"], "desplazamiento": 1.0})
    nucleo = servidor._exigir()
    for gid in zapatas["creados"]:
        x, y = _plano(nucleo, gid)
        assert any(x == pytest.approx(v) for v in (0.0, 6.0, 10.0))
    largos = [
        nucleo.propiedades(gid)["psets"]["OPENRVT_Estructura"]["Longitud"]
        for gid in contratrabes["creados"]
    ]
    assert largos == pytest.approx([6.0, 4.0])
    servidor.despachar(
        "restricciones.soltar_enlace", {"globalid": zapatas["creados"][0]}
    )
    assert _pset(nucleo, zapatas["creados"][0]).get("EnlaceTipo") is None
