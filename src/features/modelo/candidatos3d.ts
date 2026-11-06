// O049: candidatos de inferencia armados desde las mallas del visor.
//
// La escena no se recorre con three.js aquí: el módulo es puro y recibe vértices
// e índices. Deduplica vértices, deja solo las aristas de quiebre o de borde y
// funde los triángulos coplanares en una cara con su normal. El caché por
// elemento se invalida con una revisión del modelo que inyecta la vista.

import type {
  CaraPlana,
  CandidatosInferencia,
  Segmento3,
  Vec3,
} from "./inferencias3d";

export interface MallaCandidata {
  globalid: string;
  vertices: Float32Array | number[];
  indices: Uint32Array | number[];
}

export interface Envolvente {
  min: Vec3;
  max: Vec3;
}

export interface CandidatosMalla {
  vertices: Vec3[];
  aristas: Segmento3[];
  caras: CaraPlana[];
  /** Caja en metros; la vista la proyecta para descartar lejos del cursor. */
  envolvente: Envolvente;
}

export interface PuntoPantalla {
  x: number;
  y: number;
}

const EPS = 1e-9;
const DECIMALES = 6;
const COSENO_QUIEBRE = Math.cos((30 * Math.PI) / 180);

const clavePunto = (p: Vec3): string =>
  [p.x, p.y, p.z].map((v) => v.toFixed(DECIMALES)).join(",");

const sumar = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const restar = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const escalar = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const punto = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

function normalizar(a: Vec3): Vec3 | null {
  const l = Math.hypot(a.x, a.y, a.z);
  if (l < EPS) return null;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function productoVectorial(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalTriangulo(a: Vec3, b: Vec3, c: Vec3): Vec3 | null {
  return normalizar(productoVectorial(restar(b, a), restar(c, a)));
}

/** Clave del plano independiente del sentido de la normal. */
function clavePlano(p: Vec3, normal: Vec3): string {
  let n = normal;
  if (
    n.x < -1e-7 ||
    (Math.abs(n.x) <= 1e-7 && n.y < -1e-7) ||
    (Math.abs(n.x) <= 1e-7 && Math.abs(n.y) <= 1e-7 && n.z < 0)
  ) {
    n = { x: -n.x, y: -n.y, z: -n.z };
  }
  const d = punto(n, p);
  return [n.x, n.y, n.z, d].map((v) => v.toFixed(5)).join("|");
}

interface Triangulo {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  keA: string;
  keB: string;
  keC: string;
  normal: Vec3;
  clave: string;
}

interface AristaInterna {
  a: Vec3;
  b: Vec3;
  keA: string;
  keB: string;
  normales: Vec3[];
}

function leerVertice(
  vertices: Float32Array | number[],
  indices: Uint32Array | number[],
  indice: number,
): Vec3 {
  const i = indices[indice] * 3;
  return { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
}

function claveArista(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** Encadena las aristas de borde de una cara coplanar en uno o más polígonos. */
function poligonosDeCara(
  bordes: { a: Vec3; b: Vec3; keA: string; keB: string }[],
): Vec3[][] {
  if (bordes.length === 0) return [];
  const adyacencia = new Map<string, { otro: string; punto: Vec3 }[]>();
  const puntos = new Map<string, Vec3>();
  for (const borde of bordes) {
    puntos.set(borde.keA, borde.a);
    puntos.set(borde.keB, borde.b);
    const listaA = adyacencia.get(borde.keA) ?? [];
    listaA.push({ otro: borde.keB, punto: borde.b });
    adyacencia.set(borde.keA, listaA);
    const listaB = adyacencia.get(borde.keB) ?? [];
    listaB.push({ otro: borde.keA, punto: borde.a });
    adyacencia.set(borde.keB, listaB);
  }

  const visitadas = new Set<string>();
  const poligonos: Vec3[][] = [];
  const aristasVisitadas = new Set<string>();
  for (const borde of bordes) {
    const clave = claveArista(borde.keA, borde.keB);
    if (aristasVisitadas.has(clave)) continue;
    const inicio = borde.keA;
    const poligono: Vec3[] = [];
    let actual = inicio;
    let anterior = "";
    let protegido = 0;
    while (protegido <= bordes.length + 1) {
      protegido += 1;
      if (visitadas.has(actual) && actual !== inicio) break;
      const p = puntos.get(actual);
      if (!p) break;
      if (actual === inicio && poligono.length > 0) break;
      poligono.push(p);
      visitadas.add(actual);
      const opciones = (adyacencia.get(actual) ?? []).filter(
        (o) => o.otro !== anterior && !aristasVisitadas.has(claveArista(actual, o.otro)),
      );
      if (opciones.length === 0) break;
      const siguiente = opciones[0];
      aristasVisitadas.add(claveArista(actual, siguiente.otro));
      anterior = actual;
      actual = siguiente.otro;
      if (actual === inicio) break;
    }
    if (poligono.length >= 3) poligonos.push(poligono);
  }
  return poligonos;
}

function centroide(poligono: Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of poligono) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(poligono.length, 1);
  return { x: x / n, y: y / n, z: z / n };
}

function orientarHaciaFuera(
  normal: Vec3,
  poligono: Vec3[],
  centroMalla: Vec3,
): Vec3 {
  const c = centroide(poligono);
  return punto(normal, restar(c, centroMalla)) < 0
    ? { x: -normal.x, y: -normal.y, z: -normal.z }
    : normal;
}

/** Caja en metros de la malla, calculada sin armar aristas ni caras. */
export function envolventeDeMalla(malla: MallaCandidata): Envolvente {
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i + 2 < malla.vertices.length; i += 3) {
    const x = malla.vertices[i];
    const y = malla.vertices[i + 1];
    const z = malla.vertices[i + 2];
    min = { x: Math.min(min.x, x), y: Math.min(min.y, y), z: Math.min(min.z, z) };
    max = { x: Math.max(max.x, x), y: Math.max(max.y, y), z: Math.max(max.z, z) };
  }
  if (!Number.isFinite(min.x)) {
    min = { x: 0, y: 0, z: 0 };
    max = { x: 0, y: 0, z: 0 };
  }
  return { min, max };
}

/** Candidatos (vértices, aristas de quiebre y caras planas) de una malla. */
export function candidatosDeMalla(malla: MallaCandidata): CandidatosMalla {
  const triangulos: Triangulo[] = [];
  const aristas = new Map<string, AristaInterna>();

  for (let i = 0; i + 2 < malla.indices.length; i += 3) {
    const a = leerVertice(malla.vertices, malla.indices, i);
    const b = leerVertice(malla.vertices, malla.indices, i + 1);
    const c = leerVertice(malla.vertices, malla.indices, i + 2);
    const normal = normalTriangulo(a, b, c);
    if (!normal) continue;
    const keA = clavePunto(a);
    const keB = clavePunto(b);
    const keC = clavePunto(c);
    if (keA === keB || keB === keC || keA === keC) continue;
    const triangulo: Triangulo = {
      a,
      b,
      c,
      keA,
      keB,
      keC,
      normal,
      clave: clavePlano(a, normal),
    };
    triangulos.push(triangulo);
    for (const [ka, kb, pa, pb] of [
      [keA, keB, a, b],
      [keB, keC, b, c],
      [keC, keA, c, a],
    ] as [string, string, Vec3, Vec3][]) {
      const clave = claveArista(ka, kb);
      const existente =
        aristas.get(clave) ??
        (() => {
          const nueva: AristaInterna = { a: pa, b: pb, keA: ka, keB: kb, normales: [] };
          aristas.set(clave, nueva);
          return nueva;
        })();
      existente.normales.push(normal);
    }
  }

  const unicos = new Map<string, Vec3>();
  for (const triangulo of triangulos) {
    unicos.set(triangulo.keA, triangulo.a);
    unicos.set(triangulo.keB, triangulo.b);
    unicos.set(triangulo.keC, triangulo.c);
  }
  const vertices = [...unicos.values()];

  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of vertices) {
    min = { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) };
    max = { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) };
  }
  if (vertices.length === 0) {
    min = { x: 0, y: 0, z: 0 };
    max = { x: 0, y: 0, z: 0 };
  }
  const centroMalla = escalar(sumar(min, max), 0.5);

  const segmentos: Segmento3[] = [];
  for (const arista of aristas.values()) {
    const esBorde = arista.normales.length === 1;
    const esQuiebre =
      arista.normales.length > 1 &&
      arista.normales.some((n, i) =>
        arista.normales.some(
          (otra, j) => i !== j && punto(n, otra) < COSENO_QUIEBRE - 1e-7,
        ),
      );
    if (!esBorde && !esQuiebre) continue;
    segmentos.push({ inicio: arista.a, fin: arista.b });
  }

  const grupos = new Map<
    string,
    {
      normal: Vec3;
      triangulos: Triangulo[];
    }
  >();
  for (const triangulo of triangulos) {
    const grupo = grupos.get(triangulo.clave);
    if (grupo) {
      grupo.triangulos.push(triangulo);
      grupo.normal = sumar(grupo.normal, triangulo.normal);
    } else {
      grupos.set(triangulo.clave, { normal: triangulo.normal, triangulos: [triangulo] });
    }
  }

  const caras: CaraPlana[] = [];
  for (const grupo of grupos.values()) {
    const bordes: { a: Vec3; b: Vec3; keA: string; keB: string }[] = [];
    const conteo = new Map<string, { a: Vec3; b: Vec3; keA: string; keB: string; n: number }>();
    for (const triangulo of grupo.triangulos) {
      for (const [ka, kb, pa, pb] of [
        [triangulo.keA, triangulo.keB, triangulo.a, triangulo.b],
        [triangulo.keB, triangulo.keC, triangulo.b, triangulo.c],
        [triangulo.keC, triangulo.keA, triangulo.c, triangulo.a],
      ] as [string, string, Vec3, Vec3][]) {
        const clave = claveArista(ka, kb);
        const actual = conteo.get(clave);
        if (actual) {
          actual.n += 1;
        } else {
          conteo.set(clave, { a: pa, b: pb, keA: ka, keB: kb, n: 1 });
        }
      }
    }
    for (const borde of conteo.values()) {
      if (borde.n === 1) bordes.push(borde);
    }
    let normal = normalizar(grupo.normal);
    if (!normal) continue;
    normal = orientarHaciaFuera(normal, grupo.triangulos.flatMap((t) => [t.a, t.b, t.c]), centroMalla);
    const poligonos = poligonosDeCara(bordes);
    for (const poligono of poligonos) {
      caras.push({ poligono, normal });
    }
  }

  return {
    vertices,
    aristas: segmentos,
    caras,
    envolvente: { min, max },
  };
}

/** Une los candidatos de varios elementos en una sola lista con índices estables. */
export function unirCandidatos(partes: CandidatosMalla[]): CandidatosInferencia {
  const vertices: Vec3[] = [];
  const aristas: Segmento3[] = [];
  const caras: CaraPlana[] = [];
  for (const parte of partes) {
    vertices.push(...parte.vertices);
    aristas.push(...parte.aristas);
    caras.push(...parte.caras);
  }
  return { vertices, aristas, caras };
}

/** Caja envolvente proyectada a píxeles (ocho esquinas). */
export function cajaEnPantalla(
  envolvente: Envolvente,
  proyectar: (p: Vec3) => PuntoPantalla,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of [envolvente.min.x, envolvente.max.x]) {
    for (const y of [envolvente.min.y, envolvente.max.y]) {
      for (const z of [envolvente.min.z, envolvente.max.z]) {
        const p = proyectar({ x, y, z });
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Distancia en píxeles del cursor a la caja proyectada (0 si está dentro). */
export function distanciaBBoxPantalla(
  envolvente: Envolvente,
  proyectar: (p: Vec3) => PuntoPantalla,
  cursor: PuntoPantalla,
): number | null {
  const caja = cajaEnPantalla(envolvente, proyectar);
  if (!caja) return null;
  const dx = Math.max(caja.minX - cursor.x, 0, cursor.x - caja.maxX);
  const dy = Math.max(caja.minY - cursor.y, 0, cursor.y - caja.maxY);
  return Math.hypot(dx, dy);
}

/** Solo las mallas cuya caja en pantalla está a `margen` px o menos del cursor. */
export function filtrarPorCercania<T extends { envolvente: Envolvente }>(
  mallas: T[],
  proyectar: (p: Vec3) => PuntoPantalla,
  cursor: PuntoPantalla,
  margen = 60,
): T[] {
  return mallas.filter((malla) => {
    const distancia = distanciaBBoxPantalla(malla.envolvente, proyectar, cursor);
    return distancia !== null && distancia <= margen;
  });
}

/** ¿El punto cae sobre una cara horizontal superior (normal +Z)? */
export function caraSuperiorEn(
  p: Vec3,
  caras: CaraPlana[],
  tolerancia = 1e-5,
): CaraPlana | null {
  for (const cara of caras) {
    if (!cara.normal || cara.normal.z < 1 - 1e-6) continue;
    if (cara.poligono.length < 3) continue;
    const d = Math.abs(punto(cara.normal, restar(p, cara.poligono[0])));
    if (d > tolerancia) continue;
    if (dentroDePoligonoHorario(p, cara.poligono)) return cara;
  }
  return null;
}

function dentroDePoligonoHorario(p: Vec3, poligono: Vec3[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    const cruz = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (
      Math.abs(cruz) <= 1e-7 &&
      p.x >= Math.min(a.x, b.x) - 1e-7 &&
      p.x <= Math.max(a.x, b.x) + 1e-7 &&
      p.y >= Math.min(a.y, b.y) - 1e-7 &&
      p.y <= Math.max(a.y, b.y) + 1e-7
    ) {
      return true;
    }
    if (a.y > p.y !== b.y > p.y) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) dentro = !dentro;
    }
  }
  return dentro;
}

interface EntradaCache {
  revision: unknown;
  datos: CandidatosMalla;
}

/** Caché por GlobalId; una revisión distinta del modelo la invalida. */
export class CacheCandidatosMallas {
  private entradas = new Map<string, EntradaCache>();

  obtener(malla: MallaCandidata, revision: unknown): CandidatosMalla {
    const previa = this.entradas.get(malla.globalid);
    if (previa && previa.revision === revision) return previa.datos;
    const datos = candidatosDeMalla(malla);
    this.entradas.set(malla.globalid, { revision, datos });
    return datos;
  }

  limpiar(globalid?: string): void {
    if (globalid === undefined) this.entradas.clear();
    else this.entradas.delete(globalid);
  }

  get tamano(): number {
    return this.entradas.size;
  }
}
