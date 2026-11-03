// O011/O042: geometría de ejes con codos y extremos libres. Todas las coordenadas de
// las aserciones están calculadas a mano en el comentario, no copiadas del resultado.
import { describe, expect, it } from "vitest";
import {
  agregarCodoEje,
  asasCodoVista,
  imanAlineacion,
  imanMultiplo,
  restringirArrastre,
  destinoArrastreAsa,
  destinoArrastreCodo,
  desplazamientoArrastreNivel,
  puntoAsaEje,
  arrastrarExtremoEje,
  candadoArrastreAsa,
  copiarAjusteEje,
  extremoEje,
  fijarExtremoEje,
  geometriaEje,
  globoVisibleEje,
  normalizarAjusteEje,
  quitarCodoEje,
  restablecerExtremoEje,
  puntoAsaCodoNuevo,
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
      ejeDiscontinuo: [
        [0, 0],
        [0, 10],
      ],
      tramosSolidos: [],
    });
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
});

describe("O044: codo con V1 a lo largo y V2 en X/Y", () => {
  // Globo de 8 mm a 1:100 = 0.8 m de diámetro (D). Forma del dueño: globo corrido
  // 0.55·D de lado, V2 a 1.30·D del centro (0.80·D hasta el borde), V1 a 0.50·D
  // antes de V2 sobre el eje y tramo final de 0.80·D hasta el borde del globo.
  const D = 0.8;

  it("sin codo el borde del globo toca el extremo: centro en (10.4, 0)", () => {
    // El eje termina en x = 10; el radio es D/2 = 0.4, así que el centro queda en
    // 10 + 0.4 = 10.4 y la línea dibujada termina en el borde x = 10.
    const g = geometriaEje(undefined, [0, 0], [10, 0], { diametroGlobo: D });
    esperarPunto(g.globoFin, [10.4, 0]);
    expect(g.ejeDiscontinuo).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(g.puntos).toEqual([
      [0, 0],
      [10, 0],
      [10.4, 0],
    ]);
  });

  it("eje horizontal (0,0)-(10,0): V1=(8.96,0), V2=(9.36,0.44) y globo en (10.4,0.44)", () => {
    // Globo original: centro (10.4, 0); con codo se corre 0.55·D = 0.44 de lado
    // (hacia +y): (10.4, 0.44). V2 = centro - 1.30·D a lo largo = (9.36, 0.44).
    // V1 = V2 - 0.50·D a lo largo - 0.55·D de lado = (8.96, 0).
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D);
    expect(ajuste.codosFin).toHaveLength(2);
    esperarPunto(ajuste.codosFin![0], [8.96, 0]);
    esperarPunto(ajuste.codosFin![1], [9.36, 0.44]);
    expect(ajuste.extremoFin).toBeUndefined();
    expect(ajuste.codoNuevoFin).toBe(true);

    const g = geometriaEje(ajuste, [0, 0], [10, 0], { diametroGlobo: D });
    esperarPunto(g.globoFin, [10.4, 0.44]);
    expect(g.puntos).toHaveLength(4);
    esperarPunto(g.puntos[0], [0, 0]);
    esperarPunto(g.puntos[1], [8.96, 0]);
    esperarPunto(g.puntos[2], [9.36, 0.44]);
    esperarPunto(g.puntos[3], [10.4, 0.44]);
    // El patrón llega hasta V1; de V1 al borde del globo es continuo.
    esperarPunto(g.ejeDiscontinuo[0], [0, 0]);
    esperarPunto(g.ejeDiscontinuo[1], [8.96, 0]);
    expect(g.tramosSolidos).toHaveLength(1);
    expect(g.tramosSolidos[0]).toHaveLength(3);
    esperarPunto(g.tramosSolidos[0][0], [8.96, 0]);
    esperarPunto(g.tramosSolidos[0][1], [9.36, 0.44]);
    // Borde del globo: centro (10.4, 0.44) menos el radio 0.4 = (10.0, 0.44).
    esperarPunto(g.tramosSolidos[0][2], [10.0, 0.44]);
    // Tramo final V2→borde: 0.80·D = 0.64.
    const final = g.tramosSolidos[0];
    expect(
      Math.hypot(final[2][0] - final[1][0], final[2][1] - final[1][1]),
    ).toBeCloseTo(0.8 * D, 9);
    // Diagonal: 0.50·D a lo largo y 0.55·D de lado.
    expect(Math.hypot(final[1][0] - final[0][0], final[1][1] - final[0][1])).toBeCloseTo(
      Math.hypot(0.5 * D, 0.55 * D),
      9,
    );
  });

  it("el globo conserva su posición a lo largo del eje al agregar el codo", () => {
    // Centro sin codo: (10.4, 0). Con codo: (10.4, 0.44). Solo cambia la y.
    const original = geometriaEje(undefined, [0, 0], [10, 0], { diametroGlobo: D });
    const conCodo = geometriaEje(
      agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D),
      [0, 0],
      [10, 0],
      { diametroGlobo: D },
    );
    expect(conCodo.globoFin[0]).toBeCloseTo(original.globoFin[0], 9);
    expect(conCodo.globoFin[1] - original.globoFin[1]).toBeCloseTo(0.55 * D, 9);
  });

  it("eje vertical (0,0)-(0,10): el tramo final es vertical", () => {
    // Globo original: centro (0, 10.4); con codo (-0.55·D de lado): (-0.44, 10.4).
    // V2 = (-0.44, 10.4) - 1.30·D arriba = (-0.44, 9.36).
    // V1 = V2 - 0.50·D abajo + 0.55·D de lado = (0, 8.96).
    const ajuste = agregarCodoEje(undefined, "fin", [0, 10.4], [0, 1], D);
    esperarPunto(ajuste.codosFin![0], [0, 8.96]);
    esperarPunto(ajuste.codosFin![1], [-0.44, 9.36]);
    const g = geometriaEje(ajuste, INICIO, FIN, { diametroGlobo: D });
    esperarPunto(g.globoFin, [-0.44, 10.4]);
    expect(Math.abs(g.globoFin[0] - ajuste.codosFin![1][0])).toBeLessThanOrEqual(1e-9);
    expect(g.globoFin[1] - ajuste.codosFin![1][1]).toBeCloseTo(1.3 * D, 9);
  });

  it("con un cruce cerca del extremo, V1 queda 0.30·D pasado el cruce", () => {
    // Globo original (10.4, 0). Sin corrimiento V1 = (8.96, 0), a 0.04 m del cruce
    // x = 9.0 (menos de 0.30·D = 0.24). Se corre todo 0.28 m: V1 = (9.24, 0),
    // que deja 0.24 m de tramo recto pasado el cruce; V2 = (9.64, 0.44) y
    // globo = (10.68, 0.44).
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D, [[9.0, 0]]);
    esperarPunto(ajuste.codosFin![0], [9.24, 0]);
    esperarPunto(ajuste.codosFin![1], [9.64, 0.44]);
    const g = geometriaEje(ajuste, [0, 0], [10, 0], { diametroGlobo: D });
    esperarPunto(g.globoFin, [10.68, 0.44]);
    expect(ajuste.codosFin![0][0] - 9.0).toBeCloseTo(0.3 * D, 9);
  });

  it("un cruce lejano no mueve el codo", () => {
    // Cruce x = 7.0: V1 = (8.96, 0) ya deja 1.96 m de recta, más de 0.30·D.
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D, [[7.0, 0]]);
    esperarPunto(ajuste.codosFin![0], [8.96, 0]);
    esperarPunto(ajuste.codosFin![1], [9.36, 0.44]);
  });

  it("arrastrar V1 en diagonal solo lo mueve a lo largo del eje", () => {
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D);
    const v1 = ajuste.codosFin![0] as [number, number];
    const v2 = ajuste.codosFin![1] as [number, number];
    // Puntero +0.30 en x y +0.50 en y: la y de V1 (sobre el eje) no cambia.
    const r = destinoArrastreCodo(v1, v2, v1, [v1[0] + 0.3, v1[1] + 0.5], "horizontal", 0, "auto", 0.001);
    expect(r.modo).toBe("eje");
    esperarPunto(r.punto, [9.26, 0]);
  });

  it("arrastrar V2 en diagonal lo mueve solo en el componente mayor", () => {
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D);
    const v1 = ajuste.codosFin![0] as [number, number];
    const v2 = ajuste.codosFin![1] as [number, number];
    // +0.30 en x y +0.20 en y: manda x; la y queda en 0.44.
    const r = destinoArrastreCodo(v1, v2, v2, [v2[0] + 0.3, v2[1] + 0.2], "horizontal", 1, "auto", 0.001);
    expect(r.modo).toBe("x");
    esperarPunto(r.punto, [9.66, 0.44]);
    // +0.10 en x y +0.50 en y: manda y.
    const r2 = destinoArrastreCodo(v1, v2, v2, [v2[0] + 0.1, v2[1] + 0.5], "horizontal", 1, "auto", 0.001);
    expect(r2.modo).toBe("y");
    esperarPunto(r2.punto, [9.36, 0.94]);
  });

  it("dos arrastres seguidos de V2, uno en X y otro en Y, dan el punto esperado", () => {
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D);
    const v1 = ajuste.codosFin![0] as [number, number];
    const v2 = ajuste.codosFin![1] as [number, number];
    const primero = destinoArrastreCodo(v1, v2, v2, [v2[0] + 0.3, v2[1] + 0.05], "horizontal", 1, "auto", 0.001);
    esperarPunto(primero.punto, [9.66, 0.44]);
    // El segundo arrastre parte del nodo ya movido y usa Y.
    const segundo = destinoArrastreCodo(v1, primero.punto, primero.punto, [9.76, -0.24], "horizontal", 1, "y", 0.001);
    esperarPunto(segundo.punto, [9.66, -0.24]);
    const g = geometriaEje(
      { ...ajuste, codosFin: [v1, segundo.punto] },
      [0, 0],
      [10, 0],
      { diametroGlobo: D },
    );
    // El globo sigue a V2 a 1.30·D: (9.66+1.04, -0.24) = (10.70, -0.24).
    esperarPunto(g.globoFin, [10.7, -0.24]);
  });

  it("arrastre de V2 en X conserva el largo del tramo final", () => {
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D);
    const v1 = ajuste.codosFin![0] as [number, number];
    const v2 = ajuste.codosFin![1] as [number, number];
    const r = destinoArrastreCodo(v1, v2, v2, [v2[0] + 0.3, v2[1] + 0.02], "horizontal", 1, "auto", 0.001);
    esperarPunto(r.punto, [9.66, 0.44]);
    const g = geometriaEje({ ...ajuste, codosFin: [v1, r.punto] }, [0, 0], [10, 0], {
      diametroGlobo: D,
    });
    esperarPunto(g.globoFin, [10.7, 0.44]);
    const tramo = g.tramosSolidos[0];
    expect(
      Math.hypot(tramo[2][0] - tramo[1][0], tramo[2][1] - tramo[1][1]),
    ).toBeCloseTo(0.8 * D, 9);
  });

  it("V1 y V2 tienen pinzamiento; el globo no, y ambos caen sobre la polilínea", () => {
    const ajuste = agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D);
    const asas = asasCodoVista(ajuste);
    expect(asas).toHaveLength(2);
    expect(asas.map((a) => a.indice)).toEqual([0, 1]);
    esperarPunto(asas[0].punto, [8.96, 0]);
    esperarPunto(asas[1].punto, [9.36, 0.44]);
    expect(asasCodoVista(undefined)).toEqual([]);

    // Invariante: cada pinzamiento del codo está exactamente sobre la polilínea
    // continua V1→V2→borde del globo.
    const g = geometriaEje(ajuste, [0, 0], [10, 0], { diametroGlobo: D });
    for (const asa of asas) {
      let menor = Infinity;
      for (const tramo of g.tramosSolidos) {
        for (let i = 1; i < tramo.length; i += 1) {
          const [ax, ay] = tramo[i - 1];
          const [bx, by] = tramo[i];
          const dx = bx - ax;
          const dy = by - ay;
          const t = Math.max(
            0,
            Math.min(1, ((asa.punto[0] - ax) * dx + (asa.punto[1] - ay) * dy) / (dx * dx + dy * dy)),
          );
          menor = Math.min(
            menor,
            Math.hypot(asa.punto[0] - (ax + t * dx), asa.punto[1] - (ay + t * dy)),
          );
        }
      }
      expect(menor).toBeLessThanOrEqual(1e-9);
    }
  });

  it("un codo viejo cargado no cambia (conserva su tramo final de 1.0·D)", () => {
    // Pset de O042 sin marca: V1=(8.52,0), V2=(9.2,0.48). El globo se deriva con
    // la regla vieja: 1.50·D hasta el centro = (10.4, 0.48), borde (10.0, 0.48).
    const viejo = normalizarAjusteEje({
      codosFin: [
        [8.52, 0],
        [9.2, 0.48],
      ],
    })!;
    expect(viejo.codoNuevoFin).toBeUndefined();
    const g = geometriaEje(viejo, [0, 0], [10, 0], { diametroGlobo: D });
    esperarPunto(g.globoFin, [10.4, 0.48]);
    esperarPunto(g.tramosSolidos[0][2], [10.0, 0.48]);
  });

  it("un archivo viejo con tres nodos se recorta a V1 y V2 sin marca", () => {
    // Se conservan los dos primeros puntos tal cual; el globo se deriva con la
    // regla vieja (1.50·D): V2=(-0.48,9.2) → (−0.48,10.4).
    const limpio = normalizarAjusteEje({
      codosFin: [
        [0, 8.52],
        [-0.48, 9.2],
        [5, 5],
      ],
      extremoFin: [99, 99],
    })!;
    expect(limpio.codosFin).toHaveLength(2);
    const g = geometriaEje(limpio, INICIO, FIN, { diametroGlobo: D });
    esperarPunto(g.globoFin, [-0.48, 10.4]);
    esperarPunto(g.tramosSolidos[0][0], [0, 8.52]);
    esperarPunto(g.tramosSolidos[0][1], [-0.48, 9.2]);
    esperarPunto(g.tramosSolidos[0][2], [-0.48, 10]);
  });

  it("quitar el codo devuelve el ajuste original y el globo al extremo", () => {
    const original = { globoFin: false };
    const conCodo = agregarCodoEje(original, "fin", [10.4, 0], [1, 0], D);
    expect(conCodo.codosFin).toHaveLength(2);
    expect(quitarCodoEje(conCodo, "fin", 0)).toEqual(original);
    expect(quitarCodoEje(conCodo, "fin", 1)).toEqual(original);
    expect(quitarCodoEje(agregarCodoEje(undefined, "fin", [10.4, 0], [1, 0], D), "fin", 0)).toBeUndefined();
    expect(quitarCodoEje(conCodo, "fin", 9)).toEqual(conCodo);
  });

  it("los codos del inicio se guardan por separado y su globo también se deriva", () => {
    // Inicio en (0,0), afuera (0,-1), globo original centro (0,-0.4).
    // Con codo: globo (0.44,-0.4); V2 = globo + 1.30·D hacia adentro = (0.44,0.64);
    // V1 = V2 + 0.50·D adentro + 0.55·D de lado = (0,1.04).
    const g = agregarCodoEje(undefined, "inicio", [0, -0.4], [0, -1], D);
    esperarPunto(g.codosInicio![0], [0, 1.04]);
    esperarPunto(g.codosInicio![1], [0.44, 0.64]);
    expect(g.extremoInicio).toBeUndefined();
    expect(g.codosFin).toBeUndefined();
    expect(g.extremoFin).toBeUndefined();
    const geo = geometriaEje(g, INICIO, FIN, { globoInicio: true, diametroGlobo: D });
    esperarPunto(geo.globoInicio!, [0.44, -0.4]);
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

  it("descarta puntos inválidos y recorta a dos codos (un codo)", () => {
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

  it("no acepta un segundo codo por la puerta del saneamiento", () => {
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

  it("O031: el candado también vale para el globo sin codo (asa fin)", () => {
    expect(candadoArrastreAsa("globo", true)).toBe(true);
    expect(candadoArrastreAsa("base", true)).toBe(true);
    expect(candadoArrastreAsa("globo", false)).toBe(false);
    expect(candadoArrastreAsa("codo", true)).toBe(false);
    // Con codo el globo no tiene pinzamiento: no sigue la alineación.
    expect(candadoArrastreAsa("globo", true, true)).toBe(false);
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

describe("O044: asas de los codos en el alzado", () => {
  it("devuelve el asa de V1 y la de V2 de cada lado", () => {
    // (t, z) del plano del alzado: V1 y V2 son pinzamientos.
    const ajuste = {
      codosInicio: [
        [0, 1.6],
        [0.8, 0.8],
      ] as Array<[number, number]>,
      codosFin: [
        [0, 8.4],
        [-0.8, 9.2],
      ] as Array<[number, number]>,
    };
    expect(asasCodoVista(ajuste)).toEqual([
      { lado: "inicio", indice: 0, punto: [0, 1.6] },
      { lado: "inicio", indice: 1, punto: [0.8, 0.8] },
      { lado: "fin", indice: 0, punto: [0, 8.4] },
      { lado: "fin", indice: 1, punto: [-0.8, 9.2] },
    ]);
    // Sin ajuste no hay asas (no se inventan codos). Un codo viejo de un solo
    // nodo conserva su asa para poder quitarlo.
    expect(asasCodoVista(undefined)).toEqual([]);
    expect(asasCodoVista({})).toEqual([]);
    expect(asasCodoVista({ codosFin: [[0, 8.4]] })).toEqual([
      { lado: "fin", indice: 0, punto: [0, 8.4] },
    ]);
  });
});

describe("arrastre desde el asa, no desde el puntero", () => {
  it("pulsar el globo fuera de su centro no lo saca de su línea", () => {
    // Globo sin codo en alzado (eje vertical): solo se separa en horizontal. Se pulsa
    // 0.3 m arriba y 0.2 m a la derecha del centro y se arrastra 1 m a la derecha.
    const destino = destinoArrastreAsa([5, 10], [5.2, 10.3], [6.2, 10.3], "globo", "vertical");
    expect(destino).toEqual([6, 10]);
  });

  it("sin moverse el asa queda exactamente donde estaba", () => {
    expect(destinoArrastreAsa([3, 4], [3.1, 4.1], [3.1, 4.1], "extremo", "horizontal")).toEqual([3, 4]);
  });

  it("con Shift el arrastre es libre pero sigue partiendo del asa", () => {
    const libre = destinoArrastreAsa([3, 4], [3.1, 4.1], [4.1, 5.1], "extremo", "horizontal", true);
    expect(libre[0]).toBeCloseTo(4, 9);
    expect(libre[1]).toBeCloseTo(5, 9);
  });

  it("el asa de V2 es el nodo real; el asa del globo es el extremo sin codo", () => {
    const bases = { inicio: [0, -1] as [number, number], fin: [0, 10] as [number, number] };
    expect(puntoAsaEje(undefined, bases, "fin", "globo")).toEqual([0, 10]);
    expect(puntoAsaEje(undefined, bases, "inicio", "base")).toEqual([0, -1]);
    const conCodo = agregarCodoEje(undefined, "fin", [0, 10], [0, 1], 0.8);
    expect(puntoAsaEje(conCodo, bases, "fin", "codo", 1)).toEqual(conCodo.codosFin![1]);
    expect(puntoAsaEje(conCodo, bases, "fin", "codo", 0)).toEqual(conCodo.codosFin![0]);
  });
});

describe("O037: asa de codo nuevo sobre la polilínea", () => {
  /** Distancia de un punto al segmento [a, b]; 0 si cae sobre él. */
  function distanciaASegmento(p: [number, number], a: [number, number], b: [number, number]) {
    const [px, py] = p;
    const [ax, ay] = a;
    const [bx, by] = b;
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    if (largo2 < 1e-18) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largo2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  it("con codo el asa queda en el último tramo, no flota fuera", () => {
    // Eje (0,0)→(0,10), D=0.8: V1=(0,8.96), V2=(-0.44,9.36) y globo (-0.44,10.4).
    // El borde del globo está en (-0.44,10); 0.5 m más adentro cae en (-0.44, 9.5).
    const bases = { inicio: [0, 0] as [number, number], fin: [0, 10] as [number, number] };
    const ajuste = agregarCodoEje(undefined, "fin", [0, 10.4], [0, 1], 0.8);
    const asa = puntoAsaCodoNuevo(ajuste, bases, "fin", 0.5, 0.8);
    expect(Math.hypot(asa[0] - -0.44, asa[1] - 9.5)).toBeCloseTo(0, 9);
    expect(distanciaASegmento(asa, [-0.44, 9.36], [-0.44, 10])).toBeLessThanOrEqual(1e-6);
  });

  it("sin codo el asa va sobre la propia línea base", () => {
    const bases = { inicio: [0, 0] as [number, number], fin: [0, 10] as [number, number] };
    const asa = puntoAsaCodoNuevo(undefined, bases, "fin", 0.5);
    expect(asa[0]).toBeCloseTo(0, 9);
    expect(asa[1]).toBeCloseTo(9.5, 9);
    expect(distanciaASegmento(asa, [0, 0], [0, 10])).toBeLessThanOrEqual(1e-6);
  });
});

describe("arrastre de cabeza de nivel", () => {
  it("suma el movimiento del puntero al desplazamiento que tenía", () => {
    // Cabeza ya bajada 0.4 m (automática); se pulsa en z=2.0 y se baja a 1.7.
    const r = desplazamientoArrastreNivel(-0.4, 2.0, 1.7, 0.05);
    expect(r.valor).toBeCloseTo(-0.7, 9);
    expect(r.enganchado).toBe(false);
  });

  it("se engancha de vuelta sobre su línea cerca de 0", () => {
    const r = desplazamientoArrastreNivel(-0.4, 2.0, 2.37, 0.05);
    expect(r).toEqual({ valor: 0, enganchado: true });
  });

  it("con Shift no se engancha", () => {
    const r = desplazamientoArrastreNivel(-0.4, 2.0, 2.37, 0.05, true);
    expect(r.valor).toBeCloseTo(-0.03, 9);
    expect(r.enganchado).toBe(false);
  });
});
