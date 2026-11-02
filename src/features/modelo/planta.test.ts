// O006e: huellas unidas de muros y líneas de capa sin cruzar las esquinas.
import { describe, expect, test } from "vitest";
import type { CapaMuro } from "./tipos";
import {
  calcularPlantaMuros,
  contarVertices,
  lineasCapas,
  nucleoMuro,
  poligonosCapas,
  puntoDentroDeHuella,
  unirHuellas,
  type MuroPlanta,
  type SeccionPlanta,
} from "./planta";

const nucleo = (espesor = 0.15): CapaMuro[] => [
  { material: "Block de concreto 15", funcion: "núcleo", espesor, centro: 0 },
];

const multicapa = (): CapaMuro[] => [
  { material: "Pintura", funcion: "acabado", espesor: 0.0005, centro: -0.09525 },
  { material: "Aplanado fino", funcion: "acabado", espesor: 0.005, centro: -0.0925 },
  { material: "Aplanado de mortero (repellado)", funcion: "acabado", espesor: 0.015, centro: -0.0825 },
  { material: "Block de concreto 15", funcion: "núcleo", espesor: 0.15, centro: 0 },
  { material: "Yeso", funcion: "acabado", espesor: 0.01, centro: 0.08 },
  { material: "Pintura", funcion: "acabado", espesor: 0.0005, centro: 0.08525 },
];

function muro(
  globalid: string,
  eje: [number, number, number, number],
  capas = nucleo(),
): MuroPlanta {
  return { globalid, eje, capas };
}

const L = [
  muro("h", [0, 0, 4, 0]),
  muro("v", [4, 0, 4, 3]),
];

const T = [
  muro("pasante", [0, 0, 8, 0]),
  muro("llega", [4, 0, 4, 3]),
];

describe("huellas de muros unidas (O006e)", () => {
  test("la huella de una L tiene 6 vértices", () => {
    const huellas = unirHuellas(L);
    expect(huellas).toHaveLength(1);
    expect(contarVertices(huellas[0])).toBe(6);
  });

  test("la huella de una T tiene 8 vértices", () => {
    const huellas = unirHuellas(T);
    expect(huellas).toHaveLength(1);
    expect(contarVertices(huellas[0])).toBe(8);
  });

  test("ninguna línea de capa cruza el interior del núcleo de otra pieza", () => {
    const muros = L.map((m) => muro(m.globalid, m.eje, multicapa()));
    const planta = calcularPlantaMuros(muros);
    const nucleos = muros.map((m) => nucleoMuro(m)[0]);
    const lineas = planta.capas.flatMap((capa) => capa.lineas);
    expect(lineas.length).toBeGreaterThan(4);
    for (const linea of lineas) {
      for (let i = 1; i < linea.length; i += 1) {
        const [ax, ay] = linea[i - 1];
        const [bx, by] = linea[i];
        for (const t of [0.1, 0.5, 0.9]) {
          const punto: [number, number] = [ax + (bx - ax) * t, ay + (by - ay) * t];
          for (const anillo of nucleos) {
            // Se permite tocar el borde (la cara del núcleo), no entrar en él.
            const enBorde =
              Math.abs(
                distanciaAlAnillo(punto, anillo.map(([x, y]) => [x, y])),
              ) < 1e-6;
            if (enBorde) continue;
            expect(puntoEnAnilloLocal(punto, anillo.map(([x, y]) => [x, y]))).toBe(false);
          }
        }
      }
    }
  });

  test("en T la capa del muro que llega termina en la cara del núcleo pasante", () => {
    const muros = T.map((m) => muro(m.globalid, m.eje, multicapa()));
    const lineas = lineasCapas(muros).flatMap((capa) => capa.lineas);
    const pasante = nucleoMuro(muros[0])[0].map(([x, y]) => [x, y] as [number, number]);
    for (const linea of lineas) {
      for (let i = 1; i < linea.length; i += 1) {
        const punto: [number, number] = [
          (linea[i - 1][0] + linea[i][0]) / 2,
          (linea[i - 1][1] + linea[i][1]) / 2,
        ];
        // Las líneas horizontales del pasante siguen de largo por fuera del núcleo;
        // ninguna debe meterse en el interior del pasante salvo en su borde.
        if (puntoEnAnilloLocal(punto, pasante)) {
          expect(distanciaAlAnillo(punto, pasante)).toBeLessThan(1e-6 + 1e-9);
        }
      }
    }
    const huella = unirHuellas(muros)[0];
    expect(puntoDentroDeHuella([4, 1.5], huella)).toBe(true);
    expect(puntoDentroDeHuella([4, 3.2], huella)).toBe(false);
  });
});


describe("área de la huella en L, T y cruz (O010)", () => {
  function areaAnillo(anillo: Array<[number, number]>): number {
    let suma = 0;
    for (let i = 0; i < anillo.length; i += 1) {
      const [x1, y1] = anillo[i];
      const [x2, y2] = anillo[(i + 1) % anillo.length];
      suma += x1 * y2 - x2 * y1;
    }
    return Math.abs(suma) / 2;
  }

  function areaHuella(huellas: ReturnType<typeof unirHuellas>): number {
    return huellas.reduce(
      (total, poligono) =>
        total +
        areaAnillo(poligono.exterior) -
        poligono.huecos.reduce((resta, hueco) => resta + areaAnillo(hueco), 0),
      0,
    );
  }

  test("L con espesores iguales: área exacta L1·t + L2·t", () => {
    const huellas = unirHuellas(L);
    expect(huellas).toHaveLength(1);
    expect(areaHuella(huellas)).toBeCloseTo((4 + 3) * 0.15, 6);
  });

  test("T con espesores iguales: el que llega se descuenta una sola vez", () => {
    const huellas = unirHuellas(T);
    expect(huellas).toHaveLength(1);
    // Pasante 8×t + el que llega 3×t − el cruce t×(t/2).
    expect(areaHuella(huellas)).toBeCloseTo(8 * 0.15 + 3 * 0.15 - 0.15 * 0.075, 6);
  });

  test("cruz: área de la unión, sin contar dos veces el cruce", () => {
    const cruz = [
      muro("h", [0, 4, 8, 4]),
      muro("v", [4, 0, 4, 8]),
    ];
    const huellas = unirHuellas(cruz);
    expect(huellas).toHaveLength(1);
    expect(areaHuella(huellas)).toBeCloseTo(8 * 0.15 + 8 * 0.15 - 0.15 * 0.15, 6);
  });

  test("L con espesores distintos: cada muro llega a la cara exterior del otro", () => {
    const distintos = [
      muro("h", [0, 0, 4, 0], nucleo(0.15)),
      muro("v", [4, 0, 4, 3], nucleo(0.2)),
    ];
    const huellas = unirHuellas(distintos);
    expect(huellas).toHaveLength(1);
    // El inglete limpio suma exactamente los dos largos por su espesor.
    expect(areaHuella(huellas)).toBeCloseTo(4 * 0.15 + 3 * 0.2, 6);
    expect(contarVertices(huellas[0])).toBe(6);
  });

  test("T y cruz con espesores distintos: sin solapes ni huecos", () => {
    const t = [
      muro("pasante", [0, 0, 8, 0], nucleo(0.15)),
      muro("llega", [4, 0, 4, 3], nucleo(0.2)),
    ];
    expect(areaHuella(unirHuellas(t))).toBeCloseTo(
      8 * 0.15 + 3 * 0.2 - (0.15 * 0.2) / 2,
      6,
    );
    const cruz = [
      muro("h", [0, 4, 8, 4], nucleo(0.15)),
      muro("v", [4, 0, 4, 8], nucleo(0.2)),
    ];
    expect(areaHuella(unirHuellas(cruz))).toBeCloseTo(
      8 * 0.15 + 8 * 0.2 - 0.15 * 0.2,
      6,
    );
  });
});


describe("castillos y columnas en planta (O007c)", () => {
  const castillo: SeccionPlanta = {
    globalid: "k1",
    x: 4,
    y: 0,
    ancho: 0.15,
    fondo: 0.15,
    rotacion: 0,
    funcion: "castillo",
  };
  const columna: SeccionPlanta = {
    globalid: "c1",
    x: 4,
    y: 0,
    ancho: 0.30,
    fondo: 0.30,
    rotacion: 0,
    funcion: "columna",
  };
  // Interior estricto: la cara de la columna sí se dibuja.
  const enSeccion = (punto: [number, number], seccion: SeccionPlanta) =>
    Math.abs(punto[0] - seccion.x) < seccion.ancho / 2 - 1e-9 &&
    Math.abs(punto[1] - seccion.y) < seccion.fondo / 2 - 1e-9;
  const longitud = (lineas: Array<Array<[number, number]>>) =>
    lineas.reduce(
      (total, linea) =>
        total +
        linea.slice(1).reduce(
          (suma, punto, i) =>
            suma +
            Math.hypot(punto[0] - linea[i][0], punto[1] - linea[i][1]),
          0,
        ),
      0,
    );
  const nucleo = (planta: ReturnType<typeof calcularPlantaMuros>) =>
    planta.capas.filter((capa) => capa.funcion === "núcleo").flatMap((c) => c.lineas);
  const acabados = (planta: ReturnType<typeof calcularPlantaMuros>) =>
    planta.capas.filter((capa) => capa.funcion !== "núcleo").flatMap((c) => c.lineas);
  const longitudDentro = (
    lineas: Array<Array<[number, number]>>,
    seccion: SeccionPlanta,
  ) =>
    lineas.reduce(
      (total, linea) =>
        total +
        linea.slice(1).reduce((suma, punto, i) => {
          const anterior = linea[i];
          const medio: [number, number] = [
            (anterior[0] + punto[0]) / 2,
            (anterior[1] + punto[1]) / 2,
          ];
          return suma +
            (enSeccion(medio, seccion)
              ? Math.hypot(punto[0] - anterior[0], punto[1] - anterior[1])
              : 0);
        }, 0),
      0,
    );

  test("en una L con castillo ninguna línea de núcleo entra en su sección", () => {
    const muros = L.map((m) => muro(m.globalid, m.eje, multicapa()));
    const planta = calcularPlantaMuros(muros, [castillo]);
    for (const linea of nucleo(planta)) {
      for (let i = 1; i < linea.length; i += 1) {
        for (const t of [0.1, 0.5, 0.9]) {
          const punto: [number, number] = [
            linea[i - 1][0] + (linea[i][0] - linea[i - 1][0]) * t,
            linea[i - 1][1] + (linea[i][1] - linea[i - 1][1]) * t,
          ];
          expect(enSeccion(punto, castillo)).toBe(false);
        }
      }
    }
  });

  test("los acabados pasan por encima del castillo y no se recortan", () => {
    const muros = L.map((m) => muro(m.globalid, m.eje, multicapa()));
    // Para medir la interrupción se usa un castillo a media crujía; en la esquina
    // el núcleo ya está unido y no tiene líneas interiores que cortar.
    const medio: SeccionPlanta = castillo;
    const sin = calcularPlantaMuros(muros);
    const con = calcularPlantaMuros(muros, [medio]);
    expect(longitudDentro(nucleo(con), medio)).toBe(0);
    // Si los acabados se recortaran contra el castillo, su longitud bajaría.
    expect(longitud(acabados(con))).toBeGreaterThanOrEqual(longitud(acabados(sin)) - 1e-6);
    for (const linea of acabados(con)) {
      for (const punto of linea) expect(enSeccion(punto, castillo)).toBe(false);
    }
  });

  test("en una columna todas las capas del muro terminan en su cara", () => {
    const muros = L.map((m) => muro(m.globalid, m.eje, multicapa()));
    const con = calcularPlantaMuros(muros, [columna]);
    expect(longitudDentro(con.capas.flatMap((c) => c.lineas), columna)).toBe(0);
    for (const linea of con.capas.flatMap((capa) => capa.lineas)) {
      for (const punto of linea) expect(enSeccion(punto, columna)).toBe(false);
    }
  });
});

function puntoEnAnilloLocal(punto: [number, number], anillo: Array<[number, number]>): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i, i += 1) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > punto[1] !== yj > punto[1]) {
      const x = ((xj - xi) * (punto[1] - yi)) / (yj - yi || 1e-12) + xi;
      if (punto[0] < x) dentro = !dentro;
    }
  }
  return dentro;
}

function distanciaAlAnillo(
  punto: [number, number],
  anillo: Array<[number, number]>,
): number {
  let minimo = Infinity;
  for (let i = 1; i < anillo.length; i += 1) {
    const [ax, ay] = anillo[i - 1];
    const [bx, by] = anillo[i];
    const dx = bx - ax;
    const dy = by - ay;
    const largo2 = dx * dx + dy * dy;
    const t =
      largo2 <= 1e-12
        ? 0
        : Math.max(0, Math.min(1, ((punto[0] - ax) * dx + (punto[1] - ay) * dy) / largo2));
    minimo = Math.min(minimo, Math.hypot(punto[0] - (ax + t * dx), punto[1] - (ay + t * dy)));
  }
  return minimo;
}


describe("capas de muro con inglete (O012)", () => {
  function area(anillo: Array<[number, number]>): number {
    let suma = 0;
    for (let i = 0; i < anillo.length; i += 1) {
      const [x1, y1] = anillo[i];
      const [x2, y2] = anillo[(i + 1) % anillo.length];
      suma += x1 * y2 - x2 * y1;
    }
    return Math.abs(suma) / 2;
  }

  const tresCapas = (
    total = 0.19,
    nucleo = 0.15,
    acabs = 0.02,
  ): CapaMuro[] => [
    { material: "Acabado exterior", funcion: "acabado", espesor: acabs, centro: -(total / 2 - acabs / 2) },
    { material: "Block", funcion: "núcleo", espesor: nucleo, centro: 0 },
    { material: "Acabado interior", funcion: "acabado", espesor: acabs, centro: total / 2 - acabs / 2 },
  ];

  test("L de 3 capas: la suma de áreas de capa es el área de la huella", () => {
    const muros = [
      muro("h", [0, 0, 4, 0], tresCapas()),
      muro("v", [4, 0, 4, 3], tresCapas()),
    ];
    const bandas = muros.flatMap((m) => poligonosCapas(m, muros));
    expect(bandas).toHaveLength(6);
    const suma = bandas.reduce((total, b) => total + area(b.poligono), 0);
    // Huella en L con ejes de 4 y 3 m y espesor 0.19: cada muro se alarga medio
    // espesor del otro; el cuadro exterior queda contado una sola vez → 1.330 m².
    expect(suma).toBeCloseTo((4 + 3) * 0.19, 9);
    const huellas = unirHuellas(muros);
    const areaHuella = huellas.reduce(
      (total, p) => total + area(p.exterior) - p.huecos.reduce((r, h) => r + area(h), 0),
      0,
    );
    expect(suma).toBeCloseTo(areaHuella, 9);
  });

  test("T de 3 capas: el muro que llega termina en la cara del pasante", () => {
    const muros = [
      muro("pasante", [0, 0, 8, 0], tresCapas()),
      muro("llega", [4, 0, 4, 3], tresCapas()),
    ];
    const bandas = muros.flatMap((m) => poligonosCapas(m, muros));
    const suma = bandas.reduce((total, b) => total + area(b.poligono), 0);
    const huellas = unirHuellas(muros);
    const areaHuella = huellas.reduce(
      (total, p) => total + area(p.exterior) - p.huecos.reduce((r, h) => r + area(h), 0),
      0,
    );
    expect(suma).toBeCloseTo(areaHuella, 9);
    // Ninguna capa del muro que llega pasa al otro lado de la cara del pasante.
    for (const banda of poligonosCapas(muros[1], muros)) {
      for (const [, y] of anilloAbiertoTest(banda.poligono)) {
        expect(y).toBeGreaterThanOrEqual(0.095 - 1e-9);
      }
    }
  });

  test("L con espesores distintos: no hay muescas ni traslapes", () => {
    const muros = [
      muro("h", [0, 0, 4, 0], tresCapas(0.19, 0.15, 0.02)),
      muro("v", [4, 0, 4, 3], tresCapas(0.25, 0.15, 0.05)),
    ];
    const bandas = muros.flatMap((m) => poligonosCapas(m, muros));
    const suma = bandas.reduce((total, b) => total + area(b.poligono), 0);
    const huellas = unirHuellas(muros);
    const areaHuella = huellas.reduce(
      (total, p) => total + area(p.exterior) - p.huecos.reduce((r, h) => r + area(h), 0),
      0,
    );
    expect(suma).toBeCloseTo(areaHuella, 9);
  });
});

function anilloAbiertoTest(anillo: Array<[number, number]>): Array<[number, number]> {
  if (anillo.length < 2) return anillo;
  const [ax, ay] = anillo[0];
  const [bx, by] = anillo[anillo.length - 1];
  return Math.hypot(ax - bx, ay - by) < 1e-9 ? anillo.slice(0, -1) : anillo;
}

// O032: con la línea de ubicación a paño el cuerpo del muro no está centrado en su
// línea dibujada. La planta debe cerrar las esquinas sin sobresalir ni dejar hueco.
describe("esquinas con línea de ubicación a paño (O032)", () => {
  const e = 0.15;
  // Capa con el centro desplazado: «paño interior» deja el cuerpo hacia +n (exterior).
  const aPano = (lado: 1 | -1): CapaMuro[] => [
    { material: "Block de concreto 15", funcion: "núcleo", espesor: e, centro: (lado * e) / 2 },
  ];
  const rect = (lineas: Array<0 | 1 | -1>) => {
    const ejes: Array<[number, number, number, number]> = [
      [0, 0, 0, 3],
      [0, 3, 4, 3],
      [4, 3, 4, 0],
      [4, 0, 0, 0],
    ];
    return ejes.map((eje, i) =>
      muro(`m${i}`, eje, lineas[i] === 0 ? nucleo(e) : aPano(lineas[i] as 1 | -1)),
    );
  };
  const area = (poligonos: ReturnType<typeof unirHuellas>) =>
    poligonos.reduce((total, p) => {
      const anillo = (r: number[][]) => {
        let s = 0;
        for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) {
          s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
        }
        return Math.abs(s) / 2;
      };
      return total + anillo(p.exterior) - p.huecos.reduce((h, r) => h + anillo(r), 0);
    }, 0);

  const combinaciones: Array<Array<0 | 1 | -1>> = [];
  for (const a of [0, 1, -1] as const)
    for (const b of [0, 1, -1] as const)
      for (const c of [0, 1, -1] as const)
        for (const d of [0, 1, -1] as const) combinaciones.push([a, b, c, d]);

  test.each(combinaciones)("rectángulo %i %i %i %i: anillo limpio de 4+4 vértices y área exacta", (...lineas) => {
    const muros = rect(lineas as Array<0 | 1 | -1>);
    const huellas = unirHuellas(muros);
    expect(huellas).toHaveLength(1);
    expect(huellas[0].huecos).toHaveLength(1);
    // Sin muescas ni salientes: 4 vértices afuera y 4 en el hueco.
    // Sin muescas ni salientes: 4 vértices afuera y 4 en el hueco.
    expect(contarVertices(huellas[0])).toBe(4);
    expect(contarVertices({ exterior: huellas[0].huecos[0], huecos: [] })).toBe(4);
    // Área esperada a mano: rectángulo exterior menos interior, según dónde quede
    // la cara de cada muro (m0 izquierda x, m1 arriba y, m2 derecha x, m3 abajo y).
    const caras = muros.map((m) => {
      const c = m.capas[0].centro ?? 0;
      return [c - e / 2, c + e / 2];
    });
    // n de m0 (sube) = −x; de m1 (a la derecha) = +y; de m2 (baja) = +x; de m3 (izq.) = −y.
    const x0e = 0 - caras[0][1];
    const x0i = 0 - caras[0][0];
    const y1e = 3 + caras[1][1];
    const y1i = 3 + caras[1][0];
    const x2e = 4 + caras[2][1];
    const x2i = 4 + caras[2][0];
    const y3e = 0 - caras[3][1];
    const y3i = 0 - caras[3][0];
    const esperada = (x2e - x0e) * (y1e - y3e) - (x2i - x0i) * (y1i - y3i);
    expect(area(huellas)).toBeCloseTo(esperada, 9);
  });

  test("T con el pasante a paño: el que llega toca la cara lejana sin hueco", () => {
    const muros = [
      muro("pasante", [8, 0, 0, 0], aPano(1)), // n = −y: cuerpo de y=0 a y=−0.15
      muro("llega", [4, 0, 4, 3]),
    ];
    const [huella] = unirHuellas(muros);
    expect(puntoDentroDeHuella([4, -0.075], huella)).toBe(true);
    expect(huella.huecos).toHaveLength(0);
    expect(contarVertices(huella)).toBe(8);
  });
});
