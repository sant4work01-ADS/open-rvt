"""Constantes compartidas de las interacciones (O065)."""

from __future__ import annotations

LIGA = "OPENRVT_Liga"
PRIORIDAD = {
    "zapata": 0,
    "zapata_corrida": 0,
    "contratrabe": 1,
    "columna": 2,
    "trabe": 3,
    "losa": 4,
    "castillo": 5,
    "cerramiento": 6,
    "dala": 6,
    "muro": 7,
    "acabado": 8,
}

# Largo de referencia para expresar el acero de una pieza tipo en kg/m (O007c §7).
LARGOS_REFERENCIA = {
    "columna": 3.00,
    "castillo": 3.00,
    "trabe": 4.00,
    "cerramiento": 4.00,
    "dala": 4.00,
    "contratrabe": 4.00,
    "zapata_corrida": 4.00,
}
