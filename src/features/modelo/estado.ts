// OPEN-RVT: estado del modelo abierto. Centraliza el canal con el núcleo Python, la
// lista de vistas y la selección para que la cinta, el visor y la barra de estado
// compartan una sola fuente de verdad.
import { create } from "zustand";
import { bitacoraHerramienta, llamarConBitacora } from "@/lib/bitacora";
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
} from "./tipos";
import {
  cajaDeMallas,
  crearVistaCorte,
  crearVistas,
  migrarNivelesVisibles,
  normalizarVistas,
  numeroDeCorte,
} from "./vistas";
import {
  areaPoligono,
  colocarAbertura,
  ejeConDistancia,
  muroBajoPunto,
  puntoConLongitud,
  proyectarSobreSegmento,
  puntoDibujo,
  REFERENCIAS_VACIAS,
  referenciasAlDia,
  restringirEje,
  siguienteEtiquetaEje,
  type Enganche,
  type Punto2,
  type Referencias,
} from "./herramientas";
import { estilosPorDefecto, normalizarEstilos, type Estilos } from "./estilos";
import { construirAberturas } from "./aberturas";
import { normalizarAjusteEje } from "./ejesVista";
import { normalizarAjusteNivel } from "./niveles";

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
  | "dala";
export type AlineacionMuro = "centro" | "interior" | "exterior";

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
  vistaActivaId: string | null;
  /** O021: eje seleccionado en el visor (para el panel de propiedades). */
  ejeSeleccionado: string | null;
  seleccion: string | null;
  seleccionados: string[];
  propiedades: PropiedadesElemento | null;
  cargando: boolean;
  error: string | null;
  aviso: string | null;
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
  opcionesMuro: OpcionesMuro;
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
  crearNivel: (nombre: string, elevacion: number) => Promise<boolean>;
  editarNivel: (globalid: string, nombre: string, elevacion: number) => Promise<void>;
  borrarNivel: (globalid: string) => Promise<void>;
  crearEje: (etiqueta: string, x1: number, y1: number, x2: number, y2: number) => Promise<void>;
  editarEje: (globalid: string, etiqueta: string) => Promise<void>;
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
  /** O007c: castillos en esquinas, remates e intermedios de los muros elegidos. */
  castillosAutomaticos: (separacion: number) => Promise<boolean>;
  /** O007c: columna en todos los cruces de la retícula (con zapata opcional). */
  columnasEnCruces: () => Promise<boolean>;
  /** O007c: contratrabes entre zapatas consecutivas y trabes entre columnas. */
  unirZapatas: () => Promise<boolean>;
  unirTrabes: () => Promise<boolean>;
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
  fijarEjeSeleccionado: (globalid: string | null) => void;
  iniciarCorte: () => void;
  cancelarCorte: () => void;
  anadirPuntoCorte: (punto: [number, number]) => Promise<void>;
  limpiarAviso: () => void;
  fijarAviso: (texto: string) => void;
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

  const cargar = async (info: RespuestaInfo) => {
    const inicio = performance.now();
    const [niveles, elementos, teselado, vistasCrudas, tipos, referenciasCrudas, estilosCrudos,
      tiposEstructura] = await Promise.all([
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
      vistasPersistidas: persistidas,
      vistaActivaId: activa?.id ?? null,
      seleccion: null,
      seleccionados: [],
      propiedades: null,
      cargando: false,
      error: null,
      aviso: null,
      modoCorte: false,
      puntoCorte: null,
      tiposMuro: tipos,
      tiposHerramienta: tiposEstructura,
      tipoHerramienta: {},
      rotacionSiguiente: 0,
      referencias,
      herramienta: null,
      puntosHerramienta: [],
      ratonHerramienta: null,
      engancheHerramienta: null,
      longitudTecleada: "",
      opcionesMuro: {
        tipo: tipos.find((t) => t.nombre === "Block 15")?.nombre ?? tipos[0]?.nombre ?? "",
        altura: 2.6,
        alineacion: "centro",
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
    const [info, niveles, elementos, referenciasCrudas, teselado] = await Promise.all([
      rpc<RespuestaInfo>("proyecto.info"),
      rpc<Nivel[]>("modelo.niveles"),
      rpc<Elemento[]>("modelo.elementos"),
      rpc<Referencias>("modelo.referencias"),
      tocados.length > 0
        ? rpc<RespuestaTeselado>("geometria.teselar", { globalids: tocados })
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
      seleccion,
      seleccionados,
      propiedades: seleccion ? get().propiedades : null,
      error: null,
      aviso: resultado.mensaje || get().aviso,
    });
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
    });
    if (ok) {
      set({ puntosHerramienta: [destino], ...limpiarTrazoExtra() });
      bitacoraHerramienta("muro", "terminar", { x: destino[0], y: destino[1] });
    }
    return ok;
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
    const cruce = herramienta === "columna" ? ejesEnPunto(punto) : [];
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
    const restriccion = restringirEje(origen, destino, get().referencias.ejes, libre);
    const inicio = restriccion?.inicio ?? origen;
    const fin = restriccion?.fin ?? destino;
    if (Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]) < 0.01) {
      set({ aviso: "El eje necesita dos puntos distintos." });
      return false;
    }
    const vertical =
      restriccion?.vertical ??
      Math.abs(fin[0] - inicio[0]) < Math.abs(fin[1] - inicio[1]);
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
    vistaActivaId: null,
    ejeSeleccionado: null,
    seleccion: null,
    seleccionados: [],
    propiedades: null,
    cargando: false,
    error: null,
    aviso: null,
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
    opcionesMuro: { tipo: "", altura: 2.6, alineacion: "centro" },
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
      set({ vistaActivaId: id, modoCorte: false, puntoCorte: null, ejeSeleccionado: null });
    },

    fijarEjeSeleccionado: (globalid) => {
      set({ ejeSeleccionado: globalid });
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

    activarHerramienta: (herramienta) => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista || vista.tipo !== "planta") {
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
        cerramiento: "Cerramiento: clic sobre un muro.",
        dala: "Dala de desplante: clic sobre un muro.",
      };
      const conservarSeleccion =
        herramienta === "mover" || herramienta === "copiar" || herramienta === "losa";
      set({
        herramienta,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        ejeLibre: false,
        modoCorte: false,
        puntoCorte: null,
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
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        ejeLibre: false,
        etiquetaEje: "",
        aviso: null,
      });
      if (herramienta) bitacoraHerramienta(herramienta, "cancelar");
    },

    cancelarTrazo: () => {
      const herramienta = get().herramienta;
      if (!herramienta) return false;
      if (get().puntosHerramienta.length === 0 && !get().longitudTecleada) return false;
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
        cerramiento: "Cerramiento: clic sobre un muro.",
        dala: "Dala de desplante: clic sobre un muro.",
      };
      set({
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        ejeLibre: false,
        aviso: nombres[herramienta],
      });
      bitacoraHerramienta(herramienta, "cancelar_trazo");
      return true;
    },

    fijarOpcionesMuro: (cambios) =>
      set({ opcionesMuro: { ...get().opcionesMuro, ...cambios } }),

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

    fijarRatonHerramienta: (punto, shift = false, metrosPorPixel) => {
      const herramienta = get().herramienta;
      if (!herramienta || !punto) {
        set({ ratonHerramienta: null, engancheHerramienta: null });
        return;
      }
      const puntos = get().puntosHerramienta;
      if (herramienta === "puerta" || herramienta === "ventana") {
        set({ ratonHerramienta: punto, engancheHerramienta: null });
        return;
      }
      const enganche = puntoDibujo(
        punto,
        get().referencias,
        puntos.length > 0 ? puntos[puntos.length - 1] : null,
        shift,
        metrosPorPixel,
      );
      set({ ratonHerramienta: enganche.punto, engancheHerramienta: enganche });
    },

    teclearLongitud: (tecla) => {
      const herramienta = get().herramienta;
      if (!herramienta || herramienta === "puerta" || herramienta === "ventana") return;
      if (get().puntosHerramienta.length === 0) return;
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
      if (!herramienta || puntos.length === 0) return;
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
        shift,
        metrosPorPixel,
      );
      const p = enganche.punto;
      bitacoraHerramienta(herramienta, "punto", { x: p[0], y: p[1] });
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
      if (herramienta === "cerramiento" || herramienta === "dala") {
        const bajo = muroBajoPunto(get().referencias, p, 0.35);
        if (bajo) {
          const tipo = tipoEstructural(herramienta);
          if (!tipo) return;
          await ejecutar(
            herramienta === "cerramiento"
              ? "cerramientos.crear_en_muro"
              : "dalas.crear_en_muro",
            { tipo: tipo.nombre, muro: bajo.muro.globalid },
          );
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
              ? "Eje libre: segundo punto."
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

    crearNivel: async (nombre, elevacion) => {
      const ok = await ejecutar("niveles.crear", { nombre, elevacion });
      if (!ok) return false;
      const niveles = get().niveles;
      const nivel = niveles.find((n) => n.nombre === nombre && n.elevacion === elevacion);
      if (!nivel) return true;
      const inferiores = niveles.filter((n) => n.elevacion < elevacion);
      const inferior =
        inferiores.length > 0
          ? Math.max(...inferiores.map((n) => n.elevacion))
          : elevacion - 1;
      const existente = get().vistas.some((v) => v.tipo === "planta" && v.nivel === nivel.globalid);
      if (!existente) {
        const vista: Vista = {
          id: `planta-${nivel.globalid}`,
          nombre: `Planta ${nivel.nombre}`,
          tipo: "planta",
          nivel: nivel.globalid,
          alturaPlano: nivel.elevacion + 1.2,
          profundidad: inferior,
          nivelesVisibles: [nivel.globalid],
          categorias: CATEGORIAS_TODAS(),
          estilo: "sombreado",
          escala: 100,
          cotasEjes: true,
        };
        const vistas = [...get().vistas, vista];
        set({ vistas, vistaActivaId: vista.id });
        await persistirVistas(vistas);
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
      await ejecutar("losas.desde_muros", { nivel, globalids: gids });
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
    },

    editarRestricciones: async (globalid, cambios) => {
      const ok = await ejecutar("restricciones.editar", { globalid, ...cambios });
      if (ok) await get().seleccionar(globalid);
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
