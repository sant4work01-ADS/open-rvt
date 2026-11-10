// O063 punto 2: clasificación, bloqueo y aviso del núcleo caído.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import {
  MENSAJE_NUCLEO_CAIDO,
  bloquearComandosDeEdicion,
  esMetodoMutador,
  permitidoConNucleoCaido,
  verificarPuertaNucleo,
} from "./nucleoCaido";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn() },
}));
vi.mock("@/lib/dialogos", () => ({
  elegirDestinoIfc: vi.fn(async () => null),
  elegirIfcParaAbrir: vi.fn(async () => null),
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

beforeEach(() => {
  nucleo.mockReset();
  useModelo.getState().reactivarEdicion();
  useModelo.setState({ error: null, aviso: null, avisoNucleo: null });
});

afterEach(() => {
  useModelo.getState().reactivarEdicion();
});

describe("núcleo caído", () => {
  it("clasifica mutadores y lecturas", () => {
    expect(esMetodoMutador("muros.crear")).toBe(true);
    expect(esMetodoMutador("elementos.borrar")).toBe(true);
    expect(esMetodoMutador("historial.deshacer")).toBe(true);
    expect(esMetodoMutador("modelo.elementos")).toBe(false);
    expect(esMetodoMutador("geometria.teselar")).toBe(false);
    expect(permitidoConNucleoCaido("proyecto.abrir")).toBe(true);
    expect(permitidoConNucleoCaido("proyecto.nuevo")).toBe(true);
    expect(permitidoConNucleoCaido("muros.crear")).toBe(false);
  });

  it("la puerta lanza y no llama al núcleo para editar", async () => {
    useModelo.getState().marcarNucleoCaido("El núcleo se reinició; …");
    expect(() => verificarPuertaNucleo("muros.crear")).toThrow(MENSAJE_NUCLEO_CAIDO);
    await useModelo.getState().deshacer();
    expect(nucleo).not.toHaveBeenCalled();
    expect(useModelo.getState().error).toBe(MENSAJE_NUCLEO_CAIDO);

    // Las lecturas siguen pasando por la puerta.
    await useModelo.getState().comprobarNucleo();
    expect(nucleo).toHaveBeenCalledWith("nucleo.ping", {});
  });

  it("bloquea los comandos de edición y deja Nuevo, Abrir y temas", () => {
    const comandos = bloquearComandosDeEdicion([
      { id: "nuevo", habilitado: true },
      { id: "abrir", habilitado: true },
      { id: "tema-oscuro", habilitado: true },
      { id: "muro", habilitado: true },
      { id: "deshacer", habilitado: true },
    ]);
    const porId = Object.fromEntries(comandos.map((c) => [c.id, c.habilitado]));
    expect(porId).toEqual({
      nuevo: true,
      abrir: true,
      "tema-oscuro": true,
      muro: false,
      deshacer: false,
    });
  });
});

describe("aviso modal", () => {
  it("muestra el texto y «Entendido» lo cierra sin desbloquear la edición", async () => {
    const { AvisoNucleoCaido } = await import("./AvisoNucleoCaido");
    useModelo.getState().marcarNucleoCaido(MENSAJE_NUCLEO_CAIDO);
    render(<AvisoNucleoCaido />);
    expect(screen.getByTestId("aviso-nucleo-caido")).toBeInTheDocument();
    expect(screen.getByText(MENSAJE_NUCLEO_CAIDO)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(useModelo.getState().avisoNucleo).toBeNull();
    expect(useModelo.getState().nucleoCaido).toBe(true);
  });
});
