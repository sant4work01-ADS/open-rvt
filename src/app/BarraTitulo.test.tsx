// OPEN-RVT: adaptado de PresupuestosPro; sin sesión de obra.
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// API de ventana simulada: en jsdom no hay backend de Tauri.
const mocks = vi.hoisted(() => {
  const oyentesFoco: Array<(e: { payload: boolean }) => void> = [];
  const estado = { maximizada: false };
  return {
    oyentesFoco,
    estado,
    ventana: {
      minimize: vi.fn(async () => {}),
      toggleMaximize: vi.fn(async () => {
        estado.maximizada = !estado.maximizada;
      }),
      close: vi.fn(async () => {}),
      startDragging: vi.fn(async () => {}),
      startResizeDragging: vi.fn(async () => {}),
      isMaximized: vi.fn(async () => estado.maximizada),
      onResized: vi.fn(async () => () => {}),
      onFocusChanged: vi.fn(async (cb: (e: { payload: boolean }) => void) => {
        oyentesFoco.push(cb);
        return () => {};
      }),
    },
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks.ventana,
  ResizeDirection: {
    East: "East",
    North: "North",
    NorthEast: "NorthEast",
    NorthWest: "NorthWest",
    South: "South",
    SouthEast: "SouthEast",
    SouthWest: "SouthWest",
    West: "West",
  },
}));

import { BarraTitulo } from "./BarraTitulo";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.oyentesFoco.length = 0;
  mocks.estado.maximizada = false;
});

describe("BarraTitulo", () => {
  it("CA-1: la ventana va sin decoraciones nativas y la app dibuja su barra", () => {
    const conf = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../src-tauri/tauri.conf.json"), "utf8"),
    ) as { app: { windows: Array<{ decorations?: boolean }> } };
    expect(conf.app.windows[0].decorations).toBe(false);
    render(<BarraTitulo />);
    expect(screen.getByTestId("ventana-barra-titulo")).toBeInTheDocument();
  });

  it("CA-2: minimizar, maximizar/restaurar y cerrar llaman a la API de ventana", async () => {
    render(<BarraTitulo />);
    fireEvent.click(screen.getByRole("button", { name: "Minimizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximizar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(mocks.ventana.minimize).toHaveBeenCalledTimes(1));
    expect(mocks.ventana.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(mocks.ventana.close).toHaveBeenCalledTimes(1);
  });

  it("CA-3: el fondo usa el token del tema y se atenúa al perder el foco", async () => {
    render(<BarraTitulo />);
    const barra = screen.getByTestId("ventana-barra-titulo");
    expect(barra).toHaveClass("bg-accent", "text-accent-foreground");
    expect(barra).toHaveAttribute("data-activa", "true");
    await act(async () => {
      for (const cb of mocks.oyentesFoco) cb({ payload: false });
    });
    expect(barra).toHaveAttribute("data-activa", "false");
    expect(barra).toHaveClass("opacity-60");
  });

  it("CA-4: el título es el nombre del producto", () => {
    render(<BarraTitulo />);
    expect(screen.getByTestId("titulo-ventana")).toHaveTextContent(/^OPEN-RVT$/);
  });

  it("doble clic alterna maximizar/restaurar", async () => {
    render(<BarraTitulo />);
    fireEvent.doubleClick(screen.getByTestId("ventana-barra-titulo"));
    await waitFor(() => expect(mocks.ventana.toggleMaximize).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("ventana-barra-titulo")).toHaveAttribute("data-maximizada", "true");
    fireEvent.doubleClick(screen.getByTestId("ventana-barra-titulo"));
    await waitFor(() => expect(mocks.ventana.toggleMaximize).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("ventana-barra-titulo")).toHaveAttribute("data-maximizada", "false");
  });

  // CA-1 (spec 038): 30 px CSS fijos, sin depender de --escala (la raíz va en rem).
  it("CA-1: la barra mide 30 px fijos a cualquier escala de interfaz", () => {
    render(<BarraTitulo />);
    const barra = screen.getByTestId("ventana-barra-titulo");
    for (const escala of [100, 120, 130]) {
      document.documentElement.style.fontSize = `${(16 * escala) / 100}px`;
      expect(getComputedStyle(barra).height).toBe("30px");
    }
    document.documentElement.style.fontSize = "";
  });

  // CA-2 (spec 038): botones de 46 px de ancho y alto completo, iconos de 18 px (pedido del usuario),
  // título de 12 px y cerrar rojo al pasar el ratón (como Windows 10).
  it("CA-2: botones de 46 px, iconos de 18 px y título de 12 px", () => {
    render(<BarraTitulo />);
    for (const nombre of ["Minimizar", "Maximizar", "Cerrar"]) {
      const boton = screen.getByRole("button", { name: nombre });
      expect(getComputedStyle(boton).width).toBe("46px");
      expect(boton).toHaveClass("h-full");
      const icono = boton.querySelector("svg");
      expect(icono).not.toBeNull();
      expect(icono).toHaveAttribute("width", "18");
      expect(icono).toHaveAttribute("height", "18");
    }
    const cerrar = screen.getByRole("button", { name: "Cerrar" });
    expect(cerrar.className).toContain("hover:bg-red-600");
    expect(getComputedStyle(screen.getByTestId("titulo-ventana")).fontSize).toBe("12px");
  });

  it("redimensiona desde los bordes con la API de ventana", async () => {
    render(<BarraTitulo />);
    fireEvent.mouseDown(screen.getByTestId("redimension-east"), { button: 0 });
    expect(mocks.ventana.startResizeDragging).toHaveBeenCalledWith("East");
  });
});
