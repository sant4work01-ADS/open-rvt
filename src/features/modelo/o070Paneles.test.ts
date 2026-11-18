// O070: la pantalla dividida en el estado del modelo. Los valores esperados son
// los de la spec (dos paneles, 20–80 %, vista activa = panel activo) y el JSON
// que llega al pset se comprueba tal cual, no con expresiones regulares.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "@/lib/ipc";
import { useModelo } from "./estado";
import { CATEGORIAS_TODAS, type Vista } from "./tipos";

vi.mock("@/lib/ipc", () => ({
  ipc: { nucleoLlamar: vi.fn(async () => undefined) },
}));

const nucleo = vi.mocked(ipc.nucleoLlamar);

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

const VISTAS: Vista[] = [
  vista("planta-n0", "Planta Nivel 0", "planta"),
  vista("alzado", "Alzado Sur", "alzado"),
  vista("iso", "3D Isométrica", "iso"),
];

const CANCELAR_TRAZO = vi.fn(() => true);
const CANCELAR_HERRAMIENTA = vi.fn();

beforeEach(() => {
  nucleo.mockClear();
  useModelo.getState().reactivarEdicion();
  useModelo.setState({
    vistas: VISTAS,
    vistaActivaId: "planta-n0",
    paneles: [{ vistaId: "planta-n0" }, { vistaId: null }],
    panelActivo: 0,
    dividida: false,
    orientacionDivision: "vertical",
    proporcionDivision: 0.5,
    herramienta: null,
    modoCorte: false,
    puntoCorte: null,
    error: null,
    cancelarTrazo: CANCELAR_TRAZO,
    cancelarHerramienta: CANCELAR_HERRAMIENTA,
  });
  CANCELAR_TRAZO.mockClear();
  CANCELAR_HERRAMIENTA.mockClear();
});

describe("O070: dividir y unir", () => {
  it("dividir vertical deja dos paneles con vistas distintas y guarda el pset", async () => {
    await useModelo.getState().dividirVistas("vertical");
    const estado = useModelo.getState();
    expect(estado.dividida).toBe(true);
    expect(estado.orientacionDivision).toBe("vertical");
    expect(estado.paneles[0].vistaId).toBe("planta-n0");
    // La compañera es de otro tipo para que se vea algo distinto que la planta.
    expect(estado.paneles[1].vistaId).toBe("alzado");
    expect(estado.vistaActivaId).toBe("planta-n0");

    const guardado = nucleo.mock.calls.find(([metodo]) => metodo === "paneles.guardar");
    expect(guardado?.[1]).toEqual({
      datos: {
        dividida: true,
        orientacion: "vertical",
        proporcion: 0.5,
        paneles: [{ vistaId: "planta-n0" }, { vistaId: "alzado" }],
        panelActivo: 0,
      },
    });
  });

  it("dividir horizontal conserva la orientación y una vista se queda con la del activo", async () => {
    await useModelo.getState().dividirVistas("horizontal");
    expect(useModelo.getState().orientacionDivision).toBe("horizontal");
    useModelo.getState().fijarPanelActivo(1);
    expect(useModelo.getState().vistaActivaId).toBe("alzado");
    await useModelo.getState().unirVistas();
    const estado = useModelo.getState();
    expect(estado.dividida).toBe(false);
    expect(estado.panelActivo).toBe(0);
    expect(estado.vistaActivaId).toBe("alzado");
    expect(estado.paneles[0].vistaId).toBe("alzado");
  });
});

describe("O070: el panel activo manda", () => {
  it("el navegador abre la vista en el panel activo y no en el otro", async () => {
    await useModelo.getState().dividirVistas("vertical");
    useModelo.getState().fijarPanelActivo(1);
    useModelo.getState().fijarVista("iso");
    const estado = useModelo.getState();
    expect(estado.paneles[0].vistaId).toBe("planta-n0");
    expect(estado.paneles[1].vistaId).toBe("iso");
    expect(estado.vistaActivaId).toBe("iso");
    // Las propiedades de vista leen `vistaActivaId`: es la del panel activo.
    expect(estado.vistas.find((v) => v.id === estado.vistaActivaId)?.nombre).toBe(
      "3D Isométrica",
    );
  });

  it("cambiar de panel con una herramienta a medias la cancela como Esc", async () => {
    await useModelo.getState().dividirVistas("vertical");
    useModelo.setState({ herramienta: "muro" });
    useModelo.getState().fijarPanelActivo(1);
    expect(CANCELAR_TRAZO).toHaveBeenCalledTimes(1);
    expect(CANCELAR_HERRAMIENTA).not.toHaveBeenCalled();
    expect(useModelo.getState().herramienta).toBe("muro");
  });

  it("abrir en el otro panel divide si hace falta y cambia solo ese panel", async () => {
    await useModelo.getState().abrirEnOtroPanel("iso");
    const estado = useModelo.getState();
    expect(estado.dividida).toBe(true);
    expect(estado.panelActivo).toBe(0);
    expect(estado.vistaActivaId).toBe("planta-n0");
    expect(estado.paneles[1].vistaId).toBe("iso");
  });
});

describe("O070: proporción del separador", () => {
  it("nunca deja menos del 20 % de cada lado y lo escribe en el pset", async () => {
    useModelo.getState().fijarProporcionDivision(0.05);
    expect(useModelo.getState().proporcionDivision).toBe(0.2);
    useModelo.getState().fijarProporcionDivision(0.95);
    expect(useModelo.getState().proporcionDivision).toBe(0.8);
    await Promise.resolve();
    const guardado = nucleo.mock.calls.filter(([metodo]) => metodo === "paneles.guardar");
    const ultimo = guardado[guardado.length - 1]?.[1] as { datos: { proporcion: number } };
    expect(ultimo.datos.proporcion).toBe(0.8);
  });
});
