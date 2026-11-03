# ED2 — espejo y matriz de elementos

Estado: **completo**. Probado con la interfaz real (clics en planta, barra de
opciones y atajos) sobre el binario debug de Tauri en Windows.

## Núcleo (`nucleo/openrvt_nucleo/modelado.py`)

- `elementos_espejo(globalids, p1, p2, copiar=True)`:
  - reflexión real de puntos y ángulos; muro con extremos reflejados y `Volteado`
    invertido (la secuencia de capas se invierte respecto a la línea);
  - copia de muros con sus vanos, puertas y ventanas; las copias llevan GlobalId
    nuevo y las originales reflejadas conservan el suyo;
  - un solo `_instantanea()` para todo el comando;
  - las copias se desvinculan de la representación compartida que devuelve
    `ifcopenshell.util.element.copy` para no borrar la malla del original;
  - enlaces a ejes: se quitan de las copias y de los originales reflejados, con
    aviso y contador en el resultado.
- `elementos_matriz_lineal(globalids, vector, numero, modo)`:
  - `al_segundo` usa el vector como separación; `al_ultimo` reparte el vector
    entre `numero - 1` copias;
  - reutiliza `elementos_copiar` (extraído a `_copiar_elementos` para no abrir
    una instantánea por copia), por lo que los muros arrastran sus vanos.
- `elementos_matriz_polar(globalids, centro, angulo_total, numero)`:
  - rotación alrededor del centro y giro propio (`Rotacion` de columnas);
  - 360° se reparte entre `numero` para no duplicar el original; otros ángulos
    entre `numero - 1`.
- `elementos_copiar` ahora copia los vanos de los muros (antes solo el muro).
- `servidor.py`: métodos `elementos.espejo`, `elementos.matriz_lineal` (alias
  `elementos.matriz`) y `elementos.matriz_polar`.

## Interfaz

- `herramientas.ts`: `reflejarPunto`, `vectorMatrizLineal`, `angulosMatrizPolar`
  y `ejeBajoPunto` (elige el eje o el muro más cercano al clic).
- `estado.ts`: herramientas `espejo` y `matriz`, opciones (Copiar; Lineal/Polar,
  Número, Al último/Al segundo, Ángulo total) y los clics que llaman al núcleo.
- `BarraHerramienta.tsx`: barra de opciones de ambas herramientas.
- Cinta MODIFICAR: comandos **Espejo (MM)** y **Matriz (AR)**; atajos `MM` y
  `AR` en el buffer de teclas.

## Pruebas

- `nucleo/tests/test_ed2.py` (10 pruebas): espejo de muro exterior en x=0 y y=1,
  puerta copiada en el muro reflejado con giro invertido, GlobalId conservados
  sin copia, enlaces a ejes quitados con aviso, matriz lineal en los dos modos,
  matriz polar 360°/4, muro con ventana en matriz de 3, deshacer en un paso y
  las tres puertas del servidor.
- E2E `e2e/ed2.test.js` con clics reales, ejecutado en Windows:

  ```
  CARGO_TARGET_DIR=... OPENRVT_PYTHON=... npx node --test e2e/ed2.test.js
  ✔ ED2: espejo con puerta, matriz lineal y polar, deshacer y capturas
  ```

  Comprueba muro de 0–4 m con puerta reflejado a −4–0 con su puerta, matriz
  lineal 10/13/16/19, matriz polar de radio 10 cada 60°, Ctrl+Z en un paso y
  los atajos MM/AR. Capturas leídas como imagen:
  [`01-espejo.png`](ED2/01-espejo.png),
  [`02-matriz-lineal.png`](ED2/02-matriz-lineal.png),
  [`03-matriz-polar.png`](ED2/03-matriz-polar.png) y
  [`04-deshacer.png`](ED2/04-deshacer.png).
- `src/features/modelo/ed2.test.ts` (5 pruebas): reflexión de puntos, selección
  de eje/arista, vectores de matriz lineal, ángulos polares y atajos MM/AR.

## Batería final

- `npx tsc --noEmit`: sin errores.
- `npm run lint`: 0 errores (16 avisos previos de fast-refresh y hooks).
- `npx vitest run --maxWorkers=3`: 637 pasan; falla solo
  `actualizaciones.test.tsx` «CA-8 · Linux descarga aparte», que asume Linux y
  en Windows recibe «Actualizar ahora». Es ajena a ED2 y ya fallaba en Windows.
- `pytest nucleo/tests -q`: **284 pasan, 6 omitidos**.
- E2E `o004` (con `src-tauri/recursos/python` y `OPENRVT_PYTHON` sin definir),
  `o028` y `o041`: los tres pasan con el binario debug.
- `herramientas/preparar_python.sh windows` ejecutado antes de los E2E
  (Python 3.12.9 embebido, 163 MiB sueltos).

## Pendiente

Nada.
