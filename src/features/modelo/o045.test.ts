// O045: el cerramiento se dibuja como un muro y se liga solo al muro que tiene
// debajo. Aquí se prueban la tolerancia de colinealidad (mitad del espesor), el
// corte en juntas de muros colineales y el nivel por omisión de la planta activa.
import { describe, expect, test } from "vitest";
import {
  opcionesCerramientoEnVista,
  REFERENCIAS_VACIAS,
  tramosDeCerramiento,
  type Referencias,
} from "./herramientas";

const muro = (globalid: string, x1: number, y1: number, x2: number, y2: number) => ({
  globalid,
  x1,
  y1,
  x2,
  y2,
  espesor: 0.15,
  altura: 2.6,
});

const refs: Referencias = {
  ...REFERENCIAS_VACIAS,
  muros: [muro("muro", 0, 0, 7, 0)],
};

const largo = (t: { x1: number; y1: number; x2: number; y2: number }) =>
  Math.hypot(t.x2 - t.x1, t.y2 - t.y1);

describe("O045: colinealidad con el muro de debajo", () => {
  test("a 7 cm del eje, dentro de la mitad del espesor (7.5 cm), se liga", () => {
    const tramos = tramosDeCerramiento(refs, 0, 0.07, 3, 0.07);
    expect(tramos).toHaveLength(1);
    expect(tramos[0].muro).toBe("muro");
    expect(largo(tramos[0])).toBeCloseTo(3, 9);
  });

  test("a 9 cm del eje, fuera de la tolerancia, queda libre", () => {
    const tramos = tramosDeCerramiento(refs, 0, 0.09, 3, 0.09);
    expect(tramos).toHaveLength(1);
    expect(tramos[0].muro).toBeNull();
    expect(largo(tramos[0])).toBeCloseTo(3, 9);
  });

  test("un trazo que sale del largo del muro deja libre solo lo que sobra", () => {
    const tramos = tramosDeCerramiento(refs, 2, 0, 9, 0);
    expect(tramos).toHaveLength(2);
    expect(tramos[0].muro).toBe("muro");
    expect(largo(tramos[0])).toBeCloseTo(5, 9); // 2 → 7
    expect(tramos[1].muro).toBeNull();
    expect(largo(tramos[1])).toBeCloseTo(2, 9); // 7 → 9
  });
});

describe("O045: corte en juntas de muros colineales", () => {
  const dos: Referencias = {
    ...REFERENCIAS_VACIAS,
    muros: [muro("a", 0, 0, 3.5, 0), muro("b", 3.5, 0, 7, 0)],
  };

  test("un trazo de 7 m sobre dos muros de 3.5 m da uno por muro", () => {
    const tramos = tramosDeCerramiento(dos, 0, 0, 7, 0);
    expect(tramos).toHaveLength(2);
    expect(tramos.map((t) => t.muro)).toEqual(["a", "b"]);
    expect(largo(tramos[0])).toBeCloseTo(3.5, 9);
    expect(largo(tramos[1])).toBeCloseTo(3.5, 9);
  });

  test("la junta no duplica: el tramo de cada muro termina en su extremo", () => {
    const tramos = tramosDeCerramiento(dos, 0, 0, 7, 0);
    expect(tramos[0].x2).toBeCloseTo(3.5, 9);
    expect(tramos[1].x1).toBeCloseTo(3.5, 9);
  });
});

describe("O045: nivel por omisión de la planta activa", () => {
  const niveles = [
    { globalid: "n0", elevacion: 0 },
    { globalid: "n22", elevacion: 2.2 },
  ];

  test("en una planta intermedia toma su nivel con desfase 0", () => {
    expect(
      opcionesCerramientoEnVista({ tipo: "planta", nivel: "n22" }, { nivel: "", desfase: "" }, niveles),
    ).toEqual({ nivel: "n22", desfase: 0 });
  });

  test("el nivel elegido en la barra manda sobre la planta", () => {
    expect(
      opcionesCerramientoEnVista(
        { tipo: "planta", nivel: "n22" },
        { nivel: "n0", desfase: "0.15" },
        niveles,
      ),
    ).toEqual({ nivel: "n0", desfase: 0.15 });
  });
});
