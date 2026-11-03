# O042: codo del eje como en la referencia (tercera vez que se reporta)

El usuario reportó el codo del eje en O011b, en O037 y otra vez hoy tras la 0.5.21, textual:
> «esto sigue culero y mal hecho … cada nodo se va a mover tanto vertical como horizontal, no a la misma vez pero del
> mismo punto se podrá … ya estoy hasta la madre de esos artefactos que ni sirven».

- `docs/specs/O042/hoy-mal.png`: así se ve hoy. Eje vertical «2» con codo:
  - el tramo final va **horizontal** hacia la cabeza, cuando debería ser paralelo al eje;
  - hay dos cuadros de pinzamiento y una diagonal que no une nada;
  - hay un hueco en la línea.
- `docs/specs/O042/referencia.png`: **así debe verse.** De arriba abajo:
  1. Eje recto.
  2. Codo hacia un lado.
  3. Codo hacia el otro lado.
  4. Codo con la diagonal y el tramo final más largos.

Lee las dos imágenes antes de empezar.

## Decisiones ya tomadas (no las cambies)

### Forma
- **Un codo = dos nodos.** Desde el extremo del eje, la línea es:
  - recta sobre el eje hasta el nodo **V1**;
  - diagonal de V1 a **V2**;
  - recta de V2 al borde del globo. Este tramo es **paralelo al eje**, con el mismo sentido hacia afuera.
- **Máximo un codo por extremo.** Se quita el «segundo codo» de O011b. Un archivo viejo con dos codos se lee así:
  - V1 = el primer codo;
  - V2 = el segundo;
  - el globo, paralelo al eje desde V2.
- **«Agregar codo» crea el codo completo de una vez,** como el caso 2 de la referencia. Con D = diámetro del globo en
  el modelo:
  - V1 a 2·D antes del extremo, sobre el eje;
  - V2 a D hacia afuera de V1 y D de lado;
  - el tramo final mide D/2 hasta el borde del globo.
  - El extremo de la línea dibujada queda en el borde del globo; el globo no se superpone a V2.
- **Dibujo:**
  - el eje conserva su patrón de trazo y punto, continuo, hasta V1;
  - de V1 al globo la línea es **continua y fina**, del mismo color;
  - no hay huecos en V1 ni en V2, ni junto al globo.

### Nodo que se mueve (aclaración del usuario: «nomás el rojo es el que se moverá y ya»)
- En la referencia, el usuario marcó en rojo V2 (el nodo donde empieza el tramo final hacia el globo): **solo V2 se arrastra.** V1 queda fijo sobre el
  eje y no tiene pinzamiento. No hay pinzamiento en el globo ni en ningún otro punto del codo.
- Con el eje seleccionado se ve **un** pinzamiento redondo pequeño exactamente en V2 (además de los que el eje ya
  tenga en sus extremos de línea). Nada de cuadros ni pinzamientos sueltos.
- V2 se mueve **a lo largo** del eje o **perpendicular** a él (local al eje: en un eje vertical = vertical u
  horizontal), **una dirección por arrastre**: se elige por el componente mayor de los primeros 4 px y queda fija hasta
  soltar; el siguiente arrastre desde el mismo punto puede usar la otra. Guía tenue de la dirección bloqueada.
- El tramo final y el globo siguen a V2 sin cambiar su largo; el tramo final siempre paralelo al eje.
- Esc cancela; un arrastre = un paso de Deshacer; redondeo a 1 mm de papel.
- **Quitar el codo:** el menú contextual sobre V1 o V2 tiene «Quitar codo». La línea vuelve recta y el globo vuelve al
  extremo.
- Todo es anotación de la vista (`Vista.ejes`). Nunca modifica el IfcGrid; esto ya es así y no cambia.

## Archivos
- `src/features/modelo/ejesVista.ts`: `agregarCodoEje`, `quitarCodoEje`, `normalizarAjusteEje`, tramos.
- `src/features/modelo/anotacionVista.ts` y `Visor3D.tsx`: dibujo y pinzamientos de ejes. Usa grep, no leas los
  archivos completos.
- `src/features/modelo/tipos.ts` y `estado.ts`: validación al leer el pset.
- Las pruebas de O011b y O037 que cubren codos se **reescriben** con la forma nueva. No las borres sin reemplazarlas.

## Pruebas obligatorias (valores a mano)
- **vitest (`ejesVista.test.ts`):**
  - Eje horizontal de (0,0) a (10,0), D = 0.8. Agregar codo al final da V1 = (8.4, 0), V2 = (9.2, 0.8) y globo
    centrado en (9.2 + 0.4 + 0.4, 0.8) = (10.0, 0.8).
  - Eje vertical de (0,0) a (0,10): el tramo final es **vertical**.
  - Arrastre de V2 con (+0.30, +0.02): se bloquea a lo largo y solo cambia x de V2 y del globo.
  - Arrastre de V2 con (0.01, −0.50): se bloquea perpendicular y solo cambia y.
  - V1 y el globo no tienen pinzamiento; el único pinzamiento del codo está en V2 (±1e-9).
  - Un archivo con dos codos viejos se lee como uno.
  - Quitar el codo devuelve el ajuste original.
- **E2E `e2e/o042.test.js`, con clics y arrastres reales del mouse en planta:**
  1. Ejes 1 (vertical) y A (horizontal).
  2. Agregar codo al extremo de cada uno.
  3. Arrastrar V2 casi vertical y comprobar que solo cambió esa componente. Desde el mismo nodo, arrastrar casi
     horizontal y comprobar la otra.
  4. Comprobar que V1 y el globo no se pueden arrastrar.
  5. Esc a mitad de un arrastre.
  6. Deshacer y Rehacer.
  7. Quitar codo.
  8. Comprobar las coordenadas leídas del estado.
  9. Capturas en `docs/progreso/O042/`, que **leerás como imagen** y compararás con `referencia.png`:
     - los 4 casos de la referencia, reproducidos en ejes horizontales;
     - el eje vertical con codo;
     - un eje seleccionado con sus pinzamientos.
- Corre `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=3` y los E2E que tocan ejes (o011, o037 si existe,
  o028).

## Reglas
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O042.md`, con las capturas y qué comparaste contra la referencia.
