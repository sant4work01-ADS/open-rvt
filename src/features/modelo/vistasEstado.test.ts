// O022: duplicar y eliminar vistas desde el estado. Se comprueba el dato guardado
// (lista completa enviada a `vistas.guardar`), no sólo el estado en memoria.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import { CATEGORIAS_TODAS, type Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));
vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

function vista(id: string, nombre: string, tipo: Vista["tipo"]): Vista {
  return {
    id,
    nombre,
    tipo,
    nivelesVisibles: ["n0"],
    categorias: CATEGORIAS_TODAS(),
    estilo: "lineas-ocultas",
    escala: 100,
  };
}

const INICIALES = [
  vista("p0", "Planta baja", "planta"),
  vista("p1", "Planta alta", "planta"),
  vista("alz", "Alzado Norte", "alzado"),
];

function guardadas(): Vista[] {
  const llamada = nucleo.mock.calls.find(([metodo]) => metodo === "vistas.guardar");
  expect(llamada).toBeTruthy();
  return (llamada?.[1] as { lista: Vista[] }).lista;
}

beforeEach(() => {
  nucleo.mockReset();
  nucleo.mockImplementation(async () => ({ ok: true }));
  useModelo.setState({
    vistas: INICIALES.map((v) => ({ ...v, categorias: { ...v.categorias } })),
    vistaActivaId: "p0",
    conCambios: false,
  });
});

describe("O022: duplicar vista", () => {
  it("crea una copia completa con nombre «(copia)» justo después del original", async () => {
    const nuevoId = await useModelo.getState().duplicarVista("p0");
    expect(typeof nuevoId).toBe("string");
    const vistas = useModelo.getState().vistas;
    expect(vistas.map((v) => v.id)).toEqual(["p0", nuevoId, "p1", "alz"]);
    const copia = vistas[1];
    expect(copia.nombre).toBe("Planta baja (copia)");
    expect(copia.tipo).toBe("planta");
    expect(copia.categorias).toEqual(CATEGORIAS_TODAS());
    expect(copia.categorias).not.toBe(vistas[0].categorias);
    expect(useModelo.getState().vistaActivaId).toBe(nuevoId);
    expect(useModelo.getState().conCambios).toBe(true);
    // Flujo completo: la lista persistida incluye la copia.
    expect(guardadas().map((v) => v.id)).toEqual(["p0", nuevoId, "p1", "alz"]);
  });

  it("no repite nombres si ya existe una copia", async () => {
    await useModelo.getState().duplicarVista("p0");
    await useModelo.getState().duplicarVista("p0");
    const nombres = useModelo.getState().vistas.map((v) => v.nombre);
    expect(
      nombres.filter((n) => n.startsWith("Planta baja (copia)")).sort(),
    ).toEqual(["Planta baja (copia)", "Planta baja (copia) 2"]);
  });

  it("un id inexistente no cambia nada", async () => {
    const resultado = await useModelo.getState().duplicarVista("no-existe");
    expect(resultado).toBeNull();
    expect(useModelo.getState().vistas).toHaveLength(3);
    expect(nucleo).not.toHaveBeenCalled();
  });
});

describe("O022: eliminar vista", () => {
  it("elimina una de dos plantas y deja la lista persistida sin ella", async () => {
    const ok = await useModelo.getState().eliminarVista("p0");
    expect(ok).toBe(true);
    expect(useModelo.getState().vistas.map((v) => v.id)).toEqual(["p1", "alz"]);
    expect(guardadas().map((v) => v.id)).toEqual(["p1", "alz"]);
  });

  it("no elimina la última vista de su tipo", async () => {
    expect(await useModelo.getState().eliminarVista("alz")).toBe(false);
    expect(useModelo.getState().vistas).toHaveLength(3);
    expect(nucleo).not.toHaveBeenCalled();
  });

  it("si se elimina la activa, se activa otra vista existente", async () => {
    useModelo.setState({ vistaActivaId: "p0" });
    await useModelo.getState().eliminarVista("p0");
    expect(useModelo.getState().vistaActivaId).toBe("p1");
  });

  it("eliminar otra vista conserva la activa", async () => {
    useModelo.setState({ vistaActivaId: "p1" });
    await useModelo.getState().eliminarVista("p0");
    expect(useModelo.getState().vistaActivaId).toBe("p1");
  });
});
