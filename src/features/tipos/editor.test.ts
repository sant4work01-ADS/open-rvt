import { describe, expect, it } from "vitest";
import type { CapaMuro } from "@/features/modelo/tipos";
import {
  cmAMetros,
  espesorCm,
  nombreDuplicado,
  posicionesCapas,
  totalCapas,
  validarCapas,
} from "./editor";

const CAPAS: CapaMuro[] = [
  { funcion: "acabado", material: "Pintura", espesor: 0.0005 },
  { funcion: "acabado", material: "Aplanado fino", espesor: 0.005 },
  { funcion: "acabado", material: "Aplanado de mortero (repellado)", espesor: 0.015 },
  { funcion: "núcleo", material: "Block de concreto 15", espesor: 0.15 },
  { funcion: "acabado", material: "Yeso", espesor: 0.01 },
  { funcion: "acabado", material: "Pintura", espesor: 0.0005 },
];

describe("tabla de capas", () => {
  it("conserva el orden exterior→interior y suma 0.181 m exactos", () => {
    expect(CAPAS.map((c) => c.material)).toEqual([
      "Pintura",
      "Aplanado fino",
      "Aplanado de mortero (repellado)",
      "Block de concreto 15",
      "Yeso",
      "Pintura",
    ]);
    expect(totalCapas(CAPAS)).toBeCloseTo(0.181, 12);
    expect(totalCapas(CAPAS)).not.toBeCloseTo(0.185, 3);
  });

  it("exige exactamente un núcleo", () => {
    expect(validarCapas(CAPAS)).toBeNull();
    expect(validarCapas([{ funcion: "acabado", espesor: 0.01 }])).toBe(
      "El muro necesita al menos una capa de núcleo.",
    );
    expect(
      validarCapas([
        { funcion: "núcleo", espesor: 0.15 },
        { funcion: "aislante", espesor: 0.02 },
        { funcion: "núcleo", espesor: 0.12 },
      ]),
    ).toBe("Las capas de núcleo deben ser contiguas: no puede haber dos núcleos separados.");
  });

  it("acepta varias capas de núcleo contiguas", () => {
    expect(
      validarCapas([
        { funcion: "acabado", espesor: 0.01 },
        { funcion: "núcleo", espesor: 0.12 },
        { funcion: "núcleo", espesor: 0.03 },
        { funcion: "acabado", espesor: 0.01 },
      ]),
    ).toBeNull();
  });

  it("rechaza espesores no positivos", () => {
    expect(validarCapas([{ funcion: "núcleo", espesor: 0 }])).toBe(
      "Todas las capas necesitan un espesor mayor que cero.",
    );
  });

  it("convierte centímetros de la tabla sin perder exactitud", () => {
    expect(espesorCm(0.0005)).toBe("0.05");
    expect(espesorCm(0.181)).toBe("18.1");
    expect(cmAMetros("18.1")).toBeCloseTo(0.181, 12);
    expect(cmAMetros("1,5")).toBeCloseTo(0.015, 12);
  });
});

describe("vista previa", () => {
  it("coloca cada capa en proporción exacta a su espesor", () => {
    const bandas = posicionesCapas(CAPAS, 362);
    expect(bandas).toHaveLength(6);
    const total = totalCapas(CAPAS);
    expect(bandas[0].x).toBe(0);
    expect(bandas[0].ancho).toBeCloseTo((0.0005 / total) * 362, 9);
    expect(bandas[3].x).toBeCloseTo(((0.0005 + 0.005 + 0.015) / total) * 362, 9);
    expect(bandas[3].ancho).toBeCloseTo((0.15 / total) * 362, 9);
    expect(bandas[5].x + bandas[5].ancho).toBeCloseTo(362, 9);
    const suma = bandas.reduce((s, b) => s + b.ancho, 0);
    expect(suma).toBeCloseTo(362, 9);
    expect(bandas.map((b) => b.esNucleo)).toEqual([false, false, false, true, false, false]);
  });

  it("no dibuja nada sin capas o sin ancho", () => {
    expect(posicionesCapas([], 360)).toEqual([]);
    expect(posicionesCapas(CAPAS, 0)).toEqual([]);
  });
});

describe("nombres al duplicar", () => {
  it("propone un nombre libre", () => {
    expect(nombreDuplicado("Block 15", ["Block 15"])).toBe("Block 15 copia");
    expect(nombreDuplicado("Block 15", ["Block 15", "Block 15 copia"])).toBe(
      "Block 15 copia 2",
    );
  });
});
