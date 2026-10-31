import { describe, expect, it } from "vitest";
import { altoAnotacionMundo } from "./estilos";

// O030: con «A escala» el texto mide sus mm de papel por la escala de la vista
// (2.5 mm a 1:100 = 0.25 m de modelo) y conserva ese tamaño en mundo con
// cualquier zoom; en «Pantalla» mide siempre los mismos píxeles.
describe("O030: anotación a escala vs pantalla", () => {
  it("a escala, 2.5 mm a 1:100 miden 0.25 m sin importar el zoom", () => {
    expect(altoAnotacionMundo(2.5, 100, 0.01, "papel")).toBeCloseTo(0.25, 12);
    expect(altoAnotacionMundo(2.5, 100, 0.001, "papel")).toBeCloseTo(0.25, 12);
  });

  it("a escala, el alto en píxeles se duplica al duplicar el zoom", () => {
    const a = altoAnotacionMundo(2.5, 100, 0.005, "papel") / 0.005;
    const b = altoAnotacionMundo(2.5, 100, 0.0025, "papel") / 0.0025;
    expect(a).toBeCloseTo(50, 9);
    expect(b).toBeCloseTo(100, 9);
    expect(b / a).toBeCloseTo(2, 9);
  });

  it("en pantalla el alto es constante: 11 px a cualquier zoom", () => {
    for (const mundoPorPx of [0.02, 0.01, 0.005, 0.001]) {
      expect(altoAnotacionMundo(2.5, 100, mundoPorPx, "pantalla") / mundoPorPx).toBeCloseTo(11, 9);
    }
  });

  it("cambiar la escala de la vista cambia el tamaño en modelo", () => {
    const cien = altoAnotacionMundo(2.5, 100, 0.01, "papel");
    const cincuenta = altoAnotacionMundo(2.5, 50, 0.01, "papel");
    expect(cincuenta).not.toBeCloseTo(cien, 6);
  });
});
