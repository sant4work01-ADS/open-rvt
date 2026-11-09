import { describe, expect, it } from "vitest";
import { tramosDeCerramiento, type Referencias } from "./herramientas";

// O057: dos muros Block 15 apilados con la misma huella 0,1.5 → 2.5,1.5.
// N0: base 0.00, altura 2.20 (corona 2.20). N2: base 2.40, altura 0.60 (corona 3.00).
// El trazo en N4 debe repartirse contra el muro de N2 nada más, no duplicarse.
const APILADOS: Referencias = {
  muros: [
    {
      globalid: "muro-n0",
      x1: 0,
      y1: 1.5,
      x2: 2.5,
      y2: 1.5,
      espesor: 0.15,
      altura: 2.2,
      base: 0,
    },
    {
      globalid: "muro-n2",
      x1: 0,
      y1: 1.5,
      x2: 2.5,
      y2: 1.5,
      espesor: 0.15,
      altura: 0.6,
      base: 2.4,
    },
  ],
  extremos: [],
  medios: [],
  ejes: [],
  intersecciones: [],
};

describe("O057 tramosDeCerramiento con muros apilados", () => {
  it("devuelve un solo tramo, el del muro de corona 3.00", () => {
    const tramos = tramosDeCerramiento(APILADOS, 0, 1.5, 2.5, 1.5);
    expect(tramos).toHaveLength(1);
    expect(tramos[0].muro).toBe("muro-n2");
    expect(tramos[0].x1).toBeCloseTo(0, 9);
    expect(tramos[0].x2).toBeCloseTo(2.5, 9);
  });

  it("una sola pared no se toca (sin base también cuenta como 0)", () => {
    const uno: Referencias = {
      ...APILADOS,
      muros: [{ ...APILADOS.muros[0], base: undefined }],
    };
    const tramos = tramosDeCerramiento(uno, 0, 1.5, 2.5, 1.5);
    expect(tramos).toHaveLength(1);
    expect(tramos[0].muro).toBe("muro-n0");
  });

  it("dos muros en la misma cota no son apilados: cada uno aporta su tramo", () => {
    const dos: Referencias = {
      ...APILADOS,
      muros: [
        { ...APILADOS.muros[0], globalid: "a", x2: 1.25, base: 0 },
        { ...APILADOS.muros[0], globalid: "b", x1: 1.25, base: 0, x2: 2.5 },
      ],
    };
    const tramos = tramosDeCerramiento(dos, 0, 1.5, 2.5, 1.5);
    expect(tramos.map((t) => t.muro)).toEqual(["a", "b"]);
  });
});
