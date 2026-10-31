import { describe, expect, it } from "vitest";
import {
  altoTextoBurbuja,
  anchoTextoEstimado,
  desplazamientoCentrado,
} from "./centrado";

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

describe("altoTextoBurbuja", () => {
  // El globo de eje se construye con diámetro 1 y relleno de radio 0.43, así que el
  // diámetro interior es 0.86 y el 80 % son 0.688. La estimación de ancho visible es
  // caracteres × alto × 0.62 (la misma que usa el visor para separar anotaciones).
  const interior = 0.86;
  const limite = 0.8 * interior;

  for (const texto of ["A", "12", "A.1"]) {
    it(`«${texto}» cabe en el 80 % del diámetro interior`, () => {
      const alto = altoTextoBurbuja(texto);
      const ancho = anchoTextoEstimado(texto, alto);
      expect(ancho).toBeLessThanOrEqual(limite + 1e-12);
    });
  }

  it("un carácter conserva el alto máximo y uno no se achica de más", () => {
    expect(altoTextoBurbuja("A")).toBeCloseTo(0.52, 12);
    expect(anchoTextoEstimado("A", altoTextoBurbuja("A"))).toBeCloseTo(0.3224, 12);
  });

  it("dos caracteres siguen cabiendo sin bajar del máximo", () => {
    // 2 × 0.52 × 0.62 = 0.6448 ≤ 0.688.
    expect(altoTextoBurbuja("12")).toBeCloseTo(0.52, 12);
  });

  it("tres caracteres reducen el alto respecto de dos", () => {
    // 0.688 / (3 × 0.62) = 0.369892…; 3 × ese alto × 0.62 = 0.688 exacto.
    const alto = altoTextoBurbuja("A.1");
    expect(alto).toBeCloseTo(0.688 / 1.86, 12);
    expect(alto).toBeLessThan(altoTextoBurbuja("12"));
    expect(anchoTextoEstimado("A.1", alto)).toBeCloseTo(limite, 12);
  });

  it("texto vacío no divide por cero", () => {
    expect(Number.isFinite(altoTextoBurbuja(""))).toBe(true);
    expect(altoTextoBurbuja("")).toBeCloseTo(0.52, 12);
  });
});
