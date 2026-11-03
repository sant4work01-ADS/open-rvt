// OPEN-RVT: estado del modelo abierto. Centraliza el canal con el núcleo Python, la
// lista de vistas y la selección para que la cinta, el visor y la barra de estado
// compartan una sola fuente de verdad.
import { create } from "zustand";
import { agregarEvento, bitacoraHerramienta, llamarConBitacora } from "@/lib/bitacora";
import { elegirDestinoIfc, elegirIfcParaAbrir } from "@/lib/dialogos";
import {
  CATEGORIAS_TODAS,
  type Abertura,
  type Caja,
  type Elemento,
  type ElementoMalla,
  type Nivel,
  type PropiedadesElemento,
  type RespuestaInfo,
  type RespuestaTeselado,
  type Vista,
  type AjusteEjeVista,
  type LineaUbicacion,
} from "./tipos";
import {
  clavesParaAislar,
  type ArbolObra,
  type NodoArbol,
  type PartidaObra,
} from "./arbol";
import {
  cajaDeMallas,
  completarVistasEstandar,
  crearVistaCorte,
  crearVistas,
  migrarNivelesVisibles,
  normalizarVistas,
  numeroDeCorte,
} from "./vistas";
import {
  areaPoligono,
  colocarAbertura,
  ejeBajoPunto,
  ejeConDistancia,
  ejeOrtogonal,
  muroBajoPunto,
  opcionesCerramientoEnVista,
  puntoConLongitud,
  proyectarSobreSegmento,
  puntoDibujo,
  REFERENCIAS_VACIAS,
  referenciasAlDia,
  restringirEje,
  siguienteEtiquetaEje,
  tramosDeCerramiento,
  type Enganche,
  type Punto2,
  type Referencias,
} from "./herramientas";
import { estilosPorDefecto, normalizarEstilos, type Estilos } from "./estilos";
import { cortarRectas, recortarRecta } from "./planta";
import { construirAberturas } from "./aberturas";
import { normalizarAjusteEje } from "./ejesVista";
import {
  cotasTemporalesNivel,
  elevacionDesdeCota,
  engancheElevacionNivel,
  nivelEnElevacion,
  nombreNivelAutomatico,
  normalizarAjusteNivel,
  type NivelRef,
} from "./niveles";

export type RespuestaGuardar = "guardar" | "descartar" | "cancelar";
export type Herramienta =
  | "muro"
  | "losa"
  | "puerta"
  | "ventana"
  | "eje"
  | "mover"
  | "copiar"
  | "zapata"
  | "zapata_corrida"
  | "contratrabe"
  | "columna"
  | "castillo"
  | "trabe"
  | "cerramiento"
  | "dala"
  | "alinear"
  | "nivel"
  | "recortar_extender"
  | "espejo"
  | "matriz";
export type AlineacionMuro = "centro" | "interior" | "exterior";
/** ED1: modos de la herramienta Recortar/Extender. */
export type ModoRecorte = "esquina" | "elemento" | "varios";
export interface LineaRecorte {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface ReferenciaRecorte {
  tipo: "elemento" | "eje";
  globalid: string;
  linea: LineaRecorte;
}

/** O026: referencia de la herramienta Alinear (eje, nivel o cara de elemento). */
export interface ReferenciaAlinear {
  tipo: "eje" | "elemento" | "nivel";
  globalid: string;
  cara?: string;
}

/** O026: alineación recién hecha, con su candado abierto o cerrado. */
export interface AlineacionActiva {
  elemento: string;
  referencia: string;
  tipo: "eje" | "elemento" | "nivel";
  cara: string;
  bloqueada: boolean;
  punto: [number, number];
}

/** O007b: las ocho herramientas estructurales y su alias de tipo. */
export const ALIAS_HERRAMIENTA: Partial<Record<Herramienta, string>> = {
  zapata: "zapata",
  zapata_corrida: "zapata_corrida",
  contratrabe: "contratrabe",
  columna: "columna",
  castillo: "castillo",
  trabe: "trabe",
  cerramiento: "cerramiento",
  dala: "dala",
};

export const HERRAMIENTAS_ESTRUCTURA: Herramienta[] = [
  "zapata", "zapata_corrida", "contratrabe", "columna", "castillo",
  "trabe", "cerramiento", "dala",
];

export function esHerramientaEstructura(h: Herramienta | null): boolean {
  return h !== null && HERRAMIENTAS_ESTRUCTURA.includes(h);
}

/** Las lineales se trazan con dos clics; las puntuales con uno. */
export function esHerramientaLineal(h: Herramienta | null): boolean {
  return h === "zapata_corrida" || h === "contratrabe" || h === "trabe" ||
    h === "cerramiento" || h === "dala";
}

export function esHerramientaPuntual(h: Herramienta | null): boolean {
  return h === "zapata" || h === "columna" || h === "castillo";
}

export interface TipoHerramienta {
  globalid: string;
  nombre: string;
  clase: string;
  espesor?: number;
  alias?: string;
  seccion?: Record<string, number | string>;
  armado?: Record<string, number | string>;
  acero?: Record<string, unknown>;
}

export interface OpcionesMuro {
  tipo: string;
  altura: number;
  alineacion: AlineacionMuro;
  /** O032: línea de ubicación del ejemplar; manda sobre `alineacion`. */
  lineaUbicacion: LineaUbicacion;
  /** O032: desfase de la línea respecto al eje dibujado, positivo al exterior. */
  desfaseUbicacion: number;
}

/** O032: borde de losa al crear desde muros. */
export interface OpcionesLosa {
  lado: "exterior" | "eje" | "interior";
  desfase: number;
}

/** O041: nivel y desfase de la herramienta «Cerramiento». Vacío = por omisión
 * (nivel de tope del muro y su desfase). */
export interface OpcionesCerramiento {
  nivel: string;
  desfase: string;
}

/** O029: opciones de la herramienta «Nivel» (alzado/corte). */
export interface OpcionesNivel {
  nombre: string;
  /** Mientras no se edite, el nombre sigue a la elevación del cursor. */
  nombreAutomatico: boolean;
  crearPlanta: boolean;
  elevacionTexto: string;
}

/** ED2: casilla «Copiar» de la herramienta Espejo (marcada por omisión). */
export interface OpcionesEspejo {
  copiar: boolean;
}

/** ED2: barra de opciones de la herramienta Matriz. */
export interface OpcionesMatriz {
  modo: "lineal" | "polar";
  /** Número total de elementos, incluido el original. */
  numero: number;
  alUltimo: boolean;
  /** Ángulo total en grados para la matriz polar. */
  angulo: number;
}

/** O006d: un bloque de la retícula (vertical u horizontal). */
export interface BloqueEjesReticula {
  separaciones: number[];
  origen: number;
  longitud: number;
  primeraEtiqueta: string;
}

export interface RespuestaComando {
  creados: string[];
  modificados: string[];
  borrados: string[];
  mensaje?: string;
  [clave: string]: unknown;
}

interface PreguntaGuardar {
  nombre: string;
  resolver: (respuesta: RespuestaGuardar) => void;
}

interface EstadoModelo {
  ruta: string | null;
  nombreArchivo: string;
  esquema: string;
  conCambios: boolean;
  totalElementos: number;
  conteos: Record<string, number>;
  niveles: Nivel[];
  elementos: Elemento[];
  mallas: ElementoMalla[];
  caja: Caja;
  vistas: Vista[];
  /** O005: tabla de plumillas y rellenos, persistida en OPENRVT_Estilos. */
  estilos: Estilos;
  /** O005: puertas y ventanas con sus datos de planta. */
  aberturas: Abertura[];
  /** O038: jerarquía del proyecto (modo Modelo) devuelta por `modelo.arbol`. */
  arbol: NodoArbol | null;
  /** O039: árbol del presupuesto (modo Obra) devuelto por `modelo.arbol_obra`. */
  arbolObra: ArbolObra | null;
  /** O039: el árbol de Obra solo se calcula con el modo Obra abierto (medir todo es caro). */
  arbolObraActivo: boolean;
  fijarArbolObraActivo: (activo: boolean) => void;
  /** O038: contador que el árbol incrementa para pedir «Ajustar» al visor. */
  ajustarToken: number;
  vistaActivaId: string | null;
  /** O021: eje seleccionado en el visor (para el panel de propiedades). */
  ejeSeleccionado: string | null;
  /** O029: nivel seleccionado en el alzado para copiar/desfasar. */
  nivelSeleccionado: string | null;
  seleccion: string | null;
  seleccionados: string[];
  propiedades: PropiedadesElemento | null;
  cargando: boolean;
  error: string | null;
  aviso: string | null;
  /** O041: pista de Tab bajo el cursor («Tab: siguiente (Cerramiento …)»). */
  pistaTab: string | null;
  modoCorte: boolean;
  puntoCorte: [number, number] | null;
  preguntaGuardar: PreguntaGuardar | null;
  tiempoCargaMs: number | null;
  vistasPersistidas: boolean;
  /** O005: diálogo de estilos de objeto abierto. */
  dialogoEstilos: boolean;
  /** O006a: diálogo «Crear ejes por separaciones». */
  dialogoCotas: boolean;
  /** O024: editor de estilos de anotación (niveles, ejes y cotas). */
  dialogoAnotacion: boolean;
  /** O007a: editor de tipos y materiales abierto dentro del área de trabajo. */
  editorTipos: boolean;
  /** O007a: tipo que se abre preseleccionado (doble clic sobre un muro). */
  editorTipoInicial: string | null;

  // O003b: herramientas de modelado.
  herramienta: Herramienta | null;
  /** O026: referencia elegida y alineación con candado de la herramienta Alinear. */
  referenciaAlinear: ReferenciaAlinear | null;
  alineando: AlineacionActiva | null;
  /** ED1: modo y referencias de Recortar/Extender. */
  modoRecorte: ModoRecorte;
  referenciaRecorte: ReferenciaRecorte | null;
  recorteInicial: (ReferenciaRecorte & { punto: Punto2 }) | null;
  vistaPreviaRecorte: (LineaRecorte & { globalid: string }) | null;
  fijarModoRecorte: (modo: ModoRecorte) => void;
  clicRecorte: (objetivo: {
    tipo: "elemento" | "eje";
    globalid: string;
    punto: Punto2;
  }) => Promise<void>;
  previsualizarRecorte: (globalid: string, punto: Punto2) => void;
  terminarRecorteExtender: () => void;
  opcionesMuro: OpcionesMuro;
  /** O029: nombre automático, vista de planta y elevación exacta del nivel nuevo. */
  opcionesNivel: OpcionesNivel;
  fijarOpcionesNivel: (cambios: Partial<OpcionesNivel>) => void;
  /** ED2: espejo y matriz lineales/polares. */
  opcionesEspejo: OpcionesEspejo;
  fijarOpcionesEspejo: (cambios: Partial<OpcionesEspejo>) => void;
  opcionesMatriz: OpcionesMatriz;
  fijarOpcionesMatriz: (cambios: Partial<OpcionesMatriz>) => void;
  /** O029: cotas temporales del nivel bajo el cursor. */
  cotasNivel: { inferior: NivelRef | null; superior: NivelRef | null } | null;
  /** O029: clic en alzado/corte: [posición horizontal, elevación]. */
  clicNivel: (punto: Punto2) => Promise<void>;
  tiposMuro: Array<{ globalid: string; nombre: string; espesor: number }>;
  /** O007b: tipos estructurales y el tipo elegido por herramienta. */
  tiposHerramienta: TipoHerramienta[];
  tipoHerramienta: Partial<Record<Herramienta, string>>;
  /** O007b: giro de la siguiente columna o zapata (grados). */
  rotacionSiguiente: number;
  /** O007c: al colocar una columna se ofrece su zapata y el tipo de zapata. */
  columnaConZapata: boolean;
  tipoZapata: string;
  fijarColumnaConZapata: (valor: boolean) => void;
  fijarTipoZapata: (nombre: string) => void;
  /** O007c: diálogo de separación de los castillos automáticos. */
  dialogoCastillos: boolean;
  abrirDialogoCastillos: () => void;
  cerrarDialogoCastillos: () => void;
  /** O007c: pregunta «¿Borrar también su zapata?» (por omisión, sí). */
  preguntaZapata: { resolver: (ok: boolean) => void } | null;
  preguntarZapata: () => Promise<boolean>;
  responderZapata: (ok: boolean) => void;
  fijarTipoHerramienta: (herramienta: Herramienta, nombre: string) => void;
  girar90: () => void;
  referencias: Referencias;
  puntosHerramienta: Punto2[];
  ratonHerramienta: Punto2 | null;
  engancheHerramienta: Enganche | null;
  longitudTecleada: string;
  /** O006d: el trazo de eje actual se dibuja libre (Ctrl o Alt). */
  ejeLibre: boolean;
  voltearSiguiente: boolean;
  etiquetaEje: string;
  activarHerramienta: (herramienta: Herramienta) => void;
  cancelarHerramienta: () => void;
  /** O026: primer clic elige la referencia; el segundo alinea y deja el candado abierto. */
  elegirReferenciaAlinear: (referencia: ReferenciaAlinear) => void;
  aplicarAlinear: (elemento: string, cara: string, punto: [number, number]) => Promise<void>;
  alternarCandadoAlinear: () => Promise<void>;
  /** O005c: Esc cancela el trazo en curso; devuelve false si no había nada que cancelar. */
  cancelarTrazo: () => boolean;
  fijarOpcionesMuro: (cambios: Partial<OpcionesMuro>) => void;
  fijarEtiquetaEje: (etiqueta: string) => void;
  fijarRatonHerramienta: (
    punto: Punto2 | null,
    shift?: boolean,
    metrosPorPixel?: number,
  ) => void;
  teclearLongitud: (tecla: string) => void;
  confirmarLongitud: (shift?: boolean) => Promise<void>;
  cancelarLongitud: () => void;
  clicEnPlanta: (
    punto: Punto2,
    shift?: boolean,
    agregar?: boolean,
    metrosPorPixel?: number,
  ) => Promise<void>;
  dobleClicEnPlanta: () => Promise<void>;
  voltearAbertura: () => void;
  borrarSeleccion: () => Promise<void>;
  deshacer: () => Promise<void>;
  rehacer: () => Promise<void>;
  validar: () => Promise<void>;
  crearNivel: (
    nombre: string,
    elevacion: number,
    opciones?: { crearPlanta?: boolean },
  ) => Promise<boolean>;
  copiarNivel: (globalid: string, desfase: number) => Promise<boolean>;
  arregloNiveles: (
    globalid: string,
    cantidad: number,
    separacion: number,
  ) => Promise<boolean>;
  editarNivel: (globalid: string, nombre: string, elevacion: number) => Promise<void>;
  borrarNivel: (globalid: string) => Promise<void>;
  crearEje: (etiqueta: string, x1: number, y1: number, x2: number, y2: number) => Promise<void>;
  editarEje: (globalid: string, etiqueta: string) => Promise<void>;
  /** O026: desplaza un eje entero (lo usa la prueba E2E de la propagación). */
  moverEje: (globalid: string, desplazamiento: number) => Promise<boolean>;
  borrarEje: (globalid: string) => Promise<void>;
  /** O006a: retícula completa desde separaciones (una sola operación). */
  crearEjesPorSeparaciones: (
    direccion: "vertical" | "horizontal",
    origen: number,
    separaciones: number[],
    longitud: number,
    primeraEtiqueta: string,
  ) => Promise<boolean>;
  /** O006d: retícula en ambos sentidos, desde el origen o rebasando la opuesta. */
  crearReticula: (
    vertical: BloqueEjesReticula | null,
    horizontal: BloqueEjesReticula | null,
    modo: "origen" | "rebase",
    rebase: number,
  ) => Promise<boolean>;
  /** O006d: cambia el rebase de la retícula y recalcula los extremos. */
  editarRebase: (rebase: number) => Promise<boolean>;
  /** O006a: la cota manda; mueve el eje (y la cadena) a la distancia pedida. */
  separarEjes: (
    referencia: string,
    mover: string,
    distancia: number,
    cadena: boolean,
  ) => Promise<boolean>;
  /** O006a: la cota de nivel manda; mueve el nivel superior y, si toca, los de arriba. */
  separarNiveles: (
    inferior: string,
    superior: string,
    altura: number,
    cadena: boolean,
  ) => Promise<boolean>;
  /** O006a: elección de la casilla «Mover los siguientes» durante la sesión. */
  cotasMoverSiguientes: boolean;
  fijarCotasMoverSiguientes: (valor: boolean) => void;
  losaDesdeMuros: () => Promise<void>;
  opcionesLosa: OpcionesLosa;
  fijarOpcionesLosa: (cambios: Partial<OpcionesLosa>) => void;
  /** O041: nivel y desfase que se aplican al crear cerramientos. */
  opcionesCerramiento: OpcionesCerramiento;
  fijarOpcionesCerramiento: (cambios: Partial<OpcionesCerramiento>) => void;
  /** O032: voltea los lados exterior/interior del muro sin mover su línea. */
  voltearMuro: (globalid: string) => Promise<void>;
  /** O007c: castillos en esquinas, remates e intermedios de los muros elegidos. */
  castillosAutomaticos: (separacion: number) => Promise<boolean>;
  /** O007c: columna en todos los cruces de la retícula (con zapata opcional). */
  columnasEnCruces: () => Promise<boolean>;
  /** O007c: contratrabes entre zapatas consecutivas y trabes entre columnas. */
  unirZapatas: () => Promise<boolean>;
  unirTrabes: () => Promise<boolean>;
  /** O028: una zapata en cada cruce de la retícula. */
  zapatasEnCruces: () => Promise<boolean>;
  /** O028: contratrabes y muros entre los cruces del eje seleccionado. */
  contratrabesEntreEjes: () => Promise<boolean>;
  murosEntreEjes: () => Promise<boolean>;
  /** O028: quita el enlace del elemento sin moverlo. */
  soltarEnlace: (globalid: string) => Promise<void>;
  /** O040: suelta un cerramiento o dala de su muro, dejándolo en su lugar. */
  soltarDelMuro: (globalid: string) => Promise<void>;
  editarElemento: (globalid: string, cambios: Record<string, unknown>) => Promise<void>;
  /** O016: cambia base, tope y desfases de un muro o columna. */
  editarRestricciones: (
    globalid: string,
    cambios: {
      nivel_base?: string;
      desfase_base?: number;
      nivel_tope?: string;
      desfase_tope?: number;
      altura_sin_conexion?: number;
      /** O033: solo zapatas. */
      desplante?: number;
    },
  ) => Promise<void>;

  nuevo: () => Promise<boolean>;
  abrir: (ruta?: string) => Promise<boolean>;
  guardar: () => Promise<boolean>;
  guardarComo: (ruta?: string) => Promise<boolean>;
  asegurarSinCambios: () => Promise<boolean>;
  preguntarGuardar: () => Promise<RespuestaGuardar>;
  responderGuardar: (respuesta: RespuestaGuardar) => void;
  fijarVista: (id: string) => void;
  actualizarVista: (id: string, cambios: Partial<Vista>) => Promise<void>;
  /** O022: duplica una vista (copia completa con id y nombre nuevos). */
  duplicarVista: (id: string) => Promise<string | null>;
  /** O022: elimina una vista salvo que sea la última de su tipo. */
  eliminarVista: (id: string) => Promise<boolean>;
  /** O011: guarda los ajustes de anotación de uno o varios ejes de la vista. */
  fijarAjustesEjes: (
    vistaId: string,
    cambios: Record<string, AjusteEjeVista | null>,
  ) => Promise<void>;
  /** O014b: guarda los desplazamientos manuales de las cabezas de nivel. */
  fijarAjustesNiveles: (
    vistaId: string,
    cambios: Record<string, { desplazamiento: number } | null>,
  ) => Promise<void>;
  guardarEstilos: (estilos: Estilos) => Promise<void>;
  abrirDialogoEstilos: () => void;
  cerrarDialogoEstilos: () => void;
  abrirDialogoCotas: () => void;
  abrirDialogoAnotacion: () => void;
  cerrarDialogoAnotacion: () => void;
  cerrarDialogoCotas: () => void;
  abrirEditorTipos: (tipoGlobalid?: string | null) => void;
  cerrarEditorTipos: () => void;
  /** O007a: edita el tipo y regenera todas sus instancias (una sola operación). */
  aplicarTipoEdicion: (
    globalid: string,
    datos: Record<string, unknown>,
  ) => Promise<boolean>;
  recargarTipos: () => Promise<void>;
  seleccionar: (globalid: string | null, agregar?: boolean) => Promise<void>;
  /** O038: selecciona varios elementos a la vez (clic en tipo/categoría/nivel). */
  seleccionarVarios: (globalids: string[]) => Promise<void>;
  /** O038: alterna el ojo o el candado de un nodo en la vista activa. */
  alternarNodoArbol: (clave: string, tipo: "oculto" | "bloqueado") => Promise<void>;
  /** O038: oculta todo salvo el subárbol del nodo. */
  aislarNodoArbol: (clave: string) => Promise<void>;
  /** O038: muestra todos los nodos de la vista activa. */
  mostrarTodoArbol: () => Promise<void>;
  /** O039: mueve una partida al capítulo indicado (un solo paso de deshacer). */
  moverPartidaObra: (partida: PartidaObra, capitulo: string) => Promise<void>;
  /** O039: crea un capítulo nuevo al final. */
  crearCapituloObra: (nombre: string) => Promise<void>;
  /** O039: renombra un capítulo por su identificación. */
  renombrarCapituloObra: (identificacion: string, nombre: string) => Promise<void>;
  /** O039: sube o baja un capítulo en el orden. */
  moverCapituloObra: (
    identificacion: string,
    direccion: "subir" | "bajar",
  ) => Promise<void>;
  /** O039: borra un capítulo; sus partidas vuelven al capítulo por omisión. */
  borrarCapituloObra: (identificacion: string) => Promise<void>;
  /** O038: pide al visor que ajuste el encuadre a la selección. */
  pedirAjustar: () => void;
  fijarEjeSeleccionado: (globalid: string | null) => void;
  /** O029: selecciona el nivel tocado en un alzado/corte. */
  fijarNivelSeleccionado: (globalid: string | null) => void;
  iniciarCorte: () => void;
  cancelarCorte: () => void;
  anadirPuntoCorte: (punto: [number, number]) => Promise<void>;
  limpiarAviso: () => void;
  fijarAviso: (texto: string) => void;
  fijarPistaTab: (texto: string | null) => void;
  comprobarNucleo: () => Promise<void>;
}

async function rpc<T>(metodo: string, params: Record<string, unknown> = {}): Promise<T> {
  // O006c: cada llamada al núcleo queda como `accion` y su `resultado`.
  return llamarConBitacora<T>(metodo, params);
}

function base64ABytes(texto: string): Uint8Array {
  const binario = atob(texto);
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) salida[i] = binario.charCodeAt(i);
  return salida;
}

function decodificarMalla(crudo: RespuestaTeselado["elementos"][number]): ElementoMalla {
  const vertices = base64ABytes(crudo.vertices);
  const indices = base64ABytes(crudo.indices);
  return {
    globalid: crudo.globalid,
    clase: crudo.clase,
    nombre: crudo.nombre,
    nivel: crudo.nivel,
    color: crudo.color,
    opacidad: crudo.opacidad,
    categoria: crudo.categoria,
    tipo: crudo.tipo ?? "",
    capas: crudo.capas ?? [],
    eje: crudo.eje ?? null,
    estructura: crudo.estructura ?? null,
    vertices: new Float32Array(vertices.buffer, vertices.byteOffset, vertices.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

function nombreDeRuta(ruta: string | null, nombreModelo: string): string {
  if (!ruta) return `${nombreModelo || "Modelo"}.ifc`;
  const partes = ruta.split(/[\\/]/);
  return partes[partes.length - 1] || "Modelo.ifc";
}

const CAJA_VACIA: Caja = { min: [-1, -1, -1], max: [1, 1, 1] };
let tokenSeleccion = 0;

/**
 * O006a: al mover niveles, las plantas conservan su plano de corte y su fondo
 * relativos a la nueva elevación. La cadena puede mover varios niveles a la vez.
 */
/** O037: ¿es la única planta que muestra su nivel? */
export function plantaUnicaDeNivel(vistas: Vista[], vista: Vista): boolean {
  return (
    vista.tipo === "planta" &&
    !!vista.nivel &&
    vistas.filter((v) => v.tipo === "planta" && v.nivel === vista.nivel).length === 1
  );
}

/** O037: quita las plantas cuyo nivel ya no existe (borrado con Supr, deshacer…). */
export function quitarPlantasHuerfanas(vistas: Vista[], niveles: Nivel[]): Vista[] {
  const ids = new Set(niveles.map((n) => n.globalid));
  const quedan = vistas.filter((v) => v.tipo !== "planta" || !v.nivel || ids.has(v.nivel));
  // Nunca se queda sin plantas: si todas eran huérfanas se conservan.
  return quedan.some((v) => v.tipo === "planta") ? quedan : vistas;
}

function sincronizarPlantas(vistas: Vista[], niveles: Nivel[]): Vista[] {
  const ordenados = [...niveles].sort((a, b) => a.elevacion - b.elevacion);
  return vistas.map((vista) => {
    if (vista.tipo !== "planta" || !vista.nivel) return vista;
    const nivel = niveles.find((n) => n.globalid === vista.nivel);
    if (!nivel) return vista;
    const indice = ordenados.findIndex((n) => n.globalid === nivel.globalid);
    return {
      ...vista,
      nombre: `Planta ${nivel.nombre}`,
      alturaPlano: nivel.elevacion + 1.2,
      profundidad:
        indice > 0 ? ordenados[indice - 1].elevacion : nivel.elevacion - 1,
    };
  });
}

export const useModelo = create<EstadoModelo>((set, get) => {
  const cargarAberturas = async (
    elementos: Elemento[],
    mallas: ElementoMalla[],
    referencias: Referencias,
  ): Promise<Abertura[]> => {
    const ids = elementos
      .filter((e) => e.clase === "IfcDoor" || e.clase === "IfcWindow")
      .map((e) => e.globalid);
    if (ids.length === 0) return [];
    const propiedades = await Promise.all(
      ids.map((globalid) =>
        rpc<PropiedadesElemento>("modelo.propiedades", { globalid }).catch(() => null),
      ),
    );
    return construirAberturas(
      propiedades.filter((p): p is PropiedadesElemento => p !== null),
      mallas,
      referencias,
    );
  };

  const cargarTiposEstructura = async (): Promise<TipoHerramienta[]> => {
    const clases = ["IfcFootingType", "IfcColumnType", "IfcBeamType"];
    const listas = await Promise.all(
      clases.map((clase) =>
        rpc<TipoHerramienta[]>("tipos.listar", { clase }).catch(() => []),
      ),
    );
    return listas.flat().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  };

  /** Tipo elegido por herramienta; si no hay, el primero de su alias. */
  const tipoDeHerramienta = (
    herramienta: Herramienta,
    tipos: TipoHerramienta[],
    elegidos: Partial<Record<Herramienta, string>>,
  ): TipoHerramienta | undefined => {
    const alias = ALIAS_HERRAMIENTA[herramienta];
    const candidatos = tipos.filter((t) => t.alias === alias);
    return candidatos.find((t) => t.nombre === elegidos[herramienta]) ?? candidatos[0];
  };

  /** O029: niveles y caras horizontales de losas/vigas como candidatos del imán. */
  const candidatosElevacionNivel = (): number[] => {
    const valores = get().niveles.map((n) => n.elevacion);
    for (const malla of get().mallas) {
      let zMin = Infinity;
      let zMax = -Infinity;
      for (let i = 2; i < malla.vertices.length; i += 3) {
        const z = malla.vertices[i];
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
      if (Number.isFinite(zMin)) valores.push(zMin);
      if (Number.isFinite(zMax)) valores.push(zMax);
    }
    return valores;
  };

  const crearNivelDesdeHerramienta = async (punto: Punto2): Promise<boolean> => {
    const estado = get();
    const elevacion = punto[1];
    const opciones = estado.opcionesNivel;
    const nombre =
      opciones.nombreAutomatico || !opciones.nombre.trim()
        ? nombreNivelAutomatico(estado.niveles, elevacion)
        : opciones.nombre.trim();
    const repetido = nivelEnElevacion(estado.niveles, elevacion);
    if (repetido) {
      set({
        aviso: `Ya existe «${repetido.nombre}» a ${elevacion.toFixed(2)} m; no se crea.`,
      });
      return false;
    }
    const ok = await get().crearNivel(nombre, elevacion, {
      crearPlanta: opciones.crearPlanta,
    });
    if (!ok) return false;
    set({
      puntosHerramienta: [],
      ratonHerramienta: null,
      engancheHerramienta: null,
      longitudTecleada: "",
      cotasNivel: null,
      opcionesNivel: {
        ...opciones,
        // O029: se conserva el nombre del nivel recién creado; al mover el cursor
        // o teclear otra elevación, el automático se recalcula desde la posición.
        nombre: opciones.nombreAutomatico ? nombre : opciones.nombre,
        elevacionTexto: "",
      },
      aviso: `Nivel a ${elevacion.toFixed(2)} m creado.`,
    });
    bitacoraHerramienta("nivel", "terminar", { x: punto[0], y: elevacion });
    return true;
  };

  const cargar = async (info: RespuestaInfo) => {
    const inicio = performance.now();
    const [niveles, elementos, teselado, vistasCrudas, tipos, referenciasCrudas, estilosCrudos,
      tiposEstructura, arbol, arbolObra] = await Promise.all([
        rpc<Nivel[]>("modelo.niveles"),
        rpc<Elemento[]>("modelo.elementos"),
        rpc<RespuestaTeselado>("geometria.teselar", { globalids: null }),
        rpc<unknown>("vistas.leer"),
        rpc<Array<{ globalid: string; nombre: string; espesor: number }>>("tipos.listar", {
          clase: "IfcWallType",
        }),
        rpc<Referencias>("modelo.referencias"),
        rpc<unknown>("estilos.leer").catch(() => null),
        cargarTiposEstructura(),
        rpc<NodoArbol>("modelo.arbol").catch(() => null),
        get().arbolObraActivo
          ? rpc<ArbolObra>("modelo.arbol_obra").catch(() => null)
          : Promise.resolve(null),
      ]);
    const mallas = teselado.elementos.map(decodificarMalla);
    const caja = cajaDeMallas(mallas);
    const referencias = referenciasAlDia(referenciasCrudas);
    const aberturas = await cargarAberturas(elementos, mallas, referencias);
    let vistas = normalizarVistas(vistasCrudas);
    let persistidas = vistas.length > 0;
    let migradas = false;
    if (vistas.length === 0) {
      vistas = crearVistas(niveles);
      persistidas = false;
    } else {
      // O005b: las vistas guardadas con todos los niveles marcados por omisión pasan a
      // mostrar solo el nivel de su planta.
      const migracion = migrarNivelesVisibles(vistas, niveles);
      vistas = migracion.vistas;
      migradas = migracion.cambiadas;
      // O031: completar los alzados y el 3D que falten en archivos guardados solo
      // con plantas; no marca la obra como modificada.
      vistas = completarVistasEstandar(vistas, niveles).vistas;
    }
    const activa =
      vistas.find((v) => v.tipo === "planta") ?? vistas[0] ?? null;
    set({
      ruta: info.ruta,
      nombreArchivo: nombreDeRuta(info.ruta, info.nombre),
      esquema: info.esquema,
      conCambios: info.con_cambios || migradas,
      totalElementos: info.elementos,
      conteos: info.por_clase,
      niveles,
      elementos,
      mallas,
      caja,
      vistas,
      estilos: normalizarEstilos(estilosCrudos),
      aberturas,
      arbol,
      arbolObra,
      vistasPersistidas: persistidas,
      vistaActivaId: activa?.id ?? null,
      seleccion: null,
      seleccionados: [],
      propiedades: null,
      cargando: false,
      error: null,
      aviso: null,
      pistaTab: null,
      modoCorte: false,
      puntoCorte: null,
      tiposMuro: tipos,
      tiposHerramienta: tiposEstructura,
      tipoHerramienta: {},
      rotacionSiguiente: 0,
      referencias,
      herramienta: null,
      referenciaAlinear: null,
      alineando: null,
      puntosHerramienta: [],
      ratonHerramienta: null,
      engancheHerramienta: null,
      longitudTecleada: "",
      opcionesMuro: {
        tipo: tipos.find((t) => t.nombre === "Block 15")?.nombre ?? tipos[0]?.nombre ?? "",
        altura: 2.6,
        alineacion: "centro",
        lineaUbicacion: "eje_nucleo",
        desfaseUbicacion: 0,
      },
      tiempoCargaMs: Math.round(performance.now() - inicio),
    });
    // La migración queda en memoria y se persiste en el siguiente guardado; no se
    // bloquea la apertura con una escritura extra del pset.
  };

  const persistirVistas = async (vistas: Vista[]) => {
    try {
      await rpc("vistas.guardar", { lista: vistas });
      set({ vistasPersistidas: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  };

  const persistirEstilos = async (estilos: Estilos) => {
    await rpc("estilos.guardar", { estilos });
    set({ estilos, conCambios: true, error: null });
  };

  const guardarEn = async (ruta: string | null, como: boolean): Promise<boolean> => {
    const estado = get();
    if (!ruta && !estado.ruta) {
      const elegida = await elegirDestinoIfc(estado.nombreArchivo.replace(/\.ifc$/i, ""));
      if (!elegida) return false;
      ruta = elegida;
    }
    try {
      set({ cargando: true, error: null });
      // Las vistas automáticas también se escriben en el pset al guardar.
      await rpc("vistas.guardar", { lista: estado.vistas });
      await rpc("estilos.guardar", { estilos: estado.estilos });
      const info = await rpc<RespuestaInfo>("proyecto.guardar", {
        ruta: como || !estado.ruta ? ruta : null,
      });
      set({
        ruta: info.ruta,
        nombreArchivo: nombreDeRuta(info.ruta, info.nombre),
        esquema: info.esquema,
        conCambios: info.con_cambios,
        totalElementos: info.elementos,
        conteos: info.por_clase,
        vistasPersistidas: true,
        cargando: false,
        error: null,
      });
      return true;
    } catch (e) {
      set({ cargando: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  /**
   * O003b: tras un comando solo se re-teselan los GlobalId que devolvió el núcleo;
   * el resto de mallas se conserva. La barra de estado muestra el mensaje del núcleo.
   */
  const refrescarDeComando = async (resultado: RespuestaComando) => {
    const tocados = [...new Set([...(resultado.creados ?? []), ...(resultado.modificados ?? [])])];
    const borrados = new Set(resultado.borrados ?? []);
    const [info, niveles, elementos, referenciasCrudas, teselado, arbol, arbolObra] =
      await Promise.all([
      rpc<RespuestaInfo>("proyecto.info"),
      rpc<Nivel[]>("modelo.niveles"),
      rpc<Elemento[]>("modelo.elementos"),
      rpc<Referencias>("modelo.referencias"),
      tocados.length > 0
        ? rpc<RespuestaTeselado>("geometria.teselar", { globalids: tocados })
        : Promise.resolve(null),
      rpc<NodoArbol>("modelo.arbol").catch(() => get().arbol),
      get().arbolObraActivo
        ? rpc<ArbolObra>("modelo.arbol_obra").catch(() => get().arbolObra)
        : Promise.resolve(null),
      ]);
    let mallas = get().mallas.filter(
      (m) => !borrados.has(m.globalid) && !tocados.includes(m.globalid),
    );
    if (teselado) mallas = [...mallas, ...teselado.elementos.map(decodificarMalla)];
    const referencias = referenciasAlDia(referenciasCrudas);
    const aberturas = await cargarAberturas(elementos, mallas, referencias);
    const seleccionados = get().seleccionados.filter((g) => !borrados.has(g));
    const seleccion = seleccionados[0] ?? null;
    set({
      totalElementos: info.elementos,
      conteos: info.por_clase,
      conCambios: info.con_cambios,
      niveles,
      elementos,
      referencias,
      mallas,
      caja: cajaDeMallas(mallas),
      aberturas,
      arbol,
      arbolObra,
      seleccion,
      seleccionados,
      propiedades: seleccion ? get().propiedades : null,
      error: null,
      aviso: resultado.mensaje || get().aviso,
    });
    if (borrados.size > 0) {
      const antes = get().vistas;
      const vistas = quitarPlantasHuerfanas(antes, niveles);
      if (vistas.length !== antes.length) {
        const activa = get().vistaActivaId;
        set({
          vistas,
          vistaActivaId:
            vistas.find((v) => v.id === activa)?.id ??
            vistas.find((v) => v.tipo === "planta")?.id ??
            null,
        });
        await persistirVistas(vistas);
      }
    }
    if (seleccion && get().propiedades?.globalid !== seleccion) {
      await get().seleccionar(seleccion);
    }
    if (!seleccion) set({ propiedades: null });
  };

  const ejecutarResultado = async (
    metodo: string,
    params: Record<string, unknown> = {},
  ): Promise<RespuestaComando | null> => {
    try {
      const resultado = await rpc<RespuestaComando>(metodo, params);
      await refrescarDeComando(resultado);
      return resultado;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  };

  const ejecutar = async (metodo: string, params: Record<string, unknown> = {}) => {
    return (await ejecutarResultado(metodo, params)) !== null;
  };

  /** ED1: línea de ubicación de un elemento lineal ya teselado. */
  const lineaDeElemento = (globalid: string): LineaRecorte | null => {
    const malla = get().mallas.find((m) => m.globalid === globalid);
    if (!malla) return null;
    if (malla.eje) {
      const [x1, y1, x2, y2] = malla.eje;
      return { x1, y1, x2, y2 };
    }
    const datos = malla.estructura?.datos as Record<string, unknown> | undefined;
    if (!datos || datos.X2 === undefined || datos.Y2 === undefined) return null;
    const x1 = Number(datos.X1 ?? datos.X);
    const y1 = Number(datos.Y1 ?? datos.Y);
    const x2 = Number(datos.X2);
    const y2 = Number(datos.Y2);
    if (![x1, y1, x2, y2].every((v) => Number.isFinite(v))) return null;
    return { x1, y1, x2, y2 };
  };

  const lineaDeEje = (globalid: string): LineaRecorte | null => {
    const eje = get().referencias.ejes.find((e) => e.globalid === globalid);
    return eje ? { x1: eje.x1, y1: eje.y1, x2: eje.x2, y2: eje.y2 } : null;
  };

  /** O033: tras un rechazo, recarga las propiedades sin borrar el aviso. */
  const refrescarPropiedades = async (globalid: string) => {
    const error = get().error;
    try {
      const propiedades = await rpc<PropiedadesElemento>("modelo.propiedades", {
        globalid,
      });
      set({ propiedades, error });
    } catch {
      /* si falla la recarga, se conserva el aviso original */
    }
  };

  const nivelActivo = () => {
    const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
    return vista?.nivel ?? get().niveles[0]?.globalid;
  };

  const crearMuroEntre = async (origen: Punto2, destino: Punto2): Promise<boolean> => {
    if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) < 0.01) return false;
    const nivel = nivelActivo();
    if (!nivel) {
      set({ aviso: "Cree antes un nivel." });
      return false;
    }
    const opciones = get().opcionesMuro;
    const ok = await ejecutar("muros.crear", {
      tipo: opciones.tipo,
      nivel,
      x1: origen[0],
      y1: origen[1],
      x2: destino[0],
      y2: destino[1],
      altura: opciones.altura,
      alineacion: opciones.alineacion,
    linea_ubicacion: opciones.lineaUbicacion,
    desfase_ubicacion: opciones.desfaseUbicacion,
    });
    if (ok) {
      set({ puntosHerramienta: [destino], ...limpiarTrazoExtra() });
      bitacoraHerramienta("muro", "terminar", { x: destino[0], y: destino[1] });
    }
    return ok;
  };

  /** O045: cerramiento dibujado como un muro (inicio y fin, en cadena). */
  const crearCerramientoEntre = async (
    origen: Punto2,
    destino: Punto2,
  ): Promise<boolean> => {
    if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) < 0.01) {
      return false;
    }
    const tipo = tipoEstructural("cerramiento");
    if (!tipo) return false;
    const vistaActiva = get().vistas.find((v) => v.id === get().vistaActivaId);
    const extras = opcionesCerramientoEnVista(
      vistaActiva,
      get().opcionesCerramiento,
      get().niveles,
    );
    // O045: se parte igual que en el núcleo: un cerramiento por muro colineal
    // (cortado en las juntas) y libres los tramos que no caen sobre un muro.
    const tramos = tramosDeCerramiento(
      get().referencias,
      origen[0],
      origen[1],
      destino[0],
      destino[1],
    );
    if (tramos.length === 0) return false;
    let creados = 0;
    for (const tramo of tramos) {
      const resultado = await ejecutarResultado("cerramientos.crear", {
        tipo: tipo.nombre,
        x1: tramo.x1,
        y1: tramo.y1,
        x2: tramo.x2,
        y2: tramo.y2,
        ...extras,
      });
      if (!resultado) {
        // O043/O045: el rechazo del núcleo (tramo ya ocupado) se muestra como aviso.
        if (get().error) set({ aviso: get().error });
        return false;
      }
      creados += resultado.creados.length;
    }
    if (creados === 0) return false;
    set({ puntosHerramienta: [destino], ...limpiarTrazoExtra() });
    bitacoraHerramienta("cerramiento", "terminar", {
      x: destino[0], y: destino[1],
    });
    return true;
  };

  const tipoEstructural = (herramienta: Herramienta): TipoHerramienta | null => {
    const tipo = tipoDeHerramienta(
      herramienta,
      get().tiposHerramienta,
      get().tipoHerramienta,
    );
    if (!tipo) {
      set({ aviso: `No hay tipos de ${herramienta.replace(/_/g, " ")} en la biblioteca.` });
      return null;
    }
    return tipo;
  };

  const tipoZapataElegida = (): TipoHerramienta | null => {
    const zapatas = get().tiposHerramienta.filter((t) => t.alias === "zapata");
    const elegido = get().tipoZapata;
    return zapatas.find((t) => t.nombre === elegido) ?? zapatas[0] ?? null;
  };

  /** O007c: ejes que pasan por el punto de enganche (para guardar EjeA y EjeB). */
  const ejesEnPunto = (punto: Punto2): string[] => {
    const dentro = get().referencias.ejes.filter((eje) => {
      const proyeccion = proyectarSobreSegmento(
        punto,
        [eje.x1, eje.y1],
        [eje.x2, eje.y2],
      );
      return proyeccion.distancia <= 0.01 && proyeccion.t >= -1e-6 && proyeccion.t <= 1 + 1e-6;
    });
    return dentro.slice(0, 2).map((eje) => eje.globalid);
  };

  /** O007b: columna, castillo o zapata en un cruce de ejes. */
  const crearEstructuralPunto = async (
    herramienta: Herramienta,
    punto: Punto2,
  ): Promise<boolean> => {
    const tipo = tipoEstructural(herramienta);
    const nivel = nivelActivo();
    if (!tipo || !nivel) return false;
    const rotacion = (get().rotacionSiguiente * Math.PI) / 180;
    const metodo = herramienta === "zapata" ? "zapatas.crear" : "columnas.crear";
    const cruce =
      herramienta === "columna" || herramienta === "zapata"
        ? ejesEnPunto(punto)
        : [];
    const resultado = await ejecutarResultado(metodo, {
      tipo: tipo.nombre,
      nivel,
      x: punto[0],
      y: punto[1],
      rotacion,
      ...(cruce.length >= 2 ? { ejeA: cruce[0], ejeB: cruce[1] } : {}),
    });
    if (!resultado) return false;
    if (herramienta === "columna" && get().columnaConZapata) {
      const zapata = tipoZapataElegida();
      const columna = resultado.creados[0];
      if (zapata && columna) {
        const hecha = await ejecutarResultado("zapatas.bajo_columna", {
          tipo: zapata.nombre,
          columna,
        });
        if (!hecha) return false;
      }
    }
    set({
      aviso: `${tipo.nombre} colocado${herramienta === "columna" && get().columnaConZapata ? " con zapata" : ""}. R gira 90°.`,
    });
    bitacoraHerramienta(herramienta, "terminar", { x: punto[0], y: punto[1] });
    return true;
  };

  /** O007b: trabe, cerramiento, dala, contratrabe o zapata corrida entre dos puntos. */
  const crearEstructuralLineal = async (
    herramienta: Herramienta,
    origen: Punto2,
    destino: Punto2,
  ): Promise<boolean> => {
    if (Math.hypot(destino[0] - origen[0], destino[1] - origen[1]) < 0.01) return false;
    const tipo = tipoEstructural(herramienta);
    const nivel = nivelActivo();
    if (!tipo || !nivel) return false;
    const metodo = herramienta === "zapata_corrida"
      ? "zapatas_corridas.crear"
      : "vigas.crear";
    const ok = await ejecutar(metodo, {
      tipo: tipo.nombre,
      nivel,
      x1: origen[0],
      y1: origen[1],
      x2: destino[0],
      y2: destino[1],
    });
    if (ok) {
      set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
      bitacoraHerramienta(herramienta, "terminar", {
        x: destino[0], y: destino[1],
      });
    }
    return ok;
  };

  const limpiarTrazoExtra = () => ({
    longitudTecleada: "",
    ratonHerramienta: null,
    engancheHerramienta: null,
  });

  const crearEjeEntre = async (
    origen: Punto2,
    destino: Punto2,
    libre = false,
  ): Promise<boolean> => {
    // O006d: con ejes previos y sin Ctrl/Alt, el eje se fuerza paralelo a la familia
    // más cercana y toma sus extremos; el segundo punto solo fija la distancia.
    // O036b: el eje pasa por el primer punto y va horizontal o vertical; el segundo
    // punto solo da la dirección dominante y el largo (también dentro de una familia).
    const ortogonal = ejeOrtogonal(origen, destino);
    const restriccion = restringirEje(origen, ortogonal.fin, get().referencias.ejes, libre);
    const forzado = restriccion ? null : ortogonal;
    const inicio = restriccion?.inicio ?? origen;
    const fin = restriccion?.fin ?? forzado!.fin;
    if (Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]) < 0.01) {
      set({ aviso: "El eje necesita dos puntos distintos." });
      return false;
    }
    const vertical = restriccion?.vertical ?? forzado!.vertical;
    // La etiqueta depende de la orientación del eje (números o letras), no de la
    // etiqueta que se mostrara para el eje anterior.
    const etiqueta = siguienteEtiquetaEje(get().referencias.ejes, vertical);
    const ok = await ejecutar("ejes.crear", {
      etiqueta,
      x1: inicio[0],
      y1: inicio[1],
      x2: fin[0],
      y2: fin[1],
    });
    if (ok) {
      const siguiente = siguienteEtiquetaEje(get().referencias.ejes, vertical);
      set({
        puntosHerramienta: [],
        etiquetaEje: siguiente,
        ejeLibre: false,
        ...limpiarTrazoExtra(),
        aviso: `Eje «${etiqueta}» creado. Siguiente: ${siguiente}.`,
      });
      bitacoraHerramienta("eje", "terminar", { x: fin[0], y: fin[1] });
    }
    return ok;
  };

  const moverSeleccion = async (origen: Punto2, destino: Punto2): Promise<boolean> => {
    const herramienta = get().herramienta;
    if (herramienta !== "mover" && herramienta !== "copiar") return false;
    if (get().seleccionados.length === 0) {
      set({ aviso: "Seleccione uno o varios elementos antes de mover o copiar." });
      return false;
    }
    const metodo = herramienta === "mover" ? "elementos.mover" : "elementos.copiar";
    const ok = await ejecutar(metodo, {
      globalids: get().seleccionados,
      dx: destino[0] - origen[0],
      dy: destino[1] - origen[1],
      dz: 0,
    });
    if (ok) {
      set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
      bitacoraHerramienta(herramienta, "terminar", { x: destino[0], y: destino[1] });
    }
    return ok;
  };

  return {
    ruta: null,
    nombreArchivo: "",
    esquema: "",
    conCambios: false,
    totalElementos: 0,
    conteos: {},
    niveles: [],
    elementos: [],
    mallas: [],
    caja: CAJA_VACIA,
    vistas: [],
    estilos: estilosPorDefecto(),
    aberturas: [],
    arbol: null,
    arbolObra: null,
    arbolObraActivo: false,
    fijarArbolObraActivo: (activo) => {
      if (get().arbolObraActivo === activo) return;
      set({ arbolObraActivo: activo, ...(activo ? {} : { arbolObra: null }) });
      if (activo) {
        void rpc<ArbolObra>("modelo.arbol_obra")
          .then((arbolObra) => {
            if (get().arbolObraActivo) set({ arbolObra });
          })
          .catch(() => undefined);
      }
    },
    ajustarToken: 0,
    vistaActivaId: null,
    ejeSeleccionado: null,
    nivelSeleccionado: null,
    seleccion: null,
    seleccionados: [],
    propiedades: null,
    cargando: false,
    error: null,
    aviso: null,
    pistaTab: null,
    modoCorte: false,
    puntoCorte: null,
    preguntaGuardar: null,
    tiempoCargaMs: null,
    vistasPersistidas: false,
    dialogoEstilos: false,
    dialogoCotas: false,
    dialogoAnotacion: false,
  editorTipos: false,
  editorTipoInicial: null,
    herramienta: null,
    referenciaAlinear: null,
    alineando: null,
    modoRecorte: "esquina",
    referenciaRecorte: null,
    recorteInicial: null,
    vistaPreviaRecorte: null,
    opcionesMuro: {
      tipo: "",
      altura: 2.6,
      alineacion: "centro",
      lineaUbicacion: "eje_nucleo",
      desfaseUbicacion: 0,
    },
    opcionesLosa: { lado: "exterior", desfase: 0 },
    opcionesCerramiento: { nivel: "", desfase: "" },
    opcionesNivel: { nombre: "", nombreAutomatico: true, crearPlanta: true, elevacionTexto: "" },
    opcionesEspejo: { copiar: true },
    opcionesMatriz: { modo: "lineal", numero: 3, alUltimo: false, angulo: 360 },
    cotasNivel: null,
    tiposMuro: [],
    tiposHerramienta: [],
    tipoHerramienta: {},
    rotacionSiguiente: 0,
    columnaConZapata: false,
    tipoZapata: "",
    dialogoCastillos: false,
    preguntaZapata: null,
    referencias: REFERENCIAS_VACIAS,
    puntosHerramienta: [],
    ratonHerramienta: null,
    engancheHerramienta: null,
    longitudTecleada: "",
    ejeLibre: false,
    voltearSiguiente: false,
    etiquetaEje: "",
    cotasMoverSiguientes: true,

    fijarCotasMoverSiguientes: (valor) => set({ cotasMoverSiguientes: valor }),

    nuevo: async () => {
      if (!(await get().asegurarSinCambios())) return false;
      try {
        set({ cargando: true, error: null });
        const info = await rpc<RespuestaInfo>("proyecto.nuevo", {
          nombre: "Modelo sin título",
        });
        await cargar(info);
        return true;
      } catch (e) {
        set({
          cargando: false,
          error: e instanceof Error ? e.message : String(e),
        });
        return false;
      }
    },

    abrir: async (rutaElegida) => {
      if (!(await get().asegurarSinCambios())) return false;
      const ruta = rutaElegida ?? (await elegirIfcParaAbrir());
      if (!ruta) return false;
      try {
        set({ cargando: true, error: null, aviso: null });
        const info = await rpc<RespuestaInfo>("proyecto.abrir", { ruta });
        await cargar(info);
        if (info.migracion) {
          agregarEvento("aviso", { texto: info.migracion, origen: "migracion" });
        }
        return true;
      } catch (e) {
        set({
          cargando: false,
          error: e instanceof Error ? e.message : String(e),
          aviso: `Núcleo IFC no disponible: ${
            e instanceof Error ? e.message : String(e)
          }`,
        });
        return false;
      }
    },

    guardar: async () => guardarEn(null, false),

    guardarComo: async (rutaElegida) => {
      const ruta =
        rutaElegida ??
        (await elegirDestinoIfc(get().nombreArchivo.replace(/\.ifc$/i, "") || "Modelo"));
      if (!ruta) return false;
      return guardarEn(ruta, true);
    },

    preguntarGuardar: () =>
      new Promise<RespuestaGuardar>((resolver) => {
        set({ preguntaGuardar: { nombre: get().nombreArchivo, resolver } });
      }),

    responderGuardar: (respuesta) => {
      const pregunta = get().preguntaGuardar;
      set({ preguntaGuardar: null });
      pregunta?.resolver(respuesta);
    },

    asegurarSinCambios: async () => {
      if (!get().conCambios) return true;
      const respuesta = await get().preguntarGuardar();
      if (respuesta === "cancelar") return false;
      if (respuesta === "guardar") return get().guardar();
      return true;
    },

    fijarVista: (id) => {
      const vista = get().vistas.find((v) => v.id === id);
      const opciones = get().opcionesCerramiento;
      // O043: la elección de nivel de cerramiento solo manda en planta; al pasar
      // a alzado, corte o 3D vuelve la regla de O041 (tope del muro).
      const limpiarNivel =
        vista !== undefined && vista.tipo !== "planta" && opciones.nivel !== "";
      set({
        vistaActivaId: id,
        modoCorte: false,
        puntoCorte: null,
        ejeSeleccionado: null,
        nivelSeleccionado: null,
        ...(limpiarNivel ? { opcionesCerramiento: { ...opciones, nivel: "" } } : {}),
      });
    },

    fijarEjeSeleccionado: (globalid) => {
      set({ ejeSeleccionado: globalid });
    },

    fijarNivelSeleccionado: (globalid) => {
      set({ nivelSeleccionado: globalid });
    },

    actualizarVista: async (id, cambios) => {
      const vistas = get().vistas.map((v) => (v.id === id ? { ...v, ...cambios, id } : v));
      set({ vistas, conCambios: true });
      await persistirVistas(vistas);
    },

    duplicarVista: async (id) => {
      const estado = get();
      const original = estado.vistas.find((v) => v.id === id);
      if (!original) return null;
      const base = `${original.nombre} (copia)`;
      const nombres = new Set(estado.vistas.map((v) => v.nombre));
      let nombre = base;
      let n = 2;
      while (nombres.has(nombre)) {
        nombre = `${base} ${n}`;
        n += 1;
      }
      let nuevoId = `vista-${Date.now().toString(36)}`;
      while (estado.vistas.some((v) => v.id === nuevoId)) nuevoId += "-c";
      const copia: Vista = {
        ...original,
        id: nuevoId,
        nombre,
        categorias: { ...original.categorias },
        nivelesVisibles: [...original.nivelesVisibles],
        estilos: original.estilos ? { ...original.estilos } : undefined,
        ejes: original.ejes ? { ...original.ejes } : undefined,
        nivelesAjuste: original.nivelesAjuste ? { ...original.nivelesAjuste } : undefined,
      };
      const indice = estado.vistas.findIndex((v) => v.id === id);
      const vistas = [...estado.vistas];
      vistas.splice(indice + 1, 0, copia);
      set({ vistas, vistaActivaId: nuevoId, conCambios: true, modoCorte: false, puntoCorte: null });
      await persistirVistas(vistas);
      return nuevoId;
    },

    eliminarVista: async (id) => {
      const estado = get();
      const vista = estado.vistas.find((v) => v.id === id);
      if (!vista) return false;
      const delMismoTipo = estado.vistas.filter((v) => v.tipo === vista.tipo);
      if (delMismoTipo.length <= 1) return false;
      // O037: la última planta de un nivel es el nivel. Eliminarla borra el nivel
      // (si el núcleo lo rechaza, por elementos o restricciones, no se toca nada).
      if (
        vista.nivel &&
        plantaUnicaDeNivel(estado.vistas, vista) &&
        estado.niveles.some((n) => n.globalid === vista.nivel)
      ) {
        await get().borrarNivel(vista.nivel);
        return !get().vistas.some((v) => v.id === id);
      }
      const vistas = estado.vistas.filter((v) => v.id !== id);
      const activa = estado.vistaActivaId === id ? (vistas[0]?.id ?? null) : estado.vistaActivaId;
      set({ vistas, vistaActivaId: activa, conCambios: true, modoCorte: false, puntoCorte: null });
      await persistirVistas(vistas);
      return true;
    },

    fijarAjustesEjes: async (vistaId, cambios) => {
      const vista = get().vistas.find((v) => v.id === vistaId);
      if (!vista) return;
      const ejes = { ...(vista.ejes ?? {}) };
      for (const [globalid, ajuste] of Object.entries(cambios)) {
        // La misma validación que al leer el pset: máximo 2 codos y puntos finitos.
        const limpio = normalizarAjusteEje(ajuste);
        if (!limpio) delete ejes[globalid];
        else ejes[globalid] = limpio;
      }
      const vistas = get().vistas.map((v) =>
        v.id === vistaId
          ? { ...v, id: v.id, ejes: Object.keys(ejes).length > 0 ? ejes : undefined }
          : v,
      );
      set({ vistas, conCambios: true });
      // Una sola escritura del pset = una sola entrada de deshacer por arrastre.
      await persistirVistas(vistas);
    },

    fijarAjustesNiveles: async (vistaId, cambios) => {
      const vista = get().vistas.find((v) => v.id === vistaId);
      if (!vista) return;
      const nivelesAjuste = { ...(vista.nivelesAjuste ?? {}) };
      for (const [globalid, ajuste] of Object.entries(cambios)) {
        // Misma validación que al leer el pset: solo desplazamientos finitos.
        const limpio = normalizarAjusteNivel(ajuste);
        if (!limpio) delete nivelesAjuste[globalid];
        else nivelesAjuste[globalid] = limpio;
      }
      const vistas = get().vistas.map((v) =>
        v.id === vistaId
          ? {
              ...v,
              id: v.id,
              nivelesAjuste:
                Object.keys(nivelesAjuste).length > 0 ? nivelesAjuste : undefined,
            }
          : v,
      );
      set({ vistas, conCambios: true });
      // Una sola escritura del pset = una sola entrada de deshacer por arrastre.
      await persistirVistas(vistas);
    },

    guardarEstilos: async (estilos) => {
      try {
        await persistirEstilos(estilos);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    abrirDialogoEstilos: () => set({ dialogoEstilos: true }),
    cerrarDialogoEstilos: () => set({ dialogoEstilos: false }),
    abrirDialogoAnotacion: () => set({ dialogoAnotacion: true }),
    cerrarDialogoAnotacion: () => set({ dialogoAnotacion: false }),
    abrirDialogoCotas: () => set({ dialogoCotas: true }),
    cerrarDialogoCotas: () => set({ dialogoCotas: false }),

    // O007a: el editor de tipos sustituye el área de trabajo mientras está abierto.
    abrirEditorTipos: (tipoGlobalid = null) =>
      set({ editorTipos: true, editorTipoInicial: tipoGlobalid }),
    cerrarEditorTipos: () => set({ editorTipos: false, editorTipoInicial: null }),
    aplicarTipoEdicion: async (globalid, datos) => {
      const ok = await ejecutar("tipos.editar", { globalid, datos });
      if (ok) {
        await get().recargarTipos();
        const seleccion = get().seleccion;
        if (seleccion) await get().seleccionar(seleccion);
        set({ editorTipos: false, editorTipoInicial: null });
      }
      return ok;
    },
    recargarTipos: async () => {
      try {
        const [tipos, estructura] = await Promise.all([
          rpc<Array<{ globalid: string; nombre: string; espesor: number }>>(
            "tipos.listar",
            { clase: "IfcWallType" },
          ),
          cargarTiposEstructura(),
        ]);
        set({ tiposMuro: tipos, tiposHerramienta: estructura });
        const actual = get().opcionesMuro;
        if (!tipos.some((t) => t.nombre === actual.tipo) && tipos[0]) {
          set({ opcionesMuro: { ...actual, tipo: tipos[0].nombre } });
        }
        const elegidos = { ...get().tipoHerramienta };
        for (const herramienta of HERRAMIENTAS_ESTRUCTURA) {
          const tipo = tipoDeHerramienta(herramienta, estructura, elegidos);
          if (tipo) elegidos[herramienta] = tipo.nombre;
        }
        set({ tipoHerramienta: elegidos });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    seleccionar: async (globalid, agregar = false) => {
      const token = ++tokenSeleccion;
      if (!globalid) {
        set({ seleccion: null, seleccionados: [], propiedades: null });
        return;
      }
      set({ ejeSeleccionado: null });
      let seleccionados = get().seleccionados;
      if (agregar) {
        seleccionados = seleccionados.includes(globalid)
          ? seleccionados.filter((g) => g !== globalid)
          : [...seleccionados, globalid];
      } else {
        seleccionados = [globalid];
      }
      const elegido = seleccionados[seleccionados.length - 1] ?? null;
      if (!elegido) {
        set({ seleccion: null, seleccionados: [], propiedades: null });
        return;
      }
      set({ seleccion: elegido, seleccionados });
      try {
        const propiedades = await rpc<PropiedadesElemento>("modelo.propiedades", {
          globalid: elegido,
        });
        if (token === tokenSeleccion) set({ propiedades, error: null });
      } catch (e) {
        if (token === tokenSeleccion) {
          set({ propiedades: null, error: e instanceof Error ? e.message : String(e) });
        }
      }
    },

    seleccionarVarios: async (globalids) => {
      const token = ++tokenSeleccion;
      if (globalids.length === 0) {
        set({ seleccion: null, seleccionados: [], propiedades: null });
        return;
      }
      const elegido = globalids[globalids.length - 1] ?? null;
      set({ ejeSeleccionado: null, seleccion: elegido, seleccionados: [...globalids] });
      if (!elegido) return;
      try {
        const propiedades = await rpc<PropiedadesElemento>("modelo.propiedades", {
          globalid: elegido,
        });
        if (token === tokenSeleccion) set({ propiedades, error: null });
      } catch (e) {
        if (token === tokenSeleccion) {
          set({ propiedades: null, error: e instanceof Error ? e.message : String(e) });
        }
      }
    },

    alternarNodoArbol: async (clave, tipo) => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista) return;
      const campo = tipo === "oculto" ? "arbolOcultos" : "arbolBloqueados";
      const actual = vista[campo] ?? [];
      const siguiente = actual.includes(clave)
        ? actual.filter((c) => c !== clave)
        : [...actual, clave];
      const vistas = get().vistas.map((v) =>
        v.id === vista.id
          ? { ...v, [campo]: siguiente.length > 0 ? siguiente : undefined }
          : v,
      );
      set({ vistas, conCambios: true });
      await persistirVistas(vistas);
    },

    aislarNodoArbol: async (clave) => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista) return;
      const ocultos = clavesParaAislar(get().arbol, clave);
      const vistas = get().vistas.map((v) =>
        v.id === vista.id
          ? { ...v, arbolOcultos: ocultos.length > 0 ? ocultos : undefined }
          : v,
      );
      set({ vistas, conCambios: true });
      await persistirVistas(vistas);
    },

    mostrarTodoArbol: async () => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista) return;
      const vistas = get().vistas.map((v) =>
        v.id === vista.id ? { ...v, arbolOcultos: undefined } : v,
      );
      set({ vistas, conCambios: true });
      await persistirVistas(vistas);
    },

    moverPartidaObra: async (partida, capitulo) => {
      await ejecutar("obra.partida_mover", {
        clave: partida.clave_pp,
        nombre: partida.nombre,
        unidad: partida.unidad,
        capitulo,
      });
    },

    crearCapituloObra: async (nombre) => {
      await ejecutar("obra.capitulo_crear", { nombre });
    },

    renombrarCapituloObra: async (identificacion, nombre) => {
      await ejecutar("obra.capitulo_renombrar", { identificacion, nombre });
    },

    moverCapituloObra: async (identificacion, direccion) => {
      await ejecutar("obra.capitulo_mover", { identificacion, direccion });
    },

    borrarCapituloObra: async (identificacion) => {
      await ejecutar("obra.capitulo_borrar", { identificacion });
    },

    pedirAjustar: () => set({ ajustarToken: get().ajustarToken + 1 }),

    iniciarCorte: () => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista || vista.tipo !== "planta") {
        set({ aviso: "Para crear un corte, abra primero una planta." });
        return;
      }
      set({
        modoCorte: true,
        puntoCorte: null,
        aviso: "Nueva vista de corte: haga dos clics en la planta.",
      });
    },

    cancelarCorte: () => {
      set({ modoCorte: false, puntoCorte: null, aviso: null });
    },

    anadirPuntoCorte: async (punto) => {
      const primero = get().puntoCorte;
      if (!primero) {
        set({ puntoCorte: punto, aviso: "Primer punto del corte: haga el segundo clic." });
        return;
      }
      if (Math.hypot(punto[0] - primero[0], punto[1] - primero[1]) < 1e-3) {
        set({ aviso: "Los dos puntos del corte no pueden coincidir." });
        return;
      }
      const estado = get();
      const planta = estado.vistas.find((v) => v.id === estado.vistaActivaId);
      if (!planta) return;
      const corte = crearVistaCorte({
        puntoA: primero,
        puntoB: punto,
        alturaPlano: planta.alturaPlano ?? 1.2,
        nivel: planta.nivel,
        nivelesVisibles: planta.nivelesVisibles,
        categorias: planta.categorias ?? CATEGORIAS_TODAS(),
        estilo: planta.estilo,
        escala: planta.escala,
        indice: numeroDeCorte(estado.vistas),
      });
      const vistas = [...estado.vistas, corte];
      set({
        vistas,
        vistaActivaId: corte.id,
        modoCorte: false,
        puntoCorte: null,
        conCambios: true,
        aviso: `Corte creado: ${corte.nombre}.`,
        seleccion: null,
        propiedades: null,
      });
      await persistirVistas(vistas);
    },

    limpiarAviso: () => set({ aviso: null }),

    fijarAviso: (texto) => set({ aviso: texto }),
    fijarPistaTab: (texto) => set({ pistaTab: texto }),

    activarHerramienta: (herramienta) => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (herramienta === "nivel") {
        if (!vista || (vista.tipo !== "alzado" && vista.tipo !== "corte")) {
          set({ aviso: "Abre un alzado o corte" });
          return;
        }
      } else if (
        !vista ||
        (vista.tipo !== "planta" &&
          herramienta !== "alinear" &&
          !(
            (herramienta === "mover" || herramienta === "copiar") &&
            (vista.tipo === "alzado" || vista.tipo === "corte")
          ))
      ) {
        set({ aviso: "Las herramientas de modelado solo trabajan en una vista de planta." });
        return;
      }
      if (get().herramienta === herramienta) {
        get().cancelarHerramienta();
        return;
      }
      const nombres: Record<Herramienta, string> = {
        muro: "Muro: primer punto en la planta.",
        losa: "Losa: clic por vértice y doble clic para cerrar.",
        puerta: "Puerta: clic sobre un muro. Espacio voltea el lado.",
        ventana: "Ventana: clic sobre un muro. Espacio voltea el lado.",
        eje: "Eje: dos clics. La etiqueta se asigna sola.",
        mover: "Mover: punto base y punto destino.",
        copiar: "Copiar: punto base y punto destino.",
        zapata: "Zapata: un clic en un cruce de ejes. R gira 90°.",
        zapata_corrida: "Zapata corrida: dos clics a lo largo del trazo.",
        contratrabe: "Contratrabe: dos clics entre zapatas.",
        columna: "Columna: un clic en un cruce de ejes. R gira 90°.",
        castillo: "Castillo: clic sobre un muro o en un cruce de ejes. R gira 90°.",
        trabe: "Trabe: dos clics entre columnas.",
        cerramiento: "Cerramiento: primer punto en la planta.",
        dala: "Dala de desplante: clic sobre un muro.",
        alinear: "Alinear: clic en la referencia (eje, nivel o cara) y luego en la cara del elemento.",
        nivel: "Nivel: dos clics horizontales; la elevación se engancha o se teclea.",
        recortar_extender: "Recortar/Extender: haga clic en el primer elemento.",
        espejo: "Espejo: clic en un eje o en un elemento lineal; o dos puntos del eje.",
        matriz: "Matriz: lineal con dos puntos o polar con un clic en el centro.",
      };
      const conservarSeleccion =
        herramienta === "mover" ||
        herramienta === "copiar" ||
        herramienta === "losa" ||
        herramienta === "espejo" ||
        herramienta === "matriz";
      set({
        herramienta,
        referenciaAlinear: null,
        alineando: null,
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        ejeLibre: false,
        modoCorte: false,
        puntoCorte: null,
        cotasNivel: null,
        ...(conservarSeleccion
          ? {}
          : { seleccion: null, seleccionados: [], propiedades: null }),
        aviso: nombres[herramienta],
      });
      bitacoraHerramienta(herramienta, "activar");
    },

    cancelarHerramienta: () => {
      const herramienta = get().herramienta;
      set({
        herramienta: null,
        nivelSeleccionado: null,
        referenciaAlinear: null,
        alineando: null,
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        ejeLibre: false,
        etiquetaEje: "",
        opcionesNivel: { ...get().opcionesNivel, elevacionTexto: "" },
        cotasNivel: null,
        aviso: null,
      });
      if (herramienta) bitacoraHerramienta(herramienta, "cancelar");
    },

    elegirReferenciaAlinear: (referencia) => {
      set({
        referenciaAlinear: referencia,
        alineando: null,
        puntosHerramienta: [],
        aviso:
          "Alinear: ahora haga clic en la cara del elemento que quiere mover " +
          "(Ctrl mantiene la referencia para alinear varios; Esc termina).",
      });
      bitacoraHerramienta("alinear", "referencia");
    },

    aplicarAlinear: async (elemento, cara, punto) => {
      const referencia = get().referenciaAlinear;
      if (!referencia) return;
      const resultado = await ejecutarResultado("restricciones.alinear", {
        referencia,
        elemento,
        cara,
        bloquear: false,
      });
      if (!resultado) return;
      const datos = resultado.alineacion as Omit<AlineacionActiva, "punto"> | undefined;
      if (!datos) return;
      await get().seleccionar(elemento);
      set({
        alineando: { ...datos, punto },
        aviso:
          (resultado.mensaje || "Elemento alineado.") +
          " El candado está abierto: ciérrelo para guardar la restricción.",
      });
      bitacoraHerramienta("alinear", "terminar");
    },

    alternarCandadoAlinear: async () => {
      const alineacion = get().alineando;
      if (!alineacion) return;
      const bloquear = !alineacion.bloqueada;
      const resultado = await ejecutarResultado("restricciones.alinear", {
        referencia: { tipo: alineacion.tipo, globalid: alineacion.referencia },
        elemento: alineacion.elemento,
        cara: alineacion.cara,
        bloquear,
      });
      if (!resultado) return;
      set({
        alineando: { ...alineacion, bloqueada: bloquear },
        aviso: bloquear
          ? "Candado cerrado: el elemento seguirá a su referencia."
          : "Candado abierto: la restricción se ha quitado.",
      });
      bitacoraHerramienta("alinear", bloquear ? "bloquear" : "desbloquear");
    },

    fijarModoRecorte: (modo) => {
      const avisos: Record<ModoRecorte, string> = {
        esquina: "A esquina: haga clic en dos elementos lineales.",
        elemento: "Un elemento: clic en la referencia (elemento o eje) y luego en el elemento.",
        varios: "Varios elementos: clic en la referencia y luego en cada elemento. Enter o Esc termina.",
      };
      set({
        modoRecorte: modo,
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        aviso: avisos[modo],
      });
    },

    clicRecorte: async (objetivo) => {
      const { tipo, globalid, punto } = objetivo;
      const modo = get().modoRecorte;
      if (tipo === "eje") {
        if (modo === "esquina") {
          set({ aviso: "A esquina: haga clic en dos elementos lineales." });
          return;
        }
        const linea = lineaDeEje(globalid);
        if (!linea) return;
        set({
          referenciaRecorte: { tipo: "eje", globalid, linea },
          vistaPreviaRecorte: null,
          aviso:
            modo === "varios"
              ? "Varios elementos: clic en cada elemento a ajustar. Enter o Esc termina."
              : "Un elemento: clic en el elemento a recortar o extender.",
        });
        bitacoraHerramienta("recortar_extender", "referencia");
        return;
      }
      const linea = lineaDeElemento(globalid);
      if (!linea) {
        set({
          aviso:
            "Solo se recortan o extienden muros, contratrabes, trabes, dalas, " +
            "cerramientos y zapatas corridas.",
        });
        return;
      }
      if (modo === "esquina") {
        const inicial = get().recorteInicial;
        if (!inicial) {
          set({
            recorteInicial: { tipo: "elemento", globalid, linea, punto },
            vistaPreviaRecorte: null,
            aviso: "A esquina: clic en el segundo elemento.",
          });
          bitacoraHerramienta("recortar_extender", "punto", { x: punto[0], y: punto[1] });
          return;
        }
        if (inicial.globalid === globalid) {
          set({ aviso: "Elija otro elemento para formar la esquina." });
          return;
        }
        const resultado = await ejecutarResultado("elementos.recortar_esquina", {
          globalid_a: inicial.globalid,
          globalid_b: globalid,
          punto_a: inicial.punto,
          punto_b: punto,
        });
        if (!resultado) return;
        set({ recorteInicial: null, vistaPreviaRecorte: null });
        bitacoraHerramienta("recortar_extender", "terminar");
        return;
      }
      const referencia = get().referenciaRecorte;
      if (!referencia) {
        set({
          referenciaRecorte: { tipo: "elemento", globalid, linea },
          vistaPreviaRecorte: null,
          aviso:
            modo === "varios"
              ? "Varios elementos: clic en cada elemento a ajustar. Enter o Esc termina."
              : "Un elemento: clic en el elemento a recortar o extender.",
        });
        bitacoraHerramienta("recortar_extender", "referencia");
        return;
      }
      if (referencia.globalid === globalid) {
        set({ aviso: "Elija un elemento distinto de la referencia." });
        return;
      }
      const resultado = await ejecutarResultado("elementos.recortar_extender", {
        globalid,
        referencia: referencia.globalid,
        punto_conservar: punto,
      });
      if (!resultado) return;
      set({
        vistaPreviaRecorte: null,
        ...(modo === "elemento" ? { referenciaRecorte: null } : {}),
      });
      bitacoraHerramienta("recortar_extender", "terminar");
    },

    previsualizarRecorte: (globalid, punto) => {
      if (get().herramienta !== "recortar_extender") return;
      const previa = get().vistaPreviaRecorte;
      const linea = lineaDeElemento(globalid);
      const referencia =
        get().modoRecorte === "esquina"
          ? get().recorteInicial?.linea
          : get().referenciaRecorte?.linea;
      if (!linea || !referencia) {
        if (previa) set({ vistaPreviaRecorte: null });
        return;
      }
      const corte = cortarRectas(
        [linea.x1, linea.y1, linea.x2, linea.y2],
        [referencia.x1, referencia.y1, referencia.x2, referencia.y2],
      );
      if (!corte) {
        if (previa) set({ vistaPreviaRecorte: null });
        return;
      }
      const nuevo = recortarRecta(
        [linea.x1, linea.y1, linea.x2, linea.y2],
        corte.punto,
        punto,
      );
      if (!nuevo) {
        if (previa) set({ vistaPreviaRecorte: null });
        return;
      }
      if (
        previa &&
        previa.globalid === globalid &&
        Math.abs(previa.x1 - nuevo.x1) < 1e-9 &&
        Math.abs(previa.y1 - nuevo.y1) < 1e-9 &&
        Math.abs(previa.x2 - nuevo.x2) < 1e-9 &&
        Math.abs(previa.y2 - nuevo.y2) < 1e-9
      ) {
        return;
      }
      set({
        vistaPreviaRecorte: {
          globalid,
          x1: nuevo.x1,
          y1: nuevo.y1,
          x2: nuevo.x2,
          y2: nuevo.y2,
        },
      });
    },

    terminarRecorteExtender: () => {
      if (get().herramienta !== "recortar_extender") return;
      set({
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        aviso: "Recortar/Extender: haga clic en la referencia.",
      });
      bitacoraHerramienta("recortar_extender", "terminar");
    },

    cancelarTrazo: () => {
      const herramienta = get().herramienta;
      if (!herramienta) return false;
      if (get().puntosHerramienta.length === 0 && !get().longitudTecleada) {
        return false;
      }
      set({
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        ejeLibre: false,
        etiquetaEje: "",
        opcionesNivel: { ...get().opcionesNivel, elevacionTexto: "" },
        cotasNivel: null,
      });
      bitacoraHerramienta(herramienta, "cancelar_trazo");
      return true;
    },

    fijarOpcionesMuro: (cambios) =>
      set({ opcionesMuro: { ...get().opcionesMuro, ...cambios } }),
    fijarOpcionesLosa: (cambios) =>
      set({ opcionesLosa: { ...get().opcionesLosa, ...cambios } }),
    fijarOpcionesEspejo: (cambios) =>
      set({ opcionesEspejo: { ...get().opcionesEspejo, ...cambios } }),
    fijarOpcionesMatriz: (cambios) =>
      set({ opcionesMatriz: { ...get().opcionesMatriz, ...cambios } }),
    fijarOpcionesCerramiento: (cambios) =>
      set({ opcionesCerramiento: { ...get().opcionesCerramiento, ...cambios } }),
    voltearMuro: async (globalid) => {
      const ok = await ejecutar("muros.voltear", { globalid });
      if (ok) await get().seleccionar(globalid);
    },

    fijarTipoHerramienta: (herramienta, nombre) =>
      set({ tipoHerramienta: { ...get().tipoHerramienta, [herramienta]: nombre } }),

    fijarColumnaConZapata: (valor) => set({ columnaConZapata: valor }),
    fijarTipoZapata: (nombre) => set({ tipoZapata: nombre }),
    abrirDialogoCastillos: () => set({ dialogoCastillos: true }),
    cerrarDialogoCastillos: () => set({ dialogoCastillos: false }),
    preguntarZapata: () =>
      new Promise<boolean>((resolver) => set({ preguntaZapata: { resolver } })),
    responderZapata: (ok) => {
      const pregunta = get().preguntaZapata;
      set({ preguntaZapata: null });
      pregunta?.resolver(ok);
    },

    girar90: () =>
      set({ rotacionSiguiente: (get().rotacionSiguiente + 90) % 360 }),

    fijarEtiquetaEje: (etiqueta) => set({ etiquetaEje: etiqueta }),

    fijarOpcionesNivel: (cambios) => {
      const estado = get();
      const siguiente: OpcionesNivel = {
        ...estado.opcionesNivel,
        ...cambios,
        ...(cambios.nombre !== undefined ? { nombreAutomatico: false } : {}),
      };
      // O029: al escribir la elevación, el nombre automático y las cotas salen de
      // esa elevación real, no de la última posición del cursor.
      if (cambios.elevacionTexto !== undefined) {
        const referencia =
          estado.puntosHerramienta[estado.puntosHerramienta.length - 1]?.[1] ??
          estado.ratonHerramienta?.[1] ??
          estado.niveles[0]?.elevacion ??
          0;
        const cotas = cotasTemporalesNivel(referencia, estado.niveles);
        const z = elevacionDesdeCota(cotas.inferior, cambios.elevacionTexto);
        if (z !== null) {
          const cotasNuevas = cotasTemporalesNivel(z, estado.niveles);
          if (siguiente.nombreAutomatico) {
            siguiente.nombre = nombreNivelAutomatico(estado.niveles, z);
          }
          set({ opcionesNivel: siguiente, cotasNivel: {
            inferior: cotasNuevas.inferior,
            superior: cotasNuevas.superior,
          } });
          return;
        }
      }
      set({ opcionesNivel: siguiente });
    },

    clicNivel: async (punto) => {
      const herramienta = get().herramienta;
      if (herramienta !== "nivel") return;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista || (vista.tipo !== "alzado" && vista.tipo !== "corte")) {
        set({ aviso: "Abre un alzado o corte" });
        return;
      }
      const z = engancheElevacionNivel(punto[1], candidatosElevacionNivel());
      const p: Punto2 = [punto[0], z];
      bitacoraHerramienta("nivel", "punto", { x: p[0], y: p[1] });
      const puntos = get().puntosHerramienta;
      if (puntos.length === 0) {
        const cotas = cotasTemporalesNivel(z, get().niveles);
        const nombre = get().opcionesNivel.nombreAutomatico
          ? nombreNivelAutomatico(get().niveles, z)
          : get().opcionesNivel.nombre;
        set({
          puntosHerramienta: [p],
          ratonHerramienta: p,
          engancheHerramienta: { punto: p, tipo: "cuadricula" },
          cotasNivel: { inferior: cotas.inferior, superior: cotas.superior },
          opcionesNivel: { ...get().opcionesNivel, nombre },
          aviso: "Nivel: segundo clic, o escriba la cota y Enter.",
        });
        return;
      }
      await crearNivelDesdeHerramienta(p);
    },

    fijarRatonHerramienta: (punto, shift = false, metrosPorPixel) => {
      const herramienta = get().herramienta;
      if (!herramienta || !punto) {
        set({ ratonHerramienta: null, engancheHerramienta: null });
        return;
      }
      const puntos = get().puntosHerramienta;
      if (herramienta === "nivel") {
        const z = engancheElevacionNivel(punto[1], candidatosElevacionNivel());
        const p: Punto2 = [punto[0], z];
        const cotas = cotasTemporalesNivel(z, get().niveles);
        const opciones = get().opcionesNivel;
        set({
          ratonHerramienta: p,
          engancheHerramienta: { punto: p, tipo: "cuadricula" },
          cotasNivel: { inferior: cotas.inferior, superior: cotas.superior },
          opcionesNivel: opciones.nombreAutomatico
            ? { ...opciones, nombre: nombreNivelAutomatico(get().niveles, z) }
            : opciones,
        });
        return;
      }
      if (herramienta === "puerta" || herramienta === "ventana") {
        set({ ratonHerramienta: punto, engancheHerramienta: null });
        return;
      }
      const enganche = puntoDibujo(
        punto,
        get().referencias,
        puntos.length > 0 ? puntos[puntos.length - 1] : null,
        // O036b: el eje no se ajusta a 15°; su dirección la decide la dominante.
        herramienta === "eje" ? true : shift,
        metrosPorPixel,
      );
      set({ ratonHerramienta: enganche.punto, engancheHerramienta: enganche });
    },

    teclearLongitud: (tecla) => {
      const herramienta = get().herramienta;
      if (!herramienta || herramienta === "puerta" || herramienta === "ventana") return;
      // O029: con un nivel seleccionado en el alzado, Copiar/Mover acepta el
      // desfase vertical tecleado sin pedir puntos en planta.
      if (
        (herramienta === "copiar" || herramienta === "mover") &&
        get().nivelSeleccionado &&
        get().seleccionados.length === 0
      ) {
        const campo = get().longitudTecleada;
        let siguiente = campo;
        if (tecla === "Backspace") siguiente = campo.slice(0, -1);
        else if ((tecla === "," || tecla === ".") && !campo.includes(".")) {
          siguiente = `${campo || "0"}.`;
        } else if (tecla === "-" && campo === "") siguiente = "-";
        else if (/^\d$/.test(tecla)) {
          siguiente = `${campo}${tecla}`.replace(/^(-?)0(?=\d)/, "$1");
        }
        set({ longitudTecleada: siguiente });
        return;
      }
      if (get().puntosHerramienta.length === 0) return;
      if (herramienta === "nivel") {
        // O029: la cota temporal se teclea relativa al nivel inferior.
        const campo = get().opcionesNivel.elevacionTexto;
        let siguiente = campo;
        if (tecla === "Backspace") siguiente = campo.slice(0, -1);
        else if (tecla === "," || tecla === ".") {
          if (!campo.includes(".")) siguiente = `${campo || "0"}.`;
        } else if (/^\d$/.test(tecla)) {
          siguiente = `${campo}${tecla}`.replace(/^0(?=\d)/, "");
        }
        set({
          opcionesNivel: { ...get().opcionesNivel, elevacionTexto: siguiente },
          longitudTecleada: siguiente,
        });
        return;
      }
      if (tecla === "Backspace") {
        set({ longitudTecleada: get().longitudTecleada.slice(0, -1) });
        return;
      }
      if (tecla === "," || tecla === ".") {
        if (!get().longitudTecleada.includes(".")) {
          set({ longitudTecleada: `${get().longitudTecleada || "0"}.` });
        }
        return;
      }
      if (/^\d$/.test(tecla)) {
        set({ longitudTecleada: `${get().longitudTecleada}${tecla}`.replace(/^0(?=\d)/, "") });
      }
    },

    confirmarLongitud: async (shift = false) => {
      const herramienta = get().herramienta;
      const puntos = get().puntosHerramienta;
      // O029: nivel seleccionado en el alzado + Copiar/Mover + desfase tecleado.
      if (
        (herramienta === "copiar" || herramienta === "mover") &&
        get().nivelSeleccionado &&
        get().seleccionados.length === 0
      ) {
        const texto = get().longitudTecleada.replace(",", ".");
        const desfase = Number(texto);
        const nivel = get().niveles.find((n) => n.globalid === get().nivelSeleccionado);
        if (!nivel) {
          set({ aviso: "Elija el nivel que se copia." });
          return;
        }
        if (texto === "" || !Number.isFinite(desfase) || Math.abs(desfase) <= 0.001) {
          set({ aviso: "Escriba un desfase distinto de cero y Enter." });
          return;
        }
        const ok =
          herramienta === "copiar"
            ? await get().copiarNivel(nivel.globalid, desfase)
            : await get().editarNivel(nivel.globalid, nivel.nombre, nivel.elevacion + desfase);
        if (ok) {
          set({
            longitudTecleada: "",
            aviso: `Nivel «${nivel.nombre}» ${herramienta === "copiar" ? "copiado" : "movido"} ${desfase.toFixed(2)} m.`,
          });
        }
        return;
      }
      if (!herramienta || puntos.length === 0) return;
      if (herramienta === "nivel") {
        const cotas = cotasTemporalesNivel(
          get().ratonHerramienta?.[1] ?? puntos[puntos.length - 1][1],
          get().niveles,
        );
        const texto = get().opcionesNivel.elevacionTexto || get().longitudTecleada;
        let z: number | null;
        if (texto.trim() === "") {
          z = get().ratonHerramienta?.[1] ?? puntos[puntos.length - 1][1];
        } else {
          z = elevacionDesdeCota(cotas.inferior, texto);
          if (z === null) {
            set({ aviso: "Cota no válida: escriba un número, por ejemplo 0.50." });
            return;
          }
        }
        const x = get().ratonHerramienta?.[0] ?? puntos[puntos.length - 1][0];
        await crearNivelDesdeHerramienta([x, z]);
        return;
      }
      if (herramienta === "losa") {
        await get().dobleClicEnPlanta();
        return;
      }
      const texto = get().longitudTecleada.replace(",", ".");
      const longitud = Number(texto);
      const tieneLongitud = texto !== "" && Number.isFinite(longitud) && longitud > 0;
      // Enter sin longitud termina en el punto del cursor; en Muro se conserva el
      // comportamiento de O003b (solo la longitud tecleada cierra el tramo).
      if (!tieneLongitud && (herramienta === "muro" || esHerramientaLineal(herramienta))) {
        return;
      }
      const origen = puntos[puntos.length - 1];
      const raton = get().ratonHerramienta ?? (puntos.length > 1 ? puntos[puntos.length - 1] : null);
      if (!tieneLongitud && !raton) return;
      const destino = tieneLongitud
        ? puntoConLongitud(origen, raton ?? origen, longitud, shift)
        : (raton as Punto2);
      if (herramienta === "muro") {
        await crearMuroEntre(origen, destino);
        return;
      }
      if (herramienta === "cerramiento") {
        await crearCerramientoEntre(origen, destino);
        return;
      }
      if (esHerramientaLineal(herramienta)) {
        await crearEstructuralLineal(herramienta, origen, destino);
        return;
      }
      if (herramienta === "eje") {
        const libre = get().ejeLibre || shift;
        if (tieneLongitud) {
          // O006d: la distancia tecleada manda respecto del paralelo más cercano.
          const restriccion = ejeConDistancia(
            origen,
            raton ?? origen,
            get().referencias.ejes,
            longitud,
            libre,
          );
          if (restriccion) {
            await crearEjeEntre(restriccion.inicio, restriccion.fin, true);
            return;
          }
        }
        await crearEjeEntre(puntos[0], destino, libre);
        return;
      }
      if (herramienta === "mover" || herramienta === "copiar") {
        await moverSeleccion(puntos[0], destino);
      }
    },

    cancelarLongitud: () => set({ longitudTecleada: "" }),

    clicEnPlanta: async (punto, shift = false, agregar = false, metrosPorPixel) => {
      const herramienta = get().herramienta;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!herramienta) {
        await get().seleccionar(null);
        return;
      }
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
      if (!nivel) {
        set({ aviso: "Cree antes un nivel." });
        return;
      }
      const puntos = get().puntosHerramienta;
      const enganche = puntoDibujo(
        punto,
        get().referencias,
        puntos.length > 0 ? puntos[puntos.length - 1] : null,
        // O036b: el eje no se ajusta a 15°; su dirección la decide la dominante.
        herramienta === "eje" ? true : shift,
        metrosPorPixel,
      );
      const p = enganche.punto;
      bitacoraHerramienta(herramienta, "punto", { x: p[0], y: p[1] });
      if (herramienta === "espejo") {
        if (get().seleccionados.length === 0) {
          set({ aviso: "Seleccione uno o varios elementos antes de reflejarlos." });
          return;
        }
        const elegido = puntos.length === 0 ? ejeBajoPunto(get().referencias, p) : null;
        const origen = elegido ? elegido.p1 : puntos[0];
        const fin = elegido ? elegido.p2 : p;
        if (!elegido && puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: "Espejo: segundo punto del eje o clic sobre un eje/arista.",
          });
          return;
        }
        const ok = await ejecutar("elementos.espejo", {
          globalids: get().seleccionados,
          p1: origen,
          p2: fin,
          copiar: get().opcionesEspejo.copiar,
        });
        if (ok) {
          set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
          bitacoraHerramienta("espejo", "terminar", { x: p[0], y: p[1] });
        }
        return;
      }
      if (herramienta === "matriz") {
        if (get().seleccionados.length === 0) {
          set({ aviso: "Seleccione uno o varios elementos antes de crear la matriz." });
          return;
        }
        const opciones = get().opcionesMatriz;
        if (opciones.modo === "polar") {
          const ok = await ejecutar("elementos.matriz_polar", {
            globalids: get().seleccionados,
            centro: p,
            angulo_total: opciones.angulo,
            numero: opciones.numero,
          });
          if (ok) {
            set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
            bitacoraHerramienta("matriz", "terminar", { x: p[0], y: p[1] });
          }
          return;
        }
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: "Matriz lineal: segundo punto del vector.",
          });
          return;
        }
        const ok = await ejecutar("elementos.matriz_lineal", {
          globalids: get().seleccionados,
          vector: [p[0] - puntos[0][0], p[1] - puntos[0][1]],
          numero: opciones.numero,
          modo: opciones.alUltimo ? "al_ultimo" : "al_segundo",
        });
        if (ok) {
          set({ puntosHerramienta: [], ...limpiarTrazoExtra() });
          bitacoraHerramienta("matriz", "terminar", { x: p[0], y: p[1] });
        }
        return;
      }
      if (herramienta === "castillo") {
        const bajo = muroBajoPunto(get().referencias, p, 0.35);
        if (bajo) {
          const largo = Math.hypot(
            bajo.muro.x2 - bajo.muro.x1,
            bajo.muro.y2 - bajo.muro.y1,
          );
          const t = proyectarSobreSegmento(
            p,
            [bajo.muro.x1, bajo.muro.y1],
            [bajo.muro.x2, bajo.muro.y2],
          ).t;
          const tipo = tipoEstructural("castillo");
          if (!tipo) return;
          await ejecutar("castillos.crear_en_muro", {
            tipo: tipo.nombre,
            muro: bajo.muro.globalid,
            distancia: Number((t * largo).toFixed(6)),
          });
          return;
        }
      }
      if (herramienta === "cerramiento") {
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: "Cerramiento: segundo punto o longitud y Enter.",
          });
          return;
        }
        await crearCerramientoEntre(puntos[puntos.length - 1], p);
        return;
      }
      if (herramienta === "dala") {
        const bajo = muroBajoPunto(get().referencias, p, 0.35);
        if (bajo) {
          const tipo = tipoEstructural(herramienta);
          if (!tipo) return;
          await ejecutarResultado("dalas.crear_en_muro", {
            tipo: tipo.nombre,
            muro: bajo.muro.globalid,
          });
          return;
        }
      }
      if (esHerramientaPuntual(herramienta)) {
        await crearEstructuralPunto(herramienta, p);
        return;
      }
      if (esHerramientaLineal(herramienta)) {
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            aviso: `${herramienta.replace(/_/g, " ")}: segundo punto o longitud y Enter.`,
          });
          return;
        }
        await crearEstructuralLineal(herramienta, puntos[puntos.length - 1], p);
        return;
      }
      if (herramienta === "muro") {
        if (puntos.length === 0) {
          set({ puntosHerramienta: [p], aviso: "Muro: segundo punto o longitud y Enter." });
          return;
        }
        await crearMuroEntre(puntos[puntos.length - 1], p);
        return;
      }
      if (herramienta === "losa") {
        const repetido =
          puntos.length > 0 &&
          Math.hypot(p[0] - puntos[puntos.length - 1][0], p[1] - puntos[puntos.length - 1][1]) <
            0.01;
        if (!repetido) {
          set({
            puntosHerramienta: [...puntos, p],
            aviso: `Losa: ${puntos.length + 1} vértice(s); doble clic para cerrar.`,
          });
        }
        return;
      }
      if (herramienta === "eje") {
        if (puntos.length === 0) {
          set({
            puntosHerramienta: [p],
            ejeLibre: agregar,
            aviso: agregar
              ? "Eje sin familia: segundo punto (seguirá siendo horizontal o vertical)."
              : "Eje: segundo punto, longitud y Enter, o doble clic.",
          });
          return;
        }
        await crearEjeEntre(puntos[0], p, agregar || get().ejeLibre);
        return;
      }
      if (herramienta === "puerta" || herramienta === "ventana") {
        const ancho = herramienta === "puerta" ? 0.9 : 1.2;
        const alto = herramienta === "puerta" ? 2.1 : 1.2;
        const antepecho = herramienta === "puerta" ? 0 : 0.9;
        const colocada = colocarAbertura(get().referencias, p, ancho);
        if (!colocada) {
          set({ aviso: "Coloque la abertura sobre un muro." });
          return;
        }
        const ok = await ejecutar("aberturas.crear", {
          clase: herramienta === "puerta" ? "IfcDoor" : "IfcWindow",
          muro: colocada.muro.globalid,
          distancia: colocada.distancia,
          ancho,
          alto,
          antepecho,
          volteado: get().voltearSiguiente,
        });
        if (ok) bitacoraHerramienta(herramienta, "terminar", { x: p[0], y: p[1] });
        return;
      }
      if (herramienta === "mover" || herramienta === "copiar") {
        if (get().seleccionados.length === 0) {
          set({ aviso: "Seleccione uno o varios elementos antes de mover o copiar." });
          return;
        }
        if (puntos.length === 0) {
          set({ puntosHerramienta: [p], aviso: "Indique el punto destino." });
          return;
        }
        await moverSeleccion(puntos[0], p);
        return;
      }
      void agregar;
    },

    dobleClicEnPlanta: async () => {
      const herramienta = get().herramienta;
      // O007a: doble clic sobre un muro seleccionado abre «Editar tipo».
      const elegido = get().elementos.find((e) => e.globalid === get().seleccion);
      if (!herramienta && elegido?.clase === "IfcWall") {
        const tipo = get().tiposMuro.find((t) => t.nombre === elegido.tipo);
        get().abrirEditorTipos(tipo?.globalid ?? null);
        return;
      }
      if (
        !herramienta &&
        elegido &&
        ["IfcColumn", "IfcBeam", "IfcFooting"].includes(elegido.clase)
      ) {
        const tipo = get().tiposHerramienta.find((t) => t.nombre === elegido.tipo);
        if (tipo) {
          get().abrirEditorTipos(tipo.globalid);
          return;
        }
      }
      if (herramienta === "cerramiento") {
        set({
          puntosHerramienta: [],
          longitudTecleada: "",
          ratonHerramienta: null,
          engancheHerramienta: null,
          aviso: "Cadena de cerramientos terminada.",
        });
        return;
      }
      if (esHerramientaLineal(herramienta) && get().puntosHerramienta.length > 0) {
        const destino = get().ratonHerramienta;
        if (destino) {
          await crearEstructuralLineal(
            herramienta!, get().puntosHerramienta[0], destino,
          );
        }
        return;
      }
      if (herramienta === "muro") {
        set({
          puntosHerramienta: [],
          longitudTecleada: "",
          ratonHerramienta: null,
          engancheHerramienta: null,
          aviso: "Cadena de muros terminada.",
        });
        return;
      }
      if (herramienta === "eje") {
        const puntos = get().puntosHerramienta;
        if (puntos.length === 0) return;
        const destino = get().ratonHerramienta;
        if (!destino) return;
        await crearEjeEntre(puntos[0], destino, get().ejeLibre);
        return;
      }
      if (herramienta === "mover" || herramienta === "copiar") {
        const puntos = get().puntosHerramienta;
        const destino = get().ratonHerramienta;
        if (puntos.length === 0 || !destino) return;
        await moverSeleccion(puntos[0], destino);
        return;
      }
      if (herramienta !== "losa") return;
      const puntos = get().puntosHerramienta;
      if (puntos.length < 3) {
        set({ aviso: "La losa necesita al menos tres vértices." });
        return;
      }
      if (Math.abs(areaPoligono(puntos)) < 1e-6) {
        set({ aviso: "La losa tiene área cero." });
        return;
      }
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
      const ok = await ejecutar("losas.crear", {
        nivel,
        puntos,
        espesor: 0.12,
        desfase: 0,
      });
      if (ok) {
        set({
          puntosHerramienta: [],
          ratonHerramienta: null,
          engancheHerramienta: null,
        });
        bitacoraHerramienta("losa", "terminar");
      }
    },

    voltearAbertura: () => set({ voltearSiguiente: !get().voltearSiguiente }),

    borrarSeleccion: async () => {
      const gids = get().seleccionados;
      if (gids.length === 0) {
        set({ aviso: "Seleccione uno o varios elementos para borrar." });
        return;
      }
      // O007c: al borrar una columna se pregunta si cae también su zapata.
      const hayColumna = get().elementos.some(
        (elemento) =>
          gids.includes(elemento.globalid) && elemento.clase === "IfcColumn",
      );
      const dependientes = hayColumna ? await get().preguntarZapata() : true;
      await ejecutar("elementos.borrar", { globalids: gids, dependientes });
    },

    deshacer: async () => {
      try {
        const resultado = await rpc<{ hecho: boolean; motivo?: string }>("historial.deshacer");
        if (!resultado.hecho) {
          set({ aviso: resultado.motivo ?? "No hay nada que deshacer." });
          return;
        }
        await cargar(await rpc<RespuestaInfo>("proyecto.info"));
        set({ aviso: "Deshecho." });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    rehacer: async () => {
      try {
        const resultado = await rpc<{ hecho: boolean; motivo?: string }>("historial.rehacer");
        if (!resultado.hecho) {
          set({ aviso: resultado.motivo ?? "No hay nada que rehacer." });
          return;
        }
        await cargar(await rpc<RespuestaInfo>("proyecto.info"));
        set({ aviso: "Rehecho." });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    validar: async () => {
      try {
        const problemas = await rpc<Array<{ nivel: string; mensaje: string }>>(
          "proyecto.validar",
        );
        if (problemas.length === 0) {
          set({ aviso: "Validación IFC: sin problemas.", error: null });
        } else {
          set({
            aviso: `Validación IFC: ${problemas.length} problema(s).`,
            error: problemas
              .slice(0, 3)
              .map((p) => `${p.nivel}: ${p.mensaje}`)
              .join(" · "),
          });
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    crearNivel: async (nombre, elevacion, opciones = {}) => {
      const resultado = await ejecutarResultado("niveles.crear", {
        nombre,
        elevacion,
        crear_planta: opciones.crearPlanta ?? true,
        // O031: se guardan las vistas de la sesión en la misma instantánea; así
        // Deshacer no deja el modelo sin plantas, alzados ni 3D.
        vistas: get().vistas,
      });
      if (!resultado) return false;
      // O029: el núcleo crea la planta en el mismo paso (mismo Deshacer); se releen
      // las vistas para que el navegador y el visor las vean ya guardadas.
      if (opciones.crearPlanta ?? true) {
        const crudas = await rpc<unknown>("vistas.leer").catch(() => null);
        if (crudas) {
          const delNucleo = normalizarVistas(crudas);
          const nivel = (resultado.nivel as { globalid?: string } | null)?.globalid;
          const vista = nivel
            ? delNucleo.find((v) => v.tipo === "planta" && v.nivel === nivel)
            : undefined;
          // Se conservan las vistas automáticas de la sesión (alzados, cortes y 3D)
          // que aún no se habían guardado; del núcleo solo llega la planta nueva.
          const vistas = [...get().vistas];
          for (const candidata of delNucleo) {
            const i = vistas.findIndex((v) => v.id === candidata.id);
            if (i >= 0) vistas[i] = candidata;
            else vistas.push(candidata);
          }
          // O029: se conserva la vista activa (el alzado) al crear el nivel; la
          // planta nueva solo aparece en el navegador.
          void vista;
          set({ vistas, conCambios: true });
        }
      }
      return true;
    },

    copiarNivel: async (globalid, desfase) => {
      const resultado = await ejecutarResultado("niveles.copiar", {
        globalid,
        desfase,
        vistas: get().vistas,
      });
      if (!resultado) return false;
      const crudas = await rpc<unknown>("vistas.leer").catch(() => null);
      if (crudas) {
        const delNucleo = normalizarVistas(crudas);
        const nivel = (resultado.nivel as { globalid?: string } | null)?.globalid;
        const vista = nivel
          ? delNucleo.find((v) => v.tipo === "planta" && v.nivel === nivel)
          : undefined;
        const vistas = [...get().vistas];
        for (const candidata of delNucleo) {
          const i = vistas.findIndex((v) => v.id === candidata.id);
          if (i >= 0) vistas[i] = candidata;
          else vistas.push(candidata);
        }
        // O029: copiar un nivel tampoco cambia la vista activa.
        void vista;
        set({ vistas });
      }
      return true;
    },

    arregloNiveles: async (globalid, cantidad, separacion) => {
      const resultado = await ejecutarResultado("niveles.arreglo", {
        globalid,
        cantidad,
        separacion,
        vistas: get().vistas,
      });
      if (!resultado) return false;
      const crudas = await rpc<unknown>("vistas.leer").catch(() => null);
      if (crudas) {
        const vistas = [...get().vistas];
        for (const candidata of normalizarVistas(crudas)) {
          const i = vistas.findIndex((v) => v.id === candidata.id);
          if (i >= 0) vistas[i] = candidata;
          else vistas.push(candidata);
        }
        set({ vistas });
      }
      return true;
    },

    editarNivel: async (globalid, nombre, elevacion) => {
      const ok = await ejecutar("niveles.editar", { globalid, nombre, elevacion });
      if (!ok) return;
      const vistas = sincronizarPlantas(get().vistas, get().niveles);
      set({ vistas });
      await persistirVistas(vistas);
    },

    borrarNivel: async (globalid) => {
      const ok = await ejecutar("niveles.borrar", { globalid });
      if (!ok) return;
      const vistas = get().vistas.filter((v) => !(v.tipo === "planta" && v.nivel === globalid));
      const activa = get().vistaActivaId;
      set({
        vistas,
        vistaActivaId:
          vistas.find((v) => v.id === activa)?.id ?? vistas.find((v) => v.tipo === "planta")?.id ?? null,
      });
      await persistirVistas(vistas);
    },

    crearEje: async (etiqueta, x1, y1, x2, y2) => {
      await ejecutar("ejes.crear", { etiqueta, x1, y1, x2, y2 });
    },

    crearEjesPorSeparaciones: async (
      direccion,
      origen,
      separaciones,
      longitud,
      primeraEtiqueta,
    ) => {
      const ok = await ejecutar("ejes.crear_por_separaciones", {
        direccion,
        origen,
        separaciones,
        longitud,
        primera_etiqueta: primeraEtiqueta,
      });
      return ok;
    },

    crearReticula: async (vertical, horizontal, modo, rebase) => {
      const bloque = (b: BloqueEjesReticula | null) =>
        b
          ? {
              separaciones: b.separaciones,
              origen: b.origen,
              longitud: b.longitud,
              primera_etiqueta: b.primeraEtiqueta,
            }
          : null;
      const ok = await ejecutar("ejes.crear_reticula", {
        vertical: bloque(vertical),
        horizontal: bloque(horizontal),
        modo,
        rebase,
      });
      return ok;
    },

    editarRebase: async (rebase) => {
      return ejecutar("ejes.rebase", { rebase });
    },

    separarEjes: async (referencia, mover, distancia, cadena) => {
      return ejecutar("ejes.separacion", {
        referencia,
        mover,
        distancia,
        cadena,
      });
    },

    separarNiveles: async (inferior, superior, altura, cadena) => {
      const ok = await ejecutar("niveles.separacion", {
        inferior,
        superior,
        altura,
        cadena,
      });
      if (!ok) return false;
      const vistas = sincronizarPlantas(get().vistas, get().niveles);
      set({ vistas });
      await persistirVistas(vistas);
      return true;
    },

    editarEje: async (globalid, etiqueta) => {
      await ejecutar("ejes.editar", { globalid, etiqueta });
    },

    moverEje: async (globalid, desplazamiento) => {
      return ejecutar("ejes.mover", { globalid, desplazamiento });
    },

    borrarEje: async (globalid) => {
      await ejecutar("ejes.borrar", { globalid });
    },

    losaDesdeMuros: async () => {
      const gids = get().seleccionados;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
      if (gids.length < 3) {
        set({ aviso: "Seleccione el circuito cerrado de muros (tres o más)." });
        return;
      }
      const opciones = get().opcionesLosa;
      await ejecutar("losas.desde_muros", {
        nivel,
        globalids: gids,
        lado: opciones.lado,
        desfase: opciones.desfase,
      });
    },

    castillosAutomaticos: async (separacion) => {
      if (!Number.isFinite(separacion) || separacion <= 0) {
        set({ aviso: "La separación entre castillos debe ser positiva." });
        return false;
      }
      const nivel = nivelActivo();
      const muros = get().seleccionados.filter((gid) =>
        get().elementos.some(
          (elemento) => elemento.globalid === gid && elemento.clase === "IfcWall",
        ),
      );
      const ok = await ejecutar("castillos.automaticos", {
        muros,
        separacion_max: separacion,
        nivel,
      });
      if (ok) set({ dialogoCastillos: false });
      return ok;
    },

    columnasEnCruces: async () => {
      const tipo = tipoEstructural("columna");
      const nivel = nivelActivo();
      if (!tipo || !nivel) return false;
      const resultado = await ejecutarResultado("columnas.en_cruces", {
        tipo: tipo.nombre,
        nivel,
      });
      if (!resultado) return false;
      if (get().columnaConZapata) {
        const zapata = tipoZapataElegida();
        if (zapata) {
          for (const columna of resultado.creados) {
            const ok = await ejecutar("zapatas.bajo_columna", {
              tipo: zapata.nombre,
              columna,
            });
            if (!ok) return false;
          }
        }
      }
      set({
        aviso: `${resultado.creados.length} columna(s) en los cruces${
          get().columnaConZapata ? " con zapata" : ""
        }.`,
      });
      return true;
    },

    unirZapatas: async () => {
      const tipo = get().tiposHerramienta.find((t) => t.alias === "contratrabe");
      const nivel = nivelActivo();
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de contratrabe en la biblioteca." });
        return false;
      }
      return ejecutar("contratrabes.unir_zapatas", {
        tipo: tipo.nombre,
        nivel,
      });
    },

    zapatasEnCruces: async () => {
      const tipo = tipoZapataElegida();
      const nivel = nivelActivo();
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de zapata en la biblioteca." });
        return false;
      }
      return ejecutar("zapatas.en_cruces", { tipo: tipo.nombre, nivel });
    },

    contratrabesEntreEjes: async () => {
      const tipo = get().tiposHerramienta.find((t) => t.alias === "contratrabe");
      const nivel = nivelActivo();
      const guia = get().ejeSeleccionado;
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de contratrabe en la biblioteca." });
        return false;
      }
      if (!guia) {
        set({ aviso: "Seleccione el eje guía en planta." });
        return false;
      }
      return ejecutar("contratrabes.entre_ejes", {
        tipo: tipo.nombre,
        nivel,
        eje_guia: guia,
      });
    },

    murosEntreEjes: async () => {
      const tipo = tipoEstructural("muro");
      const nivel = nivelActivo();
      const guia = get().ejeSeleccionado;
      if (!tipo || !nivel) return false;
      if (!guia) {
        set({ aviso: "Seleccione el eje guía en planta." });
        return false;
      }
      return ejecutar("muros.entre_ejes", {
        tipo: tipo.nombre,
        nivel,
        eje_guia: guia,
      });
    },

    soltarEnlace: async (globalid) => {
      if (!globalid) return;
      await ejecutar("restricciones.soltar_enlace", { globalid });
    },

    soltarDelMuro: async (globalid) => {
      if (!globalid) return;
      await ejecutar("cerramientos.soltar_del_muro", { globalid });
    },

    unirTrabes: async () => {
      const tipo = get().tiposHerramienta.find((t) => t.alias === "trabe");
      const nivel = nivelActivo();
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de trabe en la biblioteca." });
        return false;
      }
      return ejecutar("trabes.unir_columnas", {
        tipo: tipo.nombre,
        nivel,
      });
    },

    editarElemento: async (globalid, cambios) => {
      const ok = await ejecutar("elementos.editar", { globalid, cambios });
      if (ok) await get().seleccionar(globalid);
      else await refrescarPropiedades(globalid);
    },

    editarRestricciones: async (globalid, cambios) => {
      const ok = await ejecutar("restricciones.editar", { globalid, ...cambios });
      if (ok) await get().seleccionar(globalid);
      else await refrescarPropiedades(globalid);
    },

    comprobarNucleo: async () => {
      try {
        const respuesta = await rpc<{ disponible: boolean; detalle?: string }>("nucleo.ping");
        if (!respuesta.disponible) {
          set({ aviso: `Núcleo IFC no disponible: ${respuesta.detalle ?? "sin detalle"}` });
        }
      } catch (e) {
        set({
          aviso: `Núcleo IFC no disponible: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },
  };
});
