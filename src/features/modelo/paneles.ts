// O070: estado de la pantalla dividida. Cada panel tiene su vista y su cámara; la
// división, la orientación y la proporción viven en el pset de vistas (propiedad
// «Paneles»), separadas de la lista de vistas.
import type { CamaraGuardada } from "./visor/camara";

export type OrientacionDivision = "vertical" | "horizontal";

export interface PanelVista {
  /** Id de la vista del panel; null si el panel está vacío. */
  vistaId: string | null;
  /** O070: cámara propia del panel (no se persiste en el IFC). */
  camara?: CamaraGuardada;
}

export interface PanelesVista {
  dividida: boolean;
  orientacion: OrientacionDivision;
  /** Proporción del panel izquierdo/superior, entre 0.2 y 0.8. */
  proporcion: number;
  paneles: [PanelVista, PanelVista];
  panelActivo: 0 | 1;
}

export const PROPORCION_MIN = 0.2;
export const PROPORCION_MAX = 0.8;

/** Limita la proporción al 20–80 % que exige el separador. */
export function limitarProporcion(valor: unknown): number {
  if (valor === null || valor === undefined) return 0.5;
  if (typeof valor === "string" && valor.trim() === "") return 0.5;
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return 0.5;
  return Math.min(PROPORCION_MAX, Math.max(PROPORCION_MIN, numero));
}

export function panelesIniciales(vistaId: string | null = null): PanelesVista {
  return {
    dividida: false,
    orientacion: "vertical",
    proporcion: 0.5,
    paneles: [{ vistaId }, { vistaId: null }],
    panelActivo: 0,
  };
}

export function otroPanel(indice: 0 | 1): 0 | 1 {
  return indice === 0 ? 1 : 0;
}

/** Normaliza lo leído del pset (o null) a un estado completo y seguro. */
export function normalizarPaneles(valor: unknown): PanelesVista {
  const v = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const crudos = Array.isArray(v.paneles) ? v.paneles : [];
  const leerPanel = (indice: number): PanelVista => {
    const crudo = crudos[indice];
    if (!crudo || typeof crudo !== "object") return { vistaId: null };
    const panel = crudo as Record<string, unknown>;
    return {
      vistaId:
        typeof panel.vistaId === "string" && panel.vistaId ? panel.vistaId : null,
    };
  };
  const orientacion: OrientacionDivision =
    v.orientacion === "horizontal" ? "horizontal" : "vertical";
  const panelActivo = v.panelActivo === 1 ? 1 : 0;
  return {
    dividida: v.dividida === true,
    orientacion,
    proporcion: limitarProporcion(v.proporcion),
    paneles: [leerPanel(0), leerPanel(1)],
    panelActivo,
  };
}

/** JSON que se guarda en la propiedad «Paneles» del pset OPENRVT_Vistas. */
export function serializarPaneles(paneles: PanelesVista): Record<string, unknown> {
  return {
    dividida: paneles.dividida,
    orientacion: paneles.orientacion,
    proporcion: Math.round(limitarProporcion(paneles.proporcion) * 10000) / 10000,
    paneles: paneles.paneles.map((panel) => ({ vistaId: panel.vistaId })),
    panelActivo: paneles.panelActivo,
  };
}

/** Copia los paneles cambiando solo la vista de uno de ellos. */
export function conVistaEnPanel(
  paneles: [PanelVista, PanelVista],
  indice: 0 | 1,
  vistaId: string | null,
): [PanelVista, PanelVista] {
  return paneles.map((panel, i) =>
    i === indice ? { ...panel, vistaId } : panel,
  ) as [PanelVista, PanelVista];
}

/**
 * Quita de los paneles las vistas que ya no existen y deja el panel activo
 * apuntando a la vista activa. Devuelve también la vista activa corregida para
 * que `vistaActivaId` nunca quede apuntando a un panel vacío.
 */
export function sanearPaneles(
  paneles: [PanelVista, PanelVista],
  vistaIds: Iterable<string>,
  vistaActivaId: string | null,
): { paneles: [PanelVista, PanelVista]; vistaActivaId: string | null } {
  const validas = new Set(vistaIds);
  const limpios = paneles.map((panel) => ({
    ...panel,
    vistaId: panel.vistaId && validas.has(panel.vistaId) ? panel.vistaId : null,
  })) as [PanelVista, PanelVista];
  return { paneles: limpios, vistaActivaId };
}
