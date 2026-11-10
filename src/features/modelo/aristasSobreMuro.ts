// O062: aristas de losas y estructura que caen sobre una cara vertical del muro.
// El visor dibuja las aristas con `LineBasicMaterial`; cuando la cara o la arista
// de una losa, un cerramiento, un castillo o una viga queda a menos de la piel
// del muro, la línea se cuela por delante de la piel (empate o casi empate de
// profundidad). Estas aristas no aportan información: la cara del muro es plana.

import {
  aristasCrudas,
  claveSegmento,
  esAristaDeSilueta,
  type ElementoParaAristas,
} from "./geometria";

/** Misma piel que `PIEL_MURO` del núcleo (aplanado). */
export const PIEL_MURO_M = 0.015;

/** Categorías de estructura y losas cuyas caras pueden quedar enrasadas al muro. */
export const CATEGORIAS_ESTRUCTURALES: ReadonlySet<string> = new Set([
  "losas",
  "vigas",
  "columnas",
]);

const MARGEN_PLANO = PIEL_MURO_M + 1e-3;
const TOLERANCIA = 1e-4;

interface Triangulo2D {
  u: [number, number, number];
  z: [number, number, number];
}

interface CaraVertical {
  normal: [number, number, number];
  constante: number;
  u: [number, number, number];
  minU: number;
  maxU: number;
  minZ: number;
  maxZ: number;
  triangulos: Triangulo2D[];
}

function normalDe(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const largo = Math.hypot(nx, ny, nz);
  if (largo < 1e-9) return [0, 0, 0];
  return [nx / largo, ny / largo, nz / largo];
}

function signoCanonico(n: [number, number, number]): [number, number, number] {
  if (n[0] < -1e-7 || (Math.abs(n[0]) <= 1e-7 && n[1] < -1e-7)) {
    return [-n[0], -n[1], -n[2]];
  }
  return n;
}

function baseHorizontal(n: [number, number, number]): [number, number, number] {
  const largo = Math.hypot(n[0], n[1]);
  if (largo < 1e-9) return [1, 0, 0];
  return [-n[1] / largo, n[0] / largo, 0];
}

function puntoEnTriangulo2(
  u: number,
  z: number,
  tri: Triangulo2D,
): boolean {
  const [au, az] = [tri.u[0], tri.z[0]];
  const [bu, bz] = [tri.u[1], tri.z[1]];
  const [cu, cz] = [tri.u[2], tri.z[2]];
  const d1 = (bu - au) * (z - az) - (bz - az) * (u - au);
  const d2 = (cu - bu) * (z - bz) - (cz - bz) * (u - bu);
  const d3 = (au - cu) * (z - cz) - (az - cz) * (u - cu);
  const positivos = d1 >= -TOLERANCIA && d2 >= -TOLERANCIA && d3 >= -TOLERANCIA;
  const negativos = d1 <= TOLERANCIA && d2 <= TOLERANCIA && d3 <= TOLERANCIA;
  return positivos || negativos;
}

function dentroDeCara(
  cara: CaraVertical,
  punto: [number, number, number],
): boolean {
  const distancia = Math.abs(
    punto[0] * cara.normal[0] +
      punto[1] * cara.normal[1] +
      punto[2] * cara.normal[2] -
      cara.constante,
  );
  if (distancia > MARGEN_PLANO) return false;
  const u = punto[0] * cara.u[0] + punto[1] * cara.u[1];
  if (u < cara.minU - TOLERANCIA || u > cara.maxU + TOLERANCIA) return false;
  if (punto[2] < cara.minZ - TOLERANCIA || punto[2] > cara.maxZ + TOLERANCIA) {
    return false;
  }
  return cara.triangulos.some((tri) => puntoEnTriangulo2(u, punto[2], tri));
}

function carasVerticalesDeMuros(
  elementos: readonly ElementoParaAristas[],
): CaraVertical[] {
  const porPlano = new Map<string, CaraVertical>();
  for (const elemento of elementos) {
    if (elemento.categoria !== "muros") continue;
    const { vertices, indices } = elemento;
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;
      const a: [number, number, number] = [vertices[ia], vertices[ia + 1], vertices[ia + 2]];
      const b: [number, number, number] = [vertices[ib], vertices[ib + 1], vertices[ib + 2]];
      const c: [number, number, number] = [vertices[ic], vertices[ic + 1], vertices[ic + 2]];
      const normal = normalDe(a, b, c);
      if (Math.abs(normal[2]) > 0.2) continue;
      const n = signoCanonico(normal);
      const constante = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
      const clave = `${n.map((v) => v.toFixed(5)).join(",")}|${constante.toFixed(5)}`;
      const base = baseHorizontal(n);
      const ua = a[0] * base[0] + a[1] * base[1];
      const ub = b[0] * base[0] + b[1] * base[1];
      const uc = c[0] * base[0] + c[1] * base[1];
      const tri: Triangulo2D = {
        u: [ua, ub, uc],
        z: [a[2], b[2], c[2]],
      };
      const actual = porPlano.get(clave);
      if (actual) {
        actual.triangulos.push(tri);
        actual.minU = Math.min(actual.minU, ua, ub, uc);
        actual.maxU = Math.max(actual.maxU, ua, ub, uc);
        actual.minZ = Math.min(actual.minZ, a[2], b[2], c[2]);
        actual.maxZ = Math.max(actual.maxZ, a[2], b[2], c[2]);
      } else {
        porPlano.set(clave, {
          normal: n,
          constante,
          u: base,
          minU: Math.min(ua, ub, uc),
          maxU: Math.max(ua, ub, uc),
          minZ: Math.min(a[2], b[2], c[2]),
          maxZ: Math.max(a[2], b[2], c[2]),
          triangulos: [tri],
        });
      }
    }
  }
  return [...porPlano.values()];
}

function puntosDeArista(
  a: [number, number, number],
  b: [number, number, number],
): Array<[number, number, number]> {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}

/**
 * Aristas de losas y estructura que quedan sobre una cara vertical de un muro
 * (dentro de la piel + 1 mm y dentro de la extensión de la cara). El visor deja
 * de dibujarlas para que no se cuelen por delante de la piel.
 */
export function aristasOcultasSobreMuro(
  elementos: readonly ElementoParaAristas[],
): Set<string> {
  const caras = carasVerticalesDeMuros(elementos);
  const ocultas = new Set<string>();
  if (caras.length === 0) return ocultas;
  let cimaMuros = -Infinity;
  for (const elemento of elementos) {
    if (elemento.categoria !== "muros") continue;
    for (let i = 2; i < elemento.vertices.length; i += 3) {
      cimaMuros = Math.max(cimaMuros, elemento.vertices[i]);
    }
  }
  for (const elemento of elementos) {
    if (!CATEGORIAS_ESTRUCTURALES.has(elemento.categoria)) continue;
    for (const arista of aristasCrudas(elemento.vertices, elemento.indices)) {
      if (!esAristaDeSilueta(arista)) continue;
      // Los cuadritos de los castillos en la corona del muro se conservan: son
      // horizontales en el plano superior del muro, no líneas sobre su cara.
      const horizontalEnCima =
        Math.abs(arista.a[2] - arista.b[2]) < 1e-6 &&
        arista.a[2] >= cimaMuros - TOLERANCIA;
      if (horizontalEnCima) continue;
      const puntos = puntosDeArista(arista.a, arista.b);
      let tapada = false;
      for (const cara of caras) {
        if (puntos.every((punto) => dentroDeCara(cara, punto))) {
          tapada = true;
          break;
        }
      }
      if (tapada) ocultas.add(claveSegmento(arista.a, arista.b));
    }
  }
  return ocultas;
}

/** Añade al conjunto las aristas ocultas de una lista de mallas visibles. */
export function agregarAristasOcultasSobreMuro(
  destino: Set<string>,
  elementos: readonly ElementoParaAristas[],
): void {
  for (const clave of aristasOcultasSobreMuro(
    elementos.filter(
      (elemento) =>
        elemento.categoria === "muros" ||
        CATEGORIAS_ESTRUCTURALES.has(elemento.categoria),
    ),
  )) {
    destino.add(clave);
  }
}
