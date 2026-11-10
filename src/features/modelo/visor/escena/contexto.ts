/* eslint-disable @typescript-eslint/no-explicit-any -- contexto de paso entre las partes de la escena (movido de Visor3D). */
import type { Abertura, Caja, ElementoMalla, Nivel, Vista } from "../../tipos";
import type { Estilos } from "../../estilos";
import type { MuroPlanta } from "../../planta";
import type { Nota } from "../../anotaciones3d";

export interface ReferenciaEjeEscena {
  globalid: string;
  etiqueta: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  [k: string]: any;
}

export interface CtxEscena {
  vista: Vista;
  vistas: Vista[];
  niveles: Nivel[];
  mallas: ElementoMalla[];
  visibles: ElementoMalla[];
  estilos: Estilos;
  aberturas: Abertura[];
  caja: Caja;
  notas: Nota[];
  referencias: { ejes: any[]; reticula?: any; [k: string]: any };
  grupo: { current: import("three").Group | null };
  cotasInteraccion: { current: any[] };
  murosCapas: MuroPlanta[];
  datosCotas: any[];
  datosNiveles: any[];
  [k: string]: any;
}
