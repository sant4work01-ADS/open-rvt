// OPEN-RVT: adaptado de PresupuestosPro; módulos de OPEN-RVT.
// Fase M4c-B, punto 5: tooltip propio del sidebar (píldora con nombre y atajo).
import { act, cleanup, fireEvent } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { vi } from "vitest";
import { montarApp } from "@/test/utiles";
import { RETRASO_PILDORA } from "./SidebarModulos";

describe("Tooltip del sidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const modulo = (id: string) => screen.getByRole("button", { name: id });
  const pildora = () => screen.queryByTestId("tooltip-modulo");

  it("aparece pasados los 90 ms con el nombre y el atajo, sin title nativo", () => {
    montarApp();
    // Los botones ya no tienen tooltip nativo: la píldora es propia.
    expect(modulo("Modelo")).not.toHaveAttribute("title");

    fireEvent.mouseEnter(modulo("Modelo"));
    expect(pildora()).not.toBeInTheDocument(); // aún en espera
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA - 1));
    expect(pildora()).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tip = pildora();
    expect(tip).toBeInTheDocument();
    expect(tip).toHaveTextContent("Modelo");
    expect(tip).toHaveTextContent("Alt+1");
    // Animación de 120 ms en el estilo.
    expect(tip).toHaveStyle({ animation: "tip-entrada 120ms ease-out" });
  });

  it("ya visible, pasar al siguiente botón muestra la píldora al instante", () => {
    montarApp();
    fireEvent.mouseEnter(modulo("Modelo"));
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
    expect(pildora()).toBeInTheDocument();

    fireEvent.mouseEnter(modulo("Niveles y ejes"));
    // Sin avanzar el reloj: la píldora cambia de módulo sin demora.
    expect(pildora()).toHaveAttribute("data-modulo", "niveles");
  });

  it("salir del sidebar cierra la píldora; el foco por teclado la muestra igual", () => {
    montarApp();
    fireEvent.mouseEnter(modulo("Modelo"));
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
    expect(pildora()).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByRole("navigation", { name: "Módulos" }));
    expect(pildora()).not.toBeInTheDocument();

    // El foco por teclado también la muestra (misma espera) y el desenfoque la esconde.
    fireEvent.focus(modulo("Niveles y ejes"));
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
    expect(pildora()).toHaveAttribute("data-modulo", "niveles");
    fireEvent.blur(modulo("Niveles y ejes"));
    expect(pildora()).not.toBeInTheDocument();
  });

  it("la píldora del módulo activo lleva la barra de color y el otro no", () => {
    montarApp();
    // «Modelo» es el módulo activo al abrir la app.
    fireEvent.mouseEnter(modulo("Modelo"));
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
    expect(pildora()!.querySelector("[data-barra-activa]")).not.toBeNull();

    fireEvent.mouseEnter(modulo("Niveles y ejes"));
    expect(pildora()!.querySelector("[data-barra-activa]")).toBeNull();
  });

  it("la píldora es opaca: opacidad 1 y fondo sólido del tema (§20.8)", async () => {
    montarApp();
    fireEvent.mouseEnter(modulo("Niveles y ejes"));
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
    const tip = pildora()!;
    // Opacidad total: nunca se ve lo que hay detrás.
    expect(tip.style.opacity).toBe("1");
    expect(getComputedStyle(tip).opacity).toBe("1");
    // Fondo sólido (no transparente): el color del tema, con borde y sombra.
    const fondo = tip.style.backgroundColor;
    expect(fondo).not.toBe("");
    expect(fondo).not.toBe("transparent");
    expect(fondo).not.toMatch(/rgba\([^)]*,\s*0\s*\)/);
    expect(fondo).toContain("var(--card)");
    expect(tip).toHaveClass("bg-card");
    expect(tip).toHaveClass("border");
    expect(tip).toHaveClass("shadow-lg");
    // Capa flotante: por encima de la cinta y de la tabla.
    expect(tip).toHaveClass("z-50");
  });

  it("al hacer clic en un módulo la píldora desaparece", () => {
    montarApp();
    fireEvent.mouseEnter(modulo("Niveles y ejes"));
    act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
    expect(pildora()).toBeInTheDocument();
    fireEvent.click(modulo("Niveles y ejes"));
    expect(pildora()).not.toBeInTheDocument();
  });
});
