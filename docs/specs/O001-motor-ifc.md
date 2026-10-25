# O001 — Comparar motores IFC: IfcOpenShell vs web-ifc (medido, no opinado)

## Objetivo
Decidir el motor IFC del núcleo de OPEN-RVT con **números**. El primer producto será la ruta C, paso 1 (`docs/caminos-posibles.md`): abrir un IFC, verlo y sacar cantidades hacia PresupuestosPro. Esta tarea mide los dos candidatos en eso mismo. **No se hace interfaz.**

## Muestras (`muestras/`, que no se versiona: agrégala a `.gitignore`)
Descarga con `herramientas/bajar_muestras.sh` (idempotente):
- **AC20-FZK-Haus.ifc** (KIT, casa de 2 niveles), del repo `buildingSMART/Sample-Test-Files` o de su fuente pública;
- **un IFC4 de arquitectura** mediano (oficinas o escuela) del mismo repo: el más grande que pese menos de 50 MB;
- **un IFC2X3** cualquiera del mismo repo, para probar la otra versión del esquema.

Anota en `docs/evaluaciones/muestras.md` la URL, el tamaño, el esquema y la licencia de cada una.

## Motor A: IfcOpenShell (Python, LGPL-3.0) — `evaluacion/a_ifcopenshell.py`
- Usa un venv propio, `~/.venvs/openrvt` (`pip install ifcopenshell`).
- Abre el archivo y mide el tiempo de apertura.
- Teselado con `ifcopenshell.geom.iterator` (multihilo, `USE_WORLD_COORDS`): mide el tiempo, el total de triángulos y la memoria máxima (RSS).
- Cantidades por elemento:
  - **Elementos:** `IfcWall`, `IfcSlab`, `IfcColumn`, `IfcBeam`, `IfcDoor`, `IfcWindow`, `IfcRoof`, `IfcStair`.
  - **Del archivo:** las cantidades base (`Qto_*BaseQuantities`), si existen.
  - **De la malla:** volumen (malla cerrada, teorema de la divergencia) y área de la proyección en planta. Si la malla no es cerrada, anótalo.
  - **Por tipo:** muro (largo, alto, área lateral neta y volumen), losa (área y volumen), puerta y ventana (ancho, alto y conteo).

## Motor B: web-ifc (C++→WASM, MPL-2.0) — `evaluacion/b_webifc.mjs`
- Node 20+ con `npm i web-ifc`, en `evaluacion/package.json`.
- Mide la apertura (`OpenModel`), el teselado con `StreamAllMeshes`, los triángulos y la memoria.
- Mismas cantidades que A: de la malla (volumen y área en planta), con la misma fórmula, y las cantidades base leídas con `GetLine` y las relaciones `IfcRelDefinesByProperties`.

## Salidas
- `resultados/<muestra>_<motor>.csv` con las columnas `globalid, clase, nombre, nivel, volumen_malla, area_planta, qto_volumen, qto_area, largo, alto, cerrada`.
- **`evaluacion/comparar.py`** compara A contra B elemento por elemento (por GlobalId):
  - elementos que faltan en uno u otro;
  - diferencia relativa de volumen de malla (marca si pasa del 1 %);
  - diferencia de cada motor contra la cantidad base del archivo (marca si pasa del 2 %).
- **Pruebas (`evaluacion/test_comparar.py`, pytest):**
  - la fórmula de volumen da 1.000 m³ (± 1e-9) para un cubo de 1 m y 0.5 m³ para un prisma triangular conocido;
  - una malla abierta se detecta como no cerrada;
  - `comparar.py` marca una diferencia sembrada del 5 %.

## Informe (`docs/evaluaciones/O001-motor-ifc.md`, etiqueta «LISTA PARA REVISIÓN»)
- **Tabla de cada muestra × motor:** tiempo de apertura, de teselado y total, triángulos, memoria máxima, elementos procesados y elementos con malla abierta.
- **Concordancia:** el porcentaje de elementos en los que A y B coinciden dentro del 1 %, y los 10 peores casos con su clase y su diferencia.
- **Cantidades base:** cuántos elementos las traen y qué tan cerca queda cada motor.
- **Uso desde Tauri + Rust**, con lo que se probó y lo que no:
  - web-ifc corre en el webview (WASM);
  - IfcOpenShell iría como proceso Python aparte, o enlazado en C++;
  - incluye el tamaño de lo que habría que empaquetar en el instalador de Windows (el wheel de IfcOpenShell más un Python embebido, contra el `.wasm`).
- **Licencias:** LGPL-3.0 y MPL-2.0, y qué obliga cada una si OPEN-RVT es GPL-3.
- **Hechos que deciden:** sin recomendación final; el supervisor decide.

## Reglas
- Trabaja en el worktree que te indiquen y haz commit en español al cerrar cada parte. No hagas push.
- No versiones muestras ni `node_modules`.
- Los tiempos son la mediana de 3 corridas.
- No uses APIs de pago ni servicios externos aparte de las descargas de las muestras y de los paquetes.
