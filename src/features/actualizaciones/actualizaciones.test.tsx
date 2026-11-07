// Pruebas de la spec 046 (actualizaciones automáticas) con el updater simulado.
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActualizaciones } from "./tienda";
import type { Actualizacion, ServicioActualizaciones } from "./servicio";
import { traducirErrorActualizacion } from "./servicio";
import {
  AcercaDeActualizaciones,
  AvisoActualizacion,
  DialogoActualizacion,
} from "./Actualizaciones";

const NUEVA: Actualizacion = {
  version: "0.13.2",
  fecha: "2026-10-20T12:00:00Z",
  notas: "# Mejoras\n- Cálculo más rápido\n",
};

function servicioFalso(over: Partial<ServicioActualizaciones> = {}) {
  const orden: string[] = [];
  const s: ServicioActualizaciones = {
    disponible: async () => true,
    versionActual: async () => "0.13.1",
    consultar: async () => NUEVA,
    instalar: async (_a, progreso, antes) => {
      progreso({ descargado: 1_000_000, total: 2_000_000 });
      orden.push("descarga");
      await antes();
      orden.push("instala");
    },
    relanzar: async () => {
      orden.push("relanza");
    },
    ...over,
  };
  return { servicio: s, orden };
}

function montar(componente: React.ReactNode) {
  return render(<>{componente}</>);
}

beforeEach(() => {
  useActualizaciones.setState({
    versionActual: null,
    actualizacion: null,
    estado: "inactivo",
    error: null,
    progreso: null,
    dialogo: false,
    descartadas: [],
  });
});

describe("CA-1 · aviso no intrusivo", () => {
  it("muestra «Hay una actualización (0.13.2)» y abre el diálogo al pulsar", async () => {
    const { servicio } = servicioFalso();
    useActualizaciones.getState().fijarServicio(servicio);
    montar(<AvisoActualizacion />);
    await act(() => useActualizaciones.getState().comprobarAutomatica());
    const aviso = await screen.findByTestId("aviso-actualizacion");
    expect(aviso).toHaveTextContent("Hay una actualización (0.13.2)");
    fireEvent.click(aviso);
    expect(useActualizaciones.getState().dialogo).toBe(true);
  });

  it("no muestra nada si ya está al día", async () => {
    const { servicio } = servicioFalso({ consultar: async () => null });
    useActualizaciones.getState().fijarServicio(servicio);
    montar(<AvisoActualizacion />);
    await act(() => useActualizaciones.getState().comprobarAutomatica());
    expect(screen.queryByTestId("aviso-actualizacion")).not.toBeInTheDocument();
  });
});

describe("CA-2 · sección de Configuración", () => {
  it("muestra la versión actual y «Estás al día»", async () => {
    const { servicio } = servicioFalso({ consultar: async () => null });
    useActualizaciones.getState().fijarServicio(servicio);
    montar(<AcercaDeActualizaciones />);
    expect(await screen.findByTestId("version-actual")).toHaveTextContent("0.13.1");
    fireEvent.click(screen.getByTestId("buscar-actualizaciones"));
    await waitFor(() =>
      expect(screen.getByTestId("resultado-actualizaciones")).toHaveTextContent("Estás al día"),
    );
  });

  it("avisa de la versión nueva", async () => {
    const { servicio } = servicioFalso();
    useActualizaciones.getState().fijarServicio(servicio);
    montar(<AcercaDeActualizaciones />);
    fireEvent.click(screen.getByTestId("buscar-actualizaciones"));
    await waitFor(() =>
      expect(screen.getByTestId("resultado-actualizaciones")).toHaveTextContent(
        "Hay una versión nueva (0.13.2)",
      ),
    );
  });

  it("explica en lenguaje claro un error de red", async () => {
    const { servicio } = servicioFalso({
      consultar: async () => {
        throw new Error("error sending request for url: connection refused");
      },
    });
    useActualizaciones.getState().fijarServicio(servicio);
    montar(<AcercaDeActualizaciones />);
    fireEvent.click(screen.getByTestId("buscar-actualizaciones"));
    await waitFor(() =>
      expect(screen.getByTestId("resultado-actualizaciones")).toHaveTextContent(
        "Sin conexión a internet",
      ),
    );
  });

  it("traduce firma inválida y servidor no disponible", () => {
    expect(traducirErrorActualizacion(new Error("signature verification failed"))).toContain(
      "firma",
    );
    expect(traducirErrorActualizacion(new Error("HTTP 404"))).toContain(
      "servidor de actualizaciones no está disponible",
    );
  });
});

describe("CA-3 · diálogo y progreso", () => {
  it("muestra versión, fecha, notas y progresa antes de instalar y relanzar", async () => {
    const { servicio, orden } = servicioFalso();
    useActualizaciones.getState().fijarServicio(servicio);
    useActualizaciones.setState({ actualizacion: NUEVA, estado: "disponible", dialogo: true });
    montar(<DialogoActualizacion />);
    expect(screen.getByTestId("dialogo-actualizacion")).toHaveTextContent("0.13.2");
    expect(screen.getByTestId("notas-actualizacion")).toHaveTextContent("Cálculo más rápido");
    fireEvent.click(screen.getByTestId("actualizacion-ahora"));
    await waitFor(() => expect(orden).toEqual(["descarga", "instala", "relanza"]));
    expect(orden.indexOf("descarga")).toBeLessThan(orden.indexOf("instala"));
  });
});

describe("CA-4 · guardar antes de instalar", () => {
  it("llama a guardar el modelo antes de instalar y no instala si no se pudo guardar", async () => {
    const orden: string[] = [];
    const { servicio } = servicioFalso({
      instalar: async (_a, _p, antes) => {
        await antes();
        orden.push("instala");
      },
    });
    useActualizaciones.getState().fijarServicio(servicio);
    useActualizaciones.setState({ actualizacion: NUEVA, dialogo: true });
    const { useModelo } = await import("@/features/modelo/estado");
    const original = useModelo.getState().asegurarSinCambios;
    useModelo.setState({
      conCambios: true,
      asegurarSinCambios: async () => false,
    });
    await act(() => useActualizaciones.getState().instalarAhora());
    expect(orden).toEqual([]);
    expect(useActualizaciones.getState().estado).toBe("error");
    expect(useActualizaciones.getState().error).toContain("No se pudo guardar");
    useModelo.setState({ conCambios: false, asegurarSinCambios: original });
  });
});

describe("CA-5 · errores de descarga o firma", () => {
  it("muestra el error, no instala ni relanza y la app sigue", async () => {
    const relanzar = vi.fn();
    const { servicio } = servicioFalso({
      instalar: async () => {
        throw new Error("signature verification failed");
      },
      relanzar,
    });
    useActualizaciones.getState().fijarServicio(servicio);
    useActualizaciones.setState({ actualizacion: NUEVA, dialogo: true });
    montar(<DialogoActualizacion />);
    fireEvent.click(screen.getByTestId("actualizacion-ahora"));
    expect(await screen.findByTestId("error-actualizacion")).toHaveTextContent("firma");
    expect(relanzar).not.toHaveBeenCalled();
    expect(screen.getByTestId("dialogo-actualizacion")).toBeInTheDocument();
  });
});

describe("CA-6 · «Después»", () => {
  it("no vuelve a avisar de esa versión en la sesión", async () => {
    const { servicio } = servicioFalso();
    useActualizaciones.getState().fijarServicio(servicio);
    montar(<AvisoActualizacion />);
    await act(() => useActualizaciones.getState().comprobarAutomatica());
    fireEvent.click(screen.getByTestId("aviso-actualizacion"));
    montar(<DialogoActualizacion />);
    fireEvent.click(screen.getByTestId("actualizacion-despues"));
    expect(screen.queryByTestId("aviso-actualizacion")).not.toBeInTheDocument();
    await act(() => useActualizaciones.getState().comprobarAutomatica());
    expect(screen.queryByTestId("aviso-actualizacion")).not.toBeInTheDocument();
  });
});

describe("CA-7 · E2E y desarrollo", () => {
  it("con el servicio deshabilitado no consulta ni muestra errores", async () => {
    const consultar = vi.fn(async () => NUEVA);
    const { servicio } = servicioFalso({ disponible: async () => false, consultar });
    useActualizaciones.getState().fijarServicio(servicio);
    await act(() => useActualizaciones.getState().comprobarAutomatica());
    expect(consultar).not.toHaveBeenCalled();
    expect(useActualizaciones.getState().estado).toBe("inactivo");
    expect(useActualizaciones.getState().error).toBeNull();
  });
});

describe("CA-8 · Linux descarga aparte", () => {
  it("compara versiones numéricas", async () => {
    const { versionMasNueva } = await import("./servicio");
    expect(versionMasNueva("0.3.1", "0.3.0")).toBe(true);
    expect(versionMasNueva("0.3.0", "0.3.0")).toBe(false);
    expect(versionMasNueva("0.2.9", "0.3.0")).toBe(false);
    expect(versionMasNueva("0.10.0", "0.9.9")).toBe(true);
  });

  it("en Tauri/Linux el diálogo ofrece Descargar en vez de instalar", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    // La suite corre también en Windows: se simula el user agent de Linux que
    // es lo que mira `esLinux()`.
    const uaOriginal = navigator.userAgent;
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (X11; Linux x86_64)",
    });
    try {
      useActualizaciones.getState().fijarServicio(servicioFalso().servicio);
      useActualizaciones.setState({
        actualizacion: NUEVA,
        estado: "disponible",
        dialogo: true,
      });
      montar(<DialogoActualizacion />);
      expect(screen.getByTestId("actualizacion-ahora")).toHaveTextContent("Descargar");
      expect(screen.getByTestId("dialogo-actualizacion")).toHaveTextContent(
        "no puede sustituirse sola",
      );
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      Object.defineProperty(window.navigator, "userAgent", {
        configurable: true,
        value: uaOriginal,
      });
    }
  });
});
