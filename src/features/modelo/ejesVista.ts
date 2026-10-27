// O011: geometría de los ejes anotados en una vista. Los ajustes (extremos libres y
// codos) son de anotación y viven en `Vista.ejes`; nunca modifican el IfcGrid.
import type { AjusteEjeVista } from "./tipos";
import type { Punto2 } from "./herramientas";

export type LadoEje = "inicio" | "fin";
export const MAXIMO_CODOS = 2;

const esPunto = (valor: unknown): valor is [number, number] =>
  Array.isArray(valor) &&
  valor.length === 2 &&
  Number.isFinite(valor[0]) &&
  Number.isFinite(valor[1]);

/** Copia el ajuste descartando puntos inválidos y recortando a dos codos por extremo. */
export function normalizarAjusteEje(
  ajuste: AjusteEjeVista | null | undefined,
): AjusteEjeVista | undefined {
  if (!ajuste || typeof ajuste !== "object") return undefined;
  const salida: AjusteEjeVista = {};
  if (esPunto(ajuste.extremoInicio)) salida.extremoInicio = [...ajuste.extremoInicio];
  if (esPunto(ajuste.extremoFin)) salida.extremoFin = [...ajuste.extremoFin];
  const codosInicio = Array.isArray(ajuste.codosInicio)
    ? ajuste.codosInicio.filter(esPunto).slice(0, MAXIMO_CODOS)
    : [];
  const codosFin = Array.isArray(ajuste.codosFin)
    ? ajuste.codosFin.filter(esPunto).slice(0, MAXIMO_CODOS)
    : [];
  if (codosInicio.length > 0) salida.codosInicio = codosInicio.map((p) => [...p] as [number, number]);
  if (codosFin.length > 0) salida.codosFin = codosFin.map((p) => [...p] as [number, number]);
  return ajusteVacio(salida) ? undefined : salida;
}

export function ajusteVacio(ajuste: AjusteEjeVista | null | undefined): boolean {
  if (!ajuste) return true;
  return (
    !esPunto(ajuste.extremoInicio) &&
    !esPunto(ajuste.extremoFin) &&
    (!ajuste.codosInicio || ajuste.codosInicio.length === 0) &&
    (!ajuste.codosFin || ajuste.codosFin.length === 0)
  );
}

/** Convierte milímetros de papel a metros de modelo según la escala de la vista. */
export function mmPapelAMetros(mm: number, escala: number): number {
  return (mm * escala) / 1000;
}

function restar(a: Punto2, b: Punto2): Punto2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function normalizar(v: Punto2): Punto2 {
  const largo = Math.hypot(v[0], v[1]);
  if (largo < 1e-12) return [1, 0];
  return [v[0] / largo, v[1] / largo];
}

function deduplicar(puntos: Punto2[]): Punto2[] {
  const salida: Punto2[] = [];
  for (const punto of puntos) {
    const ultimo = salida[salida.length - 1];
    if (!ultimo || Math.hypot(punto[0] - ultimo[0], punto[1] - ultimo[1]) > 1e-9) {
      salida.push([punto[0], punto[1]]);
    }
  }
  return salida;
}

export interface GeometriaEje {
  /** Polilínea completa, del globo de inicio al globo de fin. */
  puntos: Punto2[];
  /** Globo de inicio; no se dibuja en alzados ni si el extremo no se ha tocado. */
  globoInicio?: Punto2;
  globoFin: Punto2;
  /** Puntos donde se apoya la línea antes de los codos (sin extremos libres). */
  baseInicio: Punto2;
  baseFin: Punto2;
}

/**
 * Construye la polilínea del eje. `inicio` y `fin` son los extremos de la línea del
 * IfcGrid en coordenadas de la vista (XY en planta; (s, z) en alzados y cortes).
 * Cada tramo es base → codos → globo; el globo es el extremo libre si existe.
 */
export function geometriaEje(
  ajuste: AjusteEjeVista | undefined,
  inicio: Punto2,
  fin: Punto2,
  opciones: { globoInicio?: boolean } = {},
): GeometriaEje {
  const limpio = normalizarAjusteEje(ajuste);
  const globoInicio = limpio?.extremoInicio ?? inicio;
  const globoFin = limpio?.extremoFin ?? fin;
  const tramoInicio = [inicio, ...(limpio?.codosInicio ?? []), globoInicio];
  const tramoFin = [fin, ...(limpio?.codosFin ?? []), globoFin];
  const puntos = deduplicar([
    ...tramoInicio.slice().reverse(),
    ...tramoFin,
  ]);
  return {
    puntos,
    globoInicio: opciones.globoInicio ? globoInicio : undefined,
    globoFin,
    baseInicio: inicio,
    baseFin: fin,
  };
}

/**
 * Agrega un codo al extremo. Queda a la distancia indicada del globo (5 mm de papel)
 * y desplazado 5 mm de lado; el segundo va al otro lado para poder distinguirlos.
 * `interior` es un punto del tramo hacia el que entra la línea.
 */
export function agregarCodoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  globo: Punto2,
  interior: Punto2,
  distancia: number,
): AjusteEjeVista {
  const base = normalizarAjusteEje(ajuste) ?? {};
  const clave = lado === "inicio" ? "codosInicio" : "codosFin";
  const codos = [...(base[clave] ?? [])];
  if (codos.length >= MAXIMO_CODOS) return base;
  const direccion = normalizar(restar(interior, globo));
  const ladoPerpendicular: Punto2 =
    codos.length === 0 ? [-direccion[1], direccion[0]] : [direccion[1], -direccion[0]];
  const nuevo: Punto2 = [
    globo[0] + direccion[0] * distancia + ladoPerpendicular[0] * distancia,
    globo[1] + direccion[1] * distancia + ladoPerpendicular[1] * distancia,
  ];
  codos.push(nuevo);
  return { ...base, [clave]: codos };
}

/** Quita un codo por su índice; conserva el resto del ajuste. */
export function quitarCodoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  indice: number,
): AjusteEjeVista | undefined {
  const base = normalizarAjusteEje(ajuste);
  if (!base) return undefined;
  const clave = lado === "inicio" ? "codosInicio" : "codosFin";
  const codos = [...(base[clave] ?? [])];
  if (indice < 0 || indice >= codos.length) return base;
  codos.splice(indice, 1);
  const salida: AjusteEjeVista = { ...base };
  if (codos.length > 0) salida[clave] = codos;
  else delete salida[clave];
  return normalizarAjusteEje(salida);
}

/** Fija el extremo libre de un lado (o lo borra con `null`, volviendo a la alineación). */
export function fijarExtremoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  punto: Punto2 | null,
): AjusteEjeVista | undefined {
  const base = normalizarAjusteEje(ajuste) ?? {};
  const salida: AjusteEjeVista = { ...base };
  const clave = lado === "inicio" ? "extremoInicio" : "extremoFin";
  if (punto && esPunto(punto)) salida[clave] = [punto[0], punto[1]];
  else delete salida[clave];
  return normalizarAjusteEje(salida);
}

export function extremoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  inicio: Punto2,
  fin: Punto2,
): Punto2 {
  if (lado === "inicio") return ajuste?.extremoInicio ?? inicio;
  return ajuste?.extremoFin ?? fin;
}
