// OPEN-RVT: copiado de src/lib/atajos.ts de PresupuestosPro y reducido a los atajos
// generales que existen en el esqueleto (paleta, ayuda, ribbon y escala de la interfaz).
// Los atajos del presupuesto, la matriz y los catálogos no se copiaron.

export type AccionGlobal =
  | "paleta"
  | "ayuda"
  | "minimizarRibbon"
  | "escalaMas"
  | "escalaMenos"
  | "escalaNormal"
  | "nuevoArchivo"
  | "abrirArchivo"
  | "guardarArchivo"
  | "guardarComo";

export interface TeclaEv {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey?: boolean;
}

interface Mods {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface Atajo<TAccion extends string = AccionGlobal> {
  accion: TAccion;
  /** Tecla (`KeyboardEvent.key`, en minúsculas si es una letra) y modificadores exigidos. */
  key: string;
  mods?: Mods;
  /** Origen: OPUS (docs/atajos-opus.md) o propio (7.4). */
  origen: "OPUS" | "propio";
  /** Descripción para la ventana de atajos y la ayuda. */
  descripcion?: string;
  /** ¿Actúa también con el foco en un campo de texto? */
  enTexto?: boolean;
}

const ETIQUETA_TECLA: Record<string, string> = {
  Escape: "Esc",
  F1: "F1",
  "+": "Suma",
};

export const ATAJOS_GLOBALES: Atajo<AccionGlobal>[] = [
  {
    accion: "nuevoArchivo",
    key: "n",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Nuevo modelo",
    enTexto: true,
  },
  {
    accion: "abrirArchivo",
    key: "o",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Abrir modelo IFC",
    enTexto: true,
  },
  {
    accion: "guardarArchivo",
    key: "s",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Guardar el modelo",
    enTexto: true,
  },
  {
    accion: "guardarComo",
    key: "s",
    mods: { ctrl: true, shift: true },
    origen: "propio",
    descripcion: "Guardar el modelo como…",
    enTexto: true,
  },
  {
    accion: "paleta",
    key: "k",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Paleta de comandos",
    enTexto: true,
  },
  {
    accion: "ayuda",
    key: "F1",
    origen: "propio",
    descripcion: "Atajos de teclado",
    enTexto: true,
  },
  {
    accion: "ayuda",
    key: "/",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Atajos de teclado",
    enTexto: true,
  },
  {
    accion: "minimizarRibbon",
    key: "F1",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Minimizar o restaurar la cinta de comandos",
    enTexto: true,
  },
  {
    accion: "escalaMas",
    key: "=",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Agrandar la interfaz",
    enTexto: true,
  },
  {
    // La tecla Suma del teclado numérico (o Ctrl+Shift+= en algunos teclados).
    accion: "escalaMas",
    key: "+",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Agrandar la interfaz (tecla Suma)",
    enTexto: true,
  },
  {
    accion: "escalaMenos",
    key: "-",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Achicar la interfaz",
    enTexto: true,
  },
  {
    accion: "escalaNormal",
    key: "0",
    mods: { ctrl: true },
    origen: "propio",
    descripcion: "Volver la interfaz al tamaño predeterminado (120 %)",
    enTexto: true,
  },
];

export interface AtajoDocumentado {
  combinacion: string;
  descripcion: string;
  origen: "OPUS" | "propio";
}

export interface GrupoAtajos {
  grupo: string;
  atajos: AtajoDocumentado[];
}

/** Todos los atajos agrupados para la ventana «Atajos de teclado» y la ayuda. */
export function gruposDeAtajos(): GrupoAtajos[] {
  return [
    {
      grupo: "Generales",
      atajos: ATAJOS_GLOBALES.map((a) => ({
        combinacion: etiquetaAtajo(a),
        descripcion: a.descripcion ?? a.accion,
        origen: a.origen,
      })),
    },
  ];
}

export function coincide<TAccion extends string>(a: Atajo<TAccion>, e: TeclaEv): boolean {
  const ctrl = e.ctrlKey || !!e.metaKey;
  const m = a.mods ?? {};
  if (ctrl !== !!m.ctrl || e.shiftKey !== !!m.shift || e.altKey !== !!m.alt) return false;
  return (e.key.length === 1 ? e.key.toLowerCase() : e.key) === a.key;
}

/** Texto legible del atajo, p. ej. «Ctrl+Shift+A». */
export function etiquetaAtajo(a: Atajo<string>): string {
  const m = a.mods ?? {};
  const k = ETIQUETA_TECLA[a.key] ?? a.key.toUpperCase();
  return [m.ctrl && "Ctrl", m.alt && "Alt", m.shift && "Shift", k].filter(Boolean).join("+");
}

/** Atajos de una acción global, p. ej. «F1 / Ctrl+/». */
export function atajosDeGlobal(accion: AccionGlobal): string {
  return ATAJOS_GLOBALES.filter((a) => a.accion === accion)
    .map(etiquetaAtajo)
    .join(" / ");
}
