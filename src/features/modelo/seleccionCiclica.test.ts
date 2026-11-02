// O041: Tab recorre muro → cerramiento → castillo → muro bajo el cursor. Los datos
// son de un muro Block 15 (núcleo 0.15) con cerramiento CE-1 de 0.15 y un castillo de
// 0.15 × 0.15 en el centro: las cotas están puestas a mano, no salen del código.
import { describe, expect, test } from "vitest";
import type { ElementoMalla } from "./tipos";
import {
  candidatosBajoPunto,
  siguienteCandidato,
  textoPistaTab,
} from "./seleccionCiclica";

function malla(parcial: Partial<ElementoMalla>): ElementoMalla {
  return {
    globalid: "x",
    clase: "IfcBeam",
    nombre: "x",
    nivel: "Nivel 0",
    color: "#888888",
    opacidad: 1,
    categoria: "vigas",
    tipo: "T",
    capas: [],
    eje: null,
    estructura: null,
    vertices: new Float32Array(),
    indices: new Uint32Array(),
    ...parcial,
  };
}

const muro = malla({
  globalid: "muro-1",
  clase: "IfcWall",
  nombre: "M-1",
  categoria: "muros",
  eje: [0, 0, 4, 0],
  capas: [{ funcion: "núcleo", material: "Block 15", espesor: 0.15, centro: 0 }],
});

const cerramiento = malla({
  globalid: "cer-1",
  nombre: "CE-1",
  categoria: "vigas",
  estructura: {
    alias: "cerramiento",
    seccion: { B: 0.10, H: 0.20 },
    armado: {},
    datos: { X1: 0, Y1: 0, X2: 4, Y2: 0, B: 0.10, Z: 2.5 },
  },
});

const castillo = malla({
  globalid: "cas-1",
  nombre: "C-1",
  categoria: "columnas",
  estructura: {
    alias: "castillo",
    seccion: { B: 0.15, H: 0.15 },
    armado: {},
    datos: { X: 2, Y: 0, B: 0.15, H: 0.15, Rotacion: 0 },
  },
});

const todas = [muro, cerramiento, castillo];

describe("O041: candidatos de Tab en planta", () => {
  test("bajo el centro del muro están muro, cerramiento y castillo en ese orden", () => {
    expect(candidatosBajoPunto(todas, [2, 0]).map((c) => c.alias)).toEqual([
      "muro",
      "cerramiento",
      "castillo",
    ]);
  });

  test("Tab cicla muro → cerramiento → castillo → muro", () => {
    const candidatos = candidatosBajoPunto(todas, [2, 0]);
    const primero = siguienteCandidato(candidatos, null);
    expect(primero?.globalid).toBe("muro-1");
    const segundo = siguienteCandidato(candidatos, primero!.globalid);
    expect(segundo?.globalid).toBe("cer-1");
    const tercero = siguienteCandidato(candidatos, segundo!.globalid);
    expect(tercero?.globalid).toBe("cas-1");
    const cuarto = siguienteCandidato(candidatos, tercero!.globalid);
    expect(cuarto?.globalid).toBe("muro-1");
  });

  test("fuera de la huella no hay candidatos (0.12 m del eje, muro de 0.15)", () => {
    // El muro llega a 0.075 m del eje; 0.12 queda fuera de muro, cerramiento y castillo.
    expect(candidatosBajoPunto(todas, [2, 0.12])).toEqual([]);
  });

  test("sobre el borde del muro (0.06 m) solo el muro si el cerramiento es de 0.10", () => {
    // Muro: |y| ≤ 0.075 + 0.01 = 0.085 → sí. Cerramiento: 0.05 + 0.01 = 0.06, a
    // 0.061 queda fuera. En x = 3 no hay castillo (está en x = 2).
    expect(candidatosBajoPunto(todas, [3, 0.061]).map((c) => c.globalid)).toEqual([
      "muro-1",
    ]);
  });

  test("la pista de la barra de estado nombra el candidato", () => {
    const candidatos = candidatosBajoPunto(todas, [2, 0]);
    const cerramientoSiguiente = siguienteCandidato(candidatos, "muro-1");
    expect(textoPistaTab(cerramientoSiguiente)).toBe(
      "Tab: siguiente (Cerramiento CE-1)",
    );
    expect(textoPistaTab(null)).toBeNull();
  });
});
