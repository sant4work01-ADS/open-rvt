# O014a: niveles con estilo de referencia y texto centrado de verdad

Pedido del usuario (2026-10-29/30). Lee antes `ideas/niveles-estilo-cotas.md` y mira
`ideas/img/niveles-referencia.jpg` con tu herramienta de imágenes. Esta spec cubre SOLO las
partes 1–3; el codo articulado de niveles y la nueva disposición de cotas van en O014b (no los hagas).

Código: `src/features/modelo/Visor3D.tsx` (zona «O011b: la línea de nivel…», ~línea 2509;
`crearTextoAnotacion` ~441, `burbujaEje` ~474), `src/features/modelo/estilos.ts`.

## 1. Centrado del texto (burbujas de eje y cabezas de nivel)
Causa: `crearTextoAnotacion` usa `anchorX/anchorY = "center"/"middle"` de troika, que centra la
caja del renglón (con ascendentes/descendentes), no el glifo visible; por eso «A», «1», «12»
quedan corridos.
- Después de `sync()`, usa `textRenderInfo.visibleBounds` ([minX, minY, maxX, maxY]) y desplaza
  el texto para que el CENTRO de esos límites quede en (0,0) del grupo. Hazlo en una función pura
  exportada de un archivo nuevo `src/features/modelo/centrado.ts`:
  `desplazamientoCentrado(b: [number, number, number, number]): [number, number]` → `[-(minX+maxX)/2, -(minY+maxY)/2]`.
  Como `sync()` es asíncrono, aplica el desplazamiento en el callback de `sync(cb)`.
- Aplica lo mismo a la cabeza del nivel (parte 2).
- Pruebas (vitest): `desplazamientoCentrado([0.1,-0.2,0.5,0.4])` → `[-0.3,-0.1]`; con límites
  simétricos → `[0,0]`.
- Prueba E2E (con la app real, como `e2e/` de O011): crea ejes «A», «12» y «A.1»; toma captura de
  la planta a zoom 100 % y 400 %; para cada burbuja calcula el centro del anillo y el centro de los
  píxeles del texto (por color) y verifica desviación ≤ 0.5 px en X y en Y a 100 % y ≤ 1 px a 400 %.
  Guarda las capturas en `docs/capturas/o014a-*.png`.

## 2. Línea y cabeza de nivel (alzados y cortes)
- Línea: patrón `trazo-punto` (ya existe `PatronLinea`), de lado a lado como hoy.
- Cabeza en el extremo derecho: triángulo isósceles invertido RELLENO (vértice abajo tocando la
  línea), ancho 3 mm de papel, alto 2.6 mm; texto a la derecha del triángulo:
  `Npt +2.20m` (prefijo, espacio, signo, 2 decimales, unidad). Cero: `Npt 0.00m` (sin signo).
  Negativos: `Npt -1.50m`. El nombre del nivel («Nivel 1») va debajo, más chico (2 mm), opcional.
- Función pura `textoCabezaNivel(elev: number, estilo: EstiloNivel): string` en
  `src/features/modelo/niveles.ts` (archivo nuevo). Pruebas: 2.2 → `Npt +2.20m`; 0 → `Npt 0.00m`;
  -0.000001 → `Npt 0.00m` (sin «-0.00»); -1.5 → `Npt -1.50m`; con decimales 3 y unidad «» → `Npt +2.200`.

## 3. Estilo de nivel configurable
- Nuevo `EstiloNivel { prefijo: string; decimales: 0|1|2|3; unidad: string; cabeza: "triangulo" | "circulo" | "ninguna"; color: string; cotas: boolean; mostrarNombre: boolean }`
  con valores por omisión `{ "Npt", 2, "m", "triangulo", color de la categoría «niveles», true, true }`.
- Se guarda en el JSON de estilos (pset `OPENRVT_Estilos`), con lectura tolerante: un proyecto viejo
  sin este campo usa los valores por omisión (prueba con un JSON viejo).
- En el diálogo de estilos existente, una sección «Niveles» con esos campos.
- `cotas: false` oculta la cadena y el total de cotas de nivel en la vista.

## Verificación y reglas
- `npx tsc --noEmit`, `npm run lint`, `npx vitest run --maxWorkers=3`, `cargo clippy -j 3` si tocas Rust,
  pytest del núcleo si tocas Python, y el E2E de la parte 1.
- Commits en español al cerrar cada parte; progreso en `docs/progreso/O014a.md` (que se pueda reanudar).
- Sin push, sin merge, sin cambiar versión, sin dependencias nuevas.
