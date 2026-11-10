// O065B: slice «tipos» del store (movido tal cual desde estado.ts).
import { HERRAMIENTAS_ESTRUCTURA } from "../catalogo";
import { rpc } from "../ipc";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceTipos(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "abrirEditorTipos" | "cerrarEditorTipos" | "aplicarTipoEdicion" | "recargarTipos"> {
  const { cargarTiposEstructura, tipoDeHerramienta, ejecutar } = h;
  return {
    // O007a: el editor de tipos sustituye el área de trabajo mientras está abierto.
    abrirEditorTipos: (tipoGlobalid = null) =>
      set({ editorTipos: true, editorTipoInicial: tipoGlobalid }),
    cerrarEditorTipos: () => set({ editorTipos: false, editorTipoInicial: null }),
    aplicarTipoEdicion: async (globalid, datos) => {
      const ok = await ejecutar("tipos.editar", { globalid, datos });
      if (ok) {
        await get().recargarTipos();
        const seleccion = get().seleccion;
        if (seleccion) await get().seleccionar(seleccion);
        set({ editorTipos: false, editorTipoInicial: null });
      }
      return ok;
    },
    recargarTipos: async () => {
      try {
        const [tipos, estructura] = await Promise.all([
          rpc<Array<{ globalid: string; nombre: string; espesor: number }>>(
            "tipos.listar",
            { clase: "IfcWallType" },
          ),
          cargarTiposEstructura(),
        ]);
        set({ tiposMuro: tipos, tiposHerramienta: estructura });
        const actual = get().opcionesMuro;
        if (!tipos.some((t) => t.nombre === actual.tipo) && tipos[0]) {
          set({ opcionesMuro: { ...actual, tipo: tipos[0].nombre } });
        }
        const elegidos = { ...get().tipoHerramienta };
        for (const herramienta of HERRAMIENTAS_ESTRUCTURA) {
          const tipo = tipoDeHerramienta(herramienta, estructura, elegidos);
          if (tipo) elegidos[herramienta] = tipo.nombre;
        }
        set({ tipoHerramienta: elegidos });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      }
    },

  };
}
