// Estado de las actualizaciones para toda la app: aviso de la barra de estado,
// diálogo, progreso y sección de Configuración. Un solo servicio inyectable.
import { create } from "zustand";
import { abrirEnlace, esLinux, URL_DESCARGA } from "./servicio";
import {
  servicioTauri,
  traducirErrorActualizacion,
  type Actualizacion,
  type ProgresoDescarga,
  type ServicioActualizaciones,
} from "./servicio";

export type EstadoActualizaciones =
  | "inactivo"
  | "buscando"
  | "alDia"
  | "disponible"
  | "descargando"
  | "instalando"
  | "error";

interface TiendaActualizaciones {
  servicio: ServicioActualizaciones;
  versionActual: string | null;
  actualizacion: Actualizacion | null;
  estado: EstadoActualizaciones;
  error: string | null;
  progreso: ProgresoDescarga | null;
  dialogo: boolean;
  /** Versiones que el usuario dejó para después: no se vuelve a avisar de ellas (CA-6). */
  descartadas: string[];
  fijarServicio: (s: ServicioActualizaciones) => void;
  comprobar: () => Promise<void>;
  comprobarAutomatica: () => Promise<void>;
  abrirDialogo: () => void;
  cerrarDialogo: () => void;
  instalarAhora: () => Promise<void>;
}

export const useActualizaciones = create<TiendaActualizaciones>((set, get) => ({
  servicio: servicioTauri,
  versionActual: null,
  actualizacion: null,
  estado: "inactivo",
  error: null,
  progreso: null,
  dialogo: false,
  descartadas: [],

  fijarServicio: (servicio) => set({ servicio }),

  comprobar: async () => {
    const { servicio } = get();
    set({ estado: "buscando", error: null });
    try {
      const [version, actualizacion] = await Promise.all([
        servicio.versionActual(),
        servicio.consultar(),
      ]);
      set({
        versionActual: version,
        actualizacion,
        estado: actualizacion ? "disponible" : "alDia",
        error: null,
      });
    } catch (e) {
      set({ estado: "error", error: traducirErrorActualizacion(e), actualizacion: null });
    }
  },

  comprobarAutomatica: async () => {
    const { servicio } = get();
    try {
      if (!(await servicio.disponible())) return;
      const version = await servicio.versionActual();
      const actualizacion = await servicio.consultar();
      set({
        versionActual: version,
        actualizacion,
        estado: actualizacion ? "disponible" : "alDia",
        error: null,
      });
    } catch {
      // En segundo plano no se molesta al usuario ni se registran errores (CA-7).
    }
  },

  abrirDialogo: () => set({ dialogo: true }),
  cerrarDialogo: () => {
    const { actualizacion, descartadas } = get();
    set({
      dialogo: false,
      // «Después» silencia esa versión durante la sesión.
      descartadas:
        actualizacion && !descartadas.includes(actualizacion.version)
          ? [...descartadas, actualizacion.version]
          : descartadas,
    });
  },

  instalarAhora: async () => {
    const { servicio, actualizacion } = get();
    if (!actualizacion) return;
    // OPEN-RVT: en Linux el .deb se descarga aparte; no hay nada que instalar ni relanzar.
    if (esLinux()) {
      await abrirEnlace(URL_DESCARGA);
      set({ estado: "disponible", error: null });
      return;
    }
    set({ estado: "descargando", error: null, progreso: { descargado: 0, total: null } });
    try {
      await servicio.instalar(
        actualizacion,
        (progreso) => set({ progreso }),
        async () => {
          // OPEN-RVT: nunca se instala con el modelo sin guardar.
          const { useModelo } = await import("@/features/modelo/estado");
          const estado = useModelo.getState();
          if (estado.conCambios && !(await estado.asegurarSinCambios())) {
            throw new Error("No se pudo guardar el modelo; no se instalará la actualización");
          }
        },
      );
      set({ estado: "instalando" });
      await servicio.relanzar();
    } catch (e) {
      // Un fallo al guardar el modelo se explica tal cual: no se instaló nada.
      const texto =
        e instanceof Error && /no se pudo guardar/i.test(e.message)
          ? "No se pudo guardar el modelo; no se instaló la actualización para no perder cambios."
          : traducirErrorActualizacion(e);
      set({ estado: "error", error: texto, progreso: null });
    }
  },
}));

/** ¿Hay que enseñar el aviso no intrusivo de la barra de estado? (CA-1 y CA-6) */
export function avisoPendiente(s: TiendaActualizaciones): boolean {
  return (
    s.actualizacion !== null &&
    !s.dialogo &&
    !s.descartadas.includes(s.actualizacion.version)
  );
}
