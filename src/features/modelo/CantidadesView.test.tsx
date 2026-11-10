// O009: vista Cantidades: despliega los renglones, selecciona el elemento y exporta.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { llamar, elegir } = vi.hoisted(() => ({
  llamar: vi.fn(),
  elegir: vi.fn(),
}));

vi.mock("@/lib/bitacora", () => ({
  llamarConBitacora: (metodo: string, params: Record<string, unknown>) =>
    llamar(metodo, params),
}));
vi.mock("@/lib/dialogos", () => ({
  elegirDestinoMedicion: (nombre: string) => elegir(nombre),
}));

import { CantidadesView } from "./CantidadesView";
import { useModelo } from "./estado";

const PARTIDAS = [
  {
    clave: "MUR-B15",
    nombre: "Muro de block 15",
    unidad: "m2",
    total: 18.2,
    renglones: [
      {
        eje: "A / 1-2",
        tramo: "Nivel 0",
        descripcion: "Muro block 15 · M-1",
        piezas: null,
        largo: 7,
        ancho: null,
        alto: 2.6,
        resultado: 18.2,
        globalid: "gid-muro-1",
      },
    ],
  },
  {
    clave: "",
    nombre: "Aplanado exterior",
    unidad: "m2",
    total: 4.5,
    renglones: [
      {
        eje: "",
        tramo: "Nivel 0",
        descripcion: "Muro block 15 · M-1",
        piezas: null,
        largo: null,
        ancho: null,
        alto: null,
        resultado: 4.5,
        globalid: "gid-muro-2",
      },
    ],
  },
];

let seleccionado: string | null = null;

function preparar() {
  seleccionado = null;
  useModelo.setState({
    conCambios: false,
    nombreArchivo: "casa.ifc",
    niveles: [{ globalid: "n0", nombre: "Nivel 0", elevacion: 0 }],
    seleccionar: async (gid: string | null) => {
      seleccionado = gid;
    },
    fijarAviso: () => undefined,
  });
  llamar.mockImplementation(async (metodo: string) => {
    if (metodo === "medicion.calcular") return { partidas: PARTIDAS };
    if (metodo === "medicion.exportar") return { ruta: "/tmp/x.openrvt-medicion.json" };
    return {};
  });
  elegir.mockResolvedValue("/tmp/x.openrvt-medicion.json");
}

afterEach(() => {
  llamar.mockReset();
  elegir.mockReset();
});

describe("vista Cantidades", () => {
  it("muestra las partidas, avisa de las que no tienen clave y despliega renglones", async () => {
    preparar();
    render(<CantidadesView />);
    expect(await screen.findByText("Muro de block 15")).toBeInTheDocument();
    expect(screen.getByTestId("cantidades-aviso-1")).toHaveTextContent("Sin clave");
    expect(screen.getByText("Sin clave de PP: ponla en el tipo")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cantidades-partida-0"));
    const renglon = await screen.findByTestId("cantidades-renglon-0-0");
    expect(renglon).toHaveTextContent("A / 1-2");
    expect(renglon).toHaveTextContent("18.2");

    fireEvent.click(renglon);
    await waitFor(() => expect(seleccionado).toBe("gid-muro-1"));
  });

  it("muestra el error de una losa sin contorno y no la suma", async () => {
    preparar();
    llamar.mockImplementation(async (metodo: string) => {
      if (metodo === "medicion.calcular") {
        return {
          partidas: [PARTIDAS[0]],
          errores: [{ globalid: "gid-losa", mensaje: "sin contorno legible" }],
        };
      }
      return {};
    });
    render(<CantidadesView />);
    expect(await screen.findByTestId("cantidades-error-gid-losa")).toBeInTheDocument();
  });

  it("exporta con el diálogo de guardar y la ruta elegida", async () => {
    preparar();
    render(<CantidadesView />);
    fireEvent.click(await screen.findByTestId("cantidades-exportar"));
    await waitFor(() =>
      expect(llamar).toHaveBeenCalledWith("medicion.exportar", {
        ruta: "/tmp/x.openrvt-medicion.json",
      }),
    );
    expect(elegir).toHaveBeenCalledWith("casa");
  });
});
