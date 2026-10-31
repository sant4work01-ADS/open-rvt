// O029: pruebas de la herramienta «Nivel». Los valores salen de la spec: paso de
// enganche 0.05 m, tolerancia de duplicado ±1 mm y nombres entre «Nivel 1» (0.00)
// y «Nivel 2» (3.00).
import { describe, expect, test } from "vitest";
import {
  cotasTemporalesNivel,
  elevacionDesdeCota,
  engancheElevacionNivel,
  nivelEnElevacion,
  nombreNivelAutomatico,
  type NivelRef,
} from "./niveles";

const niveles: NivelRef[] = [
  { globalid: "n1", nombre: "Nivel 1", elevacion: 0.0 },
  { globalid: "n2", nombre: "Nivel 2", elevacion: 3.0 },
];

describe("O029 nombre automático del nivel", () => {
  test("entre Nivel 1 (0.00) y Nivel 2 (3.00) a 1.50 se llama «Nivel 1.5»", () => {
    expect(nombreNivelAutomatico(niveles, 1.5)).toBe("Nivel 1.5");
  });

  test("encima del último sigue la numeración: 6.00 → «Nivel 3»", () => {
    expect(nombreNivelAutomatico(niveles, 3.0)).toBe("Nivel 3");
    expect(nombreNivelAutomatico(niveles, 6.0)).toBe("Nivel 3");
  });

  test("con 1.5 ya ocupado, a 1.00 toma el hueco libre: 1.25", () => {
    const conMedio: NivelRef[] = [
      { globalid: "n1", nombre: "Nivel 1", elevacion: 0.0 },
      { globalid: "n15", nombre: "Nivel 1.5", elevacion: 1.5 },
      { globalid: "n2", nombre: "Nivel 2", elevacion: 3.0 },
    ];
    expect(nombreNivelAutomatico(conMedio, 1.0)).toBe("Nivel 1.25");
  });

  test("sin nombres numerados usa el número de niveles", () => {
    const otros: NivelRef[] = [
      { globalid: "a", nombre: "Desplante", elevacion: -1.2 },
      { globalid: "b", nombre: "Azotea", elevacion: 6.0 },
    ];
    expect(nombreNivelAutomatico(otros, 0)).toBe("Nivel 2");
  });
});

describe("O029 enganche de elevación", () => {
  test("un nivel existente gana dentro de 3 mm", () => {
    expect(engancheElevacionNivel(1.499, [0, 1.5, 3])).toBe(1.5);
    expect(engancheElevacionNivel(1.502, [0, 1.5, 3])).toBe(1.5);
  });

  test("una cara horizontal de losa gana dentro de 3 mm", () => {
    expect(engancheElevacionNivel(2.897, [0, 2.9, 3])).toBe(2.9);
  });

  test("sin candidato cercano redondea a la cuadrícula de 5 cm", () => {
    expect(engancheElevacionNivel(1.523, [0, 3])).toBe(1.5);
    expect(engancheElevacionNivel(1.526, [0, 3])).toBe(1.55);
    expect(engancheElevacionNivel(-0.137, [])).toBe(-0.15);
  });
});

describe("O029 cotas temporales", () => {
  test("a 1.50 m: 1.50 sobre Nivel 1 y 1.50 hasta Nivel 2", () => {
    const cotas = cotasTemporalesNivel(1.5, niveles);
    expect(cotas.inferior?.nombre).toBe("Nivel 1");
    expect(cotas.superior?.nombre).toBe("Nivel 2");
    expect(cotas.desfaseInferior).toBeCloseTo(1.5, 6);
    expect(cotas.desfaseSuperior).toBeCloseTo(1.5, 6);
  });

  test("debajo del primero no hay inferior; encima del último no hay superior", () => {
    expect(cotasTemporalesNivel(-1, niveles).inferior).toBeNull();
    expect(cotasTemporalesNivel(4, niveles).superior).toBeNull();
  });

  test("la cota tecleada es relativa al nivel inferior: 0.50 sobre Nivel 1 = 0.50", () => {
    const cotas = cotasTemporalesNivel(0.5, niveles);
    expect(elevacionDesdeCota(cotas.inferior, "0.50")).toBe(0.5);
    expect(elevacionDesdeCota(cotas.inferior, "0,75")).toBe(0.75);
    expect(elevacionDesdeCota(cotas.inferior, "")).toBeNull();
    expect(elevacionDesdeCota(cotas.inferior, "abc")).toBeNull();
  });
});

describe("O029 validación de duplicados (±1 mm)", () => {
  test("1.50 no choca con 0.00 ni con 3.00", () => {
    expect(nivelEnElevacion(niveles, 1.5)).toBeNull();
  });

  test("3.001 y 2.999 chocan con Nivel 2 (3.000) y no se crean", () => {
    expect(nivelEnElevacion(niveles, 3.001)?.nombre).toBe("Nivel 2");
    expect(nivelEnElevacion(niveles, 2.999)?.nombre).toBe("Nivel 2");
  });

  test("3.002 ya no choca: la tolerancia es 1 mm exacto", () => {
    expect(nivelEnElevacion(niveles, 3.002)).toBeNull();
  });

  test("al editar, el propio nivel no se considera duplicado", () => {
    expect(nivelEnElevacion(niveles, 0.0, "n1")).toBeNull();
  });
});
