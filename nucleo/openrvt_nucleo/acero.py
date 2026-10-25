"""Acero estimado de los elementos estructurales (O007b).

Las fórmulas son deliberadamente sencillas y exactas: con la sección y el armado
del tipo se obtienen los kilogramos de una pieza tipo (kg/m en piezas lineales) o
de una zapata (kg por pieza). No se generan barras IFC todavía.
"""

from __future__ import annotations

import math
from typing import Any

from .biblioteca import ARMEX, VARILLAS, _texto


def _peso(varilla: str) -> float:
    return float(VARILLAS.get(_texto(varilla), {}).get("peso_kg_m", 0.0))


def _dimensiones(seccion: dict[str, Any]) -> tuple[float, float]:
    if _texto(seccion.get("Forma") or "rectangular") == "circular":
        diametro = float(seccion.get("D") or 0.0)
        return diametro, diametro
    return float(seccion.get("B") or 0.0), float(seccion.get("H") or 0.0)


def _piezas_estribos(largo: float, armado: dict[str, Any]) -> int:
    separacion_centro = float(armado.get("EstSepCentro") or 0.20)
    confinamiento = float(armado.get("EstLongConfinamiento") or 0.0)
    if separacion_centro <= 0:
        return 0
    if confinamiento <= 0:
        return int(math.floor(largo / separacion_centro)) + 1
    separacion_extremo = float(armado.get("EstSepExtremos") or separacion_centro)
    piezas_extremo = 0
    if separacion_extremo > 0:
        piezas_extremo = int(math.floor(confinamiento / separacion_extremo))
    centro = int(math.floor(max(largo - 2.0 * confinamiento, 0.0) / separacion_centro)) + 1
    return 2 * piezas_extremo + centro


def acero_pieza_lineal(
    seccion: dict[str, Any],
    armado: dict[str, Any],
    largo: float,
) -> dict[str, Any]:
    """Acero de una pieza lineal de largo ``largo`` (columna, trabe, dala…)."""
    recubrimiento = float(armado.get("Recubrimiento") or 0.025)
    armex = _texto(armado.get("Armex")).strip()
    if armex:
        total = largo * float(ARMEX.get(armex, 0.0))
        return {
            "longitudinal_kg": round(total, 3),
            "estribos_kg": 0.0,
            "total_kg": round(total, 3),
            "detalle": {
                "armex": armex,
                "largo_m": round(largo, 3),
                "kg_m": float(ARMEX.get(armex, 0.0)),
            },
        }
    b, h = _dimensiones(seccion)
    cantidad = int(armado.get("LongCantidad") or 0)
    peso_longitudinal = _peso(_texto(armado.get("LongVarilla")))
    longitudinal = cantidad * largo * peso_longitudinal
    largo_estribo = 2.0 * (b - 2.0 * recubrimiento) + 2.0 * (h - 2.0 * recubrimiento) + 0.20
    piezas = _piezas_estribos(largo, armado)
    estribos = piezas * largo_estribo * _peso(_texto(armado.get("EstVarilla")))
    return {
        "longitudinal_kg": round(longitudinal, 3),
        "estribos_kg": round(estribos, 3),
        "total_kg": round(longitudinal + estribos, 3),
        "detalle": {
            "largo_m": round(largo, 3),
            "longitudinal": cantidad,
            "varilla": _texto(armado.get("LongVarilla")),
            "estribos": piezas,
            "largo_estribo_m": round(largo_estribo, 3),
            "varilla_estribo": _texto(armado.get("EstVarilla")),
        },
    }


def acero_zapata_aislada(seccion: dict[str, Any], armado: dict[str, Any]) -> dict[str, Any]:
    recubrimiento = float(armado.get("Recubrimiento") or 0.05)
    largo = float(seccion.get("Largo") or 0.0)
    ancho = float(seccion.get("Ancho") or 0.0)
    sep_x = float(armado.get("ParrillaSepX") or 0.20)
    sep_y = float(armado.get("ParrillaSepY") or 0.20)
    barras_x = int(math.floor(max(ancho - 2.0 * recubrimiento, 0.0) / sep_x)) + 1 if sep_x > 0 else 0
    barras_y = int(math.floor(max(largo - 2.0 * recubrimiento, 0.0) / sep_y)) + 1 if sep_y > 0 else 0
    peso = _peso(_texto(armado.get("ParrillaVarilla")))
    longitud_x = max(largo - 2.0 * recubrimiento, 0.0)
    longitud_y = max(ancho - 2.0 * recubrimiento, 0.0)
    total = (barras_x * longitud_x + barras_y * longitud_y) * peso
    return {
        "longitudinal_kg": round(total, 3),
        "estribos_kg": 0.0,
        "total_kg": round(total, 3),
        "detalle": {
            "barras_x": barras_x,
            "barras_y": barras_y,
            "longitud_x_m": round(longitud_x, 3),
            "longitud_y_m": round(longitud_y, 3),
            "varilla": _texto(armado.get("ParrillaVarilla")),
        },
    }


def acero_zapata_corrida(
    seccion: dict[str, Any], armado: dict[str, Any], largo: float
) -> dict[str, Any]:
    recubrimiento = float(armado.get("Recubrimiento") or 0.05)
    ancho = float(seccion.get("Ancho") or 0.0)
    cantidad = int(armado.get("LongCantidad") or 0)
    bastones = cantidad * largo * _peso(_texto(armado.get("LongVarilla")))
    sep = float(armado.get("ParrillaSepX") or 0.20)
    transversales = int(math.floor(largo / sep)) + 1 if sep > 0 else 0
    largo_transversal = max(ancho - 2.0 * recubrimiento, 0.0)
    acero_transversal = transversales * largo_transversal * _peso(
        _texto(armado.get("ParrillaVarilla"))
    )
    return {
        "longitudinal_kg": round(bastones, 3),
        "estribos_kg": round(acero_transversal, 3),
        "total_kg": round(bastones + acero_transversal, 3),
        "detalle": {
            "largo_m": round(largo, 3),
            "bastones": cantidad,
            "transversales": transversales,
            "largo_transversal_m": round(largo_transversal, 3),
        },
    }


def estimar(
    alias: str,
    seccion: dict[str, Any],
    armado: dict[str, Any],
    largo: float = 0.0,
) -> dict[str, Any]:
    if alias == "zapata":
        return acero_zapata_aislada(seccion, armado)
    if alias == "zapata_corrida":
        return acero_zapata_corrida(seccion, armado, largo)
    return acero_pieza_lineal(seccion, armado, largo)


class AceroMixin:
    """``acero.estimar`` y ``acero.varillas`` (O007b)."""

    def acero_varillas(self) -> dict[str, Any]:  # pragma: no cover - lo define biblioteca
        return {"varillas": VARILLAS, "armex": ARMEX}

    def acero_estimado_tipo(self, tipo: Any) -> dict[str, Any]:
        alias, seccion, armado = self._seccion_y_armado(tipo)
        if alias is None:
            return {}
        if alias in ("zapata", "zapata_corrida"):
            unidad = "kg/pieza"
            resultado = estimar(alias, seccion, armado, 1.0 if alias == "zapata_corrida" else 0.0)
        else:
            unidad = "kg/m"
            resultado = estimar(alias, seccion, armado, 1.0)
        return {"unidad": unidad, **resultado}

    def acero_estimar(self, globalid: str) -> dict[str, Any]:
        self._exigir_modelo()
        elemento = self._entidad_por_gid(globalid)
        tipo = self._tipo_entidad(elemento)
        alias, seccion, armado = self._seccion_y_armado(tipo)
        if alias is None:
            raise self._error("El elemento no es estructural o su tipo no tiene sección.", -32040)
        datos = self._leer_pset(elemento, "OPENRVT_Estructura")
        largo = float(datos.get("Longitud") or datos.get("Altura") or 0.0)
        if largo <= 0 and elemento.is_a("IfcColumn"):
            largo = float(datos.get("Altura") or 0.0)
        resultado = estimar(alias, seccion, armado, largo)
        return {
            **resultado,
            "globalid": _texto(getattr(elemento, "GlobalId", "")),
            "tipo": _texto(getattr(tipo, "Name", "")),
            "alias": alias,
            "largo_m": round(largo, 3),
        }
