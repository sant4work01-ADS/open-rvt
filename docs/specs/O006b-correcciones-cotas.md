# O006b — Correcciones de O006a (orientación y legibilidad)

Revisión del supervisor sobre las capturas de O006a. Se trabaja en la misma rama `o006a`.

## 1. Planta girada 180° (grave)
- **El síntoma:** en `o006a_planta_cotas.png` los ejes por separaciones salen 4-3-2-1 de izquierda a derecha, y A (y = 0) queda arriba de C (y = 8). El eje 1 está en x = 0 y el 4 en x = 14.5, así que la planta muestra +X a la izquierda y +Y hacia abajo.
- **La causa:** `vistas.ts` (~línea 61 y 122) dice «el norte del proyecto en −Y» y usa `arriba = (0, −1, 0)` en planta. **Es incorrecto.** En IFC, el norte del proyecto es **+Y**, y +X queda a la derecha (que `TrueNorth` sea (0, 1) por omisión lo confirma).
- **Corrección:**
  - planta con `arriba = (0, 1, 0)`, de modo que +X quede a la derecha y +Y arriba;
  - **alzados**: **Alzado Norte** muestra la fachada norte, con el observador en +Y mirando hacia −Y. **Alzado Sur**: el observador en −Y mirando hacia +Y, con +X a la derecha. Este y Oeste igual: Este desde +X y Oeste desde −X;
  - corrige el comentario;
  - revisa cualquier otro lugar que dependa de la convención anterior: cortes, simbología de puertas (lado de abatimiento), siluetas, cotas temporales, enganches, la herramienta Mover y el sentido de la etiqueta del eje según la orientación.
- **Pruebas vitest:**
  - en planta, el punto (1, 0, 0) se proyecta a la derecha del (0, 0, 0) y el (0, 1, 0) arriba;
  - en Alzado Sur, +X a la derecha; en Alzado Norte, +X a la izquierda.
- **E2E:**
  - ejes por separaciones verticales: en pantalla, la burbuja 1 a la izquierda de la 4;
  - horizontales: la A abajo de la C.
- **Capturas:** recaptura FZK-Haus (`o005_planta_fzk.png` y `o005_alzado_fzk.png`) y compáralas con la orientación de la documentación de FZK-Haus si la hay en `muestras/`. Anota el resultado.

## 2. Textos de cota ilegibles en planta
- **El problema:** en `o006a_planta_cotas.png` los textos de las cotas («5.00», «4.50», «14.50» y los de los ejes A-B-C) miden unos 5 px y no se leen. En alzado sí se leen.
- **Altura del texto:** se mantiene en 2.5 mm de papel, pero en pantalla nunca baja de **11 px**. Las marcas oblicuas, en cambio, nunca bajan de 6 px.
- **Cota total:**
  - se dibuja solo si hay **2 o más** cotas parciales. Con un solo tramo, la total repite la parcial (en `o006a_alzado_niveles.png` sale «2.70» dos veces);
  - va separada de la cadena de parciales al menos 1.5 veces la altura del texto.
- **Textos sobre la línea de cota:** no deben encimarse con las burbujas. Si un texto no cabe entre dos marcas, se saca afuera, con una línea guía.

## 3. Verificación
- Todo en verde, igual que en O006a.
- Recaptura `o006a_planta_cotas.png`, `o006a_editar_cota.png` y `o006a_alzado_niveles.png` y **ábrelas tú**. Comprueba que:
  - todas las cotas se leen;
  - los ejes van 1→4 de izquierda a derecha;
  - la A está abajo.
- **Progreso:** sección «Correcciones O006b» en `docs/progreso/O006a.md`.
- Versión: se queda en **0.4.0**.
- Commits en español. No hagas push.
