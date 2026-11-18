// O065B: contexto compartido por todos los slices del store.
import type { GetEstado, SetEstado } from "../tipos";
import { crearAyudasCarga, type AyudasCarga } from "./carga";
import { crearAyudasEdicion, type AyudasEdicion } from "./edicion";
import { crearAyudasMover, type AyudasMover } from "./mover";

export type Ayudas = AyudasCarga & AyudasEdicion & AyudasMover;

export function crearAyudas(set: SetEstado, get: GetEstado): Ayudas {
  const carga = crearAyudasCarga(set, get);
  const edicion = crearAyudasEdicion(set, get, carga);
  return {
    ...carga,
    ...edicion,
    ...crearAyudasMover(set, get, edicion.ejecutar),
  };
}
