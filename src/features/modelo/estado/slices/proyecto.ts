// O065B: slice «proyecto» del store (movido tal cual desde estado.ts).
import { agregarEvento } from "@/lib/bitacora";
import { elegirDestinoIfc, elegirIfcParaAbrir } from "@/lib/dialogos";
import type { RespuestaInfo } from "../../tipos";
import type { RespuestaGuardar } from "../tipos";
import { rpc } from "../ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceProyecto(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "nuevo" | "abrir" | "guardar" | "guardarComo" | "preguntarGuardar" | "responderGuardar" | "asegurarSinCambios" | "validar" | "comprobarNucleo"> {
  const { cargar, guardarEn } = h;
  return {
    nuevo: async () => {
      if (!(await get().asegurarSinCambios())) return false;
      try {
        set({ cargando: true, error: null });
        const info = await rpc<RespuestaInfo>("proyecto.nuevo", {
          nombre: "Modelo sin título",
        });
        await cargar(info);
        return true;
      } catch (e) {
        set({
          cargando: false,
          error: e instanceof Error ? e.message : String(e),
        });
        return false;
      }
    },

    abrir: async (rutaElegida) => {
      if (!(await get().asegurarSinCambios())) return false;
      const ruta = rutaElegida ?? (await elegirIfcParaAbrir());
      if (!ruta) return false;
      try {
        set({ cargando: true, error: null, aviso: null });
        const info = await rpc<RespuestaInfo>("proyecto.abrir", { ruta });
        await cargar(info);
        if (info.migracion) {
          agregarEvento("aviso", { texto: info.migracion, origen: "migracion" });
        }
        return true;
      } catch (e) {
        set({
          cargando: false,
          error: e instanceof Error ? e.message : String(e),
          aviso: `Núcleo IFC no disponible: ${
            e instanceof Error ? e.message : String(e)
          }`,
        });
        return false;
      }
    },

    guardar: async () => guardarEn(null, false),

    guardarComo: async (rutaElegida) => {
      const ruta =
        rutaElegida ??
        (await elegirDestinoIfc(get().nombreArchivo.replace(/\.ifc$/i, "") || "Modelo"));
      if (!ruta) return false;
      return guardarEn(ruta, true);
    },

    preguntarGuardar: () =>
      new Promise<RespuestaGuardar>((resolver) => {
        set({ preguntaGuardar: { nombre: get().nombreArchivo, resolver } });
      }),

    responderGuardar: (respuesta) => {
      const pregunta = get().preguntaGuardar;
      set({ preguntaGuardar: null });
      pregunta?.resolver(respuesta);
    },

    asegurarSinCambios: async () => {
      if (!get().conCambios) return true;
      const respuesta = await get().preguntarGuardar();
      if (respuesta === "cancelar") return false;
      if (respuesta === "guardar") return get().guardar();
      return true;
    },

    validar: async () => {
      try {
        const problemas = await rpc<Array<{ nivel: string; mensaje: string }>>(
          "proyecto.validar",
        );
        if (problemas.length === 0) {
          set({ aviso: "Validación IFC: sin problemas.", error: null });
        } else {
          set({
            aviso: `Validación IFC: ${problemas.length} problema(s).`,
            error: problemas
              .slice(0, 3)
              .map((p) => `${p.nivel}: ${p.mensaje}`)
              .join(" · "),
          });
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

    comprobarNucleo: async () => {
      try {
        const respuesta = await rpc<{ disponible: boolean; detalle?: string }>("nucleo.ping");
        if (!respuesta.disponible) {
          set({ aviso: `Núcleo IFC no disponible: ${respuesta.detalle ?? "sin detalle"}` });
        }
      } catch (e) {
        set({
          aviso: `Núcleo IFC no disponible: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },
  };
}
