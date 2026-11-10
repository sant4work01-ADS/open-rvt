// O065B: catalogo de herramientas y sus clasificaciones.
import type { Herramienta } from "./tipos";

export const ALIAS_HERRAMIENTA: Partial<Record<Herramienta, string>> = {
  zapata: "zapata",
  zapata_corrida: "zapata_corrida",
  contratrabe: "contratrabe",
  columna: "columna",
  castillo: "castillo",
  trabe: "trabe",
  cerramiento: "cerramiento",
  dala: "dala",
};

export const HERRAMIENTAS_ESTRUCTURA: Herramienta[] = [
  "zapata", "zapata_corrida", "contratrabe", "columna", "castillo",
  "trabe", "cerramiento", "dala",
];

export function esHerramientaEstructura(h: Herramienta | null): boolean {
  return h !== null && HERRAMIENTAS_ESTRUCTURA.includes(h);
}

/** Las lineales se trazan con dos clics; las puntuales con uno. */
export function esHerramientaLineal(h: Herramienta | null): boolean {
  return h === "zapata_corrida" || h === "contratrabe" || h === "trabe" ||
    h === "cerramiento" || h === "dala";
}

export function esHerramientaPuntual(h: Herramienta | null): boolean {
  return h === "zapata" || h === "columna" || h === "castillo";
}
