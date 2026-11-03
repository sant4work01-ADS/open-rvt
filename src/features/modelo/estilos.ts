// OPEN-RVT: estilos de objeto (plumillas) de la spec O005. La tabla vive en el
// frontend y se guarda como JSON en el pset OPENRVT_Estilos del IfcProject.
import type { Categoria, EscalaVista, EstiloVista, Vista } from "./tipos";

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

/** O024: patrones de línea de anotación (mm de papel). */
export type PatronAnotacion = "continua" | "trazo" | "trazo-punto";
export type CabezaNivel = "triangulo-relleno" | "triangulo" | "circulo" | "ninguna";
export type LadoCabezaNivel = "derecha" | "izquierda" | "ambos";
export type GlobosEje = "inicio" | "fin" | "ambos";
export type RemateCota =
  | "flecha-rellena"
  | "flecha-abierta"
  | "tick-arquitectonico"
  | "punto";

/**
 * O024: estilo de niveles. Amplía el de O014a con la línea, la cabeza y el texto.
 * Todas las medidas son mm de papel a la escala de la vista.
 */
export interface EstiloNivel {
  patron: PatronAnotacion;
  color: string;
  /** Grosor de la línea en mm de papel. */
  grosor: number;
  cabeza: CabezaNivel;
  /** Ancho de la cabeza en mm de papel. */
  tamanoCabeza: number;
  ladoCabeza: LadoCabezaNivel;
  prefijo: string;
  decimales: 0 | 1 | 2 | 3;
  unidad: string;
  /** `true` = signo + en las elevaciones positivas. */
  signo: boolean;
  /** Alto del texto en mm de papel. */
  altoTexto: number;
  cotas: boolean;
  mostrarNombre: boolean;
  /** Extensión de la línea más allá del último elemento o eje, en mm de papel. */
  extension: number;
}

/** O024: estilo de los ejes (globos, línea y separación en alzado/corte). */
export interface EstiloEje {
  patron: PatronAnotacion;
  color: string;
  grosor: number;
  /** Diámetro del globo en mm de papel. */
  diametroGlobo: number;
  altoTexto: number;
  globos: GlobosEje;
  /** En alzado/corte: separación del globo sobre el último nivel visible (mm). */
  separacionGlobos: number;
  /** Extensión bajo el primer nivel (mm). */
  extensionBajoPrimerNivel: number;
}

/** O024: estilo de cotas; puede haber varias con nombre. */
export interface EstiloCota {
  nombre: string;
  remate: RemateCota;
  /** Tamaño del remate en mm de papel. */
  tamanoRemate: number;
  altoTexto: number;
  posicionTexto: "sobre-la-linea" | "centrado-cortando-la-linea";
  /** Separación texto–línea en mm. */
  separacionTexto: number;
  /** Separación de la línea de extensión al objeto en mm. */
  separacionExtension: number;
  /** Prolongación más allá de la línea de cota en mm. */
  prolongacion: number;
  /** Distancia entre filas de cotas (cadena y total) en mm. */
  distanciaFilas: number;
  decimales: 0 | 1 | 2 | 3;
  unidad: string;
  color: string;
  textoChico: "fuera-con-flechas-hacia-adentro" | "con-linea-de-referencia";
  patron: PatronAnotacion;
  grosor: number;
}

export interface EstilosCota {
  lista: EstiloCota[];
  /** Nombre del estilo por omisión global. */
  porDefecto: string;
}

export interface Estilos {
  categorias: Record<CategoriaEstilo, EstiloCategoria>;
  materiales: Record<MaterialNombre, EstiloMaterial>;
  /** O014a/O024: se guarda en el mismo JSON; los proyectos viejos usan las omisiones. */
  niveles: EstiloNivel;
  /** O024: ejes y cotas. Opcionales al leer JSON viejo. */
  ejes: EstiloEje;
  cotas: EstilosCota;
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

/** O024: niveles por omisión, tal como la referencia de O025. */
export function estiloNivelPorDefecto(color = "#1f2328"): EstiloNivel {
  return {
    patron: "trazo-punto",
    color,
    grosor: 0.13,
    cabeza: "triangulo-relleno",
    tamanoCabeza: 3.5,
    ladoCabeza: "derecha",
    prefijo: "Npt",
    decimales: 2,
    unidad: "m",
    signo: true,
    altoTexto: 2.5,
    cotas: true,
    mostrarNombre: false,
    extension: 12,
  };
}

/** O024: ejes por omisión (globo de 8 mm, 10 mm sobre el último nivel). */
export function estiloEjePorDefecto(color = "#8a5a2b"): EstiloEje {
  return {
    patron: "trazo-punto",
    color,
    grosor: 0.13,
    diametroGlobo: 8,
    altoTexto: 3.5,
    globos: "fin",
    separacionGlobos: 10,
    extensionBajoPrimerNivel: 5,
  };
}

/** O024: estilo de cota por omisión «Cota 1:100». */
export function estiloCotaPorDefecto(nombre = "Cota 1:100"): EstiloCota {
  return {
    nombre,
    remate: "flecha-rellena",
    tamanoRemate: 2.5,
    altoTexto: 2.5,
    posicionTexto: "sobre-la-linea",
    separacionTexto: 1,
    separacionExtension: 1.5,
    prolongacion: 1.5,
    distanciaFilas: 7,
    decimales: 2,
    unidad: "",
    color: "#1f2328",
    textoChico: "fuera-con-flechas-hacia-adentro",
    patron: "continua",
    grosor: 0.13,
  };
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
    niveles: estiloNivelPorDefecto(categorias.niveles.color),
    ejes: estiloEjePorDefecto(categorias.ejes.color),
    cotas: {
      lista: [estiloCotaPorDefecto("Cota 1:100")],
      porDefecto: "Cota 1:100",
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
const CABEZAS_NIVEL: CabezaNivel[] = [
  "triangulo-relleno",
  "triangulo",
  "circulo",
  "ninguna",
];
const LADOS_CABEZA: LadoCabezaNivel[] = ["derecha", "izquierda", "ambos"];
const PATRONES_ANOTACION: PatronAnotacion[] = ["continua", "trazo", "trazo-punto"];
const GLOBOS_EJE: GlobosEje[] = ["inicio", "fin", "ambos"];
const REMATES_COTA: RemateCota[] = [
  "flecha-rellena",
  "flecha-abierta",
  "tick-arquitectonico",
  "punto",
];
const POSICIONES_TEXTO_COTA: EstiloCota["posicionTexto"][] = [
  "sobre-la-linea",
  "centrado-cortando-la-linea",
];
const TEXTOS_CHICOS: EstiloCota["textoChico"][] = [
  "fuera-con-flechas-hacia-adentro",
  "con-linea-de-referencia",
];

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

/** O024: validación común de medidas de anotación (sin negativos, rango acotado). */
export function numeroAnotacion(
  valor: unknown,
  pordefecto: number,
  min: number,
  max: number,
): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return pordefecto;
  return Math.min(Math.max(valor, min), max);
}

const texto = (valor: unknown, pordefecto: string): string =>
  typeof valor === "string" ? valor.slice(0, 24) : pordefecto;

const booleano = (valor: unknown, pordefecto: boolean): boolean =>
  typeof valor === "boolean" ? valor : pordefecto;

const color = (valor: unknown, pordefecto: string): string =>
  typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor) ? valor : pordefecto;

const decimalesDe = (valor: unknown, pordefecto: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 =>
  [0, 1, 2, 3].includes(valor as number) ? (valor as 0 | 1 | 2 | 3) : pordefecto;

/** Lee un estilo de nivel de JSON viejo (O014a) o nuevo (O024). */
export function normalizarEstiloNivel(valor: unknown, base: EstiloNivel): EstiloNivel {
  if (!valor || typeof valor !== "object") return { ...base };
  const e = valor as Record<string, unknown>;
  // O014a usaba «triangulo»; ahora la cabeza rellena es la de la referencia.
  const cabezaCruda = e.cabeza === "triangulo" ? "triangulo-relleno" : e.cabeza;
  return {
    patron: PATRONES_ANOTACION.includes(e.patron as PatronAnotacion)
      ? (e.patron as PatronAnotacion)
      : base.patron,
    color: color(e.color, base.color),
    grosor: numeroAnotacion(e.grosor, base.grosor, 0.05, 5),
    cabeza: CABEZAS_NIVEL.includes(cabezaCruda as CabezaNivel)
      ? (cabezaCruda as CabezaNivel)
      : base.cabeza,
    tamanoCabeza: numeroAnotacion(e.tamanoCabeza, base.tamanoCabeza, 0.5, 20),
    ladoCabeza: LADOS_CABEZA.includes(e.ladoCabeza as LadoCabezaNivel)
      ? (e.ladoCabeza as LadoCabezaNivel)
      : base.ladoCabeza,
    prefijo: texto(e.prefijo, base.prefijo),
    decimales: decimalesDe(e.decimales, base.decimales),
    unidad: texto(e.unidad, base.unidad),
    signo: booleano(e.signo, base.signo),
    altoTexto: numeroAnotacion(e.altoTexto, base.altoTexto, 0.5, 20),
    cotas: booleano(e.cotas, base.cotas),
    mostrarNombre: booleano(e.mostrarNombre, base.mostrarNombre),
    extension: numeroAnotacion(e.extension, base.extension, 0, 200),
  };
}

export function normalizarEstiloEje(valor: unknown, base: EstiloEje): EstiloEje {
  if (!valor || typeof valor !== "object") return { ...base };
  const e = valor as Record<string, unknown>;
  return {
    patron: PATRONES_ANOTACION.includes(e.patron as PatronAnotacion)
      ? (e.patron as PatronAnotacion)
      : base.patron,
    color: color(e.color, base.color),
    grosor: numeroAnotacion(e.grosor, base.grosor, 0.05, 5),
    diametroGlobo: numeroAnotacion(e.diametroGlobo, base.diametroGlobo, 1, 50),
    altoTexto: numeroAnotacion(e.altoTexto, base.altoTexto, 0.5, 20),
    globos: GLOBOS_EJE.includes(e.globos as GlobosEje)
      ? (e.globos as GlobosEje)
      : base.globos,
    separacionGlobos: numeroAnotacion(e.separacionGlobos, base.separacionGlobos, 0, 200),
    extensionBajoPrimerNivel: numeroAnotacion(
      e.extensionBajoPrimerNivel,
      base.extensionBajoPrimerNivel,
      0,
      200,
    ),
  };
}

export function normalizarEstiloCota(valor: unknown, base: EstiloCota): EstiloCota {
  if (!valor || typeof valor !== "object") return { ...base };
  const e = valor as Record<string, unknown>;
  return {
    nombre: texto(e.nombre, base.nombre) || base.nombre,
    remate: REMATES_COTA.includes(e.remate as RemateCota)
      ? (e.remate as RemateCota)
      : base.remate,
    tamanoRemate: numeroAnotacion(e.tamanoRemate, base.tamanoRemate, 0.2, 20),
    altoTexto: numeroAnotacion(e.altoTexto, base.altoTexto, 0.5, 20),
    posicionTexto: POSICIONES_TEXTO_COTA.includes(e.posicionTexto as EstiloCota["posicionTexto"])
      ? (e.posicionTexto as EstiloCota["posicionTexto"])
      : base.posicionTexto,
    separacionTexto: numeroAnotacion(e.separacionTexto, base.separacionTexto, 0, 50),
    separacionExtension: numeroAnotacion(
      e.separacionExtension,
      base.separacionExtension,
      0,
      50,
    ),
    prolongacion: numeroAnotacion(e.prolongacion, base.prolongacion, 0, 50),
    distanciaFilas: numeroAnotacion(e.distanciaFilas, base.distanciaFilas, 0, 100),
    decimales: decimalesDe(e.decimales, base.decimales),
    unidad: texto(e.unidad, base.unidad),
    color: color(e.color, base.color),
    textoChico: TEXTOS_CHICOS.includes(e.textoChico as EstiloCota["textoChico"])
      ? (e.textoChico as EstiloCota["textoChico"])
      : base.textoChico,
    patron: PATRONES_ANOTACION.includes(e.patron as PatronAnotacion)
      ? (e.patron as PatronAnotacion)
      : base.patron,
    grosor: numeroAnotacion(e.grosor, base.grosor, 0.05, 5),
  };
}

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
  // O014a/O024: los proyectos viejos no traen todos los campos; se completan.
  base.niveles = normalizarEstiloNivel(crudo.niveles, base.niveles);
  base.ejes = normalizarEstiloEje(crudo.ejes, base.ejes);
  // O024: lista de cotas con nombre; sin lista válida queda «Cota 1:100».
  const cotas = crudo.cotas;
  if (cotas && typeof cotas === "object") {
    const e = cotas as Record<string, unknown>;
    const listaCruda = Array.isArray(e.lista) ? e.lista : [];
    const lista: EstiloCota[] = [];
    const vistos = new Set<string>();
    for (const entrada of listaCruda) {
      if (!entrada || typeof entrada !== "object") continue;
      const nombre = texto((entrada as Record<string, unknown>).nombre, "");
      if (!nombre || vistos.has(nombre)) continue;
      vistos.add(nombre);
      lista.push(normalizarEstiloCota(entrada, estiloCotaPorDefecto(nombre)));
    }
    if (lista.length > 0) {
      base.cotas.lista = lista;
      const porDefecto = texto(e.porDefecto, "");
      base.cotas.porDefecto = vistos.has(porDefecto) ? porDefecto : lista[0].nombre;
    }
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
    case 20:
      return 0.2;
    case 50:
      return 1.4;
    case 100:
      return 1;
    case 200:
      return 0.7;
  }
}

/**
 * O044: convierte mm de papel a píxeles de pantalla. En pantalla el grosor no
 * depende del zoom ni de la escala (como en Revit): px = max(1, mm × 2.2), así un
 * muro cortado de 0.5 mm mide 1.1 px a cualquier acercamiento y la proyección de
 * 0.18 mm queda en 1 px. La ruta de impresión/PDF usa los mm de papel reales y no
 * pasa por aquí. `escala` y `mundoPorPx` se conservan en la firma para no tocar las
 * llamadas de la vista.
 */
export function mmAPx(mm: number, _escala: EscalaVista, _mundoPorPx: number): number {
  if (!(mm > 0)) return 1;
  return Math.max(1, mm * 2.2);
}

/** Convierte milímetros de papel a unidades de mundo (metros) a la escala de la vista. */
export function mmAMundo(mm: number, escala: EscalaVista): number {
  return ((mm / 1000) * 100 * factorEscala(escala));
}

/**
 * O030: alto en mundo de un texto de anotación. En «papel» mide sus mm de papel
 * por la escala de la vista (crece y mengua con el zoom, como lo impreso); en
 * «pantalla» conserva el mínimo en píxeles de siempre.
 */
export function altoAnotacionMundo(
  mm: number,
  escala: EscalaVista,
  mundoPorPx: number,
  modo: "papel" | "pantalla",
  minimoPx = 11,
): number {
  if (modo === "papel") return mmAMundo(mm, escala);
  // En pantalla el alto es constante en píxeles, sin importar el zoom; el estilo
  // sigue mandando: 2,5 mm de papel equivalen a los 11 px de referencia.
  return minimoPx * (mm / 2.5) * Math.max(mundoPorPx, 0);
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

/**
 * O015: relación de un elemento con el plano de corte de la vista.
 * `cortado` lo atraviesa, `debajo` queda por debajo (proyección en planta) y
 * `arriba` por encima (solo silueta, si la categoría la permite).
 */
export type RelacionCorte = "cortado" | "debajo" | "arriba";

/**
 * O015: relleno que corresponde a un elemento según su categoría, su relación con
 * el plano de corte y el estilo de la vista. Es la única regla que consulta el
 * visor, para que planta, corte y cualquier estilo se comporten igual.
 *
 * - Cortado: patrón del material del tipo (en «Sombreado» va sobre el gris de la
 *   sección; en «Líneas» solo el achurado vectorial).
 * - Debajo del corte: solo las losas llevan la proyección tenue; el resto no se
 *   rellena (sus aristas ya se dibujan con el grosor de proyección).
 * - Arriba del corte: nada; la silueta discontinua se resuelve aparte.
 */
export type RellenoElemento =
  | "patron"
  | "patron-sombreado"
  | "proyeccion-tenue"
  | "ninguno";

export function rellenoDeElemento(
  categoria: Categoria,
  relacion: RelacionCorte,
  estiloVista: EstiloVista,
): RellenoElemento {
  if (relacion === "arriba") return "ninguno";
  if (relacion === "debajo") {
    return categoria === "losas" ? "proyeccion-tenue" : "ninguno";
  }
  return estiloVista === "lineas-ocultas" ? "patron" : "patron-sombreado";
}

/** Material de relleno a partir del nombre del tipo de muro/losa de O003b. */
export function materialPorTipo(tipo: string): MaterialNombre {
  const texto = (tipo || "").toLocaleLowerCase("es");
  if (texto.includes("block") || texto.includes("bloque")) return "block";
  if (texto.includes("tabique")) return "tabique";
  if (texto.includes("concreto") || texto.includes("hormig")) return "concreto";
  // O015: la losa creada por la app es IfcSlab FLOOR sin tipo de material; su
  // material por omisión es el concreto, no el genérico.
  if (texto.includes("floor") || texto.includes("slab") || texto.includes("losa")) {
    return "concreto";
  }
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
