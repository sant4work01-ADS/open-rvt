// OPEN-RVT: adaptado de src/lib/ipc.ts de PresupuestosPro. Se conserva la capa que
// desenvuelve `{status, data|error}`, el error tipado y `textoDeError`; se quitaron los
// errores del motor de presupuesto y el progreso de OPUS, que no existen aquí.
import { tr } from "@/i18n";
import { commands, type ErrorDatos } from "./bindings";

export type { ErrorDatos };

/** Error del backend tal como lo recibe la interfaz. */
export type DetalleError = ErrorDatos & { codigo?: string };

/** Código estable según el `tipo`. */
const CODIGO_POR_TIPO: Record<string, string> = {
  Io: "io",
  Validacion: "validacion",
  NoEncontrado: "no_encontrado",
};

export class ErrorIpc extends Error {
  readonly detalle: DetalleError;
  constructor(detalle: DetalleError) {
    super(mensajeDeError(detalle));
    this.name = "ErrorIpc";
    this.detalle = detalle;
  }
}

export function mensajeDeError(e: DetalleError): string {
  const codigo = e.codigo ?? CODIGO_POR_TIPO[e.tipo];
  if (!codigo) return e.mensaje;
  return tr(`errores.${codigo}`, e.mensaje, { mensaje: e.mensaje });
}

type Comandos = typeof commands;
type Exito<R> = Extract<R, { status: "ok"; data: unknown }>;
type Desenvuelto<T> = T extends (...args: infer A) => Promise<infer R>
  ? (...args: A) => Promise<[Exito<R>] extends [never] ? R : Exito<R>["data"]>
  : never;

export type Ipc = { [K in keyof Comandos]: Desenvuelto<Comandos[K]> };

function desenvolver(r: unknown): unknown {
  if (r && typeof r === "object" && "status" in r) {
    const res = r as { status: string; data?: unknown; error?: ErrorDatos };
    if (res.status === "ok") return res.data;
    if (res.status === "error" && res.error) throw new ErrorIpc(res.error);
  }
  return r;
}

function construir(): Ipc {
  const salida: Record<string, unknown> = {};
  for (const [nombre, fn] of Object.entries(commands)) {
    salida[nombre] = async (...args: unknown[]) => {
      try {
        return desenvolver(await (fn as (...a: unknown[]) => Promise<unknown>)(...args));
      } catch (e) {
        const error =
          e instanceof ErrorIpc
            ? e
            : new ErrorIpc({
                tipo: "Io",
                mensaje: e instanceof Error ? e.message : String(e),
              });
        // Los errores de la interfaz quedan en el log de la app. El propio registrador no
        // se registra para no hacer recursión.
        if (nombre !== "registrarErrorComando" && nombre !== "registrarErrorUi") {
          void Promise.resolve(commands.registrarErrorComando(nombre, error.message)).catch(
            () => undefined,
          );
        }
        throw error;
      }
    };
  }
  return salida as Ipc;
}

export const ipc: Ipc = construir();

/** Texto de un error cualquiera para mostrar al usuario. */
export function textoDeError(e: unknown): string {
  if (e instanceof ErrorIpc) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
