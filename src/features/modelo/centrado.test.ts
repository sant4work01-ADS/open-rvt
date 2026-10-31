import { describe, expect, it } from "vitest";
import { desplazamientoCentrado } from "./centrado";

describe("desplazamientoCentrado", () => {
  it("lleva el centro de los límites visibles al origen", () => {
    // Centro de [0.1, -0.2, 0.5, 0.4] = (0.3, 0.1); hay que restar (0.3, 0.1).
    const [x, y] = desplazamientoCentrado([0.1, -0.2, 0.5, 0.4]);
    expect(x).toBeCloseTo(-0.3, 12);
    expect(y).toBeCloseTo(-0.1, 12);
  });

  it("no desplaza límites ya simétricos", () => {
    expect(desplazamientoCentrado([-0.25, -0.6, 0.25, 0.6])).toEqual([0, 0]);
  });

  it("funciona con un glifo de un solo carácter descentrado por ascendentes", () => {
    // «A» medida a mano: la caja del renglón va de -0.35 a 0.35 en Y, pero el
    // glifo visible ocupa [-0.26, 0.22]; su centro vertical es -0.02.
    const [x, y] = desplazamientoCentrado([-0.18, -0.26, 0.18, 0.22]);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(0.02, 12);
  });
});
