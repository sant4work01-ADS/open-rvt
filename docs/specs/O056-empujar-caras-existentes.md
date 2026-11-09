# O056: empujar/tirar caras de elementos existentes (fase 2 estilo SketchUp)

Pedido del dueño (7-nov): modelar tipo SketchUp con los elementos que ya tenemos. Hoy Empujar/Tirar (O046/O049) solo
crea sólidos nuevos sobre el plano o sobre una cara +Z. Lee `docs/progreso/O046.md` y `O049.md`. Código:
`src/features/modelo/empujar.ts`, `candidatos3d.ts`, `inferencias3d.ts`, `estado.ts` (`genericos.crear`),
`Visor3D.tsx`; núcleo `modelado.py` (`generico_crear`, `restricciones_editar`), `elementos.editar`.

## Decisiones ya tomadas (no las cambies)
**Gesto** (vista iso y perspectiva, herramienta Empujar/Tirar activa):
- Al pasar sobre una cara de un elemento se resalta en azul translúcido y el tooltip dice qué hará
  («Altura del muro», «Extremo del muro», «Borde de losa», …) o por qué no se puede.
- Clic en la cara → la distancia sigue al ratón a lo largo de la normal de la cara (positivo = hacia afuera). Cota
  temporal con la distancia. Se teclea la distancia y Enter. Clic o Enter confirma; Esc cancela sin dejar cambios.
- La distancia engancha con las inferencias de O049 a vértices, aristas y caras de otros elementos (p. ej. subir un muro
  hasta la cara inferior de una losa). Vista previa del elemento modificado en vivo.
- Clic en una cara vacía del plano sigue creando sólidos nuevos como hoy (no lo rompas).
- Cada empuje es **un** paso de deshacer.

**Qué hace cada cara (siempre edita el parámetro real del IFC, nunca convierte el elemento en un sólido suelto):**
| Elemento | Cara | Efecto |
|---|---|---|
| Muro | superior | cambia la altura (desfase del tope; si el tope está ligado a un nivel, cambia `desfase_tope`) |
| Muro | extremo | alarga o acorta el muro moviendo ese extremo del eje; uniones y dependientes se recalculan |
| Muro | lateral / inferior | no hace nada; tooltip «El espesor lo da el tipo» |
| Losa | lateral | mueve ese lado del contorno (los lados vecinos se estiran); se conservan los bordes de los demás lados |
| Losa | superior / inferior | no hace nada; tooltip «El espesor lo da el tipo» |
| Columna / castillo | superior | cambia la altura |
| Viga / trabe / dala / cerramiento | extremo | alarga o acorta ese extremo |
| Genérico | cualquiera | mueve esa cara de la caja (cambia la medida en ese eje) |
| Otros (zapata, puerta, ventana, …) | cualquiera | tooltip «No se puede empujar este elemento» |
- Dependientes ligados (castillos, cerramientos, puertas, ventanas) siguen las reglas de siempre al cambiar el muro.
- Medida mínima 0.05 m: si el empuje deja algo menor, se detiene en 0.05 y lo avisa.

## Pruebas obligatorias (fallan si está mal; valores a mano)
- vitest de la parte pura: clasificación cara → acción para cada fila de la tabla y cálculo de la distancia sobre la normal.
- pytest `nucleo/tests/test_o056.py` con la operación del núcleo que uses (o las existentes): muro 4.00 × 2.60 subir
  0.40 → 3.00 y volumen exacto; extremo +1.00 → 5.00 con castillo intermedio en su lugar; losa 4 × 3 lado este +0.50
  → 4.5 × 3 = 13.5 m²; genérico 1 × 1 × 1 cara +X +0.25 → 1.25 m³; deshacer en un paso.
- E2E `e2e/o056.test.js` con clics y arrastres reales: muro, losa, columna y genérico, uno de cada fila con efecto;
  un empuje tecleado y uno enganchado a la cara inferior de una losa; Esc a medias no deja cambios; deshacer; guardar y
  reabrir. Capturas antes/después en `docs/progreso/O056/`; **léelas como imagen** y di qué se ve.
- Además: pytest completo, `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2`, E2E `o046`, `o049`, `o055`,
  `herramientas`, `o051`.

## Entorno
Windows, Git Bash. `herramientas/preparar_python.sh windows` antes de cada E2E.
- E2E: `timeout 1500 pesado bash -c 'CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o056" npx tauri build --debug --no-bundle >/tmp/o056-build.log 2>&1 && NODE_PATH="$PWD/../openrvt-o045/e2e/node_modules" CARGO_TARGET_DIR="$HOME/.cache/pp-target/openrvt-o056" node --test e2e/<archivo>'`
- pytest: `~/.venvs/openrvt/Scripts/python.exe -m pytest nucleo/tests -q` (con `pesado`).

## Reglas
- Conserva los finales de línea que ya tiene cada archivo (mira `git show HEAD:<archivo>`); archivos nuevos en LF.
- Lógica nueva en módulos propios (`empujarCaras.ts`); no engordes `Visor3D.tsx` más de lo necesario.
- Sin push, merge, cambio de versión ni dependencias nuevas. Commits pequeños en la rama o056.
- Prohibido aplazar puntos o debilitar una prueba. Lo que no salga va como NO HECHO.
- Resumen en `docs/progreso/O056.md` con la salida real de cada prueba.
