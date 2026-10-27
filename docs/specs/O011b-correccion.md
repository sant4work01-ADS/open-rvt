# O011b: corrección del supervisor a O011

Revisé `resultados/O011/alzado-norte.png` y `resultados/O011/eje-2-codos.png`. La anotación
vectorial y los paneles plegables están bien. Faltan tres defectos:

1. **Globos en alzado encima del Nivel 4.** Los globos se dibujan sobre la línea del nivel más
   alto, y el globo 1 tapa la etiqueta «Nivel 4 +12.00». La spec pide el globo **por encima** del
   nivel más alto visible, con 3 mm en papel de margen entre la línea del nivel y el **borde
   inferior** del círculo, no entre la línea y su centro. Esto aplica a **todos los niveles**,
   aunque la vista solo marque algunos como visibles. Los alzados dibujan las líneas de todos los
   niveles.

   Prueba E2E: el borde inferior de cada globo queda arriba de la Y de la línea del nivel más alto,
   y ningún globo se interseca con el rectángulo de una etiqueta de nivel.
2. **Etiquetas de nivel dentro de los ejes.** «Nivel n +x.xx» debe quedar **fuera** del último
   eje, a la derecha (o a la izquierda, según el lado que tenga la etiqueta). La línea del nivel se
   extiende hasta pasar el último eje + 3 mm, y ahí va la etiqueta, igual que en Revit. Las cotas
   parciales («3.00») y la cota «Total» van más afuera todavía, sin encimarse con las etiquetas.

   Prueba E2E: ningún rectángulo de etiqueta o cota se interseca con una línea de eje ni con un
   globo.
3. **Los codos no mueven el globo.** Con 2 codos en el extremo «fin» del eje 4, el globo sigue en
   su lugar y solo aparece un segmento diagonal con un asa. Lo correcto es como el «Add elbow» de
   Revit:
   - la línea del eje termina donde siempre;
   - de ahí sale el tramo con los codos;
   - el **globo se dibuja en el extremo del último codo**, desplazado, para que no se encime con
     el globo vecino.

   Valores por omisión del primer codo:
   - el extremo se desplaza **lateralmente 1 diámetro de globo**;
   - el tramo queda así: vertical 3 mm, diagonal hasta el desplazamiento, vertical 3 mm y globo.

   Al arrastrar las asas se mueven los vértices y el globo los sigue. Con 0 codos todo queda como
   antes.

   Prueba unitaria: posición del centro del globo con 0, 1 y 2 codos, con coordenadas calculadas a
   mano. Prueba E2E: tras «Agregar codo», el centro del globo del eje 4 se movió al menos un
   diámetro en X.

Entrega:
- capturas nuevas en `resultados/O011/`: `alzado-norte.png`, `eje-2-codos.png` y una de la
  planta con codos;
- vitest, tsc, eslint y los E2E de O011, en verde;
- el progreso al día en `docs/progreso/O011.md` (sección O011b).

Sin push. La versión sigue en 0.5.8.
