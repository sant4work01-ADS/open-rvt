# O039: árbol del proyecto, modo Obra (capítulos y partidas)

Fase 2 de `docs/specs/O038-arbol-del-proyecto.md`; léela. El modo Modelo ya está en main (O038). Ahora el modo
**Obra**: el árbol del presupuesto.

## Decisiones ya tomadas (no las cambies)

### Datos
- **Origen.** Las partidas salen de `medicion_calcular` (`nucleo/openrvt_nucleo/medicion.py`) y se agrupan igual:
  por clave PP, o por nombre si no hay clave, y por unidad. **No** se mide por otro camino: el total de una partida en
  el árbol es exactamente el `total` de `medicion_calcular`.
- **Método nuevo** `modelo.arbol_obra`. Devuelve:
  - **Capítulo:** nombre, orden y cuántas partidas tiene.
  - **Partida:** clave, nombre, unidad y total.
  - **Renglón:** elemento, GlobalId, descripción y resultado. Un elemento puede salir en varias partidas.
- **Capítulos por omisión**, en este orden: Preliminares, Cimentación, Estructura, Albañilería, Acabados, Cancelería e
  Instalaciones.
- **Asignación por omisión de cada partida**, según la clase (`_clase_medicion`) y el criterio:
  - zapata (todo criterio) y contratrabe → Cimentación;
  - losa, columna, castillo, trabe, dala y cerramiento → Estructura;
  - muro con criterio `area_nucleo` o `largo` → Albañilería;
  - muro con criterio `area_capa` → Acabados;
  - puerta y ventana → Cancelería;
  - genérico → Preliminares.
  - Preliminares e Instalaciones pueden quedar vacíos y se muestran con (0).
- **Guardado en el IFC:**
  - Los capítulos son un `IfcClassification` llamado «OPEN-RVT Obra».
  - Cada capítulo es un `IfcClassificationReference` con Identification «01», «02», … (el orden) y Name igual al
    nombre.
  - El capítulo de cada partida se guarda en su JSON de `OPENRVT_Medicion` como `"Capitulo": "<Identification>"`.
    Sin ese campo, la partida usa la asignación por omisión.
  - Guardar, cerrar y abrir conserva todo.

### Interfaz (panel «Proyecto» de O038)
- **Selector.** Arriba del árbol, un selector **Modelo | Obra**. Modelo es lo de O038, sin cambios.
- **Qué muestra cada nodo en Obra:**
  - Capítulo: «Cimentación (3)».
  - Partida: «CIM-010 Concreto en zapatas · 1.234 m³» (clave, nombre, total con 3 decimales y unidad).
  - Renglón: nombre corto del elemento y su resultado.
- **Selección con clic:**
  - en un renglón, selecciona el elemento en la vista;
  - en una partida, selecciona todos sus elementos;
  - en un capítulo, selecciona todos los elementos del capítulo.
- **Edición de capítulos.** Menú contextual con «Nuevo capítulo», «Renombrar», «Subir», «Bajar» y «Borrar». Al
  borrar, pide confirmación y sus partidas vuelven a su capítulo por omisión.
- **Mover partidas.** Arrastrar y soltar una partida en otro capítulo, o usar «Mover a capítulo…» del menú
  contextual.
- **Deshacer.** Cada cambio es un solo paso.
- **Refresco.** El árbol se refresca al crear, borrar, deshacer o cambiar un tipo, igual que en Modelo, sin perder lo
  expandido.
- En Obra no hay ojo ni candado.
- **Fuera de alcance:** la exportación a PresupuestosPro no cambia en esta tarea; ese contrato se coordina aparte.

## Archivos
- `src/features/modelo/ArbolProyecto.tsx` y `src/features/modelo/arbol.ts`.
- `nucleo/openrvt_nucleo/medicion.py`.
- El módulo donde está `modelo.arbol`.

## Pruebas obligatorias (valores a mano)

### pytest `nucleo/tests/test_o039.py`
Modelo de prueba:
- 4 muros Block 15 de 4 × 2.60 m, con aplanado en las dos caras;
- una losa de 4 × 4 × 0.10;
- una zapata;
- una puerta.

Comprueba:
- **Capítulos:** los siete, en su orden.
- **Partidas en su capítulo:**
  - block en Albañilería, con total = 4·4·2.60 = 41.60 m² menos el vano de la puerta (escribe el cálculo);
  - aplanado en Acabados;
  - concreto de losa en Estructura, 1.60 m³;
  - zapata en Cimentación;
  - puerta en Cancelería, 1 pza.
- **Totales:** cada uno es igual al de `medicion_calcular`.
- **Edición:**
  - mover una partida a otro capítulo;
  - renombrar, reordenar y borrar un capítulo.
- **Persistencia y deshacer:**
  - guardar y abrir el IFC conserva todo;
  - deshacer revierte cada cambio.

### vitest
- El selector Modelo | Obra.
- El formato de los nodos.
- Clic en una partida selecciona todos sus elementos.
- Arrastrar una partida a otro capítulo llama al comando correcto.

### E2E `e2e/o039.test.js`, con clics reales
1. Dibujar 2 muros, una losa y una puerta.
2. Abrir Proyecto → Obra y comprobar capítulos y totales.
3. Mover la partida de aplanado a Albañilería con el menú contextual.
4. Deshacer.
5. Crear el capítulo «Extras» y renombrarlo.
6. Guardar, cerrar, abrir y comprobar.
7. Capturas en `docs/progreso/O039/`, leídas como imagen.

### Comprobaciones finales
- `npx tsc --noEmit`.
- `npm run lint`.
- vitest `--maxWorkers=3`.
- pytest completo.
- Los E2E o038 y o039.

## Reglas
- Fines de línea:
  - `modelado.py` e `interacciones.py` conservan su fin de línea (CRLF);
  - `Visor3D.tsx` y `estado.ts` son CRLF y se quedan así.
- Sin push, merge, cambio de versión ni dependencias nuevas.
- Resumen en `docs/progreso/O039.md`.
