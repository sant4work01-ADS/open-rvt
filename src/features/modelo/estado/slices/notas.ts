// O065B: slice «notas» del store (movido tal cual desde estado.ts).
import type { NodoArbol } from "../../arbol";
import type { Nota } from "../../anotaciones3d";
import type { RespuestaComando } from "../tipos";
import { rpc } from "../ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";

export function crearSliceNotas(
  set: SetEstado,
  get: GetEstado,
): Pick<EstadoModelo, "crearNota" | "editarNota" | "moverNota" | "borrarNota" | "seleccionarNota"> {
  return {
    crearNota: async (texto, posicion, nivel) => {
      try {
        const resultado = await rpc<RespuestaComando>("notas.crear", {
          texto,
          x: posicion[0],
          y: posicion[1],
          z: posicion[2],
          nivel: nivel ?? "",
        });
        const [notas, arbol] = await Promise.all([
          rpc<Nota[]>("notas.listar"),
          rpc<NodoArbol>("modelo.arbol").catch(() => get().arbol),
        ]);
        set({
          notas,
          arbol,
          conCambios: true,
          aviso: resultado.mensaje ?? "Nota creada.",
          error: null,
        });
        return resultado.creados?.[0] ?? null;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    },

    editarNota: async (globalid, texto) => {
      try {
        const resultado = await rpc<RespuestaComando>("notas.editar", { globalid, texto });
        const notas = await rpc<Nota[]>("notas.listar");
        const arbol = await rpc<NodoArbol>("modelo.arbol").catch(() => get().arbol);
        set({ notas, arbol, conCambios: true, aviso: resultado.mensaje ?? "Nota editada." });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    moverNota: async (globalid, posicion) => {
      try {
        const resultado = await rpc<RespuestaComando>("notas.mover", {
          globalid,
          x: posicion[0],
          y: posicion[1],
          z: posicion[2],
        });
        const notas = await rpc<Nota[]>("notas.listar");
        const arbol = await rpc<NodoArbol>("modelo.arbol").catch(() => get().arbol);
        set({ notas, arbol, conCambios: true, aviso: resultado.mensaje ?? "Nota movida." });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    borrarNota: async (globalid) => {
      try {
        const resultado = await rpc<RespuestaComando>("notas.borrar", { globalid });
        const [notas, arbol] = await Promise.all([
          rpc<Nota[]>("notas.listar"),
          rpc<NodoArbol>("modelo.arbol").catch(() => get().arbol),
        ]);
        set({
          notas,
          arbol,
          notaSeleccionada: null,
          conCambios: true,
          aviso: resultado.mensaje ?? "Nota borrada.",
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    seleccionarNota: (globalid) =>
      set({ notaSeleccionada: globalid, seleccion: null, seleccionados: [] }),

  };
}
