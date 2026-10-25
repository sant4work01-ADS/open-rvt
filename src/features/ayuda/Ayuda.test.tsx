// Pruebas de la ayuda (adaptadas de src/features/ayuda/Ayuda.test.tsx de PresupuestosPro).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { montarApp } from "@/test/utiles";
import { cambiarIdioma } from "@/i18n";
import { dividirSecciones, parsearMarkdown } from "./manual";
import manualEs from "../../../docs/manual-rapido.md?raw";

describe("manual", () => {
  it("divide el manual en secciones por sus títulos de nivel 2", () => {
    const secciones = dividirSecciones(manualEs);
    expect(secciones.map((s) => s.titulo)).toContain("Bienvenido");
    for (const s of secciones) {
      expect(parsearMarkdown(s.markdown).length).toBeGreaterThan(0);
    }
  });

  it("el parser reconoce títulos, párrafos y tablas", () => {
    const bloques = parsearMarkdown("# Título\n\nTexto.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(bloques[0]).toEqual({ tipo: "titulo", nivel: 1, texto: "Título" });
    expect(bloques.some((b) => b.tipo === "tabla")).toBe(true);
  });
});

describe("AyudaView", () => {
  it("muestra el manual de bienvenida y abre los atajos de teclado", async () => {
    montarApp();
    fireEvent.click(screen.getByRole("button", { name: "Ayuda" }));
    expect(await screen.findByText("Manual rápido de OPEN-RVT")).toBeInTheDocument();
    expect(screen.getAllByText("Bienvenido").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Atajos de teclado \(F1\)/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Ctrl+F1")).toBeInTheDocument();
  });

  it("en inglés el manual también está en inglés", async () => {
    await cambiarIdioma("en");
    montarApp();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(await screen.findByText("OPEN-RVT quick manual")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Welcome").length).toBeGreaterThan(0));
    await cambiarIdioma("es");
  });
});
