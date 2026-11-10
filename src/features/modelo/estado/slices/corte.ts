// O065B: slice «corte» del store (movido tal cual desde estado.ts).
import { CATEGORIAS_TODAS } from "../../tipos";
import { crearVistaCorte, numeroDeCorte } from "../../vistas";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceCorte(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "pedirAjustar" | "iniciarCorte" | "cancelarCorte" | "anadirPuntoCorte"> {
  const { persistirVistas } = h;
  return {
    pedirAjustar: () => set({ ajustarToken: get().ajustarToken + 1 }),

    iniciarCorte: () => {
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista || vista.tipo !== "planta") {
        set({ aviso: "Para crear un corte, abra primero una planta." });
        return;
      }
      set({
        modoCorte: true,
        puntoCorte: null,
        aviso: "Nueva vista de corte: haga dos clics en la planta.",
      });
    },

    cancelarCorte: () => {
      set({ modoCorte: false, puntoCorte: null, aviso: null });
    },

    anadirPuntoCorte: async (punto) => {
      const primero = get().puntoCorte;
      if (!primero) {
        set({ puntoCorte: punto, aviso: "Primer punto del corte: haga el segundo clic." });
        return;
      }
      if (Math.hypot(punto[0] - primero[0], punto[1] - primero[1]) < 1e-3) {
        set({ aviso: "Los dos puntos del corte no pueden coincidir." });
        return;
      }
      const estado = get();
      const planta = estado.vistas.find((v) => v.id === estado.vistaActivaId);
      if (!planta) return;
      const corte = crearVistaCorte({
        puntoA: primero,
        puntoB: punto,
        alturaPlano: planta.alturaPlano ?? 1.2,
        nivel: planta.nivel,
        nivelesVisibles: planta.nivelesVisibles,
        categorias: planta.categorias ?? CATEGORIAS_TODAS(),
        estilo: planta.estilo,
        escala: planta.escala,
        indice: numeroDeCorte(estado.vistas),
      });
      const vistas = [...estado.vistas, corte];
      set({
        vistas,
        vistaActivaId: corte.id,
        modoCorte: false,
        puntoCorte: null,
        conCambios: true,
        aviso: `Corte creado: ${corte.nombre}.`,
        seleccion: null,
        propiedades: null,
      });
      await persistirVistas(vistas);
    },

  };
}
