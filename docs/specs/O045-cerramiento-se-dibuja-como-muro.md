# O045: el cerramiento se dibuja igual que el muro y va embebido en él (no lo corta)

## Reporte del dueño (3-nov, con la 0.5.26)
«Simplemente no se dibuja. El modo en que se dibuja es lo que no sirve: no es como el muro, el cerramiento tiene otra
manera y no me gusta su comportamiento.» Su archivo está en `e2e/datos/cerramiento-dueno.ifc`.

**Hoy:** con la herramienta Cerramiento, un clic sobre un muro crea un cerramiento en todo el largo del muro
(`estado.ts`, rama `herramienta === "cerramiento"`, `cerramientos.crear_en_muro`). Si el clic no cae sobre un muro,
pasa al modo lineal de dos puntos. El usuario dibuja como si fuera un muro: un clic de inicio y otro de fin, en cadena.
Por eso el primer clic ya crea uno completo, el segundo cae en otro muro o en el mismo («ya tiene cerramiento») y el
resultado no corresponde a sus clics.

## Decisiones ya tomadas (no las cambies)
1. **La herramienta Cerramiento funciona exactamente como la herramienta Muro.** Reutiliza el mismo código, no lo copies:
   - clic de inicio y clic de fin;
   - en cadena: el fin de uno es el inicio del siguiente;
   - Esc termina la cadena y un segundo Esc sale de la herramienta;
   - longitud tecleada más Enter;
   - los mismos snaps: extremos y puntos medios de muros, cruces de ejes, ortogonal y cotas temporales;
   - la misma vista previa mientras se mueve el cursor;
   - el doble clic termina.
   - Ya no hay modo de «un clic = todo el muro».
2. **Se liga solo al muro que tiene debajo, y va EMBEBIDO en el muro (corrección del dueño, 3-nov: «¿por qué el
   cerramiento corta el muro? Va embebido en el muro, recubierto por sus recubrimientos; lo mismo los castillos»).**
   - **Liga:** si el tramo dibujado es colineal con el eje de un muro (tolerancia: la mitad del espesor del muro) y cae
     dentro de su largo, el cerramiento queda ligado a ese muro solo en planta: sigue su eje y su largo. Puede cubrir solo
     una parte del muro, por ejemplo encima de una puerta. Si abarca varios muros colineales seguidos, se crea un
     cerramiento por muro, cortado en las juntas. Si no está sobre ningún muro, queda libre, sin liga.
   - **El muro NO se corta ni se acorta.** Se quita la regla de O041 «el muro ligado termina en la cara inferior del
     cerramiento»:
     - el muro conserva su altura según sus propias restricciones (base y tope);
     - el cerramiento queda dentro del muro, como los castillos;
     - en planta, alzado y 3D el muro se ve continuo y el cerramiento, dentro de él;
     - el núcleo deja de cambiar la altura del muro al crear, mover o cambiar de nivel un cerramiento;
     - los castillos también llegan a la altura que les toca y no recortan el muro.
   - **Cantidades (embebido):**
     - **volumen y área de block del muro:** se descuenta la parte que ocupan los cerramientos y castillos embebidos (su
       sección dentro del espesor del muro). Si el cerramiento o el castillo es más ancho que el muro, solo se descuenta
       la parte que está dentro del espesor;
     - **aplanados, yeso, pintura y recubrimientos del muro:** se miden sobre la cara completa del muro, sin descontar
       cerramientos ni castillos, porque el recubrimiento los cubre;
     - **concreto y acero:** van completos en el cerramiento y en el castillo.
     Revisa cómo se mide hoy en CantidadesView o en el módulo de cantidades y ajústalo con esta regla.
   - **Archivos ya hechos con la regla vieja** (como `e2e/datos/cerramiento-dueno.ifc`, donde un muro mide 2.00 por su
     cerramiento en 2.20 aunque su tope es Nivel 4): al abrirlos, cada muro recupera la altura de sus propias
     restricciones (en ese archivo, de 0 a 3.60). Lo hace una vez, en un solo paso, y sin aviso molesto: solo una línea en
     la bitácora.
3. **Nivel y desfase** como en O043:
   - nivel de la planta activa con desfase 0, salvo que el usuario elija otro en la barra de opciones;
   - en alzado, corte y 3D, la regla de O041.
4. **Encima del mismo tramo de un muro que ya tiene cerramiento en ese nivel:** no se duplica. Aviso «Ese tramo ya tiene
   cerramiento en <nivel>».
5. **La barra de opciones** muestra Tipo, Nivel y Desfase como hoy, y además el mismo indicador de paso que Muro
   («primer punto», «segundo punto o longitud y Enter»).
6. **La Dala no cambia** en esta tarea.

## Pruebas obligatorias
- **E2E nuevo `e2e/o045.test.js`, con clics reales:**
  - Abre `e2e/datos/cerramiento-dueno.ifc`.
  - En la Planta Nivel 1, dibuja con la herramienta, en una sola cadena, sobre el muro izquierdo: inicio en una esquina
    y fin en la otra. Debe quedar un cerramiento nuevo ligado a ese muro, en el Nivel 1, y sin duplicados en los otros
    3. Al abrir el archivo, los 4 muros miden de 0 a 3.60 (su tope); ninguno quedó cortado por su cerramiento.
  - En un modelo nuevo con un rectángulo de 4 muros de 7 × 5 m: cadena de 5 clics que recorra las 4 esquinas y cierre.
    Deben salir 4 cerramientos, uno por muro, ligados a su muro, y cada muro debe conservar su altura completa, con el
    cerramiento dentro.
  - Cantidades de un muro de 7 × 2.60 de block de 15 cm con un cerramiento de 15 × 20 y dos castillos de 15 × 15
    (calculado a mano en el comentario):
    - área de block = 7 × 2.60 − (7 − 2 × 0.15) × 0.20 − 2 × 0.15 × 2.60 = 18.20 − 1.34 − 0.78 = 16.08 m²;
    - aplanado por cada cara = 18.20 m².
  - Un tramo de 2 m sobre un muro de 7 m: un cerramiento de 2 m.
  - Un tramo libre, fuera de muros: un cerramiento sin liga.
  - Repetir la cadena sobre los mismos muros: aviso y sin duplicados.
  - Esc a media cadena: no deja nada a medias.
  - Capturas en `docs/progreso/O045/`, leídas como imagen.
- **Actualiza las E2E que usaban un clic sobre el muro:** `o041.test.js`, `cerramiento-niveles.test.js`,
  `cerramiento-rectangulo.test.js` y `cerramiento-dueno.test.js`. Pasan a dibujar con inicio y fin y conservan sus
  aserciones de nivel y liga; las de «el muro termina bajo el cerramiento» se cambian a «el muro conserva su altura». No las borres.
- **vitest:** detección de colinealidad con un muro (dentro y fuera de la tolerancia), corte por juntas de muros
  colineales y nivel por omisión de la planta activa.
- **pytest:** crear un cerramiento por dos puntos sobre un muro lo liga; sobre medio muro, es parcial; fuera de muros,
  queda libre; repetido, da error claro sin cambiar el modelo.
- **Comprobaciones finales:** `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=2`, pytest completo y los E2E o035,
  o041, o043 y nivel-con-zapata.

## Reglas
- `modelado.py`, `interacciones.py`, `Visor3D.tsx` y `estado.ts` conservan su fin de línea CRLF.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Todo lo pesado (E2E, pytest o vitest completos, `tauri build`) se corre con `pesado <comando>`.
- Resumen en `docs/progreso/O045.md`.
