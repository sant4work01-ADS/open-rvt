// O069: la planta dibuja la abertura con los datos del núcleo y Mover/Copiar
// funciona en alzados y cortes.
//
// Valores a mano (spec O069, 17-nov-2026):
// - Muro de (0,0) a (5,0). Ventana de 0.60 m que arranca con distancia 0.45:
//   centro = 0.45 + 0.30 = 0.75, de x = 0.45 a 1.05.
// - Tras editar distancia a 2.00: centro = 2.30, de x = 2.00 a 2.60.
// - Deshacer devuelve distancia 0.45 → x = 0.45 a 1.05.
// - Alzado Sur mira hacia +y con +x a la derecha: (1,1)→(3,1.5) es dx=2, dy=0, dz=0.5.
// - Alzado Este mira hacia +x con +y a la derecha: el mismo trazo es dy=2, dx=0.
// - Ventana con nivel N2 (cota 4.30) y muro que llega a 3.60: 4.30 + 0.90 + 1.20
//   = 6.40 > 3.60, así que el clic no debe llamar al núcleo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { aberturasVisiblesEnPlanta } from "./aberturasVista";
import { useModelo } from "./estado";
import { REFERENCIAS_VACIAS } from "./herramientas";
import type { Abertura, Elemento, ElementoMalla, PropiedadesElemento, Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

const MURO = {
  globalid: "m1",
  x1: 0,
  y1: 0,
  x2: 5,
  y2: 0,
  espesor: 0.15,
  altura: 3.6,
};

let distancia = 0.45;

function propiedadesAbertura(): PropiedadesElemento {
  return {
    globalid: "w1",
    clase: "IfcWindow",
    nombre: "Ventana",
    nivel: "Nivel 0",
    nivel_globalid: "N0",
    tipo: "Ventana 0.6",
    atributos: { OverallWidth: 0.6, OverallHeight: 1.2 },
    materiales: [],
    psets: {
      OPENRVT_Abertura: {
        Muro: "m1",
        Distancia: distancia,
        Ancho: 0.6,
        Alto: 1.2,
        Antepecho: 0.9,
        AntepechoNivel: 0.9,
        Nivel: "N0",
        Volteado: false,
      },
    },
  };
}

function elementos(): Elemento[] {
  return [
    { globalid: "m1", clase: "IfcWall", nombre: "Muro", nivel: "Nivel 0" },
    { globalid: "w1", clase: "IfcWindow", nombre: "Ventana", nivel: "Nivel 0" },
  ] as Elemento[];
}

function vista(tipo: Vista["tipo"], extra: Partial<Vista> = {}): Vista {
  return {
    id: `${tipo}-1`,
    nombre: tipo,
    tipo,
    nivel: "N0",
    alturaPlano: 1,
    nivelesVisibles: ["N0"],
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

function aberturaEnStore(): Abertura {
  return useModelo.getState().aberturas.find((a) => a.globalid === "w1")!;
}

beforeEach(() => {
  distancia = 0.45;
  nucleo.mockReset();
  nucleo.mockImplementation(async (metodo: string, crudo: unknown = {}) => {
    const params = (crudo ?? {}) as Record<string, unknown>;
    if (metodo === "proyecto.info") {
      return {
        ruta: "modelo.ifc",
        nombre: "modelo",
        esquema: "IFC4",
        elementos: 2,
        por_clase: {},
        con_cambios: true,
      };
    }
    if (metodo === "modelo.niveles") {
      return [
        { globalid: "N0", nombre: "Nivel 0", elevacion: 0 },
        { globalid: "N2", nombre: "Nivel 2", elevacion: 4.3 },
      ];
    }
    if (metodo === "modelo.elementos") return elementos();
    if (metodo === "modelo.referencias") {
      return { ...REFERENCIAS_VACIAS, muros: [MURO] };
    }
    if (metodo === "modelo.propiedades") {
      if (params.globalid === "w1") return propiedadesAbertura();
      return {
        globalid: "m1",
        clase: "IfcWall",
        nombre: "Muro",
        nivel: "Nivel 0",
        tipo: "",
        atributos: {},
        materiales: [],
        psets: {},
      };
    }
    if (metodo === "geometria.teselar") return { elementos: [] };
    if (metodo === "vistas.leer") return [];
    if (metodo === "estilos.leer") return null;
    if (metodo === "tipos.listar") return [];
    if (metodo === "modelo.arbol") return null;
    if (metodo === "notas.listar") return [];
    if (metodo === "proyecto.abrir" || metodo === "proyecto.info") {
      return {
        ruta: "modelo.ifc",
        nombre: "modelo",
        esquema: "IFC4",
        elementos: 2,
        por_clase: {},
        con_cambios: false,
      };
    }
    if (metodo === "elementos.editar") {
      const cambios = (params.cambios ?? {}) as Record<string, unknown>;
      if (typeof cambios.distancia === "number") distancia = cambios.distancia;
      return { creados: [], modificados: ["w1", "m1"], borrados: [], mensaje: "" };
    }
    if (metodo === "elementos.mover") {
      return { creados: [], modificados: ["w1"], borrados: [], mensaje: "movido" };
    }
    if (metodo === "historial.deshacer") {
      distancia = 0.45;
      return { hecho: true };
    }
    return { creados: [], modificados: [], borrados: [], mensaje: "" };
  });
  useModelo.setState({
    ruta: "modelo.ifc",
    nombreArchivo: "modelo.ifc",
    esquema: "IFC4",
    conCambios: false,
    niveles: [
      { globalid: "N0", nombre: "Nivel 0", elevacion: 0 },
      { globalid: "N2", nombre: "Nivel 2", elevacion: 4.3 },
    ],
    elementos: elementos(),
    mallas: [],
    vistas: [vista("planta")],
    vistaActivaId: "planta-1",
    seleccion: null,
    seleccionados: [],
    propiedades: null,
    herramienta: null,
    faseMover: null,
    puntosHerramienta: [],
    ratonHerramienta: null,
    engancheHerramienta: null,
    longitudTecleada: "",
    referencias: { ...REFERENCIAS_VACIAS, muros: [MURO] },
    opcionesAbertura: { ancho: 0.6, alto: 1.2, antepecho: 0.9, nivel: "N0" },
    error: null,
    aviso: null,
  });
});

describe("O069: la planta sale del núcleo", () => {
  it("(a) editar la distancia a 2.00 mueve el símbolo a x = 2.00–2.60", async () => {
    // Se parte del estado cargado por el núcleo (distancia 0.45).
    await useModelo.getState().abrir("modelo.ifc");
    expect(aberturaEnStore().centro[0]).toBeCloseTo(0.75, 9);

    await useModelo.getState().editarElemento("w1", { distancia: 2.0 });

    const abertura = aberturaEnStore();
    expect(abertura.centro[0]).toBeCloseTo(2.3, 9);
    expect(abertura.ancho).toBeCloseTo(0.6, 9);
  });

  it("(b) Deshacer devuelve el símbolo a x = 0.45–1.05", async () => {
    await useModelo.getState().abrir("modelo.ifc");
    await useModelo.getState().editarElemento("w1", { distancia: 2.0 });
    expect(aberturaEnStore().centro[0]).toBeCloseTo(2.3, 9);

    await useModelo.getState().deshacer();

    expect(aberturaEnStore().centro[0]).toBeCloseTo(0.75, 9);
  });

  it("(c) clic en (2.30, 0) selecciona la ventana, no el muro", async () => {
    await useModelo.getState().abrir("modelo.ifc");
    await useModelo.getState().editarElemento("w1", { distancia: 2.0 });

    const acerto = await useModelo
      .getState()
      .seleccionarAberturaEnPunto([2.3, 0], false, 0.05);

    expect(acerto).toBe(true);
    expect(useModelo.getState().seleccion).toBe("w1");
    expect(useModelo.getState().seleccionados).toEqual(["w1"]);
  });
});

describe("O069: Mover en alzados y cortes", () => {
  it("(d) Alzado Sur manda dx=2, dy=0, dz=0.5", async () => {
    useModelo.setState({
      vistas: [vista("alzado", { orientacion: "sur" })],
      vistaActivaId: "alzado-1",
      seleccionados: ["w1"],
      seleccion: "w1",
    });
    useModelo.getState().activarHerramienta("mover");
    expect(useModelo.getState().faseMover).toBe("base");

    await useModelo.getState().clicEnAlzado([1, 1], false, false, 0.01);
    await useModelo.getState().clicEnAlzado([3, 1.5], false, false, 0.01);

    const llamada = nucleo.mock.calls.find(([m]) => m === "elementos.mover");
    expect(llamada?.[1]).toMatchObject({
      globalids: ["w1"],
      dx: 2,
      dy: 0,
      dz: 0.5,
    });
  });

  it("(e) Alzado Este manda dx=0, dy=2, dz=0.5", async () => {
    useModelo.setState({
      vistas: [vista("alzado", { orientacion: "este" })],
      vistaActivaId: "alzado-1",
      seleccionados: ["w1"],
      seleccion: "w1",
    });
    useModelo.getState().activarHerramienta("mover");

    await useModelo.getState().clicEnAlzado([1, 1], false, false, 0.01);
    await useModelo.getState().clicEnAlzado([3, 1.5], false, false, 0.01);

    const llamada = nucleo.mock.calls.find(([m]) => m === "elementos.mover");
    expect(llamada?.[1]).toMatchObject({ dx: 0, dy: 2, dz: 0.5 });
  });

  it("en 3D avisa que Mover trabaja en plantas, alzados y cortes", () => {
    useModelo.setState({
      vistas: [vista("iso")],
      vistaActivaId: "iso-1",
      seleccionados: [],
    });
    useModelo.getState().activarHerramienta("mover");
    expect(useModelo.getState().herramienta).toBeNull();
    expect(useModelo.getState().aviso).toBe(
      "Mover trabaja en plantas, alzados y cortes",
    );
  });
});

describe("O069: nivel por defecto de Ventana/Puerta", () => {
  it("(f) una ventana que no cabe con el nivel elegido no llama al núcleo", async () => {
    useModelo.setState({
      opcionesAbertura: { ancho: 0.6, alto: 1.2, antepecho: 0.9, nivel: "N2" },
    });
    useModelo.getState().activarHerramienta("ventana");
    // N2 = 4.30; 4.30 + 0.90 + 1.20 = 6.40 > 3.60 del muro.
    await useModelo.getState().clicEnPlanta([2, 0], false, false, 0.01);

    expect(nucleo.mock.calls.some(([m]) => m === "aberturas.crear")).toBe(false);
    expect(useModelo.getState().aviso).toContain("no cabe");
  });
});

describe("O069: el símbolo de planta sale del muro dibujado y su nivel", () => {
  const muroDibujado = [{ globalid: "m1", categoria: "muros" }] as ElementoMalla[];

  it("la ventana del nivel de la vista se dibuja", async () => {
    await useModelo.getState().abrir("modelo.ifc");
    const ventana = aberturaEnStore();
    // Nivel 0, cota 0.90, alto 1.20, corte en 1.00 → cruza el plano.
    expect(aberturasVisiblesEnPlanta([ventana], vista("planta"), muroDibujado)).toHaveLength(1);
  });

  it("una ventana de otro nivel no se dibuja en la planta de Nivel 0", async () => {
    await useModelo.getState().abrir("modelo.ifc");
    const ventana = { ...aberturaEnStore(), nivel: "N2", cota: 4.3 };
    // Su muro no está en el Nivel 0 dibujado: además de no cruzar el corte,
    // aunque se pasara el muro, el nivel de referencia no es el de la vista.
    expect(aberturasVisiblesEnPlanta([ventana], vista("planta"), muroDibujado)).toHaveLength(0);
  });

  it("si el muro no se dibuja en esa vista, la abertura tampoco", async () => {
    await useModelo.getState().abrir("modelo.ifc");
    const ventana = aberturaEnStore();
    expect(aberturasVisiblesEnPlanta([ventana], vista("planta"), [])).toHaveLength(0);
  });

  it("una abertura de nivel N2 sí se dibuja en la planta de Nivel 2", async () => {
    await useModelo.getState().abrir("modelo.ifc");
    const ventana = { ...aberturaEnStore(), nivel: "N2", cota: 4.3 };
    const plantaN2 = vista("planta", { nivel: "N2", alturaPlano: 5 });
    expect(aberturasVisiblesEnPlanta([ventana], plantaN2, muroDibujado)).toHaveLength(1);
  });
});

describe("O069: vista previa de Mover en alzados", () => {
  it("(g) el cursor del alzado no se engancha a la planta", () => {
    useModelo.setState({
      vistas: [vista("alzado", { orientacion: "sur" })],
      vistaActivaId: "alzado-1",
      seleccionados: ["w1"],
      seleccion: "w1",
    });
    useModelo.getState().activarHerramienta("mover");
    useModelo.getState().fijarRatonHerramienta([3.13, 1.47], false, 0.01);
    // En planta (3.13, 1.47) se engancharía al muro; en alzado se respeta.
    expect(useModelo.getState().ratonHerramienta).toEqual([3.13, 1.47]);
  });
});
