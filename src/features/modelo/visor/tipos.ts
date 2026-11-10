import type { Abertura, Caja, ElementoMalla, Nivel, Vista } from "../tipos";
import type { Estilos } from "../estilos";

export interface Props {
  vista: Vista;
  vistas: Vista[];
  niveles: Nivel[];
  mallas: ElementoMalla[];
  estilos: Estilos;
  aberturas: Abertura[];
  caja: Caja;
  seleccion: string | null;
  seleccionados: string[];
  modoCorte: boolean;
  puntoCorte: [number, number] | null;
  onSeleccionar: (globalid: string | null, agregar?: boolean) => void;
  onSeleccionarVarios: (globalids: string[]) => void;
  onPuntoCorte: (punto: [number, number]) => void;
  onEscape: () => void;
  /** O030: cambia el modo de anotación de la vista. */
  onCambiarAnotacion?: (modo: "papel" | "pantalla") => void;
  /** O031: identifica el archivo abierto para no heredar cámaras de otro modelo. */
  claveModelo?: string;
  /** O038: GlobalIds de elementos ocultos por el árbol del proyecto en esta vista. */
  elementosOcultos?: string[];
  /** O038: GlobalIds de elementos bloqueados (visibles pero no seleccionables). */
  elementosBloqueados?: string[];
}

/** O006a: texto de cota que se puede editar con doble clic. */
export interface CotaInteractiva {
  tipo: "parcial" | "total" | "rebase" | "nivel" | "elevacion";
  texto: string;
  valor: number;
  punto: [number, number, number];
  referencia?: string;
  mover?: string;
  nivel?: string;
  nombre?: string;
}

/** O011b: rectángulo de una etiqueta de nivel o cota, en mundo, para las E2E. */
export interface AnotacionAlzado {
  tipo: "nivel" | "parcial" | "total";
  texto: string;
  centro: [number, number, number];
  ancho: number;
  alto: number;
  /** Dirección horizontal del plano de la anotación. */
  h: [number, number, number];
}

export interface CotaEnEdicion {
  tipo: CotaInteractiva["tipo"];
  referencia?: string;
  mover?: string;
  nivel?: string;
  nombre?: string;
  valor: number;
  izquierda: number;
  arriba: number;
}
