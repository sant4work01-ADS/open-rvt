// OPEN-RVT (O006e): planta limpia de muros. La huella de cada muro se une con la de
// los demás (L/T/X) y las líneas de capa se recortan contra la pieza vecina para que
// ninguna línea quede dentro de una esquina.
import * as clipping from "polygon-clipping";
import type { CapaMuro, LineaMuro } from "./tipos";
import type { Punto2 } from "./herramientas";

type Par = [number, number];
type Anillo = Par[];
type PoligonoCru = Anillo[];

const clip = ((clipping as unknown as { default?: typeof clipping }).default ??
  clipping) as typeof clipping;

export interface MuroPlanta {
  globalid: string;
  eje: LineaMuro;
  capas: CapaMuro[];
}

/**
 * O007c: sección en planta de un castillo o una columna. El núcleo del muro se
 * recorta contra ella; los acabados solo se cortan en las columnas y pasan por
 * encima de los castillos.
 */
export interface SeccionPlanta {
  globalid: string;
  x: number;
  y: number;
  ancho: number;
  fondo: number;
  rotacion: number;
  funcion: "castillo" | "columna";
}

export interface PoligonoPlanta {
  exterior: Punto2[];
  huecos: Punto2[][];
}

export interface CapaPlanta {
  material: string;
  funcion: string;
  lineas: Punto2[][];
}

export interface PlantaMuros {
  contorno: PoligonoPlanta[];
  capas: CapaPlanta[];
  rayado: Punto2[][];
}

function espesorDe(muro: MuroPlanta): number {
  const total = muro.capas.reduce((suma, capa) => suma + (capa.espesor || 0), 0);
  return total > 1e-6 ? total : 0.15;
}

function direccion(muro: MuroPlanta): { ux: number; uy: number; nx: number; ny: number; largo: number } {
  const [x1, y1, x2, y2] = muro.eje;
  const largo = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
  const ux = (x2 - x1) / largo;
  const uy = (y2 - y1) / largo;
  return { ux, uy, nx: -uy, ny: ux, largo };
}

function rectangulo(
  muro: MuroPlanta,
  desde: number,
  hasta: number,
  extensionInicio = 0,
  extensionFin = 0,
): Anillo {
  const [x1, y1] = muro.eje;
  const { ux, uy, nx, ny, largo } = direccion(muro);
  // Redondeo a 1e-9 m: dos huellas que tocan la misma cara por caminos distintos
  // (eje + desfase de ubicación) no deben dejar un vértice casi duplicado.
  const fijo = (v: number) => Math.round(v * 1e9) / 1e9;
  const punto = (t: number, off: number): Par => [
    fijo(x1 + ux * t + nx * off),
    fijo(y1 + uy * t + ny * off),
  ];
  const a = punto(-extensionInicio, desde);
  const b = punto(largo + extensionFin, desde);
  const c = punto(largo + extensionFin, hasta);
  const d = punto(-extensionInicio, hasta);
  return [a, b, c, d, a];
}

/**
 * En una unión en L (o una T) el muro se alarga hasta la cara más lejana del vecino.
 * O032: el vecino puede ir a paño, así que su cuerpo no está centrado en su línea
 * dibujada; el alcance se mide con sus límites reales, no con medio espesor.
 */
function alcanceHacia(otro: MuroPlanta, salida: Par): number {
  const { nx, ny } = direccion(otro);
  const { min, max } = limites(otro);
  const proyeccion = nx * salida[0] + ny * salida[1];
  return Math.max(0, proyeccion * min, proyeccion * max);
}

/** El punto cae sobre la línea dibujada del otro muro, lejos de sus extremos. */
function enTramo(otro: MuroPlanta, px: number, py: number): boolean {
  const [ox1, oy1, ox2, oy2] = otro.eje;
  const dx = ox2 - ox1;
  const dy = oy2 - oy1;
  const largo2 = dx * dx + dy * dy;
  if (largo2 <= 1e-12) return false;
  const t = ((px - ox1) * dx + (py - oy1) * dy) / largo2;
  if (t <= 0.02 || t >= 0.98) return false;
  return Math.hypot(px - (ox1 + t * dx), py - (oy1 + t * dy)) <= 0.01;
}

function extensionesEnExtremos(
  muro: MuroPlanta,
  todos: MuroPlanta[],
): { inicio: number; fin: number } {
  const [x1, y1, x2, y2] = muro.eje;
  const { ux, uy } = direccion(muro);
  let inicio = 0;
  let fin = 0;
  for (const otro of todos) {
    if (otro.globalid === muro.globalid) continue;
    const [ox1, oy1, ox2, oy2] = otro.eje;
    // O010: en L cada muro llega a la cara exterior del otro (con espesores
    // distintos, usar el propio dejaría una muesca en el muro delgado).
    if (Math.hypot(ox1 - x1, oy1 - y1) <= 0.01 || Math.hypot(ox2 - x1, oy2 - y1) <= 0.01) {
      inicio = Math.max(inicio, alcanceHacia(otro, [-ux, -uy]));
    }
    if (Math.hypot(ox1 - x2, oy1 - y2) <= 0.01 || Math.hypot(ox2 - x2, oy2 - y2) <= 0.01) {
      fin = Math.max(fin, alcanceHacia(otro, [ux, uy]));
    }
    // En T el muro que llega termina en la línea dibujada del pasante; si el
    // pasante va a paño, se alarga hasta su cara lejana para no dejar hueco.
    if (enTramo(otro, x1, y1)) inicio = Math.max(inicio, alcanceHacia(otro, [-ux, -uy]));
    if (enTramo(otro, x2, y2)) fin = Math.max(fin, alcanceHacia(otro, [ux, uy]));
  }
  return { inicio, fin };
}

/** Límites de la huella completa del muro (caras exteriores de las capas). */
function limites(muro: MuroPlanta): { min: number; max: number } {
  const conCentro = muro.capas.filter((c) => c.centro !== undefined);
  if (conCentro.length === 0) {
    const e = espesorDe(muro);
    return { min: -e / 2, max: e / 2 };
  }
  return {
    min: Math.min(...conCentro.map((c) => (c.centro ?? 0) - c.espesor / 2)),
    max: Math.max(...conCentro.map((c) => (c.centro ?? 0) + c.espesor / 2)),
  };
}

export function huellaMuro(muro: MuroPlanta, todos: MuroPlanta[] = []): Anillo {
  const { min, max } = limites(muro);
  const extensiones = extensionesEnExtremos(muro, todos);
  return rectangulo(muro, min, max, extensiones.inicio, extensiones.fin);
}

function huellasAjustadas(muro: MuroPlanta, todos: MuroPlanta[]): PoligonoCru[] {
  // El contorno es la unión de las huellas completas: en T el muro que llega se
  // solapa con el pasante y la unión borra la cara interior en el encuentro.
  return [comoPoligono(huellaMuro(muro, todos))];
}

interface Banda {
  poligono: Anillo;
  material: string;
  funcion: string;
}

export function bandasMuro(muro: MuroPlanta, todos: MuroPlanta[] = []): Banda[] {
  const centro = muro.capas.filter((c) => c.centro !== undefined);
  const extensiones = extensionesEnExtremos(muro, todos);
  if (centro.length === 0) {
    return [
      {
        poligono: huellaMuro(muro, todos),
        material: muro.capas[0]?.material ?? "Muro",
        funcion: muro.capas[0]?.funcion ?? "núcleo",
      },
    ];
  }
  return centro.map((capa) => ({
    poligono: rectangulo(
      muro,
      (capa.centro ?? 0) - capa.espesor / 2,
      (capa.centro ?? 0) + capa.espesor / 2,
      extensiones.inicio,
      extensiones.fin,
    ),
    material: capa.material,
    funcion: capa.funcion,
  }));
}

function poligonoSeccion(seccion: SeccionPlanta): Anillo {
  const coseno = Math.cos(seccion.rotacion);
  const seno = Math.sin(seccion.rotacion);
  const hx = seccion.ancho / 2;
  const hy = seccion.fondo / 2;
  const punto = (x: number, y: number): Par => [
    seccion.x + x * coseno - y * seno,
    seccion.y + x * seno + y * coseno,
  ];
  return [
    punto(-hx, -hy),
    punto(hx, -hy),
    punto(hx, hy),
    punto(-hx, hy),
    punto(-hx, -hy),
  ];
}

function recortesDeSecciones(
  secciones: SeccionPlanta[],
  funcion: "núcleo" | "acabado",
): PoligonoCru[] {
  return secciones
    .filter((seccion) => funcion === "núcleo" || seccion.funcion === "columna")
    .map((seccion) => comoPoligono(poligonoSeccion(seccion)));
}

function bandasAjustadas(
  muro: MuroPlanta,
  todos: MuroPlanta[],
  secciones: SeccionPlanta[] = [],
): Banda[] {
  const recortesL = recortesDeMuro(muro, todos);
  const recortesT = murosPasantes(muro, todos);
  const salida: Banda[] = [];
  for (const banda of bandasMuro(muro, todos)) {
    // El núcleo se une por material; sus recortes solo hacen falta en T. Los
    // acabados sí se recortan contra el núcleo vecino también en L.
    const base = banda.funcion === "núcleo" ? recortesT : recortesL;
    const propios = recortesDeSecciones(
      secciones,
      banda.funcion === "núcleo" ? "núcleo" : "acabado",
    );
    const recortes = [...base, ...propios];
    if (recortes.length === 0) {
      salida.push(banda);
      continue;
    }
    for (const poligono of clip.difference(comoPoligono(banda.poligono), ...recortes)) {
      if (poligono.length > 0) salida.push({ ...banda, poligono: poligono[0] });
    }
  }
  return salida;
}

export function nucleoMuro(muro: MuroPlanta): Anillo[] {
  return bandasMuro(muro)
    .filter((banda) => banda.funcion === "núcleo")
    .map((banda) => banda.poligono);
}

function comoPoligono(anillo: Anillo): PoligonoCru {
  return [anillo];
}

// ---------------------------------------------------------------- capas en L/T
// O012: las capas de acabado se cortan con la misma línea de inglete que el cuerpo
// del muro. Así el 3D y la planta muestran el mismo contorno y la suma de áreas de
// capa es exactamente el área de la huella (sin muescas ni traslapes).

interface BandaCapa {
  poligono: Anillo;
  material: string;
  funcion: string;
}

function anilloAbierto(anillo: Anillo): Anillo {
  if (anillo.length > 1) {
    const [ax, ay] = anillo[0];
    const [bx, by] = anillo[anillo.length - 1];
    if (Math.hypot(ax - bx, ay - by) < 1e-9) return anillo.slice(0, -1);
  }
  return anillo;
}

function cerrarAnillo(anillo: Anillo): Anillo {
  if (anillo.length === 0) return [];
  const [ax, ay] = anillo[0];
  const [bx, by] = anillo[anillo.length - 1];
  return Math.hypot(ax - bx, ay - by) < 1e-9 ? anillo : [...anillo, anillo[0]];
}

/** Quita vértices repetidos y colineales que rompen polygon-clipping. */
function limpiarAnillo(anillo: Anillo): Anillo {
  const abierto = anilloAbierto(anillo);
  const sinRepetidos: Anillo = [];
  for (const p of abierto) {
    const anterior = sinRepetidos[sinRepetidos.length - 1];
    if (!anterior || Math.hypot(p[0] - anterior[0], p[1] - anterior[1]) > 1e-9) {
      sinRepetidos.push(p);
    }
  }
  if (sinRepetidos.length < 3) return [];
  const salida: Anillo = [];
  for (let i = 0; i < sinRepetidos.length; i += 1) {
    const a = sinRepetidos[(i - 1 + sinRepetidos.length) % sinRepetidos.length];
    const b = sinRepetidos[i];
    const c = sinRepetidos[(i + 1) % sinRepetidos.length];
    const cruz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cruz) > 1e-12) salida.push(b);
  }
  return salida.length >= 3 ? cerrarAnillo(salida) : [];
}

/** Recorta un polígono contra la semirrecta que deja el punto de prueba dentro. */
function recortarPorLinea(
  poligono: Anillo,
  a: Par,
  b: Par,
  puntoDentro: Par,
): Anillo {
  const abierto = anilloAbierto(poligono);
  if (abierto.length < 3) return [];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.hypot(dx, dy) < 1e-12) return poligono;
  const lado = (p: Par) => dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
  const signo = lado(puntoDentro) >= 0 ? 1 : -1;
  const salida: Anillo = [];
  for (let i = 0; i < abierto.length; i += 1) {
    const actual = abierto[i];
    const siguiente = abierto[(i + 1) % abierto.length];
    const da = signo * lado(actual);
    const db = signo * lado(siguiente);
    if (da >= -1e-9) salida.push(actual);
    if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) {
      const t = da / (da - db);
      salida.push([
        actual[0] + (siguiente[0] - actual[0]) * t,
        actual[1] + (siguiente[1] - actual[1]) * t,
      ]);
    }
  }
  return salida.length >= 3 ? limpiarAnillo(salida) : [];
}

function puntoExtremo(muro: MuroPlanta, fin: "ATSTART" | "ATEND"): Par {
  const [x1, y1, x2, y2] = muro.eje;
  return fin === "ATSTART" ? [x1, y1] : [x2, y2];
}

/** Línea de inglete común a dos muros que comparten extremo (misma que el 3D). */
function lineaInglete(
  muro: MuroPlanta,
  otro: MuroPlanta,
  fin: "ATSTART" | "ATEND",
  finOtro: "ATSTART" | "ATEND",
): [Par, Par] | null {
  const [x1, y1, x2, y2] = muro.eje;
  const [ox1, oy1, ox2, oy2] = otro.eje;
  const largo = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
  const olargo = Math.hypot(ox2 - ox1, oy2 - oy1) || 1e-9;
  const dx = (x2 - x1) / largo;
  const dy = (y2 - y1) / largo;
  const odx = (ox2 - ox1) / olargo;
  const ody = (oy2 - oy1) / olargo;
  const n: Par = [-dy, dx];
  const no: Par = [-ody, odx];
  const esquina = puntoExtremo(muro, fin);
  const alejadoOtro: Par =
    finOtro === "ATEND" ? [-odx, -ody] : [odx, ody];
  const otroIzquierda = alejadoOtro[0] * n[0] + alejadoOtro[1] * n[1] >= 0;
  const dentro: Par = fin === "ATEND" ? [-dx, -dy] : [dx, dy];
  const esteIzquierda = dentro[0] * no[0] + dentro[1] * no[1] >= 0;
  const { min: bajo } = limites(muro);
  const { min: bajoOtro } = limites(otro);
  const alto = bajo + espesorDe(muro);
  const altoOtro = bajoOtro + espesorDe(otro);
  const vInner = otroIzquierda ? alto : bajo;
  const vOuter = otroIzquierda ? bajo : alto;
  const vOtroInner = esteIzquierda ? altoOtro : bajoOtro;
  const vOtroOuter = esteIzquierda ? bajoOtro : altoOtro;
  const linea = (origen: Par, normal: Par, v: number): [Par, Par] => [
    [origen[0] + normal[0] * v, origen[1] + normal[1] * v],
    normal,
  ];
  const corta = (
    l1: [Par, Par],
    l2: [Par, Par],
  ): Par | null => {
    const [p1, n1] = l1;
    const [p2, n2] = l2;
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    if (Math.abs(det) < 1e-9) return null;
    const c1 = n1[0] * p1[0] + n1[1] * p1[1];
    const c2 = n2[0] * p2[0] + n2[1] * p2[1];
    return [
      (c1 * n2[1] - c2 * n1[1]) / det,
      (n1[0] * c2 - n2[0] * c1) / det,
    ];
  };
  const pInner = corta(
    linea([x1, y1], n, vInner),
    linea([ox1, oy1], no, vOtroInner),
  );
  const pOuter = corta(
    linea([x1, y1], n, vOuter),
    linea([ox1, oy1], no, vOtroOuter),
  );
  if (pInner === null || pOuter === null) return null;
  const limite = 3 * Math.max(espesorDe(muro), espesorDe(otro)) + 0.05;
  if (
    Math.hypot(pInner[0] - esquina[0], pInner[1] - esquina[1]) > limite ||
    Math.hypot(pOuter[0] - esquina[0], pOuter[1] - esquina[1]) > limite
  ) {
    return null;
  }
  return [pInner, pOuter];
}

function murosEnT(
  muro: MuroPlanta,
  todos: MuroPlanta[],
  fin: "ATSTART" | "ATEND",
): Array<{ otro: MuroPlanta; esteIzquierda: boolean }> {
  const [x1, y1, x2, y2] = muro.eje;
  const [px, py] = fin === "ATSTART" ? [x1, y1] : [x2, y2];
  const dentro: Par =
    fin === "ATSTART"
      ? [(x2 - x1), (y2 - y1)]
      : [-(x2 - x1), -(y2 - y1)];
  const salida: Array<{ otro: MuroPlanta; esteIzquierda: boolean }> = [];
  for (const otro of todos) {
    if (otro.globalid === muro.globalid) continue;
    const [ox1, oy1, ox2, oy2] = otro.eje;
    const dx = ox2 - ox1;
    const dy = oy2 - oy1;
    const largo2 = dx * dx + dy * dy;
    if (largo2 <= 1e-12) continue;
    const t = ((px - ox1) * dx + (py - oy1) * dy) / largo2;
    if (t <= 0.02 || t >= 0.98) continue;
    const qx = ox1 + t * dx;
    const qy = oy1 + t * dy;
    if (Math.hypot(px - qx, py - qy) > espesorDe(otro) / 2 + 0.01) continue;
    const olargo = Math.sqrt(largo2);
    const no: Par = [-dy / olargo, dx / olargo];
    const esteIzquierda = dentro[0] * no[0] + dentro[1] * no[1] >= 0;
    salida.push({ otro, esteIzquierda });
  }
  return salida;
}

function extensionesCapas(
  muro: MuroPlanta,
  todos: MuroPlanta[],
): { inicio: number; fin: number } {
  const [x1, y1, x2, y2] = muro.eje;
  let inicio = 0;
  let fin = 0;
  const propio = espesorDe(muro);
  for (const otro of todos) {
    if (otro.globalid === muro.globalid) continue;
    const [ox1, oy1, ox2, oy2] = otro.eje;
    const alcance = Math.max(propio, espesorDe(otro));
    if (
      Math.hypot(ox1 - x1, oy1 - y1) <= 0.01 ||
      Math.hypot(ox2 - x1, oy2 - y1) <= 0.01
    ) {
      inicio = Math.max(inicio, alcance);
    }
    if (
      Math.hypot(ox1 - x2, oy1 - y2) <= 0.01 ||
      Math.hypot(ox2 - x2, oy2 - y2) <= 0.01
    ) {
      fin = Math.max(fin, alcance);
    }
  }
  return { inicio, fin };
}

/** Polígonos de cada capa (misma regla para la planta y el 3D). */
export function poligonosCapas(
  muro: MuroPlanta,
  todos: MuroPlanta[] = [],
): BandaCapa[] {
  const centros = muro.capas.filter((c) => c.centro !== undefined);
  if (centros.length === 0) {
    return [
      {
        poligono: huellaMuro(muro, todos),
        material: muro.capas[0]?.material ?? "Muro",
        funcion: muro.capas[0]?.funcion ?? "núcleo",
      },
    ];
  }
  const extensiones = extensionesCapas(muro, todos);
  const [x1, y1, x2, y2] = muro.eje;
  const largo = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
  const dx = (x2 - x1) / largo;
  const dy = (y2 - y1) / largo;
  const salida: BandaCapa[] = [];
  for (const capa of centros) {
    let poligono = rectangulo(
      muro,
      (capa.centro ?? 0) - capa.espesor / 2,
      (capa.centro ?? 0) + capa.espesor / 2,
      extensiones.inicio,
      extensiones.fin,
    );
    for (const fin of ["ATSTART", "ATEND"] as const) {
      const [px, py] = fin === "ATSTART" ? [x1, y1] : [x2, y2];
      const dentro: Par = fin === "ATSTART" ? [dx, dy] : [-dx, -dy];
      const prueba: Par = [px + dentro[0] * 0.01, py + dentro[1] * 0.01];
      for (const otro of todos) {
        if (otro.globalid === muro.globalid) continue;
        const [qx1, qy1, qx2, qy2] = otro.eje;
        const comparten: Array<"ATSTART" | "ATEND"> = [];
        if (
          Math.hypot(qx1 - px, qy1 - py) <= 0.01 ||
          Math.hypot(qx2 - px, qy2 - py) <= 0.01
        ) {
          if (Math.hypot(qx1 - px, qy1 - py) <= 0.01) comparten.push("ATSTART");
          if (Math.hypot(qx2 - px, qy2 - py) <= 0.01) comparten.push("ATEND");
        }
        for (const finOtro of comparten) {
          const linea = lineaInglete(muro, otro, fin, finOtro);
          if (linea !== null) poligono = recortarPorLinea(poligono, linea[0], linea[1], prueba);
        }
      }
      for (const { otro, esteIzquierda } of murosEnT(muro, todos, fin)) {
        const [rx1, ry1, rx2, ry2] = otro.eje;
        const olargo = Math.hypot(rx2 - rx1, ry2 - ry1) || 1e-9;
        const no: Par = [-(ry2 - ry1) / olargo, (rx2 - rx1) / olargo];
        const { min: bajoOtro } = limites(otro);
        const cara =
          bajoOtro + (esteIzquierda ? espesorDe(otro) : 0);
        const direccion: Par = [(rx2 - rx1) / olargo, (ry2 - ry1) / olargo];
        // El punto de prueba va hacia el cuerpo del muro que llega, ya pasado el
        // espesor del pasante (el eje del pasante queda dentro de su sección).
        const alcance = espesorDe(otro) / 2 + 0.01;
        const puntoPrueba: Par = [
          px + dentro[0] * alcance,
          py + dentro[1] * alcance,
        ];
        const base: Par = [rx1 + no[0] * cara, ry1 + no[1] * cara];
        poligono = recortarPorLinea(
          poligono,
          base,
          [base[0] + direccion[0], base[1] + direccion[1]],
          puntoPrueba,
        );
      }
    }
    poligono = limpiarAnillo(poligono);
    if (poligono.length >= 3) {
      salida.push({
        poligono,
        material: capa.material,
        funcion: capa.funcion,
      });
    }
  }
  return salida;
}


export function unirHuellas(
  muros: MuroPlanta[],
  secciones: SeccionPlanta[] = [],
): PoligonoPlanta[] {
  if (muros.length === 0) return [];
  const entradas = muros.map((muro) => huellasAjustadas(muro, muros));
  // O007c: el castillo completa la huella en la esquina (puede sobresalir del
  // extremo del muro); la columna se dibuja aparte y no agranda el contorno.
  const castillos = secciones
    .filter((seccion) => seccion.funcion === "castillo")
    .map((seccion) => comoPoligono(poligonoSeccion(seccion)));
  const unido = clip.union(
    entradas[0][0],
    ...entradas.slice(1).flat(),
    ...castillos,
  );
  return unido.map((poligono) => ({
    exterior: poligono[0].map(([x, y]) => [x, y] as Punto2),
    huecos: poligono.slice(1).map((anillo) => anillo.map(([x, y]) => [x, y] as Punto2)),
  }));
}

function puntoEnAnillo(punto: Par, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i, i += 1) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > punto[1] !== yj > punto[1]) {
      const x = ((xj - xi) * (punto[1] - yi)) / (yj - yi || 1e-12) + xi;
      if (punto[0] < x) dentro = !dentro;
    }
  }
  return dentro;
}

function dentroDe(poligonos: PoligonoCru[], punto: Par): boolean {
  return poligonos.some(
    (poligono) =>
      puntoEnAnillo(punto, poligono[0]) &&
      !poligono.slice(1).some((hueco) => puntoEnAnillo(punto, hueco)),
  );
}

function distanciaSegmento(punto: Par, a: Par, b: Par): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo2 = dx * dx + dy * dy;
  const t =
    largo2 <= 1e-12
      ? 0
      : Math.max(0, Math.min(1, ((punto[0] - a[0]) * dx + (punto[1] - a[1]) * dy) / largo2));
  return Math.hypot(punto[0] - (a[0] + t * dx), punto[1] - (a[1] + t * dy));
}

function distanciaAPoligonos(poligonos: PoligonoCru[], punto: Par): number {
  let minimo = Infinity;
  for (const poligono of poligonos) {
    for (const anillo of poligono) {
      for (let i = 1; i < anillo.length; i += 1) {
        minimo = Math.min(minimo, distanciaSegmento(punto, anillo[i - 1], anillo[i]));
      }
    }
  }
  return minimo;
}

/**
 * O006e: un muro «llega» en T cuando uno de sus extremos cae dentro de la huella
 * del núcleo del otro, sin ser uno de sus extremos. Ese muro se recorta contra el
 * núcleo pasante; los acabados del pasante siguen de largo.
 */
function murosPasantes(muro: MuroPlanta, otros: MuroPlanta[]): PoligonoCru[] {
  const [x1, y1, x2, y2] = muro.eje;
  const salida: PoligonoCru[] = [];
  for (const otro of otros) {
    if (otro.globalid === muro.globalid) continue;
    const nucleos = nucleoMuro(otro).map(comoPoligono);
    if (nucleos.length === 0) continue;
    const [ox1, oy1, ox2, oy2] = otro.eje;
    const dx = ox2 - ox1;
    const dy = oy2 - oy1;
    const largo2 = dx * dx + dy * dy;
    if (largo2 <= 1e-12) continue;
    for (const [ax, ay] of [
      [x1, y1],
      [x2, y2],
    ] as Punto2[]) {
      const t = ((ax - ox1) * dx + (ay - oy1) * dy) / largo2;
      if (t <= 0.02 || t >= 0.98) continue;
      const px = ox1 + t * dx;
      const py = oy1 + t * dy;
      if (Math.hypot(ax - px, ay - py) <= espesorDe(otro) / 2 + 0.01) {
        salida.push(...nucleos);
        break;
      }
    }
  }
  return salida;
}

/**
 * Recortes de las capas: el muro que llega se recorta contra el núcleo pasante y,
 * en las uniones en L, cada banda se recorta contra el núcleo del vecino para que
 * ninguna línea de acabado entre en la otra pieza. Los acabados del muro pasante
 * no se recortan contra el que llega: siguen de largo, como pide la planta.
 */
function recortesDeMuro(muro: MuroPlanta, todos: MuroPlanta[]): PoligonoCru[] {
  const salida = [...murosPasantes(muro, todos)];
  for (const otro of todos) {
    if (otro.globalid === muro.globalid) continue;
    // Si el otro llega en T a este muro, este es el pasante y no se recorta.
    const llegaAlMuro = murosPasantes(otro, todos).some((poligono) =>
      nucleoMuro(muro).some((anillo) => mismoPoligono(poligono, anillo)),
    );
    if (llegaAlMuro) continue;
    salida.push(...nucleoMuro(otro).map(comoPoligono));
  }
  return salida;
}

function mismoPoligono(a: PoligonoCru, b: Anillo): boolean {
  if (a.length !== 1 || a[0].length !== b.length) return false;
  const [ax, ay] = a[0][0];
  const [bx, by] = b[0];
  return Math.hypot(ax - bx, ay - by) < 1e-9;
}

function anillosDe(poligono: PoligonoCru): Anillo[] {
  return poligono;
}

function segmentosVisibles(
  anillo: Anillo,
  contorno: PoligonoCru[],
  ocultos: PoligonoCru[] = [],
): Array<[Par, Par]> {
  const segmentos: Array<[Par, Par]> = [];
  for (let i = 1; i < anillo.length; i += 1) {
    const a = anillo[i - 1];
    const b = anillo[i];
    const medio: Par = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (contorno.length > 0 && distanciaAPoligonos(contorno, medio) <= 0.0015) continue;
    // O007c: la cara del núcleo que coincide con el castillo no se dibuja: el
    // castillo llena la sección y su contorno lo traza la simbología estructural.
    if (ocultos.length > 0 && distanciaAPoligonos(ocultos, medio) <= 0.0015) continue;
    segmentos.push([a, b]);
  }
  return segmentos;
}

function segmentosAPolilineas(segmentos: Array<[Par, Par]>): Punto2[][] {
  const claves = new Map<string, number[]>();
  const salida: Punto2[][] = [];
  const clave = (p: Par) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  for (const [a, b] of segmentos) {
    const lista = claves.get(clave(a)) ?? [];
    lista.push(salida.length);
    claves.set(clave(a), lista);
    salida.push([
      [a[0], a[1]],
      [b[0], b[1]],
    ]);
  }
  // Une segmentos consecutivos con el mismo extremo; suficiente para dibujar capas.
  const usados = new Set<number>();
  const resultado: Punto2[][] = [];
  for (let i = 0; i < salida.length; i += 1) {
    if (usados.has(i)) continue;
    usados.add(i);
    const polilinea = [...salida[i]];
    let avanzando = true;
    while (avanzando) {
      avanzando = false;
      const fin = polilinea[polilinea.length - 1];
      const candidatos = claves.get(clave([fin[0], fin[1]])) ?? [];
      for (const indice of candidatos) {
        if (usados.has(indice)) continue;
        const siguiente = salida[indice];
        const inicio = siguiente[0];
        if (Math.hypot(inicio[0] - fin[0], inicio[1] - fin[1]) > 1e-6) continue;
        usados.add(indice);
        polilinea.push(siguiente[1]);
        avanzando = true;
        break;
      }
    }
    resultado.push(polilinea);
  }
  return resultado.filter((linea) => linea.length >= 2);
}

export function lineasCapas(
  muros: MuroPlanta[],
  secciones: SeccionPlanta[] = [],
): CapaPlanta[] {
  const contorno = unirHuellas(muros, secciones).map((p) => [
    [...p.exterior],
    ...p.huecos.map((h) => [...h]),
  ] as PoligonoCru);
  const castillos = secciones
    .filter((seccion) => seccion.funcion === "castillo")
    .map((seccion) => comoPoligono(poligonoSeccion(seccion)));
  const grupos = new Map<
    string,
    { material: string; funcion: string; poligonos: PoligonoCru[] }
  >();
  for (const muro of muros) {
    for (const banda of bandasAjustadas(muro, muros, secciones)) {
      const clave = `${banda.material}|${banda.funcion}`;
      const grupo = grupos.get(clave) ?? {
        material: banda.material,
        funcion: banda.funcion,
        poligonos: [],
      };
      grupo.poligonos.push(comoPoligono(banda.poligono));
      grupos.set(clave, grupo);
    }
  }
  const salida: CapaPlanta[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.poligonos.length === 0) continue;
    const unido = clip.union(grupo.poligonos[0], ...grupo.poligonos.slice(1));
    const segmentos: Array<[Par, Par]> = [];
    for (const poligono of unido) {
      for (const anillo of anillosDe(poligono)) {
        segmentos.push(
          ...segmentosVisibles(
            anillo,
            contorno,
            grupo.funcion === "núcleo" ? castillos : [],
          ),
        );
      }
    }
    salida.push({
      material: grupo.material,
      funcion: grupo.funcion,
      lineas: segmentosAPolilineas(segmentos),
    });
  }
  return salida;
}

function recortarSegmento(
  poligonos: PoligonoCru[],
  a: Par,
  b: Par,
): Array<[Par, Par]> {
  const cortes = [0, 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const poligono of poligonos) {
    for (const anillo of poligono) {
      for (let i = 1; i < anillo.length; i += 1) {
        const c = anillo[i - 1];
        const d = anillo[i];
        const ex = d[0] - c[0];
        const ey = d[1] - c[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
        const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
          cortes.push(t);
        }
      }
    }
  }
  cortes.sort((p, q) => p - q);
  const salida: Array<[Par, Par]> = [];
  for (let i = 1; i < cortes.length; i += 1) {
    const t0 = cortes[i - 1];
    const t1 = cortes[i];
    if (t1 - t0 < 1e-9) continue;
    const medio: Par = [a[0] + dx * ((t0 + t1) / 2), a[1] + dy * ((t0 + t1) / 2)];
    if (!dentroDe(poligonos, medio)) continue;
    salida.push([
      [a[0] + dx * t0, a[1] + dy * t0],
      [a[0] + dx * t1, a[1] + dy * t1],
    ]);
  }
  return salida;
}

export function rayadoNucleo(
  muros: MuroPlanta[],
  paso = 0.1,
  secciones: SeccionPlanta[] = [],
): Punto2[][] {
  const nucleos: PoligonoCru[] = [];
  for (const muro of muros) {
    for (const banda of bandasAjustadas(muro, muros, secciones)) {
      if (banda.funcion !== "núcleo") continue;
      nucleos.push(comoPoligono(banda.poligono));
    }
  }
  if (nucleos.length === 0) return [];
  const unido = clip.union(nucleos[0], ...nucleos.slice(1));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poligono of unido) {
    for (const [x, y] of poligono[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const salida: Punto2[][] = [];
  const alto = maxY - minY;
  const ancho = maxX - minX;
  // Líneas a 45°: x - minX = y - minY + desplazamiento.
  for (let d = -(ancho + alto); d <= ancho + alto; d += paso) {
    const a: Par = [minX + d, minY - paso];
    const b: Par = [minX + d + (alto + paso * 2), maxY + paso];
    const tramos = recortarSegmento(unido, a, b);
    for (const [p, q] of tramos) {
      salida.push([
        [p[0], p[1]],
        [q[0], q[1]],
      ]);
    }
  }
  return salida;
}

/** O006e/O007c: contorno unido, capas recortadas, castillos y rayado del núcleo. */
export function calcularPlantaMuros(
  muros: MuroPlanta[],
  secciones: SeccionPlanta[] = [],
): PlantaMuros {
  return {
    contorno: unirHuellas(muros, secciones),
    capas: lineasCapas(muros, secciones),
    rayado: rayadoNucleo(muros, 0.1, secciones),
  };
}

/** Punto dentro de una huella (exterior menos huecos), para pruebas y recortes. */
export function puntoDentroDeHuella(punto: Punto2, poligono: PoligonoPlanta): boolean {
  if (!puntoEnAnillo([punto[0], punto[1]], poligono.exterior.map(([x, y]) => [x, y] as Par))) {
    return false;
  }
  return !poligono.huecos.some((hueco) =>
    puntoEnAnillo([punto[0], punto[1]], hueco.map(([x, y]) => [x, y] as Par)),
  );
}

/** Cantidad de vértices del contorno exterior (sin repetir el primero). */
export function contarVertices(poligono: PoligonoPlanta): number {
  const puntos = poligono.exterior;
  if (puntos.length < 2) return 0;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  return Math.hypot(primero[0] - ultimo[0], primero[1] - ultimo[1]) < 1e-9
    ? puntos.length - 1
    : puntos.length;
}
