// O037: el borrado de nivel debe reflejarse en el estado (niveles) al instante y en
// la geometría del alzado (calcularLayoutAlzado) sin dejar cabezas ni cotas del nivel
// borrado. Flujo completo: botón/estado → núcleo (mock) → estado → layout del alzado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { quitarPlantasHuerfanas, useModelo } from "./estado";
import { textoEliminar } from "./NavegadorVistas";
import type { Vista } from "./tipos";
import { calcularLayoutAlzado } from "./anotacionVista";
import { estilosPorDefecto } from "./estilos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));

vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

type NivelMock = { globalid: string; nombre: string; elevacion: number };

function nivelesBase(): NivelMock[] {
  const niveles: NivelMock[] = [{ globalid: "N0", nombre: "Nivel 0", elevacion: 0 }];
  for (let i = 1; i <= 8; i += 1) {
    niveles.push({ globalid: `N${i}`, nombre: `Nivel ${i}`, elevacion: i * 0.6 });
  }
  return niveles;
}

let niveles: NivelMock[];

beforeEach(() => {
  niveles = nivelesBase();
  nucleo.mockReset();
  nucleo.mockImplementation(async (metodo: string, crudo: unknown = {}) => {
    const params = (crudo ?? {}) as Record<string, unknown>;
    if (metodo === "niveles.borrar") {
      const gid = String(params.globalid);
      niveles = niveles.filter((n) => n.globalid !== gid);
      return { creados: [], modificados: [], borrados: [gid], mensaje: "Nivel borrado." };
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
    if (metodo === "modelo.niveles") return niveles;
    if (metodo === "elementos.borrar") {
      // Supr sobre la cabeza de un nivel: el núcleo borra el IfcBuildingStorey.
      const gids = (params.globalids as string[]) ?? [];
      niveles = niveles.filter((n) => !gids.includes(n.globalid));
      return { creados: [], modificados: [], borrados: gids, mensaje: "Borrado." };
    }
    if (metodo === "modelo.elementos") return [];
    if (metodo === "modelo.referencias") {
      return { muros: [], extremos: [], medios: [], ejes: [], intersecciones: [] };
    }
    if (metodo === "geometria.teselar") return { elementos: [] };
    return {};
  });

  useModelo.setState({
    ruta: "modelo.ifc",
    nombreArchivo: "modelo.ifc",
    esquema: "IFC4",
    conCambios: false,
    niveles,
    elementos: [],
    mallas: [],
    caja: { min: [0, 0, 0], max: [4, 3, 3.6] },
    vistas: [],
    vistaActivaId: null,
    seleccionados: [],
    referencias: { muros: [], extremos: [], medios: [], ejes: [], intersecciones: [] },
    aviso: null,
    error: null,
  });
});

function layoutDeNiveles(lista: NivelMock[]) {
  const estilo = estilosPorDefecto();
  return calcularLayoutAlzado({
    niveles: lista.map((n) => ({ globalid: n.globalid, nombre: n.nombre, elevacion: n.elevacion })),
    ejes: [],
    estiloNivel: estilo.niveles,
    estiloEje: estilo.ejes,
    estiloCota: estilo.cotas.lista[0],
    escala: 100,
    tMinCaja: -1,
    tMaxCaja: 4,
  });
}

describe("O037: el alzado no dibuja niveles borrados", () => {
  it("borrar un nivel lo quita de `niveles` y de las cabezas y cotas del alzado", async () => {
    await useModelo.getState().borrarNivel("N8");

    const gids = useModelo.getState().niveles.map((n) => n.globalid);
    expect(gids).not.toContain("N8");
    expect(gids).toContain("N7");

    // El alzado, alimentado con los niveles resultantes del estado, no produce
    // cabezas ni cotas para el nivel borrado (0.60·8 = 4.80 no aparece).
    const layout = layoutDeNiveles(useModelo.getState().niveles);
    expect(layout.cabezas.map((c) => c.globalid)).not.toContain("N8");
    expect(layout.cabezas.map((c) => c.elevacion)).not.toContain(4.8);
    // La total tampoco llega al nivel borrado: 4.80 − 0 = 4.80 se quedó en 4.20.
    expect(layout.total?.valor).toBeCloseTo(4.2, 9);
  });

  it("el campo general de cabezas/cotas no conserva el nivel borrado en secuencia", async () => {
    // Secuencia: se borran dos niveles altos (N8 y N7) y el alzado debe reflejar
    // ambas bajas sin dejar residuos en cabezas, parciales ni total.
    await useModelo.getState().borrarNivel("N8");
    await useModelo.getState().borrarNivel("N7");

    const layout = layoutDeNiveles(useModelo.getState().niveles);
    const elevaciones = layout.cabezas.map((c) => c.elevacion);
    expect(elevaciones).not.toContain(4.8);
    expect(elevaciones).not.toContain(4.2);
    expect(layout.total?.valor).toBeCloseTo(3.6, 9);
    // La cadena de cotas encoge: de 8 tramos (9 niveles) a 6 tramos (7 niveles).
    expect(layout.parciales).toHaveLength(6);
  });
});

// Captura del usuario: 7 plantas y 9 niveles en el alzado. Eliminar la vista
// «Planta Nivel X» quitaba solo la vista y el nivel seguía en los alzados.
function plantas(): Vista[] {
  return nivelesBase().map((n) => ({
    id: `planta-${n.globalid}`,
    nombre: `Planta ${n.nombre}`,
    tipo: "planta",
    nivel: n.globalid,
  })) as Vista[];
}

describe("O037: eliminar la última planta de un nivel borra el nivel", () => {
  it("eliminar «Planta Nivel 8» borra el nivel y el alzado ya no lo dibuja", async () => {
    useModelo.setState({ vistas: plantas(), vistaActivaId: "planta-N0" });
    const ok = await useModelo.getState().eliminarVista("planta-N8");
    expect(ok).toBe(true);
    const estado = useModelo.getState();
    expect(estado.niveles.map((n) => n.globalid)).not.toContain("N8");
    expect(estado.vistas.map((v) => v.id)).not.toContain("planta-N8");
    expect(nucleo).toHaveBeenCalledWith("niveles.borrar", { globalid: "N8" });
    const layout = layoutDeNiveles(estado.niveles);
    expect(layout.cabezas.map((c) => c.globalid)).not.toContain("N8");
  });

  it("una planta duplicada del mismo nivel se elimina sin tocar el nivel", async () => {
    const copia = { ...plantas()[8], id: "planta-N8-copia", nombre: "Planta Nivel 8 (copia)" };
    useModelo.setState({ vistas: [...plantas(), copia], vistaActivaId: "planta-N0" });
    expect(await useModelo.getState().eliminarVista("planta-N8-copia")).toBe(true);
    expect(useModelo.getState().niveles.map((n) => n.globalid)).toContain("N8");
    expect(nucleo).not.toHaveBeenCalledWith("niveles.borrar", expect.anything());
  });

  it("si el núcleo rechaza el borrado, la planta y el nivel se quedan", async () => {
    useModelo.setState({ vistas: plantas(), vistaActivaId: "planta-N0" });
    const base = nucleo.getMockImplementation()!;
    nucleo.mockImplementation(async (metodo: string, crudo?: unknown) => {
      if (metodo === "niveles.borrar") throw new Error("El nivel «Nivel 8» tiene 2 elemento(s)");
      return base(metodo, crudo);
    });
    expect(await useModelo.getState().eliminarVista("planta-N8")).toBe(false);
    const estado = useModelo.getState();
    expect(estado.vistas.map((v) => v.id)).toContain("planta-N8");
    expect(estado.niveles.map((n) => n.globalid)).toContain("N8");
    expect(estado.error).toBeTruthy();
  });

  it("borrar el nivel con Supr (elementos.borrar) quita también su planta", async () => {
    useModelo.setState({ vistas: plantas(), vistaActivaId: "planta-N7", seleccionados: ["N7"] });
    await useModelo.getState().borrarSeleccion();
    const estado = useModelo.getState();
    expect(estado.vistas.map((v) => v.id)).not.toContain("planta-N7");
    expect(estado.vistaActivaId).not.toBe("planta-N7");
    expect(estado.vistas.filter((v) => v.tipo === "planta")).toHaveLength(8);
  });

  it("quitarPlantasHuerfanas nunca deja el proyecto sin plantas", () => {
    expect(quitarPlantasHuerfanas(plantas(), [])).toHaveLength(9);
    expect(quitarPlantasHuerfanas(plantas(), nivelesBase().slice(0, 2))).toHaveLength(2);
  });

  it("el aviso de confirmación dice que se borra el nivel solo en la última planta", () => {
    const lista = plantas();
    expect(textoEliminar(lista[8], lista, nivelesBase())).toContain("y su nivel «Nivel 8»");
    const copia = { ...lista[8], id: "c" };
    expect(textoEliminar(lista[8], [...lista, copia], nivelesBase())).toBe("¿Eliminar «Planta Nivel 8»?");
  });
});

