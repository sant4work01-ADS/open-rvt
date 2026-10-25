# O006c — Bitácora completa y exportable

**Pedido del usuario:** «un log total: qué clickeo, qué error sale, qué acción se solicita, qué resultado obtengo… y poder exportar ese log para pasártelo y analices los errores».

**Antecedente (0.4.1):** el error de crear ejes en Windows no se pudo diagnosticar desde la app. El mensaje salía como «No se pudo completar la operación: {{mensaje}}», y `OPEN-RVT.log` solo tenía esa línea, sin el método llamado, los parámetros ni la traza.

## 1. Qué se registra
Cada evento se guarda como una línea JSON con los campos `ts` (ISO, con ms), `sesion`, `tipo` y los campos propios del tipo:

| tipo | Cuándo | Datos |
|---|---|---|
| `inicio` | al arrancar | versión, SO, arquitectura, versión de Python y de IfcOpenShell, idioma, tamaño de pantalla |
| `clic` | cualquier clic en un botón, pestaña, menú o casilla (listener global en captura) | `data-testid`, `aria-label` o texto visible del control, la ruta de componentes padres (por ejemplo, `ribbon>Modelar>Eje`) y la vista activa |
| `tecla` | atajos y Enter/Esc en herramientas (**no** el texto que se escribe en campos) | tecla y combinación |
| `herramienta` | al activar, cancelar o terminar una herramienta y en cada punto que se coloca | herramienta, paso y coordenadas del modelo |
| `accion` | cada llamada al núcleo (`nucleo_llamar`) | `metodo`, `params` (truncados a 2 KB) y un `id` |
| `resultado` | la respuesta a cada llamada | el mismo `id`, `ok` o `error`, la duración en ms y un resumen del resultado (creados, modificados y mensaje) **o el error completo**: mensaje, código y **traza de Python** |
| `aviso` | todo lo que se muestra en la barra de estado o en un toast | texto y nivel |
| `error_ui` | `window.onerror`, `unhandledrejection` y errores de React (ErrorBoundary) | mensaje y pila |
| `vista` | al cambiar de vista o de archivo | nombre de la vista y ruta del archivo |
| `nucleo_stderr` | líneas que el proceso Python escribe a stderr | texto |

### En el núcleo
- Ante cualquier excepción, la respuesta JSON-RPC de error lleva `data.traza` con `traceback.format_exc()`. Revisa `servidor.py`.
- El puente Rust la conserva hasta la interfaz.

### En el puente
- `ErrorNucleo` se serializa con mensaje, código y traza. Revisa `nucleo_llamar` y `ipc.ts`.
- **Ningún error puede perder su mensaje original.** Agrega una prueba vitest de `mensajeDeError` con un error sin `codigo` y otro con código.

## 2. Dónde se guarda
- **Ubicación:** en la carpeta de logs de la app, la misma de `OPEN-RVT.log` (`app_log_dir`), en el archivo `bitacora/<fecha>_<hora>_<sesion>.jsonl`. La escritura la hace Rust (comando `bitacora_agregar` con un lote de eventos) y la interfaz manda lotes cada 1 s o al haber un error.
- **Pérdida de eventos:** no se pierden si la app se cierra o truena. Al cerrar se vacía el lote, y los errores se escriben de inmediato.
- **Rotación:** se conservan las últimas 20 sesiones, sin pasar de 50 MB; se borran las más viejas.
- **Privacidad:** no se guarda el contenido del IFC ni textos escritos en campos. Solo se guardan rutas de archivo, métodos y parámetros.

## 3. Ver y exportar
- **Panel «Bitácora»:** en el módulo **Ayuda** (o en el menú Ayuda del ribbon). Muestra una tabla de la sesión actual en vivo con:
  - filtro por tipo y un interruptor «Solo errores»;
  - al hacer clic en un error, el detalle completo con su traza y las 20 acciones previas, para ver qué lo provocó.
- **Botón «Exportar bitácora…»:** genera un **.zip** con:
  - las sesiones `.jsonl` (por omisión, la actual y las 2 anteriores; casilla «Todas»);
  - `OPEN-RVT.log`;
  - `sistema.json` (lo del evento `inicio`);
  - casilla opcional, desmarcada por omisión: «Incluir el modelo IFC abierto».

  Usa el diálogo de guardar, con el nombre por omisión `bitacora-openrvt-<fecha>.zip`. Para el zip usa el crate `zip`, que ya debería estar en el árbol; si no, agrégalo y anótalo.
- **En cada toast o aviso de error:** un botón «Copiar detalle» (copia el error con su traza) y otro «Exportar bitácora».

## 4. Verificación
- **Todo en verde:** build, vitest, cargo test, clippy y pytest.
- **vitest:**
  - el serializador de eventos;
  - el truncado de parámetros;
  - el listener de clics, que obtiene la etiqueta correcta de un botón con `data-testid`, de uno con `aria-label` y de uno solo con texto;
  - `mensajeDeError`.
- **pytest:** un método que lanza una excepción devuelve `data.traza`.
- **cargo test:** la rotación (borra las sesiones viejas) y que el zip contiene los archivos esperados.
- **E2E (app real):**
  1. crea dos ejes;
  2. fuerza un error, por ejemplo `ejes.separacion` con ejes no paralelos;
  3. exporta la bitácora;
  4. descomprime y comprueba que existen los eventos `clic` (Eje), `accion` y `resultado` ok de `ejes.crear`, y el `resultado` error con mensaje y traza.
- **Captura:** `o006c_bitacora.png`, con el panel mostrando un error abierto.

## Entrega
- Versión **0.5.0** en los cuatro archivos. No subas instaladores.
- `docs/progreso/O006c.md` con la etiqueta «LISTA PARA REVISIÓN».
- Commits en español. No hagas push.

## No hagas
- No envíes la bitácora a ningún servidor; solo se exporta a un archivo.
- No registres lo que el usuario escribe en campos de texto.
