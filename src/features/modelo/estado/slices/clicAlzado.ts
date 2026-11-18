// O069: clic de Mover/Copiar en alzados y cortes. El desplazamiento se toma en
// el plano de la vista: horizontal → dx/dy según su orientación, vertical → dz.
import { desplazamientoEnVista } from "../../aberturasVista";
import type { EstadoModelo, GetEstado, SetEstado } from "../tipos";
import type { Ayudas } from "../ayudas";

export function crearSliceClicAlzado(
  set: SetEstado,
  get: GetEstado,
  h: Ayudas,
): Pick<EstadoModelo, "clicEnAlzado"> {
  const { moverSeleccionDesplazamiento } = h;
  return {
    clicEnAlzado: async (punto) => {
      const herramienta = get().herramienta;
      if (herramienta !== "mover" && herramienta !== "copiar") return;
      const vista = get().vistas.find((v) => v.id === get().vistaActivaId);
      if (!vista || (vista.tipo !== "alzado" && vista.tipo !== "corte")) return;
      // La fase «seleccionar» la resuelve el visor, igual que en planta.
      if (get().faseMover === "seleccionar") return;
      const puntos = get().puntosHerramienta;
      if (puntos.length === 0) {
        set({
          puntosHerramienta: [punto],
          ratonHerramienta: punto,
          faseMover: "destino",
          longitudTecleada: "",
          aviso: `${herramienta === "mover" ? "Mover" : "Copiar"}: punto destino, o escriba la distancia y Enter.`,
        });
        return;
      }
      const { dx, dy, dz } = desplazamientoEnVista(vista, puntos[0], punto);
      await moverSeleccionDesplazamiento(dx, dy, dz);
    },
  };
}
