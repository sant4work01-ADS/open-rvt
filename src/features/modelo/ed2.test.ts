// ED2: espejo y matriz. Valores calculados a mano en la spec.
import { describe, expect, it } from "vitest";
import {
  angulosMatrizPolar,
  ejeBajoPunto,
  REFERENCIAS_VACIAS,
  reflejarPunto,
  vectorMatrizLineal,
} from "./herramientas";
import { construirComandosRibbon } from "@/features/ribbon/comandos";

describe("ED2 espejo", () => {
  it("refleja puntos respecto a un eje vertical, horizontal y diagonal", () => {
    expect(reflejarPunto([1, 0], [0, 0], [0, 1])).toEqual([-1, 0]);
    expect(reflejarPunto([2, 3], [0, 1], [1, 1])).toEqual([2, -1]);
    // Respecto a y=x, (2,3) va a (3,2).
    expect(reflejarPunto([2, 3], [0, 0], [1, 1])).toEqual([3, 2]);
  });

  it("elige el eje o el muro más cercano al clic", () => {
    const refs = {
      ...REFERENCIAS_VACIAS,
      muros: [
        { globalid: "m1", x1: 0, y1: 4, x2: 4, y2: 4, espesor: 0.15, altura: 2.6 },
      ],
      ejes: [
        { globalid: "e1", etiqueta: "1", x1: 2, y1: 0, x2: 2, y2: 6, vertical: true },
      ],
    };
    expect(ejeBajoPunto(refs, [2.05, 1])).toMatchObject({
      p1: [2, 0],
      p2: [2, 6],
      tipo: "eje",
    });
    expect(ejeBajoPunto(refs, [1, 4.05])).toMatchObject({
      p1: [0, 4],
      p2: [4, 4],
      tipo: "muro",
    });
    expect(ejeBajoPunto(refs, [10, 10])).toBeNull();
  });
});

describe("ED2 matriz", () => {
  it("reparte el vector en los dos modos", () => {
    expect(vectorMatrizLineal([3, 0], 4, "al_segundo")).toEqual([3, 0]);
    // Con 4 elementos hay 3 separaciones: 9 / 3 = 3.
    expect(vectorMatrizLineal([9, 0], 4, "al_ultimo")).toEqual([3, 0]);
    expect(vectorMatrizLineal([3, 0], 1, "al_segundo")).toEqual([0, 0]);
  });

  it("genera los ángulos polares sin duplicar el original", () => {
    const cuartos = angulosMatrizPolar(360, 4);
    expect(cuartos).toHaveLength(3);
    expect(cuartos[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(cuartos[1]).toBeCloseTo(Math.PI, 12);
    expect(cuartos[2]).toBeCloseTo((3 * Math.PI) / 2, 12);
    expect(angulosMatrizPolar(180, 3)).toEqual([Math.PI / 2, Math.PI]);
  });

  it("la cinta declara los atajos MM y AR", () => {
    const comandos = construirComandosRibbon({
      nuevo: () => undefined,
      abrir: () => undefined,
      guardar: () => undefined,
      guardarComo: () => undefined,
      nuevaVistaCorte: () => undefined,
      estilosObjeto: () => undefined,
      estilosAnotacion: () => undefined,
      nuevoNivel: () => undefined,
      nuevoEje: () => undefined,
      nuevosEjesPorSeparaciones: () => undefined,
      herramientaMuro: () => undefined,
      herramientaLosa: () => undefined,
      losaDesdeMuros: () => undefined,
      herramientaPuerta: () => undefined,
      herramientaVentana: () => undefined,
      herramientaMover: () => undefined,
      herramientaCopiar: () => undefined,
      herramientaAlinear: () => undefined,
      herramientaZapata: () => undefined,
      herramientaZapataCorrida: () => undefined,
      herramientaContratrabe: () => undefined,
      herramientaColumna: () => undefined,
      herramientaCastillo: () => undefined,
      herramientaTrabe: () => undefined,
      herramientaCerramiento: () => undefined,
      herramientaDala: () => undefined,
      castillosAutomaticos: () => undefined,
      unirZapatas: () => undefined,
      unirTrabes: () => undefined,
      abrirTipos: () => undefined,
      borrarSeleccion: () => undefined,
      deshacer: () => undefined,
      rehacer: () => undefined,
      herramientaActiva: null,
      temaSistema: () => undefined,
      temaClaro: () => undefined,
      temaOscuro: () => undefined,
      temaActivo: "sistema",
    });
    expect(comandos.find((c) => c.id === "espejo")?.atajo).toBe("MM");
    expect(comandos.find((c) => c.id === "matriz")?.atajo).toBe("AR");
  });
});
