// O069: mueve o copia la selección con un desplazamiento ya calculado (planta o
// alzado/corte). Vive fuera de ayudas/edicion.ts para no engordar ese archivo.
import { bitacoraHerramienta } from "@/lib/bitacora";
import type { GetEstado, SetEstado } from "../tipos";

export function crearAyudasMover(
  set: SetEstado,
  get: GetEstado,
  ejecutar: (metodo: string, params?: Record<string, unknown>) => Promise<boolean>,
) {
  const moverSeleccionDesplazamiento = async (
    dx: number,
    dy: number,
    dz: number,
  ): Promise<boolean> => {
    const herramienta = get().herramienta;
    if (herramienta !== "mover" && herramienta !== "copiar") return false;
    if (get().seleccionados.length === 0) {
      set({ aviso: "Seleccione uno o varios elementos antes de mover o copiar." });
      return false;
    }
    const metodo = herramienta === "mover" ? "elementos.mover" : "elementos.copiar";
    const ok = await ejecutar(metodo, {
      globalids: get().seleccionados,
      dx,
      dy,
      dz,
    });
    if (ok) {
      // O068: Mover queda activo para mover otra vez; se conserva la selección.
      set({
        puntosHerramienta: [],
        faseMover: get().seleccionados.length > 0 ? "base" : "seleccionar",
        ratonHerramienta: null,
        engancheHerramienta: null,
        longitudTecleada: "",
        aviso: `${herramienta === "mover" ? "Movido" : "Copiado"} ${
          Math.hypot(dx, dy, dz).toFixed(2)
        } m.`,
      });
      bitacoraHerramienta(herramienta, "terminar", { x: dx, y: dy });
    } else {
      set({ aviso: get().error ?? "No se pudo mover la selección." });
    }
    return ok;
  };

  return { moverSeleccionDesplazamiento };
}

export type AyudasMover = ReturnType<typeof crearAyudasMover>;
