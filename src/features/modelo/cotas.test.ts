import { describe, expect, it } from "vitest";
import type { EjeReferencia } from "./herramientas";
import {
  calcularFamiliasCotas,
  cotaEditable,
  fijarMoverSiguientesCotas,
  formatearCota,
  moverSiguientesCotas,
  parsearCota,
} from "./cotas";

function eje(
  etiqueta: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): EjeReferencia {
  return {
    globalid: `eje-${etiqueta}`,
    etiqueta,
    x1,
    y1,
    x2,
    y2,
    vertical: Math.abs(x2 - x1) < Math.abs(y2 - y1),
  };
}

const VERTICALES = [
  eje("1", 0, 0, 0, 20),
  eje("2", 5, 0, 5, 20),
  eje("3", 9.5, 0, 9.5, 20),
  eje("4", 14.5, 0, 14.5, 20),
];
const HORIZONTALES = [eje("A", 0, 0, 12, 0), eje("B", 0, 4, 12, 4), eje("C", 0, 8, 12, 8)];

describe("familias de cotas de ejes", () => {
  it("agrupa por familias paralelas y ordena de izquierda a derecha / abajo arriba", () => {
    const familias = calcularFamiliasCotas([...VERTICALES, ...HORIZONTALES]);
    expect(familias).toHaveLength(2);
    const vertical = familias.find((f) => f.ejes[0].vertical)!;
    const horizontal = familias.find((f) => !f.ejes[0].vertical)!;
    expect(vertical.ejes.map((e) => e.etiqueta)).toEqual(["1", "2", "3", "4"]);
    expect(horizontal.ejes.map((e) => e.etiqueta)).toEqual(["A", "B", "C"]);
    expect(vertical.normal).toEqual([1, 0]);
    expect(horizontal.normal).toEqual([0, 1]);
  });

  it("la cadena parcial respeta el orden y los valores exactos", () => {
    const [vertical] = calcularFamiliasCotas(VERTICALES);
    expect(vertical.parciales.map((c) => c.valor)).toEqual([5, 4.5, 5]);
    expect(vertical.parciales.map((c) => [c.referencia, c.mover])).toEqual([
      ["eje-1", "eje-2"],
      ["eje-2", "eje-3"],
      ["eje-3", "eje-4"],
    ]);
    expect(vertical.parciales.map((c) => formatearCota(c.valor))).toEqual([
      "5.00",
      "4.50",
      "5.00",
    ]);
    expect(vertical.total?.valor).toBeCloseTo(14.5, 9);
    expect(formatearCota(vertical.total!.valor)).toBe("14.50");
  });

  it("la cota total no es editable y las parciales sí", () => {
    const [vertical] = calcularFamiliasCotas(VERTICALES);
    expect(vertical.total).not.toBeNull();
    expect(cotaEditable(vertical.total!)).toBe(false);
    expect(vertical.parciales.every((c) => cotaEditable(c))).toBe(true);
  });

  it("una familia con un solo eje no dibuja cotas", () => {
    const [familia] = calcularFamiliasCotas([eje("1", 3, 0, 3, 10)]);
    expect(familia.parciales).toEqual([]);
    expect(familia.total).toBeNull();
  });
});

describe("texto de las cotas", () => {
  it("formatea en metros con dos decimales", () => {
    expect(formatearCota(4.5)).toBe("4.50");
    expect(formatearCota(14.499999)).toBe("14.50");
  });

  it("acepta coma, punto y centímetros", () => {
    expect(parsearCota("4.5")).toBe(4.5);
    expect(parsearCota("4,5")).toBe(4.5);
    expect(parsearCota("450cm")).toBe(4.5);
    expect(parsearCota(" 450 CM ")).toBe(4.5);
    expect(parsearCota("4.5m")).toBe(4.5);
  });

  it("rechaza valores no numéricos, cero y negativos", () => {
    expect(parsearCota("")).toBeNull();
    expect(parsearCota("abc")).toBeNull();
    expect(parsearCota("4.5.6")).toBeNull();
    expect(parsearCota("0")).toBeNull();
    expect(parsearCota("-2")).toBeNull();
    expect(parsearCota("0cm")).toBeNull();
  });
});

describe("casilla «Mover los siguientes»", () => {
  it("viene marcada y recuerda la elección durante la sesión", () => {
    fijarMoverSiguientesCotas(true);
    expect(moverSiguientesCotas()).toBe(true);
    fijarMoverSiguientesCotas(false);
    expect(moverSiguientesCotas()).toBe(false);
    expect(calcularFamiliasCotas(VERTICALES)[0].parciales).toHaveLength(3);
    fijarMoverSiguientesCotas(true);
  });
});
