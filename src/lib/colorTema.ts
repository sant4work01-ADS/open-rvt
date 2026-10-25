// OPEN-RVT: sin rejilla Glide; se quitó el tipo Theme y el pintado de la rejilla.
import { tr } from "@/i18n";

/** Colores de un tema para un modo (claro u oscuro). */
export interface ColoresModo {
  /** Acento / primario (botones, ribbon, selección de pestañas). */
  acento: string;
  /** Fondo de los encabezados de tabla. */
  encabezado: string;
  /** Fondo de las filas seleccionadas. */
  seleccion: string;
}

export interface TemaColor {
  id: string;
  nombre: string;
  claro: ColoresModo;
  oscuro: ColoresModo;
}

export interface TemaPersonalizado {
  /** Nombre editable opcional. */
  nombre: string;
  /** Color principal (acento) en formato #rrggbb. */
  acento: string;
}

export const TEMA_COLOR_DEFECTO = "verde";
export const ID_PERSONALIZADO = "personalizado";
export const CANTIDAD_PERSONALIZADOS = 5;

export const TEMAS_COLOR = (): readonly TemaColor[] => [
  {
    id: "verde",
    nombre: tr("comun.verde-presupuestospro", "Verde PresupuestosPro"),
    claro: { acento: "#0f766e", encabezado: "#f4f4f5", seleccion: "#bfe7e1" },
    oscuro: { acento: "#2bc9b4", encabezado: "#1c1c1f", seleccion: "#0f3d3a" },
  },
  {
    id: "azul",
    nombre: tr("comun.azul", "Azul"),
    claro: { acento: "#1d4ed8", encabezado: "#e8eefb", seleccion: "#bfd3fa" },
    oscuro: { acento: "#60a5fa", encabezado: "#1b2333", seleccion: "#1e3a6e" },
  },
  {
    id: "indigo",
    nombre: tr("comun.indigo", "Índigo"),
    claro: { acento: "#4338ca", encabezado: "#ebebfb", seleccion: "#c7c9f7" },
    oscuro: { acento: "#818cf8", encabezado: "#1e1f36", seleccion: "#2e2f6b" },
  },
  {
    id: "vino",
    nombre: tr("comun.vino", "Vino"),
    claro: { acento: "#9f1239", encabezado: "#f8e8ec", seleccion: "#f4c6d2" },
    oscuro: { acento: "#fb7185", encabezado: "#2e1c21", seleccion: "#5c1a2c" },
  },
  {
    id: "naranja",
    nombre: tr("comun.naranja", "Naranja"),
    claro: { acento: "#c2410c", encabezado: "#fbeee4", seleccion: "#fbd3b5" },
    oscuro: { acento: "#fb923c", encabezado: "#2d2118", seleccion: "#5a2d0c" },
  },
  {
    id: "grafito",
    nombre: tr("comun.grafito", "Grafito"),
    claro: { acento: "#3f3f46", encabezado: "#ececee", seleccion: "#d4d4d8" },
    oscuro: { acento: "#a1a1aa", encabezado: "#222226", seleccion: "#3f3f46" },
  },
];

const BLANCO = "#ffffff";
const NEGRO = "#09090b";
const FONDO_OSCURO = "#18181b";

const HEX = /^#[0-9a-f]{6}$/i;
export const esHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** Devuelve el identificador de un tema personalizado por índice (1-based). */
export const idPersonalizado = (indice: number) => `${ID_PERSONALIZADO}-${indice}`;

/** Comprueba si un id corresponde a un tema personalizado. */
export const esIdPersonalizado = (id: string) =>
  id.startsWith(`${ID_PERSONALIZADO}-`) && /^\d+$/.test(id.slice(ID_PERSONALIZADO.length + 1));

/** Extrae el índice 1-based de un id personalizado, o null. */
export const indicePersonalizado = (id: string): number | null => {
  if (!esIdPersonalizado(id)) return null;
  return Number(id.slice(ID_PERSONALIZADO.length + 1));
};

/** Elección guardada: un tema predefinido o un tema personalizado por índice. */
export type EleccionColor = { id: string };

/** Convierte un color #rrggbb a un objeto {r,g,b}. */
const rgb = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

/** Luminancia relativa WCAG. */
export function luminancia(hex: string): number {
  const { r, g, b } = rgb(hex);
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Razón de contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Texto (blanco o casi negro) con más contraste sobre el fondo dado. */
export const textoSobre = (fondo: string): string =>
  contraste(fondo, BLANCO) >= contraste(fondo, NEGRO) ? BLANCO : NEGRO;

/** Mezcla lineal de dos colores hex (t ∈ [0,1], peso de b). */
export function mezcla(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  const f = (k: "r" | "g" | "b") => Math.round(ca[k] + (cb[k] - ca[k]) * t);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(f("r"))}${hex(f("g"))}${hex(f("b"))}`;
}

/** Convierte #rrggbb a {h,s,l}. */
function hexAHslObj(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = rgb(hex);
  const [rn, gn, bn] = [r, g, b].map((c) => c / 255);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/** Convierte {h,s,l} a #rrggbb. */
function hslAHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const hex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`;
}

/** Aclara un color en HSL aumentando la luminosidad (pct ∈ 0..1 del rango restante). */
function aclarar(hex: string, pct: number): string {
  const hsl = hexAHslObj(hex);
  hsl.l = Math.min(0.85, hsl.l + (1 - hsl.l) * pct);
  hsl.s = Math.min(0.95, hsl.s * 1.12);
  return hslAHex(hsl);
}

/**
 * Deriva los colores de un tema personalizado a partir de un único color principal.
 * - Encabezado claro: mezcla del acento con blanco al 12 %.
 * - Selección clara: mezcla del acento con blanco al 28 %.
 * - Acento oscuro: versión aclarada del acente (42 % hacia el blanco en HSL).
 * - Encabezado oscuro: fondo oscuro de la app.
 * - Selección oscura: mezcla del acento oscuro con el fondo oscuro al 70 %.
 */
export function derivarTema(principal: string): { claro: ColoresModo; oscuro: ColoresModo } {
  if (!esHex(principal)) throw new Error(`color inválido: ${principal}`);
  const oscuroAcento = aclarar(principal, 0.42);
  return {
    claro: {
      acento: principal,
      encabezado: mezcla(principal, BLANCO, 0.12),
      seleccion: mezcla(principal, BLANCO, 0.28),
    },
    oscuro: {
      acento: oscuroAcento,
      encabezado: FONDO_OSCURO,
      seleccion: mezcla(oscuroAcento, FONDO_OSCURO, 0.7),
    },
  };
}

/** Serializa la elección para config.json: id del tema activo. */
export function serializarColor(e: EleccionColor): string {
  return e.id;
}

/** Temas personalizados por defecto (vacíos). */
export const PERSONALIZADOS_INICIAL: readonly TemaPersonalizado[] = Array.from(
  { length: CANTIDAD_PERSONALIZADOS },
  () => ({ nombre: "", acento: TEMAS_COLOR()[0].claro.acento }),
);

/** Lee la elección guardada; cualquier valor desconocido vuelve al verde. */
export function leerColor(v: unknown): EleccionColor {
  if (typeof v === "string") {
    if (TEMAS_COLOR().some((t) => t.id === v)) return { id: v };
    if (esIdPersonalizado(v)) return { id: v };
    // Formato antiguo: personalizado|acento|encabezado|seleccion
    const [id, a] = String(v).split("|");
    if (id === ID_PERSONALIZADO && esHex(a)) {
      return { id: idPersonalizado(1) };
    }
  }
  return { id: TEMA_COLOR_DEFECTO };
}

/** Lee los temas personalizados guardados, rellenando hasta 5 con el valor inicial. */
export function leerPersonalizados(v: unknown): TemaPersonalizado[] {
  const entrada = Array.isArray(v) ? v : [];
  const leidos: TemaPersonalizado[] = [];
  for (const item of entrada.slice(0, CANTIDAD_PERSONALIZADOS)) {
    if (item && typeof item === "object") {
      const raw = item as Record<string, unknown>;
      const nombre = typeof raw.nombre === "string" ? raw.nombre : "";
      const acento = esHex(raw.acento) ? raw.acento : TEMAS_COLOR()[0].claro.acento;
      leidos.push({ nombre, acento });
    }
  }
  while (leidos.length < CANTIDAD_PERSONALIZADOS) {
    leidos.push({ nombre: "", acento: TEMAS_COLOR()[0].claro.acento });
  }
  return leidos;
}

/** Colores efectivos de la elección en el modo dado. */
export function coloresDe(e: EleccionColor, oscuro: boolean): ColoresModo {
  const idx = indicePersonalizado(e.id);
  if (idx !== null) {
    const p = cachePersonalizados[idx - 1];
    const principal = p?.acento ?? TEMAS_COLOR()[0].claro.acento;
    return oscuro ? derivarTema(principal).oscuro : derivarTema(principal).claro;
  }
  const t = TEMAS_COLOR().find((x) => x.id === e.id) ?? TEMAS_COLOR()[0];
  return oscuro ? t.oscuro : t.claro;
}

/** Convierte «#rrggbb» a la terna «h s% l%» que usan las variables de shadcn. */
export function hexAHsl(hex: string): string {
  const { h, s, l } = hexAHslObj(hex);
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const VARIABLES = [
  "--accent",
  "--accent-foreground",
  "--ring",
  "--encabezado",
  "--encabezado-foreground",
  "--seleccion",
  "--seleccion-foreground",
] as const;

let actual: EleccionColor = { id: TEMA_COLOR_DEFECTO };
let cachePersonalizados: TemaPersonalizado[] = [...PERSONALIZADOS_INICIAL];

export const colorActual = () => actual;
export const personalizadosActuales = () => cachePersonalizados;

/** Fija los temas personalizados activos (usado por el store y por la UI). */
export function fijarPersonalizados(p: TemaPersonalizado[]) {
  cachePersonalizados = p.slice(0, CANTIDAD_PERSONALIZADOS);
}

/** Aplica la elección como variables CSS en <html>; el verde usa los valores de globals.css. */
export function aplicarColor(
  e: EleccionColor = actual,
  raiz: HTMLElement = document.documentElement,
) {
  actual = e;
  const oscuro = raiz.classList.contains("dark");
  const c = coloresDe(e, oscuro);
  const predeterminado = e.id === TEMA_COLOR_DEFECTO;
  const fijar = (k: string, v: string) => raiz.style.setProperty(k, v);
  if (predeterminado) {
    for (const k of ["--accent", "--accent-foreground", "--ring"]) raiz.style.removeProperty(k);
  } else {
    fijar("--accent", hexAHsl(c.acento));
    fijar("--accent-foreground", hexAHsl(textoSobre(c.acento)));
    fijar("--ring", hexAHsl(c.acento));
  }
  fijar("--encabezado", hexAHsl(c.encabezado));
  fijar("--encabezado-foreground", hexAHsl(textoSobre(c.encabezado)));
  fijar("--seleccion", hexAHsl(c.seleccion));
  fijar("--seleccion-foreground", hexAHsl(textoSobre(c.seleccion)));
}

/** Quita todas las variables de color (vuelve a globals.css). */
export function limpiarColor(raiz: HTMLElement = document.documentElement) {
  for (const k of VARIABLES) raiz.style.removeProperty(k);
}

/** Fondo de las filas seleccionadas con el color del tema. */
export function fondoSeleccionColor(e: EleccionColor, oscuro: boolean): string | null {
  return e.id === TEMA_COLOR_DEFECTO ? null : coloresDe(e, oscuro).seleccion;
}
