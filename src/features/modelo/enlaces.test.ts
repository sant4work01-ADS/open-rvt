// O028: el panel describe el cruce y el tramo con las etiquetas de los ejes.
import { describe, expect, it } from "vitest";
import { describirEnlace, type EnlaceEjes } from "./enlaces";
import type { EjeReferencia } from "./herramientas";

const ejes: EjeReferencia[] = [
  { globalid: "g/A", etiqueta: "A", x1: 0, y1: 0, x2: 0, y2: 10, vertical: true },
  { globalid: "g/B", etiqueta: "B", x1: 5, y1: 0, x2: 5, y2: 10, vertical: true },
  { globalid: "g/1", etiqueta: "1", x1: 0, y1: 0, x2: 5, y2: 0, vertical: false },
  { globalid: "g/2", etiqueta: "2", x1: 0, y1: 4, x2: 5, y2: 4, vertical: false },
];

describe("describirEnlace (O028)", () => {
  it("muestra el cruce y sus desfases con dos decimales", () => {
    const enlace: EnlaceEjes = {
      tipo: "cruce",
      EnlaceEjeA: "g/A",
      EnlaceEjeB: "g/1",
      EnlaceDX: 0.1,
      EnlaceDY: 0,
    };
    expect(describirEnlace(enlace, ejes)).toBe("A-1 (dx 0.10, dy 0.00)");
  });

  it("muestra el tramo con el eje guía y los cruces inicial y final", () => {
    const enlace: EnlaceEjes = {
      tipo: "tramo",
      EnlaceEjeGuia: "g/2",
      EnlaceEjeInicio: "g/A",
      EnlaceEjeFin: "g/B",
    };
    expect(describirEnlace(enlace, ejes)).toBe("eje 2, de A a B");
  });

  it("si el eje ya no existe deja el GlobalId en vez de mentir", () => {
    const enlace: EnlaceEjes = {
      tipo: "cruce",
      EnlaceEjeA: "g/PERDIDO",
      EnlaceEjeB: "g/1",
      EnlaceDX: 0,
      EnlaceDY: 0,
    };
    expect(describirEnlace(enlace, ejes)).toBe("g/PERDIDO-1 (dx 0.00, dy 0.00)");
  });
});
