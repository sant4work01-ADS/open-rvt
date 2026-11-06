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
