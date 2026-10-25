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
  color_tema: string;
  temas_personalizados: string[];
  anchos_columnas: Record<string, Record<string, number>>;
}

export interface ErrorDatos {
  tipo: string;
  mensaje: string;
  codigo?: string;
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
    .catch((e: unknown) => ({
      status: "error",
      error: { tipo: "Io", mensaje: e instanceof Error ? e.message : String(e) },
    }));
}

export const commands = {
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
};
