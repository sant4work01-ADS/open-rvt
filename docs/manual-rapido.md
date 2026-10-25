# Manual rápido de OPEN-RVT

OPEN-RVT es un programa libre de modelado de información para la construcción (BIM).

## Bienvenido

Esta primera versión es el **esqueleto** de la aplicación: la barra de título, la cinta
de comandos, la navegación lateral, el área de trabajo y la barra de estado ya tienen el
mismo aspecto que en PresupuestosPro.

- **Modelo**: aquí irá el editor de planta y 3D. Por ahora el área de trabajo está vacía.
- **Niveles y ejes**: módulo reservado para la próxima tarea.
- **Configuración**: tema (claro, oscuro o del sistema), tamaño de la interfaz e idioma.
- **Ayuda**: este manual y la lista de atajos de teclado.

Los comandos **Nuevo**, **Abrir** y **Guardar** de la pestaña Inicio aparecen
deshabilitados con la descripción «Disponible pronto»: todavía no hay archivo que abrir.

### Navegación del visor

- **Rueda del ratón**: zoom hacia el cursor. En el touchpad, el **pellizco** (Ctrl +
  rueda) también hace zoom.
- **Dos dedos del touchpad**: paneo. Con `Shift` + dos dedos se orbita en 3D y se
  panea en horizontal en planta.
- **Pantalla táctil**: un dedo arrastra para mover la vista, dos dedos pellizcan y
  panean, y un toque equivale a un clic.
- **Botón medio** o **Espacio + arrastrar**: mover la vista.
- **F**, doble clic con el botón medio o el botón **Ajustar**: encuadrar la vista.
- **+** y **−**: acercar y alejar. **Ctrl+Shift+D** muestra el diagnóstico de rueda.
- La ayuda discreta de abajo a la derecha del visor se puede cerrar y no vuelve a
  aparecer. En **Configuración → Navegación** se elige el dispositivo: Automático,
  Ratón o Touchpad. El detectado aparece entre paréntesis.

### Tipos y materiales

Todo elemento sale de un **tipo**: si se edita el tipo, cambian todas sus instancias.
El editor se abre con **Modelar → Tipos**, con la entrada **Tipos y materiales** de la
barra lateral o con doble clic sobre un elemento del modelo.

- **Árbol de tipos:** busca, crea, duplica y borra tipos. Muros ya tiene los tipos
  base y tres ejemplos multicapa; Estructura trae zapatas, contratrabes, columnas,
  castillos, trabes, cerramientos y dalas; Instalaciones muestra «Próximamente».
- **Capas del muro:** se ordenan de exterior a interior. Cada capa lleva función
  (núcleo, acabado, aislante o membrana), material de la biblioteca y espesor en
  centímetros. Debe haber exactamente un núcleo, aunque puede ocupar varias capas
  contiguas. Los botones suben, bajan, insertan y quitan capas.
- **Línea de ubicación:** eje del núcleo (por omisión), cara exterior, cara interior o
  centro. Al cambiar el espesor o las capas, el eje del muro se conserva.
- **Vista previa:** muestra el corte a escala con el color y el rayado de cada capa,
  la cota de cada espesor y el total, e indica Exterior e Interior.
- **Instancias:** el pie dice cuántas hay y permite seleccionarlas en el modelo.
  **Aplicar** guarda el tipo y regenera la geometría de todas sus instancias; se puede
  deshacer en un paso.
- **Materiales:** biblioteca editable con categoría, color, rayado, unidad y espesor
  típico. Un material en uso no se puede borrar.

En planta a **1:50** o mayor se dibujan las líneas entre capas y el contorno grueso y
rayado del núcleo; a **1:100** o menor solo queda el contorno exterior.

### Estructura

Todo elemento estructural sale de un tipo con **sección** y **armado**. La cinta
**Modelar → Estructura** trae Zapata, Zapata corrida, Contratrabe, Columna, Castillo,
Trabe, Cerramiento y Dala.

- **Zapata, columna y castillo:** un clic. El cursor se engancha al **cruce de dos
  ejes**, con prioridad sobre la cuadrícula; la tecla **R** gira 90°.
- **Zapata corrida, contratrabe, trabe, cerramiento y dala:** dos clics como el muro.
  Se puede escribir la longitud y pulsar Enter.
- **Zapatas:** el desplante es la profundidad desde el nivel de piso. La plantilla de
  concreto pobre va debajo de la zapata y el dado se centra encima.
- **Dala de desplante:** su lecho bajo apoya en la elevación del nivel; las demás vigas
  dejan el lecho alto en la elevación del nivel más el desfase.
- **Editor de tipos:** para las clases de estructura muestra la sección en centímetros
  (el núcleo la guarda en metros) y el armado: longitudinal, estribos, parrilla de
  zapatas, recubrimiento y armex. La vista previa dibuja la sección con el estribo, las
  varillas y las cotas B y H; en las zapatas muestra la parrilla y el corte del peralte.
- **Acero estimado:** el pie del editor indica los kg/m de una pieza lineal o los kg de
  una zapata. Al seleccionar un elemento, el panel de propiedades muestra «Acero
  estimado» y permite editar desplante, desfase, altura y nivel superior.
- **Planta:** columnas y castillos se rellenan con el rayado de concreto; trabes,
  cerramientos, dalas, zapatas y contratrabes se dibujan con líneas discontinuas.

### Interacciones de la estructura

Los elementos se ligan como en obra y se editan en cadena. La liga se guarda en el pset
`OPENRVT_Liga` de la pieza dependiente y también como `IfcRelConnectsElements`, así que
se conserva al guardar y reabrir.

- **Castillos automáticos** (Modelar → Estructura): pide la separación máxima entre
  centros (3.00 m por omisión). Los coloca en cada esquina L, T o X, en cada remate
  libre (cara al ras) y repartidos en los tramos, sin duplicar los que ya están a menos
  de 5 cm. Si hay muros seleccionados trabaja solo con ellos; si no, con todos los del
  nivel activo. Todo en un solo paso de deshacer.
- **Castillo sobre un muro:** la herramienta Castillo, al hacer clic dentro de un muro,
  toma el espesor del núcleo, la rotación y la base del muro; su altura llega al lecho
  bajo del cerramiento o a la parte de arriba del muro. Si se mueve, estira, cambia de
  altura o de tipo el muro, el castillo se recoloca; al borrar el muro caen sus
  castillos, cerramientos y dalas.
- **Cerramiento y dala en muro:** un clic sobre el muro crea la pieza con su mismo eje y
  el ancho del núcleo. El cerramiento deja su lecho alto en la parte de arriba del muro
  y la dala su lecho bajo en la base. Al crear un cerramiento, los castillos de ese muro
  bajan hasta su lecho bajo.
- **Columnas en los cruces:** el botón «En todos los cruces» de la barra de la
  herramienta Columna pone una columna en cada cruce de la retícula y guarda `EjeA` y
  `EjeB`. La casilla «Con zapata» crea además una zapata bajo cada columna. Al mover un
  eje se mueven sus columnas y sus zapatas en el mismo paso.
- **Zapata bajo columna:** la zapata se centra bajo la columna o, con lindero N, S, E u
  O, se desplaza para que su borde quede al ras de esa cara de la columna. La base de la
  columna baja a la cara superior del dado (o de la zapata si no hay dado). Al borrar la
  columna se pregunta si se borra también su zapata; por omisión, sí.
- **Unir zapatas y unir columnas:** crean contratrabes entre zapatas consecutivas y
  trabes entre columnas consecutivas sobre cada eje, de centro a centro. Las trabes
  dejan su lecho alto en el nivel superior menos el espesor de la losa y la parte de
  arriba de las columnas llega a ese lecho; el nudo es de la columna.
- **Cortes por prioridad:** para cuantificar no se cuenta dos veces el mismo volumen.
  Gana, en este orden: zapata > contratrabe > columna > trabe > losa > castillo >
  cerramiento/dala > muro (núcleo) > acabados. `cantidades.estructura` devuelve el
  volumen bruto, el neto y el acero de cada pieza, totales por tipo y el gran total; la
  suma de netos coincide con el volumen de la unión.
- **Acero por pieza tipo:** los kg/m se calculan con un largo de referencia (3.00 m en
  columna y castillo; 4.00 m en trabe, cerramiento, dala, contratrabe y zapata corrida)
  para no contar de más el confinamiento y los estribos de extremo. El editor muestra
  «X kg/m (sobre L_ref m)».

### Novedades de la versión 0.5.3

- Nuevos elementos estructurales: zapata aislada y corrida, contratrabe, columna,
  castillo, trabe, cerramiento y dala, con sus tipos semilla.
- Sección y armado editables por tipo, con regeneración de todas las instancias en un
  solo paso de deshacer.
- Acero estimado por pieza con la tabla de varillas #2 a #8 y la tabla de armex.
- Herramientas de colocación con enganche al cruce de ejes y giro con R.
- Vista previa de la sección armada en el editor de tipos y acero estimado en el panel
  de propiedades.

### Atajos

| Atajo | Acción |
| --- | --- |
| F1 o Ctrl+/ | Atajos de teclado |
| Ctrl+K | Paleta de comandos |
| Ctrl+F1 | Minimizar o restaurar la cinta |
| Alt+1 … Alt+9 | Cambiar de módulo |
| Ctrl+= / Ctrl+− / Ctrl+0 | Tamaño de la interfaz |

## Navegación con touchpad

El visor distingue la rueda del ratón del touchpad por la **ráfaga de eventos**, no por
un solo evento. Un touchpad de Windows puede mandar saltos enteros de 100 o 120, así
que también se reconocen más de tres eventos muy seguidos y los deltas fraccionarios.
La detección dura 60 segundos desde el último gesto.

- Dos dedos: paneo.
- Pellizco o **Ctrl + rueda**: zoom hacia el cursor.
- **Shift + dos dedos**: órbita en las vistas 3D y paneo horizontal en planta.
- Configuración → Navegación: **Automático / Ratón / Touchpad**. La elección manual
  manda siempre; «Automático» usa el último dispositivo detectado.
- **Ctrl+Shift+D** abre un panel con los últimos 20 eventos `wheel` (deltaX, deltaY,
  deltaMode, Ctrl y milisegundos entre eventos) y la clasificación de cada uno. Si el
  touchpad sigue fallando, ese panel sirve para reportarlo.

## Novedades de la versión 0.5.5

- **Castillos automáticos** en esquinas, remates e intermedios, con separación
  configurable (3.00 m por omisión) y sin duplicados.
- **Ligas entre elementos** en `OPENRVT_Liga` y `IfcRelConnectsElements`: castillo,
  cerramiento y dala siguen a su muro; la zapata sigue a su columna.
- **Cerramiento y dala en muro** con un clic, y castillos que bajan al lecho bajo del
  cerramiento.
- **Columnas en todos los cruces**, con zapata opcional; mover un eje mueve sus
  columnas y zapatas.
- **Zapata bajo columna** centrada o excéntrica en el lindero, con la base de la
  columna en la cara superior del dado.
- **Contratrabes y trabes automáticas** entre piezas consecutivas de cada eje.
- **Cortes por prioridad** y `cantidades.estructura` con volúmenes netos, acero y
  totales; la suma de netos es igual a la unión.
- **Esquinas de planta** con el núcleo recortado por castillos y columnas y los
  acabados pasando por encima del castillo.
- **Acero por pieza tipo** con largo de referencia: C-1 = 10.912 kg/m.

## Novedades de la versión 0.5.4

- **Enganches fiables:** la tolerancia es de 12 píxeles en cualquier zoom, el enganche
  más cercano gana y el ángulo a 15° ya no saca el punto de un cruce de ejes. Los
  cruces se recalculan al mover, crear o borrar ejes.
- **Touchpad:** detección por ráfagas, paneo con dos dedos, pellizco para zoom, órbita
  con Shift en 3D, gestos táctiles y panel de diagnóstico.
- **Esquinas limpias:** los muros se recortan o extienden al unirse y las plantas
  dibujan el contorno unido, las capas recortadas y el rayado del núcleo sin líneas
  dentro de la esquina. Un extremo a menos de 25 cm del eje de otro muro se lleva a su
  eje para formar la unión.
