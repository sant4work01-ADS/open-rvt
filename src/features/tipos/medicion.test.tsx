// O009: pestaña Medición del editor de tipos (agregar, cambiar criterio, restablecer).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { llamar } = vi.hoisted(() => ({ llamar: vi.fn() }));

vi.mock("@/lib/bitacora", () => ({
  llamarConBitacora: (metodo: string, params: Record<string, unknown>) =>
    llamar(metodo, params),
}));

import { useModelo } from "@/features/modelo/estado";
import { EditorTipos } from "./EditorTipos";
import type { PartidaMedicion, TipoElemento } from "@/features/modelo/tipos";

const PARTIDAS: PartidaMedicion[] = [
  {
    Nombre: "Muro de block 15",
    ClavePP: "",
    Unidad: "m2",
    Criterio: "area_nucleo",
    Capa: null,
  },
  {
    Nombre: "Aplanado exterior",
    ClavePP: "APL-EXT",
    Unidad: "m2",
    Criterio: "area_capa",
    Capa: 0,
  },
];

const TIPO: TipoElemento = {
  globalid: "tipo-1",
  nombre: "Muro prueba 15",
  clase: "IfcWallType",
  parametros: { LineaUbicacion: "eje_nucleo" },
  capas: [
    {
      material: "Aplanado de mortero (repellado)",
      funcion: "acabado",
      espesor: 0.015,
    },
    { material: "Block de concreto 15", funcion: "núcleo", espesor: 0.15 },
  ],
  instancias: 1,
  partidas: PARTIDAS,
  criterios: ["area_nucleo", "area_capa", "largo"],
};

function preparar() {
  useModelo.setState({ recargarTipos: async () => undefined });
  llamar.mockImplementation(async (metodo: string, params: Record<string, unknown>) => {
    if (metodo === "materiales.listar") return [];
    if (metodo === "tipos.listar") {
      return params.clase === "IfcWallType"
        ? [{ globalid: "tipo-1", nombre: TIPO.nombre, clase: TIPO.clase, instancias: 1 }]
        : [];
    }
    if (metodo === "acero.varillas") return { varillas: {}, armex: {} };
    if (metodo === "tipos.obtener") return TIPO;
    if (metodo === "medicion.partidas_omision") return PARTIDAS;
    return {};
  });
}

afterEach(() => {
  llamar.mockReset();
});

describe("pestaña Medición", () => {
  it("agrega una partida, cambia el criterio y restablece las de omisión", async () => {
    preparar();
    render(<EditorTipos onCerrar={() => undefined} />);

    const pestana = await screen.findByTestId("pestana-medicion");
    fireEvent.click(pestana);
    expect(await screen.findByTestId("tabla-medicion")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^partida-fila-/)).toHaveLength(2);
    expect(screen.getByTestId("partida-unidad-1").textContent).toBe("m2");

    fireEvent.click(screen.getByTestId("medicion-agregar"));
    expect(screen.getAllByTestId(/^partida-fila-/)).toHaveLength(3);

    fireEvent.change(screen.getByTestId("partida-criterio-2"), {
      target: { value: "largo" },
    });
    expect(screen.getByTestId("partida-unidad-2").textContent).toBe("m");

    fireEvent.click(screen.getByTestId("medicion-restablecer"));
    await waitFor(() =>
      expect(screen.getAllByTestId(/^partida-fila-/)).toHaveLength(2),
    );
    expect(llamar).toHaveBeenCalledWith("medicion.partidas_omision", {
      globalid: "tipo-1",
    });
    expect(screen.getByTestId("partida-clave-1")).toHaveValue("APL-EXT");
  });

  it("quitar una partida deja solo las demás", async () => {
    preparar();
    render(<EditorTipos onCerrar={() => undefined} />);
    fireEvent.click(await screen.findByTestId("pestana-medicion"));
    await screen.findByTestId("tabla-medicion");
    fireEvent.click(screen.getByTestId("partida-quitar-0"));
    expect(screen.getAllByTestId(/^partida-fila-/)).toHaveLength(1);
    expect(screen.getByTestId("partida-clave-0")).toHaveValue("APL-EXT");
  });
});
