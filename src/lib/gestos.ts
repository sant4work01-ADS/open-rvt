// O018: funciones puras del pellizco nativo de Windows.
//
// Windows entrega la distancia entre dedos en `ullArguments` (WM_GESTURE) o en
// las coordenadas de dos punteros (WM_POINTER). El visor aplica el recíproco del
// factor porque su escala ortográfica crece al alejarse.

/** Ventana en la que un wheel con Ctrl invalida el gesto nativo (anti doble zoom). */
export const VENTANA_DUPLICADO_MS = 150;

/** Límite por mensaje del factor de pellizco (spec O018, parte 3). */
const FACTOR_MINIMO = 0.8;
const FACTOR_MAXIMO = 1.25;

/**
 * Factor de zoom entre dos distancias entre dedos: actual / anterior.
 * Sin distancia anterior válida (0 o negativa) devuelve 1: el primer evento de
 * un gesto solo fija la referencia. El resultado queda acotado a [0.8, 1.25].
 */
export function factorGestoZoom(anterior: number, actual: number): number {
  if (!Number.isFinite(anterior) || !Number.isFinite(actual)) return 1;
  if (anterior <= 0 || actual <= 0) return 1;
  const factor = actual / anterior;
  return Math.min(FACTOR_MAXIMO, Math.max(FACTOR_MINIMO, factor));
}

/**
 * Un wheel con Ctrl llegó al visor hace menos de 150 ms: el gesto nativo es el
 * mismo pellizco y se ignora para no aplicar el zoom dos veces.
 */
export function debeIgnorarGestoNativo(
  ultimoWheelCtrlMs: number | null,
  ahoraMs: number,
): boolean {
  if (ultimoWheelCtrlMs === null) return false;
  if (!Number.isFinite(ultimoWheelCtrlMs) || !Number.isFinite(ahoraMs)) return false;
  const diferencia = ahoraMs - ultimoWheelCtrlMs;
  return diferencia >= 0 && diferencia < VENTANA_DUPLICADO_MS;
}
