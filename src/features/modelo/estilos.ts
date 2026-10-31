// OPEN-RVT: estilos de objeto (plumillas) de la spec O005. La tabla vive en el
// frontend y se guarda como JSON en el pset OPENRVT_Estilos del IfcProject.
import type { Categoria, EscalaVista, Vista } from "./tipos";

export type PatronLinea = "continua" | "discontinua" | "trazo-punto" | "discontinua-larga";
export type PatronRelleno =
  | "diagonal"
  | "diagonal-doble"
  | "concreto"
  | "tierra"
  | "ondas"
  | "madera"
  | "vidrio"
  | "generico";
export type MaterialNombre =
  | "block"
  | "tabique"
  | "concreto"
  | "tierra"
  | "aislante"
  | "madera"
  | "vidrio"
  | "generico";

export type CategoriaEstilo =
  | Categoria
  | "ejes"
  | "cotas"
  | "niveles"
  | "ocultas"
  | "arriba-corte";

export interface EstiloCategoria {
  /** Grosor de corte en mm de papel a 1:100. `null` si la categoría no se corta. */
  corte: number | null;
  /** Grosor de proyección en mm de papel a 1:100. */
  proyeccion: number;
  color: string;
  patron: PatronLinea;
}

export interface EstiloMaterial {
  patron: PatronRelleno;
  /** Escala del patrón en mm de papel. */
  escala: number;
}

export type CabezaNivel = "triangulo" | "circulo" | "ninguna";

/** O014a: estilo de la cabeza y el texto de los niveles. */
export interface EstiloNivel {
  prefijo: string;
  decimales: 0 | 1 | 2 | 3;
  unidad: string;
  cabeza: CabezaNivel;
  color: string;
  cotas: boolean;
  mostrarNombre: boolean;
}

export interface Estilos {
  categorias: Record<CategoriaEstilo, EstiloCategoria>;
  materiales: Record<MaterialNombre, EstiloMaterial>;
  /** O014a: se guarda en el mismo JSON; los proyectos viejos usan los valores por omisión. */
  niveles: EstiloNivel;
}

/** Sobrescritura de una categoría dentro de una vista concreta. */
export interface EstiloCategoriaVista {
  oculta?: boolean;
  corte?: number | null;
  proyeccion?: number;
}

export const CATEGORIAS_ESTILO: readonly CategoriaEstilo[] = [
  "muros",
  "losas",
  "columnas",
  "vigas",
  "puertas",
  "ventanas",
  "cubiertas",
  "escaleras",
  "otros",
  "ejes",
  "cotas",
  "niveles",
  "ocultas",
  "arriba-corte",
];

const NOMBRES: Record<CategoriaEstilo, string> = {
  muros: "Muros",
  losas: "Losas",
  columnas: "Columnas",
  vigas: "Vigas",
  puertas: "Puertas",
  ventanas: "Ventanas",
  cubiertas: "Cubiertas",
  escaleras: "Escaleras",
  otros: "Otros",
  ejes: "Ejes",
  cotas: "Cotas",
  niveles: "Niveles",
  ocultas: "Líneas ocultas",
  "arriba-corte": "Arriba del corte en planta",
};

export function nombreCategoriaEstilo(categoria: CategoriaEstilo): string {
  return NOMBRES[categoria];
}

/** Tabla por defecto de la spec (mm de papel a 1:100). */
export function estilosPorDefecto(): Estilos {
  const negro = "#1f2328";
  const categorias: Record<CategoriaEstilo, EstiloCategoria> = {
      muros: { corte: 0.5, proyeccion: 0.18, color: negro, patron: "continua" },
      losas: { corte: 0.35, proyeccion: 0.18, color: negro, patron: "continua" },
      columnas: { corte: 0.5, proyeccion: 0.18, color: negro, patron: "continua" },
      vigas: { corte: 0.35, proyeccion: 0.18, color: negro, patron: "continua" },
      puertas: { corte: 0.25, proyeccion: 0.13, color: negro, patron: "continua" },
      ventanas: { corte: 0.25, proyeccion: 0.13, color: negro, patron: "continua" },
      cubiertas: { corte: 0.35, proyeccion: 0.18, color: negro, patron: "continua" },
      escaleras: { corte: 0.25, proyeccion: 0.13, color: negro, patron: "continua" },
      otros: { corte: 0.25, proyeccion: 0.13, color: negro, patron: "continua" },
      ejes: { corte: null, proyeccion: 0.13, color: "#8a5a2b", patron: "trazo-punto" },
      cotas: { corte: null, proyeccion: 0.13, color: "#1f2328", patron: "continua" },
      niveles: { corte: null, proyeccion: 0.13, color: "#1f2328", patron: "trazo-punto" },
      ocultas: { corte: null, proyeccion: 0.13, color: "#6b7280", patron: "discontinua" },
      "arriba-corte": {
        corte: null,
        proyeccion: 0.13,
        color: "#4b5563",
        patron: "discontinua-larga",
      },
    };
  return {
    categorias,
    niveles: {
      prefijo: "Npt",
      decimales: 2,
      unidad: "m",
      cabeza: "triangulo",
      color: categorias.niveles.color,
      cotas: true,
      mostrarNombre: true,
    },
    materiales: {
      block: { patron: "diagonal", escala: 2 },
      tabique: { patron: "diagonal-doble", escala: 2 },
      concreto: { patron: "concreto", escala: 4 },
      tierra: { patron: "tierra", escala: 4 },
      aislante: { patron: "ondas", escala: 3 },
      madera: { patron: "madera", escala: 4 },
      vidrio: { patron: "vidrio", escala: 4 },
      generico: { patron: "generico", escala: 4 },
    },
  };
}

const PATRONES_LINEA: PatronLinea[] = [
  "continua",
  "discontinua",
  "trazo-punto",
  "discontinua-larga",
];
const PATRONES_RELLENO: PatronRelleno[] = [
  "diagonal",
  "diagonal-doble",
  "concreto",
  "tierra",
  "ondas",
  "madera",
  "vidrio",
  "generico",
];
const CABEZAS_NIVEL: CabezaNivel[] = ["triangulo", "circulo", "ninguna"];

export const MATERIALES: MaterialNombre[] = [
  "block",
  "tabique",
  "concreto",
  "tierra",
  "aislante",
  "madera",
  "vidrio",
  "generico",
];

const numero = (valor: unknown, pordefecto: number | null): number | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : pordefecto;

/** Completa una tabla leída del IFC con los valores por defecto. */
export function normalizarEstilos(valor: unknown): Estilos {
  const base = estilosPorDefecto();
  if (!valor || typeof valor !== "object") return base;
  const crudo = valor as Record<string, unknown>;
  const categorias = crudo.categorias;
  if (categorias && typeof categorias === "object") {
    for (const categoria of CATEGORIAS_ESTILO) {
      const entrada = (categorias as Record<string, unknown>)[categoria];
      if (!entrada || typeof entrada !== "object") continue;
      const e = entrada as Record<string, unknown>;
      const defecto = base.categorias[categoria];
      base.categorias[categoria] = {
        corte:
          e.corte === null
            ? null
            : numero(e.corte, defecto.corte),
        proyeccion: numero(e.proyeccion, defecto.proyeccion) ?? defecto.proyeccion,
        color: typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color)
          ? e.color
          : defecto.color,
        patron: PATRONES_LINEA.includes(e.patron as PatronLinea)
          ? (e.patron as PatronLinea)
          : defecto.patron,
      };
    }
  }
  const materiales = crudo.materiales;
  if (materiales && typeof materiales === "object") {
    for (const material of MATERIALES) {
      const entrada = (materiales as Record<string, unknown>)[material];
      if (!entrada || typeof entrada !== "object") continue;
      const e = entrada as Record<string, unknown>;
      const defecto = base.materiales[material];
      base.materiales[material] = {
        patron: PATRONES_RELLENO.includes(e.patron as PatronRelleno)
          ? (e.patron as PatronRelleno)
          : defecto.patron,
        escala: Math.min(Math.max(numero(e.escala, defecto.escala) ?? defecto.escala, 0.5), 20),
      };
    }
  }
  // O014a: los proyectos viejos no traen «niveles»; se completan con las omisiones.
  const niveles = crudo.niveles;
  if (niveles && typeof niveles === "object") {
    const e = niveles as Record<string, unknown>;
    const defecto = base.niveles;
    const decimales = [0, 1, 2, 3].includes(e.decimales as number)
      ? (e.decimales as 0 | 1 | 2 | 3)
      : defecto.decimales;
    base.niveles = {
      prefijo: typeof e.prefijo === "string" ? e.prefijo : defecto.prefijo,
      decimales,
      unidad: typeof e.unidad === "string" ? e.unidad : defecto.unidad,
      cabeza: CABEZAS_NIVEL.includes(e.cabeza as CabezaNivel)
        ? (e.cabeza as CabezaNivel)
        : defecto.cabeza,
      color: typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color)
        ? e.color
        : defecto.color,
      cotas: typeof e.cotas === "boolean" ? e.cotas : defecto.cotas,
      mostrarNombre:
        typeof e.mostrarNombre === "boolean" ? e.mostrarNombre : defecto.mostrarNombre,
    };
  }
  return base;
}

export function serializarEstilos(estilos: Estilos): string {
  return JSON.stringify(estilos);
}

export function leerEstilos(texto: string): Estilos {
  try {
    return normalizarEstilos(JSON.parse(texto));
  } catch {
    return estilosPorDefecto();
  }
}

/** Factor de escala respecto a 1:100 (la tabla está expresada a esa escala). */
export function factorEscala(escala: EscalaVista): number {
  switch (escala) {
    case 50:
      return 1.4;
    case 100:
      return 1;
    case 200:
      return 0.7;
  }
}

/**
 * Convierte mm de papel a píxeles de pantalla. `mundoPorPx` sale de la cámara
 * ortográfica: (arriba − abajo) / alto del lienzo. Al acercar la vista el valor
 * crece, como en Revit.
 */
export function mmAPx(mm: number, escala: EscalaVista, mundoPorPx: number): number {
  if (!(mundoPorPx > 0)) return 1;
  // La tabla está a 1:100; el factor por escala la corrige sin duplicar la razón.
  return ((mm / 1000) * 100 * factorEscala(escala)) / mundoPorPx;
}

/** Convierte milímetros de papel a unidades de mundo (metros) a la escala de la vista. */
export function mmAMundo(mm: number, escala: EscalaVista): number {
  return ((mm / 1000) * 100 * factorEscala(escala));
}

/**
 * O006b: tamaño en mundo de un texto o marca de cota. Conserva su medida de papel,
 * pero en pantalla nunca baja del mínimo en píxeles (así sigue legible al alejar).
 */
export function mmAMundoConMinimoPx(
  mm: number,
  escala: EscalaVista,
  mundoPorPx: number,
  minimoPx: number,
): number {
  return Math.max(mmAMundo(mm, escala), minimoPx * Math.max(mundoPorPx, 0));
}

/** Grosor de una categoría ya con la escala y la sobrescritura de la vista. */
export function grosorMm(
  estilos: Estilos,
  vista: Vista,
  categoria: CategoriaEstilo,
  tipo: "corte" | "proyeccion",
): number | null {
  const base = estilos.categorias[categoria];
  const cambio = vista.estilos?.[categoria as Categoria];
  const valor = tipo === "corte" ? cambio?.corte ?? base.corte : cambio?.proyeccion ?? base.proyeccion;
  if (valor === null || valor === undefined) return null;
  return valor * factorEscala(vista.escala);
}

/** Categoría oculta por la sobrescritura de la vista. */
export function categoriaOculta(vista: Vista, categoria: CategoriaEstilo): boolean {
  return vista.estilos?.[categoria as Categoria]?.oculta === true;
}

/** Material de relleno a partir del nombre del tipo de muro/losa de O003b. */
export function materialPorTipo(tipo: string): MaterialNombre {
  const texto = (tipo || "").toLocaleLowerCase("es");
  if (texto.includes("block") || texto.includes("bloque")) return "block";
  if (texto.includes("tabique")) return "tabique";
  if (texto.includes("concreto") || texto.includes("hormig")) return "concreto";
  if (texto.includes("tierra")) return "tierra";
  if (texto.includes("aislante")) return "aislante";
  if (texto.includes("madera")) return "madera";
  if (texto.includes("vidrio")) return "vidrio";
  return "generico";
}

/** Material de una capa de IfcMaterialLayerSet. */
export function materialPorCapa(nombre: string): MaterialNombre {
  return materialPorTipo(nombre);
}

export const PATRONES_LINEA_DASH: Record<
  Exclude<PatronLinea, "continua">,
  { dash: number; gap: number }
> = {
  discontinua: { dash: 0.18, gap: 0.12 },
  "discontinua-larga": { dash: 0.5, gap: 0.2 },
  "trazo-punto": { dash: 0.6, gap: 0.12 },
};
