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

## O001b — edición

Los dos guiones crean el mismo modelo desde cero, lo editan, lo guardan y lo
vuelven a abrir con el otro motor. El modelo tiene 4 muros, 1 losa, 1 puerta y
1 vano; tras la edición el rectángulo pasa de 8 × 6 a 9 × 6 m y el espesor del
tipo «Block 15» pasa de 0.15 a 0.20 m.

```bash
# Motor A: IfcOpenShell. Escribe resultados/edicion_a.ifc y .json.
~/.venvs/openrvt/bin/python evaluacion/a_editar.py

# Motor B: web-ifc. Escribe resultados/edicion_b.ifc y .json.
node evaluacion/b_editar.mjs

# 3 corridas de cada motor, medianas y volúmenes cruzados.
~/.venvs/openrvt/bin/python evaluacion/resumir_edicion.py

# Pruebas de la edición (conteos, vano, volúmenes y validación).
~/.venvs/openrvt/bin/python -m pytest evaluacion/test_editar.py -q
```

Los guiones también aceptan `--medir <ifc> --json <salida>` para que el otro
motor los use, y `a_editar.py --validar <ifc> --json <salida>` para pasar
`ifcopenshell.validate` sin errores de esquema.

La edición se interpreta así: el muro este se desplaza 1 m hacia el este (la
dimensión este-oeste pasa de 8 a 9 m) y el sur y el norte se estiran a 9 m.
Las uniones son a eje: cada muro conserva su largo nominal y se solapa con los
perpendiculares en las esquinas.
