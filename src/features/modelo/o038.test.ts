// O038: estado del árbol del proyecto. Prueba que el ojo y el candado se guardan por
// vista, que aislar oculta todo salvo el subárbol y que la selección múltiple carga
// las propiedades. Los valores esperados son listas y conteos explícitos.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import { expandirGlobalids, indexarArbol, type NodoArbol } from "./arbol";
import { CATEGORIAS_TODAS, type Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

function arbolEjemplo(): NodoArbol {
  return {
    clave: "edificio",
    nombre: "Edificio",
    tipo: "edificio",
    conteo: 3,
    hijos: [
      {
        clave: "nivel:n0",
        nombre: "Nivel 0",
        tipo: "nivel",
        globalid: "n0",
        elevacion: 0,
        conteo: 3,
        hijos: [
          {
            clave: "categoria:muros",
            nombre: "Muros",
            tipo: "categoria",
            categoria: "muros",
            conteo: 2,
            hijos: [
              {
                clave: "tipo:t1",
                nombre: "Block 15",
                tipo: "tipo",
                globalid: "t1",
                conteo: 2,
                hijos: [
                  { clave: "elemento:e1", nombre: "Muro 1", tipo: "elemento", globalid: "e1", clase: "IfcWall", conteo: 1 },
                  { clave: "elemento:e2", nombre: "Muro 2", tipo: "elemento", globalid: "e2", clase: "IfcWall", conteo: 1 },
                ],
              },
            ],
          },
          {
            clave: "categoria:losas",
            nombre: "Losas",
            tipo: "categoria",
            categoria: "losas",
            conteo: 1,
            hijos: [
              {
                clave: "tipo:sin-tipo",
                nombre: "(sin tipo)",
                tipo: "tipo",
                conteo: 1,
                hijos: [
                  { clave: "elemento:e3", nombre: "Losa 1", tipo: "elemento", globalid: "e3", clase: "IfcSlab", conteo: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        clave: "referencias",
        nombre: "Referencias",
        tipo: "referencias",
        hijos: [
          {
            clave: "referencias:ejes",
            nombre: "Ejes",
            tipo: "grupo",
            conteo: 1,
            hijos: [{ clave: "eje:g1", nombre: "1", tipo: "eje", globalid: "g1", conteo: 1 }],
          },
        ],
      },
    ],
  };
}

function vistaPlanta(id: string): Vista {
  return {
    id,
    nombre: "Planta " + id,
    tipo: "planta",
    nivel: "n0",
    alturaPlano: 0,
    nivelesVisibles: ["n0"],
    categorias: CATEGORIAS_TODAS(),
    estilo: "lineas-ocultas",
    escala: 100,
  };
}

beforeEach(() => {
  nucleo.mockReset();
  nucleo.mockImplementation(async () => ({} as never));
  useModelo.setState({
    arbol: arbolEjemplo(),
    vistas: [vistaPlanta("p0"), vistaPlanta("p1")],
    vistaActivaId: "p0",
    seleccion: null,
    seleccionados: [],
    propiedades: null,
    conCambios: false,
    error: null,
  });
});

function ocultosDeVista(id: string): string[] {
  return useModelo.getState().vistas.find((v) => v.id === id)?.arbolOcultos ?? [];
}

describe("alternarNodoArbol (ojo)", () => {
  it("ocultar una categoría esconde a todos sus elementos", async () => {
    await useModelo.getState().alternarNodoArbol("categoria:muros", "oculto");
    const ocultos = ocultosDeVista("p0");
    expect(ocultos).toEqual(["categoria:muros"]);
    const indice = indexarArbol(useModelo.getState().arbol);
    expect([...expandirGlobalids(indice, ocultos)].sort()).toEqual(["e1", "e2"]);
  });

  it("alternar dos veces deja la vista sin ocultos", async () => {
    const estado = useModelo.getState();
    await estado.alternarNodoArbol("categoria:muros", "oculto");
    await estado.alternarNodoArbol("categoria:muros", "oculto");
    expect(ocultosDeVista("p0")).toEqual([]);
  });
});

describe("estado por vista", () => {
  it("ocultar en Planta p0 no oculta en p1", async () => {
    await useModelo.getState().alternarNodoArbol("categoria:muros", "oculto");
    expect(ocultosDeVista("p0")).toEqual(["categoria:muros"]);
    expect(ocultosDeVista("p1")).toEqual([]);
  });

  it("el candado también se guarda por vista", async () => {
    const estado = useModelo.getState();
    await estado.alternarNodoArbol("categoria:losas", "bloqueado");
    expect(useModelo.getState().vistas.find((v) => v.id === "p0")?.arbolBloqueados).toEqual([
      "categoria:losas",
    ]);
    expect(useModelo.getState().vistas.find((v) => v.id === "p1")?.arbolBloqueados).toBeUndefined();
  });
});

describe("aislar y mostrar todo", () => {
  it("aislar una categoría oculta todo salvo su subárbol", async () => {
    await useModelo.getState().aislarNodoArbol("categoria:muros");
    const indice = indexarArbol(useModelo.getState().arbol);
    const ocultos = expandirGlobalids(indice, ocultosDeVista("p0"));
    // Solo queda visible e3 (la losa NO se oculta al aislar muros? No: se oculta).
    // Al aislar muros, la losa (e3) queda oculta.
    expect([...ocultos].sort()).toEqual(["e3"]);
  });

  it("mostrar todo limpia los ocultos de la vista activa", async () => {
    await useModelo.getState().alternarNodoArbol("categoria:muros", "oculto");
    await useModelo.getState().mostrarTodoArbol();
    expect(ocultosDeVista("p0")).toEqual([]);
  });
});

describe("selección múltiple", () => {
  it("seleccionar un tipo selecciona todos sus elementos", async () => {
    nucleo.mockImplementation(async (metodo: string) => {
      if (metodo === "modelo.propiedades") {
        return { globalid: "e2", clase: "IfcWall", nombre: "Muro 2", nivel: "Nivel 0", tipo: "Block 15", atributos: {}, materiales: [], psets: {} };
      }
      return {} as never;
    });
    await useModelo.getState().seleccionarVarios(["e1", "e2"]);
    expect(useModelo.getState().seleccionados).toEqual(["e1", "e2"]);
    expect(useModelo.getState().seleccion).toBe("e2");
    expect(useModelo.getState().propiedades?.globalid).toBe("e2");
  });
});
