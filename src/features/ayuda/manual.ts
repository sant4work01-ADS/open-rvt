import { tr } from "@/i18n";
// Parser del Markdown del manual: títulos, párrafos, listas, tablas, citas, código y
// separadores. Sin dependencias nuevas y sin HTML crudo (el render vive en Markdown.tsx).

export type Bloque =
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "parrafo"; texto: string }
  | { tipo: "lista"; ordenada: boolean; items: string[] }
  | { tipo: "tabla"; encabezados: string[]; filas: string[][] }
  | { tipo: "cita"; lineas: string[] }
  | { tipo: "codigo"; lineas: string[] }
  | { tipo: "separador" };

function esInicioDeBloque(linea: string): boolean {
  return (
    /^#{1,6}\s/.test(linea) ||
    /^\s*[-*]\s+/.test(linea) ||
    /^\s*\d+\.\s+/.test(linea) ||
    /^>\s?/.test(linea) ||
    /^```/.test(linea) ||
    /^(\|.*\|)\s*$/.test(linea) ||
    /^\s*---+\s*$/.test(linea)
  );
}

function separarCeldas(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function esSeparadorDeTabla(linea: string): boolean {
  return /^\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(linea) && linea.includes("-");
}

/** Convierte el Markdown del manual en bloques simples. */
export function parsearMarkdown(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: Bloque[] = [];
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];
    if (linea.trim() === "") {
      i++;
      continue;
    }
    const titulo = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (titulo) {
      bloques.push({ tipo: "titulo", nivel: titulo[1].length, texto: titulo[2].trim() });
      i++;
      continue;
    }
    if (/^\s*---+\s*$/.test(linea)) {
      bloques.push({ tipo: "separador" });
      i++;
      continue;
    }
    if (/^```/.test(linea)) {
      const codigo: string[] = [];
      i++;
      while (i < lineas.length && !/^```/.test(lineas[i])) codigo.push(lineas[i++]);
      i++; // cierre
      bloques.push({ tipo: "codigo", lineas: codigo });
      continue;
    }
    if (/^>\s?/.test(linea)) {
      const cita: string[] = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) {
        cita.push(lineas[i].replace(/^>\s?/, ""));
        i++;
      }
      bloques.push({ tipo: "cita", lineas: cita });
      continue;
    }
    if (/^\s*[-*]\s+/.test(linea) || /^\s*\d+\.\s+/.test(linea)) {
      const ordenada = /^\s*\d+\.\s+/.test(linea);
      const items: string[] = [];
      const patron = ordenada ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      while (i < lineas.length) {
        const m = patron.exec(lineas[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      bloques.push({ tipo: "lista", ordenada, items });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(linea)) {
      const filas: string[][] = [];
      while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) {
        if (!esSeparadorDeTabla(lineas[i])) filas.push(separarCeldas(lineas[i]));
        i++;
      }
      const [encabezados = [], ...cuerpo] = filas;
      bloques.push({ tipo: "tabla", encabezados, filas: cuerpo });
      continue;
    }
    // Párrafo: hasta una línea en blanco o el inicio de otro bloque.
    const parrafo: string[] = [linea.trim()];
    i++;
    while (i < lineas.length && lineas[i].trim() !== "" && !esInicioDeBloque(lineas[i])) {
      parrafo.push(lineas[i].trim());
      i++;
    }
    bloques.push({ tipo: "parrafo", texto: parrafo.join(" ") });
  }
  return bloques;
}

/** Texto sin acentos y en minúsculas para el índice y el ancla. */
export function plegar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface SeccionManual {
  id: string;
  titulo: string;
  markdown: string;
}

/** Divide el manual por sus títulos `##` (el texto anterior es la presentación). */
export function dividirSecciones(texto: string): SeccionManual[] {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const secciones: SeccionManual[] = [];
  let titulo = tr("ayuda.presentacion", "Presentación");
  let buffer: string[] = [];
  const cerrar = () => {
    if (buffer.some((l) => l.trim() !== "")) {
      secciones.push({
        id: plegar(titulo) || `seccion-${secciones.length}`,
        titulo,
        markdown: buffer.join("\n"),
      });
    }
  };
  for (const linea of lineas) {
    const m = /^##\s+(.*)$/.exec(linea);
    if (m) {
      cerrar();
      titulo = m[1].trim();
      buffer = [linea];
    } else {
      buffer.push(linea);
    }
  }
  cerrar();
  return secciones;
}
