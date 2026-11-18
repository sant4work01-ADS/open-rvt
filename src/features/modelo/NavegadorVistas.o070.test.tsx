// O070: clic derecho en una vista → «Abrir en el otro panel».
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavegadorVistas } from "./NavegadorVistas";
import { CATEGORIAS_TODAS, type Vista } from "./tipos";

function vista(id: string, nombre: string, tipo: Vista["tipo"]): Vista {
  return {
    id,
    nombre,
    tipo,
    nivelesVisibles: ["n0"],
    categorias: CATEGORIAS_TODAS(),
    estilo: "lineas-ocultas",
    escala: 100,
  };
}

const VISTAS = [
  vista("planta-n0", "Planta Nivel 0", "planta"),
  vista("iso", "3D Perspectiva", "perspectiva"),
];

afterEach(cleanup);

describe("O070: abrir en el otro panel", () => {
  it("el menú contextual ofrece la acción y pasa el id exacto de la vista", () => {
    const abrir = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="planta-n0"
        onElegir={() => undefined}
        onAbrirEnOtroPanel={abrir}
      />,
    );
    fireEvent.contextMenu(screen.getAllByTestId("vista-item")[1], {
      clientX: 40,
      clientY: 60,
    });
    fireEvent.click(screen.getByTestId("vista-menu-otro-panel"));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir).toHaveBeenCalledWith("iso");
  });
});
