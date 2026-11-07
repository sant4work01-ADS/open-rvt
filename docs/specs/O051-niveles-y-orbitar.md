# O051: niveles sin 3 m automáticos y botón Orbitar

Pedido del dueño (6-nov): «muy mal» que los niveles se inserten a 3 m; el botón de orbitar no sirve. Detalle en
`git show notas/regresion-0.5.26-2026-11-06:docs/notas-usuario/2026-11-06-regresion-0.5.26.md`.
En su bitácora creó 5 niveles seguidos a 3, 6, 9, 12 y 15 y tuvo que editarlos todos a 2.20, 2.40, 3.00…

## Decisiones ya tomadas (no las cambies)
**Niveles**
- El comando Nivel abre un cuadro pequeño con el campo Elevación (m), **vacío** y con el foco. Sin valor válido no crea nada.
- Acepta absoluto (`2.20`) o relativo al nivel más alto (`+2.6`). Rechaza con mensaje una elevación ya ocupada.
- Enter crea el nivel, limpia el campo y deja el cuadro abierto para seguir. Esc lo cierra.
- Elimina todo `+ 3` y `"3.00"`: `App.tsx:368`, `NivelesView.tsx:26,33,182`. Separación del arreglo y desfase al copiar
  arrancan vacíos y son obligatorios.

**Orbitar** (`ControlesZoom.tsx:89`, `accionArrastre` en `Visor3D.tsx:5894`)
- Solo se muestra en vistas 3D; en planta y alzado no aparece.
- Encendido se ve resaltado, y el arrastre con botón izquierdo orbita siempre, también con Empujar/Tirar activo.
- Al cambiar a planta y volver, conserva su estado. El clic sin arrastre sigue seleccionando.
- Primero reprodúcelo en el binario y anota en el progreso qué fallaba y por qué.

**Panel fantasma:** la captura `C:/Users/Sant4/Desktop/mierda.PNG` muestra un panel semitransparente «Herramienta Recorte»
encima de la planta, con la herramienta inactiva. Encuentra la causa y quítalo; si es la ayuda de un botón del ribbon, que
se cierre al salir el cursor.

## Entorno
Windows, Git Bash. `herramientas/preparar_python.sh windows` antes de cada E2E.
- E2E: `timeout 1500 pesado bash -c 'CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o051" npx tauri build --debug --no-bundle >/tmp/o051-build.log 2>&1 && NODE_PATH="$PWD/../openrvt-o045/e2e/node_modules" CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o051" node --test e2e/<archivo>'`

## Pruebas obligatorias (clics y teclas reales; fallan si está mal)
`e2e/o051.test.js`:
- Nivel, teclear `2.20` Enter, `+0.2` Enter, `3` Enter, Esc → niveles 0, 2.20, 2.40, 3.00 y sus plantas. Ninguno a +3.
- Enter con el campo vacío no crea nada; `2.20` repetido da mensaje y no crea nada.
- Copiar nivel y arreglo no avanzan con el campo vacío.
- `grep` en `src/` sin `+ 3` de elevación (dilo en el progreso).
- Orbitar: no existe en planta ni alzado. En 3D, encendido: el arrastre izquierdo cambia la cámara (compara posición antes
  y después); apagado no. Encendido con Empujar/Tirar activo, igual. Clic sin arrastre selecciona.
- Capturas en `docs/progreso/O051/`, **leídas como imagen**.
- Además: `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2` y los E2E que usaban la creación de niveles
  (búscalos con grep y actualízalos sin debilitarlos).

## Reglas
- CRLF en `modelado.py`, `interacciones.py`, `Visor3D.tsx`, `estado.ts`.
- En `Visor3D.tsx` toca solo lo de Orbitar; `estado.ts` y `modelado.py` son de O050: no los toques salvo lo imprescindible
  para niveles.
- Sin push, merge, cambio de versión ni dependencias nuevas. Commits pequeños en la rama o051.
- Prohibido aplazar puntos o debilitar pruebas. Lo que no salga va marcado NO HECHO.
- Resumen en `docs/progreso/O051.md` con la salida real de cada prueba.
