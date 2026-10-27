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

// ---------------------------------------------------------------------------
// O012: aristas exteriores. En la vista sombreada no se dibuja la arista que cae
// sobre la cara de otro elemento unido del mismo material (por ejemplo, el borde
// del extremo de una viga recortada en la cara de una columna). Las aristas de
// silueta sí se conservan.

export interface ElementoParaAristas {
  globalid: string;
  categoria: string;
  vertices: Float32Array;
  indices: Uint32Array;
}

function clavePunto(x: number, y: number, z: number, decimales = 5): string {
  return `${x.toFixed(decimales)},${y.toFixed(decimales)},${z.toFixed(decimales)}`;
}

function claveSegmento(
  a: [number, number, number],
  b: [number, number, number],
): string {
  const ka = clavePunto(a[0], a[1], a[2]);
  const kb = clavePunto(b[0], b[1], b[2]);
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

interface AristaCruda {
  a: [number, number, number];
  b: [number, number, number];
  normales: Array<[number, number, number]>;
}

function aristasCrudas(
  vertices: Float32Array,
  indices: Uint32Array,
): AristaCruda[] {
  const mapa = new Map<string, AristaCruda>();
  const vertice = (i: number): [number, number, number] => [
    vertices[i * 3],
    vertices[i * 3 + 1],
    vertices[i * 3 + 2],
  ];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = vertice(indices[i]);
    const b = vertice(indices[i + 1]);
    const c = vertice(indices[i + 2]);
    const normal = normalDe(a, b, c);
    if (Math.hypot(normal[0], normal[1], normal[2]) < 0.5) continue;
    const lados: Array<[[number, number, number], [number, number, number]]> = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [p, q] of lados) {
      const clave = claveSegmento(p, q);
      const actual = mapa.get(clave);
      if (actual) {
        actual.normales.push(normal);
      } else {
        mapa.set(clave, { a: p, b: q, normales: [normal] });
      }
    }
  }
  return [...mapa.values()];
}

function esAristaDeSilueta(arista: AristaCruda, umbral = 30): boolean {
  if (arista.normales.length === 1) return true;
  const coseno = Math.cos((umbral * Math.PI) / 180);
  for (let i = 0; i < arista.normales.length; i += 1) {
    for (let j = i + 1; j < arista.normales.length; j += 1) {
      const a = arista.normales[i];
      const b = arista.normales[j];
      if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] < coseno - 1e-9) {
        return true;
      }
    }
  }
  return false;
}

function puntoEnTriangulo(
  p: [number, number, number],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): number {
  const ab: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const largo = Math.hypot(n[0], n[1], n[2]);
  if (largo < EPS) return Infinity;
  const normal: [number, number, number] = [n[0] / largo, n[1] / largo, n[2] / largo];
  const distanciaPlano = Math.abs(
    (p[0] - a[0]) * normal[0] +
      (p[1] - a[1]) * normal[1] +
      (p[2] - a[2]) * normal[2],
  );
  const q: [number, number, number] = [
    p[0] - normal[0] * ((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1] + (p[2] - a[2]) * normal[2]),
    p[1] - normal[1] * ((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1] + (p[2] - a[2]) * normal[2]),
    p[2] - normal[2] * ((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1] + (p[2] - a[2]) * normal[2]),
  ];
  const v0: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v1: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v2: [number, number, number] = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
  const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2];
  const d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
  const d20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2];
  const d21 = v2[0] * v1[0] + v2[1] * v1[1] + v2[2] * v1[2];
  const den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < EPS) return Infinity;
  const v = (d11 * d20 - d01 * d21) / den;
  const w = (d00 * d21 - d01 * d20) / den;
  if (v >= -1e-9 && w >= -1e-9 && v + w <= 1 + 1e-9) return distanciaPlano;
  // Fuera del triángulo: distancia al borde más cercano.
  const distanciaSegmento = (
    punto: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
  ): number => {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    const t =
      l2 < EPS
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((punto[0] - p1[0]) * dx + (punto[1] - p1[1]) * dy + (punto[2] - p1[2]) * dz) / l2,
            ),
          );
    return Math.hypot(
      punto[0] - (p1[0] + dx * t),
      punto[1] - (p1[1] + dy * t),
      punto[2] - (p1[2] + dz * t),
    );
  };
  return Math.min(
    distanciaSegmento(p, a, b),
    distanciaSegmento(p, b, c),
    distanciaSegmento(p, c, a),
  );
}

function cajaDe(elemento: ElementoParaAristas): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < elemento.vertices.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], elemento.vertices[i + k]);
      max[k] = Math.max(max[k], elemento.vertices[i + k]);
    }
  }
  return { min, max };
}

function grupoDeMaterial(categoria: string): string {
  // Vigas, columnas y zapatas comparten el concreto estructural aunque el visor
  // las separe en categorías para colorear.
  if (categoria === "vigas" || categoria === "columnas" || categoria === "otros") {
    return "concreto_estructural";
  }
  return categoria;
}

function raizMedia(arista: AristaCruda): [number, number, number] {
  return [
    (arista.a[0] + arista.b[0]) / 2,
    (arista.a[1] + arista.b[1]) / 2,
    (arista.a[2] + arista.b[2]) / 2,
  ];
}

/** Aristas que caen sobre la superficie de otro elemento del mismo material. */
export function aristasInternasUniones(
  elementos: ElementoParaAristas[],
): Set<string> {
  const cajas = new Map(
    elementos.map((elemento) => [elemento.globalid, cajaDe(elemento)]),
  );
  const internas = new Set<string>();
  for (const elemento of elementos) {
    const aristas = aristasCrudas(elemento.vertices, elemento.indices);
    for (const arista of aristas) {
      const medio: [number, number, number] = [
        (arista.a[0] + arista.b[0]) / 2,
        (arista.a[1] + arista.b[1]) / 2,
        (arista.a[2] + arista.b[2]) / 2,
      ];
      for (const otro of elementos) {
        if (otro.globalid === elemento.globalid) continue;
        if (grupoDeMaterial(otro.categoria) !== grupoDeMaterial(elemento.categoria)) {
          continue;
        }
        const caja = cajas.get(otro.globalid)!;
        const dentroCaja = (p: [number, number, number]) =>
          p[0] >= caja.min[0] - 1e-4 && p[0] <= caja.max[0] + 1e-4 &&
          p[1] >= caja.min[1] - 1e-4 && p[1] <= caja.max[1] + 1e-4 &&
          p[2] >= caja.min[2] - 1e-4 && p[2] <= caja.max[2] + 1e-4;
        if (!dentroCaja(arista.a) && !dentroCaja(arista.b) && !dentroCaja(medio)) {
          continue;
        }
        // La arista completa debe caer sobre la superficie del otro elemento;
        // si sólo la cruza en un tramo, el resto sigue siendo silueta y se dibuja.
        const puntos = [arista.a, raizMedia(arista), arista.b] as const;
        const sobreSuperficie = (p: [number, number, number]): boolean => {
          for (let i = 0; i + 2 < otro.indices.length; i += 3) {
            const a: [number, number, number] = [
              otro.vertices[otro.indices[i] * 3],
              otro.vertices[otro.indices[i] * 3 + 1],
              otro.vertices[otro.indices[i] * 3 + 2],
            ];
            const b: [number, number, number] = [
              otro.vertices[otro.indices[i + 1] * 3],
              otro.vertices[otro.indices[i + 1] * 3 + 1],
              otro.vertices[otro.indices[i + 1] * 3 + 2],
            ];
            const c: [number, number, number] = [
              otro.vertices[otro.indices[i + 2] * 3],
              otro.vertices[otro.indices[i + 2] * 3 + 1],
              otro.vertices[otro.indices[i + 2] * 3 + 2],
            ];
            if (puntoEnTriangulo(p, a, b, c) <= 1e-4) return true;
          }
          return false;
        };
        if (puntos.every(sobreSuperficie)) {
          internas.add(claveSegmento(arista.a, arista.b));
          break;
        }
      }
    }
  }
  return internas;
}

/** Segmentos exteriores de una malla, listos para LineSegments. */
export function aristasParaElemento(
  vertices: Float32Array,
  indices: Uint32Array,
  internas: Set<string> = new Set(),
): Float32Array {
  const salida: number[] = [];
  for (const arista of aristasCrudas(vertices, indices)) {
    if (!esAristaDeSilueta(arista)) continue;
    if (internas.has(claveSegmento(arista.a, arista.b))) continue;
    salida.push(...arista.a, ...arista.b);
  }
  return new Float32Array(salida);
}
