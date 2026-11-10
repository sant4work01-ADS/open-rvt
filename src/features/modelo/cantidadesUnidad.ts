// O063 punto 6: los totales de medición nunca se mezclan entre unidades.
export const ORDEN_UNIDADES = ["m", "m2", "m3", "kg", "pza"] as const;

export const ETIQUETA_UNIDAD: Record<string, string> = {
  m: "m",
  m2: "m²",
  m3: "m³",
  kg: "kg",
  pza: "pza",
};

/** Suma exacta por unidad; las unidades desconocidas conservan su clave. */
export function totalesPorUnidad(
  partidas: { unidad: string; total: number }[],
): Record<string, number> {
  const totales: Record<string, number> = {};
  for (const partida of partidas) {
    const unidad = partida.unidad || "sin-unidad";
    totales[unidad] = (totales[unidad] ?? 0) + partida.total;
  }
  return totales;
}

/** Pares ordenados para pintar; las unidades conocidas van primero. */
export function totalesOrdenados(
  partidas: { unidad: string; total: number }[],
): [string, number][] {
  const totales = totalesPorUnidad(partidas);
  const conocidas = ORDEN_UNIDADES.filter((u) => u in totales).map(
    (u) => [u, totales[u]] as [string, number],
  );
  const otras = Object.entries(totales)
    .filter(([u]) => !(ORDEN_UNIDADES as readonly string[]).includes(u))
    .sort(([a], [b]) => a.localeCompare(b, "es"));
  return [...conocidas, ...otras];
}
