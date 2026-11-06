// O047: motor de inferencias 3D (módulo puro, sin escena ni WebGL).
//
// El cursor entra como un rayo en el mundo y la salida es el punto 3D al que se
// «pega» la herramienta. Todas las tolerancias se miden en píxeles con la función
// `proyectar` que inyecta la vista, así el comportamiento es el mismo de cerca y
// de lejos. La integración con el visor (O046) solo tiene que armar la entrada y
// dibujar `guia` cuando exista.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rayo3 {
  origen: Vec3;
  direccion: Vec3;
}

export interface Segmento3 {
  inicio: Vec3;
  fin: Vec3;
}

/** Cara plana: polígono 3D y su normal (si falta se calcula del polígono). */
export interface CaraPlana {
  poligono: Vec3[];
  normal?: Vec3;
}

export interface CandidatosInferencia {
  vertices?: Vec3[];
  aristas?: Segmento3[];
  caras?: CaraPlana[];
}

/** Plano del nivel activo: un punto y su normal. */
export interface PlanoTrabajo {
  punto: Vec3;
  normal: Vec3;
}

export type EjeMundo = "x" | "y" | "z";

/** Dirección bloqueada por Shift o flechas: un eje del mundo o una arista. */
export type Bloqueo =
  | { tipo: "eje"; eje: EjeMundo }
  | { tipo: "arista"; inicio: Vec3; fin: Vec3; referencia?: number };

export type TipoInferencia =
  | "extremo"
  | "medio"
  | "sobre_arista"
  | "interseccion"
  | "sobre_cara"
  | "eje_x"
  | "eje_y"
  | "eje_z"
  | "paralelo"
  | "perpendicular"
  | "plano";

export interface Inferencia {
  /** Punto 3D inferido; `null` cuando no hay nada (rayo paralelo al plano). */
  punto: Vec3 | null;
  tipo: TipoInferencia | null;
  /** Índice del candidato (vértice, arista o cara) o del eje (0=X, 1=Y, 2=Z). */
  referencia: number | null;
  /** Segmento para la línea punteada de inferencia. */
  guia?: Segmento3;
}

export type Proyectar = (p: Vec3) => { x: number; y: number };

export interface EntradaInferencia {
  rayo: Rayo3;
  /** Proyección a píxeles de pantalla; la inyecta la vista. */
  proyectar: Proyectar;
  candidatos: CandidatosInferencia;
  /** Último punto fijado por la herramienta; ancla de ejes y paralelas. */
  puntoPrevio?: Vec3;
  planoTrabajo: PlanoTrabajo;
  bloqueo?: Bloqueo;
  /** Tolerancia en píxeles (por omisión 10). */
  tolerancia_px?: number;
}

const EPS = 1e-9;
const EPS_T = 1e-6;
const TOLERANCIA_PARALELA_PX = 40;

const PRIORIDAD: Record<TipoInferencia, number> = {
  extremo: 0,
  medio: 1,
  interseccion: 2,
  sobre_arista: 3,
  eje_x: 4,
  eje_y: 4,
  eje_z: 4,
  paralelo: 5,
  perpendicular: 5,
  sobre_cara: 6,
  plano: 7,
};

interface CandidatoInterno {
  punto: Vec3;
  tipo: TipoInferencia;
  referencia: number | null;
  distanciaPx: number;
  guia?: Segmento3;
}

const sumar = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const restar = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const escalar = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const punto = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const largo = (a: Vec3): number => Math.sqrt(punto(a, a));

function normalizar(a: Vec3): Vec3 | null {
  const l = largo(a);
  if (l < EPS) return null;
  return escalar(a, 1 / l);
}

function productoVectorial(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

const limitar = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const distancia2D = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Proyección del punto sobre la recta del rayo (profundidad a lo largo del rayo). */
function profundidad(p: Vec3, rayo: Rayo3): number {
  return punto(restar(p, rayo.origen), rayo.direccion);
}

/** Punto de una recta (punto + dirección) más cercano a la recta del rayo. */
function puntoDeRectaMasCercano(
  ancla: Vec3,
  direccion: Vec3,
  rayo: Rayo3,
): { punto: Vec3; tRayo: number } | null {
  const d1 = normalizar(direccion);
  if (!d1) return null;
  const d2 = rayo.direccion;
  const w0 = restar(ancla, rayo.origen);
  const a = punto(d1, d1);
  const b = punto(d1, d2);
  const c = punto(d2, d2);
  const d = punto(d1, w0);
  const e = punto(d2, w0);
  const den = a * c - b * b;
  if (Math.abs(den) < EPS) {
    // Rectas paralelas: cualquier punto sirve; se usa el pie desde el origen del
    // rayo para no devolver algo arbitrariamente lejos.
    const s = punto(restar(rayo.origen, ancla), d1);
    const p = sumar(ancla, escalar(d1, s));
    return { punto: p, tRayo: profundidad(p, rayo) };
  }
  const s = (b * e - c * d) / den;
  const t = (a * e - b * d) / den;
  return { punto: sumar(ancla, escalar(d1, s)), tRayo: t };
}

/** Punto del segmento más cercano a la recta del rayo. */
function puntoDeSegmentoMasCercano(
  segmento: Segmento3,
  rayo: Rayo3,
  proyectar: Proyectar,
  cursorPx: { x: number; y: number },
): Vec3 | null {
  const eje = restar(segmento.fin, segmento.inicio);
  const longitud = largo(eje);
  if (longitud < EPS) return null;
  const d1 = escalar(eje, 1 / longitud);
  const d2 = rayo.direccion;
  const w0 = restar(segmento.inicio, rayo.origen);
  const a = punto(d1, d1);
  const b = punto(d1, d2);
  const c = punto(d2, d2);
  const d = punto(d1, w0);
  const e = punto(d2, w0);
  const den = a * c - b * b;
  let sParam: number;
  if (Math.abs(den) < EPS) {
    // Segmento casi paralelo a la mirada: en pantalla se reduce a un punto o a
    // una línea muy corta; se elige el punto medio del segmento proyectado.
    const a2 = proyectar(segmento.inicio);
    const b2 = proyectar(segmento.fin);
    const dx = b2.x - a2.x;
    const dy = b2.y - a2.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 < EPS ? 0 : limitar(((cursorPx.x - a2.x) * dx + (cursorPx.y - a2.y) * dy) / l2, 0, 1);
    sParam = u * longitud;
  } else {
    sParam = (b * e - c * d) / den;
  }
  return sumar(segmento.inicio, escalar(d1, limitar(sParam, 0, longitud)));
}

function interseccionRayoPlano(
  rayo: Rayo3,
  puntoPlano: Vec3,
  normalPlano: Vec3,
): { punto: Vec3; t: number } | null {
  const n = normalizar(normalPlano);
  if (!n) return null;
  const den = punto(rayo.direccion, n);
  if (Math.abs(den) < EPS) return null;
  const t = punto(restar(puntoPlano, rayo.origen), n) / den;
  if (t <= EPS_T) return null;
  return { punto: sumar(rayo.origen, escalar(rayo.direccion, t)), t };
}

function normalDePoligono(poligono: Vec3[]): Vec3 | null {
  if (poligono.length < 3) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < poligono.length; i++) {
    const a = poligono[i];
    const b = poligono[(i + 1) % poligono.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return normalizar({ x: nx, y: ny, z: nz });
}

interface Punto2 {
  x: number;
  y: number;
}

function enSegmento2D(a: Punto2, b: Punto2, p: Punto2): boolean {
  const cruz = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  if (Math.abs(cruz) > 1e-7) return false;
  return (
    p.x >= Math.min(a.x, b.x) - 1e-7 &&
    p.x <= Math.max(a.x, b.x) + 1e-7 &&
    p.y >= Math.min(a.y, b.y) - 1e-7 &&
    p.y <= Math.max(a.y, b.y) + 1e-7
  );
}

function dentroDePoligono2D(poligono: Punto2[], p: Punto2): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (enSegmento2D(a, b, p)) return true;
    if (a.y > p.y !== b.y > p.y) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) dentro = !dentro;
    }
  }
  return dentro;
}

function dentroDeCara(p: Vec3, poligono: Vec3[], normal: Vec3): boolean {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  const proyectar2 = (v: Vec3): Punto2 =>
    ax >= ay && ax >= az
      ? { x: v.y, y: v.z }
      : ay >= az
        ? { x: v.x, y: v.z }
        : { x: v.x, y: v.y };
  return dentroDePoligono2D(poligono.map(proyectar2), proyectar2(p));
}

function distanciaPuntoSegmento2D(a: Punto2, b: Punto2, p: Punto2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  const u = limitar(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/** Dos aristas que se cruzan en 3D; devuelve el punto medio del cruce. */
function interseccionDeAristas(a: Segmento3, b: Segmento3): Vec3 | null {
  const d1 = normalizar(restar(a.fin, a.inicio));
  const d2 = normalizar(restar(b.fin, b.inicio));
  if (!d1 || !d2) return null;
  const w0 = restar(a.inicio, b.inicio);
  const c1 = punto(d1, d1);
  const c2 = punto(d1, d2);
  const c3 = punto(d2, d2);
  const c4 = punto(d1, w0);
  const c5 = punto(d2, w0);
  const den = c1 * c3 - c2 * c2;
  if (Math.abs(den) < EPS) return null;
  const s = (c2 * c5 - c3 * c4) / den;
  const t = (c1 * c5 - c2 * c4) / den;
  const largoA = largo(restar(a.fin, a.inicio));
  const largoB = largo(restar(b.fin, b.inicio));
  if (s < -EPS || s > largoA + EPS || t < -EPS || t > largoB + EPS) return null;
  const pa = sumar(a.inicio, escalar(d1, s));
  const pb = sumar(b.inicio, escalar(d2, t));
  if (largo(restar(pa, pb)) > 1e-5) return null;
  return escalar(sumar(pa, pb), 0.5);
}

/** Elige entre dos candidatos: la prioridad manda salvo que el de menor
 *  prioridad esté más cerca por más de 3 px. */
function competir(a: CandidatoInterno | null, b: CandidatoInterno): CandidatoInterno {
  if (!a) return b;
  const pa = PRIORIDAD[a.tipo];
  const pb = PRIORIDAD[b.tipo];
  if (pa === pb) return b.distanciaPx < a.distanciaPx ? b : a;
  const alto = pa < pb ? a : b;
  const bajo = pa < pb ? b : a;
  return bajo.distanciaPx + 3 < alto.distanciaPx ? bajo : alto;
}

function lineaDeBloqueo(
  bloqueo: Bloqueo,
): { direccion: Vec3; tipo: TipoInferencia; referencia: number | null } | null {
  if (bloqueo.tipo === "eje") {
    const direccion =
      bloqueo.eje === "x"
        ? { x: 1, y: 0, z: 0 }
        : bloqueo.eje === "y"
          ? { x: 0, y: 1, z: 0 }
          : { x: 0, y: 0, z: 1 };
    const referencia = bloqueo.eje === "x" ? 0 : bloqueo.eje === "y" ? 1 : 2;
    return { direccion, tipo: `eje_${bloqueo.eje}` as TipoInferencia, referencia };
  }
  const direccion = restar(bloqueo.fin, bloqueo.inicio);
  if (largo(direccion) < EPS) return null;
  return { direccion, tipo: "paralelo", referencia: bloqueo.referencia ?? null };
}

/** Resumen de la cara más cercana que corta el rayo (para oclusión y sobre_cara). */
interface CaraTocada {
  indice: number;
  punto: Vec3;
  t: number;
}

export function inferir(entrada: EntradaInferencia): Inferencia {
  const direccion = normalizar(entrada.rayo.direccion);
  const nula: Inferencia = { punto: null, tipo: null, referencia: null };
  if (!direccion) return nula;
  const rayo: Rayo3 = { origen: entrada.rayo.origen, direccion };
  const tolerancia = entrada.tolerancia_px ?? 10;
  const cursorPx = entrada.proyectar(sumar(rayo.origen, direccion));

  const caras = entrada.candidatos.caras ?? [];
  let caraCercana: CaraTocada | null = null;
  for (let i = 0; i < caras.length; i++) {
    const cara = caras[i];
    if (cara.poligono.length < 3) continue;
    const normal = cara.normal ? normalizar(cara.normal) : normalDePoligono(cara.poligono);
    if (!normal) continue;
    const corte = interseccionRayoPlano(rayo, cara.poligono[0], normal);
    if (!corte) continue;
    if (!dentroDeCara(corte.punto, cara.poligono, normal)) continue;
    if (!caraCercana || corte.t < caraCercana.t) {
      caraCercana = { indice: i, punto: corte.punto, t: corte.t };
    }
  }

  const tapado = (t: number): boolean => caraCercana !== null && caraCercana.t < t - 1e-6;

  // Con bloqueo la herramienta queda atada a esa recta: el resultado siempre
  // cae sobre ella, aunque el cursor esté lejos.
  if (entrada.bloqueo && entrada.puntoPrevio) {
    const linea = lineaDeBloqueo(entrada.bloqueo);
    if (linea) {
      const cercano = puntoDeRectaMasCercano(entrada.puntoPrevio, linea.direccion, rayo);
      if (cercano && cercano.tRayo > EPS_T && !tapado(cercano.tRayo)) {
        return {
          punto: cercano.punto,
          tipo: linea.tipo,
          referencia: linea.referencia,
          guia: { inicio: entrada.puntoPrevio, fin: cercano.punto },
        };
      }
    }
  }

  let mejor: CandidatoInterno | null = null;

  const agregarPunto = (
    p: Vec3,
    tipo: TipoInferencia,
    referencia: number | null,
    guia?: Segmento3,
  ): void => {
    const t = profundidad(p, rayo);
    if (t <= EPS_T || tapado(t)) return;
    const dPx = distancia2D(entrada.proyectar(p), cursorPx);
    if (dPx > tolerancia) return;
    mejor = competir(mejor, { punto: p, tipo, referencia, distanciaPx: dPx, guia });
  };

  const vertices = entrada.candidatos.vertices ?? [];
  for (let i = 0; i < vertices.length; i++) {
    agregarPunto(vertices[i], "extremo", i);
  }

  const aristas = entrada.candidatos.aristas ?? [];
  for (let i = 0; i < aristas.length; i++) {
    const arista = aristas[i];
    const medio = escalar(sumar(arista.inicio, arista.fin), 0.5);
    agregarPunto(medio, "medio", i);
  }

  for (let i = 0; i < aristas.length; i++) {
    for (let j = i + 1; j < aristas.length; j++) {
      const cruce = interseccionDeAristas(aristas[i], aristas[j]);
      if (cruce) agregarPunto(cruce, "interseccion", i);
    }
  }

  for (let i = 0; i < aristas.length; i++) {
    const p = puntoDeSegmentoMasCercano(aristas[i], rayo, entrada.proyectar, cursorPx);
    if (p) agregarPunto(p, "sobre_arista", i, aristas[i]);
  }

  if (entrada.puntoPrevio) {
    const ancla = entrada.puntoPrevio;
    const ejes: { direccion: Vec3; tipo: TipoInferencia; referencia: number }[] = [
      { direccion: { x: 1, y: 0, z: 0 }, tipo: "eje_x", referencia: 0 },
      { direccion: { x: 0, y: 1, z: 0 }, tipo: "eje_y", referencia: 1 },
      { direccion: { x: 0, y: 0, z: 1 }, tipo: "eje_z", referencia: 2 },
    ];
    for (const eje of ejes) {
      const cercano = puntoDeRectaMasCercano(ancla, eje.direccion, rayo);
      if (!cercano) continue;
      agregarPunto(cercano.punto, eje.tipo, eje.referencia, {
        inicio: ancla,
        fin: cercano.punto,
      });
    }

    const normalPlano = normalizar(entrada.planoTrabajo.normal);
    for (let i = 0; i < aristas.length; i++) {
      const a2 = entrada.proyectar(aristas[i].inicio);
      const b2 = entrada.proyectar(aristas[i].fin);
      if (distanciaPuntoSegmento2D(a2, b2, cursorPx) > TOLERANCIA_PARALELA_PX) continue;
      const dirArista = normalizar(restar(aristas[i].fin, aristas[i].inicio));
      if (!dirArista) continue;
      const direcciones: { direccion: Vec3; tipo: TipoInferencia }[] = [
        { direccion: dirArista, tipo: "paralelo" },
      ];
      if (normalPlano) {
        const perpendicular = normalizar(productoVectorial(dirArista, normalPlano));
        if (perpendicular) direcciones.push({ direccion: perpendicular, tipo: "perpendicular" });
      }
      for (const d of direcciones) {
        const cercano = puntoDeRectaMasCercano(ancla, d.direccion, rayo);
        if (!cercano) continue;
        agregarPunto(cercano.punto, d.tipo, i, { inicio: ancla, fin: cercano.punto });
      }
    }
  }

  if (caraCercana) {
    const dPx = distancia2D(entrada.proyectar(caraCercana.punto), cursorPx);
    mejor = competir(mejor, {
      punto: caraCercana.punto,
      tipo: "sobre_cara",
      referencia: caraCercana.indice,
      distanciaPx: dPx,
    });
  }

  if (mejor) {
    const elegido: CandidatoInterno = mejor;
    return {
      punto: elegido.punto,
      tipo: elegido.tipo,
      referencia: elegido.referencia,
      ...(elegido.guia ? { guia: elegido.guia } : {}),
    };
  }

  // Sin candidatos: el rayo corta el plano del nivel activo. Si es paralelo, no
  // hay punto posible y se devuelve una inferencia nula (documentado en la spec).
  const corte = interseccionRayoPlano(rayo, entrada.planoTrabajo.punto, entrada.planoTrabajo.normal);
  if (!corte) return nula;
  return { punto: corte.punto, tipo: "plano", referencia: null };
}
