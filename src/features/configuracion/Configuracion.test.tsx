import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { montarApp } from "@/test/utiles";
import { ESCALA_DEFECTO, useTema } from "@/lib/tema";

describe("Configuración", () => {
  afterEach(() => {
    useTema.setState({ escala: ESCALA_DEFECTO, cargado: false });
  });

  it("la sección Apariencia cambia el tema y la escala", async () => {
    montarApp();
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
    expect(await screen.findByRole("heading", { name: "Apariencia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(useTema.getState().pref).toBe("oscuro");
    fireEvent.click(screen.getByTestId("escala-130"));
    expect(useTema.getState().escala).toBe(130);
    expect(document.documentElement.style.getPropertyValue("--escala")).toBe("1.3");
  });

  it("la sección Idioma cambia la interfaz al inglés y vuelve al español", async () => {
    montarApp();
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
    fireEvent.click(await screen.findByRole("button", { name: "Idioma" }));
    fireEvent.click(screen.getByTestId("idioma-en"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Model" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("idioma-es"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Idioma" })).toBeInTheDocument(),
    );
  });
});
