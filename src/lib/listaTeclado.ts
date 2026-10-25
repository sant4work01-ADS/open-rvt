// Navegación de teclado en las listas desplegables y menús (Ctrl+B, Ctrl+K, «Mover dentro
// de…», ventana de atajos, ayuda, menú contextual): ↑↓, RePág/AvPág, Inicio/Fin y garantizar
// que el renglón activo siempre quede a la vista (scroll «nearest»).
import { useEffect, type RefObject } from "react";

export type MovimientoLista =
  | "arriba"
  | "abajo"
  | "paginaArriba"
  | "paginaAbajo"
  | "inicio"
  | "fin";

/** Teclas de navegación de lista (sin modificadores); `null` si la lista no la maneja. */
export function movimientoDeTecla(e: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): MovimientoLista | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowDown":
      return "abajo";
    case "ArrowUp":
      return "arriba";
    case "PageDown":
      return "paginaAbajo";
    case "PageUp":
      return "paginaArriba";
    case "Home":
      return "inicio";
    case "End":
      return "fin";
    default:
      return null;
  }
}

/** Índice del ítem activo después de un movimiento (sin salirse de `cantidad`). */
export function indiceTrasMovimiento(
  mov: MovimientoLista,
  activo: number,
  cantidad: number,
  porPagina: number,
): number {
  if (cantidad <= 0) return 0;
  const salto = Math.max(porPagina, 1);
  switch (mov) {
    case "arriba":
      return Math.max(activo - 1, 0);
    case "abajo":
      return Math.min(activo + 1, cantidad - 1);
    case "paginaArriba":
      return Math.max(activo - salto, 0);
    case "paginaAbajo":
      return Math.min(activo + salto, cantidad - 1);
    case "inicio":
      return 0;
    case "fin":
      return cantidad - 1;
  }
}

/** Renglones que caben en el contenedor (para RePág/AvPág); al menos 1. */
export function renglonesPorPagina(contenedor: HTMLElement | null): number {
  if (!contenedor) return 10;
  const primero = contenedor.querySelector<HTMLElement>(
    '[role="option"], [role="menuitem"], button',
  );
  const alto = primero?.offsetHeight || 24;
  const visibles = Math.floor(contenedor.clientHeight / alto);
  if (visibles < 1) return 10;
  return visibles - 1;
}

/** Hace visible el ítem marcado como seleccionado dentro del contenedor (o con otro selector). */
export function asegurarVisible(
  contenedor: HTMLElement | null,
  selector = '[aria-selected="true"]',
): void {
  const el = contenedor?.querySelector<HTMLElement>(selector);
  el?.scrollIntoView?.({ block: "nearest" });
}

/**
 * Desplaza el contenedor para que el ítem activo quede a la vista cada vez que cambia
 * `activo` (o cambia la lista). Solo un `useEffect` al que se le pasa la ref y el estado.
 */
export function useScrollSeleccionado(
  contenedor: RefObject<HTMLElement | null>,
  activo: number,
  cantidad: number,
): void {
  useEffect(() => {
    if (cantidad > 0) asegurarVisible(contenedor.current);
  }, [contenedor, activo, cantidad]);
}
