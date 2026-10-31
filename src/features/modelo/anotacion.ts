// O014b: base ortonormal del texto de anotación. La anotación nunca debe salir
// espejada: su eje X tiene que coincidir con la derecha de la pantalla y su eje Y
// con el arriba de la pantalla, sea cual sea la dirección de la vista.
export type Vector3 = [number, number, number];

export interface BaseAnotacion {
  /** Eje +X del texto: derecha de la pantalla. */
  derecha: Vector3;
  /** Eje +Y del texto: arriba de la pantalla. */
  arriba: Vector3;
  /** Normal de la anotación (del modelo hacia la cámara). */
  normal: Vector3;
}

const normalizar = (v: Vector3): Vector3 => {
  const largo = Math.hypot(v[0], v[1], v[2]);
  if (largo < 1e-12) return [0, 0, 1];
  return [v[0] / largo, v[1] / largo, v[2] / largo];
};

const cruz = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Base del texto para una vista cuya dirección `haciaCamara` va del modelo a la
 * cámara (la misma convención que `camaraOrtografica`). En planta es (0,0,1); en
 * un corte es el opuesto de la normal de la traza, no la normal de la traza.
 */
export function baseTextoAnotacion(haciaCamara: Vector3): BaseAnotacion {
  const n = normalizar(haciaCamara);
  // En planta el arriba del papel es +Y del IFC; en alzados y cortes, +Z.
  const arribaBase: Vector3 = Math.abs(n[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const derecha = normalizar(cruz(arribaBase, n));
  const arriba = normalizar(cruz(n, derecha));
  return { derecha, arriba, normal: n };
}
