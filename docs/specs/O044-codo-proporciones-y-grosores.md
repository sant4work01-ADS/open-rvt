# O044: codo del eje como lo dibujó el dueño (V1 a lo largo, V2 en X o Y) y grosores de línea en planta

## Reporte del dueño (3-nov)
1. «Los codos de ejes aún se ven feos, no como mi referencia los pedía.»
2. «Las líneas de los elementos en planta son demasiado gruesas, de manera desproporcionada.»

## 1. Codo como lo dibujó el dueño
Antes de empezar, lee como imagen `docs/specs/O044/dueno-codo.png`. Es la indicación más reciente y **manda sobre
O042**. Lee también `docs/specs/O042/referencia.png`.
- **En rojo, lo que está mal hoy en el eje B:** la diagonal sale justo del cruce con el eje 2, sin tramo recto, y sube
  larga y pegada hasta el globo. El codo no se distingue del resto del eje.
- **En azul, cómo debe verse:**
  - el eje sigue **recto** sobre su dirección más allá del cruce hasta el nodo **V1**;
  - de V1 sale una diagonal **corta**, de unos 45°, hasta **V2**;
  - de V2 sale un tramo recto **paralelo al eje** hasta el borde del globo.
- **En verde, cómo se mueve cada nodo:**
  - **V1** se mueve solo **a lo largo del eje**: flecha horizontal en un eje horizontal y vertical en uno vertical. Nunca
    se sale de la línea del eje.
  - **V2** se mueve **en X o en Y**, una dirección por arrastre. Se elige por el componente mayor de los primeros 4 px y
    queda fija hasta soltar. El siguiente arrastre, desde el mismo nodo, puede usar la otra. Así se ajusta paso a paso.
  - El globo y el tramo final siguen a V2. El tramo final siempre queda paralelo al eje y conserva su largo.

**Decisiones (no las cambies).** Con D = diámetro del globo:
- «Agregar codo» crea la forma azul. El globo queda en la misma posición a lo largo del eje que sin codo y solo se corre
  de lado:
  - V2 a 0.80·D del borde del globo, medido sobre el eje;
  - V1 a 0.50·D antes de V2 sobre el eje, con V2 corrido 0.55·D de lado;
  - si V1 quedara a menos de 0.30·D de un cruce con otro eje (o más atrás), el codo se recorre hacia afuera, con todo y
    globo, hasta dejar al menos 0.30·D de tramo recto pasado el cruce. Así nunca sale la diagonal del cruce, como en el
    rojo.
- **Pinzamientos:** con el eje seleccionado hay dos, redondos y pequeños (2.5 px de radio en pantalla), en V1 y en V2.
  Al pasar el cursor encima se ve la guía de la flecha:
  - en V1, solo la del sentido del eje;
  - en V2, las dos.
  - Nada de cuadros ni pinzamientos sueltos.
- **Dibujo:** el eje conserva su patrón de trazo y punto hasta V1. De V1 al globo la línea es continua, del mismo
  grosor y color. No hay huecos.
- **Arrastre:** cada arrastre es un paso de Deshacer; Esc cancela y se redondea a 1 mm de papel.
- **Codo viejo:** uno guardado con las medidas anteriores se respeta tal cual. Solo los nuevos usan esta forma.
- **«Quitar codo»** del menú contextual sigue igual.
- Es anotación de la vista; nunca modifica el IfcGrid.

## 2. Grosores de línea en pantalla independientes del zoom
**Hoy:** `mmAPx` en `estilos.ts:550` convierte los mm de papel con `mundoPorPx`. Al acercar, la línea engorda en
proporción: un muro cortado de 0.5 mm se vuelve una franja gruesa y todo se ve pesado y desproporcionado.

**Decisiones (no las cambies):**
- **En pantalla**, como hace Revit, el grosor de las líneas no depende del zoom ni de la escala:
  - px = max(1, mm × 2.2), redondeado a 0.5 px;
  - muro cortado de 0.5 mm → 1.1 px; proyección de 0.18 mm → 1 px.
  - La jerarquía se conserva con el color o la intensidad: corte en negro pleno, proyección en gris oscuro (#444).
  - Aplica a todos los elementos de planta, alzado y corte, y a las anotaciones: ejes, cotas, niveles.
- **Al imprimir o exportar a PDF** se siguen usando los mm de papel reales a la escala de la vista. No cambies esa ruta.
  Si hoy no existe impresión, deja la función `grosorPapelMm` intacta para cuando llegue.
- La tabla de estilos (mm por categoría) y la UI para editarla no cambian.

## Pruebas obligatorias
- **vitest:**
  - `agregarCodoEje` da V1, V2 y el globo con las medidas de arriba en un eje horizontal y en uno vertical (valores
    calculados a mano en el comentario);
  - con un cruce cerca del extremo, el codo se recorre para dejar 0.30·D de tramo recto pasado el cruce;
  - arrastrar V1 con el mouse en diagonal solo lo mueve a lo largo del eje;
  - arrastrar V2 en diagonal lo mueve solo en el componente mayor;
  - dos arrastres seguidos de V2, uno en X y otro en Y, dan el punto esperado;
  - un codo viejo cargado no cambia;
  - el grosor en px de 0.5 mm y de 0.18 mm es el mismo con zoom 0.5×, 1× y 8×.
- **E2E (actualiza `e2e/o042.test.js`):**
  - recrea la retícula de la captura del dueño (ejes 1, 2, A y B) y agrega un codo en el extremo derecho de B;
  - mide en pantalla las proporciones (tolerancia ±10 %) y comprueba que hay tramo recto pasado el cruce con el eje 2;
  - arrastra V1 y V2 con eventos reales de puntero;
  - captura `docs/progreso/O044/codos.png` de la misma retícula que la del dueño: debe verse como su línea azul;
  - captura `docs/progreso/O044/planta-grosores.png` de la retícula de 6 muros de o041, con zoom normal y con zoom
    cercano. Las líneas deben verse finas en las dos.
  - Lee las capturas como imagen y compáralas con la referencia antes de entregar.
- **No deben romperse:** los E2E o011, o028, o036 y o042 y las capturas de estilo (o014a, o024 o donde se prueben
  grosores). Si alguna prueba fija el grosor viejo en px, actualízala a la regla nueva y explica por qué en
  O044.md.
- **Comprobaciones finales:** `npx tsc --noEmit`, `npm run lint` y vitest `--maxWorkers=2`.

## Reglas
- `Visor3D.tsx`, `estado.ts`, `modelado.py` e `interacciones.py` conservan su fin de línea CRLF.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Todo lo pesado (E2E, vitest completo, `tauri build`) se corre con `pesado <comando>`.
- Resumen en `docs/progreso/O044.md`.
