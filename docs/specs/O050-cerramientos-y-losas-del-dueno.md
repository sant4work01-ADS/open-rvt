# O050: cerramientos y dibujo de losa, con las sesiones reales del dueño

Pedido del dueño (6-nov): «los cerramientos siguen valiendo verga, el dibujo de losas debe pulirse, el subir o bajar
cerramientos según niveles». Notas: rama `notas/regresion-0.5.26-2026-11-06`. Esta rama ya trae O045 mezclado.

## Causas comprobadas en su bitácora (`AppData/Local/mx.openrvt.app/logs/bitacora`)
1. **O045 (`ada44ba`) nunca llegó a `main`.** Su build usó `cerramientos.crear_en_muro`: el muro quedó en 2.00 m y 16
   puertas/ventanas fallaron con «no cabe en altura: 2.10 m para un muro de 2.00 m». O045 no dejó `docs/progreso/O045.md`:
   **no lo des por bueno, compruébalo**.
2. **Losa sin cierre:** puso 4 vértices, probó Espacio y Esc, y perdió la losa. Solo cierra con doble clic.
3. **Quinto vértice:** cerrar sobre la primera esquina mandó `[[0,1.5],[2.5,1.5],[2.5,0],[0,0],[0,1.5]]`. La losa quedó
   con 5 lados y `cambio_borde` falló 13 veces: «Debe haber un borde por cada lado del contorno».
4. **Subir/bajar:** cambió `nivel_base` de 3 cerramientos a Nivel 2, uno por uno, y luego los borró. Reproduce qué se ve
   mal y anótalo en el progreso.

## Decisiones ya tomadas (no las cambies)
**Losa**
- Cierra con: clic sobre el primer vértice (12 px en pantalla), Enter, Espacio o doble clic; mínimo 3 vértices.
- El vértice de cierre nunca se agrega al contorno.
- Esc quita el último vértice; sin vértices, sale de la herramienta. Nunca borra todo de golpe.
- Con longitud tecleada, Enter aplica la longitud; con el campo vacío, cierra.
- Mismos enganches, ortogonal y cota temporal que Muro; reutiliza ese código, no lo copies.
- Vista previa: polígono sombreado cerrado hasta el cursor, y el primer vértice resaltado al estar a tiro de cierre.
- Aviso: «Losa: N vértices. Clic en el primero, Enter o doble clic para cerrar.»
- `losa_crear` pasa el contorno por `_limpiar_anillo`, sea cual sea el cliente.
- Losas ya guardadas con punto de cierre repetido: se reparan al abrir y en `elementos.editar`, sin aviso molesto, y se
  conservan los bordes de los lados reales.

**Cerramiento**
- Regla: cara superior = elevación del nivel + desfase. Sección 15×20 en Nivel 1 a 2.20 → de 2.00 a 2.20.
- El muro nunca cambia de altura por un cerramiento.
- Cambiar Nivel o Desfase en Propiedades lo mueve en alzado y 3D, y aparece en la planta de ese nivel. Sigue ligado a su
  muro aunque quede sobre él. Deshacer lo regresa.
- Con varios cerramientos seleccionados, Propiedades muestra Nivel y Desfase y los aplica a todos, en un solo deshacer.
- El castillo del muro llega a la cara inferior del cerramiento y lo sigue al subir o bajar; sin cerramiento, al tope
  del muro. Si O045 hace otra cosa, ajústalo a esta regla.
- Puerta o ventana que invade el cerramiento: se crea igual, con aviso no bloqueante
  «La abertura invade el cerramiento (cara inferior a 2.00 m)». Solo se rechaza si no cabe en el muro.

## Entorno
Windows, Git Bash. `herramientas/preparar_python.sh windows` antes de cada E2E (si no: «Método desconocido»).
- E2E: `timeout 1500 pesado bash -c 'CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o050" npx tauri build --debug --no-bundle >/tmp/o050-build.log 2>&1 && NODE_PATH="$PWD/../openrvt-o045/e2e/node_modules" CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o050" node --test e2e/<archivo>'`
- pytest: `~/.venvs/openrvt/Scripts/python.exe -m pytest nucleo/tests -q`

## Pruebas obligatorias (fallan si está mal; clics reales, no llamadas directas al núcleo)
`e2e/o050.test.js`, con la secuencia del dueño: retícula, niveles 0 / 2.20 / 2.40 / 3.00, 4 muros Block 15 altura 2.60 en
rectángulo 2.50 × 1.50.
- **Losa:** 4 clics + clic en el primero → 4 lados, 3.75 m². Repetir cerrando con Enter, Espacio y doble clic: 4 lados.
  Esc con 4 vértices deja 3. Los 4 bordes con desfase 0.075 (positivo = hacia afuera) → 2.65 × 1.65 = 4.3725 m².
- **Losa vieja:** IFC con el contorno de 5 puntos: abre con 4 lados y acepta `cambio_borde`.
- **Cerramiento:** en Planta Nivel 1, cadena de 5 clics → 4 cerramientos (2.50, 1.50, 2.50, 1.50), cada uno ligado a su
  muro, de 2.00 a 2.20. Los 4 muros siguen en 2.60. Repetir la cadena: aviso y sin duplicados.
- **Puerta 2.10** en cada muro: se crea, con el aviso de invasión y sin error.
- **Subir/bajar:** los 4 seleccionados a Nivel 2 → 2.20–2.40, castillos a 2.20. Nivel 3 → 2.80–3.00. Nivel 1 → 2.00–2.20.
  Muros en 2.60 siempre. Un deshacer revierte los 4. Guardar y reabrir conserva todo.
- Capturas en `docs/progreso/O050/`: planta, alzado y 3D de cada paso. **Léelas como imagen** y di qué se ve.
- Además: E2E `o045`, `o041`, `o043`, `o046`, `o049`, `cerramiento-dueno`, `cerramiento-niveles`,
  `cerramiento-rectangulo`, `herramientas`; pytest completo; `npx tsc --noEmit`; `npm run lint`; vitest `--maxWorkers=2`.

## Reglas
- CRLF en `modelado.py`, `interacciones.py`, `Visor3D.tsx`, `estado.ts`.
- Sin push, merge, cambio de versión ni dependencias nuevas. Commits pequeños en la rama o050.
- Prohibido aplazar puntos o debilitar una prueba para que pase. Lo que no salga va marcado como NO HECHO.
- No toques `App.tsx`, `NivelesView.tsx` ni `ControlesZoom.tsx` (son de O051).
- Resumen en `docs/progreso/O050.md` con la salida real de cada prueba.
