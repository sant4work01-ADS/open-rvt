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

export type RespuestaGuardar = "guardar" | "descartar" | "cancelar";

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
  propiedades: PropiedadesElemento | null;
  cargando: boolean;
  error: string | null;
  aviso: string | null;
  modoCorte: boolean;
  puntoCorte: [number, number] | null;
  preguntaGuardar: PreguntaGuardar | null;
  tiempoCargaMs: number | null;
  vistasPersistidas: boolean;

  nuevo: () => Promise<boolean>;
  abrir: (ruta?: string) => Promise<boolean>;
  guardar: () => Promise<boolean>;
  guardarComo: (ruta?: string) => Promise<boolean>;
  asegurarSinCambios: () => Promise<boolean>;
  preguntarGuardar: () => Promise<RespuestaGuardar>;
  responderGuardar: (respuesta: RespuestaGuardar) => void;
  fijarVista: (id: string) => void;
  actualizarVista: (id: string, cambios: Partial<Vista>) => Promise<void>;
  seleccionar: (globalid: string | null) => Promise<void>;
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
    const [niveles, elementos, teselado, vistasCrudas] = await Promise.all([
      rpc<Nivel[]>("modelo.niveles"),
      rpc<Elemento[]>("modelo.elementos"),
      rpc<RespuestaTeselado>("geometria.teselar", { globalids: null }),
      rpc<unknown>("vistas.leer"),
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
      propiedades: null,
      cargando: false,
      error: null,
      aviso: null,
      modoCorte: false,
      puntoCorte: null,
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
    propiedades: null,
    cargando: false,
    error: null,
    aviso: null,
    modoCorte: false,
    puntoCorte: null,
    preguntaGuardar: null,
    tiempoCargaMs: null,
    vistasPersistidas: false,

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

    seleccionar: async (globalid) => {
      const token = ++tokenSeleccion;
      if (!globalid) {
        set({ seleccion: null, propiedades: null });
        return;
      }
      set({ seleccion: globalid });
      try {
        const propiedades = await rpc<PropiedadesElemento>("modelo.propiedades", {
          globalid,
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
