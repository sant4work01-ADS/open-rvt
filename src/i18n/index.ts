// Infraestructura de idioma (spec 056): i18next + react-i18next con dos recursos
// agrupados por módulo. El español es la fuente y el idioma por omisión; el inglés se
// elige en Configuración → Apariencia o, la primera vez, con el idioma del sistema.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./es.json";
import en from "./en.json";

export type Idioma = "es" | "en";

export const IDIOMAS: readonly Idioma[] = ["es", "en"];

/** Idioma del sistema: español si `navigator.language` empieza con «es»; si no, inglés. */
export function idiomaDelSistema(lenguaje?: string): Idioma {
  const valor =
    lenguaje ??
    (typeof navigator !== "undefined" && typeof navigator.language === "string"
      ? navigator.language
      : "es");
  return valor.toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * Idioma efectivo de la configuración. La primera vez (`idioma_migrado` falso) manda el
 * idioma del sistema; después, la preferencia guardada. Un «en» explícito siempre gana.
 */
export function idiomaDeConfig(cfg: { idioma?: string | null; idioma_migrado?: boolean }): Idioma {
  if (cfg.idioma === "en") return "en";
  if (cfg.idioma_migrado === false) return idiomaDelSistema();
  return cfg.idioma === "es" ? "es" : idiomaDelSistema();
}

/** Cambia el idioma al instante (sin reiniciar) y lo deja como idioma activo. */
export async function cambiarIdioma(idioma: Idioma): Promise<void> {
  await i18n.changeLanguage(idioma);
  if (typeof document !== "undefined") {
    document.documentElement.lang = idioma;
  }
}

/** Clave estable a partir de un texto visible (para los rótulos de componentes). */
export function claveDeTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Traduce un texto visible con un prefijo de módulo y su propio slug como clave. */
export function trTexto(prefijo: string, texto: string): string {
  return tr(`${prefijo}.${claveDeTexto(texto)}`, texto);
}

/** Traduce una clave y, si falta, usa el texto español de respaldo. */
export function tr(clave: string, texto: string, opciones?: Record<string, unknown>): string {
  return i18n.t(clave, { defaultValue: texto, ...opciones });
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: "es",
  fallbackLng: "es",
  supportedLngs: ["es", "en"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
