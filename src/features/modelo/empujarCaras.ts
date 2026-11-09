// O056: empujar/tirar caras de elementos existentes (fase 2 estilo SketchUp).
//
// Módulo puro: la vista le pasa la clase IFC del elemento, su eje o datos de
// colocación y la normal/centro de la cara tocada. Aquí se decide qué hace esa
// cara (tabla de la spec) y se mide la distancia del ratón a lo largo de la
// normal. No conoce three.js ni el estado de la aplicación.
import type { CaraPlana, Vec3 } from "./inferencias3d";

export type AccionEmpujarCara =
  | "altura"
  | "extremo"
  | "borde"
  | "medida"
  | "ninguna";

export interface ElementoCara {
  /** Clase IFC: IfcWall, IfcSlab, IfcColumn, IfcBeam, IfcBuildingElementProxy… */
  clase: string;
  /** Alias de la biblioteca (castillo, cerramiento, dala, trabe…). */
  alias?: string | null;
  /** Eje del muro en planta [x1, y1, x2, y2]. */
  eje?: [number, number, number, number] | null;
  /** Datos de colocación de la estructura (X1, Y1, X2, Y2…). */
  datos?: Record<string, number | string> | null;
}

export interface CaraEmpujable {
  normal: Vec3;
  centro: Vec3;
}

export interface ResultadoCara {
  accion: AccionEmpujarCara;
  etiqueta: string;
  /** Explicación cuando la cara no se puede empujar. */
  motivo?: string;
}

export interface Rayo {
  origen: Vec3;
  direccion: Vec3;
}

const EPS = 1e-9;
const COSENO_VERTICAL = 0.9;
const COSENO_EJE = 0.7;

const punto = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const restar = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

function normalizar(a: Vec3): Vec3 | null {
  const largo = Math.hypot(a.x, a.y, a.z);
  if (largo < EPS) return null;
  return { x: a.x / largo, y: a.y / largo, z: a.z / largo };
}

/** Dirección horizontal del eje de un elemento lineal, si se conoce. */
export function direccionEje(elemento: ElementoCara): [number, number] | null {
  let x1: number | undefined;
  let y1: number | undefined;
  let x2: number | undefined;
  let y2: number | undefined;
  if (elemento.eje) {
    [x1, y1, x2, y2] = elemento.eje;
  } else if (elemento.datos) {
    const datos = elemento.datos;
    x1 = Number(datos.X1 ?? datos.X);
    y1 = Number(datos.Y1 ?? datos.Y);
    x2 = Number(datos.X2);
    y2 = Number(datos.Y2);
  }
  if (![x1, y1, x2, y2].every((v) => Number.isFinite(v))) return null;
  const dx = (x2 as number) - (x1 as number);
  const dy = (y2 as number) - (y1 as number);
  const largo = Math.hypot(dx, dy);
  if (largo < EPS) return null;
  return [dx / largo, dy / largo];
}

/**
 * Tabla de la spec O056: qué hace cada cara según la clase IFC y su orientación.
 * El «no se puede» lleva el texto exacto del tooltip.
 */
export function clasificarCaraEmpujar(
  elemento: ElementoCara,
  cara: CaraEmpujable,
): ResultadoCara {
  const normal = normalizar(cara.normal);
  if (!normal) {
    return { accion: "ninguna", etiqueta: "", motivo: "No se puede empujar este elemento" };
  }
  const vertical = Math.abs(normal.z) >= COSENO_VERTICAL;

  if (elemento.clase === "IfcWall") {
    if (vertical) {
      if (normal.z > 0) return { accion: "altura", etiqueta: "Altura del muro" };
      return {
        accion: "ninguna",
        etiqueta: "",
        motivo: "El espesor lo da el tipo",
      };
    }
    const eje = direccionEje(elemento);
    const aLoLargo = eje
      ? Math.abs(normal.x * eje[0] + normal.y * eje[1])
      : 0;
    if (aLoLargo >= COSENO_EJE) {
      return { accion: "extremo", etiqueta: "Extremo del muro" };
    }
    return {
      accion: "ninguna",
      etiqueta: "",
      motivo: "El espesor lo da el tipo",
    };
  }

  if (elemento.clase === "IfcSlab") {
    if (vertical) {
      return {
        accion: "ninguna",
        etiqueta: "",
        motivo: "El espesor lo da el tipo",
      };
    }
    return { accion: "borde", etiqueta: "Borde de losa" };
  }

  if (elemento.clase === "IfcColumn") {
    if (vertical && normal.z > 0) {
      return {
        accion: "altura",
        etiqueta:
          elemento.alias === "castillo" ? "Altura del castillo" : "Altura de la columna",
      };
    }
    return {
      accion: "ninguna",
      etiqueta: "",
      motivo: "No se puede empujar este elemento",
    };
  }

  if (elemento.clase === "IfcBeam") {
    const eje = direccionEje(elemento);
    const aLoLargo =
      eje && !vertical
        ? Math.abs(normal.x * eje[0] + normal.y * eje[1])
        : 0;
    if (aLoLargo >= COSENO_EJE) {
      const etiqueta =
        elemento.alias === "cerramiento"
          ? "Extremo del cerramiento"
          : elemento.alias === "dala"
            ? "Extremo de la dala"
            : "Extremo de la viga";
      return { accion: "extremo", etiqueta };
    }
    return {
      accion: "ninguna",
      etiqueta: "",
      motivo: "No se puede empujar este elemento",
    };
  }

  if (elemento.clase === "IfcBuildingElementProxy") {
    return { accion: "medida", etiqueta: "Medida del genérico" };
  }

  return {
    accion: "ninguna",
    etiqueta: "",
    motivo: "No se puede empujar este elemento",
  };
}

/**
 * Distancia con signo a lo largo de la normal de la cara. Se buscan los puntos
 * más cercanos entre el rayo del ratón y la recta `centro + s·normal`; `s` es
 * la distancia que se muestra en la cota (positivo hacia afuera).
 */
export function distanciaSobreNormal(
  rayo: Rayo,
  puntoCara: Vec3,
  normalCara: Vec3,
): number | null {
  const n = normalizar(normalCara);
  const d = normalizar(rayo.direccion);
  if (!n || !d) return null;
  const w = restar(rayo.origen, puntoCara);
  const b = punto(d, n);
  const e = punto(w, n);
  const dd = punto(w, d);
  const den = 1 - b * b;
  if (Math.abs(den) < 1e-9) return null;
  const t = (b * e - dd) / den;
  return e + b * t;
}

function puntoEnPoligono2D(p: [number, number], poligono: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (
      Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) <= 1e-7 &&
      p[0] >= Math.min(a[0], b[0]) - 1e-7 &&
      p[0] <= Math.max(a[0], b[0]) + 1e-7 &&
      p[1] >= Math.min(a[1], b[1]) - 1e-7 &&
      p[1] <= Math.max(a[1], b[1]) + 1e-7
    ) {
      return true;
    }
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (p[0] < x) dentro = !dentro;
    }
  }
  return dentro;
}

/** Cara plana que contiene el punto (para resaltar la cara completa tocada). */
export function caraEnPunto(
  p: Vec3,
  caras: CaraPlana[],
  tolerancia = 1e-4,
): CaraPlana | null {
  for (const cara of caras) {
    if (cara.poligono.length < 3) continue;
    const normal = cara.normal ? normalizar(cara.normal) : null;
    if (!normal) continue;
    const separacion = Math.abs(punto(normal, restar(p, cara.poligono[0])));
    if (separacion > tolerancia) continue;
    const u = Math.abs(normal.z) < 0.9
      ? normalizar({ x: 0, y: 0, z: 1 })
      : normalizar({ x: 1, y: 0, z: 0 });
    if (!u) continue;
    const ejeU = normalizar({
      x: normal.y * u.z - normal.z * u.y,
      y: normal.z * u.x - normal.x * u.z,
      z: normal.x * u.y - normal.y * u.x,
    });
    if (!ejeU) continue;
    const ejeV = {
      x: normal.y * ejeU.z - normal.z * ejeU.y,
      y: normal.z * ejeU.x - normal.x * ejeU.z,
      z: normal.x * ejeU.y - normal.y * ejeU.x,
    };
    const proyectar = (q: Vec3): [number, number] => {
      const r = restar(q, cara.poligono[0]);
      return [punto(r, ejeU), punto(r, ejeV)];
    };
    const poligono = cara.poligono.map(proyectar);
    if (puntoEnPoligono2D(proyectar(p), poligono)) return cara;
  }
  return null;
}
