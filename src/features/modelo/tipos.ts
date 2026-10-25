// OPEN-RVT: tipos del módulo Modelo. El núcleo Python devuelve estas formas por
// `nucleo_llamar`; la cámara y las vistas viven en el frontend para poder dibujarlas
// con three.js.

import type { EstiloCategoriaVista } from "./estilos";

export type TipoVista = "planta" | "alzado" | "corte" | "iso" | "perspectiva";
export type Orientacion = "norte" | "sur" | "este" | "oeste";
export type EstiloVista = "sombreado" | "aristas" | "lineas-ocultas";
export type EscalaVista = 50 | 100 | 200;
export type Categoria =
  | "muros"
  | "losas"
  | "columnas"
  | "vigas"
  | "puertas"
  | "ventanas"
  | "cubiertas"
  | "escaleras"
  | "otros";

export interface CategoriasVisibles {
  muros: boolean;
  losas: boolean;
  columnas: boolean;
  vigas: boolean;
  puertas: boolean;
  ventanas: boolean;
  cubiertas: boolean;
  escaleras: boolean;
  otros: boolean;
}

export interface Vista {
  id: string;
  nombre: string;
  tipo: TipoVista;
  /** Nivel de la planta (GlobalId) o nivel de referencia de un alzado. */
  nivel?: string;
  /** Altura absoluta del plano de corte en plantas y cortes. */
  alturaPlano?: number;
  /** Fondo del plano en plantas (absoluto) o fondo del corte en metros. */
  profundidad?: number;
  /** Niveles visibles; vacío = todos. */
  nivelesVisibles: string[];
  categorias: CategoriasVisibles;
  estilo: EstiloVista;
  escala: EscalaVista;
  /** Alzados: desde qué lado mira la cámara. */
  orientacion?: Orientacion;
  /** Cortes: traza en planta (coordenadas XY del IFC). */
  puntoA?: [number, number];
  puntoB?: [number, number];
  /** Cortes: normal de la traza en XY (dirección de la mirada). */
  direccion?: [number, number];
  /** O005: sobrescritura de estilos por categoría dentro de esta vista. */
  estilos?: Partial<Record<Categoria, EstiloCategoriaVista>>;
  /** O005: qué se proyecta por encima del corte en planta (m). */
  alturaArriba?: number;
}

export interface Nivel {
  globalid: string;
  nombre: string;
  elevacion: number;
}

export interface Elemento {
  globalid: string;
  clase: string;
  nombre: string;
  nivel: string;
  tipo: string;
  categoria: Categoria;
}

export interface ElementoMalla {
  globalid: string;
  clase: string;
  nombre: string;
  nivel: string;
  color: string;
  opacidad: number;
  categoria: Categoria;
  /** O005: tipo IFC del elemento (nombre del IfcWallType en muros de O003b). */
  tipo: string;
  vertices: Float32Array;
  indices: Uint32Array;
}

/** O005: datos de una puerta o ventana para dibujar su simbología en planta. */
export interface Abertura {
  globalid: string;
  clase: "IfcDoor" | "IfcWindow";
  /** Centro de la abertura en planta (coordenadas del IFC). */
  centro: [number, number];
  /** Ángulo del eje del muro en radianes (dirección de la longitud). */
  angulo: number;
  ancho: number;
  espesor: number;
  antepecho: number;
  volteado: boolean;
  /** Categoría del elemento (puertas o ventanas). */
  categoria: Categoria;
}

export interface ElementoMallaCrudo {
  globalid: string;
  clase: string;
  nombre: string;
  nivel: string;
  color: string;
  opacidad: number;
  categoria: Categoria;
  tipo: string;
  vertices: string;
  indices: string;
}

export interface RespuestaTeselado {
  elementos: ElementoMallaCrudo[];
  triangulos: number;
}

export interface RespuestaInfo {
  ruta: string | null;
  esquema: string;
  con_cambios: boolean;
  elementos: number;
  por_clase: Record<string, number>;
  nombre: string;
}

export interface PropiedadesElemento {
  globalid: string;
  clase: string;
  nombre: string;
  nivel: string;
  tipo: string;
  atributos: Record<string, unknown>;
  materiales: Array<{ nombre: string; capas: Array<Record<string, unknown>> }>;
  psets: Record<string, Record<string, unknown>>;
}

export interface Caja {
  min: [number, number, number];
  max: [number, number, number];
}

export const CATEGORIAS: ReadonlyArray<{ id: Categoria; nombre: string }> = [
  { id: "muros", nombre: "Muros" },
  { id: "losas", nombre: "Losas" },
  { id: "columnas", nombre: "Columnas" },
  { id: "vigas", nombre: "Vigas" },
  { id: "puertas", nombre: "Puertas" },
  { id: "ventanas", nombre: "Ventanas" },
  { id: "cubiertas", nombre: "Cubiertas" },
  { id: "escaleras", nombre: "Escaleras" },
  { id: "otros", nombre: "Otros" },
];

export const CATEGORIAS_TODAS = (): CategoriasVisibles => ({
  muros: true,
  losas: true,
  columnas: true,
  vigas: true,
  puertas: true,
  ventanas: true,
  cubiertas: true,
  escaleras: true,
  otros: true,
});

export const ESTILOS: ReadonlyArray<{ id: EstiloVista; nombre: string }> = [
  { id: "sombreado", nombre: "Sombreado" },
  { id: "aristas", nombre: "Sombreado con aristas" },
  { id: "lineas-ocultas", nombre: "Líneas ocultas" },
];

export const ESCALAS: readonly EscalaVista[] = [50, 100, 200];

/** Etiqueta legible del tipo de vista. */
export function nombreTipo(tipo: TipoVista): string {
  switch (tipo) {
    case "planta":
      return "Planta";
    case "alzado":
      return "Alzado";
    case "corte":
      return "Corte";
    case "iso":
      return "3D Isométrica";
    case "perspectiva":
      return "3D Perspectiva";
  }
}
