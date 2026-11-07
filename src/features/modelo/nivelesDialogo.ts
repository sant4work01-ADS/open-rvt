// O051: una sola regla para la elevación del cuadro «Nivel» y de la tabla de
// niveles. Acepta metros absolutos («2.20») o relativos al nivel más alto
// («+2.6»); el vacío, lo ilegible y una elevación ya ocupada (±1 mm) no crean nada.
import { parsearElevacion } from "./cotas";
import { nivelEnElevacion, type NivelRef } from "./niveles";

export interface ResultadoElevacion {
  elevacion: number | null;
  error: string | null;
}

export function resolverElevacion(texto: string, niveles: NivelRef[]): ResultadoElevacion {
  const limpio = (texto ?? "").trim();
  if (!limpio) {
    return { elevacion: null, error: "Escribe la elevación en metros." };
  }
  const relativo = limpio.startsWith("+");
  const resto = relativo ? limpio.slice(1) : limpio;
  // Un segundo signo («++2», «+-2») no es una elevación relativa válida.
  const valor = relativo && /^[+-]/.test(resto) ? null : parsearElevacion(resto);
  if (valor === null) {
    return {
      elevacion: null,
      error: "Elevación no válida: use 2.20, 220cm, 2200mm, -1.5 o +2.6.",
    };
  }
  const base = relativo && niveles.length > 0
    ? Math.max(...niveles.map((n) => n.elevacion))
    : 0;
  const elevacion = Math.round((base + valor) * 1e6) / 1e6;
  const repetido = nivelEnElevacion(niveles, elevacion);
  if (repetido) {
    return {
      elevacion: null,
      error: `Ya existe «${repetido.nombre}» a ${elevacion.toFixed(2)} m.`,
    };
  }
  return { elevacion, error: null };
}
