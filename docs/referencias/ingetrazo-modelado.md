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

---

## 3. Dibujo de líneas y rectángulos sobre caras

### Qué problema resuelve

Añadir aristas de dibujo al modelo sin romper la topología: una línea que
cruza una arista existente debe partirla; una línea que atraviesa una cara
debe dividirla en dos caras; y varias caras coplanares que quedaron partidas
deben poder volver a fusionarse cuando el corte fue un efecto de la operación
y no un dibujo deliberado del usuario.

### Cómo lo resuelve

**Planificación en seco.** La herramienta de línea no muta la escena
directamente: entrega los segmentos a un planificador que simula la lista de
aristas y produce una lista ordenada de comandos reversibles
(`core/edits.py:55`). El plan:

1. Busca las aristas que el segmento cruza y las parte en el punto de cruce,
   sustituyéndolas por dos subaristas que heredan sus banderas de curva
   (`core/edits.py:90`, `core/topology.py:296`).
2. Propaga ese punto a las caras que compartían la arista partida, para que
   ninguna cara quede con una arista «larga» que ya no existe
   (`core/edits.py:90`, `core/topology.py:843`). Es lo que mantiene el modelo
   estanco al dibujar una puerta sobre un muro: sin esto, el suelo conservaba
   la arista larga y la caja dejaba de ser cerrada.
3. Divide el propio segmento nuevo en los tramos entre cruces.
4. Añade las subaristas soldando duplicados y, opcionalmente, autocompleta
   caras (`core/edits.py:139`).

**Cuándo una línea parte una cara.** Solo si el segmento es una **cuerda**
real de una cara sin agujeros: ambos extremos caen sobre su contorno
(vértice o punto interior de una arista) y el punto medio del segmento queda
estrictamente dentro del polígono (esto descarta los cortes que salen por
una concavidad). Si se cumple, la cara madre se borra y se sustituye por los
dos subcontornos, que heredan su orientación y todos sus atributos —incluido
el mapa de textura— para que la imagen no se reinicie en cada mitad
(`core/topology.py:744`, `core/edits.py:261`). Las caras con agujeros se
dejan fuera: partir una cara con huecos es un caso más difícil que no abordan
(`core/topology.py:744`).

**Cuándo se crea una cara nueva.** Si el segmento no es cuerda, se buscan los
ciclos mínimos que se cierran al añadirlo, se comprueba que sean planos y que
no exista ya una cara con ese mismo ciclo; entonces se crea la cara,
orientada hacia arriba o hacia la cámara (`core/edits.py:261`,
`core/topology.py:1087`). También se generan ambos lados cuando un ciclo se
cierra sobre una zona sin cara.

**Cuándo se fusionan caras coplanares.** La fusión no la hace la herramienta
de línea, sino la pasada de costura que sigue a las operaciones de modelado.
Consta de tres fases (`core/history.py:3152`):

1. Resolver uniones en T: partir aristas que reciben un vértice en su
   interior, limitado a la caja de la operación.
2. Colapsar vértices colineales de valencia 2.
3. Fusionar componentes coplanares y conexos por arista, **solo si** el
   componente contiene una cara creada por esa operación (`core/history.py:3220`).

La última condición es la clave: una línea coplanar dibujada a propósito por
el usuario no se disuelve por una operación ajena, mientras que una costura
que acaba de crear un empuje sí se limpia. Además, un borde que también
sostiene una cara no coplanar es una **arista de pliegue** y la fusión nunca
la cruza: dos faldones de tejado sobre un muro divisorio siguen siendo dos
caras con cumbrera visible (`core/history.py:3246`). La herramienta de borrado
hace lo simétrico: borrar la arista que divide dos caras coplanares las
reúne; borrar cualquier otra arista arrastra las caras que delimita
(`core/history.py:501`).

**Rectángulos.** Se definen por dos esquinas opuestas sobre un plano de
trabajo, que puede ser la cara bajo el cursor, un plano bloqueado con flechas
o el plano de la vista (`tools/rectangle.py:56`). Los cuatro lados se emiten
como un único comando compuesto (un solo paso de deshacer) y la cara se añade
explícitamente, sin autocompletado de ciclos, para que la subdivisión por
cruces no la altere (`tools/rectangle.py:372`). En un plano ya poblado se
dispara una reconstrucción por planos para integrar el rectángulo con lo que
ya había. Detalles de interacción:

- Ejes del plano derivados de la normal (la X del mundo proyectada sobre el
  plano, o la Y si la normal es casi X) para que el rectángulo se sienta
  alineado también en paredes verticales (`tools/rectangle.py:29`).
- Tolerancia de cuadrado: si los dos lados difieren en menos del 4 % del
  mayor, se ajusta a cuadrado perfecto (`tools/rectangle.py:56`,
  `tools/rectangle.py:343`); Shift fuerza el cuadrado, Ctrl dibuja desde el
  centro.
- Un lado de longitud < 10⁻⁶ se rechaza con un mensaje que explica la causa
  real (p. ej. la segunda esquina está fuera del plano bloqueado y sugiere la
  flecha que elige el plano correcto) (`tools/rectangle.py:103`,
  `tools/rectangle.py:126`).
- Se puede teclear «3;2» (ancho;alto) para dimensiones exactas; un solo
  número cambia el lado que el cursor está estirando (`tools/rectangle.py:179`).

**Tolerancias de topología** (`core/topology.py:29`): las posiciones se
comparan redondeando a 4 decimales (≈ 0,1 mm); la planaridad de una cara se
admite hasta 10⁻³; un cruce solo cuenta si las líneas se acercan a menos de
10⁻⁴.

### Qué haríamos distinto en OPEN-RVT

- En IFC no se «parte una cara»: se parte un elemento o se añade una
  abertura/partición. La cuerda de una cara de malla es un detalle de
  representación; el documento debe hablar de dividir un muro o una losa y de
  sus relaciones.
- La regla de fusión «solo lo que tocó la operación» es exactamente la que
  necesita un modelo paramétrico: evita destruir particiones deliberadas.
- Las caras con agujeros son el caso normal en BIM (muros con puertas), así
  que no se pueden dejar «para más tarde»: hay que resolver el corte de una
  cara con huecos.
- El rectángulo debe crear un elemento (o una abertura) con parámetros
  editables, no cuatro aristas y una cara suelta.
- Conservar el comando compuesto para que un rectángulo sea un solo paso de
  deshacer y el mensaje de error que explica el plano equivocado.

---

## 4. Grupos y componentes: aislamiento y edición

### Qué problema resuelve

Separar geometría para que se mueva y edite como una unidad, sin que las
operaciones de una parte contaminen el resto del modelo, y permitir editar
«dentro» de un grupo o componente con las mismas herramientas que en el
espacio suelto. Al mismo tiempo, varias copias de un componente deben
compartir su definición para no multiplicar la memoria.

### Cómo lo resuelve

**Aislamiento.** La malla principal del documento suelda todos los vértices
coincidentes, así que un bloque dibujado contra un muro se fusiona con él. Un
grupo guarda su geometría en una malla **propia**: nada se suelda a través de
su frontera y por eso se mueve y edita como una unidad
(`core/group.py:1`, `core/group.py:79`). Cada grupo tiene además capa,
etiqueta IFC, material, visibilidad, bloqueo y un identificador estable que
sobrevive a guardar y cargar (`core/group.py:79`).

**Grupo clásico frente a componente.** Un grupo clásico mantiene la malla en
coordenadas de mundo y solo guarda sus ejes locales en una matriz aparte,
para no perder la orientación al mover o rotar (`core/group.py:79`,
`core/group.py:254`). Un **componente** es una instancia: su malla es un
prototipo en coordenadas locales compartido con las demás copias, y una
matriz `xform` la lleva al mundo. Mover, rotar o escalar una instancia solo
compone su matriz (coste O(1)); editar su geometría es otra historia
(`core/group.py:79`, `core/group.py:202`).

**Anidamiento.** Un grupo puede tener «hijos» que son emplazamientos de otros
prototipos dentro de sus propias coordenadas. Se recorren en profundidad
componiendo matrices (`iter_placements`) y, cuando hace falta una sola malla,
se funden con una pasada vectorizada (`world_mesh`)
(`core/group.py:390`, `core/group.py:486`). Esto permite importar un
componente conservando la repetición interna que traía el archivo original en
vez de aplanarla y multiplicar la geometría (`core/group.py:79`).

**Entrar a editar.** Editar dentro de un grupo no lo «hornea» ni destruye su
estructura. El documento mantiene una pila de contextos: al entrar, la malla
activa del documento pasa a ser la del grupo, de modo que todas las
herramientas y comandos existentes trabajan sobre ella sin cambios
(`core/scene.py:376`). Entrar a un hijo del grupo ya abierto apila un nivel;
entrar a cualquier otro cierra lo abierto (`core/scene.py:376`). Salir un
nivel (Esc) y salir de todos los niveles son operaciones distintas
(`core/scene.py:482`, `core/scene.py:487`).

**Componentes al editar.** Entrar a una instancia de componente no edita el
prototipo compartido directamente: crea una **copia en coordenadas de mundo**
y la pone como malla activa, guardando el prototipo y la matriz originales
(`core/scene.py:376`). Al salir:

- Si nada cambió, se restaura el uso compartido del prototipo.
- Si cambió, se transforma la copia por la inversa de la matriz y se escribe
  en el prototipo; todas las copias muestran el cambio
  (`core/scene.py:537`, `core/scene.py:543`).

«Hacer único» es la operación explícita para romper ese compartir: el
componente deja de compartir malla y pasa a tener su propia definición y sus
propios hijos, sin alcanzar a sus hermanos (`core/group.py:219`).

**Contenedores con matriz.** Si un grupo que tiene hijos conserva una matriz
propia, al entrar se empuja esa matriz hacia abajo: a los hijos y a la malla
del propio grupo, que pasa a mundo. Nada se mueve visualmente y las
herramientas pueden seguir hablando en coordenadas de mundo
(`core/scene.py:452`).

**Piezas físicas.** Un archivo importado suele llamar «parte» a fragmentos de
superficie cortados por material, no a objetos que se puedan coger. Para
separar un grupo en piezas físicas se hacen dos pasadas: primero se agrupan
las caras que forman sólidos cerrados con espesor (≥ 1 mm) y al menos cuatro
caras, emparejando caras a través de cada arista por el lado del material;
después los fragmentos abiertos se agrupan por vértices compartidos y se
adhieren al sólido donde caen al menos la mitad de sus esquinas; un fragmento
que solo roza un sólido en una esquina queda como pieza aparte
(`core/pieces.py:1`, `core/pieces.py:201`, `core/pieces.py:365`).

**Ocultar y bloquear.** Un grupo puede ocultarse (deja de dibujarse,
seleccionarse, capturarse y exportarse) o bloquearse (se dibuja pero no se
puede seleccionar, mover ni abrir); ambos estados se guardan en el documento
(`core/group.py:79`).

### Qué haríamos distinto en OPEN-RVT

- En IFC el «grupo» natural es `IfcElementAssembly`, `IfcBuildingStorey` o una
  relación de agregación; el «componente» es un tipo con ocurrencias
  (`IfcTypeObject` / `IfcRelDefinesByType`) o una referencia compartida. El
  documento debe hablar de esas relaciones, no de mallas compartidas.
- Editar una ocurrencia debe decidir explícitamente si el cambio afecta al
  tipo (todas las ocurrencias) o solo a esa ocurrencia; es la misma
  disyuntiva que «editar componente» vs. «hacer único», pero con semántica
  IFC y trazable.
- El aislamiento por malla propia es un detalle de implementación; en OPEN-RVT
  el aislamiento debe ser topológico/paramétrico (el grupo tiene sus
  elementos y sus vínculos, no una copia de vértices).
- Conservar la pila de contextos y el «salir un nivel» con Esc: es una UX
  clara y probada.
- La separación en piezas físicas es útil para importaciones, pero en BIM
  conviene mapearla a elementos y no a fragmentos de malla.
- Ocultar/bloquear a nivel de objeto y de capa debe mantenerse y probarse en
  todas las puertas (pantalla, comandos, importación, pegado).

---

## 5. La guarda de hermeticidad

### Qué problema resuelve

Evitar que una edición deje un «sólido» agujereado, con aristas sueltas o con
caras interiores mal marcadas. Un modelo abierto puede seguir dibujándose,
pero ya no tiene interior/exterior, así que su volumen, su orientación y su
exportación dejan de ser fiables. La guarda debe detectarlo **antes** de
confirmar el cambio (y, cuando el daño ya existe, decir dónde está).

### Cómo lo resuelve

Hay dos niveles de comprobación:

**Nivel débil: ¿hay frontera?** Una malla está cerrada si toda arista toca al
menos dos caras (`core/orient.py:498`). Basta para saber si tiene sentido
calcular un dentro/fuera, pero no para llamarla sólido: permite aristas con
tres o más caras y no comprueba volumen.

**Nivel fuerte: ¿es un sólido?** Se exige que **cada arista toque exactamente
dos caras no interiores**, que no haya aristas sueltas, que haya al menos una
cara y que el volumen firmado sea mayor que 10⁻¹² m³
(`core/solids.py:55`). El volumen se calcula sumando tetraedros desde el
origen sobre las caras trianguladas y se toma su valor absoluto
(`core/bim.py:154`). Las caras marcadas como `interior` (tabiques que el
motor conserva a propósito) no cuentan como piel.

**La guarda del empuje.** Antes de mutar, si la malla era un sólido cerrado y
no plana, se guarda una instantánea. Después de mutar se vuelve a comprobar:
si dejó de estar cerrada, se restaura la instantánea y se marca el empuje como
**rechazado**; el usuario ve «Push refused: would break the solid» y el modelo
queda intacto (`tools/pushpull.py:2120`, `tools/pushpull.py:2002`). También se
rechaza si el resultado es geométricamente idéntico al inicial (la
reconstrucción «digerió» el empuje). La guarda **no** se aplica a hojas
abiertas: una hoja plana puede abrirse legítimamente al convertirla en volumen.

Si el rechazo ocurre a la distancia arrastrada, se busca por bisección la
mayor distancia aceptada (hasta 6 intentos) y se confirma esa, avisando del
tope (`tools/pushpull.py:2079`).

**Cantidades y exportación.** El volumen de un conjunto de caras se devuelve
solo si el conjunto es hermético por sí mismo: cada arista del conjunto
delimitada por exactamente dos caras del conjunto; si no, se devuelve «sin
volumen» (`core/bim.py:154`, `core/bim.py:25`). El área sí se calcula siempre
(descontando huecos). La exportación IFC documenta la misma regla: área
siempre, volumen solo cuando el objeto es hermético (`formats/ifc.py:9`).

**Diagnóstico cuando ya está roto.** El inspector de sólidos clasifica cada
arista contando caras no interiores incidentes (`plugins/solid_inspector.py:1`):

- 0 caras → arista suelta (dibujo que no pertenece a ninguna superficie).
- 1 cara → borde abierto (el borde de un agujero en la piel).
- Más de 2 caras → sobreconexión (tabique interior o unión en T que la
  frontera no debería tener).

Y cada cara: **interior** (repite las esquinas de otra o es una partición
cuyas aristas están todas sobreconectadas) o **reversa** (en un objeto
cerrado, su frente mira hacia dentro). «Hermético» significa que no hay
aristas sueltas, abiertas ni sobreconectadas; el volumen solo se muestra si
además ninguna cara está reversa, porque una cara girada falsea la suma
firmada (`plugins/solid_inspector.py:181`, `plugins/solid_inspector.py:196`).

La reparación automática solo hace lo que tiene una única respuesta correcta:
borra aristas sueltas y caras duplicadas, cierra agujeros cuyo borde es plano,
marca particiones como interiores y gira caras reversas. Un agujero no plano
o una arista compartida por dos sólidos exigen una decisión y se dejan
señalados (`plugins/solid_inspector.py:1`). Las herramientas booleanas, por su
parte, se niegan a operar si alguna entrada no es un sólido
(`core/solids.py:415`).

### Qué haríamos distinto en OPEN-RVT

- La validez de un elemento IFC no es solo «malla cerrada»: hay reglas de
  tipo, relaciones y representación. La guarda debe combinar ambas cosas y
  ejecutarse en una capa compartida por todas las puertas (pantalla,
  comandos, importación, pegado), con la invariante «ninguna puerta guarda un
  elemento con geometría no hermética si su tipo exige volumen».
- Distinguir «hoja abierta a propósito» (un plano, una cubierta) de «sólido
  roto» por el tipo IFC, no por una bandera de malla.
- El rechazo con restauración y el tope por bisección son buenas ideas;
  conviene añadir el motivo concreto y el elemento afectado.
- El diagnóstico por arista (suelta / abierta / sobreconectada) es
  directamente reutilizable; en IFC hay que traducirlo a «abertura sin
  relación», «cara sin volumen» y «partición mal clasificada».
- Nunca calcular cantidades sobre geometría dudosa: devolver «sin volumen» en
  vez de un número engañoso, como hacen ellos.
