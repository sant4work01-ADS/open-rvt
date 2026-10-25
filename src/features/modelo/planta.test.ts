// O006e: huellas unidas de muros y líneas de capa sin cruzar las esquinas.
import { describe, expect, test } from "vitest";
import type { CapaMuro } from "./tipos";
import {
  calcularPlantaMuros,
  contarVertices,
  lineasCapas,
  nucleoMuro,
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
