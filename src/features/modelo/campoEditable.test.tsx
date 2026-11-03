// O041: al cambiar la selección con Tab (muro → cerramiento), el campo Nombre mostraba el del
// muro y Enter renombraba el cerramiento con el nombre del muro.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampoEditable } from "./PanelPropiedades";

describe("CampoEditable sigue a la selección (O041)", () => {
  afterEach(cleanup);

  it("muestra el valor del elemento nuevo y Enter no guarda el del anterior", () => {
    const guardar = vi.fn();
    const { rerender } = render(
      <CampoEditable etiqueta="Nombre" testid="n" valor="Muro Block 15" onGuardar={guardar} />,
    );
    rerender(
      <CampoEditable etiqueta="Nombre" testid="n" valor="Cerramiento CE-1" onGuardar={guardar} />,
    );
    const campo = screen.getByTestId("n") as HTMLInputElement;
    expect(campo.value).toBe("Cerramiento CE-1");
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(guardar).not.toHaveBeenCalledWith("Muro Block 15");
  });
});
