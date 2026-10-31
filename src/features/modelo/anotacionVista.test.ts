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

function layout(extra: Partial<Parameters<typeof calcularLayoutAlzado>[0]> = {}): LayoutAlzado {
  const e = estilosPorDefecto();
  return calcularLayoutAlzado({
    niveles: NIVELES,
    ejes: EJES,
    estiloNivel: e.niveles,
    estiloEje: e.ejes,
    estiloCota: e.cotas.lista[0],
    escala: 100,
    tMinCaja: -2,
    tMaxCaja: 14,
    ...extra,
  });
}

const intersecta = (a: CajaAnotacion, b: CajaAnotacion) =>
  a.t0 < b.t1 - 1e-9 && a.t1 > b.t0 + 1e-9 && a.z0 < b.z1 - 1e-9 && a.z1 > b.z0 + 1e-9;

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

  it("las cabezas 2.00 y 2.20 se separan con codo: una baja y otra sube", () => {
    const l = layout();
    // A mano: banda 2.5 mm (texto) + aire 2 mm = 4.5 mm = 0.45 m de separación
    // mínima. El grupo 1.50/2.00/2.20 necesita 0.90 m y mide 0.70 m: el solver
    // simétrico deja 1.45, 1.90 y 2.35, con huecos de 4.5 mm.
    const baja = l.cabezas[3];
    const sube = l.cabezas[4];
    expect(baja.z).toBeCloseTo(1.9, 9);
    expect(sube.z).toBeCloseTo(2.35, 9);
    expect(baja.desplazamiento).toBeCloseTo(-0.1, 9);
    expect(sube.desplazamiento).toBeCloseTo(0.15, 9);
    expect(l.lineas.some((x) => x.tipo === "guia-nivel")).toBe(true);
  });

  it("el triángulo relleno queda a la derecha y el texto a su derecha", () => {
    const l = layout();
    for (const cabeza of l.cabezas) {
      expect(Math.min(...cabeza.poligono.map((p) => p[0]))).toBeGreaterThanOrEqual(l.tFin - 1e-9);
      expect(cabeza.cajaTexto.t0).toBeGreaterThan(l.tFin);
      expect(cabeza.cajaTexto.centro[0]).toBeGreaterThan(cabeza.t);
    }
  });

  it("ninguna caja de texto o símbolo se encima con otra", () => {
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

  it("ningún texto cruza una línea de nivel que no le pertenece", () => {
    const l = layout();
    // Solo cuentan las líneas de nivel dibujadas: terminan donde empieza la
    // anotación, así que un texto lejano a la derecha no puede cruzarlas.
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

  it("las cabezas van en una sola columna; 2.20 sube y 2.00 baja con codo", () => {
    const l = layout();
    const xs = l.cabezas.map((c) => c.t);
    for (const x of xs) expect(x).toBeCloseTo(xs[0], 12);
    const textos = l.cabezas.map((c) => c.cajaTexto.t0);
    for (const x of textos) expect(x).toBeCloseTo(textos[0], 12);
    const n200 = l.cabezas.find((c) => c.elevacion === 2)!;
    const n220 = l.cabezas.find((c) => c.elevacion === 2.2)!;
    expect(n220.z - n220.elevacion).toBeGreaterThan(0);
    expect(n200.z - n200.elevacion).toBeLessThan(0);
    expect(n220.z).toBeGreaterThan(n200.z);
    // 0.00 y 0.50 no se mueven; 1.50 cede 0.05 m para dejar aire a 2.00.
    expect(l.cabezas[0].z).toBeCloseTo(0, 12);
    expect(l.cabezas[1].z).toBeCloseTo(0.5, 12);
    expect(l.cabezas[2].z).toBeCloseTo(1.45, 12);
    const guia220 = l.lineas.find(
      (x) => x.tipo === "guia-nivel" && x.elevacion === 2.2,
    )!;
    expect(guia220.puntos).toHaveLength(3);
    expect(guia220.puntos[0][1]).toBeCloseTo(2.2, 12);
    expect(guia220.puntos[2][0]).toBeCloseTo(n220.t, 12);
    expect(guia220.puntos[2][1]).toBeCloseTo(n220.z, 12);
    expect((guia220.punto as [number, number])[0]).toBeCloseTo(l.tGuia, 12);
    expect((guia220.punto as [number, number])[1]).toBeCloseTo(2.2, 12);
  });

  it("la cadena y la total van antes que las cabezas y sin tocarse", () => {
    const l = layout();
    expect(l.tFin).toBeLessThan(l.tCadena);
    expect(l.tCadena).toBeLessThan(l.tTotal);
    expect(l.tTotal).toBeLessThan(l.tCabeza);
    const total = l.total!;
    // El texto de la total cabe entre la cadena y su línea, sin tocarlas.
    expect(total.cajaTexto.t0).toBeGreaterThan(l.tCadena + 1e-9);
    expect(total.cajaTexto.t1).toBeLessThan(l.tTotal - 1e-9);
    expect(l.tFinAnotacion).toBeGreaterThan(l.cabezas[0].cajaTexto.t1);
  });

  it("el trazo-punto alterna trazo largo y punto corto", () => {
    const tramos = segmentosTrazoPunto(
      [
        [0, 0],
        [2, 0],
      ],
      100,
    );
    // A 1:100: trazo 6 mm = 0.60 m, hueco 0.20 m, punto 0.5 mm = 0.05 m.
    expect(tramos[0]).toEqual([
      [0, 0],
      [0.6, 0],
    ]);
    const largos = tramos.filter(([a, b]) => Math.abs(b[0] - a[0] - 0.6) < 1e-9);
    const puntos = tramos.filter(([a, b]) => Math.abs(b[0] - a[0] - 0.05) < 1e-9);
    expect(largos.length).toBeGreaterThanOrEqual(2);
    expect(puntos.length).toBeGreaterThanOrEqual(2);
  });

  it("en tramos chicos (0.20) los remates van por fuera; en 0.50 por dentro", () => {
    const l = layout();
    expect(l.parciales[3].fuera).toBe(true);
    expect(l.parciales[0].fuera).toBe(false);
    expect(l.parciales[0].remates.every((r) => !r.fuera)).toBe(true);
  });

  it("el globo más bajo queda exactamente a 10 mm sobre el último nivel", () => {
    const l = layout();
    // 10 mm de papel a 1:100 = 1.00 m; el borde inferior del círculo, no el centro.
    expect(l.zGloboInferior).toBeCloseTo(2.2 + 1.0, 9);
    expect(l.globos[0].z - l.globos[0].radio).toBeCloseTo(3.2, 9);
    expect(l.globos[0].radio).toBeCloseTo(0.4, 9);
  });

  it("la sobrescritura por vista mueve el globo a 20 mm", () => {
    const l = layout({ separacionGlobosMm: 20 });
    expect(l.zGloboInferior).toBeCloseTo(2.2 + 2.0, 9);
  });

  it("a 1:50 el texto y las cabezas conservan su medida de papel", () => {
    const normal = layout();
    const mitades = layout({ escala: 50 });
    const anchoNormal = normal.cabezas[0].poligono[1][0] - normal.cabezas[0].poligono[2][0];
    const anchoMitades = mitades.cabezas[0].poligono[1][0] - mitades.cabezas[0].poligono[2][0];
    // 1:50 usa más mundo para el mismo papel: 3.5 mm × 0.1 m/mm × 1.4 = 0.49 m.
    expect(anchoNormal).toBeCloseTo(0.35, 9);
    expect(anchoMitades).toBeCloseTo(0.49, 9);
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

  it("un desplazamiento manual manda sobre el automático", () => {
    const l = layout({ ajustesNivel: { n3: 3 } });
    expect(l.cabezas[3].z).toBe(3);
    expect(l.cabezas[3].desplazamiento).toBe(1);
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
