# O012b: jerarquía completa de uniones (ejemplos del usuario)

Continúa O012 en el mismo worktree. Lee `docs/progreso/O012.md` y reutiliza su mecanismo de
uniones: aquí se **amplían** las reglas, no se rehacen. Sin cambio de versión. No toques
`Visor3D.tsx`, `cotas.ts` ni los paneles (son de O011).

Usuario (2026-10-27): «son ejemplos de cómo van los elementos».

- `docs/notas-usuario/capturas/2026-10-27-jerarquia-zapata-dado-contratrabe-castillo-muro.jpg`
  (alzado arriba, planta abajo), por colores:
  - **rojo:** zapata;
  - **cian:** dado (sobre la zapata);
  - **magenta:** contratrabe, que llega a las **caras de los dados** con su cara superior al ras
    de la cara superior del dado;
  - **amarillo:** castillo, que **nace sobre el dado**;
  - **verde:** muro, que **apoya sobre la contratrabe** y **termina en las caras de los
    castillos**. En planta el muro es más angosto que la contratrabe y va centrado.
- `docs/notas-usuario/capturas/2026-10-27-jerarquia-losas-trabes-columnas.jpg` (planta), por
  colores:
  - **blanco:** columnas y zapatas;
  - **magenta:** trabes entre columnas, recortadas en las caras de las columnas;
  - **cian y verde:** losas, que llegan a las **caras interiores de las trabes** y no se enciman
    con ellas ni con las columnas.

## Jerarquía (de mayor a menor; el mayor queda entero y el menor se recorta contra él)
1. **Zapata.** El dado es parte de la zapata (`DadoB`, `DadoH`, `DadoAlto` del tipo) y se apoya
   sobre ella sin traslape.
2. **Columna y castillo.** Nacen en la cara superior del dado, o de la zapata si no hay dado. Ya
   existe en `interacciones.py:753`; verifícalo.
3. **Vigas lineales** (contratrabe, trabe, dala, cerramiento):
   - se recortan en las caras de columnas, castillos y **dados**: el dado cuenta como columna para
     la contratrabe;
   - entre sí siguen las reglas de O012.
4. **Losa:** se recorta en planta contra trabes y columnas; llega a la cara de la trabe. Si la trabe
   es más peraltada que la losa, la losa ocupa solo su espesor y la trabe sigue entera hacia abajo.
5. **Muro** (con sus capas):
   - en planta, termina en las caras de castillos y columnas;
   - en alzado, su base se recorta en la cara superior de la contratrabe, la dala o la losa sobre
     la que apoya;
   - su corona se recorta en la cara inferior del cerramiento o de la losa que la cubre.

Al recortar, nunca se agranda un elemento: solo se quita lo que se traslapa con uno de mayor
jerarquía. La excepción son los huecos de 5 cm o menos de O012.

## Casos de referencia (a mano)
| Caso | Datos | Esperado |
|---|---|---|
| **Contratrabe entre dos dados** | Zapatas a 4.00 m entre centros. Dado de 0.40 × 0.40. CT-1 de 0.20 × 0.40. | Largo 4.00 − 0.40 = **3.60 m**; volumen 0.20·0.40·3.60 = **0.288 m³** |
| **Muro entre castillos** | Muro de block de 0.15 entre castillos de 0.15 × 0.15 a 4.00 m entre centros, altura 2.60 sobre la contratrabe | Largo 3.85 m; área 3.85 × 2.60 = **10.01 m²**. La base del muro está en la cara superior de la contratrabe, sin traslape. |
| **Losa entre 4 trabes** | Ejes a 5.00 × 4.00. Trabes de 0.25 de ancho centradas en los ejes. Losa de 0.10. | Área de losa (5.00 − 0.25) × (4.00 − 0.25) = **17.8125 m²**; volumen **1.78125 m³** |
| **Columna en esquina de losa** | — | La losa no traslapa la columna: intersección de volumen 0 |

## Pruebas
- **pytest** de cada caso de la tabla.
- **Invariante global** sobre un modelo con todos los elementos: ningún par de sólidos se traslapa
  más de 1e-6 m³.
- **E2E** que reproduce los dos dibujos: planta, alzado y 3D, con capturas en `resultados/O012/`.
- **Medición:** las cantidades para PresupuestosPro salen de los sólidos recortados. Compara los
  volúmenes y las áreas con la tabla.

Al cerrar, pon el progreso al día en `docs/progreso/O012.md` (sección O012b). Commits en español,
sin push.
