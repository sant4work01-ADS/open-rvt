// O070: la pantalla dividida dibuja dos visores independientes, marca el activo
// con borde de acento y reparte el ancho con el separador (20 % mínimo).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AreaDividida } from "./visor/AreaDividida";
import { useModelo } from "./estado";
import { CATEGORIAS_TODAS, type Caja, type Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn(async () => undefined) },
}));

const CLAVES: Array<string | undefined> = [];
vi.mock("./Visor3D", () => ({
  Visor3D: (props: { vista: Vista; claveCamara?: string; panelIndice?: 0 | 1 }) => {
    CLAVES.push(props.claveCamara);
    return (
      <div data-testid={`visor-simulado-${props.panelIndice ?? "unico"}`}>
        {props.vista.nombre}
      </div>
    );
  },
}));

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

const VISTAS = [
  vista("planta-n0", "Planta Nivel 0", "planta"),
  vista("iso", "3D Perspectiva", "perspectiva"),
];

const CAJA: Caja = { min: [0, 0, 0], max: [10, 10, 3] };

function props() {
  return {
    vistas: VISTAS,
    niveles: [],
    mallas: [],
    estilos: {} as never,
    aberturas: [],
    caja: CAJA,
    seleccion: null,
    seleccionados: [],
    modoCorte: false,
    puntoCorte: null,
    onSeleccionar: () => undefined,
    onSeleccionarVarios: () => undefined,
    onPuntoCorte: () => undefined,
    onEscape: () => undefined,
  };
}

beforeEach(() => {
  CLAVES.length = 0;
  useModelo.getState().reactivarEdicion();
  useModelo.setState({
    vistas: VISTAS,
    vistaActivaId: "planta-n0",
    paneles: [{ vistaId: "planta-n0" }, { vistaId: null }],
    panelActivo: 0,
    dividida: false,
    orientacionDivision: "vertical",
    proporcionDivision: 0.5,
  });
});

afterEach(cleanup);

describe("O070: área dividida", () => {
  it("sin dividir hay un solo visor con la vista activa", () => {
    render(<AreaDividida {...props()} vista={VISTAS[0]} />);
    expect(screen.getByTestId("area-dividida").dataset.dividida).toBe("no");
    expect(screen.getAllByTestId("visor-simulado-unico")).toHaveLength(1);
    expect(CLAVES).toEqual([undefined]);
  });

  it("dividida muestra dos paneles, cada uno con su vista y su cámara", () => {
    useModelo.setState({
      dividida: true,
      paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }],
    });
    render(<AreaDividida {...props()} vista={VISTAS[0]} />);
    expect(screen.getByTestId("area-dividida").dataset.dividida).toBe("si");
    expect(screen.getByTestId("panel-nombre-0").textContent).toContain("Planta Nivel 0");
    expect(screen.getByTestId("panel-nombre-1").textContent).toContain("3D Perspectiva");
    // Cada panel guarda su cámara con una clave distinta (no se pisan).
    expect(CLAVES).toEqual(["0:planta-n0", "1:iso"]);
  });

  it("el panel activo lleva borde de acento de 2 px", () => {
    useModelo.setState({ dividida: true, paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }] });
    render(<AreaDividida {...props()} vista={VISTAS[0]} />);
    const primero = screen.getByTestId("panel-vista-0");
    const segundo = screen.getByTestId("panel-vista-1");
    expect(primero.dataset.activo).toBe("si");
    expect(segundo.dataset.activo).toBe("no");
    expect(primero.className).toContain("border-2");
    expect(primero.className).toContain("border-primary");
    expect(segundo.className).not.toContain("border-primary");
  });

  it("pulsar en el otro panel lo activa y sus propiedades pasan a ser las suyas", () => {
    useModelo.setState({ dividida: true, paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }] });
    render(<AreaDividida {...props()} vista={VISTAS[0]} />);
    fireEvent.pointerDown(screen.getByTestId("panel-vista-1"));
    expect(useModelo.getState().panelActivo).toBe(1);
    expect(useModelo.getState().vistaActivaId).toBe("iso");
    expect(screen.getByTestId("panel-vista-1")).toBeTruthy();
  });

  it("la rueda dentro de un panel también lo activa antes de hacer zoom", () => {
    useModelo.setState({ dividida: true, paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }] });
    render(<AreaDividida {...props()} vista={VISTAS[0]} />);
    fireEvent.wheel(screen.getByTestId("panel-vista-1"));
    expect(useModelo.getState().panelActivo).toBe(1);
  });

  it("arrastrar el separador al 5 % lo deja en el 20 % mínimo", () => {
    useModelo.setState({ dividida: true, paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }] });
    const rect = { left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}) };
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
    try {
      render(<AreaDividida {...props()} vista={VISTAS[0]} />);
      const separador = screen.getByTestId("separador-paneles");
      fireEvent.pointerDown(separador, { clientX: 500, clientY: 250 });
      fireEvent.pointerMove(window, { clientX: 50, clientY: 250 });
      expect(screen.getByTestId("area-dividida").dataset.proporcion).toBe("0.2000");
      fireEvent.pointerUp(window);
      expect(useModelo.getState().proporcionDivision).toBe(0.2);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });

  it("doble clic en el separador vuelve a 50/50", () => {
    useModelo.setState({
      dividida: true,
      proporcionDivision: 0.7,
      paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }],
    });
    render(<AreaDividida {...props()} vista={VISTAS[0]} />);
    fireEvent.doubleClick(screen.getByTestId("separador-paneles"));
    expect(useModelo.getState().proporcionDivision).toBe(0.5);
  });
});
