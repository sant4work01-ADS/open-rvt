// OPEN-RVT: adaptado de src/lib/atajosGlobales.ts de PresupuestosPro. Se conserva el
// mecanismo (escucha en captura, ignora diálogos abiertos y campos de texto) y se reducen
// las acciones a las del esqueleto: paleta, atajos, ribbon y escala.
import { useEffect, useRef } from "react";
import { ATAJOS_GLOBALES, coincide, type AccionGlobal } from "./atajos";

export interface AccionesGlobales {
  paleta: () => void;
  atajos: () => void;
  /** Minimizar o restaurar la cinta de comandos (Ctrl+F1). */
  minimizarRibbon: () => void;
  /** Tamaño de la interfaz: agrandar, achicar y volver al predeterminado. */
  escalaMas: () => void;
  escalaMenos: () => void;
  escalaNormal: () => void;
  /** Archivo (spec O003a). */
  nuevoArchivo: () => void;
  abrirArchivo: () => void;
  guardarArchivo: () => void;
  guardarComo: () => void;
}

const TIPOS_SIN_TEXTO = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
]);

/** Campo donde el usuario escribe texto. */
export function esCampoDeTexto(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA") return true;
  return t instanceof HTMLInputElement && !TIPOS_SIN_TEXTO.has(t.type);
}

/** Hay un diálogo modal o un menú desplegado (los atajos globales no deben actuar). */
export function hayDialogoAbierto(): boolean {
  return document.querySelector('[aria-modal="true"], [role="menu"]') !== null;
}

/** Instala los atajos globales. */
// OPEN-RVT: sin obra que abrir/cerrar; se quitó el segundo parámetro `hayObra`.
export function useAtajosGlobales(acciones: AccionesGlobales) {
  const ref = useRef(acciones);
  useEffect(() => {
    ref.current = acciones;
  });

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const atajo = ATAJOS_GLOBALES.find((a) => coincide(a, e));
      if (!atajo) return;
      if (hayDialogoAbierto()) return;
      // Deshacer/rehacer con el foco en un campo de texto son los del propio campo.
      if (atajo.enTexto === false && esCampoDeTexto(e.target)) return;

      const a = ref.current;
      const f: Record<AccionGlobal, (() => void) | null> = {
        paleta: a.paleta,
        ayuda: a.atajos,
        minimizarRibbon: a.minimizarRibbon,
        // El tamaño de la interfaz es una preferencia de la app: actúa con o sin modelo.
        escalaMas: a.escalaMas,
        escalaMenos: a.escalaMenos,
        escalaNormal: a.escalaNormal,
        nuevoArchivo: a.nuevoArchivo,
        abrirArchivo: a.abrirArchivo,
        guardarArchivo: a.guardarArchivo,
        guardarComo: a.guardarComo,
      };
      const ejecutar = f[atajo.accion];
      if (!ejecutar) return;
      e.preventDefault();
      ejecutar();
    };
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, []);
}
