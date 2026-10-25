import { describe, expect, it } from "vitest";
import { formatearCantidadCorta, formatearCosto } from "./formato";

describe("formato de costos y cantidades", () => {
  it("el costo siempre muestra 2 decimales aunque el dato traiga 20", () => {
    expect(formatearCosto("185.12345678901234567890")).toBe("185.12");
    expect(formatearCosto("1234.5")).toBe("1,234.50");
    expect(formatearCosto("0.005")).toBe("0.01");
    expect(formatearCosto(null)).toBe("");
  });

  it("cantidades y rendimientos se recortan a 6 decimales sin ceros sobrantes", () => {
    expect(formatearCantidadCorta("0.0333333333333333333")).toBe("0.033333");
    expect(formatearCantidadCorta("12.500000")).toBe("12.5");
    expect(formatearCantidadCorta("0.02")).toBe("0.02");
  });
});
