// O028: descripción legible de los enlaces a ejes de un elemento.
import type { EjeReferencia } from "./herramientas";

export interface EnlaceEjes {
  tipo: "cruce" | "tramo";
  EnlaceEjeA?: string;
  EnlaceEjeB?: string;
  EnlaceDX?: number;
  EnlaceDY?: number;
  EnlaceEjeGuia?: string;
  EnlaceEjeInicio?: string;
  EnlaceEjeFin?: string;
  EnlaceDesfase?: number;
  EnlaceDesfaseInicio?: number;
  EnlaceDesfaseFin?: number;
}

function etiqueta(globalid: string | undefined, ejes: EjeReferencia[]): string {
  if (!globalid) return "?";
  return ejes.find((eje) => eje.globalid === globalid)?.etiqueta ?? globalid;
}

/** Texto del panel: «A-1 (dx 0.10, dy 0.00)» o «eje B, de 1 a 3». */
export function describirEnlace(enlace: EnlaceEjes, ejes: EjeReferencia[]): string {
  if (enlace.tipo === "cruce") {
    const dx = Number(enlace.EnlaceDX ?? 0).toFixed(2);
    const dy = Number(enlace.EnlaceDY ?? 0).toFixed(2);
    return `${etiqueta(enlace.EnlaceEjeA, ejes)}-${etiqueta(
      enlace.EnlaceEjeB,
      ejes,
    )} (dx ${dx}, dy ${dy})`;
  }
  const desfase = Number(enlace.EnlaceDesfase ?? 0);
  const sufijo = Math.abs(desfase) > 1e-9 ? ` (desfase ${desfase.toFixed(2)})` : "";
  return `eje ${etiqueta(enlace.EnlaceEjeGuia, ejes)}, de ${etiqueta(
    enlace.EnlaceEjeInicio,
    ejes,
  )} a ${etiqueta(enlace.EnlaceEjeFin, ejes)}${sufijo}`;
}
