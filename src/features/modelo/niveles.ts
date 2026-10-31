// O014a: texto de la cabeza de nivel. Formato acordado: prefijo, espacio, signo
// (solo si no es cero), decimales del estilo y unidad. Ej.: `Npt +2.20m`.
import type { EstiloNivel } from "./estilos";

export function textoCabezaNivel(elev: number, estilo: EstiloNivel): string {
  const factor = 10 ** estilo.decimales;
  // Redondear antes de decidir el signo evita el «-0.00» en negativos diminutos.
  const valor = Math.round(Math.abs(elev) * factor) / factor;
  const cuerpo = valor === 0
    ? valor.toFixed(estilo.decimales)
    : `${elev < 0 ? "-" : "+"}${valor.toFixed(estilo.decimales)}`;
  const conUnidad = `${cuerpo}${estilo.unidad}`;
  return estilo.prefijo ? `${estilo.prefijo} ${conUnidad}` : conUnidad;
}

// O014b: acomodo de cabezas de nivel. Cada cabeza ocupa una banda vertical que
// empieza en la cota del nivel y mide `altoCabezaMundo` (triángulo + texto). Si la
// banda choca con la anterior, el nivel sube lo justo para dejar `separacionMin` de
// aire; nunca se mueve hacia abajo y el orden vertical se conserva.
export interface CabezaNivel {
  elev: number;
  altoCabezaMundo: number;
}

function separarEtiquetas(
  posiciones: number[],
  tamanos: number[],
  separacionMin: number,
): number[] {
  const hueco = Number.isFinite(separacionMin) ? Math.max(0, separacionMin) : 0;
  const indices = posiciones.map((_, i) => i).sort((a, b) => {
    const orden = posiciones[a] - posiciones[b];
    return Math.abs(orden) > 1e-12 ? orden : a - b;
  });
  const desplazamientos = posiciones.map(() => 0);
  let techoAnterior = -Infinity;
  for (const i of indices) {
    const alto = Number.isFinite(tamanos[i]) ? Math.max(0, tamanos[i]) : 0;
    if (Number.isFinite(techoAnterior)) {
      const minimo = techoAnterior + hueco;
      if (posiciones[i] < minimo) desplazamientos[i] = minimo - posiciones[i];
    }
    techoAnterior = posiciones[i] + desplazamientos[i] + alto;
  }
  return desplazamientos;
}

export function acomodarCabezas(
  niveles: CabezaNivel[],
  separacionMin = 0,
): number[] {
  return separarEtiquetas(
    niveles.map((nivel) => nivel.elev),
    niveles.map((nivel) => nivel.altoCabezaMundo),
    separacionMin,
  );
}

/**
 * O014b: mismo acomodo en horizontal para las burbujas de eje de un alzado o corte.
 * `xs` son las posiciones de los ejes a lo largo de la vista; el que queda a la
 * derecha se desplaza con codo cuando su burbuja se encima con la anterior.
 */
export function acomodarBurbujas(
  xs: number[],
  diametro: number,
  separacionMin = 0,
): number[] {
  return separarEtiquetas(xs, xs.map(() => diametro), separacionMin);
}

/** O014b: desplazamiento vertical manual de una cabeza, propio de la vista. */
export function normalizarAjusteNivel(
  valor: unknown,
): { desplazamiento: number } | undefined {
  if (!valor || typeof valor !== "object") return undefined;
  const crudo = valor as Record<string, unknown>;
  const desplazamiento = Number(crudo.desplazamiento);
  if (!Number.isFinite(desplazamiento)) return undefined;
  return { desplazamiento };
}
