// O026: geometría pura de la herramienta Alinear. Se separa del visor para poder
// probar la detección de la recta de cada elemento y el paralelismo sin WebGL.
import type { ElementoMalla } from "./tipos";
import type { EjeReferencia } from "./herramientas";

export interface RectaAlinear {
  x: number;
  y: number;
  ux: number;
  uy: number;
  /** Medio ancho perpendicular a la recta (cara del elemento). */
  medio: number;
}

export function rectaDeEje(eje: EjeReferencia): RectaAlinear {
  const dx = eje.x2 - eje.x1;
  const dy = eje.y2 - eje.y1;
  const largo = Math.hypot(dx, dy) || 1;
  return { x: eje.x1, y: eje.y1, ux: dx / largo, uy: dy / largo, medio: 0 };
}

export function sonParalelas(a: RectaAlinear, b: RectaAlinear, tolerancia = 1e-6): boolean {
  return Math.abs(a.ux * b.uy - a.uy * b.ux) <= tolerancia;
}

/** Desplazamiento perpendicular (según la normal derecha de la referencia). */
export function desplazamientoAlinear(
  elemento: RectaAlinear,
  referencia: RectaAlinear,
  cara: string,
): number | null {
  if (!sonParalelas(elemento, referencia)) return null;
  const nx = referencia.uy;
  const ny = -referencia.ux;
  const sReferencia = referencia.x * nx + referencia.y * ny;
  const sElemento = elemento.x * nx + elemento.y * ny;
  if (cara === "centro" || cara === "eje") return sReferencia - sElemento;
  if (cara === "cara1" || cara === "derecha" || cara === "positiva") {
    return sReferencia + elemento.medio - sElemento;
  }
  if (cara === "cara2" || cara === "izquierda" || cara === "negativa") {
    return sReferencia - elemento.medio - sElemento;
  }
  const lado = sElemento >= sReferencia ? 1 : -1;
  return sReferencia + lado * elemento.medio - sElemento;
}

/** Cara del elemento que el puntero tocó (su normal derecha o izquierda). */
export function caraEnPunto(elemento: RectaAlinear, punto: [number, number]): "cara1" | "cara2" {
  const nx = elemento.uy;
  const ny = -elemento.ux;
  return nx * (punto[0] - elemento.x) + ny * (punto[1] - elemento.y) >= 0
    ? "cara1"
    : "cara2";
}

function cajaDeVertices(vertices: Float32Array): {
  x: number;
  y: number;
  ancho: number;
  fondo: number;
} {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, ancho: x2 - x1, fondo: y2 - y1 };
}

/**
 * Recta media del elemento en planta. Para columnas y zapatas rectangulares se
 * elige el par de caras paralelo a `direccion` (la de la referencia).
 */
export function rectaDeMalla(
  malla: ElementoMalla,
  direccion?: { ux: number; uy: number },
): RectaAlinear | null {
  if (malla.eje) {
    const [x1, y1, x2, y2] = malla.eje;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const largo = Math.hypot(dx, dy);
    if (largo <= 1e-9) return null;
    const espesor = malla.capas.reduce((suma, capa) => suma + (capa.espesor || 0), 0);
    return { x: x1, y: y1, ux: dx / largo, uy: dy / largo, medio: (espesor || 0.15) / 2 };
  }
  const estructura = malla.estructura;
  if (!estructura) {
    const caja = cajaDeVertices(malla.vertices);
    const dx = caja.ancho >= caja.fondo ? 1 : 0;
    const dy = dx ? 0 : 1;
    return {
      x: caja.x,
      y: caja.y,
      ux: dx,
      uy: dy,
      medio: Math.min(caja.ancho, caja.fondo) / 2,
    };
  }
  const datos = estructura.datos;
  const seccion = estructura.seccion;
  const numero = (clave: string, defecto = 0): number => {
    const valor = Number(datos[clave] ?? seccion[clave]);
    return Number.isFinite(valor) ? valor : defecto;
  };
  const x1 = numero("X1", numero("X"));
  const y1 = numero("Y1", numero("Y"));
  const x2 = datos.X2 !== undefined ? numero("X2") : undefined;
  const y2 = datos.Y2 !== undefined ? numero("Y2") : undefined;
  const rotacion = numero("Rotacion");
  let ux = Math.cos(rotacion);
  let uy = Math.sin(rotacion);
  let medio: number;
  if (x2 !== undefined && y2 !== undefined && Math.hypot(x2 - x1, y2 - y1) > 1e-9) {
    const largo = Math.hypot(x2 - x1, y2 - y1);
    ux = (x2 - x1) / largo;
    uy = (y2 - y1) / largo;
    medio = (numero("B", numero("Ancho", 0.3)) || 0.3) / 2;
  } else if (malla.categoria === "columnas") {
    medio = Math.abs(uy) > 0.5 ? numero("B", 0.3) / 2 : numero("H", 0.3) / 2;
  } else {
    medio = (numero("Ancho", numero("Largo", 0.3)) || 0.3) / 2;
  }
  if (direccion && Math.abs(direccion.ux * uy - direccion.uy * ux) > 1e-6) {
    const anteriorUx = ux;
    ux = -uy;
    uy = anteriorUx;
    medio =
      malla.categoria === "columnas"
        ? numero("B", 0.3) / 2
        : (numero("Largo", medio * 2) || medio * 2) / 2;
  }
  return { x: x1, y: y1, ux, uy, medio };
}
