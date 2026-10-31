// OPEN-RVT: capa de comandos. En PresupuestosPro este archivo lo genera tauri-specta;
// aquí se escribe a mano para el puñado de comandos genéricos del esqueleto y se mantiene
// la misma forma `{ status, data|error }` que consume `src/lib/ipc.ts`.
import { invoke } from "@tauri-apps/api/core";

/** Preferencias de la aplicación que viven en `config.json`. */
export interface Config {
  tema: string;
  escala_ui: number;
  idioma: string;
  idioma_migrado: boolean;
  barra_compacta: boolean;
  lateral_expandido: boolean;
  lateral_ancho_rem: number | null;
  /** O011: paneles laterales del área de trabajo plegados. */
  panel_izquierdo_plegado: boolean;
  panel_derecho_plegado: boolean;
  color_tema: string;
  temas_personalizados: string[];
  anchos_columnas: Record<string, Record<string, number>>;
}

export interface ErrorDatos {
  tipo: string;
  mensaje: string;
  codigo?: string;
  /** O006c: traza de Python que devuelve el núcleo en los errores. */
  traza?: string;
}

/** O006c: sesión actual de la bitácora. */
export interface DatosSesionBitacora {
  sesion: string;
  ruta: string | null;
  carpeta: string | null;
}

/** Conflicto al copiar elementos entre modelos (diálogo común copiado de PP). */
export type Estrategia = "Reutilizar" | "Renombrar" | "Sobrescribir";

export interface Conflicto {
  entidad: string;
  clave: string;
  motivo: "MismaClave" | "MismoElemento";
}

export type Resultado<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: ErrorDatos };

function envolver<T>(promesa: Promise<T>): Promise<Resultado<T>> {
  return promesa
    .then((data) => ({ status: "ok", data }) as Resultado<T>)
    .catch((e: unknown) => ({ status: "error", error: normalizarError(e) }));
}

/**
 * O006c: un error del puente llega como objeto `{mensaje, codigo, traza}`; si se
 * convirtiera con `String(e)` se perdería el mensaje original («[object Object]»).
 */
export function normalizarError(e: unknown): ErrorDatos {
  if (e && typeof e === "object") {
    const datos = e as Record<string, unknown>;
    if (typeof datos.mensaje === "string" && datos.mensaje) {
      const error: ErrorDatos = { tipo: "Io", mensaje: datos.mensaje };
      if (typeof datos.tipo === "string") error.tipo = datos.tipo;
      if (datos.codigo !== undefined && datos.codigo !== null) {
        error.codigo = String(datos.codigo);
      }
      if (typeof datos.traza === "string" && datos.traza) error.traza = datos.traza;
      return error;
    }
    if (typeof datos.message === "string" && datos.message) {
      return { tipo: "Io", mensaje: datos.message };
    }
  }
  return { tipo: "Io", mensaje: e instanceof Error ? e.message : String(e) };
}

export const commands = {
  versionApp: () => envolver(invoke<string>("version_app")),
  obtenerConfig: () => envolver(invoke<Config>("obtener_config")),
  migrarTemaLocal: (tema: string) => envolver(invoke<Config>("migrar_tema_local", { tema })),
  guardarTema: (tema: string) => envolver(invoke<void>("guardar_tema", { tema })),
  guardarIdioma: (idioma: string) => envolver(invoke<void>("guardar_idioma", { idioma })),
  guardarEscala: (escala: number) => envolver(invoke<void>("guardar_escala", { escala })),
  guardarColorTema: (payload: string) =>
    envolver(invoke<void>("guardar_color_tema", { payload })),
  guardarBarraCompacta: (activa: boolean) =>
    envolver(invoke<void>("guardar_barra_compacta", { activa })),
  guardarLateralExpandido: (expandido: boolean) =>
    envolver(invoke<void>("guardar_lateral_expandido", { expandido })),
  guardarLateralAncho: (ancho: number | null) =>
    envolver(invoke<void>("guardar_lateral_ancho", { ancho })),
  guardarPanelIzquierdoPlegado: (plegado: boolean) =>
    envolver(invoke<void>("guardar_panel_izquierdo_plegado", { plegado })),
  guardarPanelDerechoPlegado: (plegado: boolean) =>
    envolver(invoke<void>("guardar_panel_derecho_plegado", { plegado })),
  guardarAnchoColumna: (vista: string, columna: string, ancho: number) =>
    envolver(invoke<void>("guardar_ancho_columna", { vista, columna, ancho })),
  restablecerAnchos: (vista: string) =>
    envolver(invoke<void>("restablecer_anchos", { vista })),
  fijarTituloVentana: (titulo: string) =>
    envolver(invoke<void>("fijar_titulo_ventana", { titulo })),
  registrarErrorUi: (mensaje: string, detalle: string) =>
    envolver(invoke<void>("registrar_error_ui", { mensaje, detalle })),
  registrarErrorComando: (comando: string, mensaje: string) =>
    envolver(invoke<void>("registrar_error_comando", { comando, mensaje })),
  // OPEN-RVT: único comando del núcleo IFC (spec O003a). La forma del valor lo define
  // el método JSON-RPC; los tipos concretos viven en src/features/modelo/tipos.ts.
  nucleoLlamar: (metodo: string, params: unknown) =>
    envolver(invoke<unknown>("nucleo_llamar", { metodo, params })),
  // O006c: bitácora de la sesión (lotes JSONL y exportación .zip).
  bitacoraAgregar: (eventos: unknown[]) =>
    envolver(invoke<void>("bitacora_agregar", { eventos })),
  bitacoraSesion: () => envolver(invoke<DatosSesionBitacora>("bitacora_sesion")),
  bitacoraExportar: (
    destino: string,
    todas: boolean,
    incluirIfc: boolean,
    rutaIfc: string | null,
  ) =>
    envolver(
      invoke<string>("bitacora_exportar", { destino, todas, incluirIfc, rutaIfc }),
    ),
  // O017b: ajustes reales de WebView2 (null fuera de Windows) y escritura del
  // diagnóstico exportado.
  diagnosticoWebview: () =>
    envolver(
      invoke<{
        zoom_control: boolean | null;
        pinch_zoom: boolean | null;
        atajos_navegador: boolean | null;
      } | null>("diagnostico_webview"),
    ),
  guardarTexto: (ruta: string, contenido: string) =>
    envolver(invoke<void>("guardar_texto", { ruta, contenido })),
};
