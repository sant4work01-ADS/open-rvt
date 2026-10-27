// O010: la geometría de un muro debe producir normales planas, una por cara.
import { describe, expect, it } from "vitest";
import { mallaConNormalesPlanas, normalesUnicas } from "./geometria";

/** Caja cerrada: 8 vértices y 12 triángulos con sentido hacia afuera. */
function caja(ancho: number, fondo: number, alto: number) {
  const x = ancho / 2;
  const y = fondo / 2;
  const z = alto;
  const vertices = [
    -x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0,
    -x, -y, z, x, -y, z, x, y, z, -x, y, z,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, // suelo
    4, 5, 6, 4, 6, 7, // techo
    0, 1, 5, 0, 5, 4, // frente
    1, 2, 6, 1, 6, 5, // derecha
    2, 3, 7, 2, 7, 6, // fondo
    3, 0, 4, 3, 4, 7, // izquierda
  ];
  return { vertices, indices };
}

describe("normales planas de una malla (O010)", () => {
  it("un muro con 6 caras produce exactamente 6 normales, una por cara", () => {
    const { vertices, indices } = caja(4, 0.15, 2.6);
    const malla = mallaConNormalesPlanas(vertices, indices);
    const unicas = normalesUnicas(malla);
    expect(unicas).toHaveLength(6);
    // Cada cara es un plano axial: ninguna normal mezcla dos ejes.
    for (const n of unicas) {
      const noNulos = n.filter((v) => Math.abs(v) > 1e-6);
      expect(noNulos).toHaveLength(1);
      expect(Math.abs(noNulos[0])).toBeCloseTo(1, 5);
    }
    // Las tres normales de cada triángulo son idénticas (sombreado plano).
    for (let i = 0; i < malla.normales.length; i += 9) {
      for (let v = 1; v < 3; v += 1) {
        expect(malla.normales[i + v * 3]).toBe(malla.normales[i]);
        expect(malla.normales[i + v * 3 + 1]).toBe(malla.normales[i + 1]);
        expect(malla.normales[i + v * 3 + 2]).toBe(malla.normales[i + 2]);
      }
    }
  });

  it("alinea un triángulo invertido dentro de una cara plana", () => {
    const { vertices, indices } = caja(4, 0.15, 2.6);
    // Invierte el segundo triángulo del techo (4,6,7 -> 4,7,6).
    const invertidos = [...indices];
    [invertidos[9], invertidos[10], invertidos[11]] = [4, 7, 6];
    const malla = mallaConNormalesPlanas(vertices, invertidos);
    const unicas = normalesUnicas(malla);
    expect(unicas).toHaveLength(6);
    // El techo mantiene +Z pese al triángulo invertido.
    const techo = unicas.filter((n) => n[2] > 0.99);
    expect(techo).toHaveLength(1);
    // Y no queda ninguna normal del techo apuntando hacia abajo.
    expect(unicas.filter((n) => n[2] < -0.99)).toHaveLength(1); // solo el suelo
  });
});
