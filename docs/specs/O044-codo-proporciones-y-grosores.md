# O044: proporciones del codo del eje como la referencia y grosores de línea en planta

## Reporte del dueño (3-nov)
1. «Los codos de ejes aún se ven feos, no como mi referencia los pedía.»
2. «Las líneas de los elementos en planta son demasiado gruesas, de manera desproporcionada.»

## 1. Codo con las proporciones de la referencia
Antes de empezar, lee como imagen `docs/specs/O042/referencia.png` y la captura actual
`docs/progreso/O042/casos-referencia.png`.

**Hoy:** el codo es diminuto. La diagonal es corta y el tramo final hacia el globo casi no existe (D/2, según O042). El
globo queda pegado a V2 y el codo se ve como un quiebre accidental.

**Medidas tomadas de la referencia** (D = diámetro del globo, 108 px en la imagen):
- caso 1, sin codo: la línea llega al borde del globo;
- casos 2 y 3, codo recién agregado:
  - de V1 a V2: 0.85·D a lo largo del eje y 0.60·D de lado (la diagonal queda a unos 35° del eje);
  - de V2 al borde del globo: 0.95·D, paralelo al eje;
  - **el globo queda en la misma posición a lo largo del eje que sin codo**: solo se corre de lado. V1 queda
    1.80·D antes del borde del globo.

**Decisiones (no las cambies):**
- «Agregar codo» crea exactamente esa forma: V1 a 1.80·D del borde del globo, medido sobre el eje; V2 a 0.85·D a lo
  largo y 0.60·D de lado; tramo final de 0.95·D. Cambia las constantes de O042 en `ejesVista.ts` (`agregarCodoEje`).
- El lado del codo por omisión es hacia afuera del grupo de ejes, como ya decide O042. El menú lo deja invertir, si ya
  existe esa opción.
- Ancho de línea:
  - de V1 al globo, igual al del eje y continua;
  - nodos dibujados como puntos sólidos pequeños de 2.5 px de diámetro en pantalla, como en la referencia, solo con el
    eje seleccionado;
  - sin cuadros ni pinzamientos extra.
- El arrastre de V2 de O042 no cambia: solo V2, una dirección por arrastre y el tramo final siempre paralelo.
- Un codo viejo guardado con las medidas anteriores se respeta tal cual; solo los nuevos usan las proporciones nuevas.

## 2. Grosores de línea en pantalla independientes del zoom
**Hoy:** `mmAPx` en `estilos.ts:550` convierte los mm de papel con `mundoPorPx`. Al acercar, la línea engorda en
proporción: un muro cortado de 0.5 mm se vuelve una franja gruesa y todo se ve pesado y desproporcionado.

**Decisiones (no las cambies):**
- **En pantalla**, como hace Revit, el grosor de las líneas no depende del zoom ni de la escala:
  - px = max(1, mm × 2.2), redondeado a 0.5 px;
  - muro cortado de 0.5 mm → 1.1 px; proyección de 0.18 mm → 1 px.
  - La jerarquía se conserva con el color o la intensidad: corte en negro pleno, proyección en gris oscuro (#444).
  - Aplica a todos los elementos de planta, alzado y corte, y a las anotaciones: ejes, cotas, niveles.
- **Al imprimir o exportar a PDF** se siguen usando los mm de papel reales a la escala de la vista. No cambies esa ruta.
  Si hoy no existe impresión, deja la función `grosorPapelMm` intacta para cuando llegue.
- La tabla de estilos (mm por categoría) y la UI para editarla no cambian.

## Pruebas obligatorias
- **vitest:**
  - `agregarCodoEje` da V1, V2 y el globo con las medidas de arriba en un eje horizontal y en uno vertical (valores
    calculados a mano en el comentario);
  - un codo viejo cargado no cambia;
  - el grosor en px de 0.5 mm y de 0.18 mm es el mismo con zoom 0.5×, 1× y 8×.
- **E2E (actualiza `e2e/o042.test.js`):**
  - agrega un codo en un eje horizontal y en uno vertical y mide en pantalla las proporciones: tolerancia ±10 %;
  - captura `docs/progreso/O044/codos.png`, a la misma escala que la referencia, con los 4 casos de la referencia
    (recto, codo a un lado, codo al otro lado, codo con V2 arrastrado más lejos);
  - captura `docs/progreso/O044/planta-grosores.png` de la retícula de 6 muros de o041, con zoom normal y con zoom
    cercano. Las líneas deben verse finas en las dos.
  - Lee las capturas como imagen y compáralas con la referencia antes de entregar.
- **No deben romperse:** los E2E o011, o028, o036 y o042 y las capturas de estilo (o014a, o024 o donde se prueben
  grosores). Si alguna prueba fija el grosor viejo en px, actualízala a la regla nueva y explica por qué en
  O044.md.
- **Comprobaciones finales:** `npx tsc --noEmit`, `npm run lint` y vitest `--maxWorkers=2`.

## Reglas
- `Visor3D.tsx`, `estado.ts`, `modelado.py` e `interacciones.py` conservan su fin de línea CRLF.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Todo lo pesado (E2E, vitest completo, `tauri build`) se corre con `pesado <comando>`.
- Resumen en `docs/progreso/O044.md`.
