// OPEN-RVT: índice del store del modelo abierto. Este archivo solo arma el store con
// los slices y reexporta lo que antes se importaba desde aquí. El cuerpo vive en
// estado/ (O065B).
import { create } from "zustand";
import { crearAyudas } from "./estado/ayudas";
import { crearEstadoInicial } from "./estado/estadoInicial";
import type { EstadoModelo } from "./estado/tipos";
import { crearSliceArbol } from "./estado/slices/arbol";
import { crearSliceAvisos } from "./estado/slices/avisos";
import { crearSliceClicPlanta } from "./estado/slices/clicPlanta";
import { crearSliceCorte } from "./estado/slices/corte";
import { crearSliceEdicion } from "./estado/slices/edicion";
import { crearSliceEjes } from "./estado/slices/ejes";
import { crearSliceEmpujar } from "./estado/slices/empujar";
import { crearSliceEstructura } from "./estado/slices/estructura";
import { crearSliceEstructuraHerramientas } from "./estado/slices/estructuraHerramientas";
import { crearSliceHerramientas } from "./estado/slices/herramientas";
import { crearSliceNiveles } from "./estado/slices/niveles";
import { crearSliceNotas } from "./estado/slices/notas";
import { crearSliceOpciones } from "./estado/slices/opciones";
import { crearSliceProyecto } from "./estado/slices/proyecto";
import { crearSliceSeleccion } from "./estado/slices/seleccion";
import { crearSliceTipos } from "./estado/slices/tipos";
import { crearSliceTrazos } from "./estado/slices/trazos";
import { crearSliceVistas } from "./estado/slices/vistas";

export * from "./estado/tipos";
export * from "./estado/catalogo";
export { plantaUnicaDeNivel, quitarPlantasHuerfanas } from "./estado/utilidades";

export const useModelo = create<EstadoModelo>((set, get) => {
  const ayudas = crearAyudas(set, get);
  return {
    ...crearEstadoInicial(set, get),
    ...crearSliceProyecto(set, get, ayudas),
    ...crearSliceVistas(set, get, ayudas),
    ...crearSliceTipos(set, get, ayudas),
    ...crearSliceSeleccion(set, get),
    ...crearSliceArbol(set, get, ayudas),
    ...crearSliceCorte(set, get, ayudas),
    ...crearSliceAvisos(set),
    ...crearSliceHerramientas(set, get, ayudas),
    ...crearSliceOpciones(set, get, ayudas),
    ...crearSliceEmpujar(set, get, ayudas),
    ...crearSliceEstructuraHerramientas(set, get, ayudas),
    ...crearSliceTrazos(set, get, ayudas),
    ...crearSliceClicPlanta(set, get, ayudas),
    ...crearSliceEdicion(set, get, ayudas),
    ...crearSliceNotas(set, get),
    ...crearSliceNiveles(set, get, ayudas),
    ...crearSliceEjes(set, get, ayudas),
    ...crearSliceEstructura(set, get, ayudas),
  };
});
