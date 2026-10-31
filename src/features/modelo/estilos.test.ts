import { describe, expect, it } from "vitest";
import {
  categoriaOculta,
  estilosPorDefecto,
  factorEscala,
  grosorMm,
  leerEstilos,
  materialPorTipo,
  mmAPx,
  mmAMundoConMinimoPx,
  normalizarEstilos,
  rellenoDeElemento,
  serializarEstilos,
} from "./estilos";
import type { Vista } from "./tipos";

function vista(extra: Partial<Vista> = {}): Vista {
  return {
    id: "v",
    nombre: "Vista",
    tipo: "planta",
    nivelesVisibles: [],
    categorias: {
      muros: true,
      losas: true,
      columnas: true,
      vigas: true,
      puertas: true,
      ventanas: true,
      cubiertas: true,
      escaleras: true,
      otros: true,
    },
    estilo: "lineas-ocultas",
    escala: 100,
    ...extra,
  };
}

describe("tabla de estilos por defecto", () => {
  it("reproduce los grosores de la spec", () => {
    const e = estilosPorDefecto();
    expect(e.categorias.muros).toMatchObject({ corte: 0.5, proyeccion: 0.18 });
    expect(e.categorias.losas).toMatchObject({ corte: 0.35, proyeccion: 0.18 });
    expect(e.categorias.columnas).toMatchObject({ corte: 0.5, proyeccion: 0.18 });
    expect(e.categorias.vigas).toMatchObject({ corte: 0.35, proyeccion: 0.18 });
    expect(e.categorias.puertas).toMatchObject({ corte: 0.25, proyeccion: 0.13 });
    expect(e.categorias.ventanas).toMatchObject({ corte: 0.25, proyeccion: 0.13 });
    expect(e.categorias.cubiertas).toMatchObject({ corte: 0.35, proyeccion: 0.18 });
    expect(e.categorias.escaleras).toMatchObject({ corte: 0.25, proyeccion: 0.13 });
    expect(e.categorias.otros).toMatchObject({ corte: 0.25, proyeccion: 0.13 });
    expect(e.categorias.ejes).toMatchObject({ corte: null, proyeccion: 0.13, patron: "trazo-punto" });
    expect(e.categorias.ocultas).toMatchObject({ corte: null, proyeccion: 0.13, patron: "discontinua" });
    expect(e.categorias["arriba-corte"]).toMatchObject({
      corte: null,
      proyeccion: 0.13,
      patron: "discontinua-larga",
    });
  });
});

describe("escala y zoom", () => {
  it("aplica los factores de escala de la spec", () => {
    expect(factorEscala(50)).toBe(1.4);
    expect(factorEscala(100)).toBe(1);
    expect(factorEscala(200)).toBe(0.7);
  });

  it("convierte mm de papel a píxeles con escala y zoom exactos", () => {
    // 10 m de alto en 900 px: 0,5 mm a 1:100 son 0,05 m → 4,5 px.
    expect(mmAPx(0.5, 100, 10 / 900)).toBeCloseTo(4.5, 9);
    // Al acercar (5 m en 900 px) el mismo trazo mide el doble.
    expect(mmAPx(0.5, 100, 5 / 900)).toBeCloseTo(9, 9);
    // 1:50 engrosa 1,4 veces.
    expect(mmAPx(0.5, 50, 10 / 900)).toBeCloseTo(6.3, 9);
    expect(mmAPx(0.5, 200, 10 / 900)).toBeCloseTo(3.15, 9);
  });

  it("O006b: el texto de cota no baja de 11 px ni las marcas de 6 px", () => {
    // 1 px = 1 cm: 2,5 mm a 1:100 son 0,25 m, más que 11 px → manda el papel.
    expect(mmAMundoConMinimoPx(2.5, 100, 0.01, 11)).toBeCloseTo(0.25, 9);
    expect(mmAMundoConMinimoPx(2, 100, 0.01, 6)).toBeCloseTo(0.2, 9);
    // Al alejar (1 px = 5 cm) el mínimo de pantalla manda: 11 px = 0,55 m.
    expect(mmAMundoConMinimoPx(2.5, 100, 0.05, 11)).toBeCloseTo(0.55, 9);
    expect(mmAMundoConMinimoPx(2, 100, 0.05, 6)).toBeCloseTo(0.3, 9);
    // 1:50 agranda el papel: 2,5 mm → 0,35 m, todavía por encima de 11 px a 1 cm/px.
    expect(mmAMundoConMinimoPx(2.5, 50, 0.01, 11)).toBeCloseTo(0.35, 9);
  });

  it("aplica la escala de la vista y la sobrescritura por vista", () => {
    const e = estilosPorDefecto();
    expect(grosorMm(e, vista({ escala: 50 }), "muros", "corte")).toBeCloseTo(0.7, 9);
    expect(grosorMm(e, vista({ estilos: { muros: { corte: 0.7 } } }), "muros", "corte")).toBe(0.7);
    expect(categoriaOculta(vista({ estilos: { muros: { oculta: true } } }), "muros")).toBe(true);
    expect(categoriaOculta(vista(), "muros")).toBe(false);
  });
});

describe("materiales", () => {
  it("asigna el patrón por tipo de muro de O003b", () => {
    expect(materialPorTipo("Block 12")).toBe("block");
    expect(materialPorTipo("Block 15")).toBe("block");
    expect(materialPorTipo("Block 20")).toBe("block");
    expect(materialPorTipo("Tabique")).toBe("tabique");
    expect(materialPorTipo("Concreto")).toBe("concreto");
    expect(materialPorTipo("Muro genérico")).toBe("generico");
    // O015: IfcSlab FLOOR (lo que crea la app) es concreto, no genérico.
    expect(materialPorTipo("FLOOR")).toBe("concreto");
    expect(materialPorTipo("IfcSlab")).toBe("concreto");
  });
});

describe("O015: regla de relleno por categoría y plano de corte", () => {
  it("la losa cortada usa el patrón del material en ambos estilos", () => {
    expect(rellenoDeElemento("losas", "cortado", "lineas-ocultas")).toBe("patron");
    expect(rellenoDeElemento("losas", "cortado", "sombreado")).toBe("patron-sombreado");
    expect(rellenoDeElemento("losas", "cortado", "aristas")).toBe("patron-sombreado");
  });

  it("la losa debajo del corte lleva proyección tenue y arriba no lleva nada", () => {
    expect(rellenoDeElemento("losas", "debajo", "lineas-ocultas")).toBe("proyeccion-tenue");
    expect(rellenoDeElemento("losas", "debajo", "sombreado")).toBe("proyeccion-tenue");
    expect(rellenoDeElemento("losas", "arriba", "lineas-ocultas")).toBe("ninguno");
    expect(rellenoDeElemento("losas", "arriba", "sombreado")).toBe("ninguno");
  });

  it("el muro cortado se rellena igual que antes (sin regresión)", () => {
    expect(rellenoDeElemento("muros", "cortado", "lineas-ocultas")).toBe("patron");
    expect(rellenoDeElemento("muros", "cortado", "sombreado")).toBe("patron-sombreado");
    // Fuera del corte el muro no inventa relleno: la regla nueva es solo de losas.
    expect(rellenoDeElemento("muros", "debajo", "lineas-ocultas")).toBe("ninguno");
    expect(rellenoDeElemento("muros", "arriba", "lineas-ocultas")).toBe("ninguno");
  });

  it("ninguna otra categoría recibe proyección tenue en planta", () => {
    const categorias = [
      "muros",
      "columnas",
      "vigas",
      "puertas",
      "ventanas",
      "cubiertas",
      "escaleras",
      "otros",
    ] as const;
    for (const categoria of categorias) {
      expect(rellenoDeElemento(categoria, "debajo", "sombreado")).toBe("ninguno");
      expect(rellenoDeElemento(categoria, "arriba", "sombreado")).toBe("ninguno");
    }
  });
});

describe("serialización de OPENRVT_Estilos", () => {
  it("hace round-trip sin perder valores", () => {
    const e = estilosPorDefecto();
    e.categorias.muros.corte = 0.7;
    e.materiales.block.escala = 3;
    const leido = leerEstilos(serializarEstilos(e));
    expect(leido.categorias.muros.corte).toBe(0.7);
    expect(leido.materiales.block).toEqual({ patron: "diagonal", escala: 3 });
    expect(leido.categorias["arriba-corte"].patron).toBe("discontinua-larga");
  });

  it("completa tablas viejas o rotas con los valores por defecto", () => {
    const leido = normalizarEstilos({
      categorias: { muros: { corte: 0.4 } },
      materiales: { concreto: { patron: "inventado", escala: 99 } },
    });
    expect(leido.categorias.muros.corte).toBe(0.4);
    expect(leido.categorias.muros.proyeccion).toBe(0.18);
    expect(leido.materiales.concreto.patron).toBe("concreto");
    expect(leido.materiales.concreto.escala).toBe(20);
    expect(leerEstilos("{roto")).toEqual(estilosPorDefecto());
  });
});
