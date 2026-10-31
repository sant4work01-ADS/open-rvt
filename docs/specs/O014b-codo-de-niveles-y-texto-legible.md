# O014b: codo articulado de niveles y burbujas, y texto siempre legible

Segunda parte de `ideas/niveles-estilo-cotas.md` (lee la sección «Articulación (codo)», «Ejes» y
«Fallo visto al revisar O015»; mira `ideas/img/niveles-referencia.jpg`). O014a ya dejó la cabeza
«▼ Npt +2.20m», el estilo `EstiloNivel` y las cotas (cadena + total): no los rehagas.

Código: `src/features/modelo/Visor3D.tsx` (zona de niveles en alzados/cortes, ~2480–2700),
`src/features/modelo/niveles.ts`, `src/features/modelo/ejesVista.ts` (codos de ejes: `agregarCodoEje`,
`geometriaEje`, ya existen para planta; reutiliza la idea, no la copies).

## 1. Texto legible en cualquier dirección (fallo actual)
En el corte con dirección (0, 1) los textos de niveles y cotas salen en espejo («00.E+ I leviN»,
`docs/capturas/o015-antes-corte.png`). Regla: todo texto de anotación se lee de izquierda a derecha y
de abajo hacia arriba en pantalla, sea cual sea la dirección de la vista.
- Corrige la orientación (`orientarAnotacion` u otra) con una función pura testeable que, dada la
  dirección de la vista, devuelva la base del texto; pruebas con (0,1), (0,-1), (1,0), (-1,0) y (1,1)/√2:
  el eje X del texto proyectado a pantalla apunta a +X de pantalla.
- E2E: corte con dirección (0,1): la cabeza dice «Npt +3.00m» legible (lee el texto del DOM/atributo de
  prueba y verifica con la captura que no está espejado: el centro del triángulo queda a la IZQUIERDA del texto).

## 2. Codo de la cabeza de nivel
- Cuando dos niveles están tan cerca que sus cabezas (triángulo + texto + nombre) se enciman en pantalla
  (p. ej. +2.00 y +2.20 a 1:100), la cabeza del nivel de arriba sube con una guía quebrada: tramo horizontal
  desde la línea del nivel 3 mm, diagonal hasta la altura libre, horizontal 3 mm y la cabeza. Función pura
  `acomodarCabezas(niveles: {elev, altoCabezaMundo}[], separacionMin) → desplazamientos` con pruebas:
  dos niveles a 0.20 m con cabeza de 0.35 m → el de arriba sube ≥ 0.15 m; separados 3.00 m → sin desplazamiento;
  tres niveles 0.00/0.10/0.20 → ninguno se encima y el orden vertical se conserva.
- El desplazamiento manual se guarda por vista (como `AjusteEjeVista`), con grip para arrastrarlo; doble clic
  en el grip lo devuelve a automático.

## 3. Codo de burbujas de ejes en alzados/cortes
Si dos burbujas de eje se enciman en un alzado (ejes a menos de un diámetro de burbuja en pantalla), la de la
derecha se desplaza con codo, igual que en planta. Prueba pura del acomodo y captura en E2E.

## Verificación y reglas
- vitest (`--maxWorkers=3`), `npx tsc --noEmit`, `npm run lint`, E2E nuevo `e2e/o014b.test.js` con capturas
  `docs/capturas/o014b-*.png` (corte (0,1) legible; niveles +2.00/+2.20 sin encimarse; ejes juntos con codo).
- Para el E2E usa `OPENRVT_E2E_BINARIO` con ruta `C:/...` y `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o014b`, `-j 3`.
- Archivos de texto con finales de línea LF (no CRLF).
- Commits en español por parte; progreso en `docs/progreso/O014b.md`. Sin push, merge, versión ni dependencias.
