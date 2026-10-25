// OPEN-RVT (O006d): heurística de la rueda y el touchpad del visor.
//
// Un ratón manda saltos grandes: `deltaY` entero de ±100 o ±120, o `deltaMode=1`
// (líneas). Un touchpad manda valores pequeños, fraccionarios y con `deltaMode=0`;
// el pellizco llega como `wheel` con `ctrlKey`. Regla:
//   1. Ctrl + rueda siempre es zoom (pellizco).
//   2. Shift + rueda siempre es paneo horizontal.
//   3. Según la preferencia del usuario: «auto», «zoom» o «paneo».
//   4. En «auto», `deltaMode != 0` o un salto entero >= 100 es zoom; el resto paneo.
import { create } from "zustand";

export type PreferenciaRueda = "auto" | "zoom" | "paneo";
export type AccionRueda = "zoom" | "paneo" | "paneo-horizontal";

export interface EventoRueda {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

const CLAVE = "openrvt.rueda";
const CLAVE_AYUDA = "openrvt.ayudaNavegacion";

function leerPreferencia(): PreferenciaRueda {
  try {
    const valor = localStorage.getItem(CLAVE);
    return valor === "zoom" || valor === "paneo" ? valor : "auto";
  } catch {
    return "auto";
  }
}

function leerAyudaVisible(): boolean {
  try {
    return localStorage.getItem(CLAVE_AYUDA) !== "cerrada";
  } catch {
    return true;
  }
}

/**
 * Clasifica un evento `wheel`. No mira el elemento: el visor decide qué hacer con la
 * acción devuelta. La heurística está documentada arriba y en el manual de Ayuda.
 */
export function clasificarRueda(
  evento: EventoRueda,
  preferencia: PreferenciaRueda = "auto",
): AccionRueda {
  if (evento.ctrlKey) return "zoom";
  if (evento.shiftKey) return "paneo-horizontal";
  if (preferencia === "zoom") return "zoom";
  if (preferencia === "paneo") return "paneo";
  const dx = Math.abs(evento.deltaX);
  const dy = Math.abs(evento.deltaY);
  // Rueda de ratón: saltos enteros de una línea (100/120) o `deltaMode` de líneas.
  if (evento.deltaMode !== 0) return "zoom";
  const entero = Number.isInteger(evento.deltaX) && Number.isInteger(evento.deltaY);
  if (dy === 0 && dx > 0) return "paneo";
  if (dy >= 100 && entero && dx < 60) return "zoom";
  return "paneo";
}

/** Factor de zoom de un `wheel`; el signo positivo acerca en la convención del visor. */
export function factorRueda(deltaY: number): number {
  return Math.pow(1.0018, deltaY);
}

interface EstadoRueda {
  preferencia: PreferenciaRueda;
  ayudaVisible: boolean;
  fijarPreferencia: (preferencia: PreferenciaRueda) => void;
  cerrarAyuda: () => void;
}

export const useRueda = create<EstadoRueda>((set) => ({
  preferencia: leerPreferencia(),
  ayudaVisible: leerAyudaVisible(),
  fijarPreferencia: (preferencia) => {
    try {
      localStorage.setItem(CLAVE, preferencia);
    } catch {
      /* sin almacenamiento disponible */
    }
    set({ preferencia });
  },
  cerrarAyuda: () => {
    try {
      localStorage.setItem(CLAVE_AYUDA, "cerrada");
    } catch {
      /* sin almacenamiento disponible */
    }
    set({ ayudaVisible: false });
  },
}));
