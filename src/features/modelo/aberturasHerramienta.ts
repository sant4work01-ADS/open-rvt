// O068: valores por omisión y colocación por distancia tecleada de Ventana/Puerta.
import type { AberturaColocada } from "./herramientas";
import type { OpcionesAbertura } from "./estado";

/** Medidas de fábrica al activar la herramienta (spec O068). */
export function opcionesAberturaPorOmision(
  herramienta: "puerta" | "ventana",
  nivel: string,
): OpcionesAbertura {
  return herramienta === "puerta"
    ? { ancho: 0.9, alto: 2.1, antepecho: 0, nivel }
    : { ancho: 1.2, alto: 1.2, antepecho: 0.9, nivel };
}

/** Acumula una tecla en un campo numérico de longitud (m). */
export function acumularNumero(campo: string, tecla: string): string {
  if (tecla === "Backspace") return campo.slice(0, -1);
  if ((tecla === "," || tecla === ".") && !campo.includes(".")) {
    return `${campo || "0"}.`;
  }
  if (tecla === "-" && campo === "") return "-";
  if (/^\d$/.test(tecla)) {
    return `${campo}${tecla}`.replace(/^(-?)0(?=\d)/, "$1");
  }
  return campo;
}

/**
 * Distancia al inicio del muro cuando la abertura se mide desde el extremo más
 * cercano al cursor. Devuelve `null` si la medida no deja la abertura dentro del
 * muro (el borde se cuenta desde ese extremo, no desde el centro).
 */
export function distanciaDesdeExtremo(
  colocada: AberturaColocada,
  valor: number,
  ancho: number,
): number | null {
  const { muro } = colocada;
  const largo = Math.hypot(muro.x2 - muro.x1, muro.y2 - muro.y1);
  if (!Number.isFinite(valor) || valor < 0) return null;
  const desdeInicio = colocada.desdeInicio <= colocada.hastaFin;
  const distancia = desdeInicio ? valor : largo - valor - ancho;
  if (distancia < -1e-9 || distancia + ancho > largo + 1e-9) return null;
  return Number(distancia.toFixed(6));
}
