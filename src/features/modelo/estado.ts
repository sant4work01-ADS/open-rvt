// OPEN-RVT: estado del modelo abierto. Centraliza el canal con el núcleo Python, la
// lista de vistas y la selección para que la cinta, el visor y la barra de estado
// compartan una sola fuente de verdad.
import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { elegirDestinoIfc, elegirIfcParaAbrir } from "@/lib/dialogos";
import {
  CATEGORIAS_TODAS,
  type Caja,
  type Elemento,
  type ElementoMalla,
  type Nivel,
  type PropiedadesElemento,
  type RespuestaInfo,
  type RespuestaTeselado,
  type Vista,
} from "./tipos";
import {
  cajaDeMallas,
  crearVistaCorte,
  crearVistas,
  normalizarVistas,
  numeroDeCorte,
} from "./vistas";
import {
  areaPoligono,
  colocarAbertura,
  puntoConLongitud,
  puntoDibujo,
  REFERENCIAS_VACIAS,
  type Enganche,
  type Punto2,
  type Referencias,
} from "./herramientas";

export type RespuestaGuardar = "guardar" | "descartar" | "cancelar";
export type Herramienta =
  | "muro"
  | "losa"
  | "puerta"
  | "ventana"
  | "eje"
  | "mover"
  | "copiar";
export type AlineacionMuro = "centro" | "interior" | "exterior";

export interface OpcionesMuro {
  tipo: string;
  altura: number;
  alineacion: AlineacionMuro;
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
  vistaActivaId: string | null;
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

  // O003b: herramientas de modelado.
  herramienta: Herramienta | null;
  opcionesMuro: OpcionesMuro;
  tiposMuro: Array<{ globalid: string; nombre: string; espesor: number }>;
  referencias: Referencias;
  puntosHerramienta: Punto2[];
  ratonHerramienta: Punto2 | null;
  engancheHerramienta: Enganche | null;
  longitudTecleada: string;
  voltearSiguiente: boolean;
  etiquetaEje: string;
  activarHerramienta: (herramienta: Herramienta) => void;
  cancelarHerramienta: () => void;
  fijarOpcionesMuro: (cambios: Partial<OpcionesMuro>) => void;
  fijarEtiquetaEje: (etiqueta: string) => void;
  fijarRatonHerramienta: (punto: Punto2 | null, shift?: boolean) => void;
  teclearLongitud: (tecla: string) => void;
  confirmarLongitud: (shift?: boolean) => Promise<void>;
  cancelarLongitud: () => void;
  clicEnPlanta: (punto: Punto2, shift?: boolean, agregar?: boolean) => Promise<void>;
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
  losaDesdeMuros: () => Promise<void>;
  editarElemento: (globalid: string, cambios: Record<string, unknown>) => Promise<void>;

  nuevo: () => Promise<boolean>;
  abrir: (ruta?: string) => Promise<boolean>;
  guardar: () => Promise<boolean>;
  guardarComo: (ruta?: string) => Promise<boolean>;
  asegurarSinCambios: () => Promise<boolean>;
  preguntarGuardar: () => Promise<RespuestaGuardar>;
  responderGuardar: (respuesta: RespuestaGuardar) => void;
  fijarVista: (id: string) => void;
  actualizarVista: (id: string, cambios: Partial<Vista>) => Promise<void>;
  seleccionar: (globalid: string | null, agregar?: boolean) => Promise<void>;
  iniciarCorte: () => void;
  cancelarCorte: () => void;
  anadirPuntoCorte: (punto: [number, number]) => Promise<void>;
  limpiarAviso: () => void;
  fijarAviso: (texto: string) => void;
  comprobarNucleo: () => Promise<void>;
}

async function rpc<T>(metodo: string, params: Record<string, unknown> = {}): Promise<T> {
  return (await ipc.nucleoLlamar(metodo, params)) as T;
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

export const useModelo = create<EstadoModelo>((set, get) => {
  const cargar = async (info: RespuestaInfo) => {
    const inicio = performance.now();
    const [niveles, elementos, teselado, vistasCrudas, tipos, referencias] = await Promise.all([
      rpc<Nivel[]>("modelo.niveles"),
      rpc<Elemento[]>("modelo.elementos"),
      rpc<RespuestaTeselado>("geometria.teselar", { globalids: null }),
      rpc<unknown>("vistas.leer"),
      rpc<Array<{ globalid: string; nombre: string; espesor: number }>>("tipos.listar", {
        clase: "IfcWallType",
      }),
      rpc<Referencias>("modelo.referencias"),
    ]);
    const mallas = teselado.elementos.map(decodificarMalla);
    const caja = cajaDeMallas(mallas);
    let vistas = normalizarVistas(vistasCrudas);
    let persistidas = vistas.length > 0;
    if (vistas.length === 0) {
      vistas = crearVistas(niveles);
      persistidas = false;
    }
    const activa =
      vistas.find((v) => v.tipo === "planta") ?? vistas[0] ?? null;
    set({
      ruta: info.ruta,
      nombreArchivo: nombreDeRuta(info.ruta, info.nombre),
      esquema: info.esquema,
      conCambios: info.con_cambios,
      totalElementos: info.elementos,
      conteos: info.por_clase,
      niveles,
      elementos,
      mallas,
      caja,
      vistas,
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
  };

  const persistirVistas = async (vistas: Vista[]) => {
    try {
      await rpc("vistas.guardar", { lista: vistas });
      set({ vistasPersistidas: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
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
    const [info, niveles, elementos, referencias, teselado] = await Promise.all([
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

  const ejecutar = async (metodo: string, params: Record<string, unknown> = {}) => {
    try {
      const resultado = await rpc<RespuestaComando>(metodo, params);
      await refrescarDeComando(resultado);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return false;
    }
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
    vistaActivaId: null,
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
    herramienta: null,
    opcionesMuro: { tipo: "", altura: 2.6, alineacion: "centro" },
    tiposMuro: [],
    referencias: REFERENCIAS_VACIAS,
    puntosHerramienta: [],
    ratonHerramienta: null,
    engancheHerramienta: null,
    longitudTecleada: "",
    voltearSiguiente: false,
    etiquetaEje: "",

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
      set({ vistaActivaId: id, modoCorte: false, puntoCorte: null });
    },

    actualizarVista: async (id, cambios) => {
      const vistas = get().vistas.map((v) => (v.id === id ? { ...v, ...cambios, id } : v));
      set({ vistas, conCambios: true });
      await persistirVistas(vistas);
    },

    seleccionar: async (globalid, agregar = false) => {
      const token = ++tokenSeleccion;
      if (!globalid) {
        set({ seleccion: null, seleccionados: [], propiedades: null });
        return;
      }
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
      };
      const conservarSeleccion =
        herramienta === "mover" || herramienta === "copiar" || herramienta === "losa";
      set({
        herramienta,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        modoCorte: false,
        puntoCorte: null,
        ...(conservarSeleccion
          ? {}
          : { seleccion: null, seleccionados: [], propiedades: null }),
        aviso: nombres[herramienta],
      });
    },

    cancelarHerramienta: () =>
      set({
        herramienta: null,
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        aviso: null,
      }),

    fijarOpcionesMuro: (cambios) =>
      set({ opcionesMuro: { ...get().opcionesMuro, ...cambios } }),

    fijarEtiquetaEje: (etiqueta) => set({ etiquetaEje: etiqueta }),

    fijarRatonHerramienta: (punto, shift = false) => {
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
      );
      set({ ratonHerramienta: enganche.punto, engancheHerramienta: enganche });
    },

    teclearLongitud: (tecla) => {
      if (get().herramienta !== "muro") return;
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
      const texto = get().longitudTecleada.replace(",", ".");
      const longitud = Number(texto);
      const puntos = get().puntosHerramienta;
      if (!Number.isFinite(longitud) || longitud <= 0 || puntos.length === 0) return;
      const origen = puntos[puntos.length - 1];
      const raton = get().ratonHerramienta ?? [origen[0] + 1, origen[1]];
      const destino = puntoConLongitud(origen, raton, longitud, shift);
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
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
        set({
          puntosHerramienta: [destino],
          longitudTecleada: "",
          ratonHerramienta: null,
          engancheHerramienta: null,
        });
      }
    },

    cancelarLongitud: () => set({ longitudTecleada: "" }),

    clicEnPlanta: async (punto, shift = false, agregar = false) => {
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
      );
      const p = enganche.punto;
      if (herramienta === "muro") {
        if (puntos.length === 0) {
          set({ puntosHerramienta: [p], aviso: "Muro: segundo punto o longitud y Enter." });
          return;
        }
        const origen = puntos[puntos.length - 1];
        if (Math.hypot(p[0] - origen[0], p[1] - origen[1]) < 0.01) return;
        const opciones = get().opcionesMuro;
        const ok = await ejecutar("muros.crear", {
          tipo: opciones.tipo,
          nivel,
          x1: origen[0],
          y1: origen[1],
          x2: p[0],
          y2: p[1],
          altura: opciones.altura,
          alineacion: opciones.alineacion,
        });
        if (ok) {
          set({
            puntosHerramienta: [p],
            longitudTecleada: "",
            ratonHerramienta: null,
            engancheHerramienta: null,
          });
        }
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
          set({ puntosHerramienta: [p], aviso: "Eje: segundo punto." });
          return;
        }
        const origen = puntos[0];
        const ok = await ejecutar("ejes.crear", {
          etiqueta: get().etiquetaEje,
          x1: origen[0],
          y1: origen[1],
          x2: p[0],
          y2: p[1],
        });
        if (ok) {
          set({
            puntosHerramienta: [],
            etiquetaEje: "",
            ratonHerramienta: null,
            engancheHerramienta: null,
          });
        }
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
        await ejecutar("aberturas.crear", {
          clase: herramienta === "puerta" ? "IfcDoor" : "IfcWindow",
          muro: colocada.muro.globalid,
          distancia: colocada.distancia,
          ancho,
          alto,
          antepecho,
          volteado: get().voltearSiguiente,
        });
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
        const origen = puntos[0];
        const metodo = herramienta === "mover" ? "elementos.mover" : "elementos.copiar";
        const ok = await ejecutar(metodo, {
          globalids: get().seleccionados,
          dx: p[0] - origen[0],
          dy: p[1] - origen[1],
          dz: 0,
        });
        if (ok) {
          set({ puntosHerramienta: [], ratonHerramienta: null, engancheHerramienta: null });
        }
        return;
      }
      void agregar;
    },

    dobleClicEnPlanta: async () => {
      const herramienta = get().herramienta;
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
      }
    },

    voltearAbertura: () => set({ voltearSiguiente: !get().voltearSiguiente }),

    borrarSeleccion: async () => {
      const gids = get().seleccionados;
      if (gids.length === 0) {
        set({ aviso: "Seleccione uno o varios elementos para borrar." });
        return;
      }
      await ejecutar("elementos.borrar", { globalids: gids });
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
          nivelesVisibles: niveles.map((n) => n.globalid),
          categorias: CATEGORIAS_TODAS(),
          estilo: "sombreado",
          escala: 100,
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
      const vistas = get().vistas.map((v) =>
        v.tipo === "planta" && v.nivel === globalid
          ? { ...v, nombre: `Planta ${nombre}`, alturaPlano: elevacion + 1.2 }
          : v,
      );
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

    editarElemento: async (globalid, cambios) => {
      const ok = await ejecutar("elementos.editar", { globalid, cambios });
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
