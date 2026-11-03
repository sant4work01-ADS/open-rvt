// O034: valores a mano, no copiados del código.
// - Rectángulo 4×3 con vértices (0,0) (4,0) (4,3) (0,3): el borde norte va de
//   (4,3) a (0,3); su punto medio es (2,3) y su normal exterior apunta a +Y.
// - L con (0,0) (4,0) (4,2) (2,2) (2,4) (0,4): el borde que sube por el hueco
//   va de (2,2) a (2,4); su punto medio es (2,3) y su normal exterior es +X.
// - Arrastrar 0.15 hacia afuera desde 0 da +0.15; 0.10 hacia adentro da −0.10.
import { describe, expect, it } from "vitest";
import {
  asasDeLosa,
  contornoPrevio,
  desfaseConArrastre,
  hayAsasLosa,
  leerPoligonoWkt,
  redondearPaso,
} from "./asasLosa";
import type { BordeLosa } from "./bordesLosa";

const borde = (
  a: [number, number],
  b: [number, number],
  signo: number,
  desfase = 0,
): BordeLosa => ({
  referencia: "libre",
  desfase,
  signo,
  punto_a: a,
  punto_b: b,
});

const RECTANGULO: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];
const BORDES_RECTANGULO: BordeLosa[] = [
  borde([0, 0], [4, 0], -1),
  borde([4, 0], [4, 3], -1),
  borde([4, 3], [0, 3], -1),
  borde([0, 3], [0, 0], -1),
];
const L: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];
const BORDES_L: BordeLosa[] = L.map((a, i) => borde(a, L[(i + 1) % L.length], -1));

describe("O034: geometría de las asas", () => {
  it("rectángulo 4×3: puntos medios y normales hacia afuera", () => {
    const asas = asasDeLosa(BORDES_RECTANGULO, RECTANGULO);
    expect(asas).toHaveLength(4);
    expect(asas[0].medio).toEqual([2, 0]);
    expect(asas[0].normal).toEqual([0, -1]);
    expect(asas[1].medio).toEqual([4, 1.5]);
    expect(asas[1].normal).toEqual([1, 0]);
    expect(asas[2].medio).toEqual([2, 3]);
    expect(asas[2].normal).toEqual([0, 1]);
    expect(asas[3].medio).toEqual([0, 1.5]);
    expect(asas[3].normal).toEqual([-1, 0]);
  });

  it("losa en L: el borde del hueco apunta hacia +X", () => {
    const asas = asasDeLosa(BORDES_L, L);
    // Borde 3: (2,2) → (2,4); el interior de la L queda al oeste y afuera es +X.
    expect(asas[3].medio).toEqual([2, 3]);
    expect(asas[3].normal).toEqual([1, 0]);
    // Borde 0: (0,0) → (4,0), afuera −Y.
    expect(asas[0].medio).toEqual([2, 0]);
    expect(asas[0].normal).toEqual([0, -1]);
  });

  it("sin polígono suma el desfase guardado a los puntos base", () => {
    const bordes = BORDES_RECTANGULO.map((b, i) =>
      i === 2 ? { ...b, desfase: 0.2 } : b,
    );
    const asas = asasDeLosa(bordes);
    // Norte +0.20: de (4,3.2) a (0,3.2), medio (2,3.2).
    expect(asas[2].medio[0]).toBeCloseTo(2, 9);
    expect(asas[2].medio[1]).toBeCloseTo(3.2, 9);
    expect(asas[0].medio[1]).toBeCloseTo(0, 9);
  });

  it("lee el contorno WKT del pset", () => {
    expect(
      leerPoligonoWkt("POLYGON ((0 0, 4 0, 4 3, 0 3, 0 0))"),
    ).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
    expect(leerPoligonoWkt("no es wkt")).toBeNull();
  });
});

describe("O034: arrastre a desfase con signo", () => {
  it("0.15 hacia afuera es +0.15 y 0.10 hacia adentro es −0.10", () => {
    const norte: [number, number] = [0, 1];
    expect(desfaseConArrastre(0, norte, [0, 0.15])).toBe(0.15);
    expect(desfaseConArrastre(0, norte, [0, -0.1])).toBe(-0.1);
    // El movimiento lateral no cambia el desfase.
    expect(desfaseConArrastre(0, norte, [0.5, 0])).toBe(0);
    expect(redondearPaso(-0.0000001)).toBe(0);
  });

  it("redondea a 0.005 m", () => {
    const norte: [number, number] = [0, 1];
    expect(desfaseConArrastre(0, norte, [0, 0.1523])).toBe(0.15);
    expect(desfaseConArrastre(0, norte, [0, 0.1526])).toBe(0.155);
    expect(desfaseConArrastre(0, norte, [0, -0.1049])).toBe(-0.105);
    expect(redondearPaso(0.0124)).toBe(0.01);
  });

  it("la vista previa separa solo el borde arrastrado", () => {
    const contorno = contornoPrevio(RECTANGULO, 2, [0, 1], 0.2);
    expect(contorno).toEqual([
      [0, 0],
      [4, 0],
      [4, 3.2],
      [0, 3.2],
    ]);
    const adentro = contornoPrevio(RECTANGULO, 0, [0, -1], -0.1);
    expect(adentro).toEqual([
      [0, 0.1],
      [4, 0.1],
      [4, 3],
      [0, 3],
    ]);
  });
});

describe("O034: cuándo se ven las asas", () => {
  it("con una losa seleccionada sí y con dos no", () => {
    expect(hayAsasLosa("losa1", ["losa1"], "IfcSlab")).toBe(true);
    expect(hayAsasLosa("losa1", ["losa1", "losa2"], "IfcSlab")).toBe(false);
    expect(hayAsasLosa("losa1", ["losa1"], "IfcWall")).toBe(false);
    expect(hayAsasLosa(null, [], "IfcSlab")).toBe(false);
    expect(hayAsasLosa("losa1", [], "IfcSlab")).toBe(false);
  });
});
