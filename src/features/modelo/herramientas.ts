// OPEN-RVT (O003b): matemática pura de las herramientas de dibujo en planta. Se
// separa del visor para probarla sin WebGL: enganches, ángulo a 15°, longitud tecleada
// y colocación de aberturas sobre un muro.

export type Punto2 = [number, number];
export type TipoEnganche =
  | "extremo"
  | "medio"
  | "cruce"
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
/** O006e: la tolerancia del enganche es de 12 px de pantalla, no de 25 cm. */
export const TOLERANCIA_PX = 12;
/**
 * O013: el cruce de ejes engancha siempre dentro de media columna (0.30 / 2 m),
 * aunque el zoom haga que 12 px midan menos. El cruce es la referencia de obra
 * para columnas, castillos y zapatas; los codos son anotación y no lo desplazan.
 */
export const TOLERANCIA_CRUCE_M = 0.15;
/** 0,02 m/px es el zoom de trabajo por omisión cuando no se conoce la cámara. */
export const METROS_POR_PIXEL_POR_OMISION = 0.02;

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

/** ED2: reflexión de un punto respecto a la recta a-b. */
export function reflejarPunto(punto: Punto2, a: Punto2, b: Punto2): Punto2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  if (largo2 <= 1e-18) return [punto[0], punto[1]];
  const t = ((punto[0] - a[0]) * dx + (punto[1] - a[1]) * dy) / largo2;
  const px = a[0] + dx * t;
  const py = a[1] + dy * t;
  return [Number((2 * px - punto[0]).toFixed(9)), Number((2 * py - punto[1]).toFixed(9))];
}

/**
 * ED2: paso de una matriz lineal. «Al segundo» usa el vector tal cual; «Al
 * último» lo reparte entre las N−1 copias.
 */
export function vectorMatrizLineal(
  vector: Punto2,
  numero: number,
  modo: "al_segundo" | "al_ultimo",
): Punto2 {
  if (numero < 2) return [0, 0];
  if (modo === "al_ultimo") {
    return [vector[0] / (numero - 1), vector[1] / (numero - 1)];
  }
  return [vector[0], vector[1]];
}

/**
 * ED2: ángulos (radianes) de las copias polares, sin incluir el original. Con
 * 360° se reparte entre N para no duplicar la primera copia al cerrar.
 */
export function angulosMatrizPolar(anguloTotal: number, numero: number): number[] {
  if (numero < 2) return [];
  const total = (anguloTotal * Math.PI) / 180;
  const divisor = Math.abs(Math.abs(anguloTotal) - 360) <= 1e-9 ? numero : numero - 1;
  const paso = total / divisor;
  return Array.from({ length: numero - 1 }, (_v, i) => paso * (i + 1));
}

export interface EjeDeSimetria {
  p1: Punto2;
  p2: Punto2;
  tipo: "eje" | "muro";
}

/** ED2: eje del modelo o eje de un elemento lineal más cercano al clic. */
export function ejeBajoPunto(
  refs: Referencias,
  punto: Punto2,
  tolerancia = 0.35,
): EjeDeSimetria | null {
  let mejor: EjeDeSimetria | null = null;
  let distanciaMejor = Infinity;
  for (const eje of refs.ejes) {
    const proy = proyectarSobreSegmento(punto, [eje.x1, eje.y1], [eje.x2, eje.y2]);
    if (proy.distancia > tolerancia) continue;
    if (proy.distancia < distanciaMejor) {
      distanciaMejor = proy.distancia;
      mejor = { p1: [eje.x1, eje.y1], p2: [eje.x2, eje.y2], tipo: "eje" };
    }
  }
  for (const muro of refs.muros) {
    const proy = proyectarSobreSegmento(punto, [muro.x1, muro.y1], [muro.x2, muro.y2]);
    const alcance = Math.max(tolerancia, muro.espesor / 2 + 0.12);
    if (proy.distancia > alcance) continue;
    if (proy.distancia < distanciaMejor) {
      distanciaMejor = proy.distancia;
      mejor = { p1: [muro.x1, muro.y1], p2: [muro.x2, muro.y2], tipo: "muro" };
    }
  }
  return mejor;
}

/**
 * O007b: cruces de ejes calculados a partir de los ejes (no depende de que el núcleo
 * los haya publicado ya). Es el enganche de columnas, castillos y zapatas.
 */
export function crucesDeEjes(ejes: EjeReferencia[]): Punto2[] {
  const cruces: Punto2[] = [];
  for (let i = 0; i < ejes.length; i += 1) {
    const a = ejes[i];
    const ax = a.x2 - a.x1;
    const ay = a.y2 - a.y1;
    for (let j = i + 1; j < ejes.length; j += 1) {
      const b = ejes[j];
      const bx = b.x2 - b.x1;
      const by = b.y2 - b.y1;
      const den = ax * by - ay * bx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((b.x1 - a.x1) * by - (b.y1 - a.y1) * bx) / den;
      const u = ((b.x1 - a.x1) * ay - (b.y1 - a.y1) * ax) / den;
      if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
      cruces.push([a.x1 + t * ax, a.y1 + t * ay]);
    }
  }
  return cruces;
}

/**
 * O006e: candidatos discretos dentro de la tolerancia en píxeles. Gana el más
 * cercano; la prioridad solo desempata si la diferencia es de 3 px o menos.
 */
const PRIORIDAD_ENGANCHE: TipoEnganche[] = [
  "interseccion",
  "cruce",
  "extremo",
  "medio",
  "perpendicular",
];

/**
 * Busca el enganche más cercano. `metrosPorPixel` lo calcula el visor con la
 * cámara actual; la tolerancia resultante es de 12 px en cualquier zoom.
 */
export function buscarEnganche(
  raton: Punto2,
  refs: Referencias,
  desde: Punto2 | null = null,
  metrosPorPixel = METROS_POR_PIXEL_POR_OMISION,
): Enganche {
  const mpp = Number.isFinite(metrosPorPixel) && metrosPorPixel > 0
    ? metrosPorPixel
    : METROS_POR_PIXEL_POR_OMISION;
  const tolerancia = TOLERANCIA_PX * mpp;
  // O013: los ejes son líneas del modelo (IfcGrid); sus cruces tienen un alcance
  // mínimo de media columna y no dependen del zoom ni de los codos de la vista.
  const toleranciaCruce = Math.max(tolerancia, TOLERANCIA_CRUCE_M);
  const candidatos: Array<{ punto: Punto2; tipo: TipoEnganche; alcance: number }> = [];
  for (const p of refs.extremos) candidatos.push({ punto: p, tipo: "extremo", alcance: tolerancia });
  for (const p of refs.medios) candidatos.push({ punto: p, tipo: "medio", alcance: tolerancia });
  for (const p of crucesDeEjes(refs.ejes)) {
    candidatos.push({ punto: p, tipo: "cruce", alcance: toleranciaCruce });
  }
  for (const p of refs.intersecciones) {
    candidatos.push({ punto: p, tipo: "interseccion", alcance: tolerancia });
  }
  if (desde) {
    for (const muro of refs.muros) {
      const proy = proyectarSobreSegmento(
        desde,
        [muro.x1, muro.y1],
        [muro.x2, muro.y2],
      );
      if (distancia(raton, proy.punto) <= tolerancia) {
        candidatos.push({ punto: proy.punto, tipo: "perpendicular", alcance: tolerancia });
      }
    }
  }
  const validos = candidatos.filter((c) => distancia(raton, c.punto) <= c.alcance);
  if (validos.length === 0) {
    return { punto: redondearCuadricula(raton), tipo: "cuadricula" };
  }
  const masCercano = Math.min(...validos.map((c) => distancia(raton, c.punto)));
  const empate = 3 * mpp;
  const finalistas = validos.filter(
    (c) => distancia(raton, c.punto) <= masCercano + empate,
  );
  finalistas.sort((a, b) => {
    const pa = PRIORIDAD_ENGANCHE.indexOf(a.tipo);
    const pb = PRIORIDAD_ENGANCHE.indexOf(b.tipo);
    if (pa !== pb) return pa - pb;
    return distancia(raton, a.punto) - distancia(raton, b.punto);
  });
  return finalistas[0];
}

/**
 * O006e: intersecciones de todos los pares de ejes no paralelos dentro de sus
 * segmentos, con 0,5 m de tolerancia en los extremos.
 */
export function interseccionesDeEjes(
  ejes: EjeReferencia[],
  toleranciaExtremos = 0.5,
): Punto2[] {
  const salida: Punto2[] = [];
  for (let i = 0; i < ejes.length; i += 1) {
    const a = ejes[i];
    for (let j = i + 1; j < ejes.length; j += 1) {
      const b = ejes[j];
      const dxa = a.x2 - a.x1;
      const dya = a.y2 - a.y1;
      const dxb = b.x2 - b.x1;
      const dyb = b.y2 - b.y1;
      const den = dxa * dyb - dya * dxb;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((b.x1 - a.x1) * dyb - (b.y1 - a.y1) * dxb) / den;
      const u = ((b.x1 - a.x1) * dya - (b.y1 - a.y1) * dxa) / den;
      const la = Math.hypot(dxa, dya);
      const lb = Math.hypot(dxb, dyb);
      if (la < 1e-9 || lb < 1e-9) continue;
      const extraA = toleranciaExtremos / la;
      const extraB = toleranciaExtremos / lb;
      if (t < -extraA || t > 1 + extraA || u < -extraB || u > 1 + extraB) continue;
      const punto: Punto2 = [
        Number((a.x1 + t * dxa).toFixed(6)),
        Number((a.y1 + t * dya).toFixed(6)),
      ];
      if (
        !salida.some(
          (p) => Math.hypot(p[0] - punto[0], p[1] - punto[1]) < 1e-6,
        )
      ) {
        salida.push(punto);
      }
    }
  }
  return salida.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** O006e: referencias con las intersecciones recalculadas a partir de sus ejes. */
export function referenciasAlDia(refs: Referencias): Referencias {
  if (refs.ejes.length === 0) return refs;
  return { ...refs, intersecciones: interseccionesDeEjes(refs.ejes) };
}

/** O006e: texto del tipo de enganche junto al cursor. */
export function describirEnganche(enganche: Enganche, refs: Referencias): string {
  switch (enganche.tipo) {
    case "interseccion": {
      const [x, y] = enganche.punto;
      const cercanos = refs.ejes
        .map((eje) => ({
          eje,
          d: proyectarSobreSegmento([x, y], [eje.x1, eje.y1], [eje.x2, eje.y2])
            .distancia,
        }))
        .filter((c) => c.d <= 0.01)
        .sort((a, b) => a.d - b.d);
      if (cercanos.length >= 2) {
        const horizontales = cercanos.filter((c) => !c.eje.vertical);
        const verticales = cercanos.filter((c) => c.eje.vertical);
        const h = horizontales[0]?.eje.etiqueta;
        const v = verticales[0]?.eje.etiqueta;
        if (h && v) return `Intersección ${h}-${v}`;
      }
      return "Intersección";
    }
    case "extremo":
      return "Extremo";
    case "medio":
      return "Punto medio";
    case "perpendicular":
      return "Perpendicular";
    default:
      return "Cuadrícula";
  }
}

/**
 * Aplica el enganche y, solo con la cuadrícula, el ángulo fijo a 15°. Los
 * enganches discretos (extremo, medio, intersección, perpendicular) se respetan
 * exactamente para no sacar el punto del cruce.
 */
export function puntoDibujo(
  raton: Punto2,
  refs: Referencias,
  desde: Punto2 | null,
  shift = false,
  metrosPorPixel = METROS_POR_PIXEL_POR_OMISION,
): Enganche {
  const enganche = buscarEnganche(raton, refs, desde, metrosPorPixel);
  if (!desde || enganche.tipo !== "cuadricula") return enganche;
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
 * O036b: los ejes solo son horizontales o verticales. El segundo punto se
 * proyecta sobre la dirección dominante medida desde el primer punto:
 * |dx| ≥ |dy| → horizontal; si no, vertical.
 */
export function ejeOrtogonal(
  origen: Punto2,
  destino: Punto2,
): { fin: Punto2; vertical: boolean } {
  const dx = destino[0] - origen[0];
  const dy = destino[1] - origen[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { fin: [destino[0], origen[1]], vertical: false };
  }
  return { fin: [origen[0], destino[1]], vertical: true };
}

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

/**
 * O043: nivel y desfase con los que se crea un cerramiento desde la vista activa.
 *
 * En una planta manda el nivel de la planta (desfase 0) salvo que la barra de
 * opciones haya elegido otro nivel o desfase. En alzado, corte y 3D se conserva la
 * regla de O041: sin datos explícitos, el núcleo cuelga el cerramiento del tope del
 * muro.
 */
export function opcionesCerramientoEnVista(
  vista: { tipo: string; nivel?: string } | undefined,
  opciones: { nivel: string; desfase: string },
  niveles: readonly { globalid: string; elevacion: number }[] = [],
): { nivel?: string; desfase?: number } {
  if (vista?.tipo !== "planta") return {};
  const desfase = Number(opciones.desfase.replace(",", "."));
  const desfaseValido =
    opciones.desfase.trim() !== "" && Number.isFinite(desfase);
  // O043: en la planta más baja no se fuerza su nivel (el cerramiento quedaría a
  // ras de suelo); ahí sigue mandando la regla de O041 salvo elección expresa.
  if (!plantaTomaNivelPropio(vista, niveles)) {
    return {
      ...(opciones.nivel ? { nivel: opciones.nivel } : {}),
      ...(desfaseValido ? { desfase } : {}),
    };
  }
  const nivel = opciones.nivel || vista.nivel;
  return {
    ...(nivel ? { nivel } : {}),
    desfase: desfaseValido ? desfase : 0,
  };
}

/** O043: ¿la planta activa tiene algún nivel por debajo (nivel intermedio)? */
export function plantaTomaNivelPropio(
  vista: { tipo: string; nivel?: string } | undefined,
  niveles: readonly { globalid: string; elevacion: number }[],
): boolean {
  if (vista?.tipo !== "planta" || !vista.nivel) return false;
  const propio = niveles.find((n) => n.globalid === vista.nivel);
  if (!propio) return false;
  return niveles.some((n) => n.elevacion < propio.elevacion - 1e-9);
}

export interface TramoCerramiento {
  /** Muro al que se liga el tramo, o null si va libre. */
  muro: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * O045: parte un trazo de cerramiento en los muros que tiene debajo.
 *
 * Un tramo es colineal con un muro cuando sus dos extremos quedan dentro de la
 * mitad del espesor del muro y su proyección cae dentro de su largo. Si abarca
 * varios muros seguidos se devuelve uno por muro, cortado en las juntas; los
 * huecos sin muro se devuelven libres (muro null).
 */
export function tramosDeCerramiento(
  referencias: Referencias,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerancia = 0.01,
): TramoCerramiento[] {
  const largo = Math.hypot(x2 - x1, y2 - y1);
  if (largo <= tolerancia) return [];
  const ux = (x2 - x1) / largo;
  const uy = (y2 - y1) / largo;
  const ligados: Array<TramoCerramiento & { s0: number; s1: number }> = [];
  for (const muro of referencias.muros) {
    const longitud = Math.hypot(muro.x2 - muro.x1, muro.y2 - muro.y1);
    if (longitud <= tolerancia) continue;
    const mux = (muro.x2 - muro.x1) / longitud;
    const muy = (muro.y2 - muro.y1) / longitud;
    const alcance = muro.espesor / 2 + tolerancia;
    const dist1 = Math.abs(mux * (y1 - muro.y1) - muy * (x1 - muro.x1));
    const dist2 = Math.abs(mux * (y2 - muro.y1) - muy * (x2 - muro.x1));
    if (dist1 > alcance || dist2 > alcance) continue;
    const t1 = (x1 - muro.x1) * mux + (y1 - muro.y1) * muy;
    const t2 = (x2 - muro.x1) * mux + (y2 - muro.y1) * muy;
    const inicio = Math.max(0, Math.min(t1, t2));
    const fin = Math.min(longitud, Math.max(t1, t2));
    if (fin - inicio <= tolerancia) continue;
    const qx1 = muro.x1 + mux * inicio;
    const qy1 = muro.y1 + muy * inicio;
    const qx2 = muro.x1 + mux * fin;
    const qy2 = muro.y1 + muy * fin;
    const s1 = ((qx1 - x1) * ux + (qy1 - y1) * uy) / largo;
    const s2 = ((qx2 - x1) * ux + (qy2 - y1) * uy) / largo;
    ligados.push({
      muro: muro.globalid,
      x1: qx1,
      y1: qy1,
      x2: qx2,
      y2: qy2,
      s0: Math.min(s1, s2),
      s1: Math.max(s1, s2),
    });
  }
  ligados.sort((a, b) => a.s0 - b.s0);
  const salida: TramoCerramiento[] = [];
  let cursor = 0;
  for (const tramo of ligados) {
    if (tramo.s0 > cursor + tolerancia) {
      salida.push({
        muro: null,
        x1: x1 + ux * largo * cursor,
        y1: y1 + uy * largo * cursor,
        x2: x1 + ux * largo * tramo.s0,
        y2: y1 + uy * largo * tramo.s0,
      });
    }
    salida.push({
      muro: tramo.muro,
      x1: tramo.x1,
      y1: tramo.y1,
      x2: tramo.x2,
      y2: tramo.y2,
    });
    cursor = Math.max(cursor, tramo.s1);
  }
  if (cursor < 1 - tolerancia) {
    salida.push({
      muro: null,
      x1: x1 + ux * largo * cursor,
      y1: y1 + uy * largo * cursor,
      x2,
      y2,
    });
  }
  return salida;
}
