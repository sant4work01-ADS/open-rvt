// O036: el ángulo de giro se escribe en grados y el núcleo lo recibe en radianes.
// 10° = 10·π/180 = 0.17453292519943295 rad; 90° = π/2; −45° = −π/4.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarraHerramienta } from "./BarraHerramienta";
import { useModelo } from "./estado";
import { anguloGiroGrados, gradosARadianes } from "./giro";

afterEach(cleanup);

describe("O036: conversión de grados a radianes", () => {
  it("convierte 10°, 90° y −45° con el factor π/180", () => {
    expect(gradosARadianes(10)).toBeCloseTo(0.17453292519943295, 15);
    expect(gradosARadianes(90)).toBeCloseTo(Math.PI / 2, 15);
    expect(gradosARadianes(-45)).toBeCloseTo(-Math.PI / 4, 15);
    expect(gradosARadianes(0)).toBe(0);
  });

  it("mide el ángulo antihorario desde la referencia", () => {
    const centro: [number, number] = [4, 1.5];
    expect(anguloGiroGrados(centro, [5, 1.5], [4, 2.5])).toBeCloseTo(90, 12);
    expect(anguloGiroGrados(centro, [5, 1.5], [4, 0.5])).toBeCloseTo(-90, 12);
    expect(anguloGiroGrados(centro, [5, 1.5], [5, 1.5])).toBe(0);
  });
});

describe("O036: campo de ángulo de la herramienta Girar", () => {
  it("muestra el ángulo escrito y el centro por omisión", () => {
    useModelo.setState({
      herramienta: "girar_eje",
      ejeSeleccionado: "eje-2",
      centroGiro: null,
      anguloGiro: "10",
    });
    render(<BarraHerramienta />);
    expect((screen.getByTestId("giro-angulo") as HTMLInputElement).value).toBe("10");
    expect(screen.getByTestId("giro-centro").textContent).toBe(
      "Centro: punto medio del eje",
    );
  });

  it("cambia el ángulo y Enter aplica el giro", () => {
    const fijar = vi.fn();
    const aplicar = vi.fn();
    useModelo.setState({
      herramienta: "girar_eje",
      ejeSeleccionado: "eje-2",
      centroGiro: [4, 1.5],
      anguloGiro: "10",
      fijarAnguloGiro: fijar,
      aplicarGiroEje: aplicar,
    });
    render(<BarraHerramienta />);
    const campo = screen.getByTestId("giro-angulo") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "25" } });
    expect(fijar).toHaveBeenCalledWith("25");
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("giro-centro").textContent).toBe("Centro (4.00, 1.50)");
  });
});
