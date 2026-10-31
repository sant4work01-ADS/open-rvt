# O018: pellizco del touchpad captado desde Windows (nativo, Rust)

Datos reales (31-oct, laptop del usuario; OPEN-RVT 0.5.10):
- Touchpad ELAN Precision (`HID\ELAN07D2`), «pellizcar para zoom» activado en Windows (ZoomEnabled = 1).
- La grabación de O017b (10 s) NO registra ningún evento del pellizco: ni `wheel`, ni `pointer`, ni `touch`.
  Ctrl + dos dedos sí llega (`wheel` con `ctrlKey`, deltas enteros) y ya hace zoom.
- El usuario dice que el pellizco tampoco funciona fuera de la app. Hay que averiguar si Windows entrega algo
  a la ventana y, si lo entrega, convertirlo en zoom del visor.

## 1. Escucha nativa (src-tauri, solo `cfg(windows)`)
- Módulo nuevo `src-tauri/src/gestos_windows.rs`. Con `SetWindowSubclass` (comctl32) subclasifica la ventana
  principal (HWND de la `WebviewWindow` «main») Y las ventanas hijas de WebView2 (enuméralas con
  `EnumChildWindows`; vuelve a enumerar 2 s después de arrancar porque WebView2 las crea tarde).
- Registra (sin consumir, siempre `DefSubclassProc`) estos mensajes: `WM_GESTURE` (GID_ZOOM/GID_PAN con
  `GetGestureInfo`), `WM_POINTERDOWN/UPDATE/UP` (con `GetPointerType`: PT_TOUCHPAD/PT_TOUCH),
  `DM_POINTERHITTEST`, `WM_MOUSEWHEEL`/`WM_MOUSEHWHEEL` (con MK_CONTROL), `WM_TOUCH`.
- Cada mensaje se manda al frontend con un evento tauri `gesto-nativo`
  `{ ms, ventana: "principal"|"webview-hija", mensaje, detalle }` (detalle: para GID_ZOOM `ullArguments`
  = distancia entre dedos; para wheel el delta y si hay Control). Limita a 200 eventos/s.
- Llama `RegisterTouchWindow`/`SetGestureConfig` (GC_ZOOM habilitado) sobre la ventana principal para pedir
  `WM_GESTURE` de zoom.
- Dependencia: el crate `windows` en la MISMA versión que ya está en Cargo.lock (la que trae webview2-com),
  con las features justas (Win32_UI_Shell, Win32_UI_WindowsAndMessaging, Win32_UI_Input_Pointer,
  Win32_UI_Input_Touch, Win32_Foundation). Es la única dependencia permitida; no debe bajar crates nuevos.

## 2. Grabación (frontend)
- La grabación de O017b incluye los `gesto-nativo` como tipo `nativo:<mensaje>` en `eventos` y en el resumen
  (cantidad por mensaje y por ventana). Así un solo «Exportar»/«Copiar resumen» dice qué entrega Windows.

## 3. Zoom desde el gesto nativo
- `GID_ZOOM`: factor = distancia actual / distancia anterior del mismo gesto (GF_BEGIN reinicia), acotado
  [0.8, 1.25] por mensaje; se aplica al visor por la MISMA función de zoom que usa `alRodar` (extráela a una
  función `aplicarZoom(factor, puntoPantalla)` y úsala en ambos), centrado en el punto del gesto.
- `WM_POINTER*` de dos contactos PT_TOUCHPAD (si llegan y la rueda no): factor por cambio de distancia entre
  los dos contactos, mismo tope.
- Sin doble zoom: si en los 150 ms previos llegó un `wheel` con ctrlKey al visor, se ignora el nativo.
- Funciones puras con pruebas vitest: `factorGestoZoom(anterior, actual)` (100→110 = 1.1; 100→300 = 1.25;
  0 → 1) y el filtro de duplicados.

## 4. Documentar
- `docs/progreso/O018.md`: qué mensajes llegan en la máquina de desarrollo (es la misma laptop del usuario:
  corre la app y deja la grabación lista para que el supervisor pida al usuario pellizcar). Nota: el
  trabajador NO puede hacer gestos físicos; la prueba real la hace el usuario.

## Verificación
- `cargo clippy -j 3 -p open-rvt --all-targets -- -D warnings`, `npx tsc --noEmit`, `npm run lint`,
  vitest `--maxWorkers=3`.
- E2E `e2e/o018.test.js`: con un comando de prueba solo en debug `simular_gesto_nativo(tipo, valor)` que
  inyecta el evento `gesto-nativo` como si viniera de Windows → GID_ZOOM 100→120 acerca (escala ×1/1.2 según
  convención del visor) y aparece en el resumen de grabación.
  (`herramientas/preparar_python.sh windows` antes; `OPENRVT_E2E_BINARIO` como `C:/...`;
  `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-o018`, `-j 3`.)
- LF (cuenta CRLF con Python, no con grep); commits por parte; sin push, merge ni versión.

## Corrección del dato (31-oct 01:30)
El usuario corrigió: el pellizco SÍ funciona en el Explorador de Windows y en Brave (Chromium). El fallo es
propio de la ventana Tauri/WebView2 de OPEN-RVT. Además de la escucha nativa (que dirá si el mensaje llega al
HWND principal o a la hija de WebView2), prueba y documenta en O018.md, uno por uno y con la grabación:
1. `IsPinchZoomEnabled` en true (como estaba en 0.5.9) con `alRodar` haciendo `preventDefault`: Chromium
   debería mandar el pellizco como `wheel` con `ctrlKey` a la página.
2. Revisa en `src-tauri` y `tauri.conf.json` todo lo que toque la ventana o el webview (`additionalBrowserArgs`,
   `zoomHotkeysEnabled`, `dragDropEnabled`, decoraciones propias/`decorations: false` con región de arrastre,
   transparencia) y anota cuál puede interceptar el gesto (p. ej. una capa de arrastre encima del visor o el
   IDropTarget de arrastrar archivos). Prueba quitarlo de uno en uno.
Elige la corrección mínima que haga que el pellizco llegue como `wheel` con ctrlKey; el zoom nativo de la parte 3
queda solo si ninguna de estas basta.
