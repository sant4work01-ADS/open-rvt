// O014b: el texto de una vista siempre se lee de izquierda a derecha y de abajo
// hacia arriba. Se comprueba proyectando la base del texto en la pantalla de una
// cámara ortográfica construida con la convención de `camaraOrtografica`.
import { describe, expect, it } from "vitest";
import { baseTextoAnotacion, type Vector3 } from "./anotacion";

const normalizar = (v: Vector3): Vector3 => {
  const largo = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / largo, v[1] / largo, v[2] / largo];
};

const cruz = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const punto = (a: Vector3, b: Vector3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Proyección a la pantalla de la cámara: derecha = arriba × dirección. */
function proyectar(v: Vector3, haciaCamara: Vector3): { x: number; y: number } {
  const n = normalizar(haciaCamara);
  const arribaBase: Vector3 = Math.abs(n[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const derecha = normalizar(cruz(arribaBase, n));
  const arriba = normalizar(cruz(n, derecha));
  return { x: punto(v, derecha), y: punto(v, arriba) };
}

// Direcciones del modelo a la cámara: sur, norte, oeste, este y una diagonal.
const DIRECCIONES: Array<[string, Vector3]> = [
  ["sur (0,-1)", [0, -1, 0]],
  ["norte (0,1)", [0, 1, 0]],
  ["este (1,0)", [1, 0, 0]],
  ["oeste (-1,0)", [-1, 0, 0]],
  ["diagonal (1,1)/√2", [1 / Math.SQRT2, 1 / Math.SQRT2, 0]],
];

describe("O014b: base del texto de anotación", () => {
  for (const [nombre, direccion] of DIRECCIONES) {
    it(`en ${nombre} el +X del texto apunta a la derecha de la pantalla`, () => {
      const base = baseTextoAnotacion(direccion);
      // El eje X del texto proyectado debe medir +1 en la pantalla y 0 en vertical.
      const x = proyectar(base.derecha, direccion);
      expect(x.x).toBeCloseTo(1, 9);
      expect(x.y).toBeCloseTo(0, 9);
      // El eje Y del texto debe apuntar hacia arriba en la pantalla (no invertido).
      const y = proyectar(base.arriba, direccion);
      expect(y.x).toBeCloseTo(0, 9);
      expect(y.y).toBeCloseTo(1, 9);
    });
  }

  it("en planta (0,0,1) conserva la orientación de siempre: +X del IFC a la derecha", () => {
    const base = baseTextoAnotacion([0, 0, 1]);
    expect(base.derecha).toEqual([1, 0, 0]);
    expect(base.arriba).toEqual([0, 1, 0]);
  });

  it("un corte mira hacia el lado contrario de su normal: (0,1) no sale espejado", () => {
    // La traza con dirección (0,1) tiene la cámara en -Y; el texto mira a -Y.
    const base = baseTextoAnotacion([0, -1, 0]);
    // Con la cámara al sur, +X del mundo queda a la derecha en pantalla.
    expect(base.derecha[0]).toBeCloseTo(1, 9);
  });
});
