// O055: geometría de las anotaciones 3D con valores calculados a mano.
// Retícula de 10 × 8 m, niveles a 0.00 y 3.00; la caja va de (0,0,0) a (10,8,6).
import { describe, expect, test } from "vitest";
import type { Caja, Nivel, Vista } from "./tipos";
import type { EjeReferencia } from "./herramientas";
import { calcularFamiliasCotas } from "./cotas";
import {
  calcularCotas3d,
  calcularEjes3d,
  calcularNiveles3d,
  elevacionBaseNiveles,
  notaVisibleEnVista,
  textoNivel3d,
  type Nota,
} from "./anotaciones3d";

const CAJA: Caja = { min: [0, 0, 0], max: [10, 8, 6] };
const NIVELES: Nivel[] = [
  { globalid: "N0", nombre: "Nivel 0", elevacion: 0 },
  { globalid: "N1", nombre: "Nivel 1", elevacion: 3 },
];

function ejesRetícula(): EjeReferencia[] {
  // Verticales en x = 0, 4 y 10; horizontales en y = 0, 4 y 8.
  return [
    { globalid: "v0", etiqueta: "A", x1: 0, y1: 0, x2: 0, y2: 8, vertical: true },
    { globalid: "v1", etiqueta: "B", x1: 4, y1: 0, x2: 4, y2: 8, vertical: true },
    { globalid: "v2", etiqueta: "C", x1: 10, y1: 0, x2: 10, y2: 8, vertical: true },
    { globalid: "h0", etiqueta: "1", x1: 0, y1: 0, x2: 10, y2: 0, vertical: false },
    { globalid: "h1", etiqueta: "2", x1: 0, y1: 4, x2: 10, y2: 4, vertical: false },
    { globalid: "h2", etiqueta: "3", x1: 0, y1: 8, x2: 10, y2: 8, vertical: false },
  ];
}

function vista(tipo: Vista["tipo"], extra: Partial<Vista> = {}): Vista {
  return {
    id: tipo,
    nombre: tipo,
    tipo,
    nivelesVisibles: [],
    categorias: {
      muros: true,
      losas: true,
      columnas: true,
      vigas: true,
      puertas: true,
      ventanas: true,
      cubiertas: true,
      escaleras: true,
      otros: true,
    },
    estilo: "aristas",
    escala: 100,
    ...extra,
  };
}

describe("O055: elevación base y ejes", () => {
  test("la base es la elevación del nivel más bajo, no el 0", () => {
    expect(elevacionBaseNiveles(NIVELES)).toBe(0);
    expect(
      elevacionBaseNiveles([
        { globalid: "a", nombre: "Sótano", elevacion: -2.5 },
        { globalid: "b", nombre: "PB", elevacion: 0 },
      ]),
    ).toBe(-2.5);
    expect(elevacionBaseNiveles([])).toBe(0);
  });

  test("cada eje va completo a z = 0 y conserva su etiqueta", () => {
    const ejes = calcularEjes3d(ejesRetícula(), 0);
    expect(ejes).toHaveLength(6);
    expect(ejes[0]).toEqual({
      globalid: "v0",
      etiqueta: "A",
      inicio: [0, 0, 0],
      fin: [0, 8, 0],
    });
    expect(ejes[5].inicio).toEqual([0, 8, 0]);
    expect(ejes[5].fin).toEqual([10, 8, 0]);
  });
});

describe("O055: rectángulos de nivel", () => {
  test("rodean la caja 1 m por lado y llevan «Nombre · +elevación»", () => {
    const niveles = calcularNiveles3d(NIVELES, CAJA);
    expect(niveles).toHaveLength(2);
    expect(niveles[0].texto).toBe("Nivel 0 · +0.00");
    expect(niveles[1].texto).toBe("Nivel 1 · +3.00");
    expect(niveles[0].esquinas).toEqual([
      [-1, -1, 0],
      [11, -1, 0],
      [11, 9, 0],
      [-1, 9, 0],
    ]);
    expect(niveles[1].esquinas[0]).toEqual([-1, -1, 3]);
    expect(niveles[0].etiqueta).toEqual([-1, -1, 0]);
  });

  test("una elevación negativa se escribe con signo menos", () => {
    expect(
      textoNivel3d({ globalid: "s", nombre: "Sótano", elevacion: -1.25 }),
    ).toBe("Sótano · -1.25");
  });
});

describe("O055: cotas entre ejes a la elevación base", () => {
  test("3 + 3 ejes dan 2 parciales y 1 total por familia, con valores exactos", () => {
    const familias = calcularFamiliasCotas(ejesRetícula());
    const cotas = calcularCotas3d(familias, 0);
    expect(cotas).toHaveLength(6);
    const valores = cotas.map((c) => c.valor).sort((a, b) => a - b);
    expect(valores).toEqual([4, 4, 4, 6, 8, 10]);
    const parcial = cotas.find((c) => c.tipo === "parcial" && c.valor === 4)!;
    expect(parcial.texto).toBe("4.00");
    // Familia vertical (x = 0, 4, 10): la línea va por fuera de y = 8, de x = 0 a 4.
    expect(parcial.inicio).toEqual([0, 9, 0]);
    expect(parcial.fin).toEqual([4, 9, 0]);
    expect(parcial.textoPos).toEqual([2, 9, 0]);
  });
});

describe("O055: visibilidad de las notas", () => {
  const nota: Nota = {
    globalid: "n1",
    texto: "Revisar",
    posicion: [2, 3, 1.5],
    nivel: "Nivel 0",
    nivelGlobalid: "N0",
  };

  test("en 3D siempre se ve", () => {
    expect(notaVisibleEnVista(nota, vista("iso"), CAJA)).toBe(true);
    expect(notaVisibleEnVista(nota, vista("perspectiva"), CAJA)).toBe(true);
  });

  test("en planta solo se ve en su nivel", () => {
    expect(notaVisibleEnVista(nota, vista("planta", { nivel: "N0" }), CAJA)).toBe(true);
    expect(notaVisibleEnVista(nota, vista("planta", { nivel: "N1" }), CAJA)).toBe(false);
  });

  test("en alzado y corte depende del rango del modelo", () => {
    expect(notaVisibleEnVista(nota, vista("alzado", { orientacion: "sur" }), CAJA)).toBe(true);
    const lejos = { ...nota, posicion: [30, 3, 1.5] as [number, number, number] };
    expect(notaVisibleEnVista(lejos, vista("alzado", { orientacion: "sur" }), CAJA)).toBe(false);
    const corte = vista("corte", {
      puntoA: [0, 0],
      puntoB: [10, 0],
      direccion: [0, 1],
      profundidad: 10,
    });
    expect(notaVisibleEnVista(nota, corte, CAJA)).toBe(true);
    const atras = { ...nota, posicion: [2, 3, 1.5] as [number, number, number] };
    expect(
      notaVisibleEnVista(atras, { ...corte, puntoA: [0, 5], direccion: [0, 1] }, CAJA),
    ).toBe(false);
  });
});
