# O021: editar el acomodo de los ejes para que se vean bien

Pedido del usuario (31-oct): «se necesita poder editar el acomodo de los ejes para verse bien». Ya existe
`AjusteEjeVista` (`tipos.ts:35`: extremos libres y codos por vista, `ejesVista.ts`) pero en la práctica no es
cómodo ni completo. Referencia de comportamiento: la edición de ejes de Revit (sin copiar su interfaz).

## Parte 0: auditoría (docs/progreso/O021.md)
Lista qué se puede hacer HOY con un eje seleccionado en planta y alzado (arrastrar extremo, codo, restablecer) y
qué falla. Corrige primero lo que esté roto.

## Parte 1: asas claras al seleccionar un eje (planta, alzado y corte)
- Al seleccionar un eje se ven: asa circular en cada extremo, asa de codo junto a cada globo, casilla para
  mostrar/ocultar el globo de cada extremo y un candado de alineación.
- Arrastrar un extremo con el candado cerrado mueve juntos los extremos alineados de los demás ejes paralelos
  (misma alineación común); con el candado abierto, solo ese eje (se guarda en `extremoInicio/extremoFin`).
- Arrastrar el asa de codo crea el codo (desplaza el globo de lado con una quiebra), como O014b con los niveles.
- Doble clic en un asa = devolver ese extremo a automático.

## Parte 2: globo por extremo y propagación
- `AjusteEjeVista` gana `globoInicio?: boolean` y `globoFin?: boolean` (por omisión: como hoy). Se guarda por vista.
- Menú contextual del eje: «Mostrar globo en ambos extremos», «Ocultar globo inicio/fin», «Restablecer acomodo
  de este eje», «Restablecer todos los ejes de la vista», «Copiar acomodo a otras vistas…» (diálogo con
  casillas de las vistas del mismo tipo; copia extremos, codos y globos).
- Propiedades del eje (panel derecho) muestran y editan lo mismo: globo inicio/fin y «extremos en automático».

## Parte 3: acomodo automático mejor
- Si dos globos se enciman, el codo automático ya existe (O014b); verifica que también aplica en alzado/corte y
  que el texto del globo queda centrado (ver ideas/niveles-estilo-cotas.md, «Centrado del texto»: desviación
  ≤ 0.5 px con 1, 2 o 3 caracteres, prueba con medida).

## Pruebas
- vitest de funciones puras: mover extremo con candado (todos los alineados se mueven igual) y sin candado
  (solo uno); globo oculto no se dibuja; copiar acomodo a otra vista; restablecer.
- E2E `e2e/o021.test.js` con la app real: 3 ejes paralelos en planta → arrastrar extremo con candado → los 3
  cambian; abrir candado → solo uno; ocultar globo de un extremo; crear codo; copiar a otra planta y
  comprobar; capturas antes/después en `docs/progreso/O021/`.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o021`, `-j 3`. Las capturas del E2E NO deben sobrescribir
  archivos versionados fuera de `docs/progreso/O021/`.
- LF; commits por parte; sin push, merge, versión ni dependencias nuevas.
