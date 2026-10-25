import { describe, expect, it } from "vitest";
import {
  areaPoligono2D,
  areaSeccion,
  colocarSimbolo,
  dividirEnCapas,
  geometriaPuerta,
  geometriaVentana,
  interseccionPlanoMalla,
  type PlanoSeccion,
} from "./seccion";

interface Malla {
  vertices: number[];
  indices: number[];
}

/** Caja axis-aligned con triángulos hacia fuera. */
function caja(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): Malla {
  const v = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const caras = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 6, 5],
    [4, 7, 6],
    [0, 4, 5],
    [0, 5, 1],
    [1, 5, 6],
    [1, 6, 2],
    [2, 6, 7],
    [2, 7, 3],
    [3, 7, 4],
    [3, 4, 0],
  ];
  return { vertices: v.flat(), indices: caras.flat() };
}

function unir(...mallas: Malla[]): Malla {
  const vertices: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const malla of mallas) {
    vertices.push(...malla.vertices);
    indices.push(...malla.indices.map((i) => i + base));
    base += malla.vertices.length / 3;
  }
  return { vertices, indices };
}

const planoZ = (z: number): PlanoSeccion => ({ normal: [0, 0, 1], constante: -z });

describe("intersección plano-malla", () => {
  it("corta un cubo unitario en una polilínea cerrada de área 1", () => {
    const cubo = caja(0, 0, 0, 1, 1, 1);
    const lineas = interseccionPlanoMalla(cubo.vertices, cubo.indices, planoZ(0.5));
    expect(lineas).toHaveLength(1);
    expect(lineas[0].cerrada).toBe(true);
    expect(lineas[0].puntos).toHaveLength(4);
    expect(lineas[0].area).toBeCloseTo(1, 9);
    expect(areaSeccion(lineas)).toBeCloseTo(1, 9);
  });

  it("corta un muro con vano en dos polígonos cerrados de área exacta", () => {
    // Muro de 5 × 0,2 × 2,6 con una puerta centrada de 0,9 m que llega al suelo.
    // A 1,20 m el corte da dos rectángulos de 2,05 × 0,2 = 0,41 m².
    const muro = unir(
      caja(0, 0, 0, 2.05, 0.2, 2.6),
      caja(2.95, 0, 0, 5, 0.2, 2.6),
      caja(2.05, 0, 2.1, 2.95, 0.2, 2.6),
    );
    const lineas = interseccionPlanoMalla(muro.vertices, muro.indices, planoZ(1.2));
    expect(lineas).toHaveLength(2);
    for (const linea of lineas) {
      expect(linea.cerrada).toBe(true);
      expect(linea.area).toBeCloseTo(0.41, 9);
    }
    expect(areaSeccion(lineas)).toBeCloseTo(0.82, 9);
  });

  it("no inventa líneas cuando el plano no toca la malla", () => {
    const cubo = caja(0, 0, 0, 1, 1, 1);
    expect(interseccionPlanoMalla(cubo.vertices, cubo.indices, planoZ(3))).toHaveLength(0);
  });

  it("mide un polígono 2D con shoelace", () => {
    expect(areaPoligono2D([[0, 0], [2, 0], [2, 3], [0, 3]])).toBe(6);
  });
});

describe("simbología de puerta", () => {
  it("abate hacia un lado u otro según el pset", () => {
    const derecha = geometriaPuerta({ ancho: 0.9, volteado: false });
    const izquierda = geometriaPuerta({ ancho: 0.9, volteado: true });
    expect(derecha.lado).toBe(1);
    expect(izquierda.lado).toBe(-1);
    // El arco va de la posición cerrada (ancho, 0) a la abierta (0, ±ancho).
    expect(derecha.arco[0][0]).toBeCloseTo(0.9, 9);
    expect(derecha.arco[0][1]).toBeCloseTo(0, 9);
    expect(derecha.arco[derecha.arco.length - 1][0]).toBeCloseTo(0, 9);
    expect(derecha.arco[derecha.arco.length - 1][1]).toBeCloseTo(0.9, 9);
    expect(izquierda.arco[izquierda.arco.length - 1][1]).toBeCloseTo(-0.9, 9);
    // Todos los puntos caen del lado correcto salvo el punto de arranque.
    expect(derecha.arco.slice(1).every(([, y]) => y >= 0)).toBe(true);
    expect(izquierda.arco.slice(1).every(([, y]) => y <= 0)).toBe(true);
    // Radio constante de 0,9 m.
    for (const [x, y] of derecha.arco) {
      expect(Math.hypot(x, y)).toBeCloseTo(0.9, 9);
    }
  });

  it("dibuja la hoja como rectángulo de 0,04 m de espesor", () => {
    const { hoja } = geometriaPuerta({ ancho: 0.9 });
    expect(areaPoligono2D(hoja)).toBeCloseTo(0.9 * 0.04, 9);
    expect(hoja).toHaveLength(5);
    expect(hoja[0]).toEqual(hoja[hoja.length - 1]);
  });
});

describe("capas de muro", () => {
  it("divide la sección en bandas con el espesor de cada capa", () => {
    const rectangulo: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 0.2],
      [0, 0.2],
    ];
    const capas = dividirEnCapas(rectangulo, [
      { material: "Block", espesor: 0.12 },
      { material: "Aislante", espesor: 0.08 },
    ]);
    expect(capas).toHaveLength(2);
    expect(capas[0].material).toBe("Block");
    expect(areaPoligono2D(capas[0].puntos)).toBeCloseTo(4 * 0.12, 9);
    expect(capas[1].material).toBe("Aislante");
    expect(areaPoligono2D(capas[1].puntos)).toBeCloseTo(4 * 0.08, 9);
  });
});

describe("simbología de ventana", () => {  it("traza tres líneas paralelas y el alféizar", () => {
    const { lineas, alfeizar } = geometriaVentana({ ancho: 1.2, espesor: 0.2 });
    expect(lineas).toHaveLength(5);
    expect(lineas[0]).toEqual([
      [0, -0.1],
      [1.2, -0.1],
    ]);
    expect(lineas[1]).toEqual([
      [0, 0],
      [1.2, 0],
    ]);
    expect(lineas[2]).toEqual([
      [0, 0.1],
      [1.2, 0.1],
    ]);
    expect(areaPoligono2D(alfeizar)).toBeCloseTo(1.3 * 0.3, 9);
  });

  it("coloca el símbolo girado en el mundo", () => {
    const puntos = colocarSimbolo(
      [
        [0, 0],
        [1, 0],
      ],
      [10, 5],
      Math.PI / 2,
    );
    expect(puntos[0][0]).toBeCloseTo(10, 9);
    expect(puntos[1][0]).toBeCloseTo(10, 9);
    expect(puntos[1][1]).toBeCloseTo(6, 9);
  });
});
