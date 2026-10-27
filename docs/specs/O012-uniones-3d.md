# O012: uniones correctas de vigas, contratrabes, columnas y capas de muro en 3D

Pedido del usuario (2026-10-27): «siguen los errores en los modelos 3D en cuanto a la vista 3D e
isométrico: las esquinas se ven raras, algunos elementos empatan mal… todo eso remarcado con rojo me
parece mal». Capturas:

- `docs/notas-usuario/capturas/2026-10-27-3d-uniones-cimentacion.jpg`: contratrabes, zapatas y
  columnas;
- `docs/notas-usuario/capturas/2026-10-27-3d-uniones-muros.jpg`: muros sobre la cimentación.

Lee primero `docs/METODO-DE-TRABAJO.md` y `CONTRIBUTING.md`. Hay otro trabajador en paralelo (O011:
anotación en `Visor3D.tsx`, `cotas.ts`, paneles). **No toques** esos archivos salvo lo indicado
abajo y **no cambies la versión**: la sube O011.

## Diagnóstico del supervisor (confírmalo en el código)
1. **Vigas lineales sin uniones.** `IfcBeam` y `IfcFooting` FOOTING_BEAM (contratrabe, trabe,
   dala, cerramiento) se generan en `modelado.py::_regenerar_estructura` como una caja de X1,Y1 a
   X2,Y2 (`_cuerpo_viga`), sin ninguna lógica de unión. El trazo va de centro a centro de columna.
   Las consecuencias son las de la captura:
   - en las **esquinas en L** falta el cuadro exterior (escalón) o sobra un pedazo;
   - en las **T y X** las cajas se enciman (aristas internas y volumen contado dos veces);
   - las **puntas que casi tocan** dejan huecos (abajo al centro y a la derecha de la captura 1);
   - las **columnas** asoman dentro de las vigas con aristas cruzadas.
2. **Capas de muro en 3D.** La huella del muro ya tiene inglete en L (`_ingletear`) y recorte en T
   (`_recortar_en_cara`). Pero las capas que se ven en 3D (franjas de acabado de otro color) no
   siguen ese corte, y en las esquinas quedan muescas triangulares o capas que sobresalen
   (captura 2, esquinas marcadas). Ubica dónde se generan las capas en 3D: busca el uso de
   `capas_con_posicion` en `modelo.py` y el consumo en el frontend.

## Reglas de unión (decididas; no las cambies)
Son las mismas reglas de prioridad de Revit para concreto. Aplican en la geometría que se muestra
**y** en las cantidades: el volumen de concreto no se cuenta dos veces.

1. **Columna > viga.** Si en un nodo hay una columna, toda viga que llega se recorta en la **cara de
   la columna**. La columna queda entera.
2. **Viga contra viga** (mismo nivel de unión: los ejes se tocan en planta y sus alturas se
   traslapan):
   - **L** (dos extremos en el mismo punto, sin columna): la viga **más larga** sigue hasta la
     **cara exterior** de la otra. La otra se recorta en la **cara interior** de la primera.
     Empate: sigue la que va en dirección X del modelo.
   - **T** (un extremo llega al interior de otra viga): la viga pasante queda entera. La que llega
     se recorta en la cara de la pasante.
   - **X** (cruce de dos interiores): la más larga queda entera. La otra se parte visualmente en
     dos piezas recortadas en sus caras. Sigue siendo **un solo elemento IFC**: dos sólidos en su
     representación `Body`.
   - Si una viga de mayor peralte se une con una de menor peralte, aplica lo mismo en planta, y la
     de menor peralte se recorta solo dentro del volumen de la otra.
3. **Huecos pequeños.** Si la punta de una viga queda a **≤ 5 cm** de la cara, del extremo o del
   eje de otra viga o columna del mismo nivel, se trata como unida y se extiende hasta la unión.
   Así desaparecen los huecos de la captura 1. A más de 5 cm no se toca.
4. **Muro con capas:**
   - **En L:** cada capa de cada muro se ingletea sobre la **bisectriz** de la esquina; las capas
     del mismo lado se encuentran en la línea de inglete.
   - **En T:** cada capa del muro que llega se recorta en la cara exterior del muro pasante.
   - El 3D y la planta deben mostrar **el mismo contorno**: misma regla y misma función.
5. **Recalcular al editar.** Al mover, borrar o cambiar el tipo o la sección de un elemento se
   recalculan las uniones **de sus vecinos**: la viga que se recortó contra una columna borrada
   vuelve a su largo. Una sola entrada de deshacer.
6. **Sin aristas internas.** En la vista sombreada, la arista entre dos caras **coplanares** de
   elementos unidos del mismo material no se dibuja. La lógica de aristas vive en
   `src/features/modelo/geometria.ts`, que puedes tocar. Las aristas de silueta sí se dibujan.

## Dónde
- **Núcleo Python:** `nucleo/openrvt_nucleo/modelado.py` (la geometría de vigas y la huella de
  muros con capas) e `interacciones.py` si hace falta registrar la unión. Por cada unión aplicada
  se crea un `IfcRelConnectsElements` o `IfcRelConnectsPathElements` estándar, con el elemento que
  manda primero. Así se lee y se exporta.
- **Medición:** `nucleo/openrvt_nucleo/medicion.py`. El volumen de concreto sale del sólido ya
  recortado.
- **Frontend:** solo `src/features/modelo/geometria.ts` (aristas) y, si el 3D construye las capas
  en TypeScript, el archivo donde lo haga. **No** toques `Visor3D.tsx` salvo una llamada mínima;
  si la necesitas, anótala en el progreso.

## Casos de referencia (a mano)
Contratrabe CT-1 de 0.20 × 0.40 y columnas de 0.30 × 0.30.

| Caso | Datos | Resultado esperado | Volumen |
|---|---|---|---|
| **L sin columna** | A: (0,0)→(4,0); B: (0,0)→(0,3) | A más larga, de x = −0.10 a 4.00 (4.10 m). B, de y = 0.10 a 3.00 (2.90 m). | 0.20·0.40·(4.10 + 2.90) = **0.560 m³**. Sin unión darían 0.560 con un hueco de 0.10 × 0.10 en la esquina exterior y un traslape de 0.10 × 0.10. |
| **T sin columna** | A pasante (0,0)→(6,0); B llega de (3,3)→(3,0) | B termina en y = 0.10 (2.90 m). | 0.20·0.40·(6.00 + 2.90) = **0.712 m³**. Antes: 0.720, con 0.008 contados dos veces. |
| **Con columna en el nodo** | Columna en (3,0); A1 (0,0)→(3,0); A2 (3,0)→(6,0) | A1 y A2 se recortan en x = 2.85 y x = 3.15. | — |
| **Hueco de 3 cm** | B termina en (3,0.13) junto a la cara de A en y = 0.10 | Se une. | — |
| **Hueco de 8 cm** | — | No se une. | — |
| **Muro en L con 3 capas** (acabado 0.02 / block 0.15 / acabado 0.02) | — | Cada capa forma un inglete limpio a 45°. La suma de las áreas de capa en planta = el área de la huella del muro. | — |

## Pruebas obligatorias
- **pytest de cada caso de la tabla.** La aserción es el volumen y las coordenadas, comparados con
  los valores a mano.
- **Invariante:** en un modelo con varias uniones, la Σ de los volúmenes de concreto es igual al
  volumen de la unión booleana de los sólidos. Ninguna intersección entre sólidos tiene volumen
  mayor de 1e-6 m³.
- **Secuencia:** borrar la columna de un nodo, y las vigas se unen entre sí; deshacer, y vuelven a
  recortarse contra la columna.
- **Compatibilidad:** abrir un `.ifc` de la 0.5.7 con vigas encimadas lo regenera con uniones
  correctas, sin perder elementos.
- **E2E:** reproduce la cimentación de la captura 1, con 6 zapatas, contratrabes unidas por eje,
  una L, una T y un hueco de 3 cm.
  - Capturas en perspectiva e isométrico en `resultados/O012/`, antes y después.
  - Mide que no haya aristas dibujadas dentro de las uniones: cuenta las aristas de la malla de
    aristas en una caja alrededor del nodo.
- **Muros:** E2E de los 4 muros de la captura 2 con capturas antes y después de las esquinas.

## Entrega
- pytest, vitest, tsc, eslint y los E2E nuevos, todo en verde.
- `docs/progreso/O012.md` con una tabla regla → hecho → prueba y las «Notas de la versión».
- Commits en español, sin push y sin cambiar la versión.
