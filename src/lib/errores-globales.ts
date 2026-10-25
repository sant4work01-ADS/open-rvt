// Errores no capturados de la interfaz hacia el log de la app (spec 077).
import { ipc } from "./ipc";

/** Instala `window.onerror` y `unhandledrejection`; el backend limita a 20 por minuto. */
export function instalarErroresGlobales() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (evento) => {
    void ipc
      .registrarErrorUi(
        evento.message || "error de la interfaz",
        evento.error?.stack ?? `${evento.filename}:${evento.lineno}:${evento.colno}`,
      )
      .catch(() => undefined);
  });
  window.addEventListener("unhandledrejection", (evento) => {
    const razon = evento.reason;
    void ipc
      .registrarErrorUi(
        razon instanceof Error ? razon.message : String(razon),
        razon instanceof Error ? (razon.stack ?? "") : "",
      )
      .catch(() => undefined);
  });
}
