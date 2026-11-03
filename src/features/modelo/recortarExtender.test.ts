// ED1: geometría pura de recortar/extender. Los valores son calculados a mano;
// no se copian de la salida del código.
import { describe, expect, it, vi } from "vitest";
import { cortarRectas, recortarRecta } from "./planta";
import { construirComandosRibbon, type AccionesRibbon } from "../ribbon/comandos";

describe("intersección de líneas (ED1)", () => {
  it("dos rectas perpendiculares se cortan en (4, 0)", () => {
    const corte = cortarRectas([0, 0, 6, 0], [4, -2, 4, 3]);
    expect(corte).not.toBeNull();
    expect(corte!.punto[0]).toBeCloseTo(4, 12);
    expect(corte!.punto[1]).toBeCloseTo(0, 12);
    expect(corte!.t).toBeCloseTo(4 / 6, 12);
    // La segunda recta va de y=-2 a y=3: el corte cae en la mitad.
    expect(corte!.s).toBeCloseTo(2 / 5, 12);
  });

  it("las rectas paralelas no tienen corte", () => {
    expect(cortarRectas([0, 0, 4, 0], [0, 1, 4, 1])).toBeNull();
  });

  it("casi paralelas se rechazan: 1e-7 de seno queda por debajo de 1e-6", () => {
    expect(cortarRectas([0, 0, 10, 0], [0, 1, 10, 1 + 1e-6])).toBeNull();
  });

  it("una línea degenerada no tiene corte", () => {
    expect(cortarRectas([2, 2, 2, 2], [0, 0, 4, 0])).toBeNull();
  });
});

describe("lado que se conserva (ED1)", () => {
  it("clic en (1,0) conserva el inicio: (0,0)-(6,0) queda (0,0)-(4,0)", () => {
    const r = recortarRecta([0, 0, 6, 0], [4, 0], [1, 0]);
    expect(r).toMatchObject({ x1: 0, y1: 0, x2: 4, y2: 0, conservado: "inicio" });
  });

  it("clic en (5,0) conserva el final: (0,0)-(6,0) queda (4,0)-(6,0)", () => {
    const r = recortarRecta([0, 0, 6, 0], [4, 0], [5, 0]);
    expect(r).toMatchObject({ x1: 4, y1: 0, x2: 6, y2: 0, conservado: "fin" });
  });

  it("extiende (0,0)-(2,0) hasta (5,0) conservando el clic en (1,0)", () => {
    const r = recortarRecta([0, 0, 2, 0], [5, 0], [1, 0]);
    expect(r).toMatchObject({ x1: 0, y1: 0, x2: 5, y2: 0 });
  });

  it("si el corte queda detrás del inicio, conserva el segmento que contiene el clic", () => {
    // Línea de 0 a 2, corte en x=-1, clic en x=1: el resultado válido es (-1,0)-(2,0).
    const r = recortarRecta([0, 0, 2, 0], [-1, 0], [1, 0]);
    expect(r).toMatchObject({ x1: -1, y1: 0, x2: 2, y2: 0, conservado: "fin" });
  });

  it("un corte que anula la longitud no produce recorte", () => {
    expect(recortarRecta([0, 0, 4, 0], [0, 0], [0, 0])).toBeNull();
  });
});

describe("atajo TR (ED1)", () => {
  it("«Recortar/Extender» está en Modificar con atajo TR y activa la herramienta", () => {
    const activar = vi.fn();
    const acciones = { herramientaActiva: null, herramientaRecortarExtender: activar };
    const comandos = construirComandosRibbon(acciones as unknown as AccionesRibbon);
    const comando = comandos.find((c) => c.id === "recortar-extender");
    expect(comando?.texto).toBe("Recortar/Extender");
    expect(comando?.grupo).toBe("Modificar");
    expect(comando?.atajo).toBe("TR");
    comando?.accion?.();
    expect(activar).toHaveBeenCalledTimes(1);
  });
});
