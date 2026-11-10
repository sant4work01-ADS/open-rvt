// O065B: slice «niveles» del store (movido tal cual desde estado.ts).
import { normalizarVistas } from "../../vistas";
import { sincronizarPlantas } from "../utilidades";
import { rpc } from "../ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceNiveles(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "crearNivel" | "copiarNivel" | "arregloNiveles" | "editarNivel" | "borrarNivel" | "separarNiveles"> {
  const { persistirVistas, ejecutarResultado, ejecutar } = h;
  return {
    crearNivel: async (nombre, elevacion, opciones = {}) => {
      const resultado = await ejecutarResultado("niveles.crear", {
        nombre,
        elevacion,
        crear_planta: opciones.crearPlanta ?? true,
        // O031: se guardan las vistas de la sesión en la misma instantánea; así
        // Deshacer no deja el modelo sin plantas, alzados ni 3D.
        vistas: get().vistas,
      });
      if (!resultado) return false;
      // O029: el núcleo crea la planta en el mismo paso (mismo Deshacer); se releen
      // las vistas para que el navegador y el visor las vean ya guardadas.
      if (opciones.crearPlanta ?? true) {
        const crudas = await rpc<unknown>("vistas.leer").catch(() => null);
        if (crudas) {
          const delNucleo = normalizarVistas(crudas);
          const nivel = (resultado.nivel as { globalid?: string } | null)?.globalid;
          const vista = nivel
            ? delNucleo.find((v) => v.tipo === "planta" && v.nivel === nivel)
            : undefined;
          // Se conservan las vistas automáticas de la sesión (alzados, cortes y 3D)
          // que aún no se habían guardado; del núcleo solo llega la planta nueva.
          const vistas = [...get().vistas];
          for (const candidata of delNucleo) {
            const i = vistas.findIndex((v) => v.id === candidata.id);
            if (i >= 0) vistas[i] = candidata;
            else vistas.push(candidata);
          }
          // O029: se conserva la vista activa (el alzado) al crear el nivel; la
          // planta nueva solo aparece en el navegador.
          void vista;
          set({ vistas, conCambios: true });
        }
      }
      return true;
    },

    copiarNivel: async (globalid, desfase) => {
      const resultado = await ejecutarResultado("niveles.copiar", {
        globalid,
        desfase,
        vistas: get().vistas,
      });
      if (!resultado) return false;
      const crudas = await rpc<unknown>("vistas.leer").catch(() => null);
      if (crudas) {
        const delNucleo = normalizarVistas(crudas);
        const nivel = (resultado.nivel as { globalid?: string } | null)?.globalid;
        const vista = nivel
          ? delNucleo.find((v) => v.tipo === "planta" && v.nivel === nivel)
          : undefined;
        const vistas = [...get().vistas];
        for (const candidata of delNucleo) {
          const i = vistas.findIndex((v) => v.id === candidata.id);
          if (i >= 0) vistas[i] = candidata;
          else vistas.push(candidata);
        }
        // O029: copiar un nivel tampoco cambia la vista activa.
        void vista;
        set({ vistas });
      }
      return true;
    },

    arregloNiveles: async (globalid, cantidad, separacion) => {
      const resultado = await ejecutarResultado("niveles.arreglo", {
        globalid,
        cantidad,
        separacion,
        vistas: get().vistas,
      });
      if (!resultado) return false;
      const crudas = await rpc<unknown>("vistas.leer").catch(() => null);
      if (crudas) {
        const vistas = [...get().vistas];
        for (const candidata of normalizarVistas(crudas)) {
          const i = vistas.findIndex((v) => v.id === candidata.id);
          if (i >= 0) vistas[i] = candidata;
          else vistas.push(candidata);
        }
        set({ vistas });
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

  };
}
