// OPEN-RVT: adaptado de PresupuestosPro; cuatro módulos del esqueleto.
// Adaptación de src/i18n/pantallas-en.test.tsx de PresupuestosPro: con la interfaz en
// inglés no queda texto en español en los cuatro módulos del esqueleto.
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cambiarIdioma } from "./index";
import { montarApp } from "@/test/utiles";

const MODULOS = [
  { es: "Modelo", en: "Model", texto: "The editor (plan and 3D) will go here" },
  { es: "Niveles y ejes", en: "Levels and axes", texto: null },
  { es: "Configuración", en: "Settings", texto: "Appearance" },
  { es: "Ayuda", en: "Help", texto: "OPEN-RVT quick manual" },
];

const EN_ESPANOL = [
  "Sin modelo abierto",
  "Aquí irá el editor",
  "Niveles y ejes",
  "Configuración",
  "Ayuda",
  "Disponible pronto",
];

describe("pantallas en inglés", () => {
  afterEach(async () => {
    await cambiarIdioma("es");
  });

  it("los cuatro módulos se ven en inglés", async () => {
    await cambiarIdioma("en");
    montarApp();
    expect(screen.getByTestId("estado-modelo")).toHaveTextContent("No model open");
    expect(screen.getByRole("tab", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "View" })).toBeInTheDocument();
    for (const m of MODULOS) {
      const boton = screen.getByRole("button", { name: m.en });
      fireEvent.click(boton);
      const texto = document.body.textContent ?? "";
      for (const español of EN_ESPANOL) {
        expect(texto).not.toContain(español);
      }
      if (m.texto) expect((await screen.findAllByText(m.texto)).length, m.en).toBeGreaterThan(0);
    }
  });
});
