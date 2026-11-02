"""O038: `modelo.arbol` agrupa el proyecto por capas (modo Modelo).

Valores calculados a mano con el modelo de la spec:

- 2 niveles (Nivel 0 en 0.00 y Nivel 1 en 2.60).
- 4 muros en Nivel 0, 1 losa en Nivel 1, 1 columna y 1 zapata en Nivel 0, 1 puerta
  sobre el primer muro y 2 ejes.

Conteos esperados:

- Edificio: 8 elementos (4 muros + losa + columna + zapata + puerta).
- Nivel 0: 7 elementos (4 muros + columna + zapata + puerta).
- Nivel 1: 1 elemento (la losa).
- Referencias → Ejes: 2; Referencias → Niveles: 2.

Tras borrar un muro (4 → 3), cambiar otro de nivel y deshacer, los conteos siguen la
secuencia 4 → 3 → 2 → 3 en los muros de Nivel 0.
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
    nucleo.nuevo("O038")
    return nucleo


def _nodo_hijo(nodo: dict, clave: str) -> dict | None:
    for hijo in nodo.get("hijos", ()):
        if hijo.get("clave") == clave or hijo.get("nombre") == clave:
            return hijo
    return None


def _nivel(arbol: dict, nombre: str) -> dict | None:
    return _nodo_hijo(arbol, nombre)


def _categoria(nivel: dict, clave_cat: str) -> dict | None:
    for hijo in nivel.get("hijos", ()):
        if hijo.get("categoria") == clave_cat:
            return hijo
    return None


def _grupo(arbol: dict, nombre: str) -> dict | None:
    refs = next(h for h in arbol["hijos"] if h["tipo"] == "referencias")
    return _nodo_hijo(refs, nombre)


def _modelo_ocho(nucleo: ModeloNucleo) -> tuple[str, str, list[str]]:
    """Crea el modelo de la spec y devuelve (nivel0, nivel1, muros)."""
    nivel0 = nucleo.niveles()[0]["globalid"]
    nivel1 = nucleo.nivel_crear("Nivel 1", 2.60)["creados"][0]
    muros = [
        nucleo.muro_crear("Block 15", nivel0, x1, y1, x2, y2)["creados"][0]
        for (x1, y1, x2, y2) in [(0, 0, 4, 0), (0, 1, 4, 1), (0, 2, 4, 2), (0, 3, 4, 3)]
    ]
    nucleo.losa_crear(nivel1, [(0, 0), (4, 0), (4, 3), (0, 3)])
    nucleo.columna_crear("C-1 Columna 30×30", nivel0, 6.0, 1.0)
    nucleo.zapata_crear("Z-1 Zapata 1.20×1.20", nivel0, 6.0, 0.0)
    nucleo.abertura_crear("IfcDoor", muros[0], 1.0)
    nucleo.eje_crear("1", 0, 0, 0, 6)
    nucleo.eje_crear("A", 0, 0, 6, 0)
    return nivel0, nivel1, muros


def _contar_elementos(nodo: dict) -> int:
    """Suma de elementos (hojas tipo `elemento`) de un subárbol, sin importar su nivel."""
    if nodo.get("tipo") == "elemento":
        return 1
    return sum(_contar_elementos(h) for h in nodo.get("hijos", ()))


def test_arbol_conteos_a_mano() -> None:
    """Los conteos del árbol coinciden con el modelo contado a mano."""
    nucleo = _nuevo()
    nivel0, nivel1, _muros = _modelo_ocho(nucleo)
    arbol = nucleo.arbol()

    assert arbol["tipo"] == "edificio"
    assert arbol["conteo"] == 8

    n0 = _nivel(arbol, "Nivel 0")
    n1 = _nivel(arbol, "Nivel 1")
    assert n0 is not None and n1 is not None
    assert n0["conteo"] == 7
    assert n1["conteo"] == 1

    # Nivel 0: muros, columnas, zapatas y puertas; la losa está en Nivel 1.
    assert _categoria(n0, "muros")["conteo"] == 4
    assert _categoria(n0, "columnas")["conteo"] == 1
    assert _categoria(n0, "zapatas")["conteo"] == 1
    assert _categoria(n0, "puertas")["conteo"] == 1
    assert _categoria(n1, "losas")["conteo"] == 1
    assert _categoria(n1, "muros") is None

    # Cada nivel se ordena por elevación y cada elemento aparece una sola vez.
    niveles_orden = [h["nombre"] for h in arbol["hijos"] if h["tipo"] == "nivel"]
    assert niveles_orden == ["Nivel 0", "Nivel 1"]
    assert _contar_elementos(arbol) == 8

    # Referencias: 2 ejes y 2 niveles, fuera de la jerarquía de niveles.
    assert _grupo(arbol, "Ejes")["conteo"] == 2
    assert _grupo(arbol, "Niveles")["conteo"] == 2
    assert _grupo(arbol, "Ejes")["hijos"][0]["tipo"] == "eje"
    assert _grupo(arbol, "Niveles")["hijos"][0]["tipo"] == "nivel-ref"


def test_arbol_tras_borrar_cambiar_y_deshacer() -> None:
    """Borrar, cambiar de nivel y deshacer mueven los conteos 4 → 3 → 2 → 3."""
    nucleo = _nuevo()
    nivel0, nivel1, muros = _modelo_ocho(nucleo)

    def muros_nivel(nombre: str) -> int:
        nivel = _nivel(nucleo.arbol(), nombre)
        categoria = _categoria(nivel, "muros") if nivel else None
        return categoria["conteo"] if categoria else 0

    assert muros_nivel("Nivel 0") == 4

    # Borrar el primer muro: 4 → 3 (la puerta cuelga del muro y se va con él).
    nucleo.elementos_borrar([muros[0]])
    assert muros_nivel("Nivel 0") == 3

    # Cambiar el segundo muro a Nivel 1 (sin tope, altura 2.60): 3 → 2 en Nivel 0
    # y 1 en Nivel 1.
    nucleo.restricciones_editar(
        muros[1], nivel_base=nivel1, nivel_tope="", altura_sin_conexion=2.60
    )
    assert muros_nivel("Nivel 0") == 2
    assert muros_nivel("Nivel 1") == 1

    # Deshacer el cambio de nivel: el muro vuelve a Nivel 0 (2 → 3).
    nucleo.deshacer()
    assert muros_nivel("Nivel 0") == 3
    assert muros_nivel("Nivel 1") == 0


def test_arbol_categorias_estructurales_por_alias() -> None:
    """Castillos, trabes, dalas, cerramientos y contratrabes se separan por alias."""
    nucleo = _nuevo()
    nivel0 = nucleo.niveles()[0]["globalid"]
    nucleo.muro_crear("Block 15", nivel0, 0, 0, 4, 0)
    muro = nucleo.muro_crear("Block 15", nivel0, 0, 1, 4, 1)["creados"][0]
    nucleo.castillo_crear_en_muro("K-1 Castillo 15×15", muro, 1.0)
    nucleo.cerramiento_crear_en_muro("CE-1 Cerramiento 15×20", muro)
    nucleo.dala_crear_en_muro("DD-1 Dala de desplante 15×20", muro)

    arbol = nucleo.arbol()
    n0 = _nivel(arbol, "Nivel 0")
    assert _categoria(n0, "muros")["conteo"] == 2
    assert _categoria(n0, "castillos")["conteo"] == 1
    assert _categoria(n0, "dalas_cerramientos")["conteo"] == 2
