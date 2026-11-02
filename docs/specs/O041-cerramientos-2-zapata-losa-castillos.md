# O041: cerramientos de verdad, la zapata no corta la losa y castillos rápidos (reporte 2-nov, 0.5.19)

Reporte del usuario tras probar la 0.5.19, textual:
> «cerramientos no sirven, no hay manera de definirle un nivel, unos no se dibujan o se dibujan mal, no hay manera de
> tratarlo después de dibujarlos, la zapata sigue generando corte a la losa, los castillos tardaron demasiado en
> dibujarse, pensé que se trabaría el programa».

O040 se probó solo con llamadas al núcleo y por eso pasó, pero el usuario usa la interfaz. **En esta tarea todo se
reproduce con la interfaz**:
- clics en la planta con la herramienta «Cerramiento»;
- el panel Propiedades;
- la tecla Tab.

Cada falla lleva una prueba que falle antes del arreglo. Commit tras cada punto.

## Decisiones ya tomadas (no las cambies)

### 1. El cerramiento siempre tiene nivel editable
- **Panel.** Propiedades muestra «Nivel de referencia» (selector con todos los niveles) y «Desfase (m)». El desfase se
  mide del nivel a la cara **superior** del cerramiento. Los dos se pueden editar siempre, también si está ligado al
  muro. Se quita el modo «solo texto» de O040.
- **Valores al crearlo en un muro:**
  - nivel = nivel de tope del muro, si lo tiene; si no, el nivel de base con desfase = altura del muro;
  - desfase = desfase de tope del muro.
- **Qué hace la liga con el muro.** Es solo en planta: el cerramiento sigue el eje y el largo del muro.
  - La altura la manda el cerramiento: el muro ligado termina en la cara inferior del cerramiento. Si el cerramiento
    sube, el muro crece; si baja, el muro se acorta.
  - Los castillos del muro llegan a la cara inferior del cerramiento.
- **«Soltar del muro»** se queda: suelta la liga de planta y deja el cerramiento donde está.
- **Edición.** Cambiar el nivel o el desfase es un solo paso de Deshacer y conserva el GlobalId.
- **Cambio de elevación del nivel.** El cerramiento y el muro se mueven juntos.
- **Barra de opciones de la herramienta.** «Cerramiento» muestra «Nivel» y «Desfase» antes de hacer clic, con los
  valores por omisión de arriba. Lo que el usuario elija se aplica a los que cree.

### 2. Se puede seleccionar y editar después de dibujarlo
- **Planta.** El clic sobre un muro con cerramiento selecciona el muro, como hoy.
  - **Tab** recorre los elementos bajo el cursor: muro → cerramiento → castillo → muro. La barra de estado dice
    «Tab: siguiente (Cerramiento CE-1…)».
  - Pasar el cursor resalta el candidato.
  - Lo mismo en alzado y corte.
- **3D.** El clic directo selecciona el cerramiento.
- **Árbol del proyecto (O038).** Ya permite elegirlo; verifica que funcione con cerramientos.
- **Una vez seleccionado:**
  - Supr lo borra;
  - Mover o Copiar funcionan, o avisan con claridad si están ligados;
  - Propiedades edita tipo, nivel y desfase.

### 3. Dibujo en planta
- **El problema.** Con el mismo ancho que el muro, las dos líneas discontinuas de O040 quedan tapadas por el contorno
  del muro y el cerramiento «no se ve».
- **Regla nueva.** En planta el cerramiento se dibuja como **una línea discontinua sobre su eje**, fina, encima del
  achurado del muro, del mismo color de proyección.
- **Seleccionado.** Se resalta su huella completa (rectángulo).
- **Arriba del corte y sin muro debajo** (cerramiento suelto): contorno completo discontinuo.

### 4. «Unos no se dibujan o se dibujan mal»: matriz obligatoria
Cada caso se crea **con clics de la herramienta** en el E2E y con llamadas en pytest. En cada uno, comprueba:
- **Geometría:** cada cerramiento tiene malla, y en `geometria.teselar` ningún elemento queda sin geometría.
- **Volumen** = valor calculado a mano. En esquinas no hay hueco ni volumen duplicado: suma de netos = volumen de la
  unión.
- **Planta:** su línea de eje.

Los casos:
- uniones de muros en L, T y cruz, y una retícula de 3×3 cuartos;
- muros a eje, a paño exterior y a paño interior (O032), y muros de 15 y de 12 cm juntos;
- en dos órdenes: castillos y luego cerramientos, y cerramientos y luego castillos automáticos;
- un muro de 6 m con castillo intermedio;
- cerramiento sobre muro con losa encima y sin losa.

Si encuentras fallas que no estén en la lista, arréglalas y anótalas en `docs/progreso/O041.md`.

### 5. La zapata no corta la losa
Hoy, desde O037, el dado llega al nivel y le quita volumen a la losa: o012b da 1.779 en vez de 1.781. Es un error.

**Regla:**
- El dado sube hasta el nivel **solo si nada lo cubre**.
- Si en planta queda debajo de una losa, contratrabe o trabe de ese nivel, termina en la **cara inferior** de ese
  elemento.
- En las cantidades la losa tiene prioridad sobre el dado. La columna sí atraviesa la losa, como siempre.

**Pruebas:**
- regresa `e2e/o012b.test.js` a 1.781 (`17.8125 − 4·0.000625 = 17.8100 m² × 0.10`);
- en `e2e/o012.test.js` revisa las aristas del nudo y vuelve a exigir 2 si corresponde;
- en `test_o037` agrega:
  - zapata con losa encima → el dado termina en el lecho inferior de la losa;
  - zapata sin losa → el dado llega al nivel.

### 6. Castillos automáticos rápidos
Medido en la laptop con `castillos_automaticos` y retículas de cuartos de 4 × 3:

| Retícula | Muros | Castillos | Tiempo |
|---|---|---|---|
| 2×2 | 6 | 15 | 2.6 s |
| 3×3 | 8 | 28 | 9.7 s |
| 4×4 | 10 | 45 | 24.9 s |

Crece casi al cuadrado. Probablemente cada castillo nuevo regenera todos los muros y dependientes; confírmalo
perfilando con `time.perf_counter` por bloque, porque cProfile no ve el tiempo de IfcOpenShell.

- **Arreglo esperado.** Crear todos los castillos primero y después regenerar **una vez** cada muro afectado y sus
  dependientes.
- **Meta.** 4×4 en < 2 s y 3×3 en < 1 s en esta laptop. Prueba pytest con tope de tiempo y holgura ×3.
- **Interfaz.** Mientras corre, la interfaz muestra «Colocando castillos…» y no se congela.
- **Mismo patrón.** Revisa cerramientos en varios muros, zapatas en ejes y contratrabes entre ejes.

## Pruebas obligatorias
- **pytest:** todo lo de arriba, con valores calculados a mano.
- **vitest:**
  - panel de cerramiento con selector de nivel editable;
  - Tab cicla candidatos;
  - planta dibuja la línea de eje del cerramiento.
- **E2E `e2e/o041.test.js`, con clics reales:**
  1. Retícula 2×2 de muros dibujados con la herramienta Muro.
  2. Castillos automáticos con su botón, midiendo el tiempo en el E2E (< 3 s).
  3. Herramienta Cerramiento con clic en cada muro.
  4. Seleccionar un cerramiento con Tab en planta y cambiar su nivel en Propiedades a Nivel 1 − 0.20 → el muro
     cambia de altura.
  5. Supr de otro cerramiento.
  6. Zapata con losa encima: la losa conserva su volumen.
  7. Capturas en `docs/progreso/O041/`: planta, alzado y 3D con y sin selección, leídas como imagen.
- Corre la batería completa de E2E, `npx tsc --noEmit`, `npm run lint`, vitest `--maxWorkers=3` y pytest completo.

## Reglas
- `modelado.py` e `interacciones.py` conservan su fin de línea.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O041.md`.
