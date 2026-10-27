// O011: geometría de ejes con codos y extremos libres. Todas las coordenadas de las
// aserciones están calculadas a mano en el comentario, no copiadas del resultado.
import { describe, expect, it } from "vitest";
import {
  MAXIMO_CODOS,
  agregarCodoEje,
  extremoEje,
  fijarExtremoEje,
  geometriaEje,
  mmPapelAMetros,
  normalizarAjusteEje,
  quitarCodoEje,
} from "./ejesVista";

const INICIO: [number, number] = [0, 0];
const FIN: [number, number] = [0, 10];

describe("O011: polilínea del eje", () => {
  it("sin ajustes dibuja la línea recta de siempre y un solo globo al final", () => {
    // Eje del IfcGrid de (0,0) a (0,10): dos puntos y globo en (0,10).
    expect(geometriaEje(undefined, INICIO, FIN)).toEqual({
      puntos: [
        [0, 0],
        [0, 10],
      ],
      globoInicio: undefined,
      globoFin: [0, 10],
      baseInicio: [0, 0],
      baseFin: [0, 10],
    });
  });

  it("con un codo el tramo base → codo → globo tiene tres puntos", () => {
    // Codo en (0.5, 9.5): sale del final de la línea (0,10), pasa por el codo y
    // vuelve al globo (0,10). El globo no se mueve.
    const g = geometriaEje({ codosFin: [[0.5, 9.5]] }, INICIO, FIN);
    expect(g.puntos).toEqual([
      [0, 0],
      [0, 10],
      [0.5, 9.5],
      [0, 10],
    ]);
    expect(g.globoFin).toEqual([0, 10]);
  });

  it("con dos codos conserva el orden y el globo final", () => {
    // Codos a los dos lados del globo: (0.5,9.5) y (-0.5,9.5).
    const g = geometriaEje({ codosFin: [[0.5, 9.5], [-0.5, 9.5]] }, INICIO, FIN);
    expect(g.puntos).toEqual([
      [0, 0],
      [0, 10],
      [0.5, 9.5],
      [-0.5, 9.5],
      [0, 10],
    ]);
  });

  it("un extremo libre alarga la línea y su globo sigue el punto libre", () => {
    // El extremo de inicio se llevó a (-1,0): la línea va de (-1,0) a (0,10).
    const g = geometriaEje({ extremoInicio: [-1, 0] }, INICIO, FIN, { globoInicio: true });
    expect(g.puntos).toEqual([
      [-1, 0],
      [0, 0],
      [0, 10],
    ]);
    expect(g.globoInicio).toEqual([-1, 0]);
    expect(g.globoFin).toEqual([0, 10]);
  });

  it("extremo libre y codo se combinan sin duplicar puntos", () => {
    // Fin libre en (0.5,11) y codo en (-0.5,10.5):
    // (0,0) → (0,10) → (-0.5,10.5) → (0.5,11).
    const g = geometriaEje(
      { extremoFin: [0.5, 11], codosFin: [[-0.5, 10.5]] },
      INICIO,
      FIN,
    );
    expect(g.puntos).toEqual([
      [0, 0],
      [0, 10],
      [-0.5, 10.5],
      [0.5, 11],
    ]);
    expect(g.globoFin).toEqual([0.5, 11]);
  });
});

describe("O011: agregar y quitar codos", () => {
  it("el primero va a 5 mm del globo y 5 mm de lado; el segundo al otro lado", () => {
    // Escala 1:100: 5 mm de papel = 0.5 m y el globo de 8 mm = 0.8 m (como Revit).
    expect(mmPapelAMetros(5, 100)).toBe(0.5);
    expect(mmPapelAMetros(8, 100)).toBe(0.8);
    expect(mmPapelAMetros(8, 50)).toBe(0.4);
    const uno = agregarCodoEje(undefined, "fin", [0, 10], [0, 0], 0.5);
    expect(uno.codosFin).toEqual([[0.5, 9.5]]);
    // El segundo va al lado contrario: (-0.5, 9.5).
    const dos = agregarCodoEje(uno, "fin", [0, 10], [0, 0], 0.5);
    expect(dos.codosFin).toEqual([
      [0.5, 9.5],
      [-0.5, 9.5],
    ]);
    // Al llegar a dos, la regla no permite un tercero.
    expect(agregarCodoEje(dos, "fin", [0, 10], [0, 0], 0.5).codosFin).toHaveLength(MAXIMO_CODOS);
  });

  it("los codos del inicio se guardan por separado", () => {
    // Globo de inicio (0,0), interior (0,10): dirección (0,1); lado -X: (-0.5,0.5).
    const g = agregarCodoEje(undefined, "inicio", [0, 0], [0, 10], 0.5);
    expect(g.codosInicio).toEqual([[-0.5, 0.5]]);
    expect(g.codosFin).toBeUndefined();
  });

  it("quitar un codo deja los demás y elimina la clave vacía", () => {
    const dos = { codosFin: [[0.5, 9.5], [-0.5, 9.5]] as [number, number][] };
    expect(quitarCodoEje(dos, "fin", 0)).toEqual({ codosFin: [[-0.5, 9.5]] });
    expect(quitarCodoEje(dos, "fin", 1)).toEqual({ codosFin: [[0.5, 9.5]] });
    expect(quitarCodoEje({ codosFin: [[0.5, 9.5]] }, "fin", 0)).toBeUndefined();
    // Índice fuera de rango no rompe ni inventa codos.
    expect(quitarCodoEje(dos, "fin", 9)).toEqual(dos);
  });
});

describe("O011: extremos libres y saneamiento", () => {
  it("fijar y borrar el extremo libre vuelve a la alineación", () => {
    const abierto = fijarExtremoEje(undefined, "fin", [2, 11]);
    expect(abierto).toEqual({ extremoFin: [2, 11] });
    expect(extremoEje(abierto, "fin", [0, 0], [0, 10])).toEqual([2, 11]);
    expect(fijarExtremoEje(abierto, "fin", null)).toBeUndefined();
    expect(extremoEje(undefined, "fin", [0, 0], [0, 10])).toEqual([0, 10]);
  });

  it("descarta puntos inválidos y recorta a dos codos", () => {
    expect(
      normalizarAjusteEje({
        extremoInicio: [Number.NaN, 0] as [number, number],
        codosFin: [
          [0, 1],
          [0, 2],
          [0, 3],
        ],
      }),
    ).toEqual({ codosFin: [[0, 1], [0, 2]] });
    expect(normalizarAjusteEje({ extremoInicio: [1, 2] })).toEqual({ extremoInicio: [1, 2] });
    expect(normalizarAjusteEje({})).toBeUndefined();
  });

  it("no acepta un tercer codo por la puerta del saneamiento", () => {
    const ajuste = normalizarAjusteEje({ codosFin: [[0, 1], [0, 2], [0, 3]] })!;
    expect(ajuste.codosFin).toHaveLength(2);
  });
});
