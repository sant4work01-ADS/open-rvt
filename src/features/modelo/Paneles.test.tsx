// O011: paneles laterales plegables. El estado vive en la configuración de la app y
// el visor ocupa el espacio liberado.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModeloView } from "./ModeloView";
import { useModelo } from "./estado";
import { useTema } from "@/lib/tema";
import { montarApp } from "@/test/utiles";

// El visor real necesita WebGL; aquí se comprueba la disposición de los paneles.
vi.mock("./Visor3D", () => ({
  Visor3D: () => <div data-testid="visor-simulado" />,
}));

const VISTA = {
  id: "v1",
  nombre: "Planta Nivel 0",
  tipo: "planta" as const,
  nivelesVisibles: [],
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
  estilo: "aristas" as const,
  escala: 100 as const,
};

function montarModelo() {
  useModelo.setState({
    ruta: "modelo.ifc",
    esquema: "IFC4",
    nombreArchivo: "modelo.ifc",
    vistas: [VISTA],
    vistaActivaId: VISTA.id,
    mallas: [],
    cargando: false,
    error: null,
    seleccion: null,
    niveles: [],
    aberturas: [],
    estilos: useModelo.getState().estilos,
    caja: { min: [0, 0, 0], max: [10, 10, 10] },
    modoCorte: false,
    puntoCorte: null,
  });
  return render(<ModeloView />);
}

describe("O011: paneles laterales plegables", () => {
  beforeEach(() => {
    useTema.setState({ panelIzquierdoPlegado: false, panelDerechoPlegado: false });
  });
  afterEach(cleanup);

  it("el botón ‹ pliega el panel izquierdo y el › lo vuelve a abrir", () => {
    montarModelo();
    expect(screen.getByTestId("panel-vistas")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("panel-izquierdo-plegar"));
    expect(screen.queryByTestId("panel-vistas")).toBeNull();
    // Queda el botón de abrir; la barra de iconos de módulos no la pone ModeloView.
    fireEvent.click(screen.getByTestId("panel-izquierdo-abrir"));
    expect(screen.getByTestId("panel-vistas")).toBeInTheDocument();
    expect(useTema.getState().panelIzquierdoPlegado).toBe(false);
  });

  it("el panel derecho se pliega con › y se abre con ‹; el botón Propiedades sigue", () => {
    montarModelo();
    // Hay dos nodos con ese testid: el contenedor del panel y su aside.
    expect(screen.getAllByTestId("panel-propiedades").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("panel-derecho-plegar"));
    expect(screen.queryAllByTestId("panel-propiedades")).toHaveLength(0);
    expect(useTema.getState().panelDerechoPlegado).toBe(true);
    fireEvent.click(screen.getByTestId("panel-derecho-abrir"));
    expect(screen.getAllByTestId("panel-propiedades").length).toBeGreaterThan(0);
    // El botón de la barra superior sigue alternando el panel.
    fireEvent.click(screen.getByTestId("panel-propiedades-toggle"));
    expect(screen.queryAllByTestId("panel-propiedades")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("panel-propiedades-toggle"));
    expect(screen.getAllByTestId("panel-propiedades").length).toBeGreaterThan(0);
  });

  it("recuerda ambos estados en la configuración de la app", async () => {
    montarModelo();
    fireEvent.click(screen.getByTestId("panel-izquierdo-plegar"));
    fireEvent.click(screen.getByTestId("panel-derecho-plegar"));
    await waitFor(() => {
      expect(useTema.getState().panelIzquierdoPlegado).toBe(true);
      expect(useTema.getState().panelDerechoPlegado).toBe(true);
    });
    cleanup();
    // Al volver a montar, la preferencia se aplica sin tocar nada.
    montarModelo();
    expect(screen.queryByTestId("panel-vistas")).toBeNull();
    expect(screen.queryAllByTestId("panel-propiedades")).toHaveLength(0);
    expect(screen.getByTestId("panel-izquierdo-abrir")).toBeInTheDocument();
    expect(screen.getByTestId("panel-derecho-abrir")).toBeInTheDocument();
  });

  it("Ctrl+Alt+← y Ctrl+Alt+→ pliegan y abren los paneles", async () => {
    montarApp({ panelIzquierdoPlegado: false, panelDerechoPlegado: false });
    fireEvent.keyDown(window, { key: "ArrowLeft", ctrlKey: true, altKey: true });
    expect(useTema.getState().panelIzquierdoPlegado).toBe(true);
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true, altKey: true });
    expect(useTema.getState().panelDerechoPlegado).toBe(true);
    fireEvent.keyDown(window, { key: "ArrowLeft", ctrlKey: true, altKey: true });
    expect(useTema.getState().panelIzquierdoPlegado).toBe(false);
  });
});
