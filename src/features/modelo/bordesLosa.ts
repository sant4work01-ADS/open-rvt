// O032: lectura y edición de los bordes de una losa guardados en OPENRVT_Losa.
export interface BordeLosa {
  referencia: "libre" | "eje" | "muro";
  objetivo?: string;
  lado?: "exterior" | "eje" | "interior" | "libre";
  desfase: number;
  signo?: number;
  punto_a?: [number, number];
  punto_b?: [number, number];
}

const LADOS: Record<string, string> = {
  exterior: "Paño exterior",
  eje: "Eje",
  interior: "Paño interior",
  libre: "Libre",
};

export function bordesDePset(pset: Record<string, unknown> | undefined): BordeLosa[] {
  const crudo = pset?.Bordes;
  if (Array.isArray(crudo)) return crudo as BordeLosa[];
  if (typeof crudo !== "string" || !crudo.trim()) return [];
  try {
    const datos = JSON.parse(crudo) as unknown;
    return Array.isArray(datos) ? (datos as BordeLosa[]) : [];
  } catch {
    return [];
  }
}

export function valorComunDesfase(bordes: BordeLosa[]): number | "Varios" {
  if (bordes.length === 0) return 0;
  const primero = Number(bordes[0].desfase) || 0;
  return bordes.every((borde) => Math.abs((Number(borde.desfase) || 0) - primero) < 1e-9)
    ? primero
    : "Varios";
}

export function etiquetaBorde(indice: number, borde: BordeLosa): string {
  if (borde.referencia === "libre") return `Lado ${indice + 1}: libre`;
  const lado = LADOS[borde.lado ?? borde.referencia] ?? "Eje";
  return `Lado ${indice + 1}: ${borde.referencia} · ${lado}`;
}

export function desfaseConSigno(borde: BordeLosa): string {
  const valor = Number(borde.desfase) || 0;
  const signo = valor > 0 ? "+" : "";
  return `${signo}${valor.toFixed(3)} m`;
}
