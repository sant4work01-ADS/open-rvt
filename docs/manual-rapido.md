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
  base y tres ejemplos multicapa; Estructura e Instalaciones muestran «Próximamente».
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
