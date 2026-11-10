// O065B: slice «opciones» del store (movido tal cual desde estado.ts).
import { cotasTemporalesNivel, elevacionDesdeCota, nombreNivelAutomatico } from "../../niveles";
import type { OpcionesNivel } from "../tipos";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceOpciones(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "fijarCotasMoverSiguientes" | "fijarOpcionesMuro" | "fijarOpcionesLosa" | "fijarOpcionesEspejo" | "fijarOpcionesMatriz" | "fijarOpcionesCerramiento" | "voltearMuro" | "fijarTipoHerramienta" | "fijarOpcionesNivel"> {
  const { ejecutar } = h;
  return {
    fijarCotasMoverSiguientes: (valor) => set({ cotasMoverSiguientes: valor }),

    fijarOpcionesMuro: (cambios) =>
      set({ opcionesMuro: { ...get().opcionesMuro, ...cambios } }),
    fijarOpcionesLosa: (cambios) =>
      set({ opcionesLosa: { ...get().opcionesLosa, ...cambios } }),
    fijarOpcionesEspejo: (cambios) =>
      set({ opcionesEspejo: { ...get().opcionesEspejo, ...cambios } }),
    fijarOpcionesMatriz: (cambios) =>
      set({ opcionesMatriz: { ...get().opcionesMatriz, ...cambios } }),
    fijarOpcionesCerramiento: (cambios) =>
      set({ opcionesCerramiento: { ...get().opcionesCerramiento, ...cambios } }),
    voltearMuro: async (globalid) => {
      const ok = await ejecutar("muros.voltear", { globalid });
      if (ok) await get().seleccionar(globalid);
    },

    fijarTipoHerramienta: (herramienta, nombre) =>
      set({ tipoHerramienta: { ...get().tipoHerramienta, [herramienta]: nombre } }),

    fijarOpcionesNivel: (cambios) => {
      const estado = get();
      const siguiente: OpcionesNivel = {
        ...estado.opcionesNivel,
        ...cambios,
        ...(cambios.nombre !== undefined ? { nombreAutomatico: false } : {}),
      };
      // O029: al escribir la elevación, el nombre automático y las cotas salen de
      // esa elevación real, no de la última posición del cursor.
      if (cambios.elevacionTexto !== undefined) {
        const referencia =
          estado.puntosHerramienta[estado.puntosHerramienta.length - 1]?.[1] ??
          estado.ratonHerramienta?.[1] ??
          estado.niveles[0]?.elevacion ??
          0;
        const cotas = cotasTemporalesNivel(referencia, estado.niveles);
        const z = elevacionDesdeCota(cotas.inferior, cambios.elevacionTexto);
        if (z !== null) {
          const cotasNuevas = cotasTemporalesNivel(z, estado.niveles);
          if (siguiente.nombreAutomatico) {
            siguiente.nombre = nombreNivelAutomatico(estado.niveles, z);
          }
          set({ opcionesNivel: siguiente, cotasNivel: {
            inferior: cotasNuevas.inferior,
            superior: cotasNuevas.superior,
          } });
          return;
        }
      }
      set({ opcionesNivel: siguiente });
    },

  };
}
