// OPEN-RVT (O003b): pruebas de la matemática de dibujo.
import { describe, expect, test } from "vitest";
import {
  buscarEnganche,
  colocarAbertura,
  distanciaAEjeParalelo,
  ejeConDistancia,
  fijarAngulo,
  puntoConLongitud,
  puntoDibujo,
  redondearCuadricula,
  REFERENCIAS_VACIAS,
  restringirEje,
  siguienteEtiquetaEje,
  type EjeReferencia,
  type Referencias,
} from "./herramientas";

const refs: Referencias = {
  ...REFERENCIAS_VACIAS,
  muros: [
    { globalid: "m1", x1: 0, y1: 0, x2: 8, y2: 0, espesor: 0.15, altura: 2.6 },
    { globalid: "m2", x1: 8, y1: 0, x2: 8, y2: 6, espesor: 0.15, altura: 2.6 },
  ],
  extremos: [
    [0, 0],
    [8, 0],
    [8, 6],
  ],
  medios: [[4, 0], [8, 3]],
  intersecciones: [[8, 0]],
};

describe("enganches", () => {
  test("prioriza el extremo sobre la cuadrícula", () => {
    const e = buscarEnganche([0.12, 0.02], refs);
    expect(e.tipo).toBe("extremo");
    expect(e.punto).toEqual([0, 0]);
  });

  test("engancha el punto medio de un muro", () => {
    const e = buscarEnganche([4.04, 0.02], refs);
    expect(e.tipo).toBe("medio");
    expect(e.punto).toEqual([4, 0]);
  });

  test("sin referencias cae en la cuadrícula de 0,05 m", () => {
    const e = buscarEnganche([1.234, -0.466], REFERENCIAS_VACIAS);
    expect(e.tipo).toBe("cuadricula");
    expect(e.punto).toEqual([1.25, -0.45]);
    expect(redondearCuadricula([1.26, 1.24])).toEqual([1.25, 1.25]);
  });

  test("O007b: el cruce de dos ejes engancha con prioridad sobre la cuadrícula", () => {
    const r: Referencias = {
      ...REFERENCIAS_VACIAS,
      ejes: [
        { globalid: "e1", etiqueta: "1", x1: 3, y1: -1, x2: 3, y2: 9, vertical: true },
        { globalid: "eA", etiqueta: "A", x1: -1, y1: 4, x2: 9, y2: 4, vertical: false },
      ],
    };
    const e = buscarEnganche([3.1, 3.9], r);
    expect(e.tipo).toBe("cruce");
    expect(e.punto).toEqual([3, 4]);
  });

  test("engancha la intersección de dos ejes", () => {
    const r: Referencias = {
      ...REFERENCIAS_VACIAS,
      intersecciones: [[3, 5]],
    };
    expect(buscarEnganche([3.1, 5.05], r)).toMatchObject({
      tipo: "interseccion",
      punto: [3, 5],
    });
  });

  test("engancha perpendicularmente a un muro desde el punto anterior", () => {
    const e = buscarEnganche([3.04, 0.08], refs, [3.04, 2]);
    expect(e.tipo).toBe("perpendicular");
    expect(e.punto[0]).toBeCloseTo(3.04, 6);
    expect(e.punto[1]).toBeCloseTo(0, 6);
  });
});

describe("ángulo a 15°", () => {
  test("fija 7° a 0° y 22° a 15°", () => {
    const casi = fijarAngulo([0, 0], [10, Math.tan((7 * Math.PI) / 180) * 10]);
    expect(Math.atan2(casi[1], casi[0])).toBeCloseTo(0, 6);
    expect(Math.hypot(casi[0], casi[1])).toBeCloseTo(
      Math.hypot(10, Math.tan((7 * Math.PI) / 180) * 10),
      6,
    );
    const quince = fijarAngulo([0, 0], [10, 4]);
    const angulo = (Math.atan2(quince[1], quince[0]) * 180) / Math.PI;
    expect(angulo).toBeCloseTo(15, 6);
  });

  test("Shift desactiva el ángulo fijo", () => {
    const destino: [number, number] = [10, 4];
    expect(fijarAngulo([0, 0], destino, true)).toEqual(destino);
  });

  test("puntoDibujo aplica enganche y ángulo", () => {
    const e = puntoDibujo([7.9, 0.03], refs, [0, 0]);
    expect(e.punto).toEqual([8, 0]);
    expect(e.tipo).toBe("extremo");
  });
});

describe("longitud tecleada", () => {
  test("4,5 m en horizontal termina en 4,5", () => {
    expect(puntoConLongitud([0, 0], [10, 0.01], 4.5)).toEqual([4.5, 0]);
  });

  test("respeta la dirección y el ángulo a 15°", () => {
    const p = puntoConLongitud([1, 2], [2, 3], 4.5);
    expect(Math.abs(Math.hypot(p[0] - 1, p[1] - 2) - 4.5)).toBeLessThan(1e-6);
    const angulo = (Math.atan2(p[1] - 2, p[0] - 1) * 180) / Math.PI;
    expect(angulo).toBeCloseTo(45, 6);
  });
});

describe("etiquetas de ejes", () => {
  const eje = (etiqueta: string, vertical: boolean) => ({
    globalid: `g-${etiqueta}`,
    etiqueta,
    x1: 0,
    y1: 0,
    x2: vertical ? 0 : 1,
    y2: vertical ? 1 : 0,
    vertical,
  });

  test("los verticales usan el primer número libre y los horizontales la primera letra", () => {
    expect(siguienteEtiquetaEje([], true)).toBe("1");
    expect(siguienteEtiquetaEje([eje("1", true), eje("3", true)], true)).toBe("2");
    expect(siguienteEtiquetaEje([], false)).toBe("A");
    expect(siguienteEtiquetaEje([eje("a", false), eje("C", false)], false)).toBe("B");
  });

  test("no reutiliza una etiqueta aunque sea de la otra dirección", () => {
    expect(siguienteEtiquetaEje([eje("1", false)], true)).toBe("2");
    expect(siguienteEtiquetaEje([eje("A", true)], false)).toBe("B");
  });
});

describe("restricciones iniciales del eje (O006d)", () => {
  const vertical: EjeReferencia = {
    globalid: "g1",
    etiqueta: "1",
    x1: 0,
    y1: -1.5,
    x2: 0,
    y2: 9.5,
    vertical: true,
  };
  const horizontal: EjeReferencia = {
    globalid: "gA",
    etiqueta: "A",
    x1: -1.5,
    y1: 0,
    x2: 16,
    y2: 0,
    vertical: false,
  };

  test("un trazo casi vertical se fuerza paralelo con los extremos de la familia", () => {
    const r = restringirEje([3, 2], [3.1, 7], [vertical, horizontal]);
    expect(r).not.toBeNull();
    expect(r!.vertical).toBe(true);
    expect(r!.inicio).toEqual([3.1, -1.5]);
    expect(r!.fin).toEqual([3.1, 9.5]);
    expect(r!.distancia).toBeCloseTo(3.1, 6);
  });

  test("un trazo a más de 15° no se restringe; Ctrl/Alt tampoco", () => {
    expect(restringirEje([3, 2], [5, 6], [vertical, horizontal])).toBeNull();
    expect(restringirEje([3, 2], [3.1, 7], [vertical, horizontal], true)).toBeNull();
  });

  test("la distancia tecleada fija el paralelo del lado del cursor", () => {
    const r = ejeConDistancia([20, 2], [20.1, 7], [vertical, horizontal], 6);
    expect(r).not.toBeNull();
    expect(r!.vertical).toBe(true);
    expect(r!.inicio).toEqual([6, -1.5]);
    expect(r!.fin).toEqual([6, 9.5]);
    expect(r!.distancia).toBeCloseTo(6, 6);
  });

  test("la distancia al paralelo más cercano se mide en perpendicular", () => {
    const d = distanciaAEjeParalelo([8.4, 3], [vertical, horizontal], true);
    expect(d!.referencia.etiqueta).toBe("1");
    expect(d!.distancia).toBeCloseTo(8.4, 6);
  });
});

describe("colocación de puertas y ventanas", () => {
  test("ajusta a 5 cm y calcula las cotas a los extremos", () => {
    const a = colocarAbertura(refs, [2.03, 0.02], 0.9);
    expect(a).not.toBeNull();
    expect(a!.distancia).toBe(1.6); // 2.03 - 0.45 = 1.58, redondeado a 1,60
    expect(a!.desdeInicio).toBeCloseTo(1.6, 6);
    expect(a!.hastaFin).toBeCloseTo(8 - 1.6 - 0.9, 6);
    expect(a!.punto[0]).toBeCloseTo(2.05, 6);
  });

  test("no coloca fuera de un muro", () => {
    expect(colocarAbertura(refs, [8, 3.5], 1.2)).not.toBeNull();
    expect(colocarAbertura(refs, [20, 20], 1.2)).toBeNull();
  });
});
