// O006d: la heurística de `wheel` distingue ratón, touchpad y pellizco.
import { describe, expect, it } from "vitest";
import { clasificarRueda, factorRueda } from "./rueda";

const evento = (cambios: Partial<Parameters<typeof clasificarRueda>[0]> = {}) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  shiftKey: false,
  ...cambios,
});

describe("clasificación de la rueda", () => {
  it("el pellizco del touchpad (ctrl+wheel) siempre hace zoom", () => {
    expect(clasificarRueda(evento({ deltaY: 3.25, ctrlKey: true }), "paneo")).toBe("zoom");
  });

  it("la rueda de ratón con saltos enteros de 100 o 120 hace zoom", () => {
    expect(clasificarRueda(evento({ deltaY: 100 }))).toBe("zoom");
    expect(clasificarRueda(evento({ deltaY: -120 }))).toBe("zoom");
    expect(clasificarRueda(evento({ deltaY: 100, shiftKey: true }))).toBe("paneo-horizontal");
  });

  it("el touchpad fraccionario o pequeño panea, también con deltaX solo", () => {
    expect(clasificarRueda(evento({ deltaY: 12.5 }))).toBe("paneo");
    expect(clasificarRueda(evento({ deltaY: -3.75, deltaX: 1.5 }))).toBe("paneo");
    expect(clasificarRueda(evento({ deltaX: 18 }))).toBe("paneo");
  });

  it("deltaMode de líneas se considera ratón", () => {
    expect(clasificarRueda(evento({ deltaY: 3, deltaMode: 1 }))).toBe("zoom");
  });

  it("la preferencia manual manda salvo en pellizco y Shift", () => {
    expect(clasificarRueda(evento({ deltaY: 5 }), "zoom")).toBe("zoom");
    expect(clasificarRueda(evento({ deltaY: 120 }), "paneo")).toBe("paneo");
    expect(clasificarRueda(evento({ deltaY: 5, ctrlKey: true }), "paneo")).toBe("zoom");
    expect(clasificarRueda(evento({ deltaY: 5, shiftKey: true }), "zoom")).toBe(
      "paneo-horizontal",
    );
  });

  it("el factor de zoom crece con el delta y es simétrico", () => {
    expect(factorRueda(100)).toBeGreaterThan(1);
    expect(factorRueda(-100)).toBeLessThan(1);
    expect(factorRueda(100) * factorRueda(-100)).toBeCloseTo(1, 6);
  });
});
