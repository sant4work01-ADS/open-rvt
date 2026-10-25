// Punto 6 de M4c-B: el sidebar escala ícono, botón y ancho con el tamaño de la interfaz
// (×1.5 con la predeterminada de 120 %; los rem ya escalan con la fuente raíz).
import { act } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { montarApp } from "@/test/utiles";
import { ESCALA_DEFECTO, useTema } from "@/lib/tema";
import { ANCHO_REM, BOTON_REM, RETRASO_PILDORA } from "./SidebarModulos";

describe("Escala del sidebar", () => {
  afterEach(() => {
    cleanup();
    act(() => useTema.setState({ escala: ESCALA_DEFECTO }));
  });

  const nav = () => screen.getByRole("navigation", { name: "Módulos" });
  const boton = (nombre: string) =>
    nav().querySelector<HTMLElement>(`button[aria-label="${nombre}"]`)!;
  const icono = (nombre: string) => boton(nombre).querySelector("svg")!;

  it("con el predeterminado (120 %) el ícono queda en 24 px (16 × 1.5)", () => {
    montarApp();
    expect(icono("Modelo")).toHaveAttribute("width", "24");
    expect(icono("Modelo")).toHaveAttribute("height", "24");
  });

  it("el botón y el ancho usan el factor extra del sidebar en rem", () => {
    montarApp();
    expect(nav().style.width).toBe(`calc(${ANCHO_REM}rem * var(--factor-sidebar))`);
    expect(boton("Modelo").style.width).toBe(`calc(${BOTON_REM}rem * var(--factor-sidebar))`);
    expect(boton("Modelo").style.height).toBe(`calc(${BOTON_REM}rem * var(--factor-sidebar))`);
  });

  it("el ícono responde al cambiar la preferencia (100 % → 20 px)", () => {
    montarApp();
    act(() => useTema.setState({ escala: 100 }));
    expect(icono("Modelo")).toHaveAttribute("width", "20");
    act(() => useTema.setState({ escala: 130 }));
    expect(icono("Modelo")).toHaveAttribute("width", "26"); // 16 × 1.625 = 26
  });

  it("el tooltip sigue apuntando al botón aunque los tamaños cambien", () => {
    vi.useFakeTimers();
    try {
      montarApp();
      act(() => useTema.setState({ escala: 130 }));
      fireEvent.mouseEnter(boton("Ayuda"));
      act(() => vi.advanceTimersByTime(RETRASO_PILDORA));
      expect(screen.getByTestId("tooltip-modulo")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
