// O010: el rango de vista queda en un grupo plegado, cerrado por omisión.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useModelo } from "./estado";
import { estilosPorDefecto } from "./estilos";
import { PropiedadesVista } from "./PanelPropiedades";
import { CATEGORIAS_TODAS, type Vista } from "./tipos";

const vista: Vista = {
  id: "planta-1",
  nombre: "Planta Nivel 0",
  tipo: "planta",
  nivel: "n0",
  alturaPlano: 1.2,
  profundidad: -1,
  alturaArriba: 3,
  nivelesVisibles: ["n0"],
  categorias: CATEGORIAS_TODAS(),
  estilo: "sombreado",
  escala: 100,
  cotasEjes: true,
};

describe("propiedades de la vista (O010)", () => {
  beforeEach(() => {
    useModelo.setState({
      niveles: [{ globalid: "n0", nombre: "Nivel 0", elevacion: 0 }],
      estilos: estilosPorDefecto(),
    });
  });
  afterEach(cleanup);

  it("el rango de vista está plegado y cerrado por omisión", () => {
    render(<PropiedadesVista vista={vista} />);
    const grupo = screen.getByTestId("vista-rango-avanzado");
    expect(grupo.tagName).toBe("DETAILS");
    expect((grupo as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText("Rango de vista (avanzado)")).toBeTruthy();
    expect(screen.getByTestId("vista-altura")).toBeTruthy();
    expect(screen.getByTestId("vista-profundidad")).toBeTruthy();
    expect(screen.getByTestId("vista-altura-arriba")).toBeTruthy();
  });

  it("cada campo del rango explica para qué sirve en un tooltip", () => {
    render(<PropiedadesVista vista={vista} />);
    for (const testid of ["vista-altura", "vista-profundidad", "vista-altura-arriba"]) {
      const campo = screen.getByTestId(testid);
      const etiqueta = campo.closest("label");
      expect(etiqueta?.getAttribute("title")?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it("un alzado no muestra el rango de vista", () => {
    render(<PropiedadesVista vista={{ ...vista, tipo: "alzado", orientacion: "sur" }} />);
    expect(screen.queryByTestId("vista-rango-avanzado")).toBeNull();
  });
});
