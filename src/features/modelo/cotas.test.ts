import { describe, expect, it } from "vitest";
import type { EjeReferencia } from "./herramientas";
import {
  calcularFamiliasCotas,
  cotaEditable,
  fijarMoverSiguientesCotas,
  formatearCota,
  moverSiguientesCotas,
  parsearCota,
  parsearElevacion,
  posicionTextoEntreMarcas,
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

  it("con un solo tramo parcial no dibuja la total, que repetiría la medida", () => {
    const [familia] = calcularFamiliasCotas([
      eje("A", 0, 0, 12, 0),
      eje("B", 0, 4, 12, 4),
    ]);
    expect(familia.parciales.map((c) => c.valor)).toEqual([4]);
    expect(familia.total).toBeNull();
    // Con dos tramos sí hay total.
    const [conDos] = calcularFamiliasCotas([
      eje("A", 0, 0, 12, 0),
      eje("B", 0, 4, 12, 4),
      eje("C", 0, 8, 12, 8),
    ]);
    expect(conDos.parciales.map((c) => c.valor)).toEqual([4, 4]);
    expect(formatearCota(conDos.total!.valor)).toBe("8.00");
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

  it("O010: elevaciones aceptan .1, coma, cm, mm y negativos", () => {
    expect(parsearElevacion(".1")).toBe(0.1);
    expect(parsearElevacion("0.1")).toBe(0.1);
    expect(parsearElevacion("0,1")).toBe(0.1);
    expect(parsearElevacion("10cm")).toBe(0.1);
    expect(parsearElevacion("100mm")).toBe(0.1);
    expect(parsearElevacion("12 cm")).toBe(0.12);
    expect(parsearElevacion("3m")).toBe(3);
    expect(parsearElevacion("-.5")).toBe(-0.5);
    expect(parsearElevacion("-2,25")).toBe(-2.25);
    expect(parsearElevacion("0")).toBe(0);
    expect(parsearElevacion("1.")).toBe(1);
  });

  it("O010: elevaciones rechazan texto y números mal formados", () => {
    expect(parsearElevacion("")).toBeNull();
    expect(parsearElevacion("   ")).toBeNull();
    expect(parsearElevacion("abc")).toBeNull();
    expect(parsearElevacion("4.5.6")).toBeNull();
    expect(parsearElevacion("10cmx")).toBeNull();
    expect(parsearElevacion("--1")).toBeNull();
  });
});

describe("O006d: cota del rebase", () => {
  const verticales = [
    eje("1", 0, -1.5, 0, 9.5),
    eje("2", 5, -1.5, 5, 9.5),
    eje("3", 9.5, -1.5, 9.5, 9.5),
    eje("4", 14.5, -1.5, 14.5, 9.5),
  ];
  const horizontales = [
    eje("A", -1.5, 0, 16, 0),
    eje("B", -1.5, 4, 16, 4),
    eje("C", -1.5, 8, 16, 8),
  ];

  it("mide desde el eje opuesto extremo hasta la punta y es editable", () => {
    const familias = calcularFamiliasCotas([...verticales, ...horizontales], {
      modo: "rebase",
      rebase: 1.5,
    });
    const v = familias.find((f) => f.ejes[0].vertical)!;
    const h = familias.find((f) => !f.ejes[0].vertical)!;
    expect(v.rebase).not.toBeNull();
    expect(v.rebase!.valor).toBeCloseTo(1.5, 6);
    expect(v.rebase!.desde).toBeCloseTo(8, 6);
    expect(v.rebase!.hasta).toBeCloseTo(9.5, 6);
    expect(cotaEditable(v.rebase!)).toBe(true);
    expect(h.rebase!.valor).toBeCloseTo(1.5, 6);
  });

  it("en modo origen no se dibuja la cota del rebase", () => {
    const familias = calcularFamiliasCotas([...verticales, ...horizontales], {
      modo: "origen",
      rebase: 1.5,
    });
    expect(familias.every((f) => f.rebase === null)).toBe(true);
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

describe("O006b: colocación del texto de cota", () => {
  it("si cabe, va centrado entre las dos marcas", () => {
    expect(posicionTextoEntreMarcas(0, 5, 0.9, 0.2)).toEqual({ centro: 2.5, fuera: false });
  });

  it("si no cabe, se saca afuera pegado a la marca derecha", () => {
    // Tramo de 0,8 m, texto de 1 m: 0,8 + 0,5 + 0,2 = 1,5.
    expect(posicionTextoEntreMarcas(0, 0.8, 1, 0.2)).toEqual({ centro: 1.5, fuera: true });
    // Con el tramo invertido también se saca por la derecha.
    expect(posicionTextoEntreMarcas(0.8, 0, 1, 0.2)).toEqual({ centro: 1.5, fuera: true });
  });
});
