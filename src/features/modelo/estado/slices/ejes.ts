// O065B: slice «ejes» del store (movido tal cual desde estado.ts).
import type { BloqueEjesReticula } from "../tipos";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceEjes(
  _set: SetEstado,
  _get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "crearEje" | "crearEjesPorSeparaciones" | "crearReticula" | "editarRebase" | "separarEjes" | "editarEje" | "moverEje" | "borrarEje"> {
  const { ejecutar } = h;
  return {
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

    editarEje: async (globalid, etiqueta) => {
      await ejecutar("ejes.editar", { globalid, etiqueta });
    },

    moverEje: async (globalid, desplazamiento) => {
      return ejecutar("ejes.mover", { globalid, desplazamiento });
    },

    borrarEje: async (globalid) => {
      await ejecutar("ejes.borrar", { globalid });
    },

  };
}
