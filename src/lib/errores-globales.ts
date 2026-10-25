// Errores no capturados de la interfaz hacia el log de la app (spec 077) y a la
// bitácora de la sesión (O006c).
import { ipc } from "./ipc";
import { bitacoraErrorUi } from "./bitacora";

/** Instala `window.onerror` y `unhandledrejection`; el backend limita a 20 por minuto. */
export function instalarErroresGlobales() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (evento) => {
    const pila = evento.error?.stack ?? `${evento.filename}:${evento.lineno}:${evento.colno}`;
    bitacoraErrorUi(evento.message || "error de la interfaz", pila);
    void ipc
      .registrarErrorUi(evento.message || "error de la interfaz", pila)
      .catch(() => undefined);
  });
  window.addEventListener("unhandledrejection", (evento) => {
    const razon = evento.reason;
    const mensaje = razon instanceof Error ? razon.message : String(razon);
    const pila = razon instanceof Error ? (razon.stack ?? "") : "";
    bitacoraErrorUi(mensaje, pila);
    void ipc.registrarErrorUi(mensaje, pila).catch(() => undefined);
  });
}
