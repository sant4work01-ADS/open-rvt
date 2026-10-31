import { describe, expect, it } from "vitest";
import { estilosPorDefecto, estiloCotaPorDefecto } from "./estilos";
import {
  calcularLayoutAlzado,
  segmentosTrazoPunto,
  sumaCadena,
  textoNivel,
  type CajaAnotacion,
  type LayoutAlzado,
} from "./anotacionVista";

const NIVELES = [
  { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
  { globalid: "n1", nombre: "Nivel 1", elevacion: 0.5 },
  { globalid: "n2", nombre: "Nivel 2", elevacion: 1.5 },
  { globalid: "n3", nombre: "Nivel 3", elevacion: 2 },
  { globalid: "n4", nombre: "Nivel 4", elevacion: 2.2 },
];
const EJES = [
  { globalid: "e1", etiqueta: "1", s: 0 },
  { globalid: "e2", etiqueta: "2", s: 4 },
  { globalid: "e3", etiqueta: "3", s: 8 },
  { globalid: "e4", etiqueta: "4", s: 12 },
];

// Escala de la referencia (el gerente: «la referencia está dibujada como a
// 1:20»). A 1:20 un mm de papel son 0.02 m de mundo.
function layout(extra: Partial<Parameters<typeof calcularLayoutAlzado>[0]> = {}): LayoutAlzado {
  const e = estilosPorDefecto();
  return calcularLayoutAlzado({
    niveles: NIVELES,
    ejes: EJES,
    estiloNivel: e.niveles,
    estiloEje: e.ejes,
    estiloCota: e.cotas.lista[0],
    escala: 20,
    tMinCaja: -2,
    tMaxCaja: 14,
    ...extra,
  });
}

const intersecta = (a: CajaAnotacion, b: CajaAnotacion) =>
  a.t0 < b.t1 - 1e-9 && a.t1 > b.t0 + 1e-9 && a.z0 < b.z1 - 1e-9 && a.z1 > b.z0 + 1e-9;

describe("O025/O031: cotas de nivel opcionales", () => {
  it("con cotas:false no quedan cadena ni total (solo cabezas)", () => {
    const e = estilosPorDefecto();
    const l = layout({ estiloNivel: { ...e.niveles, cotas: false } });
    expect(l.parciales).toEqual([]);
    expect(l.total).toBeNull();
    expect(l.cabezas).toHaveLength(NIVELES.length);
  });
});

describe("O025: colocación de niveles con el estilo por omisión", () => {
  it("escribe las cinco cabezas de la referencia, con signo y sin nombre", () => {
    const l = layout();
    expect(l.cabezas.map((c) => c.texto)).toEqual([
      "Npt 0.00m",
      "Npt +0.50m",
      "Npt +1.50m",
      "Npt +2.00m",
      "Npt +2.20m",
    ]);
  });

  it("la cadena mide 0.50, 1.00, 0.50 y 0.20, y la total 2.20", () => {
    const l = layout();
    expect(l.parciales.map((c) => c.texto)).toEqual(["0.50", "1.00", "0.50", "0.20"]);
    expect(sumaCadena(l.parciales)).toBeCloseTo(2.2, 12);
    expect(l.total?.texto).toBe("2.20");
    expect(l.total?.valor).toBeCloseTo(2.2, 12);
  });

  it("con 2.00 y 2.20 la de 2.20 sube, la de 2.00 baja y comparten columna", () => {
    const l = layout();
    // A mano: cabezas de 0.07 m de ancho y 0.049 m de alto; texto de 0.05 m;
    // umbral de codo = 0.049 + 0.05 + 6 mm(0.12) = 0.219 m > 0.20 m.
    // Separación mínima de codo 4 mm = 0.08 m: 2.00 → 1.92 y 2.20 → 2.28.
    const n200 = l.cabezas.find((c) => c.elevacion === 2)!;
    const n220 = l.cabezas.find((c) => c.elevacion === 2.2)!;
    expect(n220.z).toBeCloseTo(2.28, 9);
    expect(n200.z).toBeCloseTo(1.92, 9);
    expect(n220.desplazamiento).toBeCloseTo(0.08, 9);
    expect(n200.desplazamiento).toBeCloseTo(-0.08, 9);
    expect(n220.z).toBeGreaterThan(n220.elevacion);
    expect(n200.z).toBeLessThan(n200.elevacion);
    for (const cabeza of l.cabezas) expect(cabeza.t).toBeCloseTo(l.tCabeza, 12);
    for (const cabeza of l.cabezas) expect(cabeza.cajaTexto.t0).toBeCloseTo(l.cabezas[0].cajaTexto.t0, 12);
  });

  it("el codo y el punto solo existen en las cabezas 2.00 y 2.20", () => {
    const l = layout();
    const guias = l.lineas.filter((x) => x.tipo === "guia-nivel");
    expect(guias.map((g) => g.elevacion).sort((a, b) => (a as number) - (b as number))).toEqual([2, 2.2]);
    for (const guia of guias) {
      expect(guia.puntos).toHaveLength(2);
      expect(guia.punto).toBeDefined();
      expect(guia.puntos[0][0]).toBeCloseTo(l.tGuia, 12);
      expect(guia.puntos[0][1]).toBeCloseTo(guia.elevacion as number, 12);
      expect(guia.puntos[1][0]).toBeCloseTo(l.tCabeza, 12);
    }
    // 1.50, 0.50 y 0.00 van sin codo: su línea de nivel llega al triángulo y no
    // llevan punto.
    for (const elev of [0, 0.5, 1.5]) {
      expect(l.lineas.some((x) => x.tipo === "guia-nivel" && x.elevacion === elev)).toBe(false);
      const nivel = l.lineas.find((x) => x.tipo === "nivel" && x.elevacion === elev)!;
      expect(nivel.puntos[1][0]).toBeCloseTo(l.tCabeza, 12);
      expect(nivel.punto).toBeUndefined();
    }
  });

  it("ninguna caja de texto o símbolo se encima con otra a 1:20", () => {
    const l = layout();
    for (let i = 0; i < l.cajas.length; i += 1) {
      for (let j = i + 1; j < l.cajas.length; j += 1) {
        expect(
          intersecta(l.cajas[i], l.cajas[j]),
          `${l.cajas[i].tipo} ${l.cajas[i].texto} contra ${l.cajas[j].tipo} ${l.cajas[j].texto}`,
        ).toBe(false);
      }
    }
  });

  it("ninguna caja se encima a 1:100 (tramos de 0.20 m de 2 mm)", () => {
    const l = layout({ escala: 100 });
    for (let i = 0; i < l.cajas.length; i += 1) {
      for (let j = i + 1; j < l.cajas.length; j += 1) {
        expect(
          intersecta(l.cajas[i], l.cajas[j]),
          `${l.cajas[i].tipo} ${l.cajas[i].texto} contra ${l.cajas[j].tipo} ${l.cajas[j].texto}`,
        ).toBe(false);
      }
    }
  });

  it("ningún texto cruza una línea de nivel que no le pertenece", () => {
    const l = layout();
    for (const caja of l.cajas) {
      for (const linea of l.lineas.filter((x) => x.tipo === "nivel")) {
        const [ta, tb] = [linea.puntos[0][0], linea.puntos[1][0]];
        const cruzaT = caja.t0 < Math.max(ta, tb) && caja.t1 > Math.min(ta, tb);
        const cruzaZ =
          caja.z0 < (linea.elevacion as number) - 1e-9 &&
          caja.z1 > (linea.elevacion as number) + 1e-9;
        expect(
          cruzaT && cruzaZ,
          `${caja.tipo} ${caja.texto} cruza el nivel ${linea.elevacion}`,
        ).toBe(false);
      }
    }
  });

  it("la cadena y la total van en filas separadas, texto a la izquierda", () => {
    const l = layout();
    // A mano: total = 0.11 m de ancho; fila = max(7 mm = 0.14, 0.11 + 0.04 + 0.02)
    // = 0.17 m; cadena a 0.15 m del fin de la línea de nivel.
    expect(l.tFin).toBeCloseTo(12.24, 9);
    expect(l.tCadena).toBeCloseTo(12.39, 9);
    expect(l.tTotal - l.tCadena).toBeCloseTo(0.17, 9);
    expect(l.tFin).toBeLessThan(l.tCadena);
    expect(l.tCadena).toBeLessThan(l.tTotal);
    expect(l.tTotal).toBeLessThan(l.tCabeza);
    const total = l.total!;
    expect(total.cajaTexto.t1).toBeCloseTo(l.tTotal - 0.02, 9);
    expect(total.cajaTexto.t0).toBeGreaterThan(l.tCadena + 0.02);
    expect(total.cajaTexto.centro[1]).toBeCloseTo(1.1, 9);
    for (const parcial of l.parciales) {
      expect(parcial.cajaTexto.t1).toBeCloseTo(l.tCadena - 0.02, 9);
      expect(parcial.cajaTexto.centro[1]).toBeCloseTo((parcial.desde + parcial.hasta) / 2, 9);
    }
  });

  it("en tramos chicos (0.20) los remates van por fuera y en 0.50 por dentro", () => {
    const l = layout();
    const chico = l.parciales[3];
    expect(chico.fuera).toBe(true);
    expect(chico.remates).toEqual([
      { t: l.tCadena, z: 2, hacia: "arriba", fuera: true },
      { t: l.tCadena, z: 2.2, hacia: "abajo", fuera: true },
    ]);
    expect(l.parciales[0].fuera).toBe(false);
    expect(l.parciales[0].remates.every((r) => !r.fuera)).toBe(true);
  });

  it("el trazo-punto alterna trazo largo y punto corto a 1:20 y 1:100", () => {
    const tramos = segmentosTrazoPunto(
      [
        [0, 0],
        [1, 0],
      ],
      20,
    );
    // A 1:20: trazo 6 mm = 0.12 m, punto 0.5 mm = 0.01 m.
    expect(tramos[0]).toEqual([
      [0, 0],
      [0.12, 0],
    ]);
    const puntos = tramos.filter(([a, b]) => Math.abs(b[0] - a[0] - 0.01) < 1e-9);
    expect(puntos.length).toBeGreaterThanOrEqual(2);
    // A 1:100 el mismo papel mide 0.60 m y 0.05 m.
    const grande = segmentosTrazoPunto(
      [
        [0, 0],
        [1, 0],
      ],
      100,
    );
    expect(grande[0]).toEqual([
      [0, 0],
      [0.6, 0],
    ]);
  });

  it("el globo más bajo queda a 10 mm sobre el último nivel", () => {
    const l = layout();
    // A 1:20: 10 mm = 0.20 m y radio 4 mm = 0.08 m.
    expect(l.zGloboInferior).toBeCloseTo(2.4, 9);
    expect(l.globos[0].z - l.globos[0].radio).toBeCloseTo(2.4, 9);
    expect(l.globos[0].radio).toBeCloseTo(0.08, 9);
  });

  it("la sobrescritura por vista mueve el globo a 20 mm", () => {
    const l = layout({ separacionGlobosMm: 20 });
    expect(l.zGloboInferior).toBeCloseTo(2.6, 9);
  });

  it("a 1:20 el triángulo mide 3.5 mm de ancho y 2.45 mm de alto", () => {
    const l = layout();
    const cabeza = l.cabezas[0];
    expect(cabeza.poligono[1][0] - cabeza.poligono[2][0]).toBeCloseTo(0.07, 9);
    expect(cabeza.poligono[1][1] - cabeza.poligono[0][1]).toBeCloseTo(0.049, 9);
    expect(cabeza.poligono[0][0]).toBeGreaterThanOrEqual(l.tFin);
    expect(cabeza.cajaTexto.t0).toBeGreaterThan(l.tCabeza);
    expect(l.tFinAnotacion).toBeGreaterThan(l.cabezas[0].cajaTexto.t1);
  });
});

describe("O024/O025: entradas raras y bordes", () => {
  it("sin niveles no hay cotas ni cabezas, pero los ejes siguen", () => {
    const l = layout({ niveles: [] });
    expect(l.cabezas).toHaveLength(0);
    expect(l.parciales).toHaveLength(0);
    expect(l.total).toBeNull();
    expect(l.globos).toHaveLength(4);
  });

  it("un solo nivel no inventa total", () => {
    const l = layout({ niveles: [NIVELES[0]] });
    expect(l.parciales).toHaveLength(0);
    expect(l.total).toBeNull();
    expect(l.cabezas[0].texto).toBe("Npt 0.00m");
    expect(l.lineas.some((x) => x.tipo === "guia-nivel")).toBe(false);
  });

  it("acepta niveles negativos y suma la total con el signo correcto", () => {
    const l = layout({
      niveles: [
        { globalid: "s", nombre: "Sótano", elevacion: -2 },
        { globalid: "p", nombre: "Planta", elevacion: 0 },
      ],
    });
    expect(l.cabezas.map((c) => c.texto)).toEqual(["Npt -2.00m", "Npt 0.00m"]);
    expect(l.total?.texto).toBe("2.00");
  });

  it("un desplazamiento manual manda sobre el automático y dibuja su codo", () => {
    const l = layout({ ajustesNivel: { n3: 3 } });
    expect(l.cabezas[3].z).toBe(3);
    expect(l.cabezas[3].desplazamiento).toBe(1);
    expect(l.lineas.some((x) => x.tipo === "guia-nivel" && x.elevacion === 2)).toBe(true);
  });

  it("el signo se puede apagar sin perder el negativo", () => {
    const e = estilosPorDefecto().niveles;
    expect(textoNivel(2.2, { ...e, signo: false })).toBe("Npt 2.20m");
    expect(textoNivel(-2.2, { ...e, signo: false })).toBe("Npt -2.20m");
  });

  it("un estilo de cota con tick cambia el remate y conserva la medida", () => {
    const cota = { ...estiloCotaPorDefecto(), remate: "tick-arquitectonico" as const };
    const l = layout({ estiloCota: cota });
    expect(l.parciales[0].valor).toBeCloseTo(0.5, 12);
    expect(l.parciales[0].remates[0].t).toBe(l.tCadena);
  });
});
