# O017: zoom con touchpad en Windows (nunca ha funcionado)

Reporte del usuario (30-oct, laptop Windows): «nunca ha funcionado el zoom en touchpad». Hoy, en modo touchpad,
dos dedos = paneo y el pellizco debería ser zoom (`src/lib/rueda.ts`: `ctrlKey` → «zoom»; `factorRueda` =
1.0018^deltaY), pero el pellizco no llega o no hace nada.

## Causas probables (verificar y documentar en `docs/progreso/O017.md`)
1. `src-tauri/src/lib.rs` `configurar_webview2` apaga `IsZoomControlEnabled` pero NO `IsPinchZoomEnabled`
   (`ICoreWebView2Settings5`): WebView2 puede quedarse el pellizco del touchpad para su zoom visual.
2. El pellizco manda `deltaY` pequeño (±1–10) por evento: con 1.0018^deltaY el cambio es casi nulo.

## Cambios
1. `configurar_webview2`: `SetIsPinchZoomEnabled(false)` vía `ICoreWebView2Settings5` (con `cast`, sin romper si la
   interfaz no existe). Solo en OPEN-RVT.
2. Zoom por pellizco (`ctrlKey` con delta fraccionario o pequeño, o dispositivo touchpad): factor más sensible,
   p. ej. `Math.pow(1.01, deltaY)` acotado a [0.8, 1.25] por evento. Función pura `factorPellizco` con pruebas
   (deltaY 0 → 1; 5 → ≈1.051; −5 → ≈0.951; 200 → 1.25).
3. Respaldo que funciona con CUALQUIER touchpad: botones «+», «−» y «Ajustar» flotantes en la esquina del visor
   (zoom centrado en el centro de la vista), y teclas `+`/`=` y `-` cuando el foco está en el visor. Pruebas vitest.
4. Diagnóstico: el panel «Diagnóstico de rueda/touchpad» gana un botón «Copiar» que pone los últimos 50 eventos
   en el portapapeles (para que el usuario los pegue). Prueba vitest.
5. Ayuda de touchpad (la tarjeta que ya existe): «Pellizca para zoom · Ctrl + dos dedos también hace zoom ·
   botones +/− abajo a la derecha».

## Verificación
- vitest (`--maxWorkers=3`), `npx tsc --noEmit`, `npm run lint`, `cargo clippy -j 3` del src-tauri.
- E2E `e2e/o017.test.js`: en planta, simular `wheel` con `ctrlKey: true, deltaY: -5` ×10 → la escala de la cámara baja
  (acerca); clic en «+» acerca, «−» aleja; tecla `+` acerca. (Ruta del binario con `OPENRVT_E2E_BINARIO` en formato
  `C:/...`; corre antes `herramientas/preparar_python.sh windows`; `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o017`, `-j 3`.)
- LF; commits por parte; sin push, merge, versión ni dependencias nuevas (webview2-com ya está).
