// Formato de números para mostrar. Los montos viajan como texto decimal desde Rust y aquí
// solo se agrupan los miles y se completan ceros: no se hace aritmética ni se redondea.

/**
 * Recorta el texto de un decimal a `max` decimales (medio hacia arriba). Es solo
 * presentación: opera sobre los dígitos del texto que entregó Rust.
 */
export function recortarDecimales(valor: string, max: number): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (!m) return valor;
  const [, signo, entero, frac = ""] = m;
  if (frac.length <= max) return valor.trim();
  const base = BigInt(entero + frac.slice(0, max));
  const n = frac.charCodeAt(max) >= 53 ? base + 1n : base; // '5' = 53
  const t = n.toString().padStart(max + 1, "0");
  const e = t.slice(0, t.length - max);
  const f = t.slice(t.length - max);
  const nulo = /^0*$/.test(e + f);
  return `${nulo ? "" : signo}${e}${max > 0 ? `.${f}` : ""}`;
}

/**
 * Agrupa los miles de un decimal en texto y garantiza al menos `minDecimales` decimales;
 * con `maxDecimales` recorta los sobrantes (para mostrar factores con muchos decimales).
 */
export function formatearDecimal(
  valor: string | null | undefined,
  minDecimales = 2,
  maxDecimales?: number,
): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (maxDecimales !== undefined) valor = recortarDecimales(valor, maxDecimales);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (!m) return valor;
  const [, signo, entero, frac = ""] = m;
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimales = frac.length >= minDecimales ? frac : frac.padEnd(minDecimales, "0");
  return decimales ? `${signo}${agrupado}.${decimales}` : `${signo}${agrupado}`;
}

/** Cantidades: sin ceros sobrantes (hasta `max` decimales visibles), con miles. */
export function formatearCantidad(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(valor.trim());
  if (!m) return valor;
  const [, signo, entero, frac = ""] = m;
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f = frac.replace(/0+$/, "");
  return f ? `${signo}${agrupado}.${f}` : `${signo}${agrupado}`;
}

/** Costos unitarios y montos: siempre 2 decimales, aunque el dato guarde más precisión. */
export function formatearCosto(valor: string | null | undefined): string {
  return formatearDecimal(valor, 2, 2);
}

/** Cantidades y rendimientos con tope de 6 decimales visibles (el dato no se toca). */
export function formatearCantidadCorta(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  return formatearCantidad(recortarDecimales(valor, 6));
}

export function formatearMoneda(valor: string | null | undefined): string {
  const t = formatearDecimal(valor, 2);
  return t === "" ? "" : `$${t}`;
}

/** Suma textos decimales en centavos enteros (sin errores de coma flotante). */
export function sumarImportes(valores: string[]): string {
  let centavos = 0n;
  for (const v of valores) {
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(v.trim());
    if (!m) continue;
    const c = BigInt(m[2] + (m[3] ?? "").padEnd(2, "0").slice(0, 2));
    centavos += m[1] ? -c : c;
  }
  const abs = centavos < 0n ? -centavos : centavos;
  const t = abs.toString().padStart(3, "0");
  return `${centavos < 0n ? "-" : ""}${t.slice(0, -2)}.${t.slice(-2)}`;
}

/** Fecha ISO-8601 a «19 oct 2026». */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** Fecha y hora locales de una marca ISO-8601 (p. ej. la de una importación). */
export function formatearFechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatearHora(d: Date): string {
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Tamaño en bytes a «12 B», «340.5 KB», «1.2 MB». */
export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${unidades[i]}`;
}
