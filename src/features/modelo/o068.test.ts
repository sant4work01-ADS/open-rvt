// O068: fases de Mover, distancia tecleada y opciones de Ventana/Puerta.
// Valores a mano: muro de 6.00 m; ventana de 1.20 m. Con el cursor a x=2.00 la
// abertura centrada queda de 1.40 a 2.60 y el extremo más cercano es el inicio,
// así que teclear 1.00 deja su borde a 1.00. Con el cursor a x=5.50 el extremo
// cercano es el fin y teclear 0.50 deja la distancia al inicio en
// 6.00 − 0.50 − 1.20 = 4.30. Mover 2 m en diagonal 3-4-5 desde (0,0) con Shift
// da dx = 1.20, dy = 1.60.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import { REFERENCIAS_VACIAS } from "./herramientas";
import type { Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

function vistaPlanta(nivel = "N1"): Vista {
  return {
    id: "planta-n1",
    nombre: "Planta Nivel 1",
    tipo: "planta",
    nivel,
    alturaPlano: 4.2,
    nivelesVisibles: [nivel],
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
  };
}

beforeEach(() => {
  nucleo.mockReset();
  nucleo.mockImplementation(async (metodo: string) => {
    if (metodo === "modelo.elementos") return [];
    if (metodo === "modelo.niveles") return [];
    if (metodo === "modelo.referencias") return REFERENCIAS_VACIAS;
    if (metodo === "modelo.arbol") return null;
    if (metodo === "geometria.teselar") return { elementos: [] };
    if (metodo === "modelo.propiedades") {
      return {
        globalid: "m1",
        clase: "IfcWall",
        nombre: "Muro",
        nivel: "N0",
        tipo: "",
        atributos: {},
        materiales: [],
        psets: {},
      };
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
      { globalid: "N1", nombre: "Nivel 1", elevacion: 3 },
    ],
    elementos: [],
    mallas: [],
    vistas: [vistaPlanta()],
    vistaActivaId: "planta-n1",
    seleccion: null,
    seleccionados: [],
    propiedades: null,
    herramienta: null,
    faseMover: null,
    puntosHerramienta: [],
    ratonHerramienta: null,
    engancheHerramienta: null,
    longitudTecleada: "",
    referencias: { ...REFERENCIAS_VACIAS },
    opcionesAbertura: { ancho: 1.2, alto: 1.2, antepecho: 0.9, nivel: "" },
    error: null,
    aviso: null,
  });
});

describe("O068: barra de opciones de Ventana y Puerta", () => {
  it("la ventana arranca en 1.20 × 1.20 con antepecho 0.90 y el nivel de la vista", () => {
    useModelo.getState().activarHerramienta("ventana");
    expect(useModelo.getState().opcionesAbertura).toEqual({
      ancho: 1.2,
      alto: 1.2,
      antepecho: 0.9,
      nivel: "N1",
    });
  });

  it("la puerta arranca en 0.90 × 2.10 con antepecho 0", () => {
    useModelo.getState().activarHerramienta("puerta");
    expect(useModelo.getState().opcionesAbertura).toEqual({
      ancho: 0.9,
      alto: 2.1,
      antepecho: 0,
      nivel: "N1",
    });
  });
});

describe("O068: fases de Mover", () => {
  it("sin selección empieza seleccionando; Listo sin nada no avanza", () => {
    useModelo.getState().activarHerramienta("mover");
    expect(useModelo.getState().faseMover).toBe("seleccionar");
    useModelo.getState().listoMover();
    expect(useModelo.getState().faseMover).toBe("seleccionar");
    expect(useModelo.getState().aviso).toContain("seleccione");
  });

  it("selecciona dos elementos y recorre seleccionar → base → destino", async () => {
    useModelo.getState().activarHerramienta("mover");
    await useModelo.getState().seleccionar("m1", true);
    await useModelo.getState().seleccionar("m2", true);
    expect(useModelo.getState().seleccionados).toEqual(["m1", "m2"]);
    useModelo.getState().listoMover();
    expect(useModelo.getState().faseMover).toBe("base");

    await useModelo.getState().clicEnPlanta([0, 0]);
    expect(useModelo.getState().faseMover).toBe("destino");
    expect(useModelo.getState().puntosHerramienta).toEqual([[0, 0]]);

    await useModelo.getState().clicEnPlanta([2, 0]);
    expect(useModelo.getState().error).toBeNull();
    expect(nucleo.mock.calls.some(([m]) => m === "elementos.mover")).toBe(true);
    const llamada = nucleo.mock.calls.find(([m]) => m === "elementos.mover");
    expect(llamada?.[1]).toMatchObject({
      globalids: ["m1", "m2"],
      dx: 2,
      dy: 0,
      dz: 0,
    });
    // Queda activo con la selección para mover otra vez.
    expect(useModelo.getState().herramienta).toBe("mover");
    expect(useModelo.getState().seleccionados).toEqual(["m1", "m2"]);
    expect(useModelo.getState().faseMover).toBe("base");
    expect(useModelo.getState().puntosHerramienta).toEqual([]);
  });

  it("la distancia tecleada mueve esa medida en la dirección del cursor", async () => {
    useModelo.setState({ seleccionados: ["m1"], seleccion: "m1" });
    useModelo.getState().activarHerramienta("mover");
    expect(useModelo.getState().faseMover).toBe("base");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().fijarRatonHerramienta([3, 4], true);
    useModelo.getState().teclearLongitud("2");
    expect(useModelo.getState().longitudTecleada).toBe("2");
    await useModelo.getState().confirmarLongitud(true);
    const llamada = nucleo.mock.calls.find(([m]) => m === "elementos.mover");
    expect(llamada?.[1]).toMatchObject({
      globalids: ["m1"],
      dx: 1.2,
      dy: 1.6,
      dz: 0,
    });
  });
});

describe("O068: distancia tecleada de Ventana", () => {
  const muro = {
    globalid: "muro-1",
    x1: 0,
    y1: 0,
    x2: 6,
    y2: 0,
    espesor: 0.15,
    altura: 6,
  };

  it("teclear 1.00 con el cursor cerca del inicio deja el borde a 1.00", async () => {
    useModelo.setState({
      referencias: { ...REFERENCIAS_VACIAS, muros: [muro] },
    });
    useModelo.getState().activarHerramienta("ventana");
    useModelo.getState().fijarRatonHerramienta([2, 0]);
    useModelo.getState().teclearLongitud("1");
    await useModelo.getState().confirmarLongitud();
    const llamada = nucleo.mock.calls.find(([m]) => m === "aberturas.crear");
    expect(llamada?.[1]).toMatchObject({
      clase: "IfcWindow",
      muro: "muro-1",
      distancia: 1,
      ancho: 1.2,
      alto: 1.2,
      antepecho: 0.9,
      nivel: "N1",
    });
  });

  it("teclear 0.50 cerca del fin mide desde ese extremo: 4.30 al inicio", async () => {
    useModelo.setState({
      referencias: { ...REFERENCIAS_VACIAS, muros: [muro] },
    });
    useModelo.getState().activarHerramienta("ventana");
    useModelo.getState().fijarRatonHerramienta([5.5, 0]);
    useModelo.getState().teclearLongitud("0");
    useModelo.getState().teclearLongitud(".");
    useModelo.getState().teclearLongitud("5");
    await useModelo.getState().confirmarLongitud();
    const llamada = nucleo.mock.calls.find(([m]) => m === "aberturas.crear");
    expect(llamada?.[1]).toMatchObject({ distancia: 4.3 });
  });

  it("una medida que saca la abertura del muro no crea nada", async () => {
    useModelo.setState({
      referencias: { ...REFERENCIAS_VACIAS, muros: [muro] },
    });
    useModelo.getState().activarHerramienta("ventana");
    useModelo.getState().fijarRatonHerramienta([2, 0]);
    useModelo.getState().teclearLongitud("5");
    await useModelo.getState().confirmarLongitud();
    expect(nucleo.mock.calls.some(([m]) => m === "aberturas.crear")).toBe(false);
    expect(useModelo.getState().aviso).toContain("fuera del muro");
  });
});
