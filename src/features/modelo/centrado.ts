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
