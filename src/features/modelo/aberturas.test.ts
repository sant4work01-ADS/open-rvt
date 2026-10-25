import { describe, expect, it } from "vitest";
import { construirAbertura, construirAberturas } from "./aberturas";
import type { ElementoMalla, PropiedadesElemento } from "./tipos";

const REFERENCIAS = {
  muros: [{ globalid: "muro1", x1: 0, y1: 0, x2: 8, y2: 0, espesor: 0.15, altura: 2.6 }],
  extremos: [],
  medios: [],
  ejes: [],
  intersecciones: [],
};

function propiedades(extra: Partial<PropiedadesElemento> = {}): PropiedadesElemento {
  return {
    globalid: "p1",
    clase: "IfcDoor",
    nombre: "Puerta",
    nivel: "N1",
    tipo: "Puerta 0.9",
    atributos: {},
    materiales: [],
    psets: {},
    ...extra,
  };
}

function malla(minX: number, minY: number, maxX: number, maxY: number): ElementoMalla {
  return {
    globalid: "p1",
    clase: "IfcDoor",
    nombre: "Puerta",
    nivel: "N1",
    color: "#fff",
    opacidad: 1,
    categoria: "puertas",
    tipo: "Puerta 0.9",
    capas: [],
    vertices: new Float32Array([minX, minY, 0, maxX, maxY, 2.1]),
    indices: new Uint32Array([0, 1, 0]),
  };
}

describe("simbología de aberturas", () => {
  it("usa la distancia del pset para centrar la puerta en su muro", () => {
    const abertura = construirAbertura(
      propiedades({
        psets: { OPENRVT_Abertura: { Muro: "muro1", Distancia: 2, Ancho: 0.9, Volteado: true } },
      }),
      undefined,
      REFERENCIAS,
    );
    expect(abertura).not.toBeNull();
    expect(abertura?.centro[0]).toBeCloseTo(2.45, 9);
    expect(abertura?.centro[1]).toBeCloseTo(0, 9);
    expect(abertura?.angulo).toBeCloseTo(0, 9);
    expect(abertura?.espesor).toBe(0.15);
    expect(abertura?.volteado).toBe(true);
    expect(abertura?.categoria).toBe("puertas");
  });

  it("gira la abertura con el muro", () => {
    const referencias = {
      ...REFERENCIAS,
      muros: [{ globalid: "muro1", x1: 0, y1: 0, x2: 0, y2: 6, espesor: 0.2, altura: 2.6 }],
    };
    const abertura = construirAbertura(
      propiedades({
        psets: { OPENRVT_Abertura: { Muro: "muro1", Distancia: 1, Ancho: 1.0 } },
      }),
      undefined,
      referencias,
    );
    expect(abertura?.centro[0]).toBeCloseTo(0, 9);
    expect(abertura?.centro[1]).toBeCloseTo(1.5, 9);
    expect(abertura?.angulo).toBeCloseTo(Math.PI / 2, 9);
  });

  it("cae a la caja envolvente en modelos sin pset OPENRVT", () => {
    const abertura = construirAbertura(propiedades(), malla(1, 0, 2.2, 0.15), REFERENCIAS);
    expect(abertura?.centro[0]).toBeCloseTo(1.6, 6);
    expect(abertura?.centro[1]).toBeCloseTo(0.075, 6);
    expect(abertura?.ancho).toBeCloseTo(1.2, 6);
    expect(abertura?.espesor).toBeCloseTo(0.15, 6);
    expect(abertura?.angulo).toBe(0);
  });

  it("solo convierte puertas y ventanas", () => {
    expect(construirAbertura(propiedades({ clase: "IfcWall" }), malla(0, 0, 1, 1), REFERENCIAS)).toBeNull();
    const lista = construirAberturas(
      [
        propiedades({ globalid: "p1" }),
        propiedades({ globalid: "p2", clase: "IfcWindow" }),
        propiedades({ globalid: "p3", clase: "IfcWall" }),
      ],
      [malla(0, 0, 1, 0.2), { ...malla(3, 3, 4, 3.2), globalid: "p2", clase: "IfcWindow" }],
      REFERENCIAS,
    );
    expect(lista.map((a) => a.globalid)).toEqual(["p1", "p2"]);
    expect(lista[1].categoria).toBe("ventanas");
  });
});
