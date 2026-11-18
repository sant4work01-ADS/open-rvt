// O070: slice de la pantalla dividida. La vista activa del modelo es siempre la del
// panel activo, así que todo el código que ya leía `vistaActivaId` sigue funcionando
// sin saber que hay dos paneles.
import {
  conVistaEnPanel,
  limitarProporcion,
  otroPanel,
  sanearPaneles,
  type OrientacionDivision,
  type PanelVista,
} from "../../paneles";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

/** Vista que debe ir en el otro panel al dividir: otra distinta de la actual. */
function vistaCompanera(
  vistas: EstadoModelo["vistas"],
  actual: string | null,
): string | null {
  if (vistas.length === 0) return null;
  const tipoActual = vistas.find((v) => v.id === actual)?.tipo;
  return (
    vistas.find((v) => v.id !== actual && v.tipo !== tipoActual)?.id ??
    vistas.find((v) => v.id !== actual)?.id ??
    null
  );
}

function vistaDePanel(
  paneles: [PanelVista, PanelVista],
  indice: 0 | 1,
): string | null {
  return paneles[indice]?.vistaId ?? null;
}

export function crearSlicePaneles(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<
  EstadoModelo,
  | "dividirVistas"
  | "unirVistas"
  | "fijarPanelActivo"
  | "fijarVistaPanel"
  | "abrirEnOtroPanel"
  | "fijarProporcionDivision"
> {
  const { persistirPaneles } = h;
  return {
    dividirVistas: async (orientacion: OrientacionDivision) => {
      const estado = get();
      const vistas = estado.vistas;
      const actual =
        estado.vistaActivaId && estado.vistaActivaId !== "cantidades"
          ? estado.vistaActivaId
          : (vistas[0]?.id ?? null);
      // El panel 0 conserva la vista activa; el otro recibe otra vista distinta.
      const recordada = vistaDePanel(estado.paneles, 1);
      const companera =
        recordada && recordada !== actual
          ? recordada
          : vistaCompanera(vistas, actual);
      const paneles: [PanelVista, PanelVista] = [
        { vistaId: actual },
        { vistaId: companera },
      ];
      set({
        dividida: true,
        orientacionDivision: orientacion,
        paneles,
        panelActivo: 0,
        vistaActivaId: actual,
        modoCorte: false,
        puntoCorte: null,
      });
      await persistirPaneles(get());
    },

    unirVistas: async () => {
      const estado = get();
      const activa =
        vistaDePanel(estado.paneles, estado.panelActivo) ??
        (estado.vistaActivaId !== "cantidades" ? estado.vistaActivaId : null) ??
        (estado.vistas[0]?.id ?? null);
      const paneles = conVistaEnPanel(estado.paneles, 0, activa);
      set({
        dividida: false,
        panelActivo: 0,
        paneles,
        vistaActivaId: activa,
      });
      await persistirPaneles(get());
    },

    fijarPanelActivo: (indice) => {
      const estado = get();
      if (estado.panelActivo === indice) return;
      // Cambiar de panel con una herramienta a medias equivale a pulsar Esc.
      if (estado.modoCorte) estado.cancelarCorte();
      if (get().herramienta) {
        if (!get().cancelarTrazo()) get().cancelarHerramienta();
      }
      const vistaId = vistaDePanel(get().paneles, indice);
      set({
        panelActivo: indice,
        vistaActivaId: vistaId ?? get().vistaActivaId,
        ejeSeleccionado: null,
        nivelSeleccionado: null,
      });
      void persistirPaneles(get());
    },

    fijarVistaPanel: async (indice, vistaId) => {
      const estado = get();
      const paneles = conVistaEnPanel(estado.paneles, indice, vistaId);
      set({
        paneles,
        ...(estado.panelActivo === indice ? { vistaActivaId: vistaId } : {}),
      });
      await persistirPaneles(get());
    },

    abrirEnOtroPanel: async (vistaId) => {
      if (!get().dividida) await get().dividirVistas("vertical");
      const indice = otroPanel(get().panelActivo);
      await get().fijarVistaPanel(indice, vistaId);
    },

    fijarProporcionDivision: (proporcion) => {
      set({ proporcionDivision: limitarProporcion(proporcion) });
      void persistirPaneles(get());
    },
  };
}

/** Saneamiento compartido al cargar o borrar vistas: deja ambos paneles coherentes. */
export function panelesSaneados(
  estado: Pick<EstadoModelo, "paneles" | "panelActivo" | "vistas">,
): { paneles: [PanelVista, PanelVista]; vistaActivaId: string | null } {
  const resultado = sanearPaneles(
    estado.paneles,
    estado.vistas.map((v) => v.id),
    null,
  );
  const activa = vistaDePanel(resultado.paneles, estado.panelActivo);
  if (activa) return { paneles: resultado.paneles, vistaActivaId: activa };
  const respaldo = estado.vistas.find((v) => v.tipo === "planta")?.id ?? estado.vistas[0]?.id ?? null;
  const paneles = conVistaEnPanel(resultado.paneles, estado.panelActivo, respaldo);
  return { paneles, vistaActivaId: respaldo };
}
