# O007c — Interacciones: castillos en muros, cerramientos y dalas ligados, columnas en cruces, zapata bajo columna, cortes por prioridad y edición en cadena

**Diseño completo:** `ideas/2026-10-25-elementos-editor-instalaciones.md`, sección «Interacciones (reglas)». Léela primero.

**Base:** O007b (elementos estructurales: `columna_crear`, `viga_crear`, `zapata_crear`, `zapata_corrida_crear`, `_regenerar_estructura`, pset `OPENRVT_Estructura`, enganche «cruce», `acero.py`) y O006e (esquinas de muros en `src/features/modelo/planta.ts`: `bandasMuro`, `recortesDeMuro`, `calcularPlantaMuros`). **Reutiliza lo que hay**; no dupliques métodos de creación.

**Pedido del usuario:** las esquinas de los muros se ven mal acabadas; se resuelven con castillos y columnas. Los elementos deben interactuar entre sí, como en obra.

## 1. Ligas entre elementos (núcleo)
Todas las ligas se guardan en el pset `OPENRVT_Liga` de la instancia dependiente, con GlobalIds:

| Campo | En | Significado |
|---|---|---|
| `Muro` | castillo, cerramiento, dala | muro anfitrión |
| `Distancia` | castillo | distancia en m desde el inicio del eje del muro hasta el centro del castillo |
| `EjeA`, `EjeB` | columna, zapata | los dos ejes del cruce |
| `Columna` | zapata | columna que soporta |
| `Lindero` | zapata | `""`, `N`, `S`, `E` u `O` |

Además, crea la relación IFC estándar:
- castillo, cerramiento o dala con su muro: `IfcRelConnectsElements` (RelatingElement = muro);
- zapata con su columna: `IfcRelConnectsElements` (RelatingElement = zapata).

Los psets mandan; la relación IFC es para el intercambio. Al guardar y reabrir, las dos se conservan.

## 2. Castillo alojado en el muro
- **`castillo.crear_en_muro(tipo, muro, distancia)`**:
  - posición = punto del eje del muro a `distancia` (0 ≤ distancia ≤ largo del muro; fuera de rango → error -32602 en español);
  - el ancho perpendicular al muro es el **espesor del núcleo** del muro; el otro lado es `B` del tipo. Si `B` del tipo difiere del núcleo, se usa el núcleo y se anota `AnchoDelMuro = true` en `OPENRVT_Estructura`;
  - rotación = la del muro; la base va a la base del muro;
  - **altura:** hasta el lecho bajo del cerramiento ligado al mismo muro, si lo hay; si no, hasta la parte de arriba del muro.
- **`castillos.automaticos(muros, separacion_max=3.0)`** (`muros`: lista de GlobalIds; vacía = todos los del nivel activo). Pone castillos:
  1. en cada **esquina** (uniones L, T y X, con `_conexion_entre`), uno solo por esquina, centrado en el cruce de los ejes de los muros;
  2. en cada **remate** (extremo libre de muro), con su cara al ras del extremo;
  3. **intermedios**, repartidos a partes iguales para que ninguna separación entre centros pase de `separacion_max`.
  - No duplica: si ya hay un castillo a menos de 0.05 m, lo salta.
  - Todo en **un solo paso de deshacer**.
  - Devuelve `creados` y `omitidos`.
- **El castillo sigue al muro:** al mover, estirar, cambiar de altura o cambiar de tipo el muro, se recalculan su posición (con `Distancia`), su ancho y su altura.
  - Si el muro se acorta y la `Distancia` queda fuera, el castillo se pega al extremo.
  - Al borrar el muro, se borran sus castillos, cerramientos y dalas en el mismo paso de deshacer.

## 3. Cerramiento y dala ligados al muro
- **`cerramiento.crear_en_muro(tipo, muro)`** y **`dala.crear_en_muro(tipo, muro)`**:
  - mismo trazo que el eje del muro; ancho = núcleo del muro; peralte = `H` del tipo;
  - el cerramiento tiene su lecho alto en la parte de arriba del muro;
  - la dala tiene su lecho bajo en la base del muro.
- Se recalculan al cambiar el muro (largo, altura, posición o tipo).
- Al crear un cerramiento, los castillos de ese muro bajan su altura hasta el lecho bajo del cerramiento.
- **Botones en la cinta** (grupo ESTRUCTURA): «Castillos automáticos» (pide la separación, 3.00 m por omisión, y aplica a los muros seleccionados o, si no hay selección, a todos los del nivel), «Cerramiento en muro» y «Dala en muro» (clic sobre un muro). La herramienta «Castillo» de O007b, al hacer clic **sobre un muro**, usa `castillo.crear_en_muro`. Fuera de un muro se comporta como hoy.

## 4. Columnas en los cruces y zapata bajo la columna
- **`columnas.en_cruces(tipo, nivel, ejes=None)`**:
  - crea una columna en cada cruce de dos ejes (o solo entre los `ejes` dados);
  - guarda `EjeA` y `EjeB`;
  - no duplica: si ya hay una columna a menos de 0.05 m, la salta;
  - todo en un paso de deshacer.
- `columna.crear` sobre un cruce (enganche «cruce») también guarda `EjeA` y `EjeB`.
- **El eje mueve sus columnas:** `ejes_mover`, `ejes_separacion`, `ejes_rebase` y el resto de los cambios a la retícula mueven las columnas ligadas a esos ejes, junto con sus zapatas, en el mismo paso de deshacer.
- **`zapata.bajo_columna(tipo, columna, desplante=1.00, lindero="")`**:
  - centrada bajo la columna; con `lindero`, desplazada para que su borde de ese lado quede **al ras de la cara de la columna** (zapata excéntrica);
  - la base de la columna baja a la cara superior del **dado** (o de la zapata si no tiene dado);
  - mover la columna mueve su zapata; borrar la columna pregunta en la interfaz «¿Borrar también su zapata?» (por omisión, sí).
- **Interfaz:** en la barra de la herramienta Columna, casilla «Con zapata» y selector del tipo de zapata. Un botón «En todos los cruces» llama a `columnas.en_cruces` y, si «Con zapata» está marcada, a `zapata.bajo_columna` en cada una.
- **`contratrabes.unir_zapatas(tipo, nivel, desfase=-0.10)`**: una contratrabe entre cada par de zapatas **consecutivas sobre el mismo eje**, de centro a centro, con el lecho alto en la elevación del nivel + `desfase`.
- **`trabes.unir_columnas(tipo, nivel, espesor_losa=0.10)`**: una trabe entre cada par de columnas consecutivas sobre el mismo eje, de centro a centro, con el lecho alto en `nivel superior − espesor_losa`. Si ya hay una losa en el nivel superior, usa su espesor. La parte de arriba de esas columnas llega al **lecho alto** de la trabe más alta que reciben: el nudo es de la columna, y la trabe se corta contra ella (punto 5).
- Las dos funciones saltan los tramos que ya tienen una pieza igual; botones en la cinta.

## 5. Cortes por prioridad (cuantificación)
**Prioridad (gana el primero):** zapata > contratrabe > columna > trabe > losa > castillo > cerramiento/dala > muro (núcleo) > acabados del muro.

**`cantidades.estructura(nivel=None)`** devuelve, por elemento: `globalid`, `clase`, `tipo`, `volumen_bruto_m3`, `volumen_neto_m3` y `acero_kg`; además, totales por tipo y el gran total.
- Todos estos elementos son prismas: polígono en planta × intervalo en z. Así se toman, con shapely (ya viene con IfcOpenShell). La zapata corrida trapecial se toma con su área de sección real × largo; sus cortes, como prisma de ancho completo, y se anota en `detalle`.
- **Volumen neto** = bruto − volumen de su intersección con la **unión** de todos los elementos de mayor prioridad. Para que la unión sea exacta, corta en rebanadas en z por todas las elevaciones de inicio y fin presentes.
- **Muros:** `area_neta_m2` del núcleo = largo × alto − vanos − caras de castillos y columnas (ancho × alto) − franjas de cerramientos y dalas (largo × peralte). Los acabados no se descuentan por castillos: el aplanado cubre el castillo.
- **Prueba invariante:** la suma de los volúmenes netos de un modelo es igual al volumen de la unión de todos sus elementos (tolerancia 1e-6).

## 6. Planta y corte
- **Planta** (`planta.ts`):
  - el **núcleo** del muro se recorta contra la sección de castillos y columnas; la sección del castillo queda llena con el rayado de concreto;
  - los **acabados** del muro pasan por encima del castillo, sin cortarse;
  - en una columna, todas las capas del muro terminan en su cara;
  - una esquina con castillo debe verse así: el castillo llena el cruce de los núcleos, sin líneas de núcleo dentro, y las capas de acabado dan la vuelta por fuera, en inglete, como ya hace O006e.
- **Corte y alzado:** cerramiento y dala se ven con su rayado sobre el muro; el núcleo del muro no se dibuja encima de ellos.

## 7. Arreglo pendiente de O007b: «Acero por pieza tipo»
Hoy el pie del editor calcula kg/m con L = 1 m. Con L = 1 el confinamiento ocupa toda la pieza y los extremos de estribos se cuentan de más; por ejemplo, C-1 marca 13.600 kg/m.
- Usa un **largo de referencia**: 3.00 m en columna y castillo; 4.00 m en trabe, cerramiento, dala, contratrabe y zapata corrida.
- kg/m = `estimar(L_ref) / L_ref`. Muestra «X kg/m (sobre L_ref m)».
- **Prueba:** C-1 → (18.624 + 14.112) / 3 = **10.912 kg/m**.

## Verificación
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **pytest:**
  - castillos automáticos en un rectángulo de 4 muros de 7.00 × 5.00 (ejes), `separacion_max` 3.0: 4 en esquinas; intermedios: 2 en cada muro de 7.00 (separaciones 2.333) y 1 en cada muro de 5.00 (2.50) → **10 castillos**. Repetir la llamada no crea ninguno más;
  - muro suelto de 4.00: 2 remates + 1 intermedio = 3;
  - mover el muro 1.00 m en x mueve sus castillos; alargarlo de 4.00 a 6.00 recalcula su cerramiento a 6.00; borrarlo borra castillos, cerramiento y dala, y deshacer los devuelve en un paso;
  - cerramiento CE-1 (0.20 de peralte) sobre un muro de 2.60: los castillos quedan de 2.40;
  - columnas en una retícula de 3 × 3 ejes: 9 columnas; repetir no duplica; mover el eje B 0.50 mueve las 3 columnas de B y sus zapatas;
  - zapata Z-1 bajo C-1 con lindero `E`: el borde este de la zapata coincide con la cara este de la columna (x + 0.15); la base de la columna queda en −0.15;
  - cortes: columna 0.30 × 0.30 × 3.00 sobre Z-1 y trabe 0.20 × 0.40 × 4.00 entre dos columnas a 4.00 m: el neto de la trabe es 0.20 × 0.40 × 3.70 = **0.296 m³**; la invariante de unión se cumple;
  - muro de 4.00 × 2.60 con 2 castillos de 0.15 y cerramiento de 0.20: área neta del núcleo = 4.00 × 2.60 − 2 × 0.15 × 2.40 − 4.00 × 0.20 = **8.88 m²**;
  - guardar y reabrir conserva `OPENRVT_Liga` y las `IfcRelConnectsElements`; `validar()` sin errores nuevos;
  - kg/m de C-1 = 10.912.
- **vitest:** en planta, un muro en L con castillo en la esquina:
  - ninguna línea de núcleo dentro de la sección del castillo;
  - las líneas de acabado son continuas por fuera del castillo.
- **E2E con la app real:**
  1. Dibuja 4 muros en rectángulo.
  2. Pulsa «Castillos automáticos».
  3. Agrega cerramientos a los 4 muros.
  4. Crea una retícula de 3 × 3 y pon «En todos los cruces» con zapata.
  5. Une con trabes y contratrabes.
  6. Mueve un eje.
- **Capturas** en `docs/capturas/`; ábrelas y revisa que se lean:
  - `o007c_esquina_castillo.png`: planta a 1:50, esquina con castillo y acabados;
  - `o007c_castillos_auto.png`;
  - `o007c_reticula_columnas.png`: 3D con columnas, zapatas, trabes y contratrabes;
  - `o007c_cantidades.png`: si hay panel; si no, la salida de `cantidades.estructura` en el progreso.

## Entrega
- **Versión 0.5.5:** solo sube el último número, en Cargo.toml, package.json, tauri.conf.json y Cargo.lock.
- **Manual de Ayuda:** sección «Estructura» ampliada (castillos automáticos, ligas, cortes por prioridad) en español y en inglés, más «Novedades de la versión 0.5.5».
- `docs/progreso/O007c.md` con la etiqueta «LISTA PARA REVISIÓN» y la lista de los criterios cumplidos.
- Commits en español al cerrar cada parte. No hagas push.
- **Nada se aplaza:** si un punto no sale, anota el porqué en el progreso, pero intenta todos.
