# O023: auditoría de «pulir lo que hay» con la app real

Origen: `ideas/2026-10-26-pulir-lo-que-hay.md` (quejas del usuario en 0.5.5). Varias se atendieron en O006–O016,
pero no hay una comprobación única de que TODAS sigan bien en 0.5.11.

## Parte 1: comprobar (docs/progreso/O023.md, tabla punto → estado → prueba)
Para cada punto 1, 3, 4, 5 y 6 de la lista (el 2 lo cubre O022) escribe un E2E en `e2e/o023.test.js` que lo
compruebe con la app real:
1. Esquinas de muros en L, en T y con espesores distintos: sin picos ni huecos (medida de la geometría: volumen
   de la unión = suma esperada a mano, sin caras que sobresalgan de la caja de la unión).
3. «Rango de vista (avanzado)» plegado por omisión.
4. Elevación de nivel acepta `.1`, `0.1`, `0,1`, `10cm`, `-3` y el error sale junto a la caja; la cota total
   dice «Total»; el orden de los globos de ejes en alzado sigue la orientación (Norte: de izquierda a derecha
   como se ve desde el norte).
5. Planta sin cotas sueltas que no pertenezcan a nada.
6. Cámara: hacer zoom, crear y editar 5 elementos (muro, nivel, eje, cota, propiedad) → la cámara no se movió,
   en planta, alzado y 3D.

## Parte 2: corregir
Lo que falle, corrígelo con su prueba vitest y que el E2E pase. Si algo es grande (más de un día), descríbelo en
«Pendientes» de docs/progreso/O023.md con propuesta y no lo hagas.

## Reglas
- NO toques `NavegadorVistas.tsx`, `PanelPropiedades.tsx`, `SidebarModulos.tsx` ni `PanelRedimensionable.tsx`
  (otro trabajador los está cambiando).
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o023`, `-j 3`. Capturas solo en `docs/progreso/O023/`.
- LF; commits por parte; sin push, merge, versión ni dependencias nuevas.
