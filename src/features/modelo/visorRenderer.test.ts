import { describe, expect, it, vi } from "vitest";

const { instancias } = vi.hoisted(() => ({
  instancias: [] as Record<string, unknown>[],
}));

vi.mock("three", () => {
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    localClippingEnabled = false;
    opciones: Record<string, unknown>;
    pixelRatio = 1;
    fondo: unknown;
    constructor(opciones: Record<string, unknown>) {
      this.opciones = opciones;
      instancias.push(this as unknown as Record<string, unknown>);
    }
    setPixelRatio(valor: number) {
      this.pixelRatio = valor;
    }
    setClearColor(fondo: unknown, alfa: number) {
      this.fondo = { fondo, alfa };
    }
  }
  return { WebGLRenderer };
});

import { crearRendererVisor } from "./visorRenderer";

describe("crearRendererVisor", () => {
  it("activa la profundidad logarítmica y deja el canvas en el nodo", () => {
    const nodo = document.createElement("div");
    const fondo = { color: "fondo" };
    const renderer = crearRendererVisor(nodo, fondo as never);

    expect(instancias[0].opciones).toMatchObject({
      antialias: true,
      alpha: false,
      stencil: true,
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true,
    });
    expect(renderer.localClippingEnabled).toBe(true);
    expect(instancias).toHaveLength(1);
    expect(instancias[0].pixelRatio).toBe(
      Math.min(window.devicePixelRatio || 1, 2),
    );
    expect(instancias[0].fondo).toEqual({ fondo, alfa: 1 });
    expect(nodo.firstChild).toBe(renderer.domElement);
    expect(renderer.domElement.dataset.testid).toBe("visor-canvas");
  });
});
