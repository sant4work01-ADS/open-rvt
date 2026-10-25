# O005 — Lineamientos de dibujo (plumillas, rellenos y simbología)

## Objetivo
Que las plantas, alzados y cortes **se lean como plano arquitectónico** y no como un modelo 3D sombreado.
- Las líneas tienen grosor según si el elemento está cortado o en proyección.
- Los cortes llevan relleno por material.
- Puertas y ventanas llevan su simbología de planta.

**Base:** `main` en 0.2.0 (O003a, O003b y O004). Toda la lógica nueva vive en el frontend, salvo los datos de estilo, que se guardan en el IFC.

**Decisiones tomadas (no las cambies):**
- **Líneas gruesas:** se dibujan con `Line2`, `LineSegments2` y `LineMaterial` de `three/examples/jsm/lines` (parte de `three`, sin librerías nuevas), porque `LineBasicMaterial` no tiene grosor en WebGL.
- **Grosores en mm de papel:** se convierten a píxeles con la escala de la vista y el zoom, de modo que al acercarse la línea crece como en Revit.

## Parte 1: estilos de objeto (plumillas)
### Tabla por defecto en `src/features/modelo/estilos.ts`
Cada categoría tiene grosor de **corte** y de **proyección** (en mm a 1:100), color y patrón:

| Categoría | Corte | Proyección | Notas |
|---|---|---|---|
| Muros | 0.50 | 0.18 | |
| Losas | 0.35 | 0.18 | |
| Columnas | 0.50 | 0.18 | |
| Vigas | 0.35 | 0.18 | |
| Puertas | 0.25 | 0.13 | |
| Ventanas | 0.25 | 0.13 | |
| Cubiertas | 0.35 | 0.18 | |
| Escaleras | 0.25 | 0.13 | |
| Otros | 0.25 | 0.13 | |
| Ejes | — | 0.13 | patrón «trazo y punto» |
| Líneas ocultas | — | 0.13 | patrón «discontinua» |
| Arriba del corte en planta | — | 0.13 | patrón «discontinua larga»; aleros, volados y losa superior |

### Escala
- **Factor por escala:** 1:50 → ×1.4, 1:100 → ×1.0, 1:200 → ×0.7.
- La escala de referencia de la vista deja de ser solo informativa.

### Edición y guardado
- Diálogo **Estilos de objeto** (pestaña **Vista** del ribbon) con la tabla editable.
- Se guarda en el pset `OPENRVT_Estilos` de `IfcProject` (propiedad `Datos`, JSON), igual que las vistas.
- Necesita dos métodos nuevos del núcleo: `estilos.leer` y `estilos.guardar`, con deshacer.
- **Sobrescritura por vista** (en el panel de propiedades de la vista): por categoría, ocultar o cambiar el grosor. Se guarda dentro de la vista.

## Parte 2: dibujo de líneas en vistas ortográficas
### Estilo «Líneas ocultas» (plantas, alzados y cortes)
Es el estilo por omisión de plantas, alzados y cortes nuevos:
- caras en blanco (o el fondo del tema), sin sombreado;
- **contorno de lo cortado** con grosor de corte;
- **aristas visibles en proyección** con grosor de proyección (EdgesGeometry a 30° como hoy).

### Geometría del corte
- Calcula la **intersección real del plano de corte** con cada malla: segmentos triángulo-plano unidos en polilíneas cerradas.
- Con esos polígonos se dibujan el **contorno grueso** y el **relleno** (Parte 3).
- Reemplaza al relleno por stencil cuando el estilo sea «Líneas ocultas». Deja el stencil para «Sombreado».

### En planta
- **Arriba del corte:** lo que queda por encima del plano de corte (hasta 3 m arriba del corte, configurable en la vista) y se proyecta dentro del dibujo se traza con la línea «arriba del corte» (discontinua). Ejemplos: volados, aleros y la losa de arriba.
- **Por debajo:** lo que queda abajo, hasta la profundidad de la vista, se dibuja en proyección con línea fina.

### Ocultas
- Las aristas tapadas por otros elementos no se dibujan.
- Usa el depth buffer: primero dibuja las caras para profundidad y luego las líneas con `depthTest`.

## Parte 3: rellenos de corte por material
- **Patrones de relleno** (texturas de patrón generadas en canvas, con escala en mm de papel):

| Material | Patrón |
|---|---|
| Block | diagonal a 45° |
| Tabique | diagonal doble |
| Concreto | puntos y triángulos (patrón «concreto» clásico) |
| Tierra | — |
| Aislante | ondas |
| Madera | veta |
| Vidrio | sin relleno |
| Genérico | gris sólido al 30 % |

- **De dónde sale el material:** de las capas (`IfcMaterialLayerSet`) del tipo de muro o losa. Los tipos de O003b se asignan así: Block 12/15/20 → Block; Tabique → Tabique; Concreto → Concreto.
- **Muros multicapa:** cada capa con su relleno y una línea fina entre capas.
- **Configuración:** en el diálogo de estilos, pestaña **Materiales**, con patrón y escala por material, guardados en `OPENRVT_Estilos`.

## Parte 4: simbología de puertas y ventanas en planta
- **Puerta:**
  - arco de abatimiento de 90° con línea fina;
  - la hoja como rectángulo con grosor de corte (0.04 m de espesor);
  - el lado de abatimiento respeta el pset de O003b.
- **Ventana:**
  - en el corte del muro, 3 líneas paralelas (los dos paños y el vidrio al centro) y el alféizar;
  - el muro debajo del antepecho no se dibuja como cortado: la ventana interrumpe el muro.
- **Cómo se dibujan:** es simbología 2D generada en el frontend a partir de los datos de la abertura (`modelo.propiedades`). No es geometría IFC.
- **Visibilidad:** solo en plantas. En alzados y cortes se ven en proyección como hoy.

## Parte 5: verificación
- **Todo en verde:** `npm run build`, `npx vitest run`, `cargo test --workspace`, `cargo clippy -- -D warnings` y `pytest nucleo/tests`.
- **vitest:**
  - intersección plano-malla con un cubo y con un muro con vano: las polilíneas deben salir cerradas y con el área esperada;
  - conversión de mm a px por escala y zoom;
  - el patrón por tipo de muro;
  - la geometría del arco de puerta según el lado de abatimiento;
  - la serialización de `OPENRVT_Estilos`.
- **pytest:** `estilos.leer` y `estilos.guardar` hacen round-trip y deshacer.
- **E2E (app real, como en O003b):**
  1. Abre FZK-Haus y luego la casa de O003b.
  2. Cambia el grosor de corte de Muros a 0.70 y comprueba que la vista lo refleja.
  3. Guarda, reabre y comprueba que el estilo persiste.
- **Capturas a 1600 × 900:**
  - `o005_planta_fzk.png`: planta con rellenos, puertas abatidas y volados discontinuos;
  - `o005_planta_casa.png`;
  - `o005_corte_fzk.png`;
  - `o005_alzado_fzk.png`;
  - `o005_estilos.png`: el diálogo.
- **Revisa tú las capturas:**
  - que se lean como plano;
  - que las líneas de corte se vean claramente más gruesas que las de proyección;
  - que no haya líneas de triangulación visibles en caras planas (solo aristas reales).
- **Rendimiento:** la planta de FZK-Haus se redibuja en menos de 300 ms al cambiar un estilo, e Institute en menos de 1.5 s.

## Entrega
- Instalador 0.3.0 (.deb y .exe) en `instaladores/`, como en O004.
- `docs/progreso/O005.md` con la etiqueta «LISTA PARA REVISIÓN»: qué se hizo, pruebas, tiempos, capturas y desviaciones.
- Archivos copiados de PresupuestosPro que toques: comentario `// OPEN-RVT:` y actualización de `docs/origen-pp.md`.
- Commits en español al cerrar cada parte. No hagas push.

## No hagas
- No hagas cotas, textos ni etiquetas (son de O006), ni láminas o PDF (O009).
- No uses librerías 3D o 2D nuevas.
