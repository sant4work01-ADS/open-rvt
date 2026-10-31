# O025: niveles, ejes y cotas en alzado/corte dibujados como la referencia

Requiere O024 (estilos). Referencia: `ideas/img/niveles-referencia.jpg`. Hoy (MAL):
`docs/progreso/O021b/o021b-alzado-niveles-cotas.png`: triángulos diminutos, textos encimados («Npt +0.10m» sobre
«Nivel 2»), nombre del nivel que nadie pidió, línea a trazos y no trazo-punto, cotas con texto que choca con
las líneas, globos de eje pegados al último nivel.

## Debe quedar así (con el estilo por omisión)
1. Línea de nivel trazo-punto de lado a lado; cabeza a la derecha: triángulo relleno invertido apoyado en la
   línea y el texto «Npt +2.20m» a su derecha, a la altura de la cabeza (no encima ni tachado).
2. Niveles juntos (0.20 m a 1:100): las cabezas se separan con codo (línea guía quebrada con punto en la línea
   del nivel), una hacia arriba y otra hacia abajo, como +2.20 y +2.00 de la referencia. Nunca se enciman
   textos ni triángulos.
3. Cotas a la derecha, entre el último eje y las cabezas: cadena entre niveles consecutivos y la total en otra
   fila más afuera. Flechas rellenas en la línea de extensión; texto paralelo a la línea de cota, del lado
   izquierdo de ella y centrado en el tramo (como 0.50, 1.00 de la referencia); en tramos que no caben (0.20)
   las flechas van por fuera apuntando hacia adentro y el texto al lado, sin chocar.
4. Ejes: línea trazo-punto, globo circular arriba con el número/letra centrado; el globo queda a la
   «separación sobre el último nivel» del estilo (O024) por encima del nivel más alto visible; si dos globos se
   enciman, codo como el primer eje de la referencia.
5. Todo escala con la vista: a 1:50 el texto mide lo mismo en papel. Mismo resultado en alzado y corte, sin
   espejo (O015).

## Pruebas
- vitest de funciones de colocación (cajas): con los 5 niveles de la referencia y 4 ejes, ninguna caja de
  texto o símbolo intersecta otra ni ninguna línea que no le pertenece; la total = suma de la cadena; el globo
  más bajo está exactamente a la separación configurada sobre el último nivel.
- E2E `e2e/o025.test.js` con la app real: crea los niveles 0.00, 0.50, 1.50, 2.00, 2.20 y 4 ejes, abre Alzado
  Norte, mide cajas reales (sin encimes), cambia en el editor la separación del globo a 20 mm y comprueba que se
  movió; cambia el remate de cota a tick y comprueba. Capturas en `docs/progreso/O025/` (`alzado-referencia.png`
  con fondo oscuro y claro) — deben parecerse a la referencia a simple vista; describe en
  `docs/progreso/O025.md` en qué difiere todavía.
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`. Binario E2E con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o024`, `-j 3`. Capturas solo en `docs/progreso/O025/`.
- LF; NO cambies fines de línea de archivos existentes. Commits por parte; sin push, merge, versión ni
  dependencias nuevas.
