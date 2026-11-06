// O049: candidatos 3D a mano. Un cubo de 1 m tiene 8 vértices, 12 aristas y
// 6 caras; cualquier otra cuenta es un error de deduplicación o de fusión.
import { describe, expect, it } from "vitest";
import {
  CacheCandidatosMallas,
  candidatosDeMalla,
  caraSuperiorEn,
  distanciaBBoxPantalla,
  filtrarPorCercania,
  type MallaCandidata,
} from "./candidatos3d";
import type { Vec3 } from "./inferencias3d";

// Vértices del cubo unitario en el origen.
const VERTICES = [
  0, 0, 0,
  1, 0, 0,
  1, 1, 0,
  0, 1, 0,
  0, 0, 1,
  1, 0, 1,
  1, 1, 1,
  0, 1, 1,
];

// 12 triángulos (2 por cara), calculados a mano.
const INDICES = [
  0, 2, 1, 0, 3, 2, // z = 0
  4, 5, 6, 4, 6, 7, // z = 1
  0, 1, 5, 0, 5, 4, // y = 0
  1, 2, 6, 1, 6, 5, // x = 1
  2, 3, 7, 2, 7, 6, // y = 1
  3, 0, 4, 3, 4, 7, // x = 0
];

function cubo(desplazamientoX = 0): MallaCandidata {
  const vertices = VERTICES.map((valor, i) =>
    i % 3 === 0 ? valor + desplazamientoX : valor,
  );
  return { globalid: `cubo-${desplazamientoX}`, vertices, indices: INDICES };
}

const proyectarPlano = (p: Vec3) => ({ x: p.x, y: p.y });

describe("O049 candidatos desde mallas", () => {
  it("un cubo de 1 m da 8 vértices, 12 aristas y 6 caras con sus normales", () => {
    const candidatos = candidatosDeMalla(cubo());
    expect(candidatos.vertices).toHaveLength(8);
    expect(candidatos.aristas).toHaveLength(12);
    expect(candidatos.caras).toHaveLength(6);

    const normales = candidatos.caras
      .map((cara) => cara.normal!)
      .map((n) => [Math.round(n.x), Math.round(n.y), Math.round(n.z)].join(","))
      .sort();
    expect(normales).toEqual([
      "-1,0,0",
      "0,-1,0",
      "0,0,-1",
      "0,0,1",
      "0,1,0",
      "1,0,0",
    ]);
  });

  it("la cara superior mira a +Z y su polígono mide 1 m²", () => {
    const candidatos = candidatosDeMalla(cubo());
    const superior = candidatos.caras.find((cara) => cara.normal!.z > 0.999);
    expect(superior).toBeDefined();
    const poligono = superior!.poligono;
    expect(poligono).toHaveLength(4);
    for (const p of poligono) expect(p.z).toBeCloseTo(1, 9);
    // Área por Gauss en el plano XY: 1 × 1 = 1 m².
    let doble = 0;
    for (let i = 0; i < poligono.length; i += 1) {
      const a = poligono[i];
      const b = poligono[(i + 1) % poligono.length];
      doble += a.x * b.y - b.x * a.y;
    }
    expect(Math.abs(doble) / 2).toBeCloseTo(1, 9);
  });

  it("caraSuperiorEn reconoce un punto del borde de la tapa y rechaza el borde inferior", () => {
    const candidatos = candidatosDeMalla(cubo());
    const tapa = caraSuperiorEn({ x: 0, y: 0, z: 1 }, candidatos.caras);
    expect(tapa).not.toBeNull();
    expect(tapa!.normal!.z).toBeCloseTo(1, 9);
    expect(caraSuperiorEn({ x: 0, y: 0, z: 0 }, candidatos.caras)).toBeNull();
  });

  it("el filtro de 60 px deja solo las mallas cercanas al cursor", () => {
    const cerca = candidatosDeMalla(cubo(0));
    const medio = candidatosDeMalla(cubo(50));
    const lejos = candidatosDeMalla(cubo(100));
    const cursor = { x: 0, y: 0 };
    expect(distanciaBBoxPantalla(cerca.envolvente, proyectarPlano, cursor)).toBe(0);
    expect(distanciaBBoxPantalla(lejos.envolvente, proyectarPlano, cursor)).toBe(100);
    const filtradas = filtrarPorCercania([cerca, medio, lejos], proyectarPlano, cursor, 60);
    expect(filtradas).toHaveLength(2);
    expect(filtradas.includes(cerca)).toBe(true);
    expect(filtradas.includes(medio)).toBe(true);
    expect(filtradas.includes(lejos)).toBe(false);
  });

  it("el caché se reutiliza con la misma revisión y se invalida al cambiar el modelo", () => {
    const cache = new CacheCandidatosMallas();
    const malla: MallaCandidata = {
      globalid: "a",
      vertices: [...VERTICES],
      indices: INDICES,
    };
    const revision1 = { modelo: 1 };
    const primera = cache.obtener(malla, revision1);
    expect(cache.obtener(malla, revision1)).toBe(primera);
    expect(cache.tamano).toBe(1);

    // Con la misma revisión no se recalcula aunque la malla haya cambiado: así se
    // comporta el visor entre movimientos del ratón.
    for (let i = 0; i < malla.vertices.length; i += 3) malla.vertices[i] += 5;
    expect(cache.obtener(malla, revision1)).toBe(primera);
    expect(primera.envolvente.min.x).toBe(0);

    // Una revisión nueva obliga a recalcular con la geometría vigente.
    const revision2 = { modelo: 2 };
    const segunda = cache.obtener(malla, revision2);
    expect(segunda).not.toBe(primera);
    expect(segunda.envolvente.min.x).toBe(5);
  });
});
