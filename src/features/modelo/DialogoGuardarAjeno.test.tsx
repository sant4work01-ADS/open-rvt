// O066 punto 3: los tres caminos del aviso al guardar sobre un IFC ajeno.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { elegirDestinoIfc } from "@/lib/dialogos";
import { DialogoGuardarAjeno } from "./DialogoGuardarAjeno";
import { useModelo } from "./estado";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));
vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);
const dialogoDestino = vi.mocked(elegirDestinoIfc);

const INFO = {
  ruta: "/tmp/casa.ifc",
  esquema: "IFC4",
  con_cambios: false,
  elementos: 0,
  por_clase: {},
  nombre: "Casa",
};

beforeEach(() => {
  nucleo.mockReset();
  dialogoDestino.mockReset();
  dialogoDestino.mockResolvedValue(null);
  useModelo.setState({
    ajeno: true,
    ruta: "/tmp/casa.ifc",
    nombreArchivo: "casa.ifc",
    conCambios: true,
    preguntaGuardar: null,
    preguntaAjeno: { nombre: "casa.ifc", resolver: vi.fn() },
    cargando: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  useModelo.setState({ preguntaAjeno: null, ajeno: false });
});

describe("O066: diálogo de IFC ajeno", () => {
  it("muestra el aviso y los tres botones con Guardar como por omisión", () => {
    render(<DialogoGuardarAjeno />);
    const dialogo = screen.getByTestId("dialogo-guardar-ajeno");
    expect(dialogo.textContent).toContain(
      "Este IFC no lo creó OPEN-RVT. Guardarlo reescribe el archivo completo.",
    );
    expect(screen.getByTestId("ajeno-guardar-como").textContent).toBe("Guardar como…");
    expect(screen.getByTestId("ajeno-sobrescribir").textContent).toBe("Sobrescribir");
    expect(screen.getByTestId("ajeno-cancelar").textContent).toBe("Cancelar");
    expect(document.activeElement).toBe(screen.getByTestId("ajeno-guardar-como"));
  });

  it("Cancelar resuelve su camino y cierra el aviso", () => {
    const resolver = vi.fn();
    useModelo.setState({ preguntaAjeno: { nombre: "casa.ifc", resolver } });
    render(<DialogoGuardarAjeno />);
    fireEvent.click(screen.getByTestId("ajeno-cancelar"));
    expect(resolver).toHaveBeenCalledWith("cancelar");
    expect(useModelo.getState().preguntaAjeno).toBeNull();
  });

  it("Sobrescribir resuelve su camino y cierra el aviso", () => {
    const resolver = vi.fn();
    useModelo.setState({ preguntaAjeno: { nombre: "casa.ifc", resolver } });
    render(<DialogoGuardarAjeno />);
    fireEvent.click(screen.getByTestId("ajeno-sobrescribir"));
    expect(resolver).toHaveBeenCalledWith("sobrescribir");
    expect(useModelo.getState().preguntaAjeno).toBeNull();
  });

  it("Guardar como resuelve su camino y cierra el aviso", () => {
    const resolver = vi.fn();
    useModelo.setState({ preguntaAjeno: { nombre: "casa.ifc", resolver } });
    render(<DialogoGuardarAjeno />);
    fireEvent.click(screen.getByTestId("ajeno-guardar-como"));
    expect(resolver).toHaveBeenCalledWith("guardar_como");
    expect(useModelo.getState().preguntaAjeno).toBeNull();
  });

  it("Cancelar no escribe el archivo original", async () => {
    nucleo.mockResolvedValue(INFO);
    const guardado = useModelo.getState().guardar();
    await waitFor(() => expect(useModelo.getState().preguntaAjeno).not.toBeNull());
    useModelo.getState().responderGuardarAjeno("cancelar");
    await expect(guardado).resolves.toBe(false);
    expect(nucleo).not.toHaveBeenCalledWith("proyecto.guardar", expect.anything());
  });

  it("Sobrescribir guarda en la ruta original sin preguntar otra vez", async () => {
    nucleo.mockResolvedValue(INFO);
    const guardado = useModelo.getState().guardar();
    await waitFor(() => expect(useModelo.getState().preguntaAjeno).not.toBeNull());
    useModelo.getState().responderGuardarAjeno("sobrescribir");
    await expect(guardado).resolves.toBe(true);
    expect(nucleo).toHaveBeenCalledWith("proyecto.guardar", { ruta: null });
    expect(dialogoDestino).not.toHaveBeenCalled();
  });

  it("Guardar como pide otra ruta y no vuelve a preguntar", async () => {
    dialogoDestino.mockResolvedValue("/tmp/otro.ifc");
    nucleo.mockResolvedValue({ ...INFO, ruta: "/tmp/otro.ifc" });
    const guardado = useModelo.getState().guardar();
    await waitFor(() => expect(useModelo.getState().preguntaAjeno).not.toBeNull());
    useModelo.getState().responderGuardarAjeno("guardar_como");
    await expect(guardado).resolves.toBe(true);
    expect(dialogoDestino).toHaveBeenCalledTimes(1);
    expect(nucleo).toHaveBeenCalledWith("proyecto.guardar", {
      ruta: "/tmp/otro.ifc",
    });
  });
});
