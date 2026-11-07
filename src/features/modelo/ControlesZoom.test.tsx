// O017: los botones flotantes llaman a la acción correcta, sin intercambios.
// O020: el conmutador «Orbitar» refleja su estado y avisa al pulsarlo.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlesZoom } from "./ControlesZoom";

afterEach(cleanup);

function montar(orbitar = false, mostrarOrbitar = true) {
  const acciones = {
    onAcercar: vi.fn(),
    onAlejar: vi.fn(),
    onAjustar: vi.fn(),
    onAlternarOrbitar: vi.fn(),
  };
  render(<ControlesZoom {...acciones} orbitar={orbitar} mostrarOrbitar={mostrarOrbitar} />);
  return acciones;
}

describe("O017: controles flotantes de zoom", () => {
  it("«+» acerca, «−» aleja y «Ajustar» ajusta", () => {
    const { onAcercar, onAlejar, onAjustar } = montar();
    fireEvent.click(screen.getByTestId("visor-zoom-mas"));
    expect(onAcercar).toHaveBeenCalledTimes(1);
    expect(onAlejar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("visor-zoom-menos"));
    expect(onAlejar).toHaveBeenCalledTimes(1);
    expect(onAcercar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("visor-zoom-ajustar"));
    expect(onAjustar).toHaveBeenCalledTimes(1);
  });
});

describe("O020: conmutador «Orbitar»", () => {
  it("muestra si está activo con aria-pressed", () => {
    montar(false);
    expect(screen.getByTestId("visor-orbitar").getAttribute("aria-pressed")).toBe("false");
  });

  it("activo se anuncia como pulsado y alterna al hacer clic", () => {
    const { onAlternarOrbitar } = montar(true);
    expect(screen.getByTestId("visor-orbitar").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("visor-orbitar"));
    expect(onAlternarOrbitar).toHaveBeenCalledTimes(1);
  });

  it("O051: en planta y alzado no aparece el conmutador", () => {
    montar(false, false);
    expect(screen.queryByTestId("visor-orbitar")).toBeNull();
    expect(screen.queryByText("Orbitar")).toBeNull();
  });
});
