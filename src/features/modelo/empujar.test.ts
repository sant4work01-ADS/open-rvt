import { describe, expect, it } from "vitest";
import {
  alturaEnEjeVertical,
  alturaPermitida,
  clasificarEmpujar,
  crearRectangulo,
  parsearAltura,
  parsearDimensiones,
  puntosRectangulo,
  rayoPlanoHorizontal,
  rectanguloDesdeDimensiones,
  type RectanguloEmpujar,
} from "./empujar";

const rect = (ancho: number, largo: number): RectanguloEmpujar =>
  crearRectangulo([0, 0], [ancho, largo]);

describe("rayo contra el plano horizontal del nivel", () => {
  it("un rayo vertical hacia abajo cae exactamente en su x/y sobre z = 0", () => {
    expect(
      rayoPlanoHorizontal(
        { origen: [2, 3, 5], direccion: [0, 0, -1] },
        0,
      ),
    ).toEqual([2, 3, 0]);
  });

  it("un rayo oblicuo a 45° recorre la misma distancia en x y en z", () => {
    // Desde (0,0,1) con dirección (1,0,-1): para bajar 1 m avanza 1 m en x.
    expect(
      rayoPlanoHorizontal(
        { origen: [0, 0, 1], direccion: [1, 0, -1] },
        0,
      ),
    ).toEqual([1, 0, 0]);
  });

  it("una cota distinta del cero se respeta", () => {
    // Baja 3 m desde z = 4 hasta z = 1.
    expect(
      rayoPlanoHorizontal(
        { origen: [0, 0, 4], direccion: [0, 0, -1] },
        1,
      ),
    ).toEqual([0, 0, 1]);
  });

  it("un rayo paralelo al plano no corta: null", () => {
    expect(
      rayoPlanoHorizontal(
        { origen: [0, 0, 1], direccion: [1, 0, 0] },
        0,
      ),
    ).toBeNull();
  });

  it("un rayo que apunta hacia arriba no corta el plano de abajo: null", () => {
    expect(
      rayoPlanoHorizontal(
        { origen: [0, 0, 1], direccion: [0, 0, 1] },
        0,
      ),
    ).toBeNull();
  });
});

describe("altura siguiendo el eje Z del punto del contorno", () => {
  it("un rayo de 45° desde 10 m de alto a 5 m de la base da 5 m", () => {
    // R(t) = (−5 + t, 0, 10 − t); la vertical es (0, 0, z). En t = 5 pasa por
    // (0, 0, 5): la altura sobre la base es 5 m.
    expect(
      alturaEnEjeVertical(
        { origen: [-5, 0, 10], direccion: [1, 0, -1] },
        [0, 0, 0],
      ),
    ).toBeCloseTo(5, 12);
  });

  it("un rayo vertical es paralelo al eje: no hay altura única y devuelve null", () => {
    expect(
      alturaEnEjeVertical(
        { origen: [0, 0, 10], direccion: [0, 0, -1] },
        [0, 0, 0],
      ),
    ).toBeNull();
  });

  it("la altura es negativa si el punto más cercano queda bajo la base", () => {
    // Solo cuentan x/y para acercarse a la vertical (0,0,z): el rayo pasa por
    // (0,0,−2) en t = 0 y su altura es −2.
    expect(
      alturaEnEjeVertical(
        { origen: [0, 0, -2], direccion: [0, 1, 1] },
        [0, 0, 0],
      ),
    ).toBeCloseTo(-2, 12);
  });
});

describe("clasificación automática (valores de la spec O046)", () => {
  // Tabla razonada: r = lado menor, R = lado mayor, h = |altura|.
  const casos: Array<[string, RectanguloEmpujar, number, string]> = [
    // r = 0.15 ≤ 0.35 y R = 4 ≥ 3·0.15 = 0.45 → muro.
    ["0.15 × 4 × 2.6", rect(0.15, 4), 2.6, "muro"],
    // h = 0.12 ≤ 0.30 → losa, sin importar 4 × 5.
    ["4 × 5 × 0.12", rect(4, 5), 0.12, "losa"],
    // r = R = 0.30; R ≤ 0.80 y h = 2.6 ≥ 1 → columna (no llega a 3·r).
    ["0.30 × 0.30 × 2.6", rect(0.3, 0.3), 2.6, "columna"],
    // 2 × 2 no pasa ninguna regla: genérico.
    ["2 × 2 × 1", rect(2, 2), 1, "generico"],
    // El borde h = 0.30 exacto todavía es losa.
    ["4 × 5 × 0.30", rect(4, 5), 0.3, "losa"],
    // r = 0.35, R = 1.05 = 3·r exacto: muro.
    ["0.35 × 1.05 × 2.6", rect(0.35, 1.05), 2.6, "muro"],
    // R = 1.04 < 3·r = 1.05: no es muro; sección esbelta → columna.
    ["0.35 × 1.04 × 2.6", rect(0.35, 1.04), 2.6, "columna"],
    // 0.34 × 1.02: 3·0.34 = 1.02 y el borde sí alcanza → muro.
    ["0.34 × 1.02 × 2.6", rect(0.34, 1.02), 2.6, "muro"],
    // Sección de 0.80 × 0.80 (el límite) con h ≥ 1 → columna.
    ["0.80 × 0.80 × 3", rect(0.8, 0.8), 3, "columna"],
    // 0.81 supera el límite de sección y no es esbelto → genérico.
    ["0.81 × 0.81 × 3", rect(0.81, 0.81), 3, "generico"],
    // Muro delgado aunque su altura sea menor que 1 m.
    ["0.35 × 1.06 × 0.80", rect(0.35, 1.06), 0.8, "muro"],
    // Esbelto pero bajo: la columna exige h ≥ 1 → genérico.
    ["0.35 × 1.04 × 0.50", rect(0.35, 1.04), 0.5, "generico"],
    // Una columna muy pequeña sigue siendo columna.
    ["0.10 × 0.10 × 2.6", rect(0.1, 0.1), 2.6, "columna"],
    // La altura negativa no cambia la clase; el núcleo decide si se permite.
    ["2 × 2 × −2.6", rect(2, 2), -2.6, "generico"],
  ];

  for (const [nombre, r, h, esperado] of casos) {
    it(`${nombre} → ${esperado}`, () => {
      expect(clasificarEmpujar(r, h).clase).toBe(esperado);
    });
  }

  it("una losa de 0.30 m no se confunde con muro aunque sea larga", () => {
    // 0.15 × 8 × 0.30: h manda y sale losa.
    expect(clasificarEmpujar(rect(0.15, 8), 0.3).clase).toBe("losa");
  });

  it("la altura negativa solo se permite en Genérico", () => {
    expect(alturaPermitida("generico", -1)).toBe(true);
    expect(alturaPermitida("muro", -1)).toBe(false);
    expect(alturaPermitida("losa", -0.1)).toBe(false);
    expect(alturaPermitida("columna", -2)).toBe(false);
    expect(alturaPermitida("muro", 2.6)).toBe(true);
    expect(alturaPermitida("generico", 0)).toBe(false);
  });
});

describe("rectángulo desde una esquina y dimensiones tecleadas", () => {
  it("sale hacia el cuadrante donde está el ratón", () => {
    expect(rectanguloDesdeDimensiones([1, 1], { ancho: 4, largo: 0.15 }, [2, 0])).toEqual({
      x1: 1,
      y1: 1,
      x2: 5,
      y2: 0.85,
    });
  });

  it("los cuatro puntos quedan ordenados y cierran el rectángulo", () => {
    expect(puntosRectangulo({ x1: 4, y1: 3, x2: 0, y2: 0 })).toEqual([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
  });

  it("acepta coma, punto y coma y espacios", () => {
    expect(parsearDimensiones("4,0.15")).toEqual({ ancho: 4, largo: 0.15 });
    expect(parsearDimensiones("4 , 0.15")).toEqual({ ancho: 4, largo: 0.15 });
    expect(parsearDimensiones("4;0.15")).toEqual({ ancho: 4, largo: 0.15 });
    expect(parsearDimensiones(" 4 ; 0.15 ")).toEqual({ ancho: 4, largo: 0.15 });
  });

  it("rechaza textos inválidos, ceros, negativos y una sola medida", () => {
    for (const texto of ["", "4", "4,", ",0.15", "4,0", "0,5", "-4,0.15", "a,b", "4;5;6"]) {
      expect(parsearDimensiones(texto)).toBeNull();
    }
  });

  it("la altura tecleada admite negativos pero no cero ni basura", () => {
    expect(parsearAltura("-1")).toBe(-1);
    expect(parsearAltura("2.6")).toBe(2.6);
    expect(parsearAltura(" 2,6 ")).toBe(2.6);
    for (const texto of ["", "0", "-0", "abc", "1,2,3"]) {
      expect(parsearAltura(texto)).toBeNull();
    }
  });
});
