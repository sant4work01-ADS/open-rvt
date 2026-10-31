# O019: faltan aristas verticales en la vista 3D

Reporte del usuario (31-oct, 0.5.10, captura `docs/specs/O019-captura.png`): en «3D Perspectiva» (estilo
Sombreado, modelo de 4 muros sobre una losa) NO se dibujan las aristas verticales: esquinas de los muros (azul)
ni las esquinas de canto de la losa (verde). Las aristas horizontales sí salen.

## Sospechas (confirmar con datos en `docs/progreso/O019.md`)
1. `aristasInternasUniones` (`src/features/modelo/geometria.ts:329`) borra la arista vertical de la esquina
   porque cae sobre la cara de extremo del muro unido (mismo grupo de material). Una arista que es silueta de la
   UNIÓN (esquina exterior, ángulo ≠ 0 entre las caras de ambos muros) no es interna.
2. Uniones en T / vértices sin soldar en la malla (cara lateral partida) → la arista vertical aparece dividida o
   con una sola normal mal calculada.
3. Losa: revisar por qué sus aristas de canto no salen (¿mismo grupo de material que muros? ¿grosor de línea?).

## Cambio
- Criterio correcto: una arista se omite SOLO si, juntando las caras de ambos elementos que la tocan, no hay
  quiebre ≥ umbral (es decir, las caras son coplanares y la arista queda dentro de una superficie continua).
  Las esquinas exteriores e interiores de muros unidos SÍ se dibujan. Se conserva lo de O012 (extremo de viga
  dentro de la cara de columna no se dibuja).
- No tocar estilos de grosor salvo que la causa sea esa.

## Pruebas
- vitest en geometria: (a) dos muros en L unidos → 2 aristas verticales de esquina (exterior e interior) presentes;
  (b) caja de 4 muros → 8 verticales; (c) losa sola → 4 aristas de canto verticales; (d) caso O012 de viga en
  columna sigue sin la arista interna.
- E2E `e2e/o019.test.js`: modelo de 4 muros + losa, vista 3D Perspectiva, contar segmentos verticales del
  LineSegments de aristas (exponer un conteo de depuración si hace falta) ≥ 12; captura en `docs/progreso/O019/`.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o019`, `-j 3`.
- LF; commits por parte; sin push, merge, versión ni dependencias nuevas.
