# O043: cerramientos dibujados en la planta de un nivel intermedio

## Reporte del dueño (3-nov)
Hizo 5 niveles: 0, 2.20, 3.00, 3.20 y 3.60. Puso la losa en el 0, zapatas y muros con restricción del Nivel 0 al 3.60.
Luego dibujó cerramientos en el nivel 2.20: «No se dibujó bien con respecto a mis clics. El último no se dibujó; se
redibujó de nuevo el primero».

## Reproducción (ya hecha por el supervisor)
`e2e/cerramiento-niveles.test.js` repite el caso con la interfaz y falla. Captura: `docs/progreso/cerramiento-niveles/despues.png`.
1. **La planta «Planta N 2.20» sale vacía.** No muestra los muros del Nivel 0 aunque suben hasta 3.60: el filtro
   «Niveles visibles» solo deja ver los elementos cuyo nivel base es N 2.20. El usuario dibuja a ciegas.
2. **El cerramiento se va al nivel de tope del muro (N 3.60) y no al de la planta donde se dibujó (N 2.20).** Hoy aplica
   la regla de O041 §1: nivel = tope del muro.

## Decisiones ya tomadas (no las cambies)
1. **Planta de un nivel = corte horizontal, como en Revit.**
   - La planta del nivel L muestra, cortado, todo elemento cuyo rango vertical cruce el plano de corte: muros,
     columnas, castillos y cerramientos. El plano está a elevación(L) + altura de corte del rango de vista (hoy 1.20 m
     por omisión; usa el valor que ya existe en el rango de vista).
   - El elemento se muestra aunque su nivel base sea otro (por ejemplo, un muro del Nivel 0 que sube a 3.60 aparece en
     la planta de 2.20 y en la de 3.00).
   - Lo que está debajo del plano de corte y dentro de la profundidad de vista (hasta elevación(L)) se dibuja en
     proyección, como ya se hace con lo del propio nivel.
   - Esos elementos se pueden seleccionar, sirven de referencia de snap y los usan las herramientas (Cerramiento,
     Castillo, Dala, Puerta, Ventana) igual que los del propio nivel.
   - «Niveles visibles» sigue funcionando como filtro adicional. Por omisión, una planta deja ver los elementos que la
     cortan, vengan del nivel que vengan.
2. **El cerramiento creado con clic en una planta toma el nivel de esa planta.**
   - Al crearlo con la herramienta en la planta del nivel L, va con nivel = L y desfase = 0, salvo que el usuario haya
     elegido otro nivel o desfase en la barra de opciones.
   - La barra de opciones muestra preseleccionado el nivel de la planta activa.
   - En alzado, corte o 3D se queda la regla de O041 (tope del muro).
   - Se mantiene el resto de O041: el muro ligado termina en la cara inferior del cerramiento. Con el cerramiento en
     2.20, el muro de 0 a 3.60 queda de 0 a 2.20 menos el peralte, y su panel lo muestra.
3. **Un clic = un cerramiento en el muro bajo ese clic.**
   - Si el muro bajo el clic ya tiene cerramiento en ese mismo nivel, no se crea otro ni se rehace el existente. Aparece
     el aviso «Ese muro ya tiene cerramiento en N 2.20».
   - Nunca se redibuja otro cerramiento ya hecho.
4. **El muro bajo el clic se elige bien.** Es el muro más cercano al clic, medido sobre la planta activa, dentro de la
   tolerancia actual. Cerca de un cruce gana el de menor distancia al eje, no el primero de la lista.

## Pruebas obligatorias
- **E2E `e2e/cerramiento-niveles.test.js`** (ya existe; amplíalo, sin quitar aserciones):
  - en «Planta N 2.20» los 6 muros del Nivel 0 se ven (cuéntalos en el teselado o en la vista de la planta) antes de
    dibujar;
  - tras cada uno de los 6 clics hay exactamente un cerramiento más, ligado al muro bajo ese clic (compara el GlobalId);
  - todos quedan en N 2.20 con desfase 0;
  - cada muro mide de 0 a 2.20 − peralte del cerramiento;
  - un séptimo clic sobre el primer muro da el aviso y deja 6 cerramientos sin cambios;
  - capturas antes y después en `docs/progreso/O043/`, leídas como imagen; en la de después se ven los muros y los
    cerramientos.
- **Caso del dueño completo, en un segundo test:**
  - losa en el Nivel 0;
  - zapatas aisladas en las 9 esquinas y cruces de la retícula;
  - muros del 0 al 3.60;
  - cerramientos desde Planta N 2.20 con clics en el orden 1 a 6, uno sobre cada muro;
  - mismas comprobaciones.
- **vitest:** elección del muro más cercano cerca de un cruce, y nivel por omisión del cerramiento = nivel de la planta
  activa.
- **pytest:** si `cerramientos.crear_en_muro` recibe un muro que ya tiene cerramiento en ese nivel, da error claro y no
  cambia el modelo.
- **No deben romperse:** los E2E o041, o035, o012b, o007b, o007c, o028 y nivel-con-zapata.
- **Comprobaciones finales:** `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2` y pytest completo.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea CRLF.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Todo comando pesado (E2E, pytest o vitest completos, `tauri build`) se corre con `pesado <comando>`.
- Resumen en `docs/progreso/O043.md`.
