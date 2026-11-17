// Formato de valores del panel derecho (O064: compartido entre paneles).
export function formatear(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (Array.isArray(valor)) return valor.map(formatear).join(", ");
  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    if ("clase" in objeto) {
      const nombre = objeto.nombre ? ` «${String(objeto.nombre)}»` : "";
      return `${String(objeto.clase)}${nombre}`;
    }
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return String(valor);
}
