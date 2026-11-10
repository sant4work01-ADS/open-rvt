// O065B: slice «edicion» del store (movido tal cual desde estado.ts).
import type { RespuestaInfo } from "../../tipos";
import { rpc } from "../ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceEdicion(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "borrarSeleccion" | "deshacer" | "rehacer" | "editarElemento" | "editarRestricciones" | "editarRestriccionesVarios"> {
  const { cargar, ejecutar, refrescarPropiedades } = h;
  return {
    borrarSeleccion: async () => {
      const nota = get().notaSeleccionada;
      if (nota) {
        await get().borrarNota(nota);
        return;
      }
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

    editarRestriccionesVarios: async (globalids, cambios) => {
      // O050: el núcleo aplica todos los cambios con una sola instantánea.
      const ok = await ejecutar("restricciones.editar_varios", {
        globalids,
        ...cambios,
      });
      const elegido = globalids[globalids.length - 1];
      if (ok) await get().seleccionarVarios(globalids);
      else if (elegido) await refrescarPropiedades(elegido);
    },

  };
}
