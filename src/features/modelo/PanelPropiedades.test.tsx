// O010: el rango de vista queda en un grupo plegado, cerrado por omisión.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelo } from "./estado";
import { estilosPorDefecto } from "./estilos";
import { CLAVE_SECCIONES_PLEGADAS, PropiedadesVista } from "./PanelPropiedades";
import { CATEGORIAS, CATEGORIAS_TODAS, type Vista } from "./tipos";

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

describe("O022: secciones plegables y rejilla de estilos", () => {
  const dosNiveles = [
    { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
    { globalid: "n1", nombre: "Nivel 1", elevacion: 3 },
  ];

  function montar() {
    const actualizar = vi.fn(async (_id: string, _cambios: Partial<Vista>) => {});
    useModelo.setState({ niveles: dosNiveles, actualizarVista: actualizar });
    render(<PropiedadesVista vista={{ ...vista, nivelesVisibles: ["n0"] }} />);
    return actualizar;
  }

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it("tiene las cinco secciones de la spec", () => {
    montar();
    for (const id of ["identidad", "niveles", "categorias", "estilos", "graficos"]) {
      expect(screen.getByTestId(`seccion-${id}`)).toBeTruthy();
    }
  });

  it("el plegado se recuerda al volver a montar", () => {
    const { unmount } = render(<PropiedadesVista vista={vista} />);
    fireEvent.click(screen.getByTestId("seccion-niveles-plegar"));
    expect(localStorage.getItem(CLAVE_SECCIONES_PLEGADAS)).toBe(JSON.stringify(["niveles"]));
    unmount();

    useModelo.setState({ niveles: dosNiveles });
    render(<PropiedadesVista vista={vista} />);
    expect(screen.queryByTestId("nivel-visible-n0")).toBeNull();
    expect(
      screen.getByTestId("seccion-niveles-plegar").getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("Todos y ninguno afectan a los niveles con los ids exactos", async () => {
    const actualizar = montar();
    fireEvent.click(screen.getByTestId("niveles-todos"));
    expect(actualizar).toHaveBeenCalledWith(vista.id, { nivelesVisibles: ["n0", "n1"] });
    fireEvent.click(screen.getByTestId("niveles-ninguno"));
    expect(actualizar).toHaveBeenCalledWith(vista.id, { nivelesVisibles: [] });
  });

  it("Todos y ninguno afectan a todas las categorías", () => {
    const actualizar = montar();
    fireEvent.click(screen.getByTestId("categorias-ninguno"));
    const sinCategorias = actualizar.mock.calls[
      actualizar.mock.calls.length - 1
    ][1].categorias as unknown as Record<string, boolean>;
    expect(Object.keys(sinCategorias)).toHaveLength(CATEGORIAS.length);
    expect(Object.values(sinCategorias).every((v) => v === false)).toBe(true);
    fireEvent.click(screen.getByTestId("categorias-todos"));
    const conCategorias = actualizar.mock.calls[
      actualizar.mock.calls.length - 1
    ][1].categorias as unknown as Record<string, boolean>;
    expect(Object.values(conCategorias).every((v) => v === true)).toBe(true);
  });

  it("la rejilla de estilos tiene encabezados Proyección y Corte en mm", () => {
    montar();
    const rejilla = screen.getByTestId("vista-estilos-categorias");
    expect(rejilla.className).toContain("grid-cols-[minmax(0,1fr)_3.25rem_3.25rem]");
    expect(rejilla.className).not.toContain("overflow-x-auto");
    expect(within(rejilla).getByText("Proyección")).toBeTruthy();
    expect(within(rejilla).getByText("Corte")).toBeTruthy();
    expect(
      screen.getByTestId("vista-estilo-muros-proyeccion").getAttribute("aria-label"),
    ).toBe("Grosor de proyección de Muros en mm");
    expect(
      screen.getByTestId("vista-estilo-muros-corte").getAttribute("aria-label"),
    ).toBe("Grosor de corte de Muros en mm");
  });

  it("las filas de campos miden 28 px y no desbordan el ancho mínimo", () => {
    montar();
    for (const testid of ["nivel-visible-n0", "nivel-visible-n1"]) {
      const fila = screen.getByTestId(testid).closest("label");
      expect(fila?.className).toContain("h-7");
    }
    const entrada = screen.getByTestId("vista-estilo-muros-proyeccion");
    expect(entrada.className).toContain("min-w-0");
    expect(entrada.className).not.toContain("w-16");
  });
});
