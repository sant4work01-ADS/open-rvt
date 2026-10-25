/** Copia texto al portapapeles si el navegador lo permite (sin romper en jsdom). */
export function copiarTexto(texto: string): void {
  void navigator.clipboard?.writeText(texto).catch(() => undefined);
}
