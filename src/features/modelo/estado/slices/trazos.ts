// O065B: slice «trazos» del store (movido tal cual desde estado.ts).
import { bitacoraHerramienta } from "@/lib/bitacora";
import { cortarRectas, recortarRecta } from "../../planta";
import type { ModoRecorte } from "../tipos";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceTrazos(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "fijarModoRecorte" | "clicRecorte" | "previsualizarRecorte" | "terminarRecorteExtender" | "cancelarTrazo"> {
  const { ejecutarResultado, lineaDeElemento, lineaDeEje } = h;
  return {
    fijarModoRecorte: (modo) => {
      const avisos: Record<ModoRecorte, string> = {
        esquina: "A esquina: haga clic en dos elementos lineales.",
        elemento: "Un elemento: clic en la referencia (elemento o eje) y luego en el elemento.",
        varios: "Varios elementos: clic en la referencia y luego en cada elemento. Enter o Esc termina.",
      };
      set({
        modoRecorte: modo,
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        aviso: avisos[modo],
      });
    },

    clicRecorte: async (objetivo) => {
      const { tipo, globalid, punto } = objetivo;
      const modo = get().modoRecorte;
      if (tipo === "eje") {
        if (modo === "esquina") {
          set({ aviso: "A esquina: haga clic en dos elementos lineales." });
          return;
        }
        const linea = lineaDeEje(globalid);
        if (!linea) return;
        set({
          referenciaRecorte: { tipo: "eje", globalid, linea },
          vistaPreviaRecorte: null,
          aviso:
            modo === "varios"
              ? "Varios elementos: clic en cada elemento a ajustar. Enter o Esc termina."
              : "Un elemento: clic en el elemento a recortar o extender.",
        });
        bitacoraHerramienta("recortar_extender", "referencia");
        return;
      }
      const linea = lineaDeElemento(globalid);
      if (!linea) {
        set({
          aviso:
            "Solo se recortan o extienden muros, contratrabes, trabes, dalas, " +
            "cerramientos y zapatas corridas.",
        });
        return;
      }
      if (modo === "esquina") {
        const inicial = get().recorteInicial;
        if (!inicial) {
          set({
            recorteInicial: { tipo: "elemento", globalid, linea, punto },
            vistaPreviaRecorte: null,
            aviso: "A esquina: clic en el segundo elemento.",
          });
          bitacoraHerramienta("recortar_extender", "punto", { x: punto[0], y: punto[1] });
          return;
        }
        if (inicial.globalid === globalid) {
          set({ aviso: "Elija otro elemento para formar la esquina." });
          return;
        }
        const resultado = await ejecutarResultado("elementos.recortar_esquina", {
          globalid_a: inicial.globalid,
          globalid_b: globalid,
          punto_a: inicial.punto,
          punto_b: punto,
        });
        if (!resultado) return;
        set({ recorteInicial: null, vistaPreviaRecorte: null });
        bitacoraHerramienta("recortar_extender", "terminar");
        return;
      }
      const referencia = get().referenciaRecorte;
      if (!referencia) {
        set({
          referenciaRecorte: { tipo: "elemento", globalid, linea },
          vistaPreviaRecorte: null,
          aviso:
            modo === "varios"
              ? "Varios elementos: clic en cada elemento a ajustar. Enter o Esc termina."
              : "Un elemento: clic en el elemento a recortar o extender.",
        });
        bitacoraHerramienta("recortar_extender", "referencia");
        return;
      }
      if (referencia.globalid === globalid) {
        set({ aviso: "Elija un elemento distinto de la referencia." });
        return;
      }
      const resultado = await ejecutarResultado("elementos.recortar_extender", {
        globalid,
        referencia: referencia.globalid,
        punto_conservar: punto,
      });
      if (!resultado) return;
      set({
        vistaPreviaRecorte: null,
        ...(modo === "elemento" ? { referenciaRecorte: null } : {}),
      });
      bitacoraHerramienta("recortar_extender", "terminar");
    },

    previsualizarRecorte: (globalid, punto) => {
      if (get().herramienta !== "recortar_extender") return;
      const previa = get().vistaPreviaRecorte;
      const linea = lineaDeElemento(globalid);
      const referencia =
        get().modoRecorte === "esquina"
          ? get().recorteInicial?.linea
          : get().referenciaRecorte?.linea;
      if (!linea || !referencia) {
        if (previa) set({ vistaPreviaRecorte: null });
        return;
      }
      const corte = cortarRectas(
        [linea.x1, linea.y1, linea.x2, linea.y2],
        [referencia.x1, referencia.y1, referencia.x2, referencia.y2],
      );
      if (!corte) {
        if (previa) set({ vistaPreviaRecorte: null });
        return;
      }
      const nuevo = recortarRecta(
        [linea.x1, linea.y1, linea.x2, linea.y2],
        corte.punto,
        punto,
      );
      if (!nuevo) {
        if (previa) set({ vistaPreviaRecorte: null });
        return;
      }
      if (
        previa &&
        previa.globalid === globalid &&
        Math.abs(previa.x1 - nuevo.x1) < 1e-9 &&
        Math.abs(previa.y1 - nuevo.y1) < 1e-9 &&
        Math.abs(previa.x2 - nuevo.x2) < 1e-9 &&
        Math.abs(previa.y2 - nuevo.y2) < 1e-9
      ) {
        return;
      }
      set({
        vistaPreviaRecorte: {
          globalid,
          x1: nuevo.x1,
          y1: nuevo.y1,
          x2: nuevo.x2,
          y2: nuevo.y2,
        },
      });
    },

    terminarRecorteExtender: () => {
      if (get().herramienta !== "recortar_extender") return;
      set({
        referenciaRecorte: null,
        recorteInicial: null,
        vistaPreviaRecorte: null,
        aviso: "Recortar/Extender: haga clic en la referencia.",
      });
      bitacoraHerramienta("recortar_extender", "terminar");
    },

    cancelarTrazo: () => {
      const herramienta = get().herramienta;
      if (!herramienta) return false;
      // O050: Esc en la losa quita sólo el último vértice; sin vértices sale de
      // la herramienta (nunca borra el contorno completo de golpe).
      if (herramienta === "losa") {
        const puntos = get().puntosHerramienta;
        if (puntos.length === 0) return false;
        const resto = puntos.slice(0, -1);
        set({
          puntosHerramienta: resto,
          longitudTecleada: "",
          aviso:
            resto.length > 0
              ? `Losa: ${resto.length} vértices. Clic en el primero, Enter o doble clic para cerrar.`
              : null,
        });
        bitacoraHerramienta(herramienta, "cancelar_trazo");
        return resto.length > 0;
      }
      // O056: Esc a medias de un empuje de cara no deja cambios.
      if (get().empujarCara) {
        set({
          empujarCara: null,
          ratonHerramienta: null,
          engancheHerramienta: null,
          longitudTecleada: "",
          aviso: null,
        });
        bitacoraHerramienta(herramienta, "cancelar_trazo");
        return true;
      }
      if (get().puntosHerramienta.length === 0 && !get().longitudTecleada) {
        return false;
      }
      set({
        puntosHerramienta: [],
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        empujarRect: null,
        empujarAltura: null,
        empujarZ: null,
        empujarCara: null,
        ejeLibre: false,
        etiquetaEje: "",
        opcionesNivel: { ...get().opcionesNivel, elevacionTexto: "" },
        cotasNivel: null,
      });
      bitacoraHerramienta(herramienta, "cancelar_trazo");
      return true;
    },

  };
}
