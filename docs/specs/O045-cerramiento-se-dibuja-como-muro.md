# O045: el cerramiento se dibuja igual que el muro

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
2. **Se liga solo al muro que tiene debajo.** Si el tramo dibujado es colineal con el eje de un muro (tolerancia: la
   mitad del espesor del muro) y cae dentro de su largo, el cerramiento queda ligado a ese muro con las reglas de O041 y
   O043:
   - el muro termina en la cara inferior del cerramiento;
   - el cerramiento sigue al muro en planta.

   Puede cubrir solo una parte del muro, por ejemplo sobre una puerta. En ese caso solo esa parte del muro queda a la
   altura del cerramiento; si eso no es posible hoy, el muro no cambia de altura y se avisa una vez «Cerramiento
   parcial: el muro conserva su altura».

   Si el tramo abarca varios muros colineales seguidos, se crea un cerramiento por muro, cortado en las juntas. Si no
   está sobre ningún muro, queda libre, sin liga.
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
    3.
  - En un modelo nuevo con un rectángulo de 4 muros de 7 × 5 m: cadena de 5 clics que recorra las 4 esquinas y cierre.
    Deben salir 4 cerramientos, uno por muro, ligados a su muro, y cada muro debe terminar en la cara inferior de su
    cerramiento.
  - Un tramo de 2 m sobre un muro de 7 m: un cerramiento de 2 m.
  - Un tramo libre, fuera de muros: un cerramiento sin liga.
  - Repetir la cadena sobre los mismos muros: aviso y sin duplicados.
  - Esc a media cadena: no deja nada a medias.
  - Capturas en `docs/progreso/O045/`, leídas como imagen.
- **Actualiza las E2E que usaban un clic sobre el muro:** `o041.test.js`, `cerramiento-niveles.test.js`,
  `cerramiento-rectangulo.test.js` y `cerramiento-dueno.test.js`. Pasan a dibujar con inicio y fin y conservan sus
  aserciones de nivel, liga y altura del muro. No las borres.
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
