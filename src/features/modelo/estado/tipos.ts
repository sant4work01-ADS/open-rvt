// O065B: tipos del store del modelo (movidos tal cual desde estado.ts).
import type { Abertura, Caja, Elemento, ElementoMalla, Nivel, PropiedadesElemento, Vista, AjusteEjeVista, LineaUbicacion } from "../tipos";
import type { ArbolObra, NodoArbol, PartidaObra } from "../arbol";
import type { Enganche, Punto2, Referencias } from "../herramientas";
import type { Estilos } from "../estilos";
import type { Nota } from "../anotaciones3d";
import type { ClasificacionEmpujar, RectanguloEmpujar } from "../empujar";
import type { CaraEmpujarActiva } from "../empujarCaras";
import type { NivelRef } from "../niveles";
import type { StoreApi } from "zustand";

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
  | "matriz"
  | "empujar"
  | "nota";
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
export type UsoLosa = "firme" | "entrepiso" | "azotea";

export interface OpcionesLosa {
  lado: "exterior" | "eje" | "interior";
  desfase: number;
  uso: UsoLosa;
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

export interface EstadoModelo {
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
  /** O055: notas 3D guardadas como IfcAnnotation. */
  notas: Nota[];
  /** O055: nota seleccionada en el visor o en el árbol. */
  notaSeleccionada: string | null;
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
  /** O063: el núcleo perdió el modelo en memoria y la edición está bloqueada. */
  nucleoCaido: boolean;
  /** O063: texto del aviso modal (se oculta con «Entendido», el bloqueo sigue). */
  avisoNucleo: string | null;
  marcarNucleoCaido: (mensaje: string) => void;
  cerrarAvisoNucleo: () => void;
  reactivarEdicion: () => void;
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
  /** O046: clasificación elegida, rectángulo y altura provisional del empujar/tirar. */
  empujarClasificacion: ClasificacionEmpujar;
  empujarRect: RectanguloEmpujar | null;
  empujarAltura: number | null;
  /** O049: cota del plano del contorno (cara superior) o null = nivel activo. */
  empujarZ: number | null;
  /** O056: cara existente elegida para empujar/tirar (null = modo contorno). */
  empujarCara: CaraEmpujarActiva | null;
  fijarClasificacionEmpujar: (clasificacion: ClasificacionEmpujar) => void;
  fijarAlturaEmpujar: (altura: number | null) => void;
  moverEmpujar: (punto: Punto2 | null) => void;
  clicEmpujar: (punto: Punto2, z?: number) => Promise<boolean>;
  confirmarEmpujar: () => Promise<boolean>;
  iniciarEmpujarCara: (cara: Omit<CaraEmpujarActiva, "distancia">) => void;
  moverEmpujarCara: (distancia: number) => void;
  confirmarEmpujarCara: () => Promise<boolean>;
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
  /** O055: crea una nota y devuelve su GlobalId (o null si falló). */
  crearNota: (
    texto: string,
    posicion: [number, number, number],
    nivel?: string,
  ) => Promise<string | null>;
  editarNota: (globalid: string, texto: string) => Promise<void>;
  moverNota: (globalid: string, posicion: [number, number, number]) => Promise<void>;
  borrarNota: (globalid: string) => Promise<void>;
  seleccionarNota: (globalid: string | null) => void;
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
  /** O050: mueve varios cerramientos de nivel en un solo paso de deshacer. */
  editarRestriccionesVarios: (
    globalids: string[],
    cambios: { nivel_base?: string; desfase_base?: number },
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

export type SetEstado = StoreApi<EstadoModelo>["setState"];
export type GetEstado = StoreApi<EstadoModelo>["getState"];
