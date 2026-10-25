// Spec 030: sidebar plegable con preferencia recordada entre sesiones.
import { cleanup, fireEvent } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { afterEach, describe, expect, it } from "vitest";
import { montarApp } from "@/test/utiles";
import { useTema } from "@/lib/tema";

const nav = () => screen.getByRole("navigation", { name: "Módulos" });
const flecha = () => screen.getByRole("button", { name: /menú lateral/ });

describe("Sidebar plegable (spec 030)", () => {
  afterEach(cleanup);

  // CA-4
  it("CA-4: la flechita muestra los textos y otro clic vuelve a solo iconos con tooltip", () => {
    montarApp();
    // Colapsado de fábrica: solo iconos, sin texto visible.
    expect(nav()).toHaveAttribute("data-expandido", "false");
    expect(screen.queryByTestId("texto-modulo-modelo")).toBeNull();

    fireEvent.click(flecha());
    expect(nav()).toHaveAttribute("data-expandido", "true");
    expect(screen.getByTestId("texto-modulo-modelo")).toHaveTextContent("Modelo");

    fireEvent.click(screen.getByRole("button", { name: "Colapsar menú lateral" }));
    expect(nav()).toHaveAttribute("data-expandido", "false");
    expect(screen.queryByTestId("texto-modulo-modelo")).toBeNull();
    // Colapsado: los botones siguen teniendo nombre accesible para el tooltip.
    expect(screen.getByRole("button", { name: "Modelo" })).toBeInTheDocument();
  });

  // CA-5
  it("CA-5: la preferencia se guarda y se recupera al volver a montar la app", () => {
    montarApp();
    fireEvent.click(flecha());
    expect(useTema.getState().lateralExpandido).toBe(true);
    cleanup();

    montarApp({ lateralExpandido: true });
    expect(nav()).toHaveAttribute("data-expandido", "true");
    expect(screen.getByTestId("texto-modulo-modelo")).toHaveTextContent("Modelo");
  });
});
