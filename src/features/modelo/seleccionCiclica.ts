// O041: Tab recorre los elementos bajo el cursor en el orden muro → cerramiento →
// castillo → muro. La detección en planta es geométrica —el cerramiento queda por
// arriba del corte y no tiene malla que el rayo pueda tocar— y no depende del dibujo.
import type { ElementoMalla, LineaMuro } from "./tipos";
import type { Punto2 } from "./herramientas";

export type AliasCiclo = "muro" | "cerramiento" | "castillo";

export interface CandidatoTab {
  globalid: string;
  nombre: string;
  alias: AliasCiclo;
}

/** Orden obligatorio del ciclo (spec O041 §2). */
export const ORDEN_CICLO: readonly AliasCiclo[] = ["muro", "cerramiento", "castillo"];

const ALIAS_ETIQUETA: Record<AliasCiclo, string> = {
  muro: "Muro",
  cerramiento: "Cerramiento",
  castillo: "Castillo",
};

function numero(valor: unknown, respaldo = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : respaldo;
}

export function aliasCiclico(malla: ElementoMalla): AliasCiclo | null {
  if (malla.clase === "IfcWall") return "muro";
  const alias = malla.estructura?.alias;
  if (alias === "cerramiento" || alias === "castillo") return alias;
  return null;
}

/** Extremos de una huella de muro en el eje: las capas pueden ir a paño. */
function limitesMuro(malla: ElementoMalla): { min: number; max: number } {
  const centros = malla.capas.filter((capa) => capa.centro !== undefined);
  if (centros.length > 0) {
    return {
      min: Math.min(...centros.map((capa) => numero(capa.centro) - numero(capa.espesor) / 2)),
      max: Math.max(...centros.map((capa) => numero(capa.centro) + numero(capa.espesor) / 2)),
    };
  }
  const espesor = malla.capas.reduce((suma, capa) => suma + numero(capa.espesor), 0) || 0.15;
  return { min: -espesor / 2, max: espesor / 2 };
}

function parametroEnEje(eje: LineaMuro, punto: Punto2): {
  t: number;
  separacion: number;
  largo: number;
} {
  const [x1, y1, x2, y2] = eje;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const largo = Math.hypot(dx, dy);
  if (largo <= 1e-9) {
    return { t: 0, separacion: Math.hypot(punto[0] - x1, punto[1] - y1), largo: 0 };
  }
  const ux = dx / largo;
  const uy = dy / largo;
  const t = (punto[0] - x1) * ux + (punto[1] - y1) * uy;
  const separacion = Math.abs((punto[0] - x1) * -uy + (punto[1] - y1) * ux);
  return { t, separacion, largo };
}

function dentroMuro(malla: ElementoMalla, punto: Punto2, tolerancia: number): boolean {
  if (!malla.eje) return false;
  const { t, separacion, largo } = parametroEnEje(malla.eje, punto);
  if (largo <= 1e-9 || t < -tolerancia || t > largo + tolerancia) return false;
  const { min, max } = limitesMuro(malla);
  return separacion >= min - tolerancia && separacion <= max + tolerancia;
}

function dentroCerramiento(
  malla: ElementoMalla,
  punto: Punto2,
  tolerancia: number,
): boolean {
  const datos = malla.estructura?.datos;
  if (!datos) return false;
  const eje: LineaMuro = [
    numero(datos.X1),
    numero(datos.Y1),
    numero(datos.X2),
    numero(datos.Y2),
  ];
  const { t, separacion, largo } = parametroEnEje(eje, punto);
  if (largo <= 1e-9 || t < -tolerancia || t > largo + tolerancia) return false;
  const ancho = numero(malla.estructura?.seccion.B, numero(datos.B, 0.15));
  return separacion <= ancho / 2 + tolerancia;
}

function dentroCastillo(
  malla: ElementoMalla,
  punto: Punto2,
  tolerancia: number,
): boolean {
  const datos = malla.estructura?.datos;
  if (!datos) return false;
  const cx = numero(datos.X);
  const cy = numero(datos.Y);
  const rotacion = numero(datos.Rotacion);
  const ancho = numero(malla.estructura?.seccion.B, numero(datos.B, 0.15));
  const fondo = numero(malla.estructura?.seccion.H, numero(datos.H, 0.15));
  const coseno = Math.cos(rotacion);
  const seno = Math.sin(rotacion);
  const dx = punto[0] - cx;
  const dy = punto[1] - cy;
  const localX = dx * coseno + dy * seno;
  const localY = -dx * seno + dy * coseno;
  return (
    Math.abs(localX) <= ancho / 2 + tolerancia &&
    Math.abs(localY) <= fondo / 2 + tolerancia
  );
}

function contiene(malla: ElementoMalla, punto: Punto2, tolerancia: number): boolean {
  const alias = aliasCiclico(malla);
  if (alias === "muro") return dentroMuro(malla, punto, tolerancia);
  if (alias === "cerramiento") return dentroCerramiento(malla, punto, tolerancia);
  if (alias === "castillo") return dentroCastillo(malla, punto, tolerancia);
  return false;
}

function distanciaAlCentro(malla: ElementoMalla, punto: Punto2): number {
  if (malla.eje) {
    const [x1, y1, x2, y2] = malla.eje;
    return Math.hypot(punto[0] - (x1 + x2) / 2, punto[1] - (y1 + y2) / 2);
  }
  const datos = malla.estructura?.datos;
  if (datos) {
    return Math.hypot(punto[0] - numero(datos.X), punto[1] - numero(datos.Y));
  }
  return Infinity;
}

/**
 * Elementos bajo un punto de la planta, en el orden del ciclo. Un muro con su
 * cerramiento y sus castillos devuelve los tres; dentro de cada alias manda el más
 * cercano al punto.
 */
export function candidatosBajoPunto(
  mallas: readonly ElementoMalla[],
  punto: Punto2,
  tolerancia = 0.01,
): CandidatoTab[] {
  const encontrados = mallas
    .filter((malla) => contiene(malla, punto, tolerancia))
    .map((malla) => ({
      globalid: malla.globalid,
      nombre: malla.nombre,
      alias: aliasCiclico(malla) as AliasCiclo,
      distancia: distanciaAlCentro(malla, punto),
    }));
  encontrados.sort(
    (a, b) =>
      ORDEN_CICLO.indexOf(a.alias) - ORDEN_CICLO.indexOf(b.alias) ||
      a.distancia - b.distancia,
  );
  const vistos = new Set<string>();
  const salida: CandidatoTab[] = [];
  for (const candidato of encontrados) {
    if (vistos.has(candidato.globalid)) continue;
    vistos.add(candidato.globalid);
    salida.push({
      globalid: candidato.globalid,
      nombre: candidato.nombre,
      alias: candidato.alias,
    });
  }
  return salida;
}

/** Siguiente del ciclo; si la selección actual no está bajo el cursor, empieza. */
export function siguienteCandidato(
  candidatos: readonly CandidatoTab[],
  actual: string | null,
): CandidatoTab | null {
  if (candidatos.length === 0) return null;
  const indice = actual
    ? candidatos.findIndex((candidato) => candidato.globalid === actual)
    : -1;
  return candidatos[(indice + 1) % candidatos.length];
}

/** Texto de la barra de estado al pasar por un candidato. */
export function textoPistaTab(candidato: CandidatoTab | null): string | null {
  if (!candidato) return null;
  return `Tab: siguiente (${ALIAS_ETIQUETA[candidato.alias]} ${candidato.nombre})`;
}
