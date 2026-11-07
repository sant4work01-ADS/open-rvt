// O050: cierre de la losa sobre el primer vértice.
// 12 px con una escala de 0.01 m/px son 0.12 m: a 0.11 m cierra y a 0.13 m no.
import { describe, expect, test } from "vitest";
import { esCierreLosa, type Punto2 } from "./herramientas";

const triangulo: Punto2[] = [
  [0, 1.5],
  [2.5, 1.5],
  [2.5, 0],
];

describe("O050: cierre de la losa sobre el primer vértice", () => {
  test("con cuatro vértices, un clic a 0.11 m del primero (11 px) cierra", () => {
    expect(esCierreLosa([...triangulo, [5, 5]], [0.11, 1.5], 0.01)).toBe(true);
  });

  test("a 0.13 m (13 px) no cierra: sigue agregando vértices", () => {
    expect(esCierreLosa([...triangulo, [5, 5]], [0.13, 1.5], 0.01)).toBe(false);
  });

  test("con dos vértices el primer clic no cierra aunque caiga encima", () => {
    expect(esCierreLosa(triangulo.slice(0, 2), [0, 1.5], 0.01)).toBe(false);
  });

  test("sin escala de pantalla no se arriesga un cierre", () => {
    expect(esCierreLosa([...triangulo, [5, 5]], [0, 1.5], 0)).toBe(false);
  });
});
