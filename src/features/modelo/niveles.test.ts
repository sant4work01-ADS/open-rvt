import { describe, expect, it } from "vitest";
import { estilosPorDefecto } from "./estilos";
import { acomodarBurbujas, acomodarCabezas, textoCabezaNivel } from "./niveles";

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

describe("O014b: acomodo de cabezas y burbujas", () => {
  it("dos niveles a 0.20 m con cabeza de 0.35 m: el de arriba sube 0.15 m", () => {
    // Cota inferior 0.00 ocupa [0.00, 0.35]; la superior arranca en 0.20 y debe
    // empezar en 0.35, así que sube exactamente 0.15 m.
    const d = acomodarCabezas(
      [
        { elev: 0, altoCabezaMundo: 0.35 },
        { elev: 0.2, altoCabezaMundo: 0.35 },
      ],
      0,
    );
    expect(d[0]).toBe(0);
    expect(d[1]).toBeCloseTo(0.15, 12);
  });

  it("a 3.00 m de separación no hay desplazamiento", () => {
    expect(
      acomodarCabezas(
        [
          { elev: 0, altoCabezaMundo: 0.35 },
          { elev: 3, altoCabezaMundo: 0.35 },
        ],
        0,
      ),
    ).toEqual([0, 0]);
  });

  it("tres niveles 0.00/0.10/0.20 no se enciman y conservan el orden", () => {
    // Calculado a mano: la segunda sube 0.25 (a 0.35) y la tercera 0.50 (a 0.70).
    // Bandas resultantes: [0.00,0.35], [0.35,0.70], [0.70,1.05].
    const desplazamientos = acomodarCabezas(
      [
        { elev: 0, altoCabezaMundo: 0.35 },
        { elev: 0.1, altoCabezaMundo: 0.35 },
        { elev: 0.2, altoCabezaMundo: 0.35 },
      ],
      0,
    );
    expect(desplazamientos[0]).toBe(0);
    expect(desplazamientos[1]).toBeCloseTo(0.25, 12);
    expect(desplazamientos[2]).toBeCloseTo(0.5, 12);
    const bandas = [0, 0.1, 0.2].map((elev, i) => [
      elev + desplazamientos[i],
      elev + desplazamientos[i] + 0.35,
    ]);
    expect(bandas[0][1]).toBeLessThanOrEqual(bandas[1][0]);
    expect(bandas[1][1]).toBeLessThanOrEqual(bandas[2][0]);
  });

  it("respeta la separación mínima pedida", () => {
    // Con 0.10 m de aire: la segunda debe empezar en 0.35 + 0.10 = 0.45; como
    // su cota es 0.20, sube exactamente 0.25 m.
    const d = acomodarCabezas(
      [
        { elev: 0, altoCabezaMundo: 0.35 },
        { elev: 0.2, altoCabezaMundo: 0.35 },
      ],
      0.1,
    );
    expect(d[0]).toBe(0);
    expect(d[1]).toBeCloseTo(0.25, 12);
  });

  it("bordes: vacío, un nivel y alturas nulas", () => {
    expect(acomodarCabezas([], 0)).toEqual([]);
    expect(acomodarCabezas([{ elev: 7, altoCabezaMundo: 0.35 }], 0)).toEqual([0]);
    expect(
      acomodarCabezas(
        [
          { elev: 0, altoCabezaMundo: 0 },
          { elev: 0, altoCabezaMundo: 0 },
        ],
        0,
      ),
    ).toEqual([0, 0]);
  });

  it("burbujas de eje a 0.30 m con diámetro 0.80 m: la derecha se corre 0.50 m", () => {
    // Bandas: [0.00,0.80] y [0.80,1.60]; la segunda se desplaza 0.80 − 0.30.
    const d = acomodarBurbujas([0, 0.3], 0.8, 0);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeCloseTo(0.5, 12);
  });

  it("burbujas separadas 2.00 m con diámetro 0.80 m no se mueven", () => {
    expect(acomodarBurbujas([0, 2], 0.8, 0)).toEqual([0, 0]);
  });
});
