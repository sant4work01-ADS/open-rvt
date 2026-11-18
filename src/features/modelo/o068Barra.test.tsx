// O068: la barra de Ventana muestra las medidas y el nivel de la vista, y la de
// Mover ofrece «Listo» solo mientras se eligen elementos.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BarraHerramienta } from "./BarraHerramienta";
import { useModelo } from "./estado";
import type { Vista } from "./tipos";

afterEach(cleanup);

const vista: Vista = {
  id: "planta-n1",
  nombre: "Planta Nivel 1",
  tipo: "planta",
  nivel: "N1",
  alturaPlano: 4.2,
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

describe("O068: barra de Ventana", () => {
  it("muestra 1.20 / 1.20 / 0.90 y el nivel de la vista", () => {
    useModelo.setState({
      herramienta: "ventana",
      vistaActivaId: vista.id,
      vistas: [vista],
      niveles: [
        { globalid: "N0", nombre: "Nivel 0", elevacion: 0 },
        { globalid: "N1", nombre: "Nivel 1", elevacion: 3 },
      ],
      opcionesAbertura: { ancho: 1.2, alto: 1.2, antepecho: 0.9, nivel: "N1" },
    });
    render(<BarraHerramienta />);
    expect((screen.getByTestId("abertura-ancho") as HTMLInputElement).value).toBe("1.2");
    expect((screen.getByTestId("abertura-alto") as HTMLInputElement).value).toBe("1.2");
    expect((screen.getByTestId("abertura-antepecho") as HTMLInputElement).value).toBe("0.9");
    expect((screen.getByTestId("abertura-nivel") as HTMLSelectElement).value).toBe("N1");
    fireEvent.change(screen.getByTestId("abertura-nivel"), {
      target: { value: "N0" },
    });
    expect(useModelo.getState().opcionesAbertura.nivel).toBe("N0");
  });
});

describe("O068: barra de Mover", () => {
  it("en la fase de selección muestra Listo y lo oculta en el punto base", () => {
    useModelo.setState({
      herramienta: "mover",
      faseMover: "seleccionar",
      seleccionados: [],
      ejeSeleccionado: null,
      opcionesMuro: {
        tipo: "",
        altura: 2.6,
        alineacion: "centro",
        lineaUbicacion: "eje_nucleo",
        desfaseUbicacion: 0,
      },
    });
    render(<BarraHerramienta />);
    expect(screen.getByTestId("mover-listo")).toBeTruthy();
    expect((screen.getByTestId("mover-paso") as HTMLElement).textContent).toContain(
      "Seleccione",
    );
    cleanup();
    useModelo.setState({ faseMover: "base", seleccionados: ["m1"] });
    render(<BarraHerramienta />);
    expect(screen.queryByTestId("mover-listo")).toBeNull();
    expect((screen.getByTestId("mover-paso") as HTMLElement).textContent).toContain(
      "Punto base",
    );
  });
});
