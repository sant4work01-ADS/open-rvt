import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MenuContextual, type ItemMenu } from "@/components/ui/menu-contextual";
// OPEN-RVT: solo quedan los atajos generales del esqueleto.
import { ATAJOS_GLOBALES, coincide, type TeclaEv } from "@/lib/atajos";
import { tr } from "@/i18n";

// Capa JS de la spec 021: la app se comporta como app de escritorio, no como navegador.
// Se instala una sola vez en el arranque (src/main.tsx).

const TODOS_LOS_ATAJOS = [...ATAJOS_GLOBALES];

function comoTecla(e: KeyboardEvent): TeclaEv {
  return {
    key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  };
}

/** ¿La combinación tiene un uso propio en la app (registro `atajosDe`)? */
export function esAtajoNuestro(e: KeyboardEvent): boolean {
  return TODOS_LOS_ATAJOS.some((a) => coincide(a, comoTecla(e)));
}

function esCampoDeTexto(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const etiqueta = el.tagName.toLowerCase();
  return etiqueta === "input" || etiqueta === "textarea" || el.isContentEditable;
}

// --- Menú de los campos de texto -------------------------------------------------------

let menuAbierto: { raiz: Root; nodo: HTMLDivElement } | null = null;

function cerrarMenuDeTexto() {
  if (!menuAbierto) return;
  const { raiz, nodo } = menuAbierto;
  menuAbierto = null;
  raiz.unmount();
  nodo.remove();
}

function ejecutarComando(comando: string) {
  try {
    document.execCommand(comando);
  } catch {
    // El navegador puede no permitirlo (permisos del portapapeles): se ignora.
  }
}

function abrirMenuDeTexto(campo: HTMLElement, x: number, y: number) {
  cerrarMenuDeTexto();
  const nodo = document.createElement("div");
  document.body.append(nodo);
  const raiz = createRoot(nodo);
  menuAbierto = { raiz, nodo };
  const items: ItemMenu[] = [
    { id: "deshacer", titulo: tr("ribbon.comandos.deshacer", "Deshacer"), atajo: "Ctrl+Z", onElegir: () => ejecutarComando("undo") },
    { separador: true },
    { id: "cortar", titulo: tr("ribbon.comandos.cortar", "Cortar"), atajo: "Ctrl+X", onElegir: () => ejecutarComando("cut") },
    { id: "copiar", titulo: tr("ribbon.comandos.copiar", "Copiar"), atajo: "Ctrl+C", onElegir: () => ejecutarComando("copy") },
    { id: "pegar", titulo: tr("ribbon.comandos.pegar", "Pegar"), atajo: "Ctrl+V", onElegir: () => ejecutarComando("paste") },
    { separador: true },
    {
      id: "seleccionarTodo",
      titulo: tr("app.seleccionar-todo", "Seleccionar todo"),
      atajo: "Ctrl+A",
      onElegir: () => {
        if (campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement) {
          campo.select();
        } else {
          ejecutarComando("selectAll");
        }
      },
    },
  ];
  raiz.render(
    createElement(MenuContextual, {
      x,
      y,
      etiqueta: tr("app.edicion", "Edición"),
      items,
      onCerrar: cerrarMenuDeTexto,
    }),
  );
}

// --- Instalación -----------------------------------------------------------------------

/** Instala la capa JS de comportamiento nativo. Devuelve la función para desinstalarla. */
export function instalarComportamientoNativo(): () => void {
  const alContextMenu = (e: MouseEvent) => {
    // Nunca el menú del navegador. Las rejillas abren el suyo en su propio manejador.
    e.preventDefault();
    if (esCampoDeTexto(e.target)) abrirMenuDeTexto(e.target, e.clientX, e.clientY);
  };

  const alTecla = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const k = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    // Nuestros atajos nunca se tocan (Ctrl+K, F1, Ctrl+F1, Ctrl+=…).
    // F5 (buscar, como en OPUS) y Ctrl+P (reportes) son nuestros y además recargan o
    // imprimen en el navegador: solo se cancela la acción del navegador (preventDefault,
    // sin detener la propagación), así que nuestros manejadores los siguen recibiendo.
    if (k !== "f5" && !(ctrl && k === "p") && esAtajoNuestro(e)) return;

    const bloqueados =
      k === "f5" ||
      k === "f7" ||
      k === "f3" ||
      (ctrl && ["r", "p", "u", "f", "g"].includes(k)) ||
      (ctrl && e.shiftKey && ["r", "i", "j", "c"].includes(k)) ||
      (e.altKey && (k === "arrowleft" || k === "arrowright")) ||
      (ctrl && ["=", "+", "-", "0"].includes(k));
    if (bloqueados) e.preventDefault();
  };

  const alRueda = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    const objetivo = e.target instanceof Element ? e.target : null;
    // Los componentes que hacen zoom propio (Gantt) lo marcan con el atributo.
    if (objetivo?.closest("[data-permite-ctrl-rueda]")) return;
    e.preventDefault();
  };

  const alArrastrar = (e: DragEvent) => {
    const objetivo = e.target instanceof Element ? e.target : null;
    if (objetivo?.closest("img, a[href]")) e.preventDefault();
  };

  const alSoltar = (e: DragEvent) => {
    const objetivo = e.target instanceof Element ? e.target : null;
    if (!objetivo?.closest("[data-zona-soltar]")) e.preventDefault();
  };

  document.addEventListener("contextmenu", alContextMenu, true);
  document.addEventListener("keydown", alTecla, true);
  document.addEventListener("wheel", alRueda, { capture: true, passive: false });
  document.addEventListener("dragstart", alArrastrar, true);
  document.addEventListener("dragover", alSoltar, true);
  document.addEventListener("drop", alSoltar, true);

  return () => {
    cerrarMenuDeTexto();
    document.removeEventListener("contextmenu", alContextMenu, true);
    document.removeEventListener("keydown", alTecla, true);
    document.removeEventListener("wheel", alRueda, true);
    document.removeEventListener("dragstart", alArrastrar, true);
    document.removeEventListener("dragover", alSoltar, true);
    document.removeEventListener("drop", alSoltar, true);
  };
}
