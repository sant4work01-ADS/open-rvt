// O065B: slice «avisos» del store (movido tal cual desde estado.ts).
import { MENSAJE_NUCLEO_CAIDO, fijarEstadoNucleoCaido } from "../../nucleoCaido";
import type { EstadoModelo, SetEstado } from "../tipos";

export function crearSliceAvisos(
  set: SetEstado,
): Pick<EstadoModelo, "limpiarAviso" | "fijarAviso" | "fijarPistaTab" | "marcarNucleoCaido" | "cerrarAvisoNucleo" | "reactivarEdicion"> {
  return {
    limpiarAviso: () => set({ aviso: null }),

    fijarAviso: (texto) => set({ aviso: texto }),
    fijarPistaTab: (texto) => set({ pistaTab: texto }),

    marcarNucleoCaido: (mensaje) => {
      fijarEstadoNucleoCaido(true);
      set({
        nucleoCaido: true,
        avisoNucleo: mensaje || MENSAJE_NUCLEO_CAIDO,
        aviso: mensaje || MENSAJE_NUCLEO_CAIDO,
      });
    },
    cerrarAvisoNucleo: () => set({ avisoNucleo: null }),
    reactivarEdicion: () => {
      fijarEstadoNucleoCaido(false);
      set({ nucleoCaido: false, avisoNucleo: null });
    },

  };
}
