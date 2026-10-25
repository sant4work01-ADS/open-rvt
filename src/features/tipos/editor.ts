// OPEN-RVT O007a: lógica pura del editor de tipos de muro. La tabla de capas, las
// posiciones de la vista previa y la validación del núcleo se prueban sin React.
import type { CapaMuro, FuncionCapa, LineaUbicacion, MaterialBiblioteca } from "@/features/modelo/tipos";

export const FUNCIONES: ReadonlyArray<{ id: FuncionCapa; nombre: string }> = [
  { id: "núcleo", nombre: "Núcleo" },
  { id: "acabado", nombre: "Acabado" },
  { id: "aislante", nombre: "Aislante" },
  { id: "membrana", nombre: "Membrana" },
];

export const LINEAS_UBICACION: ReadonlyArray<{ id: LineaUbicacion; nombre: string }> = [
  { id: "eje_nucleo", nombre: "Eje del núcleo" },
  { id: "cara_exterior", nombre: "Cara exterior" },
  { id: "cara_interior", nombre: "Cara interior" },
  { id: "centro", nombre: "Centro del muro" },
];

export const RAYADOS = ["sólido", "diagonal", "ladrillo", "block", "concreto", "ninguno"] as const;
export const UNIDADES = ["m²", "m³", "kg"] as const;

/** Suma exacta de las capas (sin redondear a centímetros). */
export function totalCapas(capas: ReadonlyArray<Pick<CapaMuro, "espesor">>): number {
  return capas.reduce((suma, capa) => suma + (Number(capa.espesor) || 0), 0);
}

/**
 * Valida que haya exactamente un grupo contiguo de capas de núcleo. Devuelve el
 * mensaje en español o null si la tabla es válida.
 */
export function validarCapas(capas: ReadonlyArray<Pick<CapaMuro, "funcion" | "espesor">>): string | null {
  if (capas.length === 0) return "Agregue al menos una capa.";
  const espesores = capas.map((c) => Number(c.espesor));
  if (espesores.some((e) => !Number.isFinite(e) || e <= 0)) {
    return "Todas las capas necesitan un espesor mayor que cero.";
  }
  const nucleos = capas
    .map((capa, indice) => (capa.funcion === "núcleo" ? indice : -1))
    .filter((indice) => indice >= 0);
  if (nucleos.length === 0) {
    return "El muro necesita al menos una capa de núcleo.";
  }
  const grupos =
    1 + nucleos.slice(1).filter((indice, i) => indice !== nucleos[i] + 1).length;
  if (grupos > 1) {
    return "Las capas de núcleo deben ser contiguas: no puede haber dos núcleos separados.";
  }
  return null;
}

export interface BandaCapa {
  capa: CapaMuro;
  indice: number;
  /** Posición inicial en unidades de la vista previa. */
  x: number;
  /** Ancho proporcional a su espesor real. */
  ancho: number;
  esNucleo: boolean;
}

/**
 * Reparte un ancho de dibujo entre las capas, de exterior a interior, en proporción
 * exacta a sus espesores. Se usa en la vista previa y en las pruebas.
 */
export function posicionesCapas(capas: ReadonlyArray<CapaMuro>, ancho: number): BandaCapa[] {
  const total = totalCapas(capas);
  if (total <= 0 || ancho <= 0) return [];
  let cursor = 0;
  return capas.map((capa, indice) => {
    const banda = {
      capa,
      indice,
      x: cursor,
      ancho: (capa.espesor / total) * ancho,
      esNucleo: capa.funcion === "núcleo",
    };
    cursor += banda.ancho;
    return banda;
  });
}

/** Capa de acabado por defecto para insertar en la tabla. */
export function capaPorDefecto(materiales: ReadonlyArray<MaterialBiblioteca>): CapaMuro {
  const material =
    materiales.find((m) => m.nombre === "Aplanado de mortero (repellado)") ??
    materiales.find((m) => m.categoria === "acabado") ??
    materiales[0];
  return {
    funcion: "acabado",
    material: material?.nombre ?? "",
    espesor: material?.espesor_tipico ?? 0.01,
    color: material?.color,
    rayado: material?.rayado,
    categoria: material?.categoria,
  };
}

/** Nombre libre para duplicar: «Block 15 copia», «Block 15 copia 2»… */
export function nombreDuplicado(base: string, existentes: ReadonlyArray<string>): string {
  const usados = new Set(existentes.map((n) => n.trim().toLocaleLowerCase("es")));
  let candidato = `${base} copia`;
  let numero = 2;
  while (usados.has(candidato.toLocaleLowerCase("es"))) {
    candidato = `${base} copia ${numero}`;
    numero += 1;
  }
  return candidato;
}

/**
 * O007b: reparto de las varillas longitudinales en el perímetro de la sección.
 * Primero las cuatro esquinas y después las caras (abajo/arriba y luego lados).
 * Devuelve coordenadas locales respecto al centro, ya descontado el recubrimiento.
 */
export function posicionesVarillas(
  ancho: number,
  peralte: number,
  cantidad: number,
  recubrimiento = 0.025,
): Array<[number, number]> {
  const total = Math.max(0, Math.floor(cantidad));
  if (total === 0) return [];
  const limpiar = (valor: number) => Number(valor.toFixed(9));
  const x = limpiar(Math.max(ancho / 2 - recubrimiento, 0));
  const y = limpiar(Math.max(peralte / 2 - recubrimiento, 0));
  const esquinas: Array<[number, number]> = [
    [-x, -y],
    [x, -y],
    [x, y],
    [-x, y],
  ];
  if (total <= 4) return esquinas.slice(0, total);
  const salida = [...esquinas];
  const lados = Math.max(total - 4, 0);
  // Las primeras dos van en el centro de las caras horizontales (las de cota H).
  const caras: Array<[number, number]> = [
    [0, -y],
    [0, y],
    [-x, 0],
    [x, 0],
  ];
  for (let i = 0; i < lados; i += 1) {
    if (i < caras.length) {
      salida.push(caras[i]);
      continue;
    }
    // Más varillas: se reparten por tramos en las caras horizontales.
    const tramo = Math.floor((i - caras.length) / 2) + 1;
    const paso = x / (tramo + 1);
    salida.push([i % 2 === 0 ? -paso * tramo : paso * tramo, i % 2 === 0 ? -y : y]);
  }
  return salida.slice(0, total);
}

/** Color de una capa con respaldo neutro. */
export function colorCapa(capa: CapaMuro): string {
  return capa.color || "#cccccc";
}

/** Rayado de una capa; el núcleo conserva el de su material. */
export function rayadoCapa(capa: CapaMuro): string {
  return capa.rayado || "ninguno";
}

/** Espesor en centímetros para la tabla, sin arrastrar decimales de coma flotante. */
export function espesorCm(metros: number): string {
  return String(Math.round((Number(metros) || 0) * 100 * 1000) / 1000);
}

export function cmAMetros(cm: string | number): number {
  const numero = typeof cm === "number" ? cm : Number(String(cm).replace(",", "."));
  return Number.isFinite(numero) ? numero / 100 : 0;
}
