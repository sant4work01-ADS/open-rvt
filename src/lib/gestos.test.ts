import { describe, expect, it } from "vitest";
import {
  VENTANA_DUPLICADO_MS,
  debeIgnorarGestoNativo,
  factorGestoZoom,
} from "./gestos";

describe("factorGestoZoom (O018)", () => {
  it("100 → 110 acerca con factor exacto 1.1", () => {
    expect(factorGestoZoom(100, 110)).toBe(1.1);
  });

  it("100 → 300 se acota al máximo 1.25", () => {
    expect(factorGestoZoom(100, 300)).toBe(1.25);
  });

  it("100 → 10 se acota al mínimo 0.8", () => {
    expect(factorGestoZoom(100, 10)).toBe(0.8);
  });

  it("100 → 80 es exactamente el mínimo 0.8", () => {
    expect(factorGestoZoom(100, 80)).toBe(0.8);
  });

  it("sin distancia anterior (0 o negativa) no hay zoom", () => {
    expect(factorGestoZoom(0, 120)).toBe(1);
    expect(factorGestoZoom(-5, 120)).toBe(1);
    expect(factorGestoZoom(100, 0)).toBe(1);
  });

  it("valores no finitos no producen NaN", () => {
    expect(factorGestoZoom(Number.NaN, 120)).toBe(1);
    expect(factorGestoZoom(100, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("filtro de duplicados (O018)", () => {
  it("ignora el nativo dentro de los 150 ms posteriores a un wheel con Ctrl", () => {
    expect(debeIgnorarGestoNativo(1_000, 1_000)).toBe(true);
    expect(debeIgnorarGestoNativo(1_000, 1_149)).toBe(true);
  });

  it("a partir de 150 ms ya no lo ignora", () => {
    expect(debeIgnorarGestoNativo(1_000, 1_000 + VENTANA_DUPLICADO_MS)).toBe(false);
    expect(debeIgnorarGestoNativo(1_000, 1_151)).toBe(false);
  });

  it("sin wheel previo aplica el gesto nativo", () => {
    expect(debeIgnorarGestoNativo(null, 5_000)).toBe(false);
  });
});
