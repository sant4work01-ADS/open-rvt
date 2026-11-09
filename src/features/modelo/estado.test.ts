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
    opcionesMuro: {
        tipo: "Block 15",
        altura: 2.6,
        alineacion: "centro",
        lineaUbicacion: "eje_nucleo",
        desfaseUbicacion: 0,
      },
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

  it("el segundo eje se fuerza paralelo, toma la longitud de la familia y la distancia tecleada", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().fijarRatonHerramienta([0, 10]);
    await useModelo.getState().clicEnPlanta([0, 10]);
    // Trazo casi vertical lejos del eje 1: se restringe a su familia.
    await useModelo.getState().clicEnPlanta([20, 2]);
    useModelo.getState().fijarRatonHerramienta([20.1, 7]);
    useModelo.getState().teclearLongitud("6");
    await useModelo.getState().confirmarLongitud();

    const llamadas = nucleo.mock.calls.filter(([metodo]) => metodo === "ejes.crear");
    const llamada = llamadas[llamadas.length - 1];
    expect(llamada[1]).toEqual({
      etiqueta: "2",
      x1: 6,
      y1: 0,
      x2: 6,
      y2: 10,
    });
  });

  it("con Ctrl el eje sigue siendo ortogonal: no se fuerza la familia pero sí la dirección", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().fijarRatonHerramienta([0, 10]);
    await useModelo.getState().clicEnPlanta([0, 10]);
    await useModelo.getState().clicEnPlanta([2, 2]);
    useModelo.getState().fijarRatonHerramienta([4, 2.5]);
    await useModelo.getState().clicEnPlanta([4, 2.5], false, true);

    const llamadas = nucleo.mock.calls.filter(([metodo]) => metodo === "ejes.crear");
    // |dx| = 2 domina sobre |dy| = 0.5: el eje termina horizontal en y = 2.
    expect(llamadas[llamadas.length - 1][1]).toEqual({
      etiqueta: "A",
      x1: 2,
      y1: 2,
      x2: 4,
      y2: 2,
    });
  });

  it("dibujar de (0,0) a (5, 0.8) deja el eje horizontal de (0,0) a (5,0)", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().fijarRatonHerramienta([5, 0.8]);
    await useModelo.getState().clicEnPlanta([5, 0.8]);

    expect(nucleo).toHaveBeenCalledWith("ejes.crear", {
      etiqueta: "A",
      x1: 0,
      y1: 0,
      x2: 5,
      y2: 0,
    });
  });

  it("dibujar de (0,0) a (0.6, 5) deja el eje vertical de (0,0) a (0,5)", async () => {
    useModelo.getState().activarHerramienta("eje");
    await useModelo.getState().clicEnPlanta([0, 0]);
    useModelo.getState().fijarRatonHerramienta([0.6, 5]);
    await useModelo.getState().clicEnPlanta([0.6, 5]);

    expect(nucleo).toHaveBeenCalledWith("ejes.crear", {
      etiqueta: "1",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 5,
    });
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
      uso: "entrepiso",
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
describe("O029: nombre automático desde la elevación real", () => {
  it("al escribir 1.50 entre Nivel 1 y Nivel 2 la barra dice «Nivel 1.5»", () => {
    useModelo.setState({
      niveles: [
        { globalid: "N1", nombre: "Nivel 1", elevacion: 0 },
        { globalid: "N2", nombre: "Nivel 2", elevacion: 3 },
      ],
      herramienta: "nivel",
      puntosHerramienta: [],
      ratonHerramienta: null,
      cotasNivel: null,
      opcionesNivel: {
        nombre: "Nivel 1.75",
        nombreAutomatico: true,
        crearPlanta: true,
        elevacionTexto: "",
      },
    });
    useModelo.getState().fijarOpcionesNivel({ elevacionTexto: "1.50" });
    const estado = useModelo.getState();
    expect(estado.opcionesNivel.nombre).toBe("Nivel 1.5");
    expect(estado.cotasNivel?.inferior?.nombre).toBe("Nivel 1");
    expect(estado.cotasNivel?.inferior?.elevacion).toBe(0);
    expect(estado.cotasNivel?.superior?.nombre).toBe("Nivel 2");
    expect(estado.cotasNivel?.superior?.elevacion).toBe(3);
  });

  it("el nombre escrito a mano no se pisa al teclear la elevación", () => {
    useModelo.setState({
      niveles: [
        { globalid: "N1", nombre: "Nivel 1", elevacion: 0 },
        { globalid: "N2", nombre: "Nivel 2", elevacion: 3 },
      ],
      herramienta: "nivel",
      puntosHerramienta: [],
      ratonHerramienta: null,
      opcionesNivel: {
        nombre: "Azotea",
        nombreAutomatico: false,
        crearPlanta: true,
        elevacionTexto: "",
      },
    });
    useModelo.getState().fijarOpcionesNivel({ elevacionTexto: "1.50" });
    expect(useModelo.getState().opcionesNivel.nombre).toBe("Azotea");
  });
});
