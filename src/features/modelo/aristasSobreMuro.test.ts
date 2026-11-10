// O062: aristas de losas y estructura ocultas sobre las caras del muro.
// Obra del dueño `nucleo/tests/datos/o061-fallo-dueno.ifc`, teselada y guardada
// en `datos/o061-fallo-dueno.json` con la misma preparación que hace el visor al
// abrir (muros regenerados, cerramientos con el ancho del muro).
//
// Valores a mano, con la geometría del dueño:
// - Muro sur: cara exterior y = −0.10; muro norte y = 0.10; oeste x = −0.10;
//   este x = 2.60. Caras interiores de los bolsillos: ±0.085 (piel de 0.015) y
//   caras de castillo ±0.075.
// - Los cuatro cerramientos miden 2.35 × 0.20 (sur/norte) y 1.35 × 0.20
//   (este/oeste) con el ancho del muro (0.20): sus caras quedan enrasadas con
//   la cara del muro. De cada caja se quitan 6 aristas de silueta (los cuatro
//   lados de la cara enrasada y las dos verticales de los extremos que caen en
//   las caras interiores del muro).
// - Losa de azotea: 2.70 × 1.70 × 0.12. Se quitan las 4 aristas del perímetro
//   inferior (z = 3.08), las 4 del superior (z = 3.20) y las 4 verticales de
//   las esquinas: 12 aristas.
// - Firme: se quitan las 4 aristas del perímetro superior (z = 0.12), que
//   coincide con la base del muro; las inferiores (z = 0) quedan fuera de la
//   extensión del muro y se conservan.
// - Castillo: 0.15 × 0.15. Se quitan 19 de sus aristas (las verticales y las
//   horizontales de base y de los cortes de la losa). Las 4 horizontales del
//   cuadrado de la corona (z = 3.60) se conservan: son la tapa del castillo,
//   no una línea sobre la cara del muro.

import { describe, expect, it } from "vitest";
import {
  PIEL_MURO_M,
  aristasOcultasSobreMuro,
} from "./aristasSobreMuro";
import { claveSegmento, type ElementoParaAristas } from "./geometria";
import datos from "./datos/o061-fallo-dueno.json";

type Punto = [number, number, number];

const elementos: ElementoParaAristas[] = datos.map((elemento) => ({
  globalid: elemento.globalid,
  categoria: elemento.categoria,
  vertices: new Float32Array(elemento.vertices),
  indices: new Uint32Array(elemento.indices),
}));

function clave(a: Punto, b: Punto): string {
  return claveSegmento(a, b);
}

function porGlobalid(globalid: string): ElementoParaAristas {
  const elemento = elementos.find((e) => e.globalid === globalid);
  expect(elemento).toBeDefined();
  return elemento!;
}

const ocultas = aristasOcultasSobreMuro(elementos);

const CERRAMIENTO_SUR = "0d7ygbrWL4AuXFnnw3sUur";
const CERRAMIENTO_NORTE = "0QKq$M45v1evNXSic4NbwU";
const CASTILLO_SUR = "17P4lrSdXE0gUZ5o2qrHQj";

describe("aristas sobre la cara del muro (O062)", () => {
  it("la piel del visor coincide con PIEL_MURO del núcleo", () => {
    expect(PIEL_MURO_M).toBe(0.015);
  });

  it("oculta las 4 aristas del cerramiento sur enrasado con la cara y=-0.10", () => {
    const esperadas = [
      clave([0.075, -0.1, 2.2], [2.425, -0.1, 2.2]),
      clave([2.425, -0.1, 2.2], [2.425, -0.1, 2.4]),
      clave([2.425, -0.1, 2.4], [0.075, -0.1, 2.4]),
      clave([0.075, -0.1, 2.4], [0.075, -0.1, 2.2]),
    ];
    for (const arista of esperadas) expect(ocultas.has(arista)).toBe(true);
  });

  it("oculta 6 aristas por cerramiento: la cara enrasada y sus dos verticales", () => {
    for (const globalid of [
      CERRAMIENTO_SUR,
      CERRAMIENTO_NORTE,
      "0pOxv5qpDEHxHNc6MoMl$m",
      "1Q91G7EZ13HfBiCyB7JQbc",
    ]) {
      let contador = 0;
      const elemento = porGlobalid(globalid);
      for (let i = 0; i + 2 < elemento.indices.length; i += 3) {
        for (const par of [
          [0, 1],
          [1, 2],
          [2, 0],
        ]) {
          const ia = elemento.indices[i + par[0]] * 3;
          const ib = elemento.indices[i + par[1]] * 3;
          if (
            ocultas.has(
              clave(
                [elemento.vertices[ia], elemento.vertices[ia + 1], elemento.vertices[ia + 2]],
                [elemento.vertices[ib], elemento.vertices[ib + 1], elemento.vertices[ib + 2]],
              ),
            )
          ) {
            contador += 1;
          }
        }
      }
      expect(contador / 2).toBe(6);
    }
  });

  it("oculta las 12 aristas del contorno de la losa de azotea", () => {
    const esperadas: Array<[Punto, Punto]> = [
      [[-0.1, -0.1, 3.08], [-0.1, 1.6, 3.08]],
      [[-0.1, -0.1, 3.08], [2.6, -0.1, 3.08]],
      [[-0.1, -0.1, 3.2], [-0.1, 1.6, 3.2]],
      [[-0.1, -0.1, 3.2], [2.6, -0.1, 3.2]],
      [[2.6, 1.6, 3.08], [-0.1, 1.6, 3.08]],
      [[2.6, 1.6, 3.08], [2.6, -0.1, 3.08]],
      [[2.6, 1.6, 3.2], [-0.1, 1.6, 3.2]],
      [[2.6, 1.6, 3.2], [2.6, -0.1, 3.2]],
      [[-0.1, -0.1, 3.08], [-0.1, -0.1, 3.2]],
      [[-0.1, 1.6, 3.08], [-0.1, 1.6, 3.2]],
      [[2.6, -0.1, 3.08], [2.6, -0.1, 3.2]],
      [[2.6, 1.6, 3.08], [2.6, 1.6, 3.2]],
    ];
    for (const [a, b] of esperadas) expect(ocultas.has(clave(a, b))).toBe(true);
    expect(esperadas).toHaveLength(12);
  });

  it("oculta el perímetro superior del firme pero no su base z=0", () => {
    const superior: Array<[Punto, Punto]> = [
      [[-0.1, -0.1, 0.12], [2.6, -0.1, 0.12]],
      [[2.6, -0.1, 0.12], [2.6, 1.6, 0.12]],
      [[2.6, 1.6, 0.12], [-0.1, 1.6, 0.12]],
      [[-0.1, 1.6, 0.12], [-0.1, -0.1, 0.12]],
    ];
    for (const [a, b] of superior) expect(ocultas.has(clave(a, b))).toBe(true);
    const base = clave([-0.1, -0.1, 0], [2.6, -0.1, 0]);
    expect(ocultas.has(base)).toBe(false);
  });

  it("conserva el cuadrado de la corona del castillo (z=3.60)", () => {
    const corona: Array<[Punto, Punto]> = [
      [[-0.075, 1.425, 3.6], [-0.075, 1.575, 3.6]],
      [[-0.075, 1.575, 3.6], [0.075, 1.575, 3.6]],
      [[0.075, 1.575, 3.6], [0.075, 1.425, 3.6]],
      [[0.075, 1.425, 3.6], [-0.075, 1.425, 3.6]],
    ];
    for (const [a, b] of corona) expect(ocultas.has(clave(a, b))).toBe(false);
  });

  it("quita 19 aristas de silueta por castillo y conserva las verticales fuera del muro", () => {
    const castillo = porGlobalid(CASTILLO_SUR);
    const claves = new Set<string>();
    for (let i = 0; i + 2 < castillo.indices.length; i += 3) {
      for (const par of [
        [0, 1],
        [1, 2],
        [2, 0],
      ]) {
        const ia = castillo.indices[i + par[0]] * 3;
        const ib = castillo.indices[i + par[1]] * 3;
        const k = clave(
          [castillo.vertices[ia], castillo.vertices[ia + 1], castillo.vertices[ia + 2]],
          [castillo.vertices[ib], castillo.vertices[ib + 1], castillo.vertices[ib + 2]],
        );
        if (ocultas.has(k)) claves.add(k);
      }
    }
    expect(claves.size).toBe(19);
  });

  it("sin muros o sin estructura no oculta nada", () => {
    expect(aristasOcultasSobreMuro([])).toEqual(new Set());
    const soloEstructura = elementos.filter((e) => e.categoria !== "muros");
    expect(aristasOcultasSobreMuro(soloEstructura)).toEqual(new Set());
    const soloMuros = elementos.filter((e) => e.categoria === "muros");
    expect(aristasOcultasSobreMuro(soloMuros)).toEqual(new Set());
  });
});
