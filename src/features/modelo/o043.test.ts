// O043: la planta es un corte horizontal y el cerramiento nace en el nivel de esa
// planta. Aquí se prueban la elección del muro más cercano cerca de un cruce y las
// opciones por omisión del cerramiento; el flujo completo lo cubre el E2E.
import { describe, expect, test } from "vitest";
import {
  muroBajoPunto,
  opcionesCerramientoEnVista,
  REFERENCIAS_VACIAS,
  type Referencias,
} from "./herramientas";

const refsCruce: Referencias = {
  ...REFERENCIAS_VACIAS,
  muros: [
    // El primero de la lista es la vertical; el clic está más cerca de la horizontal.
    { globalid: "vertical", x1: 4, y1: -3, x2: 4, y2: 3, espesor: 0.15, altura: 3.6 },
    { globalid: "horizontal", x1: 0, y1: 0, x2: 8, y2: 0, espesor: 0.15, altura: 3.6 },
  ],
};

describe("O043: muro bajo el clic", () => {
  test("cerca de un cruce gana el de menor distancia al eje, no el primero de la lista", () => {
    // (4.06, 0.03): a 3 cm del eje horizontal y a 6 cm del vertical.
    const bajo = muroBajoPunto(refsCruce, [4.06, 0.03]);
    expect(bajo?.muro.globalid).toBe("horizontal");
    expect(bajo?.distancia).toBeCloseTo(0.03, 9);
  });

  test("al otro lado del cruce gana la vertical aunque sea la primera de la lista", () => {
    // (4.02, 0.06): a 6 cm de la horizontal y a 2 cm de la vertical.
    const bajo = muroBajoPunto(refsCruce, [4.02, 0.06]);
    expect(bajo?.muro.globalid).toBe("vertical");
    expect(bajo?.distancia).toBeCloseTo(0.02, 9);
  });
});

describe("O043: nivel por omisión del cerramiento", () => {
  const planta = { tipo: "planta", nivel: "n22" };
  const niveles = [
    { globalid: "n0", elevacion: 0 },
    { globalid: "n22", elevacion: 2.2 },
    { globalid: "n30", elevacion: 3.0 },
  ];

  test("en la planta del nivel 2.20, nivel = N 2.20 y desfase 0", () => {
    expect(
      opcionesCerramientoEnVista(planta, { nivel: "", desfase: "" }, niveles),
    ).toEqual({ nivel: "n22", desfase: 0 });
  });

  test("el nivel o el desfase elegidos en la barra mandan sobre la planta", () => {
    expect(
      opcionesCerramientoEnVista(planta, { nivel: "n30", desfase: "-0.20" }, niveles),
    ).toEqual({ nivel: "n30", desfase: -0.2 });
    expect(
      opcionesCerramientoEnVista(planta, { nivel: "", desfase: "0,15" }, niveles),
    ).toEqual({ nivel: "n22", desfase: 0.15 });
  });

  test("la planta más baja conserva la regla de O041: no fuerza su nivel", () => {
    expect(
      opcionesCerramientoEnVista(
        { tipo: "planta", nivel: "n0" },
        { nivel: "", desfase: "" },
        niveles,
      ),
    ).toEqual({});
    expect(
      opcionesCerramientoEnVista(
        { tipo: "planta", nivel: "n0" },
        { nivel: "n30", desfase: "-0.20" },
        niveles,
      ),
    ).toEqual({ nivel: "n30", desfase: -0.2 });
  });

  test("en alzado, corte y 3D no se fuerza nivel: sigue la regla de O041", () => {
    expect(
      opcionesCerramientoEnVista(
        { tipo: "iso", nivel: "n22" },
        { nivel: "", desfase: "" },
        niveles,
      ),
    ).toEqual({});
    expect(
      opcionesCerramientoEnVista(
        { tipo: "alzado", nivel: "n22" },
        { nivel: "n30", desfase: "" },
        niveles,
      ),
    ).toEqual({});
  });
});
