# Origen en PresupuestosPro

Todo lo copiado viene de `/home/sant4/pp-trabajo/presupuestos-pro`, rama `master`,
commit **`fd60cde`** («Ayuda: novedades de la versión 0.13.18»).

- **intacto**: el archivo es idéntico al de PP.
- **adaptado**: se cambió solo lo necesario (imports que no existen, comandos de
  presupuesto, nombre del producto o recorte de funciones). Cada cambio lleva un
  comentario `// OPEN-RVT: …` en el código.
- La única excepción de ruta es el ribbon: `src/features/presupuesto/ribbon/` en PP pasa a
  `src/features/ribbon/`, porque la cinta es común a toda la aplicación.

| Archivo en OPEN-RVT | Archivo en PP | Estado | Motivo de la adaptación |
| --- | --- | --- | --- |
| `package.json` | `package.json` | adaptado | Nombre `open-rvt`; se quitaron glide-data-grid, marked, lodash, zod, react-hook-form, react-hotkeys-hook, pdfjs-dist, selenium y demás dependencias que ya no usa nadie. |
| `vite.config.ts` | `vite.config.ts` | adaptado | Se quitó la deduplicación y los comentarios de Glide; el resto (alias `@`, jsdom, setup) es igual. |
| `.gitignore` | `.gitignore` | adaptado | Se añadieron las salidas de `dist`, `target`, `src-tauri/gen` y `e2e/salida`. |
| `Cargo.toml` | `Cargo.toml` | adaptado | Workspace con el único miembro `src-tauri`; sin los crates de PP. |
| `rust-toolchain.toml` | `rust-toolchain.toml` | intacto | — |
| `tsconfig.json` | `tsconfig.json` | intacto | — |
| `tailwind.config.ts` | `tailwind.config.ts` | intacto | — |
| `postcss.config.js` | `postcss.config.js` | intacto | — |
| `components.json` | `components.json` | intacto | — |
| `index.html` | `index.html` | adaptado | Título «OPEN-RVT» y sin el portal de Glide Data Grid. |
| `src/main.tsx` | `src/main.tsx` | intacto | — |
| `src/styles/globals.css` | `src/styles/globals.css` | intacto | — |
| `src/vite-env.d.ts` | `src/vite-env.d.ts` | intacto | — |
| `src/test-setup.ts` | `src/test-setup.ts` | adaptado | Sin los simulacros de Glide, del backend IPC de PP ni de sus diálogos. |
| `src/test/utiles.tsx` | `src/test/utiles.tsx` | adaptado | `montarApp` ya no instala el backend falso de PP; reinicia el tema y monta `App`. |
| `src/app/App.tsx` | `src/app/App.tsx` | adaptado | Sin vistas ni consultas de presupuesto; módulos Modelo, Niveles, Configuración y Ayuda; ribbon directo y barra de estado simple. |
| `src/app/App.test.tsx` | `src/app/App.test.tsx` | adaptado | Prueba el esqueleto nuevo (módulos, área vacía, ribbon, tema y escala). |
| `src/app/BarraTitulo.tsx` | `src/app/BarraTitulo.tsx` | adaptado | Sin el botón del asistente ni el nombre de la obra: el título es siempre «OPEN-RVT». |
| `src/app/BarraTitulo.test.tsx` | `src/app/BarraTitulo.test.tsx` | adaptado | Sin sesión de obra; se conservan las pruebas de ventana, foco y redimensión. |
| `src/app/BarraEstado.tsx` | `src/app/BarraEstado.tsx` | adaptado | Sin totales, problemas ni guardado: solo el producto y «Sin modelo abierto». |
| `src/app/SidebarModulos.tsx` | `src/app/SidebarModulos.tsx` | intacto | — |
| `src/app/SidebarEscala.test.tsx` | `src/app/SidebarEscala.test.tsx` | adaptado | Los módulos son Modelo/Niveles en vez de Inicio/Insumos. |
| `src/app/SidebarPlegable.test.tsx` | `src/app/SidebarPlegable.test.tsx` | adaptado | Comprueba la preferencia en el store de tema en vez de en el backend falso. |
| `src/app/SidebarRedimensionable.test.tsx` | `src/app/SidebarRedimensionable.test.tsx` | adaptado | Comprueba el ancho en el store de tema en vez de en el backend falso. |
| `src/app/SidebarTooltip.test.tsx` | `src/app/SidebarTooltip.test.tsx` | adaptado | Usa «Modelo» y «Niveles y ejes» como módulos de prueba. |
| `src/app/PaletaComandos.tsx` | `src/app/PaletaComandos.tsx` | intacto | — |
| `src/app/DialogoAtajos.tsx` | `src/app/DialogoAtajos.tsx` | intacto | — |
| `src/app/ListasScroll.test.tsx` | `src/app/ListasScroll.test.tsx` | adaptado | Se conservaron las pruebas de listas, paleta y atajos; se quitó el buscador de PP. |
| `src/app/Iconos.test.tsx` | `src/app/Iconos.test.tsx` | adaptado | Compara el ribbon normal (no hay barra compacta activa) con el sidebar. |
| `src/app/ErrorBoundary.tsx` | `src/app/ErrorBoundary.tsx` | adaptado | Sin `useSesion`; la recuperación solo limpia el error. |
| `src/app/ErrorBoundary.test.tsx` | `src/app/ErrorBoundary.test.tsx` | intacto | — |
| `src/app/comportamientoNativo.test.ts` | `src/app/comportamientoNativo.test.ts` | intacto | — |
| `src/app/comportamientoNativo.ts` | `src/app/comportamientoNativo.ts` | adaptado | La tabla de atajos solo tiene los generales. |
| `src/app/iconos.ts` | `src/app/iconos.ts` | intacto | — |
| `src/app/modulos.ts` | `src/app/modulos.ts` | adaptado | Módulos de OPEN-RVT y sus iconos. |
| `src/features/ribbon/Ribbon.tsx` | `src/features/presupuesto/ribbon/Ribbon.tsx` | adaptado | Solo las pestañas Inicio y Vista (ruta cambiada: el ribbon es común). |
| `src/features/ribbon/BarraCompacta.tsx` | `src/features/presupuesto/ribbon/BarraCompacta.tsx` | adaptado | Solo Inicio y Vista; queda disponible para cuando se active la barra compacta. |
| `src/features/ribbon/comandos.ts` | `src/features/presupuesto/ribbon/comandos.ts` | adaptado | Tipos y ayudantes iguales; los comandos son Nuevo/Abrir/Guardar (deshabilitados) y Tema. |
| `src/features/ribbon/Ribbon.test.tsx` | `src/features/presupuesto/ribbon/Ribbon.test.tsx` | adaptado | Prueba las dos pestañas, los comandos deshabilitados y el botón de tema. |
| `src/components/ui/DialogoConflictos.tsx` | `src/components/ui/DialogoConflictos.tsx` | intacto | — |
| `src/components/ui/button.tsx` | `src/components/ui/button.tsx` | intacto | — |
| `src/components/ui/campo.tsx` | `src/components/ui/campo.tsx` | intacto | — |
| `src/components/ui/confirmar.tsx` | `src/components/ui/confirmar.tsx` | intacto | — |
| `src/components/ui/menu-contextual.tsx` | `src/components/ui/menu-contextual.tsx` | intacto | — |
| `src/components/ui/modal.tsx` | `src/components/ui/modal.tsx` | adaptado | Sin el contador de modales de la sesión de obra de PP. |
| `src/components/ui/th-ancho.tsx` | `src/components/ui/th-ancho.tsx` | intacto | — |
| `src/components/ui/useConfirmar.tsx` | `src/components/ui/useConfirmar.tsx` | intacto | — |
| `src/lib/atajos.ts` | `src/lib/atajos.ts` | adaptado | Solo los atajos generales (paleta, ayuda, ribbon y escala). |
| `src/lib/atajosGlobales.ts` | `src/lib/atajosGlobales.ts` | adaptado | Acciones reducidas a las del esqueleto. |
| `src/lib/tema.ts` | `src/lib/tema.ts` | adaptado | Sin migración de la obra; no pisa una preferencia ya cambiada si falla la lectura de `config.json`. |
| `src/lib/colorTema.ts` | `src/lib/colorTema.ts` | adaptado | Sin el tipo `Theme` de Glide ni el pintado de la rejilla. |
| `src/lib/anchos.ts` | `src/lib/anchos.ts` | intacto | — |
| `src/lib/utils.ts` | `src/lib/utils.ts` | intacto | — |
| `src/lib/ipc.ts` | `src/lib/ipc.ts` | adaptado | Comandos genéricos de preferencias y registro; sin motor ni OPUS. |
| `src/lib/bindings.ts` | `src/lib/bindings.ts` | adaptado | En PP lo genera tauri-specta; aquí es la lista escrita a mano de los comandos genéricos. |
| `src/lib/dialogos.ts` | `src/lib/dialogos.ts` | intacto | — |
| `src/lib/errores-globales.ts` | `src/lib/errores-globales.ts` | intacto | — |
| `src/lib/usePanelRedimensionable.ts` | `src/lib/usePanelRedimensionable.ts` | intacto | — |
| `src/lib/formato.ts` | `src/lib/formato.ts` | intacto | — |
| `src/lib/formato.test.ts` | `src/lib/formato.test.ts` | intacto | — |
| `src/lib/portapapeles.ts` | `src/lib/portapapeles.ts` | intacto | — |
| `src/lib/logo.ts` | `src/lib/logo.ts` | intacto | — |
| `src/lib/difuso.ts` | `src/lib/difuso.ts` | intacto | — |
| `src/lib/difuso.test.ts` | `src/lib/difuso.test.ts` | intacto | — |
| `src/lib/listaTeclado.ts` | `src/lib/listaTeclado.ts` | intacto | — |
| `src/i18n/index.ts` | `src/i18n/index.ts` | intacto | — |
| `src/i18n/i18n.test.ts` | `src/i18n/i18n.test.ts` | intacto | — |
| `src/i18n/es.json` | `src/i18n/es.json` | adaptado | Solo las claves que usan los archivos copiados y las nuevas de OPEN-RVT. |
| `src/i18n/en.json` | `src/i18n/en.json` | adaptado | Las mismas claves que `es.json`, traducidas. |
| `src/i18n/pantallas-en.test.tsx` | `src/i18n/pantallas-en.test.tsx` | adaptado | Recorre los cuatro módulos del esqueleto en inglés. |
| `src/features/configuracion/ConfiguracionView.tsx` | `src/features/configuracion/ConfiguracionView.tsx` | adaptado | Solo Apariencia (tema y escala) e Idioma; sin obra, biblioteca, respaldos, asistente ni color. |
| `src/features/configuracion/Configuracion.test.tsx` | `src/features/configuracion/Configuracion.test.tsx` | adaptado | Prueba tema, escala e idioma. |
| `src/features/ayuda/AyudaView.tsx` | `src/features/ayuda/AyudaView.tsx` | intacto | — |
| `src/features/ayuda/Markdown.tsx` | `src/features/ayuda/Markdown.tsx` | intacto | — |
| `src/features/ayuda/manual.ts` | `src/features/ayuda/manual.ts` | intacto | — |
| `src/features/ayuda/Ayuda.test.tsx` | `src/features/ayuda/Ayuda.test.tsx` | adaptado | Prueba el manual nuevo de OPEN-RVT y la apertura de atajos. |
| `src-tauri/Cargo.toml` | `src-tauri/Cargo.toml` | adaptado | Sin crates de PP ni keyring/asistente; solo Tauri y los plugins comunes. |
| `src-tauri/build.rs` | `src-tauri/build.rs` | intacto | — |
| `src-tauri/windows-app.manifest` | `src-tauri/windows-app.manifest` | intacto | — |
| `src-tauri/capabilities/default.json` | `src-tauri/capabilities/default.json` | intacto | — |
| `src-tauri/icons/` | `src-tauri/icons/` | intacto | Iconos provisionales de PP (decisión de la spec). |
| `src-tauri/src/main.rs` | `src-tauri/src/main.rs` | adaptado | Llama a `open_rvt_lib::run()`. |
| `src-tauri/src/lib.rs` | `src-tauri/src/lib.rs` | adaptado | Solo preferencias, título, registros y `configurar_webview2` (intacto); sin comandos de presupuesto. |
| `src-tauri/src/estado.rs` | `src-tauri/src/estado.rs` | adaptado | Solo `Config` y las rutas de datos; sin obra, empresa, respaldos ni consumo. |
| `src-tauri/tauri.conf.json` | `src-tauri/tauri.conf.json` | adaptado | «OPEN-RVT», `mx.openrvt.app`, versión 0.1.0 y sin recursos del catálogo. |

## Pruebas de PP que no se copiaron

Se borraron junto con lo que probaban (spec O002):

`BarraEstado.test.tsx` (totales, problemas y avisos de presupuesto),
`DisposicionCinta.test.tsx` y `Problemas.test.tsx` (cinta y estado de la obra),
`Atajos.test.tsx` (atajos del presupuesto), `Iconos.test.tsx` y
`ListasScroll` original (se reemplazó por la versión adaptada),
`App.test.tsx` original (se reemplazó por el del esqueleto),
`BarraCompacta.test.tsx` (la barra compacta no está activa),
`obraJson.test.ts`, `th-ancho.test.tsx` (necesita el backend de PP),
`anchos.test.ts`, `anchoAuto.test.ts`, `atajos.test.ts`, `colorTema.test.tsx`,
`ipc.test.ts`, `lib.test.ts`, `tema.test.ts` y los de `temaGrid`, `noCuadra`,
`unidades`, `medida` y `tsv`; en i18n, `pantallas-en.test.tsx`,
`plantillas.test.ts` y `textos-fijos.test.ts` (dependen de pantallas y textos que no
existen).

## Pendiente anotado

- **Actualizador**: el código de actualización de PP no se copió porque PP no lo tiene
  activo; cuando se añada `tauri-plugin-updater` harán falta endpoint y llave pública.
  No se deja ninguno de los dos.
