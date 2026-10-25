# O007a — Editor de tipos, biblioteca de materiales y muros multicapa

**Diseño completo:** `ideas/2026-10-25-elementos-editor-instalaciones.md`. Léelo primero. Esta es la **fase 1**: el marco del editor de tipos, que después usarán las columnas, las zapatas y las instalaciones (O007b y O008a), aplicado a los muros.

**Principio:** todo elemento sale de un tipo (`IfcXxxType`). Si editas el tipo, cambian todas sus instancias.

## 1. Biblioteca de materiales (núcleo)
### Formato
- `IfcMaterial` con `Category` y el pset `OPENRVT_Material`, que lleva:
  - `Categoria`: núcleo, acabado, aislante, concreto, acero o instalación;
  - `Color`: hex;
  - `Rayado`: sólido, diagonal, ladrillo, block, concreto, ninguno;
  - `Unidad`: m², m³ o kg;
  - `EspesorTipico`, en m.

### Semilla
Se crea al hacer un modelo nuevo, o al abrir uno que no la tenga, si faltan los materiales:

| Material | Categoría | Espesor típico |
|---|---|---:|
| Block de concreto 12 | núcleo | 0.12 |
| Block de concreto 15 | núcleo | 0.15 |
| Block de concreto 20 | núcleo | 0.20 |
| Tabique rojo recocido | núcleo | 0.14 |
| Tabique hueco | núcleo | 0.12 |
| Tablaroca | núcleo | 0.0127 |
| Concreto armado | concreto | 0.15 |
| Aplanado de mortero (repellado) | acabado | 0.015 |
| Aplanado fino | acabado | 0.005 |
| Yeso | acabado | 0.010 |
| Pasta / tirol | acabado | 0.003 |
| Pintura | acabado | 0.0005 |
| Pegazulejo | acabado | 0.005 |
| Azulejo | acabado | 0.006 |
| Poliestireno (aislante) | aislante | 0.025 |

### Métodos RPC
- `materiales.listar`;
- `materiales.crear` (nombre y campos);
- `materiales.editar`;
- `materiales.borrar`: lo impide, con un error en español, si un tipo lo usa.

## 2. Tipos de muro multicapa (núcleo)
### Capas
- Cada tipo usa un `IfcMaterialLayerSet`, ordenado **de exterior a interior**.
- Cada `IfcMaterialLayer` lleva:
  - el material y `LayerThickness`;
  - `Category`, con la función de la capa: `núcleo`, `acabado`, `aislante` o `membrana`;
  - `IsVentilated`: no se usa.
- **Debe haber exactamente un núcleo**, aunque puede tener varias capas contiguas de función núcleo. Si no lo hay, error.

### Espesor y ubicación
- **El espesor del muro es la suma de las capas.** El pset `OPENRVT_TipoMuro.Espesor` queda sincronizado.
- **Línea de ubicación** (`OPENRVT_TipoMuro.LineaUbicacion`): `eje_nucleo` (por omisión), `cara_exterior`, `cara_interior` o `centro`. La geometría se desplaza según esa línea.

### Tipos de ejemplo
Se crean además de los 5 actuales, que quedan como un solo núcleo:
- **Block 15 aplanado-yeso:** pintura · fino 0.005 · repellado 0.015 · block 15 · yeso 0.010 · pintura;
- **Tabique 14 aplanado ambos lados:** fino · repellado · tabique 14 · repellado · fino;
- **Block 15 baño:** fino · repellado · block 15 · repellado · pegazulejo · azulejo.

### Métodos RPC (genéricos, sirven para cualquier clase de tipo)
- `tipos.obtener(globalid)`: nombre, clase, parámetros y capas;
- `tipos.crear(clase, nombre, datos)`;
- `tipos.duplicar(globalid, nombre)`;
- `tipos.editar(globalid, datos)`;
- `tipos.borrar(globalid)`: impedido si tiene instancias, y el error dice cuántas;
- `tipos.instancias(globalid)`.

### Reglas al editar y al cambiar de tipo
- **Al editar las capas:** todas las instancias regeneran su geometría (espesor y desplazamiento), y su eje se queda fijo según la línea de ubicación. Se puede deshacer en un paso.
- **Cambiar el tipo de una instancia** con `elemento.cambiar_tipo(globalid, tipo)`: está en las propiedades del muro, como lista desplegable.

## 3. Editor de tipos (interfaz)
### Acceso
- Ribbon **Modelar → «Tipos»**, en un grupo nuevo, «Editor».
- Doble clic en un muro → «Editar tipo».
- Sidebar: una entrada nueva, **«Tipos y materiales»**.

### Ventana del editor
Pantalla completa dentro del área de trabajo, con tres columnas:
1. **Árbol de tipos por categoría:** Muros. Deja ya los nodos vacíos de Estructura e Instalaciones, con «Próximamente». Incluye buscar, crear, duplicar y borrar.
2. **Parámetros del tipo seleccionado.** Para un muro es la **tabla de capas**: función, material (desplegable de la biblioteca), espesor y botones subir, bajar, insertar y quitar. Muestra el total y la línea de ubicación. Las capas acabado–núcleo–acabado se marcan con su color.
3. **Vista previa:** el corte del muro a escala, con cada capa con su color y su rayado, la cota de cada espesor y el total. Indica «Exterior» e «Interior». Se actualiza en vivo.

### Abajo
- «Instancias: N» (con un botón para seleccionarlas en el modelo);
- **Aplicar** y Cancelar.

### Pestaña «Materiales»
Tabla editable de la biblioteca, con una muestra de color y de rayado.

## 4. Dibujo de las capas
- **En planta, a escala 1:50 o mayor:**
  - se dibuja la línea de separación entre capas (fina) y el contorno del núcleo (gruesa);
  - el núcleo lleva el rayado de su material y los acabados quedan sin rayado.
- **A 1:100 o menor:** solo el contorno exterior, como ahora (lineamientos de O005).
- **Corte y alzado:** lo mismo, cuando el plano corta el muro.
- **3D:** un solo sólido con el espesor total. El color de la cara exterior es el de la capa exterior; si no se puede, el del núcleo.
- **Uniones en L y T:** los muros de la misma clase se unen como ahora. Si los núcleos de capas distintas se traslapan, no pasa nada; la prioridad de cortes llega en O007c.

## 5. Verificación
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **pytest:**
  - semilla de materiales;
  - crear un tipo de 6 capas: espesor 0.185 = 0.0005 + 0.005 + 0.015 + 0.15 + 0.010 + 0.0005;
  - error con 0 o con 2 núcleos separados;
  - al editar una capa, la instancia cambia de espesor y el eje se mantiene (`eje_nucleo`);
  - no se puede borrar un tipo con instancias ni un material en uso;
  - deshacer;
  - guardar en IFC y reabrir conserva capas, funciones y psets.
- **vitest:** tabla de capas (orden, total y validación del núcleo) y la vista previa (posiciones de las capas).
- **E2E:**
  1. Abre el editor, duplica «Block 15» como «Block 15 aplanado» y agrégale repellado y fino por fuera y yeso por dentro. Aplica: el muro existente de ese tipo cambia de espesor en planta.
  2. Planta a 1:50: se ven las líneas de las capas.
- **Capturas:** `o007a_editor_tipos.png` (las tres columnas, con la vista previa del muro de 6 capas), `o007a_planta_capas.png` (1:50) y `o007a_materiales.png`. Ábrelas y revisa que se lean.

## Entrega
- **Versión 0.5.2.** Solo sube el último número.
- Manual de Ayuda: una sección «Tipos y materiales», en español e inglés.
- `docs/progreso/O007a.md` con la etiqueta «LISTA PARA REVISIÓN».
- Commits en español. No hagas push.
