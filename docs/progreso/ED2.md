# ED2 — espejo y matriz de elementos

Estado: **en curso** (núcleo y frontend listos; falta E2E con la app real y la
batería final).

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

- `nucleo/tests/test_ed2.py` (9 pruebas): espejo de muro exterior en x=0 y y=1,
  puerta copiada en el muro reflejado con giro invertido, GlobalId conservados
  sin copia, matriz lineal en los dos modos, matriz polar 360°/4, muro con
  ventana en matriz de 3, deshacer en un paso y las tres puertas del servidor.
- `src/features/modelo/ed2.test.ts` (5 pruebas): reflexión de puntos, selección
  de eje/arista, vectores de matriz lineal, ángulos polares y atajos MM/AR.

## Pendiente

- E2E `e2e/ed2.test.js` con clics reales (espejo de muro con puerta, matriz
  lineal de 4 columnas, matriz polar de 6 columnas, deshacer y capturas).
- Batería final: tsc, lint, vitest completo, pytest completo y E2E o004/o028/o041.
