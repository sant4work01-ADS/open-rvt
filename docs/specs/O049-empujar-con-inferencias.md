# O049: empujar/tirar con inferencias 3D (cierre de la fase 1)

## Para qué
O046 dejó la herramienta Empujar/Tirar y O047 el motor puro `inferencias3d.ts`. Esta tarea los une: al dibujar en
3D, el cursor se engancha a extremos, puntos medios, aristas, caras y ejes de los elementos existentes, como en un
modelador de empujar/tirar. **Sala limpia:** no abras ni busques el código de IngeTrazo ni de SketchUp; sí puedes
leer `docs/referencias/ingetrazo-modelado.md` (tema 2) y `docs/progreso/O047.md`.

## Qué hace (decisiones, no las cambies)
1. **Cableado:**
   - en la herramienta `empujar`, cada movimiento del ratón llama a `inferir()` con:
     - el rayo de la cámara;
     - `proyectar` a píxeles del lienzo;
     - el plano del nivel activo;
     - el `puntoPrevio` (primer clic del contorno);
     - candidatos: vértices, aristas y caras de los elementos visibles;
   - la geometría de candidatos se arma de las mallas que ya tiene el visor. Usa un caché por elemento que se
     invalida al cambiar el modelo, y en cada movimiento solo las mallas cuyo bounding box en pantalla esté a
     ≤ 60 px del cursor;
   - el punto inferido reemplaza al corte simple contra el plano, tanto para el primer clic como para la esquina
     opuesta.
2. **Dibujo en caras:** si el primer clic se engancha **sobre la cara superior** de un elemento (normal +Z), el
   contorno se dibuja en ese plano (z de la cara) y el sólido nace ahí, ligado al nivel activo con su desfase.
   Ejemplo: un muro sobre una losa. Las caras verticales quedan fuera de esta tarea.
3. **Indicadores:**
   - marcador en el punto con la forma y el color según el tipo: extremo = cuadro verde, medio = triángulo
     cian, sobre arista = rombo rojo, intersección = equis, sobre cara = rombo azul;
   - la guía punteada de los ejes, en rojo, verde y azul, como en el resto de la app;
   - un tooltip corto junto al cursor: «Extremo», «Punto medio», «En arista», «En cara», «Eje X»…
4. **Bloqueos:** Shift fija la inferencia de eje o de paralelo actual mientras se mantiene presionado.
   - Flecha derecha = eje X, izquierda = eje Y, arriba = eje Z; la misma flecha otra vez lo suelta.
   - Esc sigue cancelando.
5. **Arreglos de O046:**
   - después de crear cada sólido, la vista 3D y la barra de estado deben refrescarse con el número correcto de
     elementos. En la captura de O046 había 4 en el núcleo y la barra decía 3: reproduce el caso y corrige;
   - la cámara no salta al crear.

## Pruebas obligatorias
- **vitest:** el armado de candidatos desde mallas (un cubo de 1 m da 8 vértices, 12 aristas y 6 caras, con sus
  normales), el filtro de 60 px y la invalidación del caché.
- **E2E `e2e/o049.test.js`, con clics reales en perspectiva:**
  - una losa 5 × 4 × 0.12 tecleada;
  - después, empezar el contorno moviendo el ratón a ±5 px de la esquina superior de la losa: el primer punto debe
    ser exactamente (0, 0, 0.12) (calculado de la losa), con el marcador de extremo visible;
  - teclear `4,0.15` y `2.6`: sale un IfcWall cuya base queda a z = 0.12 (desfase), no a 0;
  - punto medio de un borde de 5 m de la losa → (2.5, 0, 0.12);
  - eje X con Shift: el segundo punto conserva y y z del primero;
  - el conteo de la barra de estado coincide con `modelo.elementos` después de cada paso;
  - capturas en `docs/progreso/O049/` con los marcadores de extremo, medio y eje, leídas como imagen.
- **Comprobaciones finales:** `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2`, pytest completo y los E2E
  o046, o049 y herramientas.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea CRLF.
- No cambies la lógica de prioridad de `inferencias3d.ts`. Si hace falta algo, agrégalo con prueba y anótalo.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Todo lo pesado se corre con `pesado <comando>`; Playwright con `--workers=1`.
- Resumen en `docs/progreso/O049.md`: cómo se siente y qué falta para las fases 2-3.
