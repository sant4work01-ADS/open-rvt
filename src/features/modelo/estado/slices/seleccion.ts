// O065B: slice «seleccion» del store (movido tal cual desde estado.ts).
import type { PropiedadesElemento } from "../../tipos";
import type { Punto2 } from "../../herramientas";
import { aberturaEnPunto } from "../../aberturasVista";
import { rpc } from "../ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";

let tokenSeleccion = 0;

export function crearSliceSeleccion(
  set: SetEstado,
  get: GetEstado,
): Pick<
    EstadoModelo,
    | "fijarEjeSeleccionado"
    | "fijarNivelSeleccionado"
    | "seleccionar"
    | "seleccionarVarios"
    | "seleccionarAberturaEnPunto"
  > {
  return {
    fijarEjeSeleccionado: (globalid) => {
      set({ ejeSeleccionado: globalid });
    },

    fijarNivelSeleccionado: (globalid) => {
      set({ nivelSeleccionado: globalid });
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

    seleccionarAberturaEnPunto: (punto: Punto2, agregar = false, tolerancia = 0.05) => {
      const abertura = aberturaEnPunto(get().aberturas, punto, tolerancia);
      if (!abertura) return false;
      set({ ejeSeleccionado: null });
      void get().seleccionar(abertura.globalid, agregar);
      return true;
    },

    seleccionarVarios: async (globalids) => {
      const token = ++tokenSeleccion;
      if (globalids.length === 0) {
        set({ seleccion: null, seleccionados: [], propiedades: null });
        return;
      }
      const elegido = globalids[globalids.length - 1] ?? null;
      set({ ejeSeleccionado: null, seleccion: elegido, seleccionados: [...globalids] });
      if (!elegido) return;
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

  };
}
