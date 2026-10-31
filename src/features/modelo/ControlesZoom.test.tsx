// O017: los botones flotantes llaman a la acción correcta, sin intercambios.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlesZoom } from "./ControlesZoom";

afterEach(cleanup);

describe("O017: controles flotantes de zoom", () => {
  it("«+» acerca, «−» aleja y «Ajustar» ajusta", () => {
    const onAcercar = vi.fn();
    const onAlejar = vi.fn();
    const onAjustar = vi.fn();
    render(
      <ControlesZoom
        onAcercar={onAcercar}
        onAlejar={onAlejar}
        onAjustar={onAjustar}
      />,
    );
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
