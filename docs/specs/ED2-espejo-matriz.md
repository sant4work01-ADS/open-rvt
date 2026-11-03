# ED2: espejo y matriz de elementos

Como «Simetría» y «Matriz» de Revit y AutoCAD, en planta.

## Decisiones ya tomadas (no las cambies)

### Espejo (cinta MODIFICAR, atajo `MM`)
- **Con elementos seleccionados:**
  - **Elegir eje:** clic en un eje del modelo o en una arista o eje de un elemento lineal. Esa línea es la simetría.
  - **Dibujar eje:** dos clics definen la línea de simetría.
- **Copiar.** Casilla en la barra de opciones, marcada por omisión.
  - Marcada: se crean copias reflejadas y los originales no cambian.
  - Desmarcada: se reflejan los originales.
- **Reflexión real de la geometría:**
  - posición, extremos y rotación;
  - en los muros, el lado exterior: la secuencia de capas se invierte respecto a la línea, igual que «Voltear lados»;
  - en puertas y ventanas, el sentido de giro.
- **Vanos:** al reflejar un muro con vanos, sus puertas y ventanas se reflejan con él. Las copias van en el muro nuevo.
- **Enlaces a ejes:** las copias no llevan enlaces. Los originales reflejados los pierden, con aviso.
- **Deshacer y GlobalId:** un solo paso de Deshacer. Las copias tienen GlobalId nuevo y los reflejados conservan el
  suyo.

### Matriz (cinta MODIFICAR, atajo `AR`)
- **Barra de opciones:** «Lineal | Polar», «Número» (≥ 2, incluye el original) y «Al último | Al segundo».
- **Lineal:**
  - dos clics dan el vector;
  - «Al segundo» = el vector es la separación entre copias;
  - «Al último» = el vector llega a la última copia y la separación se reparte.
- **Polar:**
  - clic en el centro;
  - ángulo total en grados en la barra (por omisión 360);
  - las copias giran alrededor del centro y también giran sobre sí mismas.
- **Copias con sus vanos:** usan la misma ruta del núcleo que `elementos_copiar` (~5588), así que los muros se copian
  con sus vanos.
- **Sin grupo:** las copias son elementos independientes; no hay «grupo de matriz».
- **Deshacer:** un solo paso.

### Núcleo
- `elementos_espejo(globalids, p1, p2, copiar)`.
- `elementos_matriz_lineal(globalids, vector, numero, modo)`.
- `elementos_matriz_polar(globalids, centro, angulo_total, numero)`.

## Archivos
- `nucleo/openrvt_nucleo/modelado.py`: `elementos_copiar` y `elementos_mover`.
- `src/features/modelo/herramientas.ts`.
- `src/features/modelo/planta.ts`.
- La cinta.

## Pruebas obligatorias (valores a mano)

### pytest `nucleo/tests/test_ed2.py`
- **Espejo de un muro:**
  - muro de (1,0) a (3,0), con capa exterior hacia y−;
  - espejo respecto a x=0 con copia;
  - resultado: muro de (−1,0) a (−3,0) con la capa exterior todavía hacia y−, porque refleja en x;
  - espejo respecto a y=1: la capa exterior queda hacia y+.
- **Espejo de una puerta** en un muro: la copia queda en el muro copiado, en la posición reflejada, y con el giro
  invertido.
- **Espejo sin copia:** los originales conservan su GlobalId.
- **Matriz lineal de columnas:**
  - columna en (0,0), «Al segundo», vector (3,0), número 4 → columnas en x = 0, 3, 6 y 9;
  - «Al último», vector (9,0), número 4 → el mismo resultado.
- **Matriz polar:** columna en (5,0), centro (0,0), 360°, número 4 → (5,0), (0,5), (−5,0) y (0,−5), cada una girada
  90° respecto a la anterior.
- **Muro con vanos en matriz:** muro con una ventana, número 3 → 3 muros y 3 ventanas.
- **Deshacer:** devuelve todo exacto (±1e-9).

### vitest
- Reflexión de puntos.
- Vectores de la matriz en los dos modos.
- Atajos `MM` y `AR`.

### E2E `e2e/ed2.test.js`, con clics reales
1. Espejo de un muro con puerta respecto a un eje.
2. Matriz lineal de 4 columnas.
3. Matriz polar de 6 columnas.
4. Deshacer.
5. Capturas en `docs/progreso/ED2/`, leídas como imagen.

### Al cerrar
- `npx tsc --noEmit` y `npm run lint`.
- vitest con `--maxWorkers=3`.
- pytest completo.
- Los E2E o004, o028 y o041.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea (CRLF).
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/ED2.md`.
