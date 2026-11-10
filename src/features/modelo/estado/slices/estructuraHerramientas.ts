// O065B: slice «estructuraHerramientas» del store (movido tal cual desde estado.ts).
import { bitacoraHerramienta } from "@/lib/bitacora";
import type { AlineacionActiva } from "../tipos";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceEstructuraHerramientas(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "elegirReferenciaAlinear" | "aplicarAlinear" | "alternarCandadoAlinear" | "fijarColumnaConZapata" | "fijarTipoZapata" | "abrirDialogoCastillos" | "cerrarDialogoCastillos" | "preguntarZapata" | "responderZapata"> {
  const { ejecutarResultado } = h;
  return {
    elegirReferenciaAlinear: (referencia) => {
      set({
        referenciaAlinear: referencia,
        alineando: null,
        puntosHerramienta: [],
        aviso:
          "Alinear: ahora haga clic en la cara del elemento que quiere mover " +
          "(Ctrl mantiene la referencia para alinear varios; Esc termina).",
      });
      bitacoraHerramienta("alinear", "referencia");
    },

    aplicarAlinear: async (elemento, cara, punto) => {
      const referencia = get().referenciaAlinear;
      if (!referencia) return;
      const resultado = await ejecutarResultado("restricciones.alinear", {
        referencia,
        elemento,
        cara,
        bloquear: false,
      });
      if (!resultado) return;
      const datos = resultado.alineacion as Omit<AlineacionActiva, "punto"> | undefined;
      if (!datos) return;
      await get().seleccionar(elemento);
      set({
        alineando: { ...datos, punto },
        aviso:
          (resultado.mensaje || "Elemento alineado.") +
          " El candado está abierto: ciérrelo para guardar la restricción.",
      });
      bitacoraHerramienta("alinear", "terminar");
    },

    alternarCandadoAlinear: async () => {
      const alineacion = get().alineando;
      if (!alineacion) return;
      const bloquear = !alineacion.bloqueada;
      const resultado = await ejecutarResultado("restricciones.alinear", {
        referencia: { tipo: alineacion.tipo, globalid: alineacion.referencia },
        elemento: alineacion.elemento,
        cara: alineacion.cara,
        bloquear,
      });
      if (!resultado) return;
      set({
        alineando: { ...alineacion, bloqueada: bloquear },
        aviso: bloquear
          ? "Candado cerrado: el elemento seguirá a su referencia."
          : "Candado abierto: la restricción se ha quitado.",
      });
      bitacoraHerramienta("alinear", bloquear ? "bloquear" : "desbloquear");
    },

    fijarColumnaConZapata: (valor) => set({ columnaConZapata: valor }),
    fijarTipoZapata: (nombre) => set({ tipoZapata: nombre }),
    abrirDialogoCastillos: () => set({ dialogoCastillos: true }),
    cerrarDialogoCastillos: () => set({ dialogoCastillos: false }),
    preguntarZapata: () =>
      new Promise<boolean>((resolver) => set({ preguntaZapata: { resolver } })),
    responderZapata: (ok) => {
      const pregunta = get().preguntaZapata;
      set({ preguntaZapata: null });
      pregunta?.resolver(ok);
    },

  };
}
