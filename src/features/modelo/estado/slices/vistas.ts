// O065B: slice «vistas» del store (movido tal cual desde estado.ts).
import type { Vista } from "../../tipos";
import { normalizarAjusteEje } from "../../ejesVista";
import { normalizarAjusteNivel } from "../../niveles";
import { plantaUnicaDeNivel } from "../utilidades";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceVistas(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "fijarVista" | "actualizarVista" | "duplicarVista" | "eliminarVista" | "fijarAjustesEjes" | "fijarAjustesNiveles" | "guardarEstilos" | "abrirDialogoEstilos" | "cerrarDialogoEstilos" | "abrirDialogoAnotacion" | "cerrarDialogoAnotacion" | "abrirDialogoCotas" | "cerrarDialogoCotas"> {
  const { persistirVistas, persistirEstilos } = h;
  return {
    fijarVista: (id) => {
      const vista = get().vistas.find((v) => v.id === id);
      const opciones = get().opcionesCerramiento;
      // O043: la elección de nivel de cerramiento solo manda en planta; al pasar
      // a alzado, corte o 3D vuelve la regla de O041 (tope del muro).
      const limpiarNivel =
        vista !== undefined && vista.tipo !== "planta" && opciones.nivel !== "";
      set({
        vistaActivaId: id,
        modoCorte: false,
        puntoCorte: null,
        ejeSeleccionado: null,
        nivelSeleccionado: null,
        ...(limpiarNivel ? { opcionesCerramiento: { ...opciones, nivel: "" } } : {}),
      });
    },

    actualizarVista: async (id, cambios) => {
      const vistas = get().vistas.map((v) => (v.id === id ? { ...v, ...cambios, id } : v));
      set({ vistas, conCambios: true });
      await persistirVistas(vistas);
    },

    duplicarVista: async (id) => {
      const estado = get();
      const original = estado.vistas.find((v) => v.id === id);
      if (!original) return null;
      const base = `${original.nombre} (copia)`;
      const nombres = new Set(estado.vistas.map((v) => v.nombre));
      let nombre = base;
      let n = 2;
      while (nombres.has(nombre)) {
        nombre = `${base} ${n}`;
        n += 1;
      }
      let nuevoId = `vista-${Date.now().toString(36)}`;
      while (estado.vistas.some((v) => v.id === nuevoId)) nuevoId += "-c";
      const copia: Vista = {
        ...original,
        id: nuevoId,
        nombre,
        categorias: { ...original.categorias },
        nivelesVisibles: [...original.nivelesVisibles],
        estilos: original.estilos ? { ...original.estilos } : undefined,
        ejes: original.ejes ? { ...original.ejes } : undefined,
        nivelesAjuste: original.nivelesAjuste ? { ...original.nivelesAjuste } : undefined,
      };
      const indice = estado.vistas.findIndex((v) => v.id === id);
      const vistas = [...estado.vistas];
      vistas.splice(indice + 1, 0, copia);
      set({ vistas, vistaActivaId: nuevoId, conCambios: true, modoCorte: false, puntoCorte: null });
      await persistirVistas(vistas);
      return nuevoId;
    },

    eliminarVista: async (id) => {
      const estado = get();
      const vista = estado.vistas.find((v) => v.id === id);
      if (!vista) return false;
      const delMismoTipo = estado.vistas.filter((v) => v.tipo === vista.tipo);
      if (delMismoTipo.length <= 1) return false;
      // O037: la última planta de un nivel es el nivel. Eliminarla borra el nivel
      // (si el núcleo lo rechaza, por elementos o restricciones, no se toca nada).
      if (
        vista.nivel &&
        plantaUnicaDeNivel(estado.vistas, vista) &&
        estado.niveles.some((n) => n.globalid === vista.nivel)
      ) {
        await get().borrarNivel(vista.nivel);
        return !get().vistas.some((v) => v.id === id);
      }
      const vistas = estado.vistas.filter((v) => v.id !== id);
      const activa = estado.vistaActivaId === id ? (vistas[0]?.id ?? null) : estado.vistaActivaId;
      set({ vistas, vistaActivaId: activa, conCambios: true, modoCorte: false, puntoCorte: null });
      await persistirVistas(vistas);
      return true;
    },

    fijarAjustesEjes: async (vistaId, cambios) => {
      const vista = get().vistas.find((v) => v.id === vistaId);
      if (!vista) return;
      const ejes = { ...(vista.ejes ?? {}) };
      for (const [globalid, ajuste] of Object.entries(cambios)) {
        // La misma validación que al leer el pset: máximo 2 codos y puntos finitos.
        const limpio = normalizarAjusteEje(ajuste);
        if (!limpio) delete ejes[globalid];
        else ejes[globalid] = limpio;
      }
      const vistas = get().vistas.map((v) =>
        v.id === vistaId
          ? { ...v, id: v.id, ejes: Object.keys(ejes).length > 0 ? ejes : undefined }
          : v,
      );
      set({ vistas, conCambios: true });
      // Una sola escritura del pset = una sola entrada de deshacer por arrastre.
      await persistirVistas(vistas);
    },

    fijarAjustesNiveles: async (vistaId, cambios) => {
      const vista = get().vistas.find((v) => v.id === vistaId);
      if (!vista) return;
      const nivelesAjuste = { ...(vista.nivelesAjuste ?? {}) };
      for (const [globalid, ajuste] of Object.entries(cambios)) {
        // Misma validación que al leer el pset: solo desplazamientos finitos.
        const limpio = normalizarAjusteNivel(ajuste);
        if (!limpio) delete nivelesAjuste[globalid];
        else nivelesAjuste[globalid] = limpio;
      }
      const vistas = get().vistas.map((v) =>
        v.id === vistaId
          ? {
              ...v,
              id: v.id,
              nivelesAjuste:
                Object.keys(nivelesAjuste).length > 0 ? nivelesAjuste : undefined,
            }
          : v,
      );
      set({ vistas, conCambios: true });
      // Una sola escritura del pset = una sola entrada de deshacer por arrastre.
      await persistirVistas(vistas);
    },

    guardarEstilos: async (estilos) => {
      try {
        await persistirEstilos(estilos);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    abrirDialogoEstilos: () => set({ dialogoEstilos: true }),
    cerrarDialogoEstilos: () => set({ dialogoEstilos: false }),
    abrirDialogoAnotacion: () => set({ dialogoAnotacion: true }),
    cerrarDialogoAnotacion: () => set({ dialogoAnotacion: false }),
    abrirDialogoCotas: () => set({ dialogoCotas: true }),
    cerrarDialogoCotas: () => set({ dialogoCotas: false }),

    // O007a: el editor de tipos sustituye el área de trabajo mientras está abierto.
  };
}
