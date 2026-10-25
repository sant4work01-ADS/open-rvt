// Spec 030: los iconos del ribbon y del sidebar comparten el token de tamaño.
import { cleanup } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { afterEach, describe, expect, it } from "vitest";
import { montarApp } from "@/test/utiles";

describe("Iconos parejos (spec 030)", () => {
  afterEach(cleanup);

  it("CA-3: ribbon y sidebar usan el mismo tamaño y trazo", async () => {
    montarApp();
    const sidebar = screen
      .getByRole("navigation", { name: "Módulos" })
      .querySelector("[data-modulo] svg")!;
    const ribbon = screen
      .getByRole("region", { name: "Cinta de comandos" })
      .querySelector('button[data-testid="cmd-nuevo"] svg')!;
    expect(ribbon).toHaveAttribute("width", sidebar.getAttribute("width"));
    expect(ribbon).toHaveAttribute("height", sidebar.getAttribute("height"));
    expect(ribbon).toHaveAttribute("stroke-width", sidebar.getAttribute("stroke-width"));
  });
});
