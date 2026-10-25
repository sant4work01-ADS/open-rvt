// O005c: pruebas de la máquina de estados de las herramientas (clic, Enter, doble clic
// y Esc) con el canal del núcleo sustituido por un doble en memoria.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import type { EjeReferencia } from "./herramientas";
import type { Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

function vistaPlanta(): Vista {
  return {
    id: "planta",
    nombre: "Planta baja",
    tipo: "planta",
    nivel: "N1",
    alturaPlano: 0,
    nivelesVisibles: ["N1"],
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

let ejes: EjeReferencia[] = [];

beforeEach(() => {
  ejes = [];
  nucleo.mockReset();
  nucleo.mockImplementation(async (metodo: string, crudo: unknown = {}) => {
    const params = (crudo ?? {}) as Record<string, unknown>;
    if (metodo === "ejes.crear") {
      const vertical =
        Math.abs(Number(params.x2) - Number(params.x1)) <
        Math.abs(Number(params.y2) - Number(params.y1));
      ejes = [
        ...ejes,
        {
          globalid: `grid/${params.etiqueta}`,
          etiqueta: String(params.etiqueta),
          x1: Number(params.x1),
          y1: Number(params.y1),
          x2: Number(params.x2),
          y2: Number(params.y2),
          vertical,
        },
      ];
      return {
        creados: [`grid/${params.etiqueta}`],
        modificados: [],
        borrados: [],
        mensaje: `Eje «${params.etiqueta}» creado.`,
      };
    }
    if (metodo === "muros.crear" || metodo === "losas.crear") {
      return { creados: ["g1"], modificados: [], borrados: [], mensaje: "creado" };
    }
    if (metodo === "elementos.mover" || metodo === "elementos.copiar") {
      return { creados: [], modificados: ["g1"], borrados: [], mensaje: "movido" };
    }
    if (metodo === "proyecto.info") {
      return {
        ruta: "modelo.ifc",
        nombre: "modelo",
        esquema: "IFC4",
        elementos: 0,
        por_clase: {},
        con_cambios: true,
      };
    }
    if (metodo === "modelo.niveles") return [{ globalid: "N1", nombre: "Nivel 1", elevacion: 0 }];
    if (metodo === "modelo.elementos") return [];
    if (metodo === "modelo.referencias") {
      return { muros: [], extremos: [], medios: [], ejes, intersecciones: [] };
    }
    if (metodo === "geometria.teselar") return { elementos: [] };
    return {};
  });

  useModelo.setState({
    ruta: "modelo.ifc",
    nombreArchivo: "modelo.ifc",
    esquema: "IFC4",
    conCambios: false,
    niveles: [{ globalid: "N1", nombre: "Nivel 1", elevacion: 0 }],
    elementos: [],
    mallas: [],
    vistas: [vistaPlanta()],
    vistaActivaId: "planta",
    seleccionados: [],
    herramienta: null,
    puntosHerramienta: [],
    ratonHerramienta: null,
    engancheHerramienta: null,
    longitudTecleada: "",
    etiquetaEje: "",
    referencias: { muros: [], extremos: [], medios: [], ejes: [], intersecciones: [] },
    opcionesMuro: { tipo: "Block 15", altura: 2.6, alineacion: "centro" },
    aviso: null,
    error: null,
  });
});

describe("herramienta Eje", () => {
  it("primer clic inicia, segundo clic crea y la herramienta sigue con la etiqueta siguiente", async () => {
    const estado = useModelo.getState();
    estado.activarHerramienta("eje");
    await estado.clicEnPlanta([0, 0]);
    expect(useModelo.getState().puntosHerramienta).toEqual([[0, 0]]);
    expect(useModelo.getState().herramienta).toBe("eje");

    useModelo.getState().fijarRatonHerramienta([0, 6]);
    await useModelo.getState().clicEnPlanta([0, 6]);

    expect(nucleo).toHaveBeenCalledWith("ejes.crear", {
      etiqueta: "1",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
    });
    const despues = useModelo.getState();
    expect(despues.herramienta).toBe("eje");
    expect(despues.puntosHerramienta).toEqual([]);
    expect(despues.etiquetaEje).toBe("2");
    expect(despues.referencias.ejes).toHaveLength(1);
    expect(despues.aviso).toBe("Eje «1» creado. Siguiente: 2.");
  });

  it("longitud tecleada y Enter termina el eje en la dirección del cursor", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([1, 1]);
    useModelo.getState().fijarRatonHerramienta([1, 9]);
    useModelo.getState().teclearLongitud("4");
    await useModelo.getState().confirmarLongitud();

    expect(nucleo).toHaveBeenCalledWith("ejes.crear", {
      etiqueta: "1",
      x1: 1,
      y1: 1,
      x2: 1,
      y2: 5,
    });
    expect(useModelo.getState().longitudTecleada).toBe("");
    expect(useModelo.getState().puntosHerramienta).toEqual([]);
  });

  it("un segundo eje vertical usa la etiqueta 2 y uno horizontal usa A", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().fijarRatonHerramienta([0, 5]);
    await useModelo.getState().clicEnPlanta([0, 5]);
    await useModelo.getState().clicEnPlanta([0, 2]);
    useModelo.getState().fijarRatonHerramienta([6, 2]);
    await useModelo.getState().clicEnPlanta([6, 2]);

    const etiquetas = nucleo.mock.calls
      .filter(([metodo]) => metodo === "ejes.crear")
      .map(([, params]) => (params as { etiqueta: string }).etiqueta);
    expect(etiquetas).toEqual(["1", "A"]);
    expect(useModelo.getState().referencias.ejes.map((e) => e.etiqueta)).toEqual(["1", "A"]);
  });
});

describe("herramienta Losa", () => {
  it("cuatro clics y doble clic cierran la losa", async () => {
    const estado = useModelo.getState();
    estado.activarHerramienta("losa");
    for (const punto of [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]) {
      await useModelo.getState().clicEnPlanta(punto as [number, number]);
    }
    expect(useModelo.getState().puntosHerramienta).toHaveLength(4);
    await useModelo.getState().dobleClicEnPlanta();

    expect(nucleo).toHaveBeenCalledWith("losas.crear", {
      nivel: "N1",
      puntos: [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      espesor: 0.12,
      desfase: 0,
    });
    expect(useModelo.getState().herramienta).toBe("losa");
    expect(useModelo.getState().puntosHerramienta).toEqual([]);
  });
});

describe("Mover y Copiar", () => {
  it("punto base y destino ejecutan el desplazamiento", async () => {
    useModelo.setState({ seleccionados: ["muro-1"] });
    useModelo.getState().activarHerramienta("mover");
    await useModelo.getState().clicEnPlanta([1, 1]);
    await useModelo.getState().clicEnPlanta([3, 1]);

    expect(nucleo).toHaveBeenCalledWith("elementos.mover", {
      globalids: ["muro-1"],
      dx: 2,
      dy: 0,
      dz: 0,
    });
    expect(useModelo.getState().puntosHerramienta).toEqual([]);
    expect(useModelo.getState().herramienta).toBe("mover");
  });
});

describe("Esc en dos pasos", () => {
  it("el primer Esc cancela el trazo y el segundo sale de la herramienta", async () => {
    useModelo.getState().activarHerramienta("muro");
    await useModelo.getState().clicEnPlanta([0, 0]);
    expect(useModelo.getState().puntosHerramienta).toHaveLength(1);

    expect(useModelo.getState().cancelarTrazo()).toBe(true);
    expect(useModelo.getState().herramienta).toBe("muro");
    expect(useModelo.getState().puntosHerramienta).toEqual([]);

    expect(useModelo.getState().cancelarTrazo()).toBe(false);
    useModelo.getState().cancelarHerramienta();
    expect(useModelo.getState().herramienta).toBeNull();
  });

  it("el primer Esc también borra una longitud tecleada", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().teclearLongitud("3");
    expect(useModelo.getState().longitudTecleada).toBe("3");
    expect(useModelo.getState().cancelarTrazo()).toBe(true);
    expect(useModelo.getState().longitudTecleada).toBe("");
    expect(useModelo.getState().herramienta).toBe("eje");
  });
});
