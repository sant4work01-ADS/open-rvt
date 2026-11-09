// O055: geometría pura de las anotaciones de las vistas 3D (ejes, niveles, cotas y
// notas). El visor solo dibuja lo que devuelve este módulo; así las posiciones de
// globos y rectángulos se prueban sin WebGL.
import type { Caja, Nivel, Vista } from "./tipos";
import type { EjeReferencia } from "./herramientas";
import type { FamiliaCotas } from "./cotas";
import { direccionAlzado } from "./vistas";

export type Punto3 = [number, number, number];

/** Nota de texto guardada en el IFC como IfcAnnotation. */
export interface Nota {
  globalid: string;
  texto: string;
  posicion: Punto3;
  /** Nombre del nivel que la contiene (`_datos_nota.nivel`). */
  nivel: string;
  /** GlobalId del nivel, para comparar con `Vista.nivel`. */
  nivelGlobalid?: string;
}

export interface Eje3D {
  globalid: string;
  etiqueta: string;
  inicio: Punto3;
  fin: Punto3;
}

export interface Nivel3D {
  globalid: string;
  nombre: string;
  elevacion: number;
  /** Etiqueta «Nombre · +elevación» que se escribe en la esquina. */
  texto: string;
  /** Esquinas del rectángulo discontinuo, en orden. */
  esquinas: Punto3[];
  /** Esquina donde va la etiqueta. */
  etiqueta: Punto3;
}

export interface Cota3D {
  tipo: "parcial" | "total";
  texto: string;
  valor: number;
  /** Extremos de la línea de cota. */
  inicio: Punto3;
  fin: Punto3;
  /** Punto medio donde se escribe el valor. */
  textoPos: Punto3;
}

/** Elevación del nivel más bajo del modelo; 0 si no hay niveles. */
export function elevacionBaseNiveles(niveles: Nivel[]): number {
  if (niveles.length === 0) return 0;
  return Math.min(...niveles.map((n) => n.elevacion));
}

/**
 * Cotas automáticas entre ejes, dibujadas a la elevación indicada. Las líneas van
 * por fuera del último eje, igual que en planta, para no cruzar la retícula.
 */
export function calcularCotas3d(
  familias: FamiliaCotas[],
  z: number,
  separacion = 1,
): Cota3D[] {
  const cotas: Cota3D[] = [];
  for (const familia of familias) {
    const [ux, uy] = familia.direccion;
    const [nx, ny] = familia.normal;
    const punto = (s: number, t: number): Punto3 => [
      nx * s + ux * t,
      ny * s + uy * t,
      z,
    ];
    const agregar = (
      tipo: "parcial" | "total",
      desde: number,
      hasta: number,
      t: number,
      texto: string,
      valor: number,
    ) => {
      cotas.push({
        tipo,
        texto,
        valor,
        inicio: punto(desde, t),
        fin: punto(hasta, t),
        textoPos: punto((desde + hasta) / 2, t),
      });
    };
    const tParcial = familia.bordeBurbujas + separacion;
    for (const parcial of familia.parciales) {
      agregar(
        "parcial",
        parcial.desde,
        parcial.hasta,
        tParcial,
        parcial.valor.toFixed(2),
        parcial.valor,
      );
    }
    if (familia.total) {
      agregar(
        "total",
        familia.total.desde,
        familia.total.hasta,
        tParcial + separacion,
        familia.total.valor.toFixed(2),
        familia.total.valor,
      );
    }
  }
  return cotas;
}

/** Nombre y elevación con signo, como en los cabezales de alzado. */
export function textoNivel3d(nivel: Nivel): string {
  const valor = Math.abs(nivel.elevacion).toFixed(2);
  const signo = nivel.elevacion < 0 ? "-" : "+";
  return `${nivel.nombre} · ${signo}${valor}`;
}

/**
 * Un rectángulo discontinuo a la altura de cada nivel, rodeando la caja del modelo
 * con `margen` metros. La etiqueta se coloca en la esquina suroeste.
 */
export function calcularNiveles3d(
  niveles: Nivel[],
  caja: Caja,
  margen = 1,
): Nivel3D[] {
  const minX = caja.min[0] - margen;
  const minY = caja.min[1] - margen;
  const maxX = caja.max[0] + margen;
  const maxY = caja.max[1] + margen;
  return niveles.map((nivel) => {
    const z = nivel.elevacion;
    return {
      globalid: nivel.globalid,
      nombre: nivel.nombre,
      elevacion: z,
      texto: textoNivel3d(nivel),
      esquinas: [
        [minX, minY, z],
        [maxX, minY, z],
        [maxX, maxY, z],
        [minX, maxY, z],
      ],
      etiqueta: [minX, minY, z],
    };
  });
}

/** Ejes completos a la elevación más baja, con globo en ambos extremos. */
export function calcularEjes3d(ejes: EjeReferencia[], z: number): Eje3D[] {
  return ejes
    .filter((eje) => !!eje.globalid && !!eje.etiqueta)
    .map((eje) => ({
      globalid: eje.globalid,
      etiqueta: eje.etiqueta,
      inicio: [eje.x1, eje.y1, z],
      fin: [eje.x2, eje.y2, z],
    }));
}

/** Proyección de un punto de mundo a la coordenada horizontal y profundidad de una vista. */
export function proyeccionHorizontal(
  posicion: Punto3,
  vista: Vista,
): { t: number; profundidad: number } | null {
  if (vista.tipo === "alzado") {
    const d = direccionAlzado(vista.orientacion ?? "sur");
    const h: [number, number] = [-d[1], d[0]];
    return {
      t: posicion[0] * h[0] + posicion[1] * h[1],
      profundidad: posicion[0] * d[0] + posicion[1] * d[1],
    };
  }
  if (vista.tipo === "corte" && vista.direccion) {
    const [dx, dy] = vista.direccion;
    const largo = Math.hypot(dx, dy);
    if (largo < 1e-12) return null;
    const d: [number, number] = [dx / largo, dy / largo];
    const h: [number, number] = [-d[1], d[0]];
    const referencia = vista.puntoA ?? [0, 0];
    return {
      t: posicion[0] * h[0] + posicion[1] * h[1],
      profundidad:
        (posicion[0] - referencia[0]) * d[0] + (posicion[1] - referencia[1]) * d[1],
    };
  }
  if (vista.tipo === "planta") {
    return { t: posicion[0], profundidad: posicion[1] };
  }
  return null;
}

/**
 * ¿La nota debe verse en esta vista? En 3D siempre; en planta solo la de su nivel;
 * en alzado y corte si cae dentro del ancho del modelo y de su rango de profundidad.
 */
export function notaVisibleEnVista(nota: Nota, vista: Vista, caja: Caja): boolean {
  if (vista.tipo === "iso" || vista.tipo === "perspectiva") return true;
  if (vista.tipo === "planta") {
    const gid = nota.nivelGlobalid ?? nota.nivel;
    if (gid && vista.nivel) return gid === vista.nivel;
    const z = nota.posicion[2];
    const fondo = vista.profundidad ?? caja.min[2];
    const arriba = vista.alturaPlano ?? caja.max[2];
    return z >= Math.min(fondo, arriba) - 1e-6 && z <= Math.max(fondo, arriba) + 1e-6;
  }
  if (vista.tipo !== "alzado" && vista.tipo !== "corte") return false;
  const proyeccion = proyeccionHorizontal(nota.posicion, vista);
  if (!proyeccion) return false;
  const d =
    vista.tipo === "alzado"
      ? direccionAlzado(vista.orientacion ?? "sur")
      : (() => {
          const [dx, dy] = vista.direccion ?? [0, 1];
          const largo = Math.hypot(dx, dy) || 1;
          return [dx / largo, dy / largo] as [number, number];
        })();
  const h: [number, number] = [-d[1], d[0]];
  const t: number[] = [];
  for (const x of [caja.min[0], caja.max[0]]) {
    for (const y of [caja.min[1], caja.max[1]]) t.push(x * h[0] + y * h[1]);
  }
  const margen = 1;
  const tMin = Math.min(...t) - margen;
  const tMax = Math.max(...t) + margen;
  const z = nota.posicion[2];
  const zMin = caja.min[2] - margen;
  const zMax = caja.max[2] + margen;
  if (proyeccion.t < tMin || proyeccion.t > tMax || z < zMin || z > zMax) {
    return false;
  }
  if (vista.tipo === "corte") {
    const rango = vista.profundidad ?? 10;
    return proyeccion.profundidad >= -0.001 && proyeccion.profundidad <= rango + 1e-6;
  }
  return true;
}
