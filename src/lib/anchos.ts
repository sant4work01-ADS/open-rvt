// Anchos de columna que elige el usuario (arrastrando el borde del encabezado). Son una
// preferencia de la aplicación (config.json), no de la obra, y se guardan por vista.
import { create } from "zustand";
import { ipc } from "@/lib/ipc";

/** Ancho mínimo en píxeles (el backend acepta desde 30). */
export const ANCHO_MINIMO = 40;
export const ANCHO_MAXIMO = 1200;

export type AnchosPorVista = Record<string, Record<string, number>>;

interface EstadoAnchos {
  anchos: AnchosPorVista;
  /** Carga las preferencias guardadas (al iniciar la aplicación). */
  cargar: (anchos: AnchosPorVista | undefined) => void;
  /** Cambia un ancho; con `persistir` lo guarda en config.json (al soltar el borde). */
  fijar: (vista: string, columna: string, ancho: number, persistir: boolean) => void;
  /** Vuelve a los anchos originales de una vista. */
  restablecer: (vista: string) => void;
}

export const limitarAncho = (n: number) =>
  Math.round(Math.max(ANCHO_MINIMO, Math.min(ANCHO_MAXIMO, n)));

export const useAnchos = create<EstadoAnchos>((set, get) => ({
  anchos: {},
  cargar: (anchos) => set({ anchos: anchos ?? {} }),
  fijar: (vista, columna, ancho, persistir) => {
    const w = limitarAncho(ancho);
    set((s) => ({
      anchos: { ...s.anchos, [vista]: { ...s.anchos[vista], [columna]: w } },
    }));
    if (persistir) {
      ipc.guardarAnchoColumna(vista, columna, get().anchos[vista]?.[columna] ?? w).catch(() => {
        /* el ancho ya está aplicado; se reintenta en el siguiente cambio */
      });
    }
  },
  restablecer: (vista) => {
    set((s) => {
      const resto = { ...s.anchos };
      delete resto[vista];
      return { anchos: resto };
    });
    ipc.restablecerAnchos(vista).catch(() => undefined);
  },
}));

/** Ancho efectivo de una columna: el guardado o el de fábrica. */
export function anchoDe(anchos: AnchosPorVista, vista: string, columna: string, defecto: number) {
  return anchos[vista]?.[columna] ?? defecto;
}
