# O034: asas en planta para el desfase de cada borde de losa

Hoy el desfase de cada borde de losa solo se cambia en la tabla de bordes de Propiedades (O032/O037). El usuario quiere
hacerlo también en planta, arrastrando, como en Revit.

## Decisiones ya tomadas (no las cambies)
- **Cuándo se ven.** Con **una** losa seleccionada en una vista de planta, cada borde muestra un asa (triángulo o
  flecha pequeña) en su punto medio, apuntando hacia afuera de la losa. Con varias losas seleccionadas no hay asas.
- **Arrastre.** Arrastrar el asa mueve **solo ese borde**, perpendicular a su dirección. Los bordes vecinos se ajustan
  como ya lo hace el núcleo al cambiar el desfase en la tabla (no se inventa otra regla).
  - El valor es el desfase con signo: positivo hacia afuera, negativo hacia adentro (mismo signo que la tabla).
  - Mientras arrastras: vista previa del contorno nuevo y una cota temporal con el desfase («+0.15»).
  - Respeta los imanes/ajuste de la planta que ya existen; sin imán, redondea a 0.005 m.
  - Al soltar: **una** llamada al mismo comando que usa la tabla de Propiedades → un solo paso de Deshacer; se conserva
    el GlobalId de la losa.
  - Esc durante el arrastre cancela y deja la losa como estaba.
- **Clic sobre el asa sin arrastrar** abre un campo para escribir el desfase de ese borde (Enter guarda, Esc cancela).
- La tabla de Propiedades se actualiza al soltar (mismos valores).
- **No** se agregan asas en alzado, corte ni 3D.

## Archivos a reciclar
- `src/features/modelo/bordesLosa.ts`, `src/features/modelo/planta.ts`, `src/features/modelo/PanelPropiedades.tsx`
  (la tabla de bordes y el comando que usa), y cómo dibuja las asas de los ejes con codo (O037) en el visor.

## Pruebas obligatorias
- **vitest:**
  - geometría del asa: punto medio y normal hacia afuera en una losa rectangular y en una en L (valores a mano);
  - convertir un arrastre en desfase con signo (a mano: arrastrar 0.15 hacia afuera → +0.15; 0.10 hacia adentro →
    −0.10), con redondeo a 0.005;
  - con dos losas seleccionadas no hay asas.
- **pytest:** si tocas el núcleo, una prueba del comando con el valor esperado a mano (área de la losa 4×3 con un
  borde a +0.20 = 4×3.20 = 12.80 m²).
- **E2E `e2e/o034.test.js`, con clics reales:**
  1. Dibujar una losa de 4 × 3 con la herramienta.
  2. Seleccionarla en planta, arrastrar el asa del borde norte 0.20 hacia afuera → el área de la losa queda en
     12.80 m² y la tabla de Propiedades dice +0.20 en ese borde.
  3. Deshacer → 12.00 m²; Rehacer → 12.80 m².
  4. Arrastrar otro borde y pulsar Esc → no cambia.
  5. Clic sobre el asa del borde sur y escribir −0.10 → 4 × 3.10 = 12.40 m².
  6. Capturas en `docs/progreso/O034/`: planta con asas, durante el arrastre y después.
- Corre `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=3` y pytest completo.

## Reglas
- `modelado.py` e `interacciones.py` conservan su fin de línea (CRLF).
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O034.md`.
