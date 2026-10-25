import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { useAnchos } from "@/lib/anchos";
import { cambiarIdioma, idiomaDeConfig, type Idioma } from "@/i18n";
import {
  PERSONALIZADOS_INICIAL,
  TEMAS_COLOR,
  TEMA_COLOR_DEFECTO,
  aplicarColor,
  fijarPersonalizados,
  idPersonalizado,
  leerColor,
  leerPersonalizados,
  serializarColor,
  type EleccionColor,
  type TemaPersonalizado,
} from "@/lib/colorTema";

export type PreferenciaTema = "sistema" | "claro" | "oscuro";

/** Clave que usaba la Fase 0 en `localStorage`; solo se lee una vez para migrarla a config.json. */
const CLAVE_LOCAL_ANTIGUA = "pp.tema";

const esTema = (v: unknown): v is PreferenciaTema =>
  v === "claro" || v === "oscuro" || v === "sistema";

/** Aplica la clase `dark` al <html> según la preferencia y el tema del sistema. */
export function aplicarTema(pref: PreferenciaTema) {
  const oscuroSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const oscuro = pref === "oscuro" || (pref === "sistema" && oscuroSistema);
  document.documentElement.classList.toggle("dark", oscuro);
  // Los colores del tema tienen variante clara y oscura: se reaplican al cambiar de modo.
  aplicarColor();
}

export type EscalaUi = 100 | 110 | 120 | 130;

/** Escala predeterminada de la interfaz: el 120 % pedido por el usuario. */
export const ESCALA_DEFECTO: EscalaUi = 120;
/** Opciones de «Tamaño de la interfaz» en Configuración → Apariencia. */
export const ESCALA_OPCIONES: readonly EscalaUi[] = [100, 110, 120, 130];
/**
 * El sidebar (ícono, botón y ancho) va un 25 % por encima de la escala de la interfaz:
 * con la predeterminada de 120 % queda ×1.5.
 */
export const FACTOR_SIDEBAR_EXTRA = 1.25;

/** Factor del resto de la interfaz (120 % → 1.2). */
export const factorUI = (escala: number) => escala / 100;

/** Factor del sidebar: ícono, botón y ancho (120 % → 1.5). */
export const factorSidebar = (escala: number) => (escala / 100) * FACTOR_SIDEBAR_EXTRA;

/** Siguiente opción de escala hacia arriba (o la última si ya está en el máximo). */
export const subirEscala = (e: EscalaUi): EscalaUi =>
  ESCALA_OPCIONES[Math.min(ESCALA_OPCIONES.length - 1, ESCALA_OPCIONES.indexOf(e) + 1)];

/** Anterior opción de escala hacia abajo (o la primera si ya está en el mínimo). */
export const bajarEscala = (e: EscalaUi): EscalaUi =>
  ESCALA_OPCIONES[Math.max(0, ESCALA_OPCIONES.indexOf(e) - 1)];

/** Escala guardada válida: una de las opciones del selector. */
export const esEscalaValida = (v: unknown): v is EscalaUi =>
  (ESCALA_OPCIONES as readonly number[]).includes(Number(v));

/** Aplica la escala en la variable de CSS `--escala`; no es zoom del webview. */
export function aplicarEscala(escala: number) {
  document.documentElement.style.setProperty("--escala", String(factorUI(escala)));
}

function leerTemaAntiguo(): PreferenciaTema | null {
  try {
    const v = localStorage.getItem(CLAVE_LOCAL_ANTIGUA);
    return esTema(v) ? v : null;
  } catch {
    return null;
  }
}

function borrarTemaAntiguo() {
  try {
    localStorage.removeItem(CLAVE_LOCAL_ANTIGUA);
  } catch {
    /* sin almacenamiento disponible */
  }
}

interface EstadoTema {
  pref: PreferenciaTema;
  /** Idioma de la interfaz (spec 056). */
  idioma: Idioma;
  /** Tamaño de la interfaz en porcentaje (100, 110, 120 o 130). */
  escala: EscalaUi;
  /** Barra de herramientas compacta (una sola fila) en vez del ribbon. */
  barraCompacta: boolean;
  /** Sidebar de módulos expandido (iconos + texto); colapsado = solo iconos. */
  lateralExpandido: boolean;
  /** Ancho elegido del sidebar expandido en rem base; `null` = ajustado al contenido (spec 044). */
  lateralAncho: number | null;
  /** Color del tema (predefinido o personalizado). */
  color: EleccionColor;
  /** Hasta 5 temas personalizados. */
  personalizados: TemaPersonalizado[];
  /** Se cargó la preferencia desde config.json. */
  cargado: boolean;
  /** Lee el tema de config.json (migrando el de localStorage la primera vez) y lo aplica. */
  iniciar: () => Promise<void>;
  /** Cambia el tema, lo aplica y lo guarda en config.json. */
  fijar: (p: PreferenciaTema) => void;
  /** Cambia el idioma, lo aplica al instante y lo guarda en config.json. */
  fijarIdioma: (i: Idioma) => void;
  /** Cambia el tamaño de la interfaz, lo aplica y lo guarda en config.json. */
  fijarEscala: (e: EscalaUi) => void;
  /** Cambia entre barra compacta y ribbon, y lo guarda en config.json. */
  fijarBarraCompacta: (compacta: boolean) => void;
  /** Expande o colapsa el sidebar de módulos y lo guarda en config.json. */
  fijarLateralExpandido: (expandido: boolean) => void;
  /** Fija el ancho del sidebar (`null` = por omisión) y lo guarda en config.json. */
  fijarLateralAncho: (ancho: number | null) => void;
  /** Cambia el color del tema, lo aplica al instante y lo guarda en config.json. */
  fijarColor: (c: EleccionColor) => void;
  /** Cambia uno de los 5 temas personalizados. */
  fijarPersonalizado: (indice: number, p: TemaPersonalizado) => void;
  /** Vuelve al verde PresupuestosPro. */
  restablecerColor: () => void;
  /** Vacía una casilla de personalizado sin cambiar el color activo. */
  vaciarPersonalizado: (indice: number) => void;
}

let timerGuardarColor: ReturnType<typeof setTimeout> | null = null;

function guardarColorDebounce(get: () => EstadoTema) {
  if (timerGuardarColor) clearTimeout(timerGuardarColor);
  timerGuardarColor = setTimeout(() => {
    const { color, personalizados } = get();
    const payload = JSON.stringify({
      color_tema: serializarColor(color),
      personalizados,
    });
    ipc.guardarColorTema(payload).catch(() => {
      /* el color ya está aplicado; se reintentará en el siguiente cambio */
    });
  }, 300);
}

export const useTema = create<EstadoTema>((set, get) => ({
  pref: "sistema",
  idioma: "es",
  escala: ESCALA_DEFECTO,
  barraCompacta: false,
  lateralExpandido: false,
  lateralAncho: null,
  color: { id: TEMA_COLOR_DEFECTO },
  personalizados: [...Array.from({ length: 5 }, () => ({ nombre: "", acento: "#0f766e" }))],
  cargado: false,
  iniciar: async () => {
    // OPEN-RVT: si ya se cargó (o alguien ya cambió el tema) no se pisa la preferencia.
    if (get().cargado) return;
    try {
      const antiguo = leerTemaAntiguo();
      const cfg = antiguo ? await ipc.migrarTemaLocal(antiguo) : await ipc.obtenerConfig();
      if (antiguo) borrarTemaAntiguo();
      useAnchos.getState().cargar(cfg.anchos_columnas);
      const pref = esTema(cfg.tema) ? cfg.tema : "sistema";
      const color = leerColor(cfg.color_tema);
      const personalizados = leerPersonalizados(cfg.temas_personalizados);
      fijarPersonalizados(personalizados);
      aplicarColor(color);
      aplicarTema(pref);
      const escala = esEscalaValida(cfg.escala_ui) ? cfg.escala_ui : ESCALA_DEFECTO;
      aplicarEscala(escala);
      // Spec 056: la primera vez manda el idioma del sistema y se guarda; después, la
      // preferencia de config.json. El cambio se aplica al instante.
      const idioma = idiomaDeConfig(cfg);
      await cambiarIdioma(idioma);
      if (cfg.idioma_migrado !== true) {
        ipc.guardarIdioma(idioma).catch(() => {
          /* el idioma ya está aplicado; se reintenta en el siguiente arranque */
        });
      }
      set({
        pref,
        escala,
        idioma,
        color,
        personalizados,
        barraCompacta: cfg.barra_compacta === true,
        lateralExpandido: cfg.lateral_expandido === true,
        lateralAncho:
          typeof cfg.lateral_ancho_rem === "number" && cfg.lateral_ancho_rem > 0
            ? cfg.lateral_ancho_rem
            : null,
        cargado: true,
      });
    } catch {
      // OPEN-RVT: sin backend (vista previa o pruebas) se conservan los valores actuales,
      // que ya son los de fábrica («sistema», 120 %, español); así no se pisa lo que el
      // usuario haya cambiado mientras se leía config.json.
      if (get().cargado) return;
      const actual = get();
      aplicarTema(actual.pref);
      aplicarEscala(actual.escala);
      set({
        color: { id: TEMA_COLOR_DEFECTO },
        personalizados: [...PERSONALIZADOS_INICIAL],
        cargado: true,
      });
    }
  },
  fijar: (pref) => {
    aplicarTema(pref);
    set({ pref });
    ipc.guardarTema(pref).catch(() => {
      /* el tema ya está aplicado; se reintentará en el siguiente cambio */
    });
  },
  fijarIdioma: (idioma) => {
    void cambiarIdioma(idioma);
    set({ idioma });
    ipc.guardarIdioma(idioma).catch(() => {
      /* el idioma ya está aplicado; se reintentará en el siguiente cambio */
    });
  },
  fijarEscala: (escala) => {
    aplicarEscala(escala);
    set({ escala });
    ipc.guardarEscala(escala).catch(() => {
      /* la escala ya está aplicada; se reintentará en el siguiente cambio */
    });
  },
  fijarColor: (color) => {
    aplicarColor(color);
    set({ color });
    guardarColorDebounce(get);
  },
  fijarPersonalizado: (indice, p) => {
    const personalizados = [...get().personalizados];
    personalizados[indice - 1] = { ...p };
    fijarPersonalizados(personalizados);
    set({ personalizados });
    if (get().color.id === idPersonalizado(indice)) {
      aplicarColor(get().color);
    }
    guardarColorDebounce(get);
  },
  restablecerColor: () => useTema.getState().fijarColor({ id: TEMA_COLOR_DEFECTO }),
  vaciarPersonalizado: (indice) => {
    const personalizados = [...get().personalizados];
    personalizados[indice - 1] = { nombre: "", acento: TEMAS_COLOR()[0].claro.acento };
    fijarPersonalizados(personalizados);
    set({ personalizados });
    guardarColorDebounce(get);
  },
  fijarBarraCompacta: (compacta) => {
    set({ barraCompacta: compacta });
    ipc.guardarBarraCompacta(compacta).catch(() => {
      /* la preferencia ya está aplicada; se reintentará en el siguiente cambio */
    });
  },
  fijarLateralAncho: (ancho) => {
    set({ lateralAncho: ancho });
    ipc.guardarLateralAncho(ancho).catch(() => {
      /* la preferencia ya está aplicada; se reintentará en el siguiente cambio */
    });
  },
  fijarLateralExpandido: (expandido) => {
    set({ lateralExpandido: expandido });
    ipc.guardarLateralExpandido(expandido).catch(() => {
      /* la preferencia ya está aplicada; se reintentará en el siguiente cambio */
    });
  },
}));
