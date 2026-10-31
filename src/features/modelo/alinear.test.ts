// O026: detección de la recta de los elementos y paralelismo.
// Cuentas a mano: muro de 0.15 con su cara positiva en x=3 → centro 3.075;
// columna de 0.30 con su cara positiva en x=0 → centro 0.15.
import { describe, expect, it } from "vitest";
import {
  caraEnPunto,
  desplazamientoAlinear,
  rectaDeEje,
  rectaDeMalla,
  sonParalelas,
} from "./alinear";
import type { EjeReferencia } from "./herramientas";
import type { ElementoMalla } from "./tipos";

const ejeX3: EjeReferencia = {
  globalid: "eje-3",
  etiqueta: "3",
  x1: 3,
  y1: 0,
  x2: 3,
  y2: 10,
  vertical: true,
};

function mallaMuro(): ElementoMalla {
  return {
    globalid: "muro",
    clase: "IfcWall",
    nombre: "Muro",
    nivel: "n0",
    color: "#fff",
    opacidad: 1,
    categoria: "muros",
    tipo: "Block 15",
    capas: [{ funcion: "núcleo", material: "Block", espesor: 0.15 }],
    eje: [4, 0, 4, 5],
    estructura: null,
    vertices: new Float32Array(),
    indices: new Uint32Array(),
  } as ElementoMalla;
}

function mallaColumna(): ElementoMalla {
  return {
    globalid: "columna",
    clase: "IfcColumn",
    nombre: "Columna",
    nivel: "n0",
    color: "#fff",
    opacidad: 1,
    categoria: "columnas",
    tipo: "C-1",
    capas: [],
    eje: null,
    estructura: {
      alias: "columna",
      seccion: { B: 0.3, H: 0.3 },
      armado: {},
      datos: { X: -2, Y: 2, Rotacion: 0 },
    },
    vertices: new Float32Array(),
    indices: new Uint32Array(),
  } as ElementoMalla;
}

describe("herramienta Alinear (O026)", () => {
  it("detecta el eje del muro y su medio espesor", () => {
    const recta = rectaDeMalla(mallaMuro());
    expect(recta).not.toBeNull();
    expect(recta!.x).toBe(4);
    expect(recta!.y).toBe(0);
    expect(recta!.ux).toBe(0);
    expect(recta!.uy).toBe(1);
    expect(recta!.medio).toBeCloseTo(0.075, 9);
  });

  it("muro de 0.15 por su cara positiva queda con el eje en 3.075", () => {
    const referencia = rectaDeEje(ejeX3);
    const muro = rectaDeMalla(mallaMuro())!;
    const delta = desplazamientoAlinear(muro, referencia, "cara1");
    expect(delta).toBeCloseTo(-0.925, 9);
    expect(muro.x + referencia.uy * delta!).toBeCloseTo(3.075, 9);
  });

  it("columna de 0.30 por su cara positiva queda a 0.15 del eje", () => {
    const referencia = rectaDeEje(ejeX3);
    const columna = rectaDeMalla(mallaColumna(), {
      ux: referencia.ux,
      uy: referencia.uy,
    })!;
    expect(columna.medio).toBeCloseTo(0.15, 9);
    const ejeCero = rectaDeEje({ ...ejeX3, x1: 0, x2: 0 });
    const delta = desplazamientoAlinear(columna, ejeCero, "cara1");
    expect(delta).toBeCloseTo(2.15, 9);
    expect(columna.x + ejeCero.uy * delta!).toBeCloseTo(0.15, 9);
  });

  it("un muro perpendicular al eje no es paralelo", () => {
    const referencia = rectaDeEje(ejeX3);
    const muro = { x: 0, y: 0, ux: 1, uy: 0, medio: 0.075 };
    expect(sonParalelas(muro, referencia)).toBe(false);
    expect(desplazamientoAlinear(muro, referencia, "cara1")).toBeNull();
  });

  it("elige la cara según el lado del puntero", () => {
    const muro = rectaDeMalla(mallaMuro())!;
    expect(caraEnPunto(muro, [4.2, 1])).toBe("cara1");
    expect(caraEnPunto(muro, [3.8, 1])).toBe("cara2");
  });
});
