// O011: geometría de ejes con codos y extremos libres. Todas las coordenadas de las
// aserciones están calculadas a mano en el comentario, no copiadas del resultado.
import { describe, expect, it } from "vitest";
import {
  agregarCodoEje,
  imanAlineacion,
  imanMultiplo,
  restringirArrastre,
  arrastrarExtremoEje,
  copiarAjusteEje,
  extremoEje,
  fijarExtremoEje,
  geometriaEje,
  globoVisibleEje,
  mmPapelAMetros,
  normalizarAjusteEje,
  quitarCodoEje,
  restablecerExtremoEje,
} from "./ejesVista";

const INICIO: [number, number] = [0, 0];
const FIN: [number, number] = [0, 10];

/** Compara coordenadas calculadas a mano sin exigir el último bit del flotante. */
function esperarPunto(real: [number, number], esperado: [number, number]) {
  expect(real[0]).toBeCloseTo(esperado[0], 9);
  expect(real[1]).toBeCloseTo(esperado[1], 9);
}

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

  it("con un codo el tramo base → codo → globo termina en el globo desplazado", () => {
    // Eje de (0,0) a (0,10); primer codo por omisión: avance 0.3 y lateral 0.8.
    // Vértice (0, 10.3) y globo en (0.8, 10.6); el globo ya no vuelve a (0,10).
    const g = geometriaEje(
      { codosFin: [[0, 10.3]], extremoFin: [0.8, 10.6] },
      INICIO,
      FIN,
    );
    expect(g.puntos).toEqual([
      [0, 0],
      [0, 10],
      [0, 10.3],
      [0.8, 10.6],
    ]);
    expect(g.globoFin).toEqual([0.8, 10.6]);
  });

  it("con dos codos conserva el orden y el globo al final del tramo", () => {
    // Avance 0.3 y lateral 0.8: (0,10) → (0,10.3) → (0.8,10.6) → (0.8,10.9).
    const g = geometriaEje(
      {
        codosFin: [
          [0, 10.3],
          [0.8, 10.6],
        ],
        extremoFin: [0.8, 10.9],
      },
      INICIO,
      FIN,
    );
    expect(g.puntos).toEqual([
      [0, 0],
      [0, 10],
      [0, 10.3],
      [0.8, 10.6],
      [0.8, 10.9],
    ]);
    expect(g.globoFin).toEqual([0.8, 10.9]);
  });

  it("sin extremo guardado el globo se apoya en el último codo", () => {
    // Al cerrar el candado se borra el extremo libre; el globo sigue en el codo.
    const g = geometriaEje({ codosFin: [[0, 10.3], [0.8, 10.6]] }, INICIO, FIN);
    expect(g.globoFin).toEqual([0.8, 10.6]);
    expect(g.puntos).toEqual([
      [0, 0],
      [0, 10],
      [0, 10.3],
      [0.8, 10.6],
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

describe("O011b: el globo sigue a los codos", () => {
  it("0, 1 y 2 codos mueven el centro del globo con coordenadas a mano", () => {
    // Escala 1:100: avance 3 mm = 0.3 m; globo de 8 mm = 0.8 m de diámetro.
    expect(mmPapelAMetros(3, 100)).toBe(0.3);
    expect(mmPapelAMetros(8, 100)).toBe(0.8);
    expect(mmPapelAMetros(8, 50)).toBe(0.4);
    const globo0 = geometriaEje(undefined, INICIO, FIN).globoFin;
    expect(globo0).toEqual([0, 10]);

    // Primer codo: (0,10) → (0,10.3) y globo desplazado +X: (0.8,10.6).
    const uno = agregarCodoEje(undefined, "fin", [0, 10], [0, 1], 0.3, 0.8);
    expect(uno.codosFin).toHaveLength(1);
    esperarPunto(uno.codosFin![0], [0, 10.3]);
    esperarPunto(uno.extremoFin!, [0.8, 10.6]);
    esperarPunto(geometriaEje(uno, INICIO, FIN).globoFin, [0.8, 10.6]);

    // Segundo codo: el globo anterior es vértice y hay 3 mm hasta el borde del
    // globo, más su radio (0.4): (0.8,10.6) → (0.8,11.3).
    const dos = agregarCodoEje(uno, "fin", [0.8, 10.6], [0, 1], 0.3, 0.8);
    expect(dos.codosFin).toHaveLength(2);
    esperarPunto(dos.codosFin![0], [0, 10.3]);
    esperarPunto(dos.codosFin![1], [0.8, 10.6]);
    esperarPunto(dos.extremoFin!, [0.8, 11.3]);
    esperarPunto(geometriaEje(dos, INICIO, FIN).globoFin, [0.8, 11.3]);
    // Al llegar a dos, la regla no permite un tercero.
    expect(agregarCodoEje(dos, "fin", [0.8, 11.3], [0, 1], 0.3, 0.8)).toEqual(dos);
  });

  it("los codos del inicio se guardan por separado y desplazan su globo", () => {
    // Extremo de inicio (0,0), hacia afuera (0,-1): vértice (0,-0.3) y globo
    // desplazado en X: (-0.8,-0.6), porque la perpendicular es (-1,0).
    const g = agregarCodoEje(undefined, "inicio", [0, 0], [0, -1], 0.3, 0.8);
    expect(g.codosInicio).toEqual([[0, -0.3]]);
    expect(g.extremoInicio).toEqual([-0.8, -0.6]);
    expect(g.codosFin).toBeUndefined();
    expect(g.extremoFin).toBeUndefined();
  });

  it("quitar un codo deja los demás y al quitar el último vuelve al extremo", () => {
    const dos = {
      codosFin: [
        [0, 10.3],
        [0.8, 10.6],
      ] as [number, number][],
      extremoFin: [0.8, 10.9] as [number, number],
    };
    expect(quitarCodoEje(dos, "fin", 0)).toEqual({
      codosFin: [[0.8, 10.6]],
      extremoFin: [0.8, 10.9],
    });
    expect(quitarCodoEje(dos, "fin", 1)).toEqual({
      codosFin: [[0, 10.3]],
      extremoFin: [0.8, 10.9],
    });
    // Quitar el único codo también borra el desplazamiento del globo.
    expect(
      quitarCodoEje(
        { codosFin: [[0, 10.3]], extremoFin: [0.8, 10.6] },
        "fin",
        0,
      ),
    ).toBeUndefined();
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

describe("O021: candado de alineación, globos por extremo y copia", () => {
  // Tres ejes verticales en x = 0, 4 y 8, de y = 0 (inicio) a y = 10 (fin).
  // El extremo final de los tres comparte la alineación y = 10.
  const bases = {
    A: { inicio: [0, 0] as [number, number], fin: [0, 10] as [number, number] },
    B: { inicio: [4, 0] as [number, number], fin: [4, 10] as [number, number] },
    C: { inicio: [8, 0] as [number, number], fin: [8, 10] as [number, number] },
  };
  const ejes = [
    { globalid: "A", vertical: true },
    { globalid: "B", vertical: true },
    { globalid: "C", vertical: true },
  ];

  it("con el candado cerrado mueve igual todos los extremos alineados", () => {
    // Arrastrar A de (0,10) a (0,12): delta +2 en Y para los tres (la X no cambia).
    const r = arrastrarExtremoEje({}, bases, ejes, "A", "fin", [0, 12], true, "vertical");
    expect(r.A.extremoFin).toEqual([0, 12]);
    expect(r.B.extremoFin).toEqual([4, 12]);
    expect(r.C.extremoFin).toEqual([8, 12]);
  });

  it("con el candado abierto mueve solo el eje pulsado", () => {
    const r = arrastrarExtremoEje({}, bases, ejes, "A", "fin", [0, 12], false, "vertical");
    expect(r.A.extremoFin).toEqual([0, 12]);
    expect(r.B?.extremoFin).toBeUndefined();
    expect(r.C?.extremoFin).toBeUndefined();
  });

  it("no arrastra ejes paralelos que no comparten la alineación", () => {
    // B ya terminó en y = 15: no debe seguir a A aunque sea vertical.
    const originales = { B: { extremoFin: [4, 15] as [number, number] } };
    const r = arrastrarExtremoEje(
      originales,
      bases,
      ejes.slice(0, 2),
      "A",
      "fin",
      [0, 12],
      true,
      "vertical",
    );
    expect(r.A.extremoFin).toEqual([0, 12]);
    expect(r.B.extremoFin).toEqual([4, 15]);
  });

  it("el globo de inicio solo se pinta si el extremo se tocó, salvo orden expresa", () => {
    expect(globoVisibleEje(undefined, "inicio")).toBe(false);
    expect(globoVisibleEje(undefined, "fin")).toBe(true);
    const tocado = { extremoInicio: [1, 1] as [number, number] };
    expect(globoVisibleEje(tocado, "inicio")).toBe(true);
    // Oculto explícitamente gana incluso si hay extremo libre.
    expect(globoVisibleEje({ ...tocado, globoInicio: false }, "inicio")).toBe(false);
    expect(globoVisibleEje({ globoFin: false }, "fin")).toBe(false);
  });

  it("normalizar conserva los globos aunque no haya extremos ni codos", () => {
    expect(normalizarAjusteEje({ globoInicio: false, globoFin: true })).toEqual({
      globoInicio: false,
      globoFin: true,
    });
  });

  it("copiar acomodo conserva extremos, codos y globos sin compartir arrays", () => {
    const original = {
      extremoFin: [1, 12] as [number, number],
      codosFin: [[0, 10.3] as [number, number]],
      globoInicio: false,
      globoFin: true,
    };
    const copia = copiarAjusteEje(original)!;
    expect(copia).toEqual(original);
    copia.extremoFin![0] = 99;
    copyCodos(copia);
    expect(original.extremoFin[0]).toBe(1);
    expect(original.codosFin![0][0]).toBe(0);
  });

  function copyCodos(copia: ReturnType<typeof copiarAjusteEje>) {
    if (copia?.codosFin) copia.codosFin[0][0] = 77;
  }

  it("restablecer un extremo quita su extremo y sus codos y conserva el otro lado", () => {
    const ajuste = {
      extremoInicio: [0, -1] as [number, number],
      extremoFin: [1, 12] as [number, number],
      codosFin: [[0, 10.3] as [number, number]],
      globoFin: false,
    };
    const r = restablecerExtremoEje(ajuste, "fin")!;
    expect(r.extremoFin).toBeUndefined();
    expect(r.codosFin).toBeUndefined();
    expect(r.extremoInicio).toEqual([0, -1]);
    expect(r.globoFin).toBe(false);
  });


  // O027: valores calculados a mano: un eje vertical solo cambia su coordenada y.
  it("extremo de eje vertical con delta (3, 5) queda en (0, 5)", () => {
    expect(restringirArrastre("extremo", "vertical", [3, 5])).toEqual([0, 5]);
  });

  it("extremo de eje horizontal con delta (3, 5) queda en (3, 0)", () => {
    expect(restringirArrastre("extremo", "horizontal", [3, 5])).toEqual([3, 0]);
  });

  it("globo de eje vertical con delta (3, 5) queda en (3, 0)", () => {
    expect(restringirArrastre("globo", "vertical", [3, 5])).toEqual([3, 0]);
  });

  it("globo de eje horizontal con delta (3, 5) queda en (0, 5)", () => {
    expect(restringirArrastre("globo", "horizontal", [3, 5])).toEqual([0, 5]);
  });

  it("el quiebre del codo avanza solo a lo largo del eje vertical", () => {
    expect(restringirArrastre("codo", "vertical", [3, 5])).toEqual([0, 5]);
  });

  it("la cabeza de nivel sube en vertical aunque el puntero vaya en diagonal", () => {
    expect(restringirArrastre("nivel-cabeza", "horizontal", [3, 5])).toEqual([0, 5]);
  });

  it("el extremo de la línea de nivel solo se corre en horizontal", () => {
    expect(restringirArrastre("nivel-extremo", "vertical", [3, 5])).toEqual([3, 0]);
  });

  it("con Shift el arrastre es libre (3, 5)", () => {
    expect(restringirArrastre("extremo", "vertical", [3, 5], true)).toEqual([3, 5]);
  });

  it("imán: engancha a la alineación más cercana dentro de la tolerancia", () => {
    // Candidatos de otros ejes: 0, 4 y 8 m. 4,20 está a 0,20 de 4 (tol 0,30).
    expect(imanAlineacion(4.2, [0, 4, 8], 0.3)).toEqual({ valor: 4, enganchado: true });
    // 5,50 está a 1,50 del más cercano: no engancha.
    expect(imanAlineacion(5.5, [0, 4, 8], 0.3)).toEqual({ valor: 5.5, enganchado: false });
  });

  it("imán de globo: engancha el desplazamiento a múltiplos de un diámetro", () => {
    // Paso 0,80 m (diámetro de globo a 1:100): 1,65 → 1,60 a 0,05 exactos.
    expect(imanMultiplo(1.65, 0, 0.8, 0.05)).toEqual({ valor: 1.6, enganchado: true });
    // 1,70 está a 0,10 del múltiplo: fuera de la tolerancia.
    expect(imanMultiplo(1.7, 0, 0.8, 0.05)).toEqual({ valor: 1.7, enganchado: false });
    // El enganche se mide desde la posición original, no desde cero.
    expect(imanMultiplo(2.45, 0.75, 0.8, 0.05)).toEqual({ valor: 2.45, enganchado: false });
  });
});
