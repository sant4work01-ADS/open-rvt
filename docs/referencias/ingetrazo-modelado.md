# Modelado en IngeTrazo: lectura de sala limpia

Documento de diseño elaborado a partir de la lectura del código de IngeTrazo
(`C:/Users/Sant4/referencias-ext/ingetrazo`, GPL-3.0). No reproduce código ni
nombres de funciones: solo ideas, decisiones y valores, con la ruta y línea
donde se puede verificar cada afirmación. El objetivo es que otra persona
pueda implementar las mismas capacidades en OPEN-RVT sin leer el original.

Nota de contexto: IngeTrazo es un modelador de mallas de caras planas (estilo
«caja y empuje»), no un modelador BIM nativo. Varias de sus soluciones nacen de
esa elección y en OPEN-RVT deben reinterpretarse sobre elementos IFC con
geometría propia.

---

## 1. Empujar/tirar (push/pull)

### Qué problema resuelve

Convertir una cara plana en volumen (o vaciarlo) desplazándola a lo largo de su
normal, manteniendo la malla cerrada y coherente. Debe funcionar tanto en una
cara libre (una hoja suelta que se convierte en caja) como en una cara
embebida en un sólido (un hueco, una ventana, un escalón o un agujero
pasante), y debe respetar los agujeros y las caras vecinas.

### Cómo lo resuelve

La interacción es la convencional de tres tiempos:

1. Al pasar el cursor se resalta la cara más cercana a la cámara bajo el
   puntero (`tools/pushpull.py:550`). Si al activar la herramienta hay
   exactamente una cara seleccionada, esa cara queda «armada» y el primer clic
   en cualquier punto empieza el empuje sobre ella (`tools/pushpull.py:496`).
2. El primer clic fija la cara base, calcula su normal hacia fuera, guarda el
   punto exacto donde se hizo clic y entra en modo arrastre
   (`tools/pushpull.py:612`). El punto de agarre, no el centroide, es lo que
   se mide: usar el centroide daba distancias absurdas al pulsar cerca de una
   esquina o dentro del agujero de un anillo (`tools/pushpull.py:672`).
3. El segundo clic (o soltar el botón tras arrastrar) confirma la distancia
   actual (`tools/pushpull.py:612`, `tools/pushpull.py:730`).

Antes de construir nada se clasifica la cara base en dos preguntas
independientes (`tools/pushpull.py:1951`):

- **¿Está adherida?** Todos sus bordes —incluidos los de sus agujeros— son
  compartidos con otra cara. Si lo está, empujarla hacia dentro es un rebaje,
  un escalón o un agujero, no una caja nueva.
- **¿Es una tapa de prisma?** Todos sus bordes dan a una pared perpendicular
  que además se «barre» con el empuje (tiene una arista paralela a la normal).
  En ese caso el resultado es una simple traslación de la tapa: las paredes la
  siguen por vértices compartidos. Si una pared perpendicular no se barre, el
  empuje la cortaría en diagonal, así que se usa el camino general de extrusión
  para añadir un «bulto» coplanar en vez de trasladar toda la sección
  (`tools/pushpull.py:1951`, `tools/pushpull.py:164`).

Los agujeros cuentan como bordes de la tapa: un agujero cuyo borde da a un
panel coplanar interior rompe la traslación limpia; un agujero que atraviesa
una losa con paredes perpendiculares sí conserva la traslación
(`tools/pushpull.py:1951`).

**Camino rápido de prisma.** Si la cara es tapa de prisma y no se pidió
conservar la base, se traslada el conjunto de posiciones del contorno exterior
y de todos los agujeros a la vez, y luego se reparan uniones (soldaduras,
uniones en T, vértices colineales) sin fusionar caras coplanares
(`tools/pushpull.py:2271`). Antes se comprueba que la tapa no pase por encima
de un vértice de pared intermedio, porque la traslación lo dejaría atrás y
plegaría la pared en una púa (`tools/pushpull.py:2495`).

**Camino general de extrusión.** Se refina el contorno partiendo las aristas
en los vértices existentes que caigan sobre ellas (uniones en T), se calcula la
tapa desplazada y se emiten: la base consumida (si está adherida) o conservada,
un quad de pared por arista del contorno, y paredes interiores por cada arista
de cada agujero (`tools/pushpull.py:2638`). No hay casos especiales: donde un
quad cae sobre el plano de una cara existente, una pasada posterior de
reconstrucción por planos lo disuelve (`tools/pushpull.py:2271`).

**Agujero pasante.** Si el empuje alcanza una cara paralela al otro lado del
sólido, no se crea un fondo: se borra la cara de origen, se perfora la cara
lejana con el contorno proyectado —o se recorta si el contorno toca su borde—
y se une la abertura delantera con la trasera mediante un túnel de paredes
(`tools/pushpull.py:2689`, `tools/pushpull.py:2772`). Si la cara base es un
anillo con islas rellenando sus agujeros, cada isla baja como un bloque con su
propia pared y fondo (`tools/pushpull.py:2772`, `tools/pushpull.py:2831`).

### Casos difíciles que contemplan

- **Cara ligeramente fuera de plano.** Una puerta dibujada con una esquina a
  décimas de milímetro fuera de su plano se «asienta» sobre el contorno de la
  cara lejana antes de proyectar el agujero (`tools/pushpull.py:187`); al
  empujar se admite que el contacto ocurra cuando cualquier esquina llega,
  no solo el centroide (`tools/pushpull.py:2689`). Tolerancias: 5·10⁻⁴ para
  pegar al contorno y 2·10⁻³ para considerar la cara «plana» (`tools/pushpull.py:194`).
- **Límite de empuje hacia dentro.** Antes del arrastre se calcula la
  profundidad máxima: una cara paralela que bloquee, una salida lateral por una
  cara no paralela, o una pared inclinada que se aleja. Al llegar al límite se
  muestra un aviso y se recorta el valor (`tools/pushpull.py:1425`,
  `tools/pushpull.py:1570`). Empujar exactamente hasta el límite se permite
  (colapsa o abre la geometría); la salida lateral se deja 1 mm antes para no
  degenerar las paredes barridas.
- **Empuje demasiado pequeño.** Por debajo de 2·10⁻⁴ (unos 0,2 mm) se trata
  como no-op y se avisa una sola vez por arrastre (`tools/pushpull.py:236`).
- **Clic sin arrastre.** Se distingue un clic de un trazo por 6 px entre
  pulsación y suelta; un temblor no confirma (`tools/pushpull.py:241`).
- **Reconstrucción digestiva.** Si la reconstrucción devuelve exactamente el
  estado inicial, se considera rechazo y se avisa, en vez de fingir éxito
  (`tools/pushpull.py:2120`).
- **Tope automático.** Si la distancia pedida rompe el sólido, se busca por
  bisección la mayor distancia aceptada (hasta 6 intentos) y se confirma esa
  (`tools/pushpull.py:2079`).

### Cómo se teclea la medida

El campo de valor acepta un único número. Durante el arrastre, un valor
positivo va en la dirección en que se arrastra y uno negativo la invierte; el
cero se ignora (`tools/pushpull.py:764`). Se admiten sufijos de unidad
(`30cm`, `1500mm`). Después de confirmar, el valor tecleado actúa como
«retecleo en caliente»: deshace el último empuje de esta herramienta y lo
repite a la distancia total tecleada, manteniendo el signo o invirtiéndolo, y
dejando un único paso de deshacer (`tools/pushpull.py:764`). El doble clic
repite la última distancia confirmada (`tools/pushpull.py:687`).

### Valores y atajos

- Atajo principal `P`, alternativo `U` (por memoria histórica)
  (`tools/pushpull.py:324`).
- `Ctrl` = conservar la cara base y apilar un segmento nuevo (modo «copiar
  empuje»), típico para apilar forjados. Un toque de Ctrl alterna el modo; un
  Ctrl mantenido afecta solo al gesto en curso (`tools/pushpull.py:353`,
  `tools/pushpull.py:2965`). El modo se consume con el empuje (`tools/pushpull.py:2984`).
- `Esc` cancela y restaura la vista previa (`tools/pushpull.py:820`).
- La orientación hacia fuera se establece una vez por arrastre y se vuelve a
  aplicar tras confirmar (`tools/pushpull.py:612`, `tools/pushpull.py:2271`).

### Qué haríamos distinto en OPEN-RVT

En OPEN-RVT no se empuja una cara de malla: se empuja una cara de un elemento
IFC (un muro, una losa, un forjado). Por tanto:

- La distancia no se guarda como desplazamiento de vértices sino como cambio
  de un parámetro del elemento (espesor, altura, profundidad de hueco), para
  que el IFC siga siendo editable y exportable.
- Los agujeros son aberturas IFC (puertas, ventanas, pasos) con su propio
  objeto y relación, no bucles en una cara.
- La «cara adherida» se resuelve con relaciones entre elementos (muro-losa,
  muro-muro) y no por aristas compartidas.
- El tope por bisección es útil, pero en BIM conviene validar contra las
  reglas del elemento y contra las aberturas existentes antes de mover nada.
- El retecleo en caliente y el doble clic son buenas ideas de UX que conviene
  conservar.

---

## 2. Motor de inferencias

### Qué problema resuelve

Decidir a qué punto del modelo «se pega» el cursor mientras se dibuja, sin que
el usuario tenga que teclear coordenadas, y comunicar visualmente qué regla
está activa. Debe funcionar igual con ratón, con bloqueos de eje y con
referencias a aristas, y no debe ofrecer puntos ocultos ni inference que
muevan el cursor lejos de donde está.

### Cómo lo resuelve

Hay una única función de búsqueda que recibe el punto crudo del cursor, la
escena de candidatos y una lista de callbacks (proyección a píxel, rayos de
oclusión, proyección sobre la línea de bloqueo). Devuelve un resultado con
punto, tipo, color y, opcionalmente, guías discontinuas que dibujar
(`core/snap.py:1458`, `core/snap.py:89`). El motor que guarda estado entre
movimientos (arista bajo el cursor, centro de círculo, punto/arista
«adquiridos», puntos «animados», bloqueos) vive aparte y llama a esa función
en un solo sitio (`core/inference.py:57`, `core/inference.py:171`).

**Prioridad.** El orden está escrito en la cabecera del módulo
(`core/snap.py:1`) y se implementa como una cascada de retornos tempranos:

1. Bloqueo explícito de eje con flechas (o el bloqueo pegado de Shift).
2. Referencia a arista capturada con flecha abajo (paralelo/perpendicular).
3. Shift mantenido con una inferencia de eje activa.
4. Cierre de polígono.
5. Vértice / extremo (`endpoint`).
6. Intersección real de aristas o guías (cruz verde).
7. Punto medio de arista.
8. Origen del mundo.
9. Punto cualquiera sobre una arista.
10. Alineado con un punto animado (plano de eje que pasa por él).
11. Inferencia suave de eje (solo señal visual).
12. Punto libre sobre la cara bajo el cursor.
13. Ninguno.

Las comprobaciones de distancia se hacen en **píxeles de pantalla**, no en
metros, para que el radio de captura sea constante con el zoom
(`core/snap.py:1458`, `core/snap.py:1`). Los empates a menos de 0,5 px se
resuelven a favor del punto «suelto» frente al de un componente y a favor de
los puntos con nombre propio (`core/snap.py:1428`, `core/snap.py:1714`).

**Tolerancias y valores** (`views/viewport.py:1786-1893`):

- Radio general de snap: 9 px (`snap_threshold_px`).
- Radio específico para aristas: 14 px (`edge_snap_threshold_px`).
- Ángulo de inferencia de eje: 3° (`inference_angle_deg`).
- Pausa para «animar» un punto: 250 ms (`ENCOURAGE_MS`).
- Puntos animados: se conservan los dos últimos; solo cuentan puntos
  discretos (extremos, medios, centros, intersecciones), no «sobre arista» ni
  «sobre cara» (`views/viewport.py:1789`).

**Bloqueo de eje (flechas).** Flecha derecha fija el eje X, izquierda el Y,
arriba el Z; pulsar la misma flecha lo apaga (`views/viewport.py:18254`). El
bloqueo dura una sola operación: se libera al terminar el trazo o al aplicar
un valor (`views/viewport.py:18298`). Bajo bloqueo, la línea de bloqueo se
orienta hacia el cursor (no solo en el sentido positivo) y sobre ella siguen
funcionando los snaps de punto, para poder «ir a buscar» un vértice sin salir
del eje (`core/snap.py:1573`).

**Referencia a arista (flecha abajo).** Cicla ninguno → paralelo →
perpendicular → ninguno, capturando la arista que esté bajo el cursor al
entrar en modo paralelo (`views/viewport.py:18267`,
`views/viewport.py:18452`). La dirección se calcula desde la arista y el
plano de trabajo.

**Shift.** Al pulsarlo se congela la inferencia activa (dirección y color) y
se mantiene, aunque el cursor se separe; los snaps de punto siguen
funcionando sobre la línea de bloqueo (`views/viewport.py:18585`,
`core/snap.py:1610`). Shift también marca el plano de dibujo, pero eso es una
ayuda aparte que no sustituye al bloqueo.

**Inferencias lineales (Alt).** Durante una operación, Alt cicla «todas» →
«ninguna» (solo puntos) → «solo paralelo/perpendicular» → «todas». Los
bloqueos explícitos siguen activos en todos los modos y el modo se restaura al
terminar la operación (`views/viewport.py:18240`,
`views/viewport.py:18286`, `core/snap.py:1544`).

**Guías visuales.** El resultado puede traer una guía `(a, b)` o varias
`[(a, b, color)]`; el viewport las pinta como líneas discontinuas de 2 px y
dibuja un marcador distinto por tipo: cruz para intersección, rombo cian para
punto medio, cuadrado para extremo, círculo para centro/cierre, etc.
(`views/viewport.py:9291`). La etiqueta textual («Endpoint», «Midpoint»,
«From point»…) se dibuja junto al marcador y se traduce al pintar
(`views/viewport.py:1796`, `views/viewport.py:9385`). Los bloqueos de eje se
comunican con la goma de color (rojo X, verde Y, azul Z) y una etiqueta en la
esquina, no con un marcador pegado al cursor (`views/viewport.py:9293`,
`views/viewport.py:10700`).

**Oclusión.** Solo se aceptan candidatos visibles: se ordenan por distancia en
pantalla y se prueban perezosamente; tras el primer oculto, se consultan en
lotes que duplican tamaño (8, 16, 32…) para reducir rayos
(`core/snap.py:1714`). Las extensiones de terceros pueden añadir su propio
proveedor de snap, pero nunca pueden pisar un punto con nombre propio y sus
excepciones se ignoran (`core/inference.py:294`).

**Inferencias de dibujo (resumen).** Además de los puntos, el motor ofrece:
perpendicular a la pared donde se empezó (con predicción de cruce),
«pasar por un punto» animado, prolongación colineal de una arista con su cruce,
«desde un punto» alineado con el eje de dibujo, punto de cruce de la línea de
bloqueo con una arista o una cara, y alineación con el plano de eje de un punto
animado (`core/snap.py:1817`, `core/snap.py:1970`).

### Qué haríamos distinto en OPEN-RVT

- Las inferencias deben apoyarse en la geometría del elemento IFC y en sus
  ejes locales, no solo en aristas de malla. Un muro tiene eje, caras y
  niveles; el snap debería ofrecer «eje del muro», «cara del muro», «nivel»
  y «extremo de muro» como tipos propios.
- Mantener la prioridad y las tolerancias en una **capa única compartida**
  por todas las puertas de entrada (ratón, teclado, comandos, importación),
  probando la invariante «ninguna entrada acepta un punto oculto ni fuera del
  radio».
- El bloqueo de eje debería integrarse con restricciones paramétricas de IFC
  (por ejemplo, mantener la altura de un muro) en vez de ser solo una línea
  de dibujo.
- Conservar la idea de «animar» puntos por pausa: es barata y evita que un
  barrido accidental robe la referencia.
- La guía discontinua y el marcador por tipo son buenas decisiones de
  accesibilidad; conviene reutilizarlas y añadir el nombre del elemento.
