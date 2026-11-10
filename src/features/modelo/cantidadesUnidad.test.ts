// O063 punto 6: totales por unidad calculados a mano (sin copiar la salida).
import { describe, expect, it } from "vitest";
import { totalesOrdenados, totalesPorUnidad } from "./cantidadesUnidad";

describe("totales por unidad", () => {
  it("suma m² y m³ por separado con valores exactos", () => {
    const partidas = [
      { unidad: "m2", total: 18.25 },
      { unidad: "m2", total: 4.5 },
      { unidad: "m3", total: 1.5 },
      { unidad: "m3", total: 0.5 },
    ];
    // A mano: 18.25 + 4.5 = 22.75 m²; 1.5 + 0.5 = 2.0 m³.
    expect(totalesPorUnidad(partidas)).toEqual({ m2: 22.75, m3: 2 });
    expect(totalesOrdenados(partidas)).toEqual([
      ["m2", 22.75],
      ["m3", 2],
    ]);
  });

  it("no mezcla unidades aunque compartan renglón ni pierde unidades raras", () => {
    const partidas = [
      { unidad: "kg", total: 12 },
      { unidad: "m", total: 3 },
      { unidad: "global", total: 1 },
    ];
    // A mano: 12 kg, 3 m y 1 global; cada uno independiente.
    expect(totalesOrdenados(partidas)).toEqual([
      ["m", 3],
      ["kg", 12],
      ["global", 1],
    ]);
  });

  it("con lista vacía no inventa totales", () => {
    expect(totalesOrdenados([])).toEqual([]);
  });
});
