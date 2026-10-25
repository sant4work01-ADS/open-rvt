// OPEN-RVT (O003b): matemática pura de las herramientas de dibujo en planta. Se
// separa del visor para probarla sin WebGL: enganches, ángulo a 15°, longitud tecleada
// y colocación de aberturas sobre un muro.

export type Punto2 = [number, number];
export type TipoEnganche =
  | "extremo"
  | "medio"
  | "interseccion"
  | "perpendicular"
  | "cuadricula";

export interface MuroReferencia {
  globalid: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  espesor: number;
  altura: number;
}

export interface EjeReferencia {
  globalid: string;
  etiqueta: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  vertical: boolean;
}

export interface Referencias {
  muros: MuroReferencia[];
  extremos: Punto2[];
  medios: Punto2[];
  ejes: EjeReferencia[];
  intersecciones: Punto2[];
  /** O006d: modo y rebase de la retícula guardados en el IfcGrid. */
  reticula?: { modo: "origen" | "rebase"; rebase: number };
}

export interface Enganche {
  punto: Punto2;
  tipo: TipoEnganche;
}

export const PASO_CUADRICULA = 0.05;
export const PASO_ANGULO = Math.PI / 12; // 15°
export const TOLERANCIA_ENGANCHE = 0.25;

export const REFERENCIAS_VACIAS: Referencias = {
  muros: [],
  extremos: [],
  medios: [],
  ejes: [],
  intersecciones: [],
  reticula: { modo: "origen", rebase: 1.5 },
};

export function distancia(a: Punto2, b: Punto2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Redondea a la cuadrícula de 5 cm. */
export function redondearCuadricula(p: Punto2, paso = PASO_CUADRICULA): Punto2 {
  return [Math.round(p[0] / paso) * paso, Math.round(p[1] / paso) * paso];
}

/**
 * Fija el ángulo del segmento origen→destino a múltiplos de 15°. Con `shift` se
 * desactiva y se devuelve el destino original (solo cuadriculado).
 */
export function fijarAngulo(origen: Punto2, destino: Punto2, shift = false): Punto2 {
  const dx = destino[0] - origen[0];
  const dy = destino[1] - origen[1];
  const largo = Math.hypot(dx, dy);
  if (shift || largo < 1e-9) return destino;
  const angulo = Math.round(Math.atan2(dy, dx) / PASO_ANGULO) * PASO_ANGULO;
  return [origen[0] + Math.cos(angulo) * largo, origen[1] + Math.sin(angulo) * largo];
}

/** Proyección de un punto sobre un segmento; devuelve punto y parámetro 0…1. */
export function proyectarSobreSegmento(
  p: Punto2,
  a: Punto2,
  b: Punto2,
): { punto: Punto2; t: number; distancia: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  const t =
    largo2 <= 1e-12
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2));
  const punto: Punto2 = [a[0] + t * dx, a[1] + t * dy];
  return { punto, t, distancia: distancia(p, punto) };
}

/**
 * Busca el enganche más cercano. Prioridad: extremo, punto medio, intersección de
 * ejes, perpendicular a un muro y, por último, la cuadrícula de 5 cm.
 */
export function buscarEnganche(
  raton: Punto2,
  refs: Referencias,
  desde: Punto2 | null = null,
  tolerancia = TOLERANCIA_ENGANCHE,
): Enganche {
  const candidatos: Array<{ punto: Punto2; tipo: TipoEnganche }> = [];
  for (const p of refs.extremos) candidatos.push({ punto: p, tipo: "extremo" });
  for (const p of refs.medios) candidatos.push({ punto: p, tipo: "medio" });
  for (const p of refs.intersecciones) candidatos.push({ punto: p, tipo: "interseccion" });
  if (desde) {
    for (const muro of refs.muros) {
      const proy = proyectarSobreSegmento(
        desde,
        [muro.x1, muro.y1],
        [muro.x2, muro.y2],
      );
      const separacion = distancia(raton, proy.punto);
      if (separacion <= tolerancia) {
        candidatos.push({ punto: proy.punto, tipo: "perpendicular" });
      }
    }
  }
  let mejor: Enganche | null = null;
  const orden: TipoEnganche[] = [
    "extremo",
    "medio",
    "interseccion",
    "perpendicular",
  ];
  for (const tipo of orden) {
    for (const candidato of candidatos) {
      if (candidato.tipo !== tipo) continue;
      if (distancia(raton, candidato.punto) > tolerancia) continue;
      if (!mejor || distancia(raton, candidato.punto) < distancia(raton, mejor.punto)) {
        mejor = candidato;
      }
    }
    if (mejor) return mejor;
  }
  return { punto: redondearCuadricula(raton), tipo: "cuadricula" };
}

/** Aplica enganche y, si hay un punto de origen, el ángulo fijo a 15°. */
export function puntoDibujo(
  raton: Punto2,
  refs: Referencias,
  desde: Punto2 | null,
  shift = false,
): Enganche {
  const enganche = buscarEnganche(raton, refs, desde);
  if (!desde) return enganche;
  const conAngulo = fijarAngulo(desde, enganche.punto, shift);
  return {
    punto: [Number(conAngulo[0].toFixed(6)), Number(conAngulo[1].toFixed(6))],
    tipo: enganche.tipo,
  };
}

/** Punto a `longitud` metros del origen en la dirección del cursor (ángulo a 15°). */
export function puntoConLongitud(
  origen: Punto2,
  cursor: Punto2,
  longitud: number,
  shift = false,
): Punto2 {
  const fijado = fijarAngulo(origen, cursor, shift);
  const dx = fijado[0] - origen[0];
  const dy = fijado[1] - origen[1];
  const largo = Math.hypot(dx, dy);
  if (largo < 1e-9 || longitud <= 0) return origen;
  return [
    Number((origen[0] + (dx / largo) * longitud).toFixed(6)),
    Number((origen[1] + (dy / largo) * longitud).toFixed(6)),
  ];
}

/**
 * O005c: siguiente etiqueta libre de eje, igual que el núcleo. Los ejes verticales
 * llevan números (1, 2, 3…) y los horizontales letras (A, B, C…).
 */
export function siguienteEtiquetaEje(ejes: EjeReferencia[], vertical: boolean): string {
  const usadas = new Set(ejes.map((eje) => eje.etiqueta.trim().toLowerCase()));
  if (vertical) {
    let numero = 1;
    while (usadas.has(String(numero))) numero += 1;
    return String(numero);
  }
  let indice = 0;
  while (usadas.has(String.fromCharCode(65 + indice).toLowerCase())) indice += 1;
  return String.fromCharCode(65 + indice);
}

/** O006d: restricciones iniciales al dibujar un eje junto a una familia existente. */
export interface EjeRestringido {
  inicio: Punto2;
  fin: Punto2;
  vertical: boolean;
  referencia: EjeReferencia;
  /** Distancia perpendicular al eje de referencia (m). */
  distancia: number;
}

const TOLERANCIA_PARALELO_EJE = (15 * Math.PI) / 180;

/**
 * O006d: si el trazo forma menos de 15° con una familia existente, devuelve el eje
 * forzado paralelo, con los extremos de esa familia y la posición perpendicular del
 * cursor. Con `libre` (Ctrl o Alt) no restringe. Sin ejes previos tampoco.
 */
export function restringirEje(
  origen: Punto2,
  raton: Punto2,
  ejes: EjeReferencia[],
  libre = false,
): EjeRestringido | null {
  if (libre || ejes.length === 0) return null;
  const dx = raton[0] - origen[0];
  const dy = raton[1] - origen[1];
  const largo = Math.hypot(dx, dy);
  if (largo < 1e-9) return null;
  const trazo: [number, number] = [dx / largo, dy / largo];
  let referencia: EjeReferencia | null = null;
  let mejorAngulo = TOLERANCIA_PARALELO_EJE;
  for (const eje of ejes) {
    const ex = eje.x2 - eje.x1;
    const ey = eje.y2 - eje.y1;
    const le = Math.hypot(ex, ey);
    if (le < 1e-9) continue;
    const coseno = Math.abs(trazo[0] * (ex / le) + trazo[1] * (ey / le));
    const angulo = Math.acos(Math.min(1, coseno));
    if (angulo <= mejorAngulo) {
      mejorAngulo = angulo;
      referencia = eje;
    }
  }
  if (!referencia) return null;
  return ejeEnFamilia(referencia, ejes, raton[0], raton[1]);
}

/** Construye el eje con los extremos de `referencia` y la posición pedida. */
function ejeEnFamilia(
  referencia: EjeReferencia,
  ejes: EjeReferencia[],
  x: number,
  y: number,
): EjeRestringido {
  const vertical = Math.abs(referencia.x2 - referencia.x1) <
    Math.abs(referencia.y2 - referencia.y1);
  const familia = ejes.filter(
    (e) => Math.abs(e.x2 - e.x1) < Math.abs(e.y2 - e.y1) === vertical,
  );
  const cercano = familia.reduce(
    (a, b) => {
      const da = Math.abs((vertical ? a.x1 : a.y1) - (vertical ? x : y));
      const db = Math.abs((vertical ? b.x1 : b.y1) - (vertical ? x : y));
      return db < da ? b : a;
    },
    referencia,
  );
  if (vertical) {
    const inicio: Punto2 = [Number(x.toFixed(6)), cercano.y1];
    const fin: Punto2 = [Number(x.toFixed(6)), cercano.y2];
    return {
      inicio,
      fin,
      vertical: true,
      referencia: cercano,
      distancia: Math.abs(x - cercano.x1),
    };
  }
  const inicio: Punto2 = [cercano.x1, Number(y.toFixed(6))];
  const fin: Punto2 = [cercano.x2, Number(y.toFixed(6))];
  return {
    inicio,
    fin,
    vertical: false,
    referencia: cercano,
    distancia: Math.abs(y - cercano.y1),
  };
}

/**
 * O006d: eje restringido a una distancia tecleada del paralelo más cercano. El lado
 * lo decide la posición del cursor. Devuelve `null` si no hay familia aplicable.
 */
export function ejeConDistancia(
  origen: Punto2,
  raton: Punto2,
  ejes: EjeReferencia[],
  distancia: number,
  libre = false,
): EjeRestringido | null {
  const base = restringirEje(origen, raton, ejes, libre);
  if (!base || distancia <= 0) return null;
  const vertical = base.vertical;
  const ref = base.referencia;
  const posRef = vertical ? ref.x1 : ref.y1;
  const posRaton = vertical ? raton[0] : raton[1];
  const lado = posRaton - posRef >= 0 ? 1 : -1;
  return ejeEnFamilia(ref, ejes, vertical ? posRef + lado * distancia : raton[0],
    vertical ? raton[1] : posRef + lado * distancia);
}

/** Distancia al eje paralelo más cercano de la familia que marca `vertical`. */
export function distanciaAEjeParalelo(
  punto: Punto2,
  ejes: EjeReferencia[],
  vertical: boolean,
): { referencia: EjeReferencia; distancia: number } | null {
  let mejor: { referencia: EjeReferencia; distancia: number } | null = null;
  for (const eje of ejes) {
    const esVertical = Math.abs(eje.x2 - eje.x1) < Math.abs(eje.y2 - eje.y1);
    if (esVertical !== vertical) continue;
    const distancia = Math.abs((vertical ? punto[0] : punto[1]) -
      (vertical ? eje.x1 : eje.y1));
    if (!mejor || distancia < mejor.distancia) mejor = { referencia: eje, distancia };
  }
  return mejor;
}

export interface AberturaColocada {
  muro: MuroReferencia;
  distancia: number;
  punto: Punto2;
  desdeInicio: number;
  hastaFin: number;
}

/** Muro más cercano a un punto (para colocar puertas y ventanas). */
export function muroBajoPunto(
  refs: Referencias,
  punto: Punto2,
  tolerancia = 0.35,
): { muro: MuroReferencia; punto: Punto2; distancia: number } | null {
  let mejor: { muro: MuroReferencia; punto: Punto2; distancia: number } | null = null;
  for (const muro of refs.muros) {
    const proy = proyectarSobreSegmento(punto, [muro.x1, muro.y1], [muro.x2, muro.y2]);
    const alcance = Math.max(tolerancia, muro.espesor / 2 + 0.12);
    if (proy.distancia > alcance) continue;
    if (!mejor || proy.distancia < mejor.distancia) {
      mejor = { muro, punto: proy.punto, distancia: proy.distancia };
    }
  }
  return mejor;
}

/**
 * Ajusta la abertura a la cuadrícula de 5 cm, centrada en la posición del cursor, y
 * la mantiene dentro del muro. Devuelve las cotas a los extremos para dibujarlas.
 */
export function colocarAbertura(
  refs: Referencias,
  raton: Punto2,
  ancho: number,
): AberturaColocada | null {
  const bajo = muroBajoPunto(refs, raton);
  if (!bajo) return null;
  const { muro } = bajo;
  const largo = Math.hypot(muro.x2 - muro.x1, muro.y2 - muro.y1);
  const avance =
    proyectarSobreSegmento(raton, [muro.x1, muro.y1], [muro.x2, muro.y2]).t * largo;
  const desdeInicio = Math.max(
    0,
    Math.min(
      largo - ancho,
      Math.round((avance - ancho / 2) / PASO_CUADRICULA) * PASO_CUADRICULA,
    ),
  );
  const hastaFin = Math.max(0, largo - (desdeInicio + ancho));
  const ux = largo > 0 ? (muro.x2 - muro.x1) / largo : 1;
  const uy = largo > 0 ? (muro.y2 - muro.y1) / largo : 0;
  const punto: Punto2 = [
    muro.x1 + ux * (desdeInicio + ancho / 2),
    muro.y1 + uy * (desdeInicio + ancho / 2),
  ];
  return { muro, distancia: desdeInicio, punto, desdeInicio, hastaFin };
}

/** Área del polígono (positiva en sentido antihorario). */
export function areaPoligono(puntos: Punto2[]): number {
  let area = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    const [x1, y1] = puntos[i];
    const [x2, y2] = puntos[(i + 1) % puntos.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function formatearMetros(valor: number): string {
  return `${valor.toFixed(2)} m`;
}
