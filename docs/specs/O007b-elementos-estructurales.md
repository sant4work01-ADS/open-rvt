# O007b — Elementos estructurales: tipos con sección y armado, y herramientas para colocarlos

**Diseño completo:** `ideas/2026-10-25-elementos-editor-instalaciones.md`, secciones «Catálogo» y «Armado». Léelo primero.
**Base:** O007a, que ya trae el editor de tipos (`nucleo/openrvt_nucleo/biblioteca.py`, `src/features/tipos/`), los tipos genéricos por `IfcTypeObject`, `tipos.*` y `elemento.cambiar_tipo`. **Reutilízalo**: no hagas un editor nuevo.

**Fuera de alcance (va en O007c, NO lo hagas):** cortes y prioridad de unión, alojar el castillo en el muro, colocar automáticamente en cruces o esquinas, zapata automática bajo la columna, edición en cadena entre elementos. Aquí cada elemento es independiente.

## 1. Clases y tipos (núcleo)

| Elemento | Tipo IFC4 | PredefinedType | Instancia |
|---|---|---|---|
| Zapata aislada | `IfcFootingType` | `PAD_FOOTING` | `IfcFooting` |
| Zapata corrida | `IfcFootingType` | `STRIP_FOOTING` | `IfcFooting` |
| Contratrabe | `IfcFootingType` | `FOOTING_BEAM` | `IfcFooting` |
| Columna | `IfcColumnType` | `COLUMN` | `IfcColumn` |
| Castillo | `IfcColumnType` | `USERDEFINED`, `ElementType="CASTILLO"` | `IfcColumn` |
| Trabe | `IfcBeamType` | `BEAM` | `IfcBeam` |
| Cerramiento | `IfcBeamType` | `USERDEFINED`, `ElementType="CERRAMIENTO"` | `IfcBeam` |
| Dala de desplante | `IfcBeamType` | `USERDEFINED`, `ElementType="DALA_DESPLANTE"` | `IfcBeam` |

- Extiende `_clase_tipo` con los alias `zapata`, `columna`, `castillo`, `trabe`, `cerramiento`, `dala`, `contratrabe` y `zapata_corrida`. Cada alias fija la clase y el PredefinedType.
- `tipos.listar` acepta estas clases. El árbol del editor las agrupa bajo **ESTRUCTURA**: Zapatas, Contratrabes, Columnas, Castillos, Trabes, Cerramientos y dalas. Quita el «Próximamente» de Estructura y déjalo en Instalaciones.

### Sección (pset `OPENRVT_Seccion` del tipo, en metros)
- **Columna, castillo, trabe, cerramiento, dala y contratrabe:**
  - `Forma`: `rectangular` o `circular` (circular solo en columna);
  - `B` (ancho), `H` (peralte) y `D` (diámetro).
- **Zapata aislada:**
  - `Largo`, `Ancho` y `Peralte`;
  - `DadoB`, `DadoH` y `DadoAlto` (0 = sin dado);
  - `Plantilla` (espesor de concreto pobre; 0.05 por omisión).
- **Zapata corrida:**
  - `Ancho`, `Peralte` y `Corona` (0 = rectangular; si es mayor que 0, la sección es trapecial y la corona es el ancho de arriba);
  - `Plantilla`.
- **Estándar IFC:**
  - columna, castillo, trabe, cerramiento, dala y contratrabe llevan además `IfcMaterialProfileSet` con `IfcRectangleProfileDef` o `IfcCircleProfileDef`, y material «Concreto armado» de la biblioteca;
  - las zapatas llevan `IfcMaterial` «Concreto armado» asociado.
- **Al editar la sección se regeneran todas las instancias**, en un solo paso de deshacer, igual que los muros en O007a.

### Armado (pset `OPENRVT_Armado` del tipo)
- **Longitudinal:** `LongCantidad` (entero) y `LongVarilla` (`#3`…`#8`).
- **Estribos:** `EstVarilla` (`#2`…`#4`), `EstSepExtremos`, `EstSepCentro` y `EstLongConfinamiento` (m; si vale 0, toda la pieza va a `EstSepCentro`).
- **Zapatas:**
  - parrilla: `ParrillaVarilla`, `ParrillaSepX` y `ParrillaSepY`;
  - zapata corrida: además `LongCantidad` y `LongVarilla` (bastones longitudinales).
- `Recubrimiento` (0.025 por omisión; 0.05 en zapatas).
- `Armex`: texto, por ejemplo «15x15-4». Si no está vacío, sustituye al armado longitudinal y a los estribos, y el acero se calcula con la tabla de armex de abajo.

**Tabla de varillas**, una constante única `VARILLAS` en `biblioteca.py`, con el diámetro en mm y el peso en kg/m:

| Varilla | Diámetro | Peso |
|---|---:|---:|
| #2 | 6.35 | 0.249 |
| #3 | 9.53 | 0.560 |
| #4 | 12.70 | 0.994 |
| #5 | 15.88 | 1.552 |
| #6 | 19.05 | 2.235 |
| #8 | 25.40 | 3.973 |

**Armex**, constante `ARMEX` con el peso en kg/m: `15x15-4` = 1.82, `12x20-4` = 1.82, `15x20-4` = 1.95, `15x30-4` = 2.25.

### Acero estimado: `acero.estimar(globalid)`
Devuelve `{longitudinal_kg, estribos_kg, total_kg, detalle}`, redondeado a 3 decimales.

**Pieza lineal** de largo `L` (la altura en columna y castillo; la longitud en trabe, dala o contratrabe):
- longitudinal = `LongCantidad × L × peso(LongVarilla)`;
- largo de un estribo = `2·(B − 2r) + 2·(H − 2r) + 0.20` (ganchos), con `r` = recubrimiento;
- piezas = `floor(L / EstSepCentro) + 1` si `EstLongConfinamiento` = 0. Si no:
  - en cada extremo, `floor(Lc / EstSepExtremos)`;
  - en el centro, `floor((L − 2·Lc) / EstSepCentro) + 1`;
- estribos = piezas × largo × peso(EstVarilla);
- con armex: total = `L × ARMEX[Armex]` y estribos = 0.

**Zapata aislada:**
- barras en X = `floor((Ancho − 2r) / ParrillaSepX) + 1`, cada una de largo `Largo − 2r`;
- barras en Y: igual, con `Largo` y `ParrillaSepY`;
- longitudinal = suma × peso; estribos = 0.

**Zapata corrida:** bastones = `LongCantidad × L`; transversales = `floor(L / ParrillaSepX) + 1` de largo `Ancho − 2r`.

**Casos de prueba exactos** (pytest):
- Castillo 0.15 × 0.15, `4 #3`, estribos `#2 @0.20`, sin confinamiento, r = 0.025, L = 2.60:
  - longitudinal = 4 × 2.60 × 0.560 = **5.824**;
  - largo del estribo = 0.40 + 0.20 = 0.60; piezas = 14; estribos = 14 × 0.60 × 0.249 = **2.092**;
  - total = **7.916**.
- El mismo castillo con armex `15x15-4`: total = 2.60 × 1.82 = **4.732**.
- Zapata 1.20 × 1.20, parrilla `#4 @0.20` en los dos sentidos, r = 0.05:
  - por sentido: floor(1.10 / 0.20) + 1 = 6 barras de 1.10 m; 12 × 1.10 × 0.994 = **13.121**.
- Columna 0.30 × 0.30, `4 #5`, estribos `#3`, extremos @0.10, centro @0.20, Lc = 0.50, L = 3.00:
  - piezas = 5 + 5 + (floor(2.00 / 0.20) + 1 = 11) = 21;
  - largo = 2·0.25 + 2·0.25 + 0.20 = 1.20;
  - estribos = 21 × 1.20 × 0.560 = **14.112**;
  - longitudinal = 4 × 3.00 × 1.552 = **18.624**.

### Tipos semilla
Se crean junto con la biblioteca (solo si faltan, por nombre):

| Nombre | Sección | Armado |
|---|---|---|
| Z-1 Zapata 1.20×1.20 | 1.20 × 1.20 × 0.25; dado 0.40 × 0.40 × 0.60 | parrilla #4 @0.20 X/Y |
| ZC-1 Zapata corrida 60 | ancho 0.60, peralte 0.20, corona 0 | 3 #3, transversales #3 @0.20 |
| CT-1 Contratrabe 20×40 | 0.20 × 0.40 | 4 #4, est #3 @0.15 |
| C-1 Columna 30×30 | 0.30 × 0.30 | 4 #5, est #3 @0.10/0.20, Lc 0.50 |
| K-1 Castillo 15×15 | 0.15 × 0.15 | 4 #3, est #2 @0.20 |
| K-2 Castillo armex 15×15 | 0.15 × 0.15 | Armex 15x15-4 |
| T-1 Trabe 20×40 | 0.20 × 0.40 | 4 #4, est #3 @0.10/0.20, Lc 0.80 |
| CE-1 Cerramiento 15×20 | 0.15 × 0.20 | 4 #3, est #2 @0.20 |
| DD-1 Dala de desplante 15×20 | 0.15 × 0.20 | 4 #3, est #2 @0.20 |

## 2. Crear instancias (núcleo, RPC)

Todos los métodos van en `modelado.py`, siguen el patrón de `muro_crear` (`_exigir_modelo`, validación con error -32602 en español, `_instantanea`, `assign_type`, `self._resultado(creados=[…])`) y se registran en `servidor.py`.

- **`columna.crear(tipo, nivel, x, y, rotacion=0, nivel_superior=None, altura=None)`**: sirve para columna y castillo.
  - La base va a la elevación del nivel.
  - La parte de arriba va al nivel superior si se da; si no, se usa `altura`; si tampoco, el siguiente nivel por elevación; si no hay ninguno, 2.60.
  - Error si la altura es ≤ 0.
- **`viga.crear(tipo, nivel, x1, y1, x2, y2, desfase=0)`**: sirve para trabe, cerramiento, dala y contratrabe.
  - El **lecho alto** queda en la elevación del nivel + `desfase`.
  - Excepción: la dala de desplante apoya su **lecho bajo** en la elevación del nivel.
  - Error si los dos puntos coinciden.
- **`zapata.crear(tipo, nivel, x, y, rotacion=0, desplante=1.00)`**: zapata aislada.
  - La cara inferior queda en `elevación del nivel − desplante`.
  - El dado va centrado encima, y la plantilla debajo, como parte de la misma representación.
- **`zapata_corrida.crear(tipo, nivel, x1, y1, x2, y2, desplante=0.80)`**: extrusión de la sección a lo largo del trazo.
- **Psets de la instancia:** `OPENRVT_Estructura` con `Desplante`, `Desfase`, `NivelSuperior` y `Altura`, según aplique. `elemento_editar` permite cambiarlos y regenera la geometría.
- **`geometria.teselar` y planta:**
  - columnas y castillos: sección llena con el rayado de concreto;
  - trabes y cerramientos: líneas **discontinuas** (están arriba del corte);
  - zapatas y contratrabes: **discontinuas** en la planta de su nivel;
  - todos con el contorno del grosor de O005.
  - Los elementos también salen en cortes, alzados y 3D, con el color del material.
- **Mover, copiar, borrar, deshacer y cambiar de tipo** funcionan con estos elementos sin código especial. Si algo falla, corrígelo en el método general, no con un caso aparte.

## 3. Interfaz

### Cinta «Modelar»
Nuevo grupo **ESTRUCTURA** con estos botones: Zapata, Zapata corrida, Contratrabe, Columna, Castillo, Trabe, Cerramiento y Dala. Íconos de lucide; si no hay uno exacto, el más cercano.
- **Columna, castillo y zapata:** un clic. Usa los enganches que ya existen (`buscarEnganche`) **más un enganche nuevo, «cruce de ejes»**: la intersección de dos ejes de la retícula, con prioridad sobre la cuadrícula. La tecla **R** gira 90°.
- **Lineales:** dos clics, como el muro (`puntoDibujo`, longitud tecleada).
- Antes de colocar, el selector de tipo de la barra de herramientas (`BarraHerramienta.tsx`) muestra solo los tipos de esa clase.

### Editor de tipos
- Para las clases de estructura, el centro del editor muestra:
  - un **formulario de sección**: los campos de arriba, en cm en la interfaz y en m en el núcleo;
  - un **formulario de armado**: las varillas son un select con la tabla `VARILLAS`, que se pide al núcleo con `acero.varillas`; no la dupliques en TS.
- La **vista previa** (columna derecha) es un SVG a escala:
  - en las piezas lineales, la sección con el estribo (rectángulo con el recubrimiento), las varillas longitudinales como círculos repartidos en el perímetro (una en cada esquina y el resto en las caras), y cotas B y H;
  - en la zapata aislada, la planta con la parrilla y el dado, más el corte con el peralte;
  - con armex, la sección y la leyenda «Armex 15x15-4».
- Pie del editor: «Acero estimado por pieza tipo»:
  - piezas lineales: kg/m;
  - zapatas: kg por pieza.

### Panel de propiedades
- Al seleccionar un elemento estructural, muestra «Acero estimado: X kg» (`acero.estimar`) y los parámetros de `OPENRVT_Estructura`, editables.

## 4. Verificación
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **pytest:**
  - los 4 casos de acero exactos de arriba (`pytest.approx` a 1e-3);
  - semilla de los 9 tipos;
  - una prueba de crear por cada método RPC, que verifique la clase, el PredefinedType, el tipo asignado y las elevaciones. Por ejemplo, la zapata Z-1 con desplante 1.00 en el nivel 0.00: cara inferior en −1.00, superior en −0.75 y el dado hasta −0.15;
  - editar la sección de C-1 a 0.35 × 0.35 regenera las 2 instancias y se deshace en un paso;
  - guardar en IFC y reabrir conserva los tipos, los psets, el `IfcMaterialProfileSet` y el armado;
  - un modelo con estos elementos pasa `validar()` sin errores nuevos.
- **vitest:**
  - el enganche «cruce de ejes»: dos ejes que se cruzan en (3, 4); un clic en (3.1, 3.9) engancha en (3, 4);
  - el reparto de varillas en la vista previa: 4 varillas → 4 esquinas; 6 → 4 esquinas + 1 en cada cara H.
- **E2E con la app real:**
  1. Crea la retícula de 2 × 2 ejes a 4 m.
  2. Coloca C-1 en los 4 cruces, con el enganche.
  3. Pon T-1 entre dos columnas y Z-1 bajo una columna.
  4. Abre el editor de tipos en K-1 y cambia su armado a armex.
  5. Revisa la planta y el 3D.
- **Capturas** en `docs/capturas/`; ábrelas y revisa que se lean:
  - `o007b_editor_columna.png`: sección con varillas y estribo;
  - `o007b_editor_zapata.png`;
  - `o007b_planta.png`: columnas llenas, trabe y zapata discontinuas;
  - `o007b_3d.png`.

## Entrega
- **Versión 0.5.3:** solo sube el último número, en Cargo.toml, package.json, tauri.conf.json y Cargo.lock.
- **Manual de Ayuda:** sección «Estructura», en español y en inglés, más «Novedades de la versión 0.5.3».
- `docs/progreso/O007b.md` con la etiqueta «LISTA PARA REVISIÓN» y la lista de los criterios cumplidos.
- Commits en español al cerrar cada parte. No hagas push.
- **Nada se aplaza:** si un punto no sale, anota el porqué en el progreso, pero intenta todos.
