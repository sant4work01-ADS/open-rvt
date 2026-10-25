# O002 — Esqueleto de la app de OPEN-RVT copiado de PresupuestosPro

## Objetivo
Crear la app de escritorio de OPEN-RVT (Tauri 2 + Rust + React + TypeScript, para Windows y Linux) **copiando de PresupuestosPro (PP) la estructura de la interfaz y la infraestructura**. Lo que se copia queda **lo más intacto posible**: mismos nombres de archivo, mismas rutas, mismos componentes y mismo estilo. Así, un cambio de interfaz en un programa se puede llevar al otro con un diff.

- **No hay editor todavía:** el área de trabajo queda vacía y lista para la siguiente tarea.
- **Sin asistente de IA:** va a futuro.

**Fuente:** `/home/sant4/pp-trabajo/presupuestos-pro`, rama master, commit `fd60cde`. **Solo se lee; no se modifica nada en PP.**

## Regla de copia (lo más importante)
1. **Copia, no reescribas.**
   - Un archivo copiado conserva su ruta relativa (`src/app/BarraTitulo.tsx` → `src/app/BarraTitulo.tsx`), su nombre y su código.
   - Solo cambia lo que **tiene** que cambiar:
     - imports de módulos de PP que no se copian;
     - entradas de menú o comandos propios de presupuestos;
     - el nombre del producto.
2. Cada cambio a un archivo copiado lleva un comentario de una línea `// OPEN-RVT: <motivo>` justo encima, para encontrarlo al sincronizar.
3. **`docs/origen-pp.md`:** una tabla con cada archivo copiado, su commit de origen (`fd60cde`) y su estado (`intacto` o `adaptado`), con el motivo de cada adaptación.
4. **`herramientas/comparar-con-pp.sh [ruta-pp]`:** para cada archivo de la tabla, muestra `diff -u` entre PP y OPEN-RVT e imprime al final un resumen de cuántos archivos están idénticos, adaptados o con cambios nuevos en PP desde el commit de origen (`git -C <pp> diff fd60cde -- <archivo>`).

## Qué se copia
- **Proyecto:** `package.json`, configuración de Vite, TypeScript, Tailwind y Vitest, `index.html`, `src/main.tsx` y `src/styles/`.
  - Quita las dependencias que ya no use nadie después de copiar. Por ejemplo, glide-data-grid se queda solo si algún archivo copiado lo usa.
- **`src/app/`:** `App.tsx` (adaptado), `BarraTitulo`, `BarraEstado`, `SidebarModulos`, `PaletaComandos`, `DialogoAtajos`, `ErrorBoundary`, `comportamientoNativo`, `iconos` y `modulos.ts` (adaptado), con sus pruebas.
- **El ribbon:** `src/features/presupuesto/ribbon/` va a `src/features/ribbon/`. Es la única excepción a la regla de ruta: el ribbon es común, no de presupuesto. Anótalo en `origen-pp.md`.
  - `comandos.ts` queda con los comandos de OPEN-RVT (ver abajo).
- **`src/components/ui/`:** completo.
- **`src/lib/`:** solo lo genérico que usen los archivos copiados: `atajos`, `atajosGlobales`, `tema`, `colorTema`, `utils`, `ipc`, `dialogos`, `errores-globales`, `usePanelRedimensionable`, `formato`, `portapapeles` y `logo`.
  - No copies `avisosMotor`, `noCuadra`, `unidades`, `medida`, `tsv` ni `temaGrid`, salvo que algún archivo copiado los importe.
- **`src/i18n/`:** la estructura y las pruebas. En `es.json` y `en.json` quedan solo las claves que usan los archivos copiados, más las nuevas de OPEN-RVT.
- **`src/features/configuracion/`:** solo `ConfiguracionView` con las secciones de apariencia (tema y escala) e idioma, más sus pruebas.
- **`src/features/ayuda/`:** `AyudaView` y `Markdown`. El manual es `docs/manual-rapido.md` de OPEN-RVT, con una sola página de bienvenida.
- **`src-tauri/`:**
  - `main.rs`, `lib.rs` (adaptado), `estado.rs` (solo lo genérico) y `Cargo.toml`;
  - `tauri.conf.json`: nombre «OPEN-RVT», identificador `mx.openrvt.app`, versión 0.1.0;
  - capacidades, iconos (provisionales, los de PP) y `build.rs` con el manifiesto de Windows;
  - **`configurar_webview2`** (sin menús, atajos ni zoom del navegador) se copia intacto;
  - **actualizador:** el código queda, pero desactivado. No hay endpoint ni llave, y anótalo como pendiente.
- **Workspace de Rust:** un `crates/` vacío con un `README.md` que diga que ahí irán `nucleo` (modelo e IFC) y lo demás.

## Qué NO se copia
El asistente, el presupuesto, la matriz, los catálogos, la biblioteca, el sobrecosto, el programa, la explosión, la escalatoria, los generadores, el control, los reportes, la importación de OPUS, las versiones y todos los crates de PP.

## Lo nuevo y mínimo de OPEN-RVT
- **Módulos de la sidebar** (`modulos.ts`):
  - **Modelo**, con el área de trabajo: un panel vacío con el texto «Aquí irá el editor (planta y 3D)»;
  - **Niveles y ejes**, vacío;
  - **Configuración** y **Ayuda**.
- **Ribbon:**
  - pestaña **Inicio**: grupo Archivo con Nuevo, Abrir y Guardar, deshabilitados y con la descripción «Disponible pronto»;
  - pestaña **Vista**: grupo Tema, con el mismo botón de tema que PP.
- **Barra de título y barra de estado:** «OPEN-RVT» y «Sin modelo abierto».

## Verificación (todo debe pasar)
- `npm run build` (TypeScript sin errores) y `npx vitest run`: pasan todas las pruebas copiadas y adaptadas.
  - Si una prueba de PP prueba algo que se quitó, se borra junto con lo que probaba. Anótalo en `origen-pp.md`.
- `cargo test --workspace` y `cargo clippy --workspace -- -D warnings`.
- **Linux:** `npx tauri build --bundles deb` genera el `.deb`.
- **Windows:** `npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis` genera el `setup.exe`.
  - Usa `CARGO_TARGET_DIR=$HOME/.cache/pp-target/openrvt-win`. **No** reutilices el target de PP.
- **Captura de la app real en Linux,** con xvfb fuera del sandbox, como `~/pp-trabajo/oc/captura.mjs` de PP, en `docs/capturas/o002-inicio.png`.
  - Deben verse el ribbon, la sidebar con los 4 módulos y el área de trabajo vacía, con el mismo aspecto que PP.
- `herramientas/comparar-con-pp.sh` corre e imprime el resumen.

## Entrega
`docs/progreso/O002.md` con la etiqueta «LISTA PARA REVISIÓN». Incluye:
- el resumen de `comparar-con-pp.sh` (cuántos archivos quedaron intactos y cuántos adaptados);
- la salida de las pruebas;
- el tamaño del `.deb` y del `setup.exe`;
- la captura;
- las desviaciones.

Commits en español. No hagas push.
