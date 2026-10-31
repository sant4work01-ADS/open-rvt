// O010: el rango de vista queda en un grupo plegado, cerrado por omisión.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    const actualizar = vi.fn<
      (id: string, cambios: Partial<Vista>) => Promise<void>
    >(async () => {});
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
    expect(rejilla.className).toContain("prop-estilos");
    expect(rejilla.className).not.toContain("overflow-x-auto");
    expect(
      Array.from(rejilla.querySelectorAll(".prop-estilos-encabezado")).map((el) =>
        el.textContent?.trim(),
      ),
    ).toEqual(["Objeto", "Proyección", "Corte"]);
    for (const [sufijo, texto] of [
      ["proyeccion", "Grosor de proyección de Muros en mm"],
      ["corte", "Grosor de corte de Muros en mm"],
    ]) {
      expect(
        screen.getByTestId(`vista-estilo-muros-${sufijo}`).getAttribute("aria-label"),
      ).toBe(texto);
    }
  });

  it("O022b: cada categoría de estilos lleva su etiqueta propia para el ancho angosto", () => {
    montar();
    const proyeccion = screen.getByTestId("vista-estilo-muros-proyeccion");
    const campo = proyeccion.parentElement as HTMLElement;
    expect(campo.className).toContain("prop-estilo-campo");
    expect(campo.textContent).toContain("Proyección");
    const corte = screen.getByTestId("vista-estilo-muros-corte");
    expect((corte.parentElement as HTMLElement).textContent).toContain("Corte");
  });

  it("O022b: Proyección y Corte muestran el valor correcto del modelo (Muros)", () => {
    montar();
    // estilos.ts (por defecto): muros = { corte: 0.5, proyeccion: 0.18 }.
    expect(
      (screen.getByTestId("vista-estilo-muros-proyeccion") as HTMLInputElement).value,
    ).toBe("0.18");
    expect(
      (screen.getByTestId("vista-estilo-muros-corte") as HTMLInputElement).value,
    ).toBe("0.5");
    // estilos.ts (por defecto): puertas = { corte: 0.25, proyeccion: 0.13 }.
    expect(
      (screen.getByTestId("vista-estilo-puertas-proyeccion") as HTMLInputElement).value,
    ).toBe("0.13");
    expect(
      (screen.getByTestId("vista-estilo-puertas-corte") as HTMLInputElement).value,
    ).toBe("0.25");
  });

  it("O022b: el contenedor y las filas usan las clases adaptables", () => {
    montar();
    expect(screen.getByTestId("propiedades-vista").className).toContain(
      "propiedades-adaptable",
    );
    const nombre = screen.getByTestId("vista-nombre").closest("label");
    expect(nombre?.className).toContain("prop-fila");
    expect(nombre?.querySelector(".prop-etiqueta")?.textContent).toBe("Nombre");
    expect(screen.getByTestId("vista-tipo").closest("label")?.className).toContain("prop-fila");
    const categorias = screen.getByTestId("categoria-muros").closest("div");
    expect(categorias?.className).toContain("prop-categorias");
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
