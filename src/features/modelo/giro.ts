// O036: conversión del ángulo de giro de un eje. La interfaz trabaja en grados
// (positivo = antihorario) y el núcleo en radianes.

export function gradosARadianes(grados: number): number {
  return (grados * Math.PI) / 180;
}

/** Ángulo en grados, positivo antihorario, de `referencia` a `punto` visto desde el centro. */
export function anguloGiroGrados(
  centro: [number, number],
  referencia: [number, number],
  punto: [number, number],
): number {
  const rx = referencia[0] - centro[0];
  const ry = referencia[1] - centro[1];
  const vx = punto[0] - centro[0];
  const vy = punto[1] - centro[1];
  const cruz = rx * vy - ry * vx;
  const producto = rx * vx + ry * vy;
  return (Math.atan2(cruz, producto) * 180) / Math.PI;
}
