// O014a: texto de la cabeza de nivel. Formato acordado: prefijo, espacio, signo
// (solo si no es cero), decimales del estilo y unidad. Ej.: `Npt +2.20m`.
import type { EstiloNivel } from "./estilos";

export function textoCabezaNivel(elev: number, estilo: EstiloNivel): string {
  const factor = 10 ** estilo.decimales;
  // Redondear antes de decidir el signo evita el «-0.00» en negativos diminutos.
  const valor = Math.round(Math.abs(elev) * factor) / factor;
  const signo = elev < 0 ? "-" : estilo.signo ? "+" : "";
  const cuerpo = valor === 0
    ? valor.toFixed(estilo.decimales)
    : `${signo}${valor.toFixed(estilo.decimales)}`;
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

/**
 * O014b: alto real de la banda de una cabeza, medido con los mismos tamaños con
 * que se dibuja: texto principal + separación + nombre (si se muestra) + margen.
 */
export interface MedidasBandaCabeza {
  altoTexto: number;
  altoNombre: number;
  mostrarNombre: boolean;
  separacion: number;
  margen: number;
}

export function altoBandaCabeza(medidas: MedidasBandaCabeza): number {
  const numero = (valor: number) => (Number.isFinite(valor) ? Math.max(0, valor) : 0);
  return (
    numero(medidas.altoTexto) +
    numero(medidas.separacion) +
    (medidas.mostrarNombre ? numero(medidas.altoNombre) : 0) +
    numero(medidas.margen)
  );
}

/** Distancia del centro del nombre por debajo de la línea del nivel. */
export const DESFASE_NOMBRE_CABEZA = 1.4;

/**
 * O014b: el nombre se dibuja por debajo de la línea; su borde inferior es lo que
 * ocupa la cabeza hacia abajo. La banda de acomodo empieza ahí, no en la línea.
 */
export function desfaseInferiorCabeza(
  altoNombre: number,
  mostrarNombre: boolean,
): number {
  if (!mostrarNombre || !Number.isFinite(altoNombre)) return 0;
  return -Math.max(0, altoNombre) * (DESFASE_NOMBRE_CABEZA + 0.5);
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

/**
 * O021b: centro vertical del texto de un nivel. Queda ARRIBA de su línea con el
 * margen pedido (1,5 mm de papel en el visor): primero la forma de la cabeza y
 * después el margen, de modo que la línea nunca cruce el texto.
 */
export function posicionTextoNivel(
  zCabeza: number,
  altoForma: number,
  altoTexto: number,
  margen: number,
): number {
  const numero = (valor: number) => (Number.isFinite(valor) ? Math.max(0, valor) : 0);
  return zCabeza + numero(altoForma) + numero(margen) + numero(altoTexto) / 2;
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

// O029: herramienta «Nivel» en alzado/corte. La elevación se engancha a 5 cm, a
// niveles existentes y a caras horizontales; el nombre sale solo y las cotas
// temporales al nivel inferior/superior se pueden teclear (0.50 sobre Nivel 1).
export const PASO_NIVEL = 0.05;
/** Tolerancia del imán de nivel: 3 mm, por debajo de la validación de 1 mm. */
export const TOLERANCIA_NIVEL = 0.003;

export interface NivelRef {
  globalid: string;
  nombre: string;
  elevacion: number;
}

function numeroDeNombreNivel(nombre: string): number | null {
  const coincidencia = /^nivel\s+(-?\d+(?:\.\d+)?)\b/i.exec(nombre.trim());
  if (!coincidencia) return null;
  const valor = Number(coincidencia[1]);
  return Number.isFinite(valor) ? valor : null;
}

function formatearNumeroNivel(valor: number): string {
  return String(Number(valor.toFixed(3)));
}

/**
 * O029: nombre automático del nivel que se está dibujando. Entre «Nivel 1» (0.00)
 * y «Nivel 2» (3.00), a 1.50 sale «Nivel 1.5». Si no hay hueco con número, sigue
 * la numeración más alta; si los nombres no numeran, usa el número de niveles.
 */
export function nombreNivelAutomatico(
  niveles: NivelRef[],
  elevacion: number,
): string {
  const ordenados = [...niveles].sort((a, b) => a.elevacion - b.elevacion);
  const inferiores = ordenados.filter((n) => n.elevacion < elevacion - 1e-6);
  const superiores = ordenados.filter((n) => n.elevacion > elevacion + 1e-6);
  const inferior = inferiores[inferiores.length - 1];
  const superior = superiores[0];
  const numeros = niveles
    .map((n) => numeroDeNombreNivel(n.nombre))
    .filter((v): v is number => v !== null);
  if (inferior && superior) {
    const nInferior = numeroDeNombreNivel(inferior.nombre);
    const nSuperior = numeroDeNombreNivel(superior.nombre);
    if (
      nInferior !== null &&
      nSuperior !== null &&
      nSuperior > nInferior + 1e-9
    ) {
      const usados = new Set(niveles.map((n) => n.nombre.toLowerCase()));
      let bajo = nInferior;
      const alto = nSuperior;
      for (let i = 0; i < 12; i += 1) {
        const medio = Math.round(((bajo + alto) / 2) * 1000) / 1000;
        const nombre = `Nivel ${formatearNumeroNivel(medio)}`;
        if (!usados.has(nombre.toLowerCase())) return nombre;
        bajo = medio;
      }
    }
  }
  if (numeros.length > 0) {
    return `Nivel ${formatearNumeroNivel(Math.max(...numeros) + 1)}`;
  }
  return `Nivel ${niveles.length}`;
}

/** O029: dos niveles a ±1 mm es error; el segundo no se crea. */
export function nivelEnElevacion(
  niveles: NivelRef[],
  elevacion: number,
  globalidExcluido?: string,
): NivelRef | null {
  return (
    niveles.find(
      (n) =>
        n.globalid !== globalidExcluido &&
        Math.abs(n.elevacion - elevacion) <= 0.001,
    ) ?? null
  );
}

/**
 * O029: imán de elevación: primero los candidatos (niveles y caras horizontales)
 * dentro de 3 mm; si no, se redondea a la cuadrícula de 5 cm.
 */
export function engancheElevacionNivel(
  elevacion: number,
  candidatos: number[],
  paso = PASO_NIVEL,
  tolerancia = TOLERANCIA_NIVEL,
): number {
  if (!Number.isFinite(elevacion)) return 0;
  let mejor: number | null = null;
  for (const candidato of candidatos) {
    if (!Number.isFinite(candidato)) continue;
    const distancia = Math.abs(candidato - elevacion);
    if (distancia <= tolerancia && (mejor === null || distancia < Math.abs(mejor - elevacion))) {
      mejor = candidato;
    }
  }
  if (mejor !== null) return Math.round(mejor * 1e6) / 1e6;
  return Math.round(Math.round(elevacion / paso) * paso * 1e6) / 1e6;
}

export interface CotaTemporalNivel {
  inferior: NivelRef | null;
  superior: NivelRef | null;
  /** Distancia de la elevación a cada nivel vecino (positiva). */
  desfaseInferior: number;
  desfaseSuperior: number;
}

/** O029: cotas temporales al nivel de abajo y al de arriba más cercanos. */
export function cotasTemporalesNivel(
  elevacion: number,
  niveles: NivelRef[],
): CotaTemporalNivel {
  let inferior: NivelRef | null = null;
  let superior: NivelRef | null = null;
  for (const nivel of niveles) {
    if (nivel.elevacion < elevacion - 1e-6) {
      if (!inferior || nivel.elevacion > inferior.elevacion) inferior = nivel;
    } else if (nivel.elevacion > elevacion + 1e-6) {
      if (!superior || nivel.elevacion < superior.elevacion) superior = nivel;
    }
  }
  return {
    inferior,
    superior,
    desfaseInferior: inferior ? elevacion - inferior.elevacion : 0,
    desfaseSuperior: superior ? superior.elevacion - elevacion : 0,
  };
}

/**
 * O029: cota temporal tecleada, relativa al nivel inferior. «0.50» sobre Nivel 1
 * (0.00) da 0.50 m; acepta coma decimal y rechaza vacío o texto no numérico.
 */
export function elevacionDesdeCota(
  inferior: NivelRef | null,
  texto: string,
): number | null {
  const limpio = (texto || "").trim().replace(",", ".");
  if (limpio === "") return null;
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;
  const base = inferior?.elevacion ?? 0;
  return Math.round((base + valor) * 1e6) / 1e6;
}
