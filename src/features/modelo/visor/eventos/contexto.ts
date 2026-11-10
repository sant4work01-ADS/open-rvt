import type { useRuedaVisor } from "../useRuedaVisor";
import type { Props } from "../tipos";

export type EntornoVisor = ReturnType<typeof useRuedaVisor> & Props;

export interface EstadoGesto {
  toques: Map<number, { x: number; y: number }>;
  toqueInicial: { x: number; y: number; ms: number; movido: boolean } | null;
  pinza: { dist: number; cx: number; cy: number } | null;
}

export function crearEstadoGesto(): EstadoGesto {
  return { toques: new Map(), toqueInicial: null, pinza: null };
}
