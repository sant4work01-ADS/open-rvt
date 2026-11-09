# O055: ejes, niveles, cotas y notas en las vistas 3D

Pedido del dueño (7-nov): «en las vistas 3D quiero activar los ejes, niveles, cotas y así; poder adicionar notas y que
sean visibles en cualquier modo». Nota: `docs/notas-usuario/2026-11-07-cerramientos-y-castillos-0.5.28.md`, sección 6.
Vistas 3D = `iso` y `perspectiva` (`src/features/modelo/tipos.ts`). Estilos: `sombreado`, `aristas`, `lineas-ocultas`.

## Decisiones ya tomadas (no las cambies)
**Conmutadores por vista 3D** (se guardan en la vista, como `cotasEjes`): Ejes, Niveles, Cotas, Notas. Por omisión:
Ejes y Niveles apagados, Notas encendidas, Cotas apagadas. Van en el panel de propiedades de la vista y en un botón
«Anotaciones» junto a los controles del visor 3D con las 4 casillas.
- **Ejes:** cada eje como línea de punto y raya a la elevación del nivel más bajo, con su globo y etiqueta en ambos
  extremos (misma etiqueta que en planta). El globo mira siempre a la cámara y tiene tamaño constante en pantalla.
- **Niveles:** rectángulo de línea discontinua a la altura de cada nivel, rodeando la caja del modelo + 1 m, con la
  etiqueta «Nombre · +elevación» (formato de alzado) en una esquina, siempre de frente a la cámara.
- **Cotas:** las cotas automáticas entre ejes (`calcularFamiliasCotas`) a la elevación del nivel más bajo, con el
  texto de frente a la cámara.
- **Notas:** herramienta «Nota» en la pestaña Anotar, en planta, alzado, corte y 3D. Clic en un punto (en 3D usa las
  inferencias de O049 para pegarse a caras, aristas y vértices) y se escribe el texto; Enter confirma, Esc cancela.
  Se guarda en el IFC como `IfcAnnotation` con `ObjectType = "OPENRVT_Nota"`, posición 3D y texto en `Description`,
  contenida en el nivel donde cae. Se ve en **todas** las vistas donde su punto quede dentro: en 3D siempre, en planta
  la de su nivel, en alzado/corte si cae dentro del rango. Texto con fondo blanco semitransparente y punto ancla.
- Las anotaciones se dibujan **encima** de la geometría (no las tapan los sólidos) en los 3 estilos, y no se
  seleccionan por accidente al orbitar. Las notas sí se seleccionan, se editan con doble clic, se mueven arrastrando,
  se borran con Supr y entran en deshacer.
- Las notas aparecen en el árbol del proyecto bajo «Notas».

## Pruebas obligatorias (fallan si está mal; clics reales)
- vitest de la geometría pura (posición de globos y rectángulos de nivel a partir de ejes, niveles y caja, con valores
  a mano) y del ciclo de la nota (crear, editar, mover, deshacer).
- pytest `nucleo/tests/test_o055.py`: nota creada → `IfcAnnotation` con texto y posición exactos; guardar y reabrir
  conserva; borrar y deshacer.
- E2E `e2e/o055.test.js`: retícula 3 × 3, niveles 0 / 3.00, 4 muros. En vista iso: activar cada conmutador y comprobar
  por `dataset` cuántos globos, niveles y cotas hay (valores esperados escritos en la prueba). Crear una nota en la cara
  de un muro en 3D y otra en planta; comprobar que ambas se ven en 3D, en planta y en alzado, en los 3 estilos.
  Guardar, reabrir y seguir viéndolas. Capturas en `docs/progreso/O055/`; **léelas como imagen** y di qué se ve.
- Además: pytest completo, `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2`, E2E `o049`, `o046`,
  `herramientas`, `o051`.

## Entorno
Windows, Git Bash. `herramientas/preparar_python.sh windows` antes de cada E2E.
- E2E: `timeout 1500 pesado bash -c 'CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o055" npx tauri build --debug --no-bundle >/tmp/o055-build.log 2>&1 && NODE_PATH="$PWD/../openrvt-o045/e2e/node_modules" CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o055" node --test e2e/<archivo>'`
- pytest: `~/.venvs/openrvt/Scripts/python.exe -m pytest nucleo/tests -q` (con `pesado`).

## Reglas
- CRLF en `modelado.py`, `interacciones.py`, `Visor3D.tsx`, `estado.ts`. No toques `interacciones.py` ni `uniones.py`
  (son de O054). Código nuevo en módulos propios (`anotaciones3d.ts`, `notas.py`), no engordes `Visor3D.tsx` más de lo necesario.
- Sin push, merge, cambio de versión ni dependencias nuevas. Commits pequeños en la rama o055.
- Prohibido aplazar puntos o debilitar una prueba. Lo que no salga va como NO HECHO.
- Resumen en `docs/progreso/O055.md` con la salida real de cada prueba.
