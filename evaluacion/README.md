# Evaluación O001 — motores IFC

Todo se ejecuta desde la raíz del repositorio. Las muestras viven en `muestras/` (no se versiona):

```bash
./herramientas/bajar_muestras.sh
```

## Motor A — IfcOpenShell

```bash
python3 -m venv ~/.venvs/openrvt
~/.venvs/openrvt/bin/pip install ifcopenshell pytest
~/.venvs/openrvt/bin/python evaluacion/a_ifcopenshell.py muestras/AC20-FZK-Haus.ifc
```

Escribe `resultados/<muestra>_a.csv` y `resultados/<muestra>_a.json`. Los tiempos son la mediana
de 3 corridas en procesos separados (`--repeticiones 3` por omisión).

## Motor B — web-ifc

```bash
cd evaluacion
npm install
node b_webifc.mjs ../muestras/AC20-FZK-Haus.ifc
```

Escribe `resultados/<muestra>_b.csv` y `.json` con el mismo criterio de mediana.

## Comparación y pruebas

```bash
~/.venvs/openrvt/bin/python evaluacion/comparar.py \
  resultados/AC20-FZK-Haus_a.csv resultados/AC20-FZK-Haus_b.csv \
  --json resultados/AC20-FZK-Haus_comparacion.json

~/.venvs/openrvt/bin/python -m pytest evaluacion/test_comparar.py -q
~/.venvs/openrvt/bin/python evaluacion/resumir.py AC20-FZK-Haus AC20-Institute-Var-2 IFC2X3-Building-Architecture
```

La comparación marca diferencias de volumen de malla mayores al 1 % y diferencias contra la
cantidad base del archivo mayores al 2 %. Los umbrales se pueden cambiar con
`--umbral-volumen` y `--umbral-qto`.
