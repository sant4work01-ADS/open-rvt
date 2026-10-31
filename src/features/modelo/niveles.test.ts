import { describe, expect, it } from "vitest";
import { estilosPorDefecto } from "./estilos";
import { textoCabezaNivel } from "./niveles";

const estilo = () => estilosPorDefecto().niveles;

describe("textoCabezaNivel", () => {
  it("usa prefijo, signo, dos decimales y unidad", () => {
    expect(textoCabezaNivel(2.2, estilo())).toBe("Npt +2.20m");
  });

  it("no pone signo en el cero", () => {
    expect(textoCabezaNivel(0, estilo())).toBe("Npt 0.00m");
    // -0.000001 redondea a 0.00: nunca debe salir «-0.00».
    expect(textoCabezaNivel(-0.000001, estilo())).toBe("Npt 0.00m");
  });

  it("marca los negativos", () => {
    expect(textoCabezaNivel(-1.5, estilo())).toBe("Npt -1.50m");
  });

  it("respeta decimales y unidad del estilo", () => {
    const e = { ...estilo(), decimales: 3 as const, unidad: "" };
    expect(textoCabezaNivel(2.2, e)).toBe("Npt +2.200");
  });

  it("omite el espacio cuando el prefijo está vacío", () => {
    const e = { ...estilo(), prefijo: "" };
    expect(textoCabezaNivel(2.2, e)).toBe("+2.20m");
  });
});
