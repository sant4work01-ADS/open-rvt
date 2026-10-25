# O003a — Núcleo IFC (IfcOpenShell) conectado a la app y visor con vistas

## Objetivo
Primera mitad del editor:
- la app abre y guarda IFC a través de un **núcleo Python con IfcOpenShell** que corre como proceso aparte;
- muestra el modelo con **vistas configurables**: plantas por nivel, 4 alzados, cortes, isométrica y perspectiva.

Las herramientas de modelado (muros, losas, etc.) van en **O003b**: aquí solo se deja preparado el canal de comandos que usarán.

**Base:** el esqueleto de O002, ya en `main`. **Decisiones tomadas (no las cambies):**
- IfcOpenShell es el núcleo de edición (ver `docs/evaluaciones/O001-motor-ifc.md`, sección 11);
- three.js dibuja dentro del webview;
- la interfaz es la de PresupuestosPro: no la rediseñes.

## Parte 1: núcleo Python (`nucleo/`)
- **Paquete:** `nucleo/openrvt_nucleo/` con `pyproject.toml`; depende de `ifcopenshell==0.9.0.post1` y `numpy`. Para desarrollo usa el venv `~/.venvs/openrvt`, donde O001 ya instaló IfcOpenShell.
- **`servidor.py`:** JSON-RPC 2.0 por **stdin/stdout**, un mensaje JSON por línea, sin logs en stdout (los logs van a stderr). Métodos:
  - `proyecto.nuevo(nombre)`: IFC4 con proyecto, sitio, edificio, unidades métricas (m, m², m³) y un nivel «Nivel 0» a 0.00 m;
  - `proyecto.abrir(ruta)`, `proyecto.guardar(ruta?)` y `proyecto.info()`, que devuelve la ruta, el esquema, si hay cambios sin guardar y los conteos por clase;
  - `modelo.niveles()`: lista de `{globalid, nombre, elevacion}` ordenada por elevación;
  - `modelo.elementos(filtro?)`: lista de `{globalid, clase, nombre, nivel, tipo}`;
  - `modelo.propiedades(globalid)`: atributos, tipo, material o capas, y psets con sus valores;
  - **`geometria.teselar(globalids?)`:** mallas en coordenadas de mundo, con el iterador multihilo de O001. Cada elemento lleva `{globalid, clase, nivel, color, vertices, indices}`, con `vertices` como float32 y `indices` como uint32, ambos en **base64**. Sin argumento devuelve todo; con lista, solo esos elementos (para refrescar después de editar en O003b);
  - `vistas.leer()` y `vistas.guardar(lista)`: las vistas se guardan en el pset `OPENRVT_Vistas` de `IfcProject`, en la propiedad `Datos` (IfcText con el JSON);
  - `historial.deshacer()` y `historial.rehacer()`: guardan una instantánea del modelo en memoria por cada comando que modifica, con un máximo de 50. Dejan la base lista para O003b; aquí lo único que modifica es `vistas.guardar`.
- **Errores:** códigos JSON-RPC con mensaje en español. El núcleo nunca se cae por un error de comando.
- **Pruebas (`nucleo/tests/`, pytest):**
  - `nuevo`, luego `guardar` y `abrir`: el round-trip conserva el nivel y las unidades;
  - FZK-Haus abierto (la muestra de O001, que se baja con `herramientas/bajar_muestras.sh`) da 2 niveles y los mismos conteos por clase que en O001;
  - `teselar` de FZK-Haus da los mismos triángulos que O001 (± 1 %);
  - las vistas guardadas se recuperan al reabrir;
  - un método inexistente y una ruta inexistente devuelven error sin tumbar el servidor.

## Parte 2: puente en Rust (`src-tauri`)
- **`nucleo.rs`:**
  - lanza el proceso Python al arrancar la app y lo mantiene vivo;
  - si muere, lo relanza en la siguiente llamada y avisa en la barra de estado;
  - envía y recibe JSON-RPC con un id por llamada y timeout de 60 s.
- **Qué intérprete usa,** en este orden:
  1. la variable de entorno `OPENRVT_PYTHON`;
  2. `recursos/python/` junto al ejecutable, para el Python embebido de los instaladores (lo empaqueta una tarea posterior, **no** esta);
  3. `python3` en Linux o `python` en Windows.
  - Si no hay IfcOpenShell, la app abre igual y muestra «Núcleo IFC no disponible» con el detalle.
- **Comando Tauri:** uno solo, genérico, `nucleo_llamar(metodo, params) -> Value`, con su tipo en TypeScript generado como en PresupuestosPro (specta).
- **Pruebas en Rust:**
  - con un núcleo falso (un script Python de eco), una llamada vuelve con su id;
  - si el proceso muere, se relanza;
  - un timeout devuelve error.

## Parte 3: archivo
- En la pestaña **Inicio** del ribbon se habilitan Nuevo, Abrir y Guardar, y se agrega **Guardar como**, todo con el diálogo nativo (`plugin-dialog`, filtro `*.ifc`).
- **Atajos:** Ctrl+N, Ctrl+O, Ctrl+S y Ctrl+Shift+S, con el sistema de atajos copiado de PresupuestosPro.
- **Cambios sin guardar:** un punto en el título y una pregunta al cerrar o al abrir otro archivo («¿Guardar cambios?»).
- **Barra de estado:** el nombre del archivo, el esquema y el número de elementos.

## Parte 4: visor y vistas (módulo **Modelo**)
- **Dependencia:** `three` con versión fija y sin otras librerías 3D.
- **Disposición:** igual que PresupuestosPro.
  - a la izquierda, dentro del área de trabajo, un **navegador de vistas** en árbol: Plantas, Alzados, Cortes y 3D;
  - al centro, el visor;
  - a la derecha, un panel plegable de **Propiedades de la vista**; cuando haya selección, Propiedades del elemento.
- **Vistas que se crean solas al abrir:**
  - **Plantas:** una por nivel, con un plano de corte 1.20 m sobre el nivel y una profundidad que llega hasta el nivel de abajo (o −1 m si es el más bajo);
  - **Alzados Norte, Sur, Este y Oeste:** cámara ortográfica mirando hacia el modelo desde fuera de su caja envolvente, con el norte en −Y del IFC (anótalo; después se agregará el «norte de proyecto»);
  - **3D Isométrica:** ortográfica a 35.26° de elevación y 45° de azimut;
  - **3D Perspectiva:** cámara de 50° de campo de visión.
- **Cortes:** «Nueva vista de corte» en el ribbon (pestaña **Vista**) pide dos clics en una planta y crea la vista con dirección perpendicular a la línea y una profundidad de 10 m que se puede editar. La línea del corte se dibuja en las plantas con flechas de dirección.
- **Propiedades de la vista, todas editables y guardadas en `OPENRVT_Vistas`:**
  - nombre, tipo, altura del plano de corte y profundidad (en plantas y cortes);
  - niveles visibles;
  - **categorías visibles**, con casillas por clase IFC: muros, losas, columnas, vigas, puertas, ventanas, cubiertas, escaleras y otros;
  - estilo (sombreado, sombreado con aristas o líneas ocultas);
  - escala de referencia (1:50, 1:100 o 1:200), por ahora solo informativa en la barra de estado.
- **Dibujo:**
  - plantas, alzados y cortes con cámara **ortográfica**;
  - corte con planos de recorte de three.js y **relleno de sección** en gris oscuro sobre las caras cortadas (técnica de stencil del ejemplo oficial `webgl_clipping_stencil`);
  - aristas con `EdgesGeometry` (ángulo de 30°) en negro;
  - en plantas, lo que queda bajo el plano de corte se ve en planta y lo cortado lleva el relleno.
- **Navegación:**
  - **ortográficas:** paneo con el botón central o espacio más arrastre, y zoom con la rueda hacia el cursor;
  - **3D:** órbita con el botón central, paneo con Shift más el botón central, zoom con la rueda y «Ajustar» con Z luego A (como en PresupuestosPro y Revit);
  - **iso:** órbita libre; un botón «Restablecer iso» la regresa a 35.26° y 45°.
- **Selección:** clic en un elemento lo resalta y muestra sus propiedades (`modelo.propiedades`); Esc la quita. Solo lectura en esta tarea.
- **Colores por clase:** muro gris claro, losa gris medio, puerta y ventana madera o azul vidrio semitransparente, cubierta teja, otros gris. Tema claro y oscuro con el fondo del tema.

## Parte 5: verificación
- `npm run build`, `npx vitest run`, `cargo test --workspace`, `cargo clippy -- -D warnings` y `pytest nucleo/tests`: todo verde.
- **Pruebas de frontend (vitest):**
  - la matemática de las cámaras de alzados e iso;
  - la creación automática de vistas a partir de niveles falsos;
  - serializar y leer `OPENRVT_Vistas`.
- **E2E con la app real** (tauri-driver y xvfb, como `e2e/inicio.test.js` de O002), con `OPENRVT_PYTHON` apuntando al venv:
  1. Abre FZK-Haus, espera al visor y comprueba 2 plantas, 4 alzados, iso y perspectiva en el navegador.
  2. Crea un corte con dos clics en la Planta del Nivel 0 y comprueba que aparece en Cortes.
  3. Cambia la altura de corte de la planta, guarda en otra ruta, cierra, reabre y comprueba que el corte y la altura siguen ahí.
  4. Toma capturas en `docs/capturas/`: `o003a_planta.png`, `o003a_alzado_sur.png`, `o003a_corte.png`, `o003a_iso.png` y `o003a_perspectiva.png`, todas a 1600 × 900.
- **Rendimiento:** FZK-Haus se ve completo en **menos de 5 s** desde Abrir; Institute (muestra de O001), en **menos de 10 s**. Anota los tiempos.

## Entrega
- `docs/progreso/O003a.md` con la etiqueta «LISTA PARA REVISIÓN»: qué se hizo, las salidas de las pruebas, los tiempos, las capturas y las desviaciones.
- Los archivos copiados de PresupuestosPro que toques (por ejemplo `App.tsx` o `comandos.ts` del ribbon) llevan su comentario `// OPEN-RVT:`. Actualiza `docs/origen-pp.md` si un archivo pasa de intacto a adaptado.
- Commits en español. No hagas push.

## No hagas
- No implementes herramientas de modelado (son de O003b) ni empaquetes Python en los instaladores (tarea posterior).
- No uses web-ifc.
- No cambies el aspecto de la interfaz copiada de PresupuestosPro.
