# O022: mejorar los sidebars (navegador de vistas, propiedades y barra de módulos)

Pedido del usuario (31-oct): «mejora los sidebars». Archivos: `src/features/modelo/NavegadorVistas.tsx`,
`src/features/modelo/PanelPropiedades.tsx`, `src/app/SidebarModulos.tsx`, `src/app/PanelRedimensionable.tsx`.
Captura del estado actual: `docs/specs/O019-captura.png` (tema oscuro).

## Navegador de vistas (izquierda)
1. Grupos (Plantas, Alzados, Cortes, 3D, Cantidades) plegables con flecha y contador; estado recordado
   (localStorage con try/catch).
2. Buscador arriba que filtra vistas por nombre (sin distinguir acentos ni mayúsculas).
3. Icono por tipo de vista; la vista activa con marca clara.
4. Menú contextual (clic derecho) y doble clic: Abrir, Renombrar (en línea, Enter/Escape), Duplicar,
   Eliminar (con confirmación; no se puede eliminar la última de su tipo). Usa las acciones del estado que ya
   existan (`vistas.ts`, `estado.ts`); si falta alguna, agrégala con prueba.
5. Teclado: flechas para moverse, Enter abre, F2 renombra.

## Propiedades (derecha)
1. Secciones plegables (Identidad, Niveles visibles, Categorías visibles, Estilos de objeto, Gráficos) con estado
   recordado; «Todos / ninguno» en Niveles y Categorías.
2. La tabla «Estilos de objeto» hoy se corta y da scroll horizontal (ver captura): rehacerla en rejilla con
   encabezados «Proyección» y «Corte», unidad (mm), y que quepa en el ancho mínimo del panel.
3. Etiquetas y campos alineados con ancho consistente; filas de 28 px; tooltips en campos técnicos.
4. Sin scroll horizontal en ningún ancho ≥ el mínimo del panel.

## Barra de módulos (extremo izquierdo)
- Tooltips con atajo, estado activo claro, botón de plegar al fondo con el mismo estilo. Sin cambios de funciones.

## Reglas
- Respetar tema claro y oscuro (tokens existentes). No cambiar lógica del visor ni del modelo.
- Ancho de paneles recordado (`PanelRedimensionable`: verifica que ambos lados lo usen).

## Pruebas
- vitest: filtrado del buscador, plegado recordado, renombrar/duplicar/eliminar, tabla sin desborde a ancho mínimo.
- E2E `e2e/o022.test.js` con la app real: buscar «alzado», plegar «Plantas», renombrar, duplicar y eliminar con
  confirmación; medir `scrollWidth <= clientWidth` del panel derecho al ancho mínimo; capturas claro y oscuro
  antes/después en `docs/progreso/O022/`.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o022`, `-j 3`. Las capturas del E2E NO deben sobrescribir
  archivos versionados fuera de `docs/progreso/O022/`.
- LF; commits por parte; sin push, merge, versión ni dependencias nuevas.
