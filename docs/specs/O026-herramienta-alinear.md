# O026: herramienta «Alinear» (como AL de Revit) con candado

Pedido del usuario (31-oct): sistema para alinear los elementos. Hoy no existe (grep «alinear» en src no da nada).

## Comportamiento
1. Ribbon «Modelar» → MODIFICAR → «Alinear» (atajo `AL`, escribir A y L seguidas con el foco en el visor).
2. Paso 1: clic en la **referencia**: eje, nivel (en alzado/corte), cara o eje central de muro, borde de losa,
   cara de columna/viga. Se resalta con línea azul punteada.
3. Paso 2: clic en la **cara/borde del elemento a mover** (paralelo a la referencia): el elemento se traslada
   en perpendicular hasta coincidir. Si no son paralelos, aviso junto al cursor y no se mueve nada.
4. Tras alinear aparece un **candado** abierto junto a la alineación; al cerrarlo, la restricción se guarda
   (pset `OPENRVT_Restricciones`, como O016) y al mover la referencia el elemento la sigue (muro alineado a un
   eje se mueve con el eje). Clic de nuevo abre el candado (quita la restricción).
5. Varias seguidas: tras alinear, sigue activa la misma referencia para alinear más elementos (Ctrl al elegir
   la referencia = alineación múltiple, como Revit); Escape termina.
6. Planta: muros, columnas, vigas, losas (bordes), zapatas. Alzado/corte: niveles como referencia para la base o
   el tope (equivale a la restricción de O016) y caras horizontales.
7. Deshacer revierte cada alineación en un paso. Cotas y uniones de muros se actualizan.

## Núcleo
- Comando del núcleo Python (`nucleo/openrvt_nucleo/modelado.py`, junto a `_mover_productos`) `alinear(referencia,
  elemento, cara, bloquear)` y la propagación al mover una referencia bloqueada; pruebas en
  `nucleo/tests/test_o026.py` con valores calculados a mano (muro de 0.15 alineado por su cara a un eje en x=3 →
  eje del muro en x=3.075; columna 0.30 por su cara → centro a 0.15 del eje; mover el eje 1 m con candado →
  ambos se mueven 1 m; sin candado → no).

## Pruebas
- vitest de la detección de referencias y paralelismo; pytest del núcleo.
- E2E `e2e/o026.test.js`: en planta, 1 eje y 2 muros; Alinear la cara de un muro al eje (posición medida),
  cerrar candado, mover el eje → el muro lo sigue; el otro muro sin candado no se mueve. Captura en
  `docs/progreso/O026/`.
- No toques el dibujo de niveles/cotas ni `estilos.ts` (otro trabajador los rehace).
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`, pytest del núcleo con el venv de
  `herramientas/preparar_python.sh windows`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o026`, `-j 3`.
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni
  dependencias nuevas.
