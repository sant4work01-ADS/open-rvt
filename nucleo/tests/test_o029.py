"""O029: herramienta «Nivel» y niveles intermedios.

Valores calculados a mano:
- entre Nivel 1 (0.00) y Nivel 2 (3.00), el nivel intermedio va a 1.50 y queda
  en el orden 0.00 → 1.50 → 3.00;
- la vista de planta se crea con el nivel y las dos desaparecen en un Deshacer;
- dos niveles a ±1 mm (3.001 sobre 3.000) no se crean;
- un nombre repetido recibe el sufijo « (2)»;
- Copiar/Desfasar 1.50 + 3.00 = 4.50 y también vuelve con un Deshacer.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _nuevo() -> ModeloNucleo:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O029")
    return nucleo


def _elevaciones(nucleo: ModeloNucleo) -> list[float]:
    return sorted(float(n["elevacion"]) for n in nucleo.niveles())


def test_nivel_intermedio_1_50_orden_y_planta() -> None:
    nucleo = _nuevo()
    if len(nucleo.niveles()) == 1:
        nucleo.nivel_crear("Nivel 2", 3.0)
    resultado = nucleo.nivel_crear("Nivel 1.5", 1.5)
    gid = resultado["creados"][0]
    assert _elevaciones(nucleo) == pytest.approx([0.0, 1.5, 3.0])
    vistas = [v for v in nucleo.leer_vistas() if v.get("tipo") == "planta"]
    planta = next(v for v in vistas if v.get("nivel") == gid)
    assert planta["nombre"] == "Planta Nivel 1.5"
    assert planta["alturaPlano"] == pytest.approx(2.7)
    assert planta["profundidad"] == pytest.approx(0.0)


def test_deshacer_quita_nivel_y_planta() -> None:
    nucleo = _nuevo()
    if len(nucleo.niveles()) == 1:
        nucleo.nivel_crear("Nivel 2", 3.0)
    antes = _elevaciones(nucleo)
    gid = nucleo.nivel_crear("Nivel 1.5", 1.5)["creados"][0]
    assert any(v.get("nivel") == gid for v in nucleo.leer_vistas())
    assert nucleo.deshacer()["hecho"] is True
    assert _elevaciones(nucleo) == pytest.approx(antes)
    assert all(v.get("nivel") != gid for v in nucleo.leer_vistas())
    assert all(n["globalid"] != gid for n in nucleo.niveles())


def test_dos_niveles_a_la_misma_elevacion_no_se_crean() -> None:
    nucleo = _nuevo()
    nucleo.nivel_crear("Nivel 2", 3.0)
    antes = len(nucleo.niveles())
    with pytest.raises(Exception) as error:
        nucleo.nivel_crear("Nivel 3", 3.001)
    assert "misma elevación" in str(error.value)
    assert len(nucleo.niveles()) == antes
    # Justo en el límite de 1 mm también falla; 1.001 mm ya pasa.
    with pytest.raises(Exception):
        nucleo.nivel_crear("Nivel 3", 2.999)
    nucleo.nivel_crear("Nivel 3", 2.997)


def test_nombre_repetido_recibe_sufijo() -> None:
    nucleo = _nuevo()
    nucleo.nivel_crear("Nivel 2", 3.0)
    nombre = nucleo.nivel_crear("Nivel 2", 6.0)["nivel"]["nombre"]
    assert nombre == "Nivel 2 (2)"
    assert any(n["nombre"] == "Nivel 2 (2)" for n in nucleo.niveles())


def test_copiar_nivel_desfase_3_00_pasa_a_4_50_y_deshace() -> None:
    nucleo = _nuevo()
    if len(nucleo.niveles()) == 1:
        nucleo.nivel_crear("Nivel 2", 3.0)
    gid = nucleo.nivel_crear("Nivel 1.5", 1.5)["creados"][0]
    copia = nucleo.nivel_copiar(gid, 3.0)["creados"][0]
    # 4.50 queda sobre Nivel 2 (3.00): el nombre sale de la posición, «Nivel 3»,
    # no de copiar el del origen («Nivel 1.5»).
    nombre = next(n["nombre"] for n in nucleo.niveles() if n["globalid"] == copia)
    assert nombre == "Nivel 3"
    elevaciones = {n["globalid"]: float(n["elevacion"]) for n in nucleo.niveles()}
    assert elevaciones[copia] == pytest.approx(4.5)
    assert any(v.get("nivel") == copia for v in nucleo.leer_vistas())
    assert nucleo.deshacer()["hecho"] is True
    assert copia not in {n["globalid"] for n in nucleo.niveles()}


def test_arreglo_de_tres_niveles_cada_3_00() -> None:
    nucleo = _nuevo()
    base = nucleo.niveles()[0]["globalid"]
    creados = nucleo.niveles_arreglo(base, 3, 3.0)["creados"]
    elevaciones = {n["globalid"]: float(n["elevacion"]) for n in nucleo.niveles()}
    assert [elevaciones[g] for g in creados] == pytest.approx([3.0, 6.0, 9.0])
    nombres = [next(n["nombre"] for n in nucleo.niveles() if n["globalid"] == g) for g in creados]
    # Sobre Nivel 0 (0.00) los siguientes números libres: 3.00 → Nivel 1,
    # 6.00 → Nivel 2, 9.00 → Nivel 3.
    assert nombres == ["Nivel 1", "Nivel 2", "Nivel 3"]
    assert nucleo.deshacer()["hecho"] is True
    assert all(g not in {n["globalid"] for n in nucleo.niveles()} for g in creados)


def test_crear_nivel_guarda_las_vistas_de_la_sesion() -> None:
    """O031: la planta nueva y las vistas ya abiertas comparten la misma instantánea.

    Si solo se guardara la planta, un Deshacer posterior borraría los alzados y el
    3D que el usuario tenía abiertos (o015/o027). Se comprueban los identificadores
    exactos, no solo la cantidad.
    """
    nucleo = _nuevo()
    base = [
        {"id": "planta-n0", "nombre": "Planta Nivel 0", "tipo": "planta", "nivel": "n0"},
        {"id": "alzado-norte", "nombre": "Alzado Norte", "tipo": "alzado"},
        {"id": "iso", "nombre": "3D Isométrica", "tipo": "iso"},
    ]
    nucleo.guardar_vistas(base)
    resultado = nucleo.nivel_crear("Nivel 1", 3.0, vistas=base)
    vistas = nucleo.leer_vistas()
    assert [v["id"] for v in vistas if v["id"] in {"planta-n0", "alzado-norte", "iso"}] == [
        "planta-n0",
        "alzado-norte",
        "iso",
    ]
    nueva = [v for v in vistas if v.get("nivel") == resultado["nivel"]["globalid"]]
    assert len(nueva) == 1 and nueva[0]["nombre"] == "Planta Nivel 1"
    # Las tres vistas de la sesión siguen ahí, además de la planta nueva.
    assert len(vistas) == 4
