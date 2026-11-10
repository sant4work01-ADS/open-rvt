import type { CSSProperties } from "react";
import type { Bloqueo, CandidatosInferencia, Inferencia, Vec3 } from "../inferencias3d";
import type { ElementoMalla } from "../tipos";

export function distanciaPuntoSegmento(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo2 = dx * dx + dy * dy;
  if (largo2 <= 1e-12) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / largo2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** O041: el cerramiento se dibuja con contorno completo si no hay muro debajo. */
export function muroBajoCerramiento(
  eje: [number, number, number, number],
  mallas: readonly ElementoMalla[],
): boolean {
  const [x1, y1, x2, y2] = eje;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return mallas.some((malla) => {
    if (malla.clase !== "IfcWall" || !malla.eje) return false;
    const [wx1, wy1, wx2, wy2] = malla.eje;
    return (
      distanciaPuntoSegmento(x1, y1, wx1, wy1, wx2, wy2) <= 0.06 &&
      distanciaPuntoSegmento(x2, y2, wx1, wy1, wx2, wy2) <= 0.06 &&
      distanciaPuntoSegmento(mx, my, wx1, wy1, wx2, wy2) <= 0.06
    );
  });
}
export function etiquetaInferencia(tipo: string | null): string {
  switch (tipo) {
    case "extremo": return "Extremo";
    case "medio": return "Punto medio";
    case "sobre_arista": return "En arista";
    case "interseccion": return "Intersección";
    case "sobre_cara": return "En cara";
    case "eje_x": return "Eje X";
    case "eje_y": return "Eje Y";
    case "eje_z": return "Eje Z";
    case "paralelo": return "Paralelo";
    case "perpendicular": return "Perpendicular";
    default: return "Plano";
  }
}

export function colorDeGuia(tipo: string | null): string {
  if (tipo === "eje_x") return "#dc2626";
  if (tipo === "eje_y") return "#16a34a";
  if (tipo === "eje_z") return "#2563eb";
  if (tipo === "paralelo" || tipo === "perpendicular") return "#0891b2";
  return "#64748b";
}

export function formaDeMarcador(tipo: string): CSSProperties {
  if (tipo === "extremo") {
    return { width: 10, height: 10, background: "#16a34a", borderRadius: 1 };
  }
  if (tipo === "medio") {
    return {
      width: 0,
      height: 0,
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderBottom: "11px solid #06b6d4",
    };
  }
  if (tipo === "sobre_arista") {
    return {
      width: 10,
      height: 10,
      background: "#dc2626",
      transform: "rotate(45deg)",
      borderRadius: 1,
    };
  }
  if (tipo === "sobre_cara") {
    return {
      width: 10,
      height: 10,
      background: "#2563eb",
      transform: "rotate(45deg)",
      borderRadius: 1,
    };
  }
  if (tipo === "interseccion") {
    return {
      width: 12,
      height: 12,
      color: "#16a34a",
      fontSize: 16,
      lineHeight: "12px",
      fontWeight: 700,
    };
  }
  const color = tipo === "eje_x"
    ? "#dc2626"
    : tipo === "eje_y"
      ? "#16a34a"
      : tipo === "eje_z"
        ? "#2563eb"
        : "#0891b2";
  return { width: 9, height: 9, background: color, borderRadius: "50%" };
}
export function redondearVec(p: Vec3): Vec3 {
  const r = (v: number) => {
    const n = Math.round(v * 1e6) / 1e6;
    return Object.is(n, -0) ? 0 : n;
  };
  return { x: r(p.x), y: r(p.y), z: r(p.z) };
}

export function bloqueoDeInferencia(
  inf: Inferencia,
  candidatos: CandidatosInferencia,
): Bloqueo | null {
  if (inf.tipo === "eje_x") return { tipo: "eje", eje: "x" };
  if (inf.tipo === "eje_y") return { tipo: "eje", eje: "y" };
  if (inf.tipo === "eje_z") return { tipo: "eje", eje: "z" };
  if (inf.tipo === "paralelo" && inf.referencia !== null) {
    const arista = candidatos.aristas?.[inf.referencia];
    if (arista) {
      return {
        tipo: "arista",
        inicio: arista.inicio,
        fin: arista.fin,
        referencia: inf.referencia,
      };
    }
  }
  return null;
}
