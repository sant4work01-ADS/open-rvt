// Búsqueda difusa para la paleta de comandos: sin acentos ni mayúsculas, cada palabra
// escrita debe aparecer como subcadena o, si no, como subsecuencia de letras.

export function plegarTexto(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Puntaje de `palabra` dentro de `texto` plegado (mayor es mejor; 0 = no coincide). */
function puntajePalabra(texto: string, palabra: string): number {
  const i = texto.indexOf(palabra);
  if (i >= 0) {
    // Mejor si empieza el texto o una palabra.
    const alInicio = i === 0 || texto[i - 1] === " ";
    return alInicio ? 100 : 60;
  }
  let pos = 0;
  for (const ch of palabra) {
    pos = texto.indexOf(ch, pos);
    if (pos < 0) return 0;
    pos++;
  }
  return 20;
}

/** Puntaje total de la consulta contra el texto; 0 si alguna palabra no coincide. */
export function puntajeDifuso(texto: string, consulta: string): number {
  const t = plegarTexto(texto);
  const palabras = plegarTexto(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return 1;
  let total = 0;
  for (const p of palabras) {
    const s = puntajePalabra(t, p);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

/** Filtra y ordena por relevancia (estable: a igual puntaje se conserva el orden original). */
export function filtrarDifuso<T>(items: T[], consulta: string, texto: (i: T) => string): T[] {
  return items
    .map((item, orden) => ({ item, orden, p: puntajeDifuso(texto(item), consulta) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.orden - b.orden)
    .map((x) => x.item);
}
