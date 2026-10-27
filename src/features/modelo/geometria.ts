// OPEN-RVT (O010): normales planas para los sólidos del visor. La malla del IFC trae
// triángulos indexados y `computeVertexNormals` promedia las normales entre caras
// perpendiculares, lo que produce degradados y manchas en 3D. Aquí se separan los
// vértices por triángulo y se orientan las caras coplanares en el mismo sentido.

export interface MallaPlana {
  /** Tres vértices por triángulo, sin índice (cada cara conserva su normal). */
  posiciones: Float32Array;
  /** Una normal por vértice; los tres vértices de una cara comparten la normal. */
  normales: Float32Array;
}

interface Triangulo {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  normal: [number, number, number];
  clave: string;
}

const EPS = 1e-9;

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
  if (largo < EPS) return [0, 0, 0];
  return [nx / largo, ny / largo, nz / largo];
}

/** Clave canónica del plano: el signo de la normal no cambia el plano. */
function clavePlano(
  a: [number, number, number],
  normal: [number, number, number],
): string {
  let n = normal;
  // Lleva la normal al semiespacio +X (o +Y/+Z si X es casi cero) para agrupar
  // también los triángulos que quedaron con el sentido invertido.
  if (
    n[0] < -1e-7 ||
    (Math.abs(n[0]) <= 1e-7 && n[1] < -1e-7) ||
    (Math.abs(n[0]) <= 1e-7 && Math.abs(n[1]) <= 1e-7 && n[2] < 0)
  ) {
    n = [-n[0], -n[1], -n[2]];
  }
  const d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
  return [n[0], n[1], n[2], d].map((v) => v.toFixed(5)).join("|");
}

/**
 * Devuelve posiciones y normales planas: una normal por cara plana y triángulos
 * coplanares alineados entre sí. Los triángulos degenerados reciben +Z.
 */
export function mallaConNormalesPlanas(
  vertices: Float32Array | number[],
  indices: Uint32Array | number[],
): MallaPlana {
  const lista: Triangulo[] = [];
  const grupos = new Map<string, Triangulo[]>();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const a: [number, number, number] = [vertices[ia], vertices[ia + 1], vertices[ia + 2]];
    const b: [number, number, number] = [vertices[ib], vertices[ib + 1], vertices[ib + 2]];
    const c: [number, number, number] = [vertices[ic], vertices[ic + 1], vertices[ic + 2]];
    const normal = normalDe(a, b, c);
    const triangulo: Triangulo = { a, b, c, normal, clave: clavePlano(a, normal) };
    lista.push(triangulo);
    const grupo = grupos.get(triangulo.clave);
    if (grupo) grupo.push(triangulo);
    else grupos.set(triangulo.clave, [triangulo]);
  }

  // En cada plano, la suma de normales (ponderada por área) marca el sentido
  // mayoritario; los triángulos invertidos se alinean con él.
  for (const grupo of grupos.values()) {
    const suma: [number, number, number] = [0, 0, 0];
    for (const t of grupo) {
      const ux = t.b[0] - t.a[0];
      const uy = t.b[1] - t.a[1];
      const uz = t.b[2] - t.a[2];
      const vx = t.c[0] - t.a[0];
      const vy = t.c[1] - t.a[1];
      const vz = t.c[2] - t.a[2];
      const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      suma[0] += t.normal[0] * area;
      suma[1] += t.normal[1] * area;
      suma[2] += t.normal[2] * area;
    }
    const largo = Math.hypot(suma[0], suma[1], suma[2]);
    const direccion: [number, number, number] =
      largo > EPS ? [suma[0] / largo, suma[1] / largo, suma[2] / largo] : [0, 0, 1];
    for (const t of grupo) {
      if (t.normal[0] * direccion[0] + t.normal[1] * direccion[1] + t.normal[2] * direccion[2] < 0) {
        t.normal = [-t.normal[0], -t.normal[1], -t.normal[2]];
      } else {
        t.normal = direccion;
      }
    }
  }

  const posiciones = new Float32Array(lista.length * 9);
  const normales = new Float32Array(lista.length * 9);
  lista.forEach((t, i) => {
    const base = i * 9;
    posiciones.set(t.a, base);
    posiciones.set(t.b, base + 3);
    posiciones.set(t.c, base + 6);
    for (let v = 0; v < 3; v += 1) {
      normales.set(t.normal, base + v * 3);
    }
  });
  return { posiciones, normales };
}

/** Utilidad de prueba: normales únicas de una malla plana. */
export function normalesUnicas(malla: MallaPlana, decimales = 3): number[][] {
  const vistas = new Set<string>();
  const salida: number[][] = [];
  for (let i = 0; i < malla.normales.length; i += 3) {
    const n = [malla.normales[i], malla.normales[i + 1], malla.normales[i + 2]];
    const clave = n.map((v) => v.toFixed(decimales)).join(",");
    if (!vistas.has(clave)) {
      vistas.add(clave);
      salida.push(n);
    }
  }
  return salida;
}
