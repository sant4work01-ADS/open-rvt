// OPEN-RVT: adaptado de PresupuestosPro (rama `actualizaciones`). El endpoint, la llave
// y el nombre del canal son de OPEN-RVT. En Linux el updater de Tauri no instala .deb:
// solo se avisa de la versión nueva y se ofrece el enlace de descarga.
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { tr } from "@/i18n";

// OPEN-RVT: canal de actualizaciones propio.
export const ENDPOINT_ACTUALIZACIONES =
  "https://github.com/sant4work01-ADS/open-rvt/releases/latest/download/latest.json";
export const URL_DESCARGA =
  "https://github.com/sant4work01-ADS/open-rvt/releases/latest";

/** OPEN-RVT: el updater de Tauri solo actualiza AppImage; en Linux se avisa con enlace. */
export function esLinux(): boolean {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const plataforma = (navigator as Navigator & { platform?: string }).platform || "";
  return /linux/i.test(ua) || /linux/i.test(plataforma);
}

/** Compara versiones numéricas tipo 0.3.1; devuelve true si `nueva` supera a `actual`. */
export function versionMasNueva(nueva: string, actual: string): boolean {
  const partes = (v: string) =>
    v
      .split(/[.+-]/)
      .map((p) => Number.parseInt(p, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const a = partes(nueva);
  const b = partes(actual);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** OPEN-RVT: abre el enlace de descarga en el navegador del sistema. */
export async function abrirEnlace(url: string): Promise<void> {
  try {
    await invoke("abrir_enlace", { url });
  } catch {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  }
}

export interface Actualizacion {
  version: string;
  fecha: string | null;
  notas: string | null;
}

export interface ProgresoDescarga {
  descargado: number;
  total: number | null;
}

/** Lo que la interfaz necesita del mecanismo de actualización (sustituible en pruebas). */
export interface ServicioActualizaciones {
  /** false con OPENRVT_SIN_ACTUALIZACIONES=1 (E2E) o fuera de Tauri. */
  disponible: () => Promise<boolean>;
  versionActual: () => Promise<string>;
  consultar: () => Promise<Actualizacion | null>;
  instalar: (
    actualizacion: Actualizacion,
    alProgreso: (p: ProgresoDescarga) => void,
    antesDeInstalar: () => Promise<void>,
  ) => Promise<void>;
  relanzar: () => Promise<void>;
}

/** Mensaje en lenguaje claro para los fallos habituales (CA-2 y CA-5). */
export function traducirErrorActualizacion(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (/signature|firma|verif|public key|pubkey/.test(m)) {
    return tr(
      "actualizaciones.errorFirma",
      "La firma de la actualización no es válida; no se instaló nada.",
    );
  }
  if (/network|internet|fetch|connection|conexi|dns|offline|timed? ?out|sending request/.test(m)) {
    return tr(
      "actualizaciones.errorRed",
      "Sin conexión a internet. Revisa tu red e inténtalo de nuevo.",
    );
  }
  if (/404|not found|server|servidor|status|http/.test(m)) {
    return tr(
      "actualizaciones.errorServidor",
      "El servidor de actualizaciones no está disponible en este momento.",
    );
  }
  return tr(
    "actualizaciones.errorComprobar",
    "No se pudo comprobar la actualización: {{detalle}}",
    {
      detalle: m,
    },
  );
}

/** La comprobación automática se apaga con OPENRVT_SIN_ACTUALIZACIONES=1 (CA-7). */
export async function actualizacionesDeshabilitadas(): Promise<boolean> {
  try {
    return await invoke<boolean>("actualizaciones_deshabilitadas");
  } catch {
    return true;
  }
}

/** Última comprobación, para instalar exactamente lo que se mostró al usuario. */
let ultima: Update | null = null;

async function obtenerUpdate(version: string): Promise<Update> {
  if (ultima && ultima.version === version) return ultima;
  const u = await check();
  if (!u || u.version !== version) {
    throw new Error("La actualización ya no está disponible en el servidor");
  }
  ultima = u;
  return u;
}

export const servicioTauri: ServicioActualizaciones = {
  disponible: async () => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return false;
    return !(await actualizacionesDeshabilitadas());
  },
  versionActual: () => getVersion(),
  consultar: async () => {
    // OPEN-RVT: en Linux latest.json no trae plataforma instalable; se consulta la
    // versión publicada y, si es mayor, se ofrece la descarga del .deb.
    if (esLinux()) {
      const datos = await invoke<{
        version: string;
        fecha: string | null;
        notas: string | null;
      } | null>("ultima_version");
      if (!datos?.version) return null;
      const actual = await getVersion();
      if (!versionMasNueva(datos.version, actual)) return null;
      return {
        version: datos.version,
        fecha: datos.fecha ?? null,
        notas: datos.notas ?? null,
      };
    }
    const u = await check();
    if (!u) {
      ultima = null;
      return null;
    }
    ultima = u;
    return { version: u.version, fecha: u.date ?? null, notas: u.body ?? null };
  },
  instalar: async (actualizacion, alProgreso, antesDeInstalar) => {
    // OPEN-RVT: sin instalación automática en Linux; se abre la página de descargas.
    if (esLinux()) {
      await abrirEnlace(URL_DESCARGA);
      return;
    }
    const u = await obtenerUpdate(actualizacion.version);
    let total: number | null = null;
    let descargado = 0;
    await u.download((evento) => {
      if (evento.event === "Started") {
        total = evento.data.contentLength ?? null;
        alProgreso({ descargado, total });
      } else if (evento.event === "Progress") {
        descargado += evento.data.chunkLength;
        alProgreso({ descargado, total });
      }
    });
    // CA-4: nunca se instala con trabajo pendiente sin guardar.
    await antesDeInstalar();
    await u.install();
  },
  relanzar: () => relaunch(),
};
