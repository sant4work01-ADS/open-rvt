// O065B: contexto compartido por todos los slices del store.
import type { GetEstado, SetEstado } from "../tipos";
import { crearAyudasCarga, type AyudasCarga } from "./carga";
import { crearAyudasEdicion, type AyudasEdicion } from "./edicion";

export type Ayudas = AyudasCarga & AyudasEdicion;

export function crearAyudas(set: SetEstado, get: GetEstado): Ayudas {
  const carga = crearAyudasCarga(set, get);
  return { ...carga, ...crearAyudasEdicion(set, get, carga) };
}
