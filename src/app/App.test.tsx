// OPEN-RVT: adaptado de PresupuestosPro para el esqueleto sin presupuesto.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { ESCALA_DEFECTO, useTema } from "@/lib/tema";

function montar() {
  return render(<App />);
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    useTema.setState({
      pref: "sistema",
      escala: ESCALA_DEFECTO,
      idioma: "es",
      lateralExpandido: false,
      lateralAncho: null,
      cargado: false,
    });
  });

  it("muestra la barra de título, el ribbon, la sidebar y el área de trabajo vacía", async () => {
    montar();
    expect(screen.getByTestId("ventana-barra-titulo")).toBeInTheDocument();
    expect(screen.getByText("OPEN-RVT", { selector: "[data-testid='titulo-ventana']" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Módulos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modelo" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Niveles y ejes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configuración" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ayuda" })).toBeInTheDocument();
    expect(screen.getByTestId("area-trabajo")).toHaveTextContent(
      "Aquí irá el editor (planta y 3D)",
    );
    expect(screen.getByTestId("estado-modelo")).toHaveTextContent("Sin modelo abierto");
    // La cinta arranca en Inicio con los comandos de archivo deshabilitados.
    expect(screen.getByRole("tab", { name: "Inicio" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /Nuevo \(Ctrl\+N\) — Disponible pronto/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Abrir \(Ctrl\+O\) — Disponible pronto/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Guardar \(Ctrl\+S\) — Disponible pronto/ })).toBeDisabled();
  });

  it("cambia de módulo con Alt+4 y muestra la ayuda", async () => {
    montar();
    fireEvent.keyDown(window, { key: "4", altKey: true });
    expect(screen.getByRole("button", { name: "Ayuda" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText(/Manual rápido de OPEN-RVT/)).toBeInTheDocument();
  });

  it("la pestaña Vista trae el botón de tema y el tema oscuro se aplica al instante", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Vista" }));
    const oscuro = screen.getByRole("button", { name: /Oscuro — Tema oscuro/ });
    fireEvent.click(oscuro);
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(oscuro).toHaveAttribute("aria-pressed", "true");
  });

  it("Configuración permite elegir el tema y el tamaño de la interfaz", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
    expect(await screen.findByRole("heading", { name: "Apariencia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    fireEvent.click(screen.getByTestId("escala-130"));
    expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.3");
  });

  it("Ctrl+= agranda, Ctrl+- achica y Ctrl+0 vuelve al predeterminado", async () => {
    montar();
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.2"),
    );
    fireEvent.keyDown(window, { key: "=", ctrlKey: true });
    expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.3");
    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.2");
    fireEvent.keyDown(window, { key: "-", ctrlKey: true });
    expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.1");
    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.2");
  });
});
