// O051: elevación del cuadro «Nivel». Los valores esperados salen de la spec:
// absoluto («2.20» = 2.20) o relativo al nivel más alto («+2.6» sobre 2.20 = 4.80);
// vacío o ilegible no crea nada y una elevación ocupada (±1 mm) se rechaza.
import { describe, expect, it } from "vitest";
import { resolverElevacion } from "./nivelesDialogo";
import type { NivelRef } from "./niveles";

const niveles: NivelRef[] = [
  { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
  { globalid: "n1", nombre: "Nivel 1", elevacion: 2.2 },
];

describe("O051: elevación absoluta", () => {
  it("«2.20» es 2.20 y «3» es 3.00", () => {
    expect(resolverElevacion("2.20", [niveles[0]]).elevacion).toBe(2.2);
    expect(resolverElevacion("3", [niveles[0]]).elevacion).toBe(3);
  });

  it("acepta coma, centímetros y negativos como el resto de cotas", () => {
    expect(resolverElevacion("2,2", [niveles[0]]).elevacion).toBe(2.2);
    expect(resolverElevacion("220cm", [niveles[0]]).elevacion).toBe(2.2);
    expect(resolverElevacion("-1.5", [niveles[0]]).elevacion).toBe(-1.5);
  });
});

describe("O051: elevación relativa al nivel más alto", () => {
  it("con el más alto en 2.20, «+2.6» da 4.80 y «+0.2» da 2.40", () => {
    expect(resolverElevacion("+2.6", niveles).elevacion).toBe(4.8);
    expect(resolverElevacion("+0.2", niveles).elevacion).toBe(2.4);
  });

  it("sin niveles la base relativa es 0.00", () => {
    expect(resolverElevacion("+1.5", []).elevacion).toBe(1.5);
  });

  it("el nivel más alto manda aunque la lista venga desordenada", () => {
    const desordenados: NivelRef[] = [
      { globalid: "a", nombre: "Alto", elevacion: 6 },
      { globalid: "b", nombre: "Bajo", elevacion: 0 },
    ];
    expect(resolverElevacion("+0.5", desordenados).elevacion).toBe(6.5);
  });
});

describe("O051: sin valor válido no se crea nada", () => {
  it("vacío y solo espacios dan error y elevación nula", () => {
    for (const texto of ["", "   "]) {
      const r = resolverElevacion(texto, niveles);
      expect(r.elevacion).toBeNull();
      expect(r.error).toBeTruthy();
    }
  });

  it("texto ilegible da error y elevación nula", () => {
    for (const texto of ["abc", "4.5.6", "++2", "+", "10cmx"]) {
      const r = resolverElevacion(texto, niveles);
      expect(r.elevacion).toBeNull();
      expect(r.error).toBeTruthy();
    }
  });
});

describe("O051: elevación ocupada", () => {
  it("2.20 repetido se rechaza con el nombre del nivel que la ocupa", () => {
    const r = resolverElevacion("2.20", niveles);
    expect(r.elevacion).toBeNull();
    expect(r.error).toContain("Nivel 1");
  });

  it("la tolerancia es ±1 mm, igual que en el núcleo", () => {
    expect(resolverElevacion("2.201", niveles).elevacion).toBeNull();
    expect(resolverElevacion("2.202", niveles).elevacion).toBe(2.202);
  });

  it("un relativo que cae sobre otro nivel también se rechaza", () => {
    const r = resolverElevacion("+0", niveles);
    expect(r.elevacion).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
