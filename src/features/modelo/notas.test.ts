// O055: ciclo de la nota en el estado del frontend (crear, editar, mover y
// deshacer). Los valores esperados son los de la spec y del caso calculado a mano
// en test_o055.py: texto «Revisar muro norte» en (1.50, -2.25, 3.00) del nivel 0.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import type { Nota } from "./anotaciones3d";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

let notas: Nota[] = [];
let historial: Nota[][] = [];

function nota(gid: string, texto: string, posicion: [number, number, number]): Nota {
  return {
    globalid: gid,
    texto,
    posicion,
    nivel: "Nivel 0",
    nivelGlobalid: "N0",
  };
}

beforeEach(() => {
  notas = [];
  historial = [];
  useModelo.setState({ notas: [], notaSeleccionada: null });
  nucleo.mockReset();
  nucleo.mockImplementation(async (metodo: string, crudo: unknown = {}) => {
    const params = (crudo ?? {}) as Record<string, unknown>;
    switch (metodo) {
      case "notas.crear": {
        const creada = nota("n1", String(params.texto), [
          Number(params.x),
          Number(params.y),
          Number(params.z),
        ]);
        notas = [...notas, creada];
        return { creados: ["n1"], modificados: [], borrados: [], mensaje: "Nota creada." };
      }
      case "notas.listar":
        return notas.map((n) => ({ ...n, posicion: [...n.posicion] }));
      case "notas.editar":
        notas = notas.map((n) =>
          n.globalid === params.globalid ? { ...n, texto: String(params.texto) } : n,
        );
        return { creados: [], modificados: [String(params.globalid)], borrados: [] };
      case "notas.mover":
        notas = notas.map((n) =>
          n.globalid === params.globalid
            ? {
                ...n,
                posicion: [
                  Number(params.x),
                  Number(params.y),
                  Number(params.z),
                ] as [number, number, number],
              }
            : n,
        );
        return { creados: [], modificados: [String(params.globalid)], borrados: [] };
      case "notas.borrar":
        historial.push(notas.map((n) => ({ ...n, posicion: [...n.posicion] as [number, number, number] })));
        notas = notas.filter((n) => n.globalid !== params.globalid);
        return { creados: [], modificados: [], borrados: [String(params.globalid)] };
      case "historial.deshacer":
        if (historial.length === 0) return { hecho: false, motivo: "No hay nada que deshacer." };
        notas = historial.pop()!;
        return { hecho: true };
      case "proyecto.info":
        return {
          ruta: null,
          esquema: "IFC4",
          con_cambios: true,
          elementos: 0,
          por_clase: {},
          nombre: "o055",
        };
      case "modelo.niveles":
        return [{ globalid: "N0", nombre: "Nivel 0", elevacion: 0 }];
      case "modelo.elementos":
        return [];
      case "geometria.teselar":
        return { elementos: [] };
      case "vistas.leer":
        return [];
      case "tipos.listar":
        return [];
      case "modelo.referencias":
        return {
          muros: [],
          extremos: [],
          medios: [],
          ejes: [],
          intersecciones: [],
          reticula: { modo: "origen", rebase: 0 },
        };
      case "estilos.leer":
        return null;
      case "modelo.arbol":
        return null;
      default:
        return null;
    }
  });
});

describe("O055: ciclo de la nota en el estado", () => {
  it("crea la nota con texto y posición exactos y la deja en el estado", async () => {
    const gid = await useModelo
      .getState()
      .crearNota("Revisar muro norte", [1.5, -2.25, 3]);
    expect(gid).toBe("n1");
    const guardadas = useModelo.getState().notas;
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].texto).toBe("Revisar muro norte");
    expect(guardadas[0].posicion).toEqual([1.5, -2.25, 3]);
    const llamada = nucleo.mock.calls.find(([metodo]) => metodo === "notas.crear");
    expect(llamada?.[1]).toMatchObject({ texto: "Revisar muro norte", x: 1.5, y: -2.25, z: 3 });
  });

  it("edita el texto de la misma nota sin crear otra", async () => {
    await useModelo.getState().crearNota("Primera", [0, 0, 0]);
    await useModelo.getState().editarNota("n1", "Texto corregido");
    const guardadas = useModelo.getState().notas;
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].texto).toBe("Texto corregido");
  });

  it("mueve la nota a la posición indicada y conserva el texto", async () => {
    await useModelo.getState().crearNota("No mover el texto", [1, 2, 3]);
    await useModelo.getState().moverNota("n1", [7, 8, 2.5]);
    const guardadas = useModelo.getState().notas;
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].posicion).toEqual([7, 8, 2.5]);
    expect(guardadas[0].texto).toBe("No mover el texto");
  });

  it("borrar y deshacer devuelve la nota con su texto y posición", async () => {
    await useModelo.getState().crearNota("No borrar", [1, 2, 3]);
    await useModelo.getState().borrarNota("n1");
    expect(useModelo.getState().notas).toEqual([]);

    await useModelo.getState().deshacer();
    const devueltas = useModelo.getState().notas;
    expect(devueltas).toHaveLength(1);
    expect(devueltas[0].globalid).toBe("n1");
    expect(devueltas[0].texto).toBe("No borrar");
    expect(devueltas[0].posicion).toEqual([1, 2, 3]);
  });
});
