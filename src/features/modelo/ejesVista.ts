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
  if (typeof ajuste.globoInicio === "boolean") salida.globoInicio = ajuste.globoInicio;
  if (typeof ajuste.globoFin === "boolean") salida.globoFin = ajuste.globoFin;
  return ajusteVacio(salida) ? undefined : salida;
}

export function ajusteVacio(ajuste: AjusteEjeVista | null | undefined): boolean {
  if (!ajuste) return true;
  return (
    !esPunto(ajuste.extremoInicio) &&
    !esPunto(ajuste.extremoFin) &&
    (!ajuste.codosInicio || ajuste.codosInicio.length === 0) &&
    (!ajuste.codosFin || ajuste.codosFin.length === 0) &&
    typeof ajuste.globoInicio !== "boolean" &&
    typeof ajuste.globoFin !== "boolean"
  );
}

/** Convierte milímetros de papel a metros de modelo según la escala de la vista. */
export function mmPapelAMetros(mm: number, escala: number): number {
  return (mm * escala) / 1000;
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
  // O011b: sin extremo libre el globo vive en el último codo; así el globo sigue
  // a los vértices al arrastrarlos y vuelve al codo cuando se cierra el candado.
  const codosInicio = limpio?.codosInicio ?? [];
  const codosFin = limpio?.codosFin ?? [];
  const globoInicio =
    limpio?.extremoInicio ?? codosInicio[codosInicio.length - 1] ?? inicio;
  const globoFin = limpio?.extremoFin ?? codosFin[codosFin.length - 1] ?? fin;
  const tramoInicio = [inicio, ...codosInicio, globoInicio];
  const tramoFin = [fin, ...codosFin, globoFin];
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
 * O011b: agrega un codo al extremo como el «Add elbow» de Revit.
 *
 * - El primer codo avanza `avance` (3 mm de papel) por la línea y desplaza el
 *   globo `lateral` (un diámetro de globo) hacia un lado. El tramo queda:
 *   avance, diagonal hasta el desplazamiento y globo.
 * - El segundo codo añade el tramo recto final: avance, diagonal, avance y globo.
 * - La línea base sigue terminando en el extremo original; el globo ya no vuelve
 *   a él, sino que se dibuja al final de los codos.
 *
 * `direccion` es el sentido hacia afuera del eje (del interior al extremo).
 */
export function agregarCodoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  globo: Punto2,
  direccion: Punto2,
  avance: number,
  lateral: number,
): AjusteEjeVista {
  const base = normalizarAjusteEje(ajuste) ?? {};
  const claveCodos = lado === "inicio" ? "codosInicio" : "codosFin";
  const claveExtremo = lado === "inicio" ? "extremoInicio" : "extremoFin";
  const codos = [...(base[claveCodos] ?? [])];
  if (codos.length >= MAXIMO_CODOS) return base;
  const afuera = normalizar(direccion);
  const ladoPerpendicular: Punto2 = [afuera[1], -afuera[0]];
  if (codos.length === 0) {
    // Primer codo: recto 3 mm y la diagonal que desplaza el globo un diámetro.
    const primero: Punto2 = [
      globo[0] + afuera[0] * avance,
      globo[1] + afuera[1] * avance,
    ];
    const nuevoGlobo: Punto2 = [
      primero[0] + ladoPerpendicular[0] * lateral + afuera[0] * avance,
      primero[1] + ladoPerpendicular[1] * lateral + afuera[1] * avance,
    ];
    return { ...base, [claveCodos]: [primero], [claveExtremo]: nuevoGlobo };
  }
  // Segundo codo: el globo desplazado pasa a ser vértice y se añade el tramo
  // recto final de 3 mm hasta el borde del globo. El centro queda 3 mm más el
  // radio (medio diámetro), para que el asa del codo no quede dentro del círculo.
  const segundo: Punto2 = [globo[0], globo[1]];
  const hastaElCentro = avance + lateral / 2;
  const nuevoGlobo: Punto2 = [
    segundo[0] + afuera[0] * hastaElCentro,
    segundo[1] + afuera[1] * hastaElCentro,
  ];
  codos.push(segundo);
  return { ...base, [claveCodos]: codos, [claveExtremo]: nuevoGlobo };
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
  else {
    // O011b: sin codos el extremo vuelve a la línea, como antes de agregarlos.
    delete salida[clave];
    delete salida[lado === "inicio" ? "extremoInicio" : "extremoFin"];
  }
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

/** O021: ¿se dibuja el globo de este lado? Por omisión el fin sí y el inicio solo
 *  cuando el extremo se ha tocado, exactamente como se dibujaba en O011. */
export function globoVisibleEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
): boolean {
  const valor = lado === "inicio" ? ajuste?.globoInicio : ajuste?.globoFin;
  if (typeof valor === "boolean") return valor;
  if (lado === "fin") return true;
  return !!ajuste && (!!ajuste.extremoInicio || !!ajuste.codosInicio?.length);
}

/** O021: copia profunda del acomodo (extremos, codos y globos) para otras vistas. */
export function copiarAjusteEje(
  ajuste: AjusteEjeVista | null | undefined,
): AjusteEjeVista | undefined {
  const limpio = normalizarAjusteEje(ajuste);
  if (!limpio) return undefined;
  return {
    ...limpio,
    ...(limpio.extremoInicio ? { extremoInicio: [...limpio.extremoInicio] as Punto2 } : {}),
    ...(limpio.extremoFin ? { extremoFin: [...limpio.extremoFin] as Punto2 } : {}),
    ...(limpio.codosInicio
      ? { codosInicio: limpio.codosInicio.map((p) => [...p] as Punto2) }
      : {}),
    ...(limpio.codosFin ? { codosFin: limpio.codosFin.map((p) => [...p] as Punto2) } : {}),
  };
}

export type FamiliaEje = "vertical" | "horizontal" | "alzado";

interface EjeParaArrastre {
  globalid: string;
  vertical?: boolean;
}

/**
 * O021: arrastre de un extremo con candado. Cerrado (`candado = true`) mueve todos
 * los extremos de la misma familia que comparten la alineación; abierto mueve solo
 * el eje pulsado. Devuelve los ajustes completos para persistirlos de una vez.
 */
export function arrastrarExtremoEje(
  originales: Record<string, AjusteEjeVista>,
  bases: Record<string, { inicio: Punto2; fin: Punto2 }>,
  ejes: EjeParaArrastre[],
  globalid: string,
  lado: LadoEje,
  punto: Punto2,
  candado: boolean,
  familia: FamiliaEje,
  tolerancia = 1e-6,
): Record<string, AjusteEjeVista> {
  const cambios: Record<string, AjusteEjeVista> = { ...originales };
  const basesEje = bases[globalid];
  if (!basesEje) return cambios;
  if (!candado) {
    cambios[globalid] = fijarExtremoEje(originales[globalid], lado, punto) ?? {};
    return cambios;
  }
  const actualEje = extremoEje(originales[globalid], lado, basesEje.inicio, basesEje.fin);
  const delta: Punto2 = [punto[0] - actualEje[0], punto[1] - actualEje[1]];
  const coordenada = (p: Punto2) =>
    familia === "horizontal" ? p[0] : p[1];
  const alineacion = coordenada(actualEje);
  for (const eje of ejes) {
    const mismaFamilia =
      familia === "alzado" || (eje.vertical ? "vertical" : "horizontal") === familia;
    if (!mismaFamilia) continue;
    const b = bases[eje.globalid];
    if (!b) continue;
    const original = originales[eje.globalid];
    const actual = extremoEje(original, lado, b.inicio, b.fin);
    if (Math.abs(coordenada(actual) - alineacion) > tolerancia) continue;
    const nuevo: Punto2 =
      familia === "horizontal"
        ? [actual[0] + delta[0], actual[1]]
        : [actual[0], actual[1] + delta[1]];
    cambios[eje.globalid] = fijarExtremoEje(
      cambios[eje.globalid] ?? original,
      lado,
      nuevo,
    ) ?? {};
  }
  return cambios;
}

/** O021: doble clic en un asa = devolver ese extremo al acomodo automático
 *  (quita su extremo libre y los codos de ese lado; conserva el otro extremo). */
export function restablecerExtremoEje(
  ajuste: AjusteEjeVista | null | undefined,
  lado: LadoEje,
): AjusteEjeVista | undefined {
  const base = normalizarAjusteEje(ajuste);
  if (!base) return undefined;
  const salida: AjusteEjeVista = { ...base };
  delete salida[lado === "inicio" ? "extremoInicio" : "extremoFin"];
  delete salida[lado === "inicio" ? "codosInicio" : "codosFin"];
  return normalizarAjusteEje(salida);
}

// O027: restricciones del arrastre de asas. `direccion` es la dirección del eje en
// la vista: en planta la de la línea y en alzado/corte siempre «vertical».
export type TipoAsaArrastre = "extremo" | "globo" | "codo" | "nivel-cabeza" | "nivel-extremo";
export type DireccionEjeArrastre = "vertical" | "horizontal";

/**
 * O027: devuelve el delta permitido para cada asa. El extremo y el quiebre del codo
 * solo avanzan a lo largo del eje; el globo desplazado solo se separa perpendicular
 * al eje; la cabeza de nivel solo sube/baja y el extremo de su línea solo se corre.
 * Con `libre` (Shift) no se restringe nada.
 */
export function restringirArrastre(
  tipoAsa: TipoAsaArrastre,
  direccionEje: DireccionEjeArrastre,
  delta: Punto2,
  libre = false,
): Punto2 {
  const [dx, dy] = delta;
  if (libre) return [dx, dy];
  if (tipoAsa === "nivel-cabeza") return [0, dy];
  if (tipoAsa === "nivel-extremo") return [dx, 0];
  if (tipoAsa === "globo") {
    return direccionEje === "vertical" ? [dx, 0] : [0, dy];
  }
  return direccionEje === "vertical" ? [0, dy] : [dx, 0];
}

/** O031: el candado de alineación vale para las asas de extremo, incluido el globo
 *  cuando aún no tiene codo (antes el globo quedaba siempre libre y rompía O021). */
export function candadoArrastreAsa(
  tipo: "base" | "globo" | "codo" | "codo-nuevo",
  candadoCerrado: boolean,
): boolean {
  return (tipo === "base" || tipo === "globo") && candadoCerrado;
}

export interface ResultadoIman {
  valor: number;
  enganchado: boolean;
}

/** O027: engancha un valor a la alineación más cercana dentro de la tolerancia. */
export function imanAlineacion(
  valor: number,
  candidatos: number[],
  tolerancia: number,
): ResultadoIman {
  let mejor = valor;
  let distancia = Math.abs(tolerancia);
  let enganchado = false;
  for (const candidato of candidatos) {
    if (!Number.isFinite(candidato)) continue;
    const d = Math.abs(candidato - valor);
    if (d <= distancia) {
      distancia = d;
      mejor = candidato;
      enganchado = true;
    }
  }
  return { valor: mejor, enganchado };
}

/** O027: engancha un desplazamiento a múltiplos del paso (un diámetro de globo). */
export function imanMultiplo(
  valor: number,
  base: number,
  paso: number,
  tolerancia: number,
): ResultadoIman {
  if (!(paso > 1e-9)) return { valor, enganchado: false };
  const multiplo = base + Math.round((valor - base) / paso) * paso;
  const d = Math.abs(multiplo - valor);
  if (d <= Math.abs(tolerancia)) return { valor: multiplo, enganchado: true };
  return { valor, enganchado: false };
}
