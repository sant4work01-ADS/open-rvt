# O020: no se puede orbitar en 3D (laptop con touchpad)

Reporte del usuario (31-oct, 0.5.10, laptop Windows con touchpad ELAN, sin botón medio): «no puedo orbitar».
Hoy (`src/features/modelo/Visor3D.tsx`): órbita SOLO con arrastre del botón medio (~4355, `panear = … arr.boton === 0`)
o con Shift + dos dedos (~3836) pero únicamente si `dispositivo === "touchpad"`; si `src/lib/rueda.ts` detecta
«raton» (el ELAN manda deltas enteros), Shift + dos dedos solo panea en horizontal (`rueda.ts:206`).

## Cambios (solo vistas 3D: iso y perspectiva)
1. Shift + dos dedos / Shift + rueda horizontal orbita en 3D sin importar el dispositivo detectado
   (en planta/alzado sigue siendo paneo horizontal).
2. Arrastre con botón DERECHO = órbita (sin menú contextual del navegador en el visor 3D). Shift + arrastre
   izquierdo también orbita. Botón medio queda igual.
3. Botón «Orbitar» (conmutador) junto a «+ − Ajustar»: activo → arrastre izquierdo orbita en vez de panear.
   Recordado en localStorage (try/catch).
4. Ayuda de touchpad: «Shift + dos dedos o arrastre con botón derecho = orbitar; botón Orbitar para usar un dedo».
5. Lógica de decisión en función pura (p. ej. `accionArrastre({boton, shift, modoOrbitar, es3d})`) con vitest.

## Verificación
- vitest `--maxWorkers=3`, `npx tsc --noEmit`, `npm run lint`.
- E2E `e2e/o020.test.js` en 3D Perspectiva: (a) wheel con `shiftKey` y deltas enteros → cambia la dirección de la
  cámara; (b) arrastre botón derecho → cambia la dirección; (c) con «Orbitar» activo, arrastre izquierdo → cambia
  la dirección; (d) en planta, Shift + rueda sigue paneando. Binario con `OPENRVT_E2E_BINARIO` en `C:/...`,
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o020`, `-j 3`.
- `docs/progreso/O020.md`. LF; commits por parte; sin push, merge, versión ni dependencias nuevas.
