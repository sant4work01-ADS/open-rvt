// O020: reglas de órbita con touchpad. Los valores esperados salen de la spec:
// botón derecho orbita en 3D, Shift + izquierdo orbita, «Orbitar» convierte el
// izquierdo en órbita, el medio queda igual y en 2D no se orbita nunca.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accionArrastre,
  accionRuedaConShift,
  guardarModoOrbitar,
  leerModoOrbitar,
} from "./orbita";

const base = { shift: false, espacio: false, modoOrbitar: false, es3d: true };

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("O020: accionArrastre en 3D", () => {
  it("el botón derecho orbita siempre, con o sin Shift", () => {
    expect(accionArrastre({ ...base, boton: 2 })).toBe("orbitar");
    expect(accionArrastre({ ...base, boton: 2, shift: true })).toBe("orbitar");
    expect(accionArrastre({ ...base, boton: 2, modoOrbitar: true })).toBe("orbitar");
  });

  it("Shift + arrastre izquierdo orbita aunque haya otra opción activa", () => {
    expect(accionArrastre({ ...base, boton: 0, shift: true })).toBe("orbitar");
    expect(
      accionArrastre({ ...base, boton: 0, shift: true, espacio: true, modoOrbitar: true }),
    ).toBe("orbitar");
  });

  it("con «Orbitar» activo el izquierdo orbita; apagado selecciona", () => {
    expect(accionArrastre({ ...base, boton: 0, modoOrbitar: true })).toBe("orbitar");
    expect(accionArrastre({ ...base, boton: 0 })).toBe("seleccionar");
  });

  it("espacio + izquierdo sigue paneando y gana sobre «Orbitar»", () => {
    expect(accionArrastre({ ...base, boton: 0, espacio: true })).toBe("panear");
    expect(accionArrastre({ ...base, boton: 0, espacio: true, modoOrbitar: true })).toBe(
      "panear",
    );
  });

  it("el botón medio queda igual: orbita y con Shift panea", () => {
    expect(accionArrastre({ ...base, boton: 1 })).toBe("orbitar");
    expect(accionArrastre({ ...base, boton: 1, shift: true })).toBe("panear");
  });
});

describe("O020: en planta/alzado/corte ninguna puerta orbita", () => {
  it("cualquier botón y modificador devuelve panear o seleccionar", () => {
    for (const boton of [0, 1, 2, 3]) {
      for (const shift of [false, true]) {
        for (const espacio of [false, true]) {
          for (const modoOrbitar of [false, true]) {
            const accion = accionArrastre({
              boton,
              shift,
              espacio,
              modoOrbitar,
              es3d: false,
            });
            expect(accion).not.toBe("orbitar");
          }
        }
      }
    }
  });

  it("solo el botón medio panea; el resto selecciona", () => {
    expect(accionArrastre({ ...base, boton: 1, es3d: false })).toBe("panear");
    expect(accionArrastre({ ...base, boton: 0, es3d: false, shift: true })).toBe("seleccionar");
    expect(accionArrastre({ ...base, boton: 2, es3d: false })).toBe("seleccionar");
  });
});

describe("O020: Shift + rueda decide órbita u paneo horizontal", () => {
  it("orbita en 3D y panea en planta", () => {
    expect(accionRuedaConShift(true)).toBe("orbitar");
    expect(accionRuedaConShift(false)).toBe("paneo-horizontal");
  });
});

describe("O020: el conmutador «Orbitar» se recuerda en localStorage", () => {
  it("por defecto está apagado", () => {
    expect(leerModoOrbitar()).toBe(false);
  });

  it("guarda y recupera el valor exacto", () => {
    guardarModoOrbitar(true);
    expect(localStorage.getItem("openrvt.orbitar")).toBe("1");
    expect(leerModoOrbitar()).toBe(true);
    guardarModoOrbitar(false);
    expect(localStorage.getItem("openrvt.orbitar")).toBe("0");
    expect(leerModoOrbitar()).toBe(false);
  });

  it("un valor ajeno se interpreta como apagado", () => {
    localStorage.setItem("openrvt.orbitar", "sí");
    expect(leerModoOrbitar()).toBe(false);
  });

  it("si localStorage falla, no rompe y queda apagado", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("sin almacenamiento");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("sin almacenamiento");
    });
    expect(leerModoOrbitar()).toBe(false);
    expect(() => guardarModoOrbitar(true)).not.toThrow();
  });
});
