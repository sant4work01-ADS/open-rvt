"""O041: cerramientos de verdad, la zapata no corta la losa y castillos rápidos.

Los tiempos se miden con la misma retícula de la spec (muros corridos, no
segmentados): una retícula de n × n cuartos son n + 1 muros horizontales y
n + 1 verticales, con castillos automáticos a separación máxima 3 m.

La laptop de la spec tardaba 2.6 / 9.7 / 24.9 s en 2×2 / 3×3 / 4×4; la meta es
4×4 < 2 s y 3×3 < 1 s. El tope de la prueba deja holgura ×3.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "nucleo"))

from openrvt_nucleo.modelo import ModeloNucleo  # noqa: E402


def _retícula(nucleo: ModeloNucleo, n: int) -> list[str]:
    """n × n cuartos: n + 1 muros horizontales y n + 1 verticales (corridos)."""
    nivel = nucleo.niveles()[0]["globalid"]
    dx, dy = 4.0, 3.0
    muros = []
    for i in range(n + 1):
        muros.append(
            nucleo.muro_crear("Block 15", nivel, 0, i * dy, n * dx, i * dy, altura=2.6)[
                "creados"
            ][0]
        )
    for j in range(n + 1):
        muros.append(
            nucleo.muro_crear("Block 15", nivel, j * dx, 0, j * dx, n * dy, altura=2.6)[
                "creados"
            ][0]
        )
    return muros


def _tiempo_castillos(n: int) -> tuple[float, int, int]:
    nucleo = ModeloNucleo()
    nucleo.nuevo("O041 castillos")
    muros = _retícula(nucleo, n)
    inicio = time.perf_counter()
    resultado = nucleo.castillos_automaticos(muros, 3.0, None)
    segundos = time.perf_counter() - inicio
    return segundos, len(muros), len(resultado["creados"])


@pytest.mark.parametrize("n,esperado_muros,esperado_castillos,tope", [
    (3, 8, 28, 3.0),
    (4, 10, 45, 6.0),
])
def test_castillos_automaticos_rapidos(n, esperado_muros, esperado_castillos, tope) -> None:
    """Meta 3×3 < 1 s y 4×4 < 2 s; el tope deja holgura ×3 para la máquina."""
    segundos, muros, castillos = _tiempo_castillos(n)
    assert muros == esperado_muros
    assert castillos == esperado_castillos
    assert segundos < tope, f"{n}×{n} tardó {segundos:.2f} s (tope {tope} s)"


def test_castillos_automaticos_no_regeneran_por_cada_castillo() -> None:
    """O041: se crean todos los castillos y después se regenera una sola vez.

    Se cuenta el número de veces que se llama a ``_recalcular_uniones_estructura``:
    antes del arreglo era uno por castillo más el final (29 en 3×3); ahora debe ser
    una sola llamada.
    """
    from openrvt_nucleo import modelado

    nucleo = ModeloNucleo()
    nucleo.nuevo("O041 recalc")
    muros = _retícula(nucleo, 3)

    def encontrar_clase() -> type:
        for kls in ModeloNucleo.__mro__:
            if "_recalcular_uniones_estructura" in kls.__dict__:
                return kls
        raise AssertionError("no se encontró _recalcular_uniones_estructura")

    kls = encontrar_clase()
    original = kls._recalcular_uniones_estructura
    contador = {"n": 0}

    def patched(self) -> None:
        contador["n"] += 1
        original(self)

    kls._recalcular_uniones_estructura = patched
    try:
        resultado = nucleo.castillos_automaticos(muros, 3.0, None)
        assert len(resultado["creados"]) == 28
        assert contador["n"] == 1, f"se regeneró {contador['n']} veces"
    finally:
        kls._recalcular_uniones_estructura = original
