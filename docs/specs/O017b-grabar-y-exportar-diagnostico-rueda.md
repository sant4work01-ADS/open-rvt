# O017b: grabar y exportar el diagnóstico de rueda/touchpad (y por qué Ctrl + dos dedos no hace zoom)

Va en la MISMA rama que O017 (o017), después de terminar O017. Reporte del usuario (31-oct, laptop Windows,
panel Ctrl+Shift+D):
- El panel registra demasiados eventos: «una lista interminable»; una captura no sirve.
- **Pellizco: no se registra NINGÚN evento.**
- **Ctrl + dos dedos: el panel lo clasifica como «zoom», pero la vista NO cambia.**
- Dos dedos vertical/horizontal: se registran como paneo y sí panean.

## 1. Grabación con resumen (src/lib/rueda.ts, función pura + pruebas vitest)
- Botón «Grabar 10 s» en el panel. Durante la grabación se registran, en fase de captura sobre el nodo del visor
  y sobre `window`: `wheel`, `pointerdown/move/up` (con `pointerType`), `touchstart/move/end` (número de
  toques) y `keydown`/`keyup` de Control. Tope 5000 eventos.
- Por cada `wheel` clasificado como zoom, guardar la escala de la cámara ANTES y DESPUÉS de `alRodar`
  (ortográfica: `top - bottom`; perspectiva: `nav.distancia`) y el factor aplicado. Así se ve si el zoom
  «se registra pero no se aplica».
- Función pura `resumirGrabacion(eventos)` → por tipo de evento y por acción: cantidad, % con ctrlKey,
  deltaMode, deltaY mín/máx/media, % de deltas fraccionarios, intervalo medio en ms, y para zoom:
  producto de factores y escala inicial/final. Pruebas con eventos sintéticos (valores calculados a mano en el
  comentario de la prueba).

## 2. Panel: resumen en vez de lista interminable
- El panel muestra el resumen (tabla de pocas filas) y, plegados, solo los últimos 20 eventos.

## 3. Exportar
- Botón «Exportar…»: guarda un JSON con `{ version_app, fecha, userAgent, devicePixelRatio, preferencia_rueda,
  dispositivo_detectado, ajustes_webview, resumen, eventos }` usando `src/lib/dialogos.ts` (añade el tipo
  `"guardar-diagnostico"` con filtro .json y la costura `__PP_DIALOGO_PRUEBAS__` para E2E). Nombre sugerido
  `diagnostico-rueda-AAAAMMDD-HHMM.json`.
- Botón «Copiar resumen»: solo el resumen como texto (para pegarlo en el chat).
- `ajustes_webview`: comando tauri nuevo `diagnostico_webview()` que lee de WebView2 `IsZoomControlEnabled`,
  `IsPinchZoomEnabled` (ICoreWebView2Settings5) y `AreBrowserAcceleratorKeysEnabled`; en otros SO devuelve null.

## 4. Corregir «Ctrl + dos dedos clasifica zoom pero no hace zoom»
- Reprodúcelo en E2E: en planta, 20 `wheel` con `ctrlKey: true` y deltaY típicos de touchpad (0.5, 1.25, 2,
  -3.75, fraccionarios y pequeños) → la escala de la cámara debe cambiar ≥ 10 % y en el sentido correcto.
  Repite en 3D perspectiva.
- Si no cambia, busca la causa real (factor casi 1, algo que restaura la cámara después —
  `guardarCamaraActual`/restaurar cámara guardada, ~1315—, `alRodar` con cierre viejo, o un listener que
  hace `stopPropagation`) y corrígela. Documenta la causa en `docs/progreso/O017.md`.

## 5. Pellizco que no llega
- Con `SetIsPinchZoomEnabled(false)` de O017, Chromium debería entregar el pellizco como `wheel` con
  `ctrlKey`. Verifica en la grabación que con O017 los eventos `pointer`/`touch`/`wheel` del pellizco aparecen.
  Si siguen sin llegar, prueba además `SetIsSwipeNavigationEnabled(false)` (ICoreWebView2Settings6) y anota el
  resultado; no inventes más cambios.

## Verificación
- vitest (`--maxWorkers=3`), `npx tsc --noEmit`, `npm run lint`, `cargo clippy -j 3` del src-tauri.
- E2E `e2e/o017.test.js` ampliado: punto 4 + grabar 2 s, exportar con la costura y comprobar que el JSON tiene
  `resumen` y `ajustes_webview`. (`herramientas/preparar_python.sh windows` antes; `OPENRVT_E2E_BINARIO` como
  `C:/...`; `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o017`, `-j 3`.)
- LF; commits por parte; sin push, merge, versión ni dependencias nuevas.
