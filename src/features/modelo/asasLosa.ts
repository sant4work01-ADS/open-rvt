// O034: asas en planta para el desfase de cada borde de losa. Todo lo que se
// puede calcular sin la escena (punto medio, normal exterior, redondeo y vista
// previa del contorno) vive aquí para probarlo a mano.
import type { BordeLosa } from "./bordesLosa";

export type Punto2 = [number, number];

export interface AsaLosa {
  indice: number;
  /** Punto medio del borde ya desplazado (el sitio donde se dibuja el asa). */
  medio: Punto2;
  /** Normal unitaria hacia afuera de la losa; un arrastre positivo va aquí. */
  normal: Punto2;
  /** Extremos actuales del borde, ya con su desfase. */
  inicio: Punto2;
  fin: Punto2;
  desfase: number;
}

/** O034: solo hay asas con una única losa seleccionada. */
export function hayAsasLosa(
  seleccion: string | null,
  seleccionados: string[],
  clase: string | null | undefined,
): boolean {
  return (
    seleccion !== null &&
    clase === "IfcSlab" &&
    seleccionados.length === 1 &&
    seleccionados[0] === seleccion
  );
}

/** Extrae el anillo exterior de un WKT POLYGON guardado en OPENRVT_Losa.Contorno. */
export function leerPoligonoWkt(texto: string | null | undefined): Punto2[] | null {
  if (typeof texto !== "string") return null;
  const cuerpo = /POLYGON\s*(?:Z|M|ZM)?\s*\(\(\s*([^)]*)\)/i.exec(texto);
  if (!cuerpo) return null;
  const puntos: Punto2[] = [];
  for (const par of cuerpo[1].split(",")) {
    const partes = par.trim().split(/\s+/);
    if (partes.length < 2) continue;
    const x = Number(partes[0]);
    const y = Number(partes[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) puntos.push([x, y]);
  }
  if (puntos.length > 1) {
    const [x0, y0] = puntos[0];
    const [xn, yn] = puntos[puntos.length - 1];
    if (Math.abs(x0 - xn) < 1e-9 && Math.abs(y0 - yn) < 1e-9) puntos.pop();
  }
  return puntos.length >= 3 ? puntos : null;
}

function normalDeReferencia(borde: BordeLosa): Punto2 | null {
  const a = borde.punto_a;
  const b = borde.punto_b;
  if (!a || !b) return null;
  const dx = Number(b[0]) - Number(a[0]);
  const dy = Number(b[1]) - Number(a[1]);
  const largo = Math.hypot(dx, dy);
  if (largo <= 1e-9) return null;
  // Igual que el núcleo: la izquierda de la línea base, con el signo guardado.
  const signo = Number(borde.signo) || 1;
  return [limpiar((-dy / largo) * signo), limpiar((dx / largo) * signo)];
}

function limpiar(valor: number): number {
  if (Math.abs(valor) < 1e-9) return 0;
  return Number(valor.toFixed(9));
}

function desplazar(p: Punto2, normal: Punto2, distancia: number): Punto2 {
  return [p[0] + normal[0] * distancia, p[1] + normal[1] * distancia];
}

/**
 * O034: un asa por borde, en su punto medio y con la normal hacia afuera.
 * `poligono` es el contorno actual (WKT Contorno); si viene, sus aristas ya
 * incluyen el desfase y las caras de muros/ejes, así que no se vuelve a sumar.
 */
export function asasDeLosa(
  bordes: BordeLosa[],
  poligono?: Punto2[] | null,
): AsaLosa[] {
  if (bordes.length < 3) return [];
  const usarPoligono = !!poligono && poligono.length === bordes.length;
  const salida: AsaLosa[] = [];
  for (let indice = 0; indice < bordes.length; indice += 1) {
    const borde = bordes[indice];
    const normal = normalDeReferencia(borde);
    if (!normal) continue;
    const desfase = Number(borde.desfase) || 0;
    let inicio: Punto2;
    let fin: Punto2;
    if (usarPoligono) {
      inicio = poligono[indice];
      fin = poligono[(indice + 1) % poligono.length];
    } else {
      const a = borde.punto_a;
      const b = borde.punto_b;
      if (!a || !b) continue;
      inicio = desplazar([Number(a[0]), Number(a[1])], normal, desfase);
      fin = desplazar([Number(b[0]), Number(b[1])], normal, desfase);
    }
    salida.push({
      indice,
      medio: [(inicio[0] + fin[0]) / 2, (inicio[1] + fin[1]) / 2],
      normal,
      inicio,
      fin,
      desfase,
    });
  }
  return salida;
}

/** Redondeo a un paso (0.005 m en planta), simétrico para negativos. */
export function redondearPaso(valor: number, paso = 0.005): number {
  if (!Number.isFinite(valor) || paso <= 0) return 0;
  const redondeado = Math.sign(valor) * Math.round(Math.abs(valor) / paso) * paso;
  return Math.abs(redondeado) < 1e-12 ? 0 : Number(redondeado.toFixed(6));
}

/**
 * O034: convierte el movimiento del puntero en el desfase del borde.
 * Solo cuenta lo que se mueve en la normal exterior; el resto se ignora.
 */
export function desfaseConArrastre(
  desfaseInicial: number,
  normal: Punto2,
  delta: Punto2,
  paso = 0.005,
): number {
  const recorrido = delta[0] * normal[0] + delta[1] * normal[1];
  return redondearPaso(desfaseInicial + recorrido, paso);
}

function cortaRectas(
  p: Punto2,
  d: Punto2,
  q: Punto2,
  e: Punto2,
): Punto2 | null {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [limpiar(p[0] + d[0] * t), limpiar(p[1] + d[1] * t)];
}

/**
 * O034: contorno de vista previa al mover un borde. Las aristas actuales se
 * conservan y solo se desplaza la del borde arrastrado; los vértices vecinos
 * salen de cortar cada par de rectas, como hace el núcleo al aplicar el desfase.
 */
export function contornoPrevio(
  poligono: Punto2[],
  indice: number,
  normal: Punto2,
  delta: number,
): Punto2[] | null {
  const total = poligono.length;
  if (total < 3 || indice < 0 || indice >= total) return null;
  const lineas = poligono.map((p, i) => {
    const q = poligono[(i + 1) % total];
    let p0 = p;
    let p1 = q;
    if (i === indice) {
      p0 = desplazar(p, normal, delta);
      p1 = desplazar(q, normal, delta);
    }
    return { p: p0, d: [p1[0] - p0[0], p1[1] - p0[1]] as Punto2 };
  });
  const puntos: Punto2[] = [];
  for (let i = 0; i < total; i += 1) {
    const anterior = lineas[(i - 1 + total) % total];
    const actual = lineas[i];
    const punto = cortaRectas(anterior.p, anterior.d, actual.p, actual.d);
    puntos.push(punto ?? actual.p);
  }
  let area = 0;
  for (let i = 0; i < total; i += 1) {
    const a = puntos[i];
    const b = puntos[(i + 1) % total];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) <= 1e-9 ? null : puntos;
}
