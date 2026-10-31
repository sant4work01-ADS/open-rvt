// O022: navegador de vistas. Los valores esperados son los de la spec (grupos,
// contadores, nombres) y listas explícitas, no expresiones regulares.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_GRUPOS_PLEGADOS,
  NavegadorVistas,
  filtrarVistas,
  normalizarBusqueda,
} from "./NavegadorVistas";
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

const VISTAS: Vista[] = [
  vista("p0", "Planta Nivel 0", "planta"),
  vista("p1", "Planta Nivel 1", "planta"),
  vista("alz", "Alzadó Norte", "alzado"),
  vista("iso", "3D Isométrica", "iso"),
];

beforeEach(() => {
  localStorage.clear();
});
afterEach(cleanup);

describe("O022: buscador de vistas", () => {
  it("filtra sin distinguir acentos ni mayúsculas", () => {
    expect(normalizarBusqueda("Alzadó")).toBe("alzado");
    expect(filtrarVistas(VISTAS, "ALZADO").map((v) => v.id)).toEqual(["alz"]);
    expect(filtrarVistas(VISTAS, "planta").map((v) => v.id)).toEqual(["p0", "p1"]);
    expect(filtrarVistas(VISTAS, "  ")).toHaveLength(4);
  });

  it("el campo de búsqueda oculta las vistas que no coinciden", () => {
    render(<NavegadorVistas vistas={VISTAS} activaId="p0" onElegir={() => {}} />);
    fireEvent.change(screen.getByTestId("vistas-buscador"), { target: { value: "alzado" } });
    expect(screen.getAllByTestId("vista-item").map((b) => b.dataset.vistaId)).toEqual(["alz"]);
  });
});

describe("O022: grupos plegables", () => {
  it("muestra el contador de cada grupo", () => {
    render(<NavegadorVistas vistas={VISTAS} activaId="p0" onElegir={() => {}} />);
    expect(screen.getByTestId("grupo-plantas-contador").textContent).toBe("2");
    expect(screen.getByTestId("grupo-alzados-contador").textContent).toBe("1");
    expect(screen.getByTestId("grupo-3d-contador").textContent).toBe("1");
    expect(screen.getByTestId("grupo-cantidades-contador").textContent).toBe("1");
    expect(screen.queryByTestId("grupo-cortes-contador")).toBeNull();
  });

  it("recuerda el grupo plegado al volver a montar", () => {
    const { unmount } = render(
      <NavegadorVistas vistas={VISTAS} activaId="p0" onElegir={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("grupo-plantas-plegar"));
    expect(screen.queryAllByTestId("vista-item").map((b) => b.dataset.vistaId)).toEqual([
      "alz",
      "iso",
    ]);
    expect(JSON.parse(localStorage.getItem(CLAVE_GRUPOS_PLEGADOS) ?? "[]")).toEqual(["plantas"]);
    unmount();

    render(<NavegadorVistas vistas={VISTAS} activaId="p0" onElegir={() => {}} />);
    expect(screen.queryAllByTestId("vista-item").map((b) => b.dataset.vistaId)).toEqual([
      "alz",
      "iso",
    ]);
    expect(screen.getByTestId("grupo-plantas-plegar").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("un localStorage que falla no rompe el navegador", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("sin almacenamiento");
    };
    try {
      render(<NavegadorVistas vistas={VISTAS} activaId="p0" onElegir={() => {}} />);
      expect(screen.getAllByTestId("vista-item")).toHaveLength(4);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe("O022: abrir, renombrar, duplicar y eliminar", () => {
  it("doble clic renombra en línea; Enter guarda el texto exacto", () => {
    const onRenombrar = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="p0"
        onElegir={() => {}}
        onRenombrar={onRenombrar}
      />,
    );
    fireEvent.doubleClick(screen.getAllByTestId("vista-item")[0]);
    const campo = screen.getByTestId("vista-renombrar");
    fireEvent.change(campo, { target: { value: "Planta Baja" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onRenombrar).toHaveBeenCalledWith("p0", "Planta Baja");
    expect(screen.queryByTestId("vista-renombrar")).toBeNull();
  });

  it("Escape cancela el renombrado sin llamar al estado", () => {
    const onRenombrar = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="p0"
        onElegir={() => {}}
        onRenombrar={onRenombrar}
      />,
    );
    fireEvent.contextMenu(screen.getAllByTestId("vista-item")[0]);
    fireEvent.click(screen.getByTestId("vista-menu-renombrar"));
    const campo = screen.getByTestId("vista-renombrar");
    fireEvent.change(campo, { target: { value: "No guardar" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(onRenombrar).not.toHaveBeenCalled();
    expect(screen.queryByTestId("vista-renombrar")).toBeNull();
  });

  it("el menú contextual duplica la vista elegida", () => {
    const onDuplicar = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="p0"
        onElegir={() => {}}
        onDuplicar={onDuplicar}
      />,
    );
    fireEvent.contextMenu(screen.getAllByTestId("vista-item")[2]);
    expect(screen.getByTestId("vista-menu").getAttribute("aria-label")).toBe(
      "Acciones de Alzadó Norte",
    );
    fireEvent.click(screen.getByTestId("vista-menu-duplicar"));
    expect(onDuplicar).toHaveBeenCalledWith("alz");
    expect(screen.queryByTestId("vista-menu")).toBeNull();
  });

  it("eliminar pide confirmación y no se ofrece si es la última de su tipo", () => {
    const onEliminar = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="p0"
        onElegir={() => {}}
        onEliminar={onEliminar}
      />,
    );
    // Dos plantas: sí se puede eliminar, pero primero confirma.
    fireEvent.contextMenu(screen.getAllByTestId("vista-item")[0]);
    fireEvent.click(screen.getByTestId("vista-menu-eliminar"));
    expect(onEliminar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("vista-eliminar-confirmar"));
    expect(onEliminar).toHaveBeenCalledWith("p0");

    // El único alzado no se puede eliminar.
    fireEvent.contextMenu(screen.getAllByTestId("vista-item")[2]);
    expect(
      (screen.getByTestId("vista-menu-eliminar") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("cancelar la confirmación no elimina", () => {
    const onEliminar = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="p0"
        onElegir={() => {}}
        onEliminar={onEliminar}
      />,
    );
    fireEvent.contextMenu(screen.getAllByTestId("vista-item")[1]);
    fireEvent.click(screen.getByTestId("vista-menu-eliminar"));
    fireEvent.click(screen.getByTestId("vista-eliminar-cancelar"));
    expect(onEliminar).not.toHaveBeenCalled();
  });
});

describe("O022: teclado", () => {
  it("las flechas mueven el foco, Enter abre y F2 renombra", () => {
    const onElegir = vi.fn();
    render(
      <NavegadorVistas
        vistas={VISTAS}
        activaId="p0"
        onElegir={onElegir}
        onRenombrar={() => {}}
      />,
    );
    const items = screen.getAllByTestId("vista-item");
    items[0].focus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "Enter" });
    expect(onElegir).toHaveBeenCalledWith("p0");
    fireEvent.keyDown(items[0], { key: "F2" });
    expect(screen.getByTestId("vista-renombrar")).toBeTruthy();
  });

  it("la vista activa queda marcada para lectores de pantalla", () => {
    render(<NavegadorVistas vistas={VISTAS} activaId="p1" onElegir={() => {}} />);
    const activa = screen
      .getAllByTestId("vista-item")
      .find((b) => b.dataset.vistaId === "p1");
    expect(activa?.getAttribute("aria-current")).toBe("true");
  });
});
