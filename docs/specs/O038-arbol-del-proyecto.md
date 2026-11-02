# O038: árbol del proyecto (modelo por capas y obra por partidas)

Pedido del usuario (2-nov): un árbol donde se organicen los elementos del proyecto, como el explorador de archivos de
VS Code, el árbol de un presupuesto o el administrador de capas de AutoCAD. Que los elementos IFC queden ordenados como
se divide una obra en partidas.

## Idea clave
Un presupuesto no es un elemento por renglón. Un muro aparece en varias partidas: block, aplanado y pintura (las
partidas de medición de O009). Por eso el árbol tiene **dos modos**, que se eligen con un selector arriba del panel:

- **Modelo**, para organizar y controlar visibilidad como las capas de AutoCAD: cada elemento está una sola vez.
- **Obra**, que es el árbol del presupuesto: capítulo, luego partida, luego los elementos que aportan cantidad. Un
  elemento puede aparecer en varias partidas.

## Fase 1 — panel y modo Modelo (esta tarea)
1. **Panel «Proyecto».**
   - Botón nuevo en la barra lateral izquierda (icono de árbol, título «Proyecto»), junto al de Vistas.
   - Tiene búsqueda por nombre, tipo o GlobalId; la búsqueda filtra y expande las ramas.
   - Usa el mismo estilo de lista que `NavegadorVistas.tsx`.
2. **Jerarquía del modo Modelo.** Cada nodo muestra su conteo entre paréntesis.
   - Edificio → Nivel (ordenado por elevación) → Categoría → Tipo → Elemento.
   - Categorías: Muros, Losas, Columnas, Castillos, Trabes, Dalas y cerramientos, Zapatas, Contratrabes, Puertas,
     Ventanas, Ejes y Niveles.
   - Los ejes y niveles van en su propia rama «Referencias», fuera de los niveles.
3. **Por nodo, igual que las capas de AutoCAD:**
   - **Ojo (visible/oculto).** Oculta el nodo y todo lo que cuelga de él.
   - **Candado (bloqueado).** Lo bloqueado se ve, pero no se puede seleccionar ni editar en ninguna vista.
   - **Aislar.** Menú contextual con «Aislar» (solo eso visible) y «Mostrar todo».
   - El estado de ojo y candado se guarda **por vista**, en la configuración de la vista, y se respeta en planta,
     alzado, corte, 3D y en la exportación a PDF futura.
   - Un nodo padre con hijos mezclados muestra un estado intermedio.
4. **Selección sincronizada.**
   - Clic en un elemento: lo selecciona en la vista y en Propiedades.
   - Clic en un tipo, categoría o nivel: selecciona todos sus elementos (multiselección).
   - Seleccionar en la vista expande el árbol hasta el elemento, lo resalta y lo lleva a la vista visible.
   - Doble clic: hace zoom al elemento («Ajustar» a la selección).
5. **Actualización en vivo.** Crear, borrar, deshacer o cambiar el tipo o el nivel refresca el árbol sin perder lo
   expandido ni la posición. Debe ser fluido con 2000 elementos: virtualiza la lista si hace falta, sin dependencias
   nuevas si se puede.
6. **Datos.** Un método del núcleo `modelo.arbol` devuelve la jerarquía ya agrupada. No armes el árbol con N
   llamadas.

## Fase 2 — modo Obra (siguiente tarea, O039; no la hagas aquí)
- Jerarquía: Capítulo → Partida (de `OPENRVT_Medicion`, con clave PP, unidad y total) → Elemento con su cantidad.
- Capítulos por omisión según la clase y el criterio:
  - Preliminares;
  - Cimentación: excavación, plantilla, zapatas y contratrabes;
  - Estructura;
  - Albañilería;
  - Acabados: capas de acabado;
  - Cancelería: puertas y ventanas;
  - Instalaciones.
- El usuario puede crear, renombrar y reordenar capítulos y arrastrar partidas entre ellos.
- Se guardan en el IFC como `IfcClassification` «OPEN-RVT Obra» con `IfcClassificationReference` (estándar, lo leen
  otros programas).
- La exportación a PP agrupa por capítulo, coordinada con PP antes de cambiar el contrato de O009/089.

## Pruebas (fase 1)
- **pytest de `modelo.arbol`.**
  - Con un modelo de 2 niveles, 4 muros, losa, columna, zapata, puerta y 2 ejes, los conteos esperados se escriben a
    mano en la prueba.
  - Tras borrar, cambiar de nivel y deshacer, el árbol cambia como corresponde.
- **vitest:**
  - El ojo de un padre oculta a todos sus hijos.
  - El estado intermedio aparece cuando los hijos están mezclados.
  - Lo bloqueado no se puede seleccionar.
  - La selección de un tipo selecciona todos sus elementos.
  - La búsqueda filtra y expande.
  - El estado se guarda por vista: ocultar en Planta Nivel 0 no oculta en 3D.
- **E2E `e2e/o038.test.js`:**
  1. Ocultar Muros en Planta Nivel 0: ningún muro se dibuja en planta, y en 3D sí aparecen.
  2. Aislar una zapata.
  3. Bloquear Losas: un clic sobre la losa no la selecciona.
  4. Seleccionar en la vista expande el árbol.
  5. Capturas en `docs/progreso/O038/`, leídas como imagen.
- **Comprobaciones finales:**
  - `npx tsc --noEmit`;
  - `npm run lint`;
  - vitest `--maxWorkers=3`;
  - pytest del núcleo.
- **Reglas:**
  - `modelado.py` es CRLF.
  - Sin push, merge, cambio de versión ni dependencias nuevas.
  - Resumen en `docs/progreso/O038.md`.
