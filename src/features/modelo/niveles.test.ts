import { describe, expect, it } from "vitest";
import { estilosPorDefecto } from "./estilos";
import {
  acomodarBurbujas,
  acomodarCabezas,
  altoBandaCabeza,
  desfaseInferiorCabeza,
  textoCabezaNivel,
} from "./niveles";

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

describe("O014b: alto real de la banda de la cabeza", () => {
  it("suma texto, separación, nombre y margen con las medidas de dibujo", () => {
    // A 1:100 los tamaños son 2.5 mm, 1.5 mm, 2 mm y 1 mm de papel:
    // 0.25 + 0.15 + 0.20 + 0.10 = 0.70 m de banda.
    expect(
      altoBandaCabeza({
        altoTexto: 0.25,
        altoNombre: 0.2,
        mostrarNombre: true,
        separacion: 0.15,
        margen: 0.1,
      }),
    ).toBeCloseTo(0.7, 12);
  });

  it("sin nombre no suma su alto", () => {
    expect(
      altoBandaCabeza({
        altoTexto: 0.25,
        altoNombre: 0.2,
        mostrarNombre: false,
        separacion: 0.15,
        margen: 0.1,
      }),
    ).toBeCloseTo(0.5, 12);
  });

  it("el nombre baja la banda 1.9 veces su alto y sin nombre no baja", () => {
    // Centro a 1.4 altos por debajo de la línea + medio alto del glifo.
    expect(desfaseInferiorCabeza(0.2, true)).toBeCloseTo(-0.38, 12);
    expect(desfaseInferiorCabeza(0.2, false)).toBe(0);
  });

  it("con la banda real, 0.20 m de separación deja 0.065 m de aire", () => {
    // Cálculo a mano: banda 0.70 m, borde inferior a −0.38 m. El nivel 2.20
    // sube 0.70 − 0.20 = 0.50 m; su nombre acaba en 2.20 + 0.50 − 0.38 = 2.32.
    // El texto de 2.00 acaba en 2.00 + 2.6/2/2 + 2.5/2/2 = 2.255 m.
    // Aire = 2.32 − 2.255 = 0.065 m > 0, sin intersección.
    const alto = altoBandaCabeza({
      altoTexto: 0.25,
      altoNombre: 0.2,
      mostrarNombre: true,
      separacion: 0.15,
      margen: 0.1,
    });
    const desfase = desfaseInferiorCabeza(0.2, true);
    const d = acomodarCabezas(
      [
        { elev: 0 + desfase, altoCabezaMundo: alto },
        { elev: 0.2 + desfase, altoCabezaMundo: alto },
      ],
      0,
    );
    expect(d[0]).toBe(0);
    expect(d[1]).toBeCloseTo(0.5, 12);
    const finNombreSuperior = 0.2 + d[1] + desfase;
    const finTextoInferior = 0 + 0.26 / 2 + 0.25 / 2;
    expect(finNombreSuperior).toBeGreaterThan(finTextoInferior);
    expect(finNombreSuperior - finTextoInferior).toBeCloseTo(0.065, 12);
  });

  it("tres niveles 0.00/0.10/0.20 con la banda real no se enciman", () => {
    // Bandas: la segunda sube 0.60 (a 0.70) y la tercera 1.20 (a 1.40).
    const alto = altoBandaCabeza({
      altoTexto: 0.25,
      altoNombre: 0.2,
      mostrarNombre: true,
      separacion: 0.15,
      margen: 0.1,
    });
    const desfase = desfaseInferiorCabeza(0.2, true);
    const elevaciones = [0, 0.1, 0.2];
    const d = acomodarCabezas(
      elevaciones.map((elev) => ({ elev: elev + desfase, altoCabezaMundo: alto })),
      0,
    );
    expect(d[1]).toBeCloseTo(0.6, 12);
    expect(d[2]).toBeCloseTo(1.2, 12);
    for (let i = 1; i < 3; i += 1) {
      const techoAnterior = elevaciones[i - 1] + d[i - 1] + desfase + alto;
      const baseActual = elevaciones[i] + d[i] + desfase;
      expect(baseActual).toBeGreaterThanOrEqual(techoAnterior - 1e-12);
    }
  });
});
