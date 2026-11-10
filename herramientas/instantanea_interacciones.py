"""Imprime la instantánea de nombres de ``openrvt_nucleo.interacciones`` para comparar ramas.

Uso (desde ``nucleo/``)::

    PYTHONPATH=. python ../herramientas/instantanea_interacciones.py > rama.json

La salida tiene los nombres de nivel módulo y los atributos de ``InteraccionesMixin``.
O065 la compara entre ``main`` y la rama para comprobar que no se perdió nada.
"""

import json

import openrvt_nucleo.interacciones as interacciones
from openrvt_nucleo.interacciones import InteraccionesMixin

modulo = sorted(nombre for nombre in vars(interacciones) if not nombre.startswith("__"))
mixin = sorted(nombre for nombre in dir(InteraccionesMixin) if not nombre.startswith("__"))
print(
    json.dumps(
        {"modulo": modulo, "mixin": mixin, "n_modulo": len(modulo), "n_mixin": len(mixin)},
        ensure_ascii=False,
    )
)
