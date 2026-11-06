// O046: geometría pura del prototipo «Empujar/Tirar». No depende de three.js ni
// del estado: la vista solo le pasa rayos y rectángulos en metros.
type Punto2 = [number, number];

export type ClasificacionEmpujar = "auto" | "losa" | "muro" | "columna" | "generico";
export type ClaseEmpujar = Exclude<ClasificacionEmpujar, "auto">;

export interface RectanguloEmpujar {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DimensionesEmpujar {
  ancho: number;
  largo: number;
}

export interface Rayo {
  origen: [number, number, number];
  direccion: [number, number, number];
}

export interface ResultadoClasificacion {
  clase: ClaseEmpujar;
  /** r = lado menor, R = lado mayor, h = |altura|. Se anotan para la explicación. */
  menor: number;
  mayor: number;
  altura: number;
}

const TOLERANCIA = 1e-9;

/** Rectángulo alineado a X/Y a partir de dos esquinas opuestas. */
export function crearRectangulo(a: Punto2, b: Punto2): RectanguloEmpujar {
  return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
}

/** Rectángulo desde una esquina con ancho/largo positivos hacia el lado del ratón. */
export function rectanguloDesdeDimensiones(
  origen: Punto2,
  dimensiones: DimensionesEmpujar,
  hacia: Punto2,
): RectanguloEmpujar {
  const signoX = hacia[0] < origen[0] ? -1 : 1;
  const signoY = hacia[1] < origen[1] ? -1 : 1;
  return {
    x1: origen[0],
    y1: origen[1],
    x2: origen[0] + signoX * Math.abs(dimensiones.ancho),
    y2: origen[1] + signoY * Math.abs(dimensiones.largo),
  };
}

export function ladosRectangulo(r: RectanguloEmpujar): { menor: number; mayor: number } {
  const ancho = Math.abs(r.x2 - r.x1);
  const largo = Math.abs(r.y2 - r.y1);
  return { menor: Math.min(ancho, largo), mayor: Math.max(ancho, largo) };
}

export function anchoLargo(r: RectanguloEmpujar): DimensionesEmpujar {
  return { ancho: Math.abs(r.x2 - r.x1), largo: Math.abs(r.y2 - r.y1) };
}

/** Cuatro vértices en orden antihorario visto desde +Z. */
export function puntosRectangulo(r: RectanguloEmpujar): Punto2[] {
  const x1 = Math.min(r.x1, r.x2);
  const x2 = Math.max(r.x1, r.x2);
  const y1 = Math.min(r.y1, r.y2);
  const y2 = Math.max(r.y1, r.y2);
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
}

/**
 * Clasificación automática de la spec O046.
 *
 * La spec fija h ≤ 0.30 → Losa, muro si r ≤ 0.35 y R ≥ 3·r, y columna si la
 * sección es pequeña (R ≤ 0.80) con h ≥ 1. La tabla obligatoria añade
 * 0.35 × 1.04 → Columna: al no llegar al largo mínimo de muro (3·0.35 = 1.05),
 * un rectángulo esbelto con r ≤ 0.35 se trata como columna y no como genérico.
 * Es la única extensión de la regla, y solo alcanza a secciones de menos de
 * 35 cm de lado menor.
 */
export function clasificarEmpujar(
  r: RectanguloEmpujar,
  altura: number,
): ResultadoClasificacion {
  const { menor, mayor } = ladosRectangulo(r);
  const h = Math.abs(altura);
  const base = { menor, mayor, altura: h };
  if (h <= 0.30 + TOLERANCIA) return { clase: "losa", ...base };
  if (menor <= 0.35 + TOLERANCIA && mayor + TOLERANCIA >= 3 * menor) {
    return { clase: "muro", ...base };
  }
  if (
    h >= 1.0 - TOLERANCIA &&
    (mayor <= 0.80 + TOLERANCIA || (menor <= 0.35 + TOLERANCIA && mayor < 3 * menor))
  ) {
    return { clase: "columna", ...base };
  }
  return { clase: "generico", ...base };
}

/** ¿La altura (con signo) se puede usar con esa clase? Negativa solo en Genérico. */
export function alturaPermitida(clase: ClaseEmpujar, altura: number): boolean {
  if (!Number.isFinite(altura) || Math.abs(altura) <= TOLERANCIA) return false;
  if (altura < 0) return clase === "generico";
  return true;
}

/**
 * Intersección de un rayo con el plano horizontal z = cota.
 * Devuelve el punto o null si el rayo es paralelo al plano o va hacia atrás.
 */
export function rayoPlanoHorizontal(
  rayo: Rayo,
  cota: number,
): [number, number, number] | null {
  const dz = rayo.direccion[2];
  if (Math.abs(dz) <= 1e-9) return null;
  const t = (cota - rayo.origen[2]) / dz;
  if (t < 0) return null;
  return [
    rayo.origen[0] + rayo.direccion[0] * t,
    rayo.origen[1] + rayo.direccion[1] * t,
    cota,
  ];
}

/**
 * Altura sobre un eje Z que pasa por `base` del punto del rayo más cercano a ese
 * eje. Es la forma de que el ratón suba y baje el sólido sin invertir el signo
 * según la cámara.
 */
export function alturaEnEjeVertical(rayo: Rayo, base: [number, number, number]): number | null {
  const o: [number, number, number] = [
    rayo.origen[0] - base[0],
    rayo.origen[1] - base[1],
    rayo.origen[2] - base[2],
  ];
  const d = rayo.direccion;
  const u: [number, number, number] = [0, 0, 1];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const b = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const c = 1;
  const den = a * c - b * b;
  if (Math.abs(den) <= 1e-12) return null;
  const w = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const e = o[0] * u[0] + o[1] * u[1] + o[2] * u[2];
  const t = (b * e - c * w) / den;
  if (t < 0) return null;
  const p = [
    rayo.origen[0] + d[0] * t,
    rayo.origen[1] + d[1] * t,
    rayo.origen[2] + d[2] * t,
  ];
  return p[2] - base[2];
}

function numero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s+/g, "").replace(",", ".");
  if (limpio === "" || limpio === "." || limpio === "-" || limpio === "+") return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Dimensiones tecleadas «ancho,largo» en metros. Acepta coma, punto y coma o
 * espacios como separador: «4,0.15», «4 , 0.15», «4;0.15».
 */
export function parsearDimensiones(texto: string): DimensionesEmpujar | null {
  const partes = texto.split(/[,;]/);
  if (partes.length !== 2) return null;
  const ancho = numero(partes[0]);
  const largo = numero(partes[1]);
  if (ancho === null || largo === null || ancho <= 0 || largo <= 0) return null;
  return { ancho, largo };
}

/** Altura tecleada en metros; admite negativos (solo válidos en Genérico). */
export function parsearAltura(texto: string): number | null {
  const valor = numero(texto);
  if (valor === null || Math.abs(valor) <= TOLERANCIA) return null;
  return valor;
}

/** Texto corto de la cota provisional: «4.00 × 0.15 m». */
export function textoDimensiones(r: RectanguloEmpujar): string {
  const { ancho, largo } = anchoLargo(r);
  return `${ancho.toFixed(2)} × ${largo.toFixed(2)} m`;
}
