// O065B: slice «arbol» del store (movido tal cual desde estado.ts).
import { clavesParaAislar } from "../../arbol";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceArbol(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "alternarNodoArbol" | "aislarNodoArbol" | "mostrarTodoArbol" | "moverPartidaObra" | "crearCapituloObra" | "renombrarCapituloObra" | "moverCapituloObra" | "borrarCapituloObra"> {
  const { persistirVistas, ejecutar } = h;
  return {
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

  };
}
