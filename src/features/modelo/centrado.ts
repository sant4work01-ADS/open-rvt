// O014a: centrado real del texto de anotación. troika centra la caja del renglón
// (con ascendentes y descendentes), no el glifo visible; con `visibleBounds`
// desplazamos el texto para que su centro geométrico quede en el origen del grupo.

/** Desplazamiento que lleva el centro de `visibleBounds` a (0, 0). */
export function desplazamientoCentrado(
  b: [number, number, number, number],
): [number, number] {
  const x = -(b[0] + b[2]) / 2;
  const y = -(b[1] + b[3]) / 2;
  // Evita el -0: los límites simétricos deben dar exactamente [0, 0].
  return [x === 0 ? 0 : x, y === 0 ? 0 : y];
}

/**
 * O014a: ancho relativo de un carácter respecto del alto de fuente. Es la misma
 * estimación que usa el visor para separar anotaciones sin medir píxeles.
 */
export const ANCHO_CARACTER_RELATIVO = 0.62;

/** Ancho estimado del texto con un alto de fuente dado (mundo del grupo). */
export function anchoTextoEstimado(texto: string, alto: number): number {
  return [...texto].length * alto * ANCHO_CARACTER_RELATIVO;
}

/**
 * O014a: alto de fuente del texto de una burbuja de eje. La burbuja tiene diámetro
 * 1 y relleno de radio 0.43; el texto debe caber en el 80 % del diámetro interior
 * para que «A.1» no se salga del círculo.
 */
export function altoTextoBurbuja(
  texto: string,
  diametroInterior = 0.86,
  fraccion = 0.8,
  altoMaximo = 0.52,
): number {
  const caracteres = Math.max(1, [...texto].length);
  const anchoMaximo = fraccion * diametroInterior;
  return Math.min(altoMaximo, anchoMaximo / (caracteres * ANCHO_CARACTER_RELATIVO));
}
