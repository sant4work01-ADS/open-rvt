# O027: pulir los nodos (asas) de ejes y niveles: movimiento restringido y completo

Reporte del usuario (31-oct, 0.5.12): «el sistema de nodos de los ejes funciona pero no bien; el movimiento está
libre, debería estar restringido a vertical y horizontal; está incompleto, le falta pulir». Base: O021 (asas,
candado, codos, `AjusteEjeVista`) y O014b (cabezas de nivel). Referencia de comportamiento: grips de Revit.
Referencia visual del codo: el primer eje de `ideas/img/niveles-referencia.jpg`.

## Restricciones de movimiento (la regla principal)
1. **Asa de extremo**: solo se mueve A LO LARGO de su eje (alarga/acorta). Nunca de lado.
2. **Asa de codo / globo desplazado**: el globo solo se mueve PERPENDICULAR al eje (en un eje vertical, solo en
   horizontal) manteniendo su altura; la guía va del punto sobre la línea al globo como en la referencia.
   Segunda asa del codo: el punto de quiebre solo se mueve a lo largo del eje.
3. **Cabeza de nivel** (alzado/corte): igual: el triángulo/texto solo se desplaza en vertical; el extremo de
   la línea del nivel solo en horizontal.
4. Shift durante el arrastre = libre (para casos raros). Escape cancela y devuelve todo a como estaba.
5. Funciones puras con pruebas: `restringirArrastre(tipoAsa, direccionEje, delta)`.

## Lo que falta pulir (hazlo todo y anótalo en docs/progreso/O027.md)
- Asas de tamaño constante en pantalla (px, no metros), resaltado al pasar el cursor, cursor que indica la
  dirección permitida (↔ / ↕), umbral de 3 px antes de empezar el arrastre.
- **Imanes**: al arrastrar un extremo, se engancha a la alineación de los extremos de los otros ejes paralelos y
  a los niveles (en alzado); al arrastrar un globo desplazado, se engancha a múltiplos de 1 diámetro. Línea guía
  temporal cuando hay enganche.
- **Cota temporal** durante el arrastre (distancia del extremo al eje vecino o del globo a su posición original).
- El candado de alineación se ve junto a la fila de extremos alineados (uno por grupo, no por eje) y su estado es
  claro (cerrado/abierto).
- Al soltar, un solo paso de Deshacer.
- Revisa con la app y anota cualquier otro detalle tosco que veas en las asas (parpadeo, asas que quedan
  dibujadas tras deseleccionar, selección difícil por estar encimadas) y corrígelo.

## Pruebas
- vitest: `restringirArrastre` (extremo de eje vertical con delta (3, 5) → (0, 5); globo de eje vertical con
  delta (3, 5) → (3, 0); con Shift → (3, 5)); imanes; Escape restaura.
- E2E `e2e/o027.test.js` con la app real: arrastrar en diagonal el extremo de un eje vertical → solo cambia su
  largo (x igual al milímetro); arrastrar el globo con codo en diagonal → solo se mueve en horizontal; cabeza de
  nivel en alzado → solo vertical; Shift → libre; Escape → sin cambios; Deshacer en un paso. Capturas en
  `docs/progreso/O027/`.
- NO toques `estilos.ts`, `DialogoEstilos.tsx`, `DialogoCotas.tsx` ni las funciones que DIBUJAN niveles, ejes y
  cotas (otro trabajador las rehace en O024/O025); trabaja en asas, arrastre y restricciones.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o027`, `-j 3`.
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni
  dependencias nuevas.
