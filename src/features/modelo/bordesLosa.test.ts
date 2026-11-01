// O032: los valores esperados salen de la spec: desfases en metros con tres
// decimales; un desfase común se muestra tal cual y, si difiere, «Varios».
import { describe, expect, it } from "vitest";
import {
  bordesDePset,
  desfaseConSigno,
  etiquetaBorde,
  valorComunDesfase,
  type BordeLosa,
} from "./bordesLosa";

const libre = (desfase: number): BordeLosa => ({ referencia: "libre", desfase });

describe("O032: bordes de losa", () => {
  it("lee el JSON guardado y tolera datos ausentes o corruptos", () => {
    const bordes = bordesDePset({
      Bordes: JSON.stringify([
        { referencia: "muro", lado: "exterior", desfase: 0.075 },
        { referencia: "eje", lado: "eje", desfase: -0.1 },
      ]),
    });
    expect(bordes).toHaveLength(2);
    expect(bordes[0].lado).toBe("exterior");
    expect(bordesDePset(undefined)).toEqual([]);
    expect(bordesDePset({ Bordes: "no es json" })).toEqual([]);
  });

  it("muestra el desfase común exacto o «Varios» si difiere", () => {
    expect(valorComunDesfase([])).toBe(0);
    expect(valorComunDesfase([libre(0.075), libre(0.075)])).toBe(0.075);
    expect(valorComunDesfase([libre(0.1), libre(0)])).toBe("Varios");
    // Negativos y cero también cuentan como valores reales.
    expect(valorComunDesfase([libre(-0.05), libre(-0.05)])).toBe(-0.05);
  });

  it("describe cada lado con su referencia y su desfase firmado", () => {
    const muro: BordeLosa = { referencia: "muro", lado: "exterior", desfase: 0.075 };
    const eje: BordeLosa = { referencia: "eje", lado: "eje", desfase: -0.125 };
    expect(etiquetaBorde(0, muro)).toBe("Lado 1: muro · Paño exterior");
    expect(etiquetaBorde(2, eje)).toBe("Lado 3: eje · Eje");
    expect(etiquetaBorde(1, libre(0))).toBe("Lado 2: libre");
    expect(desfaseConSigno(muro)).toBe("+0.075 m");
    expect(desfaseConSigno(eje)).toBe("-0.125 m");
    expect(desfaseConSigno(libre(0))).toBe("0.000 m");
  });
});
