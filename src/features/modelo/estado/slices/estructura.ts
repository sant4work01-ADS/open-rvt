// O065B: slice «estructura» del store (movido tal cual desde estado.ts).
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceEstructura(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "losaDesdeMuros" | "castillosAutomaticos" | "columnasEnCruces" | "unirZapatas" | "zapatasEnCruces" | "contratrabesEntreEjes" | "murosEntreEjes" | "soltarEnlace" | "soltarDelMuro" | "unirTrabes"> {
  const { ejecutarResultado, ejecutar, nivelActivo, tipoEstructural, tipoZapataElegida } = h;
  return {
    losaDesdeMuros: async () => {
      const gids = get().seleccionados;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      const nivel = vista?.nivel ?? get().niveles[0]?.globalid;
      if (gids.length < 3) {
        set({ aviso: "Seleccione el circuito cerrado de muros (tres o más)." });
        return;
      }
      const opciones = get().opcionesLosa;
      await ejecutar("losas.desde_muros", {
        nivel,
        globalids: gids,
        lado: opciones.lado,
        desfase: opciones.desfase,
        uso: opciones.uso,
      });
    },

    castillosAutomaticos: async (separacion) => {
      if (!Number.isFinite(separacion) || separacion <= 0) {
        set({ aviso: "La separación entre castillos debe ser positiva." });
        return false;
      }
      const nivel = nivelActivo();
      const muros = get().seleccionados.filter((gid) =>
        get().elementos.some(
          (elemento) => elemento.globalid === gid && elemento.clase === "IfcWall",
        ),
      );
      const ok = await ejecutar("castillos.automaticos", {
        muros,
        separacion_max: separacion,
        nivel,
      });
      if (ok) set({ dialogoCastillos: false });
      return ok;
    },

    columnasEnCruces: async () => {
      const tipo = tipoEstructural("columna");
      const nivel = nivelActivo();
      if (!tipo || !nivel) return false;
      const resultado = await ejecutarResultado("columnas.en_cruces", {
        tipo: tipo.nombre,
        nivel,
      });
      if (!resultado) return false;
      if (get().columnaConZapata) {
        const zapata = tipoZapataElegida();
        if (zapata) {
          for (const columna of resultado.creados) {
            const ok = await ejecutar("zapatas.bajo_columna", {
              tipo: zapata.nombre,
              columna,
            });
            if (!ok) return false;
          }
        }
      }
      set({
        aviso: `${resultado.creados.length} columna(s) en los cruces${
          get().columnaConZapata ? " con zapata" : ""
        }.`,
      });
      return true;
    },

    unirZapatas: async () => {
      const tipo = get().tiposHerramienta.find((t) => t.alias === "contratrabe");
      const nivel = nivelActivo();
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de contratrabe en la biblioteca." });
        return false;
      }
      return ejecutar("contratrabes.unir_zapatas", {
        tipo: tipo.nombre,
        nivel,
      });
    },

    zapatasEnCruces: async () => {
      const tipo = tipoZapataElegida();
      const nivel = nivelActivo();
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de zapata en la biblioteca." });
        return false;
      }
      return ejecutar("zapatas.en_cruces", { tipo: tipo.nombre, nivel });
    },

    contratrabesEntreEjes: async () => {
      const tipo = get().tiposHerramienta.find((t) => t.alias === "contratrabe");
      const nivel = nivelActivo();
      const guia = get().ejeSeleccionado;
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de contratrabe en la biblioteca." });
        return false;
      }
      if (!guia) {
        set({ aviso: "Seleccione el eje guía en planta." });
        return false;
      }
      return ejecutar("contratrabes.entre_ejes", {
        tipo: tipo.nombre,
        nivel,
        eje_guia: guia,
      });
    },

    murosEntreEjes: async () => {
      const tipo = tipoEstructural("muro");
      const nivel = nivelActivo();
      const guia = get().ejeSeleccionado;
      if (!tipo || !nivel) return false;
      if (!guia) {
        set({ aviso: "Seleccione el eje guía en planta." });
        return false;
      }
      return ejecutar("muros.entre_ejes", {
        tipo: tipo.nombre,
        nivel,
        eje_guia: guia,
      });
    },

    soltarEnlace: async (globalid) => {
      if (!globalid) return;
      await ejecutar("restricciones.soltar_enlace", { globalid });
    },

    soltarDelMuro: async (globalid) => {
      if (!globalid) return;
      await ejecutar("cerramientos.soltar_del_muro", { globalid });
    },

    unirTrabes: async () => {
      const tipo = get().tiposHerramienta.find((t) => t.alias === "trabe");
      const nivel = nivelActivo();
      if (!tipo || !nivel) {
        set({ aviso: "No hay tipo de trabe en la biblioteca." });
        return false;
      }
      return ejecutar("trabes.unir_columnas", {
        tipo: tipo.nombre,
        nivel,
      });
    },

  };
}
