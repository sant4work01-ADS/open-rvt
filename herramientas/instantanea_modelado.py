"""Imprime la instantánea de nombres de ``openrvt_nucleo.modelado`` para comparar ramas.

Uso (desde ``nucleo/``)::

    PYTHONPATH=. python ../herramientas/instantanea_modelado.py > rama.json

La salida tiene los nombres de nivel módulo y los atributos de ``ModeladoMixin``.
O064 los compara entre ``main`` y la rama para comprobar que no se perdió nada.
"""

import json

import openrvt_nucleo.modelado as modelado
from openrvt_nucleo.modelado import ModeladoMixin

modulo = sorted(nombre for nombre in vars(modelado) if not nombre.startswith("__"))
mixin = sorted(nombre for nombre in dir(ModeladoMixin) if not nombre.startswith("__"))
print(
    json.dumps(
        {"modulo": modulo, "mixin": mixin, "n_modulo": len(modulo), "n_mixin": len(mixin)},
        ensure_ascii=False,
    )
)
