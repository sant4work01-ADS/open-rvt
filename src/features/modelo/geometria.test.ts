// O010: la geometría de un muro debe producir normales planas, una por cara.
import { describe, expect, it } from "vitest";
import {
  aristasInternasUniones,
  aristasParaElemento,
  mallaConNormalesPlanas,
  normalesUnicas,
} from "./geometria";

/** Caja cerrada: 8 vértices y 12 triángulos con sentido hacia afuera. */
function caja(ancho: number, fondo: number, alto: number) {
  const x = ancho / 2;
  const y = fondo / 2;
  const z = alto;
  const vertices = [
    -x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0,
    -x, -y, z, x, -y, z, x, y, z, -x, y, z,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, // suelo
    4, 5, 6, 4, 6, 7, // techo
    0, 1, 5, 0, 5, 4, // frente
    1, 2, 6, 1, 6, 5, // derecha
    2, 3, 7, 2, 7, 6, // fondo
    3, 0, 4, 3, 4, 7, // izquierda
  ];
  return { vertices, indices };
}

describe("normales planas de una malla (O010)", () => {
  it("un muro con 6 caras produce exactamente 6 normales, una por cara", () => {
    const { vertices, indices } = caja(4, 0.15, 2.6);
    const malla = mallaConNormalesPlanas(vertices, indices);
    const unicas = normalesUnicas(malla);
    expect(unicas).toHaveLength(6);
    // Cada cara es un plano axial: ninguna normal mezcla dos ejes.
    for (const n of unicas) {
      const noNulos = n.filter((v) => Math.abs(v) > 1e-6);
      expect(noNulos).toHaveLength(1);
      expect(Math.abs(noNulos[0])).toBeCloseTo(1, 5);
    }
    // Las tres normales de cada triángulo son idénticas (sombreado plano).
    for (let i = 0; i < malla.normales.length; i += 9) {
      for (let v = 1; v < 3; v += 1) {
        expect(malla.normales[i + v * 3]).toBe(malla.normales[i]);
        expect(malla.normales[i + v * 3 + 1]).toBe(malla.normales[i + 1]);
        expect(malla.normales[i + v * 3 + 2]).toBe(malla.normales[i + 2]);
      }
    }
  });

  it("alinea un triángulo invertido dentro de una cara plana", () => {
    const { vertices, indices } = caja(4, 0.15, 2.6);
    // Invierte el segundo triángulo del techo (4,6,7 -> 4,7,6).
    const invertidos = [...indices];
    [invertidos[9], invertidos[10], invertidos[11]] = [4, 7, 6];
    const malla = mallaConNormalesPlanas(vertices, invertidos);
    const unicas = normalesUnicas(malla);
    expect(unicas).toHaveLength(6);
    // El techo mantiene +Z pese al triángulo invertido.
    const techo = unicas.filter((n) => n[2] > 0.99);
    expect(techo).toHaveLength(1);
    // Y no queda ninguna normal del techo apuntando hacia abajo.
    expect(unicas.filter((n) => n[2] < -0.99)).toHaveLength(1); // solo el suelo
  });
});

describe("aristas internas de uniones (O012)", () => {
  function cajaEn(x0: number, x1: number, y0: number, y1: number) {
    const z0 = 0;
    const z1 = 1;
    const vertices = [
      x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
      x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
    ];
    const indices = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6,
      3, 0, 4, 3, 4, 7,
    ];
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices),
    };
  }

  it("suprime las 4 aristas del extremo de una viga que cae en la cara de la columna", () => {
    const viga = cajaEn(0, 1, 0, 1);
    const columna = cajaEn(1, 2, 0, 1);
    const internas = aristasInternasUniones([
      { globalid: "viga", categoria: "vigas", ...viga },
      { globalid: "columna", categoria: "vigas", ...columna },
    ]);
    const segmentos = aristasParaElemento(viga.vertices, viga.indices, internas);
    // Una caja aislada tiene 12 aristas; las 4 del extremo recortado desaparecen.
    expect(segmentos.length / 6).toBe(8);
    const columnaSegmentos = aristasParaElemento(
      columna.vertices,
      columna.indices,
      internas,
    );
    expect(columnaSegmentos.length / 6).toBe(8);
  });

  it("no suprime la arista de silueta de una cara exterior", () => {
    const viga = cajaEn(0, 1, 0, 1);
    const columna = cajaEn(1, 2, 0, 1);
    const internas = aristasInternasUniones([
      { globalid: "viga", categoria: "vigas", ...viga },
      { globalid: "columna", categoria: "vigas", ...columna },
    ]);
    const segmentos = aristasParaElemento(viga.vertices, viga.indices, internas);
    // La arista superior del extremo (x=1, y=0, z=1) está en la cara de la
    // columna y no debe aparecer.
    let encontrada = false;
    for (let i = 0; i < segmentos.length; i += 6) {
      const puntos = [
        [segmentos[i], segmentos[i + 1], segmentos[i + 2]],
        [segmentos[i + 3], segmentos[i + 4], segmentos[i + 5]],
      ];
      if (puntos.every((p) => Math.abs(p[0] - 1) < 1e-6)) encontrada = true;
    }
    expect(encontrada).toBe(false);
    // Pero la arista x=0 (extremo libre) sí se dibuja.
    let libre = false;
    for (let i = 0; i < segmentos.length; i += 6) {
      if (
        Math.abs(segmentos[i]) < 1e-6 &&
        Math.abs(segmentos[i + 3]) < 1e-6
      ) {
        libre = true;
      }
    }
    expect(libre).toBe(true);
  });
});

// O019: prisma vertical de una huella convexa (mismo tipo de malla que usa el visor).
function prisma(
  huella: Array<[number, number]>,
  z0 = 0,
  z1 = 2.6,
): { vertices: Float32Array; indices: Uint32Array } {
  const vertices: number[] = [];
  for (const [x, y] of huella) vertices.push(x, y, z0);
  for (const [x, y] of huella) vertices.push(x, y, z1);
  const indices: number[] = [];
  const n = huella.length;
  // Tapa inferior y superior en abanico (las huellas de prueba son convexas).
  for (let i = 1; i + 1 < n; i += 1) {
    indices.push(0, i + 1, i);
    indices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    indices.push(i, j, n + j);
    indices.push(i, n + j, n + i);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** Posiciones (x,y) de las aristas verticales únicas de varios elementos. */
function verticalesUnicas(
  elementos: Array<{ vertices: Float32Array; indices: Uint32Array }>,
  internas: Set<string>,
): string[] {
  const vistas = new Set<string>();
  for (const elemento of elementos) {
    const segmentos = aristasParaElemento(elemento.vertices, elemento.indices, internas);
    for (let i = 0; i < segmentos.length; i += 6) {
      const [x1, y1, z1] = [segmentos[i], segmentos[i + 1], segmentos[i + 2]];
      const [x2, y2, z2] = [segmentos[i + 3], segmentos[i + 4], segmentos[i + 5]];
      if (Math.abs(x2 - x1) > 1e-6 || Math.abs(y2 - y1) > 1e-6) continue;
      if (Math.abs(z2 - z1) < 1e-6) continue;
      vistas.add(`${x1.toFixed(4)},${y1.toFixed(4)}`);
    }
  }
  return [...vistas].sort();
}

describe("aristas verticales de uniones en 3D (O019)", () => {
  // Dos muros de 0.20 m en L con inglete en la diagonal (-0.1,-0.1)→(0.1,0.1).
  const alaX: Array<[number, number]> = [
    [-0.1, -0.1], [2.1, -0.1], [2.1, 0.1], [0.1, 0.1],
  ];
  const alaY: Array<[number, number]> = [
    [-0.1, -0.1], [0.1, 0.1], [0.1, 2.1], [-0.1, 2.1],
  ];

  it("conserva las dos esquinas verticales (exterior e interior) de dos muros en L", () => {
    const muroX = prisma(alaX);
    const muroY = prisma(alaY);
    const internas = aristasInternasUniones([
      { globalid: "muro-x", categoria: "muros", ...muroX },
      { globalid: "muro-y", categoria: "muros", ...muroY },
    ]);
    const verticales = verticalesUnicas([muroX, muroY], internas);
    // Esquina exterior del inglete y esquina interior (concava).
    expect(verticales).toContain("-0.1000,-0.1000");
    expect(verticales).toContain("0.1000,0.1000");
    expect(
      verticales.filter((v) => v === "-0.1000,-0.1000" || v === "0.1000,0.1000"),
    ).toHaveLength(2);
  });

  it("una caja cerrada de 4 muros deja las 8 esquinas verticales", () => {
    const muros = [
      // Muro inferior, derecho, superior e izquierdo con inglete en las cuatro esquinas.
      prisma([[0, 0], [4, 0], [3.8, 0.2], [0.2, 0.2]]),
      prisma([[4, 0], [4, 4], [3.8, 3.8], [3.8, 0.2]]),
      prisma([[4, 4], [0, 4], [0.2, 3.8], [3.8, 3.8]]),
      prisma([[0, 4], [0, 0], [0.2, 0.2], [0.2, 3.8]]),
    ];
    const internas = aristasInternasUniones(
      muros.map((muro, i) => ({
        globalid: `muro-${i}`,
        categoria: "muros",
        ...muro,
      })),
    );
    const verticales = verticalesUnicas(muros, internas);
    expect(verticales).toEqual([
      "0.0000,0.0000",
      "0.0000,4.0000",
      "0.2000,0.2000",
      "0.2000,3.8000",
      "3.8000,0.2000",
      "3.8000,3.8000",
      "4.0000,0.0000",
      "4.0000,4.0000",
    ]);
  });

  it("una losa sola conserva las 4 aristas verticales de canto", () => {
    const losa = prisma([[0, 0], [4, 0], [4, 3], [0, 3]], -0.25, 0);
    const internas = aristasInternasUniones([
      { globalid: "losa", categoria: "losas", ...losa },
    ]);
    const verticales = verticalesUnicas([losa], internas);
    expect(verticales).toEqual([
      "0.0000,0.0000",
      "0.0000,3.0000",
      "4.0000,0.0000",
      "4.0000,3.0000",
    ]);
  });
});
