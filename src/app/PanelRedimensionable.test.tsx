// O010: los paneles laterales se redimensionan, respetan mínimo/máximo y recuerdan
// el ancho.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LIMITES_PANELES,
  PanelRedimensionable,
  limitarAnchoPanel,
} from "./PanelRedimensionable";

function montar(id: "vistas" | "propiedades" = "vistas") {
  return render(
    <PanelRedimensionable id={id} lado={id === "vistas" ? "izquierdo" : "derecho"} etiqueta="prueba">
      <div>contenido</div>
    </PanelRedimensionable>,
  );
}

function anchoDe(id: "vistas" | "propiedades" = "vistas"): number {
  return Number(screen.getByTestId(`panel-${id}`).getAttribute("data-ancho"));
}

describe("paneles redimensionables (O010)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("el asa existe, es vertical y anuncia mínimo y máximo", () => {
    montar();
    const asa = screen.getByRole("separator", { name: "Redimensionar prueba" });
    expect(asa).toHaveAttribute("aria-orientation", "vertical");
    expect(Number(asa.getAttribute("aria-valuemin"))).toBe(LIMITES_PANELES.vistas.minimo);
    expect(Number(asa.getAttribute("aria-valuemax"))).toBe(LIMITES_PANELES.vistas.maximo);
    expect(anchoDe()).toBe(LIMITES_PANELES.vistas.defecto);
  });

  it("las flechas cambian el ancho y lo guardan; Home lo restablece", () => {
    montar();
    const asa = screen.getByRole("separator", { name: "Redimensionar prueba" });
    fireEvent.keyDown(asa, { key: "ArrowRight" });
    expect(anchoDe()).toBe(LIMITES_PANELES.vistas.defecto + 16);
    expect(localStorage.getItem("openrvt.ancho-panel.vistas")).toBe(
      String(LIMITES_PANELES.vistas.defecto + 16),
    );
    fireEvent.keyDown(asa, { key: "Home" });
    expect(anchoDe()).toBe(LIMITES_PANELES.vistas.defecto);
  });

  it("no baja del mínimo ni pasa del máximo", () => {
    montar("propiedades");
    const asa = screen.getByRole("separator", { name: "Redimensionar prueba" });
    for (let i = 0; i < 80; i += 1) fireEvent.keyDown(asa, { key: "ArrowRight" });
    expect(anchoDe("propiedades")).toBe(LIMITES_PANELES.propiedades.minimo);
    for (let i = 0; i < 80; i += 1) fireEvent.keyDown(asa, { key: "ArrowLeft" });
    expect(anchoDe("propiedades")).toBe(LIMITES_PANELES.propiedades.maximo);
  });

  it("arrastra el asa y conserva el ancho al volver a montar", () => {
    const { unmount } = montar();
    const asa = screen.getByRole("separator", { name: "Redimensionar prueba" });
    fireEvent.pointerDown(asa, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(asa, { clientX: 260, pointerId: 1 });
    fireEvent.pointerUp(asa, { clientX: 260, pointerId: 1 });
    const esperado = LIMITES_PANELES.vistas.defecto + 60;
    expect(anchoDe()).toBe(esperado);
    unmount();
    montar();
    expect(anchoDe()).toBe(esperado);
  });

  it("limitaAnchoPanel recorta valores fuera de rango", () => {
    expect(limitarAnchoPanel(10, LIMITES_PANELES.vistas)).toBe(160);
    expect(limitarAnchoPanel(9999, LIMITES_PANELES.vistas)).toBe(420);
    expect(limitarAnchoPanel(Number.NaN, LIMITES_PANELES.vistas)).toBe(210);
  });

  it("O022b: el panel de propiedades nunca baja de 260 px", () => {
    expect(LIMITES_PANELES.propiedades.minimo).toBeGreaterThanOrEqual(260);
    expect(limitarAnchoPanel(10, LIMITES_PANELES.propiedades)).toBe(
      LIMITES_PANELES.propiedades.minimo,
    );
  });
});

describe("O022: ancho recordado en ambos lados", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("vistas y propiedades guardan cada uno su propio ancho", () => {
    montar("vistas");
    fireEvent.keyDown(screen.getByRole("separator", { name: "Redimensionar prueba" }), {
      key: "ArrowRight",
    });
    cleanup();
    montar("propiedades");
    fireEvent.keyDown(screen.getByRole("separator", { name: "Redimensionar prueba" }), {
      key: "ArrowLeft",
    });
    expect(localStorage.getItem("openrvt.ancho-panel.vistas")).toBe(
      String(LIMITES_PANELES.vistas.defecto + 16),
    );
    expect(localStorage.getItem("openrvt.ancho-panel.propiedades")).toBe(
      String(LIMITES_PANELES.propiedades.defecto + 16),
    );
    cleanup();
    montar("propiedades");
    expect(anchoDe("propiedades")).toBe(LIMITES_PANELES.propiedades.defecto + 16);
  });
});
