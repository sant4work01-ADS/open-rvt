// OPEN-RVT: geometría pura de la spec O005: intersección del plano de corte con las
// mallas (polilíneas cerradas + área), y simbología 2D de puertas y ventanas en planta.

export type Punto3 = [number, number, number];
export type Punto2 = [number, number];

/** Plano en la convención de three.js: `normal · p + constante = 0`. */
export interface PlanoSeccion {
  normal: Punto3;
  constante: number;
}

export interface PolilineaSeccion {
  puntos: Punto3[];
  cerrada: boolean;
  area: number;
}

function distanciaPlano(punto: Punto3, plano: PlanoSeccion): number {
  return punto[0] * plano.normal[0] + punto[1] * plano.normal[1] + punto[2] * plano.normal[2] + plano.constante;
}

/** Punto de corte entre una arista y el plano, por interpolación lineal. */
function corteArista(a: Punto3, b: Punto3, da: number, db: number): Punto3 {
  const t = da / (da - db);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function iguales(a: Punto3, b: Punto3, eps: number): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;
}

/** Base ortonormal del plano para medir áreas y longitudes. */
export function basePlano(normal: Punto3): { u: Punto3; v: Punto3 } {
  const n = normalizar(normal);
  const ayudante: Punto3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalizar(cruz(ayudante, n));
  const v = normalizar(cruz(n, u));
  return { u, v };
}

function normalizar(a: Punto3): Punto3 {
  const largo = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / largo, a[1] / largo, a[2] / largo];
}

function cruz(a: Punto3, b: Punto3): Punto3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Área de un polígono 2D (shoelace). */
export function areaPoligono2D(puntos: Punto2[]): number {
  let suma = 0;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    suma += puntos[j][0] * puntos[i][1] - puntos[i][0] * puntos[j][1];
  }
  return Math.abs(suma) / 2;
}

function areaEnPlano(puntos: Punto3[], normal: Punto3): number {
  const { u, v } = basePlano(normal);
  return areaPoligono2D(
    puntos.map((p) => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]),
  );
}

/**
 * Interseca una malla triangular con un plano. Devuelve las polilíneas resultantes,
 * unidas por sus extremos; cada vuelta cerrada lleva su área en el plano.
 */
export function interseccionPlanoMalla(
  vertices: ArrayLike<number>,
  indices: ArrayLike<number>,
  plano: PlanoSeccion,
  epsilon = 1e-5,
): PolilineaSeccion[] {
  const segmentos: Array<[Punto3, Punto3]> = [];
  const punto = (i: number): Punto3 => [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]];

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [punto(indices[t]), punto(indices[t + 1]), punto(indices[t + 2])];
    const d = tri.map((p) => distanciaPlano(p, plano));
    const corte: Punto3[] = [];
    for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      const a = tri[i];
      const b = tri[j];
      const da = d[i];
      const db = d[j];
      if (Math.abs(da) <= epsilon) {
        if (!corte.some((p) => iguales(p, a, epsilon))) corte.push(a);
      }
      if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
        const p = corteArista(a, b, da, db);
        if (!corte.some((q) => iguales(q, p, epsilon))) corte.push(p);
      }
    }
    if (corte.length === 2 && !iguales(corte[0], corte[1], epsilon)) {
      segmentos.push([corte[0], corte[1]]);
    }
  }

  return unirSegmentos(segmentos, plano.normal, epsilon);
}

function unirSegmentos(
  segmentos: Array<[Punto3, Punto3]>,
  normal: Punto3,
  epsilon: number,
): PolilineaSeccion[] {
  const usados = new Set<number>();
  const salida: PolilineaSeccion[] = [];
  const eps = Math.max(epsilon, 1e-6);

  const indiceDe = (p: Punto3): number => {
    for (let i = 0; i < segmentos.length; i += 1) {
      if (usados.has(i)) continue;
      if (iguales(segmentos[i][0], p, eps) || iguales(segmentos[i][1], p, eps)) return i;
    }
    return -1;
  };

  for (let inicio = 0; inicio < segmentos.length; inicio += 1) {
    if (usados.has(inicio)) continue;
    usados.add(inicio);
    const [a, b] = segmentos[inicio];
    const puntos: Punto3[] = [a, b];
    let actual = b;
    let cerrada = false;
    // Avanza por el extremo final hasta volver al punto inicial.
    for (let paso = 0; paso < segmentos.length + 1; paso += 1) {
      if (iguales(actual, puntos[0], eps)) {
        cerrada = true;
        break;
      }
      const siguiente = indiceDe(actual);
      if (siguiente < 0) break;
      usados.add(siguiente);
      const [s0, s1] = segmentos[siguiente];
      actual = iguales(s0, actual, eps) ? s1 : s0;
      puntos.push(actual);
    }
    if (puntos.length >= 3) {
      if (cerrada) puntos.pop();
      const limpios = simplificar(puntos, eps);
      salida.push({
        puntos: limpios,
        cerrada,
        area: areaEnPlano(limpios, normal),
      });
    }
  }
  return salida;
}

/** Quita vértices intermedios colineales para dejar una polilínea limpia. */
function simplificar(puntos: Punto3[], eps: number): Punto3[] {
  if (puntos.length < 4) return puntos;
  const salida: Punto3[] = [];
  for (let i = 0; i < puntos.length; i += 1) {
    const anterior = salida[salida.length - 1] ?? puntos[puntos.length - 1];
    const siguiente = puntos[(i + 1) % puntos.length];
    const a: Punto3 = [
      puntos[i][0] - anterior[0],
      puntos[i][1] - anterior[1],
      puntos[i][2] - anterior[2],
    ];
    const b: Punto3 = [
      siguiente[0] - puntos[i][0],
      siguiente[1] - puntos[i][1],
      siguiente[2] - puntos[i][2],
    ];
    const c = cruz(a, b);
    if (Math.hypot(c[0], c[1], c[2]) > eps * 10) salida.push(puntos[i]);
  }
  return salida.length >= 3 ? salida : puntos;
}

/** Suma de áreas de las polilíneas cerradas. */export function areaSeccion(polilineas: PolilineaSeccion[]): number {
  return polilineas.reduce((total, p) => total + p.area, 0);
}

// --------------------------------------------------------------- simbología 2D

export interface GeometriaPuerta {
  /** Contorno de la hoja abierta (rectángulo de 0,04 m de espesor). */
  hoja: Punto2[];
  /** Arco de abatimiento de 90°. */
  arco: Punto2[];
  /** Lado del abatimiento: +1 hacia un lado del muro, −1 hacia el otro. */
  lado: 1 | -1;
}

/**
 * Simbología de puerta en coordenadas locales: la bisagra está en (0,0), el muro
 * corre por +X y el abatimiento va hacia ±Y según `volteado`.
 */
export function geometriaPuerta(opciones: {
  ancho: number;
  espesorHoja?: number;
  volteado?: boolean;
  segmentos?: number;
}): GeometriaPuerta {
  const ancho = Math.max(opciones.ancho, 0.01);
  const espesor = opciones.espesorHoja ?? 0.04;
  const lado: 1 | -1 = opciones.volteado ? -1 : 1;
  const segmentos = Math.max(opciones.segmentos ?? 24, 4);
  const hoja: Punto2[] = [
    [0, 0],
    [espesor, 0],
    [espesor, ancho * lado],
    [0, ancho * lado],
    [0, 0],
  ];
  const arco: Punto2[] = [];
  for (let i = 0; i <= segmentos; i += 1) {
    const angulo = (Math.PI / 2) * (i / segmentos);
    arco.push([Math.cos(angulo) * ancho, Math.sin(angulo) * ancho * lado]);
  }
  return { hoja, arco, lado };
}

export interface GeometriaVentana {
  /** Las tres líneas del corte (dos paños y el vidrio central). */
  lineas: Punto2[][];
  /** Contorno del alféizar, ligeramente hacia el exterior. */
  alfeizar: Punto2[];
}

/** Simbología de ventana en coordenadas locales: ancho en X, espesor del muro en Y. */
export function geometriaVentana(opciones: {
  ancho: number;
  espesor: number;
  vueloAlfeizar?: number;
}): GeometriaVentana {
  const ancho = Math.max(opciones.ancho, 0.01);
  const espesor = Math.max(opciones.espesor, 0.02);
  const vuelo = opciones.vueloAlfeizar ?? 0.05;
  const mitad = espesor / 2;
  const lineas: Punto2[][] = [
    [
      [0, -mitad],
      [ancho, -mitad],
    ],
    [
      [0, 0],
      [ancho, 0],
    ],
    [
      [0, mitad],
      [ancho, mitad],
    ],
    [
      [0, -mitad],
      [0, mitad],
    ],
    [
      [ancho, -mitad],
      [ancho, mitad],
    ],
  ];
  const alfeizar: Punto2[] = [
    [-vuelo, -mitad - vuelo],
    [ancho + vuelo, -mitad - vuelo],
    [ancho + vuelo, mitad + vuelo],
    [-vuelo, mitad + vuelo],
    [-vuelo, -mitad - vuelo],
  ];
  return { lineas, alfeizar };
}

/** Coloca puntos locales (u, v) en el mundo: rotación, espejo y traslación. */export function colocarSimbolo(
  puntos: Punto2[],
  centro: Punto2,
  angulo: number,
  volteado = false,
): Punto2[] {
  const cos = Math.cos(angulo);
  const sen = Math.sin(angulo);
  return puntos.map(([u, v]) => {
    const vv = volteado ? -v : v;
    return [centro[0] + u * cos - vv * sen, centro[1] + u * sen + vv * cos];
  });
}

// --------------------------------------------------------------- capas de muro

export interface CapaPoligono {
  puntos: Punto2[];
  material: string;
}

function recortarPorRango(
  puntos: Punto2[],
  eje: (p: Punto2) => number,
  minimo: number,
  maximo: number,
): Punto2[] {
  const recortar = (entrada: Punto2[], dentro: (p: Punto2) => boolean, corte: (a: Punto2, b: Punto2) => Punto2) => {
    const salida: Punto2[] = [];
    for (let i = 0; i < entrada.length; i += 1) {
      const actual = entrada[i];
      const anterior = entrada[(i + entrada.length - 1) % entrada.length];
      const dentroActual = dentro(actual);
      const dentroAnterior = dentro(anterior);
      if (dentroActual) {
        if (!dentroAnterior) salida.push(corte(anterior, actual));
        salida.push(actual);
      } else if (dentroAnterior) {
        salida.push(corte(anterior, actual));
      }
    }
    return salida;
  };
  let salida = recortar(
    puntos,
    (p) => eje(p) >= minimo,
    (a, b) => {
      const t = (minimo - eje(a)) / (eje(b) - eje(a));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
  );
  salida = recortar(
    salida,
    (p) => eje(p) <= maximo,
    (a, b) => {
      const t = (maximo - eje(a)) / (eje(b) - eje(a));
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
  );
  return salida;
}

/**
 * Divide el polígono de una sección en bandas paralelas, una por capa del
 * IfcMaterialLayerSet, midiendo el espesor en el eje corto del polígono.
 */
export function dividirEnCapas(
  poligono: Punto2[],
  capas: Array<{ material: string; espesor: number }>,
): CapaPoligono[] {
  if (poligono.length < 3) return [];
  const validas = capas.filter((c) => c.espesor > 0);
  if (validas.length <= 1) {
    return [{ puntos: poligono, material: validas[0]?.material ?? "Genérico" }];
  }
  // Eje corto: se prueban los ángulos de las aristas y se queda el eje en el que el
  // polígono mide menos (el espesor del muro).
  let mejor = { ancho: Infinity, cos: 1, sen: 0 };
  for (let i = 0; i < poligono.length; i += 1) {
    const a = poligono[i];
    const b = poligono[(i + 1) % poligono.length];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (largo < 1e-9) continue;
    const cos = (b[0] - a[0]) / largo;
    const sen = (b[1] - a[1]) / largo;
    let minimo = Infinity;
    let maximo = -Infinity;
    for (const [x, y] of poligono) {
      const v = -x * sen + y * cos;
      minimo = Math.min(minimo, v);
      maximo = Math.max(maximo, v);
    }
    if (maximo - minimo < mejor.ancho) mejor = { ancho: maximo - minimo, cos, sen };
  }
  const eje = (p: Punto2) => -p[0] * mejor.sen + p[1] * mejor.cos;
  const valores = poligono.map(eje);
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const total = validas.reduce((s, c) => s + c.espesor, 0);
  const factor = total > 0 ? (maximo - minimo) / total : 1;

  const salida: CapaPoligono[] = [];
  let cursor = minimo;
  for (const capa of validas) {
    const fin = cursor + capa.espesor * factor;
    const banda = recortarPorRango(poligono, eje, cursor, fin);
    if (banda.length >= 3) salida.push({ puntos: banda, material: capa.material });
    cursor = fin;
  }
  return salida;
}
