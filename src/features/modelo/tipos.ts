// OPEN-RVT: tipos del módulo Modelo. El núcleo Python devuelve estas formas por
// `nucleo_llamar`; la cámara y las vistas viven en el frontend para poder dibujarlas
// con three.js.

import type { EstiloCategoriaVista } from "./estilos";
import type { EnlaceEjes } from "./enlaces";

export type TipoVista = "planta" | "alzado" | "corte" | "iso" | "perspectiva";
export type Orientacion = "norte" | "sur" | "este" | "oeste";
export type EstiloVista = "sombreado" | "aristas" | "lineas-ocultas";
export type EscalaVista = 20 | 50 | 100 | 200;
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

/** O011: ajustes de un eje que solo viven en esta vista (no tocan el IfcGrid). */
export interface AjusteEjeVista {
  /** Extremos libres: si existe, ese extremo no sigue la alineación común. */
  extremoInicio?: [number, number];
  extremoFin?: [number, number];
  /** O042/O044: un codo son dos nodos (V1 sobre el eje, V2 desplazado), máximo uno
   *  por extremo. El globo se deriva de V2, paralelo al eje. */
  codosInicio?: [number, number][];
  codosFin?: [number, number][];
  /** O044: marca los codos creados con la forma nueva (V2 a 0.80·D del borde del
   *  globo). Los codos viejos no la llevan y conservan su forma tal cual. */
  codoNuevoInicio?: boolean;
  codoNuevoFin?: boolean;
  /** O021: visibilidad del globo por extremo. Por omisión: fin visible e inicio
   *  visible solo cuando el extremo se ha tocado (como en O011). */
  globoInicio?: boolean;
  globoFin?: boolean;
}

/** O014b: desplazamiento manual de la cabeza de un nivel dentro de una vista. */
export interface AjusteNivelVista {
  /** Metros que sube la cabeza respecto de la línea del nivel. */
  desplazamiento: number;
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
  /** O030: anotación a escala de papel (crece con el zoom) o tamaño de pantalla. */
  anotacionEscala?: "papel" | "pantalla";
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
  /** O006a: cotas automáticas entre ejes en planta (activadas por omisión). */
  cotasEjes?: boolean;
  /** O011: ajustes de eje en esta vista. Clave: GlobalId del eje. */
  ejes?: Record<string, AjusteEjeVista>;
  /** O014b: ajustes de cabeza de nivel en esta vista. Clave: GlobalId del nivel. */
  nivelesAjuste?: Record<string, AjusteNivelVista>;
  /** O024: sobrescritura por vista de la separación de globos (mm de papel). */
  separacionGlobos?: number;
  /** O024: nombre del estilo de cota por omisión de esta vista. */
  estiloCota?: string;
  /** O038: claves de nodos del árbol del proyecto ocultos en esta vista. */
  arbolOcultos?: string[];
  /** O038: claves de nodos del árbol del proyecto bloqueados en esta vista. */
  arbolBloqueados?: string[];
  /** O055: conmutadores de anotaciones en las vistas 3D. Por omisión apagados,
   *  salvo las notas. */
  ejes3d?: boolean;
  niveles3d?: boolean;
  cotas3d?: boolean;
  notas3d?: boolean;
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

export type FuncionCapa = "núcleo" | "acabado" | "aislante" | "membrana";
export type LineaUbicacion = "eje_nucleo" | "cara_exterior" | "cara_interior" | "centro";

export interface CapaMuro {
  funcion: FuncionCapa;
  material: string;
  espesor: number;
  color?: string;
  rayado?: string;
  categoria?: string;
  /** O007a: centro de la capa respecto al eje del muro (local +Y = exterior). */
  centro?: number;
  nucleo?: boolean;
}

export interface MaterialBiblioteca {
  id: string;
  nombre: string;
  categoria: string;
  color: string;
  rayado: string;
  unidad: string;
  espesor_tipico: number;
}

/** O009: una partida de medición del tipo (pset OPENRVT_Medicion). */
export interface PartidaMedicion {
  Nombre: string;
  ClavePP: string;
  Unidad: "m" | "m2" | "m3" | "kg" | "pza";
  Criterio:
    | "area_nucleo"
    | "area_capa"
    | "largo"
    | "area"
    | "volumen"
    | "cimbra_borde"
    | "acero"
    | "cimbra"
    | "plantilla"
    | "excavacion"
    | "piezas";
  Capa: number | null;
}

export interface TipoElemento {
  globalid: string;
  nombre: string;
  clase: string;
  parametros: Record<string, unknown>;
  capas: CapaMuro[];
  instancias: number;
  /** O009: partidas de medición y criterios válidos para la clase. */
  partidas?: PartidaMedicion[];
  criterios?: PartidaMedicion["Criterio"][];
  /** O007b: alias estructural (zapata, columna, castillo…). */
  alias?: string;
  seccion?: Record<string, number | string>;
  armado?: Record<string, number | string>;
  acero?: {
    unidad: string;
    longitudinal_kg: number;
    estribos_kg: number;
    total_kg: number;
    detalle: Record<string, unknown>;
  };
}

/** O007b: datos de sección y colocación que el visor necesita para la planta. */
export interface EstructuraElemento {
  alias: string;
  seccion: Record<string, number | string>;
  armado: Record<string, number | string>;
  datos: Record<string, number | string>;
}

export type LineaMuro = [number, number, number, number];

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
  /** O005: capas del IfcMaterialLayerSet, de exterior a interior. */
  capas: CapaMuro[];
  /** O007a: eje del muro en planta [x1, y1, x2, y2]. */
  eje?: LineaMuro | null;
  /** O007b: sección y colocación de los elementos estructurales. */
  estructura?: EstructuraElemento | null;
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
  capas: CapaMuro[];
  eje?: LineaMuro | null;
  estructura?: EstructuraElemento | null;
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
  /** O045: línea de bitácora cuando se restauró la altura de muros viejos. */
  migracion?: string;
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
  /** O016: base y tope por nivel (también para IFC viejos sin pset). */
  restricciones?: {
    NivelBase: string;
    DesfaseBase?: number;
    NivelTope?: string;
    DesfaseTope?: number;
    AlturaSinConexion?: number;
    /** O033: único dato vertical de una zapata. */
    Desplante?: number;
  };
  /** O028: cruce o tramo de ejes al que está anclado. */
  enlace?: EnlaceEjes;
  /** O040: alias de estructura (muro, cerramiento, dala, …). */
  alias?: string;
  /** O040: muro al que está ligado un cerramiento o dala. */
  muro_liga?: { muro: string; nombre: string };
  /** O059: uso efectivo de una losa (firme, entrepiso o azotea). */
  uso?: "firme" | "entrepiso" | "azotea";
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

export const ESCALAS: readonly EscalaVista[] = [20, 50, 100, 200];

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
