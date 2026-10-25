// Navegación con teclado en las listas (adaptada de src/app/ListasScroll.test.tsx de PP).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indiceTrasMovimiento, movimientoDeTecla, renglonesPorPagina } from "@/lib/listaTeclado";
import { PaletaComandos, type Comando } from "@/app/PaletaComandos";
import { montarApp } from "@/test/utiles";

afterEach(cleanup);

const comandos: Comando[] = Array.from({ length: 30 }, (_, i) => ({
  id: `c${i}`,
  titulo: `Comando ${i}`,
  accion: () => undefined,
}));

describe("helpers de navegación de listas", () => {
  it("mapea RePág/AvPág, Inicio y Fin (sin modificadores)", () => {
    expect(movimientoDeTecla({ key: "PageDown" })).toBe("paginaAbajo");
    expect(movimientoDeTecla({ key: "PageUp" })).toBe("paginaArriba");
    expect(movimientoDeTecla({ key: "Home" })).toBe("inicio");
    expect(movimientoDeTecla({ key: "End" })).toBe("fin");
    expect(movimientoDeTecla({ key: "ArrowUp" })).toBe("arriba");
    expect(movimientoDeTecla({ key: "ArrowDown", ctrlKey: true })).toBeNull();
    expect(movimientoDeTecla({ key: "a" })).toBeNull();
  });

  it("no se sale de los límites de la lista", () => {
    expect(indiceTrasMovimiento("abajo", 4, 5, 10)).toBe(4);
    expect(indiceTrasMovimiento("paginaAbajo", 0, 30, 10)).toBe(10);
    expect(indiceTrasMovimiento("paginaArriba", 3, 30, 10)).toBe(0);
    expect(indiceTrasMovimiento("fin", 3, 30, 10)).toBe(29);
    expect(indiceTrasMovimiento("inicio", 3, 30, 10)).toBe(0);
  });

  it("RePág/AvPág miden por el tamaño del contenedor", () => {
    const ul = document.createElement("ul");
    expect(renglonesPorPagina(null)).toBe(10);
    const li = document.createElement("li");
    Object.defineProperty(li, "offsetHeight", { value: 25 });
    ul.appendChild(li);
    Object.defineProperty(ul, "clientHeight", { value: 250 });
    expect(renglonesPorPagina(ul)).toBe(9);
  });
});

describe("paleta de comandos", () => {
  it("flechas, RePág/AvPág, Inicio y Fin mueven la selección", async () => {
    const user = userEvent.setup();
    render(<PaletaComandos comandos={comandos} onCerrar={() => undefined} />);
    await user.keyboard("{PageDown}");
    const activa = () => screen.getByRole("listbox").querySelector('[aria-selected="true"]');
    expect(await vi.waitFor(() => activa()?.textContent)).toContain("Comando 10");
    await user.keyboard("{End}");
    await waitFor(() => expect(activa()?.textContent).toContain("Comando 29"));
    await user.keyboard("{Home}");
    await waitFor(() => expect(activa()?.textContent).toContain("Comando 0"));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(activa()?.textContent).toContain("Comando 1"));
  });

  it("filtra por texto y Enter ejecuta el comando elegido", async () => {
    const user = userEvent.setup();
    let ejecutado = "";
    render(
      <PaletaComandos
        comandos={[
          { id: "a", titulo: "Configuración", accion: () => (ejecutado = "config") },
          { id: "b", titulo: "Ayuda", accion: () => (ejecutado = "ayuda") },
        ]}
        onCerrar={() => undefined}
      />,
    );
    await user.type(screen.getByRole("combobox", { name: "Buscar comando" }), "conf");
    expect(screen.getByRole("listbox").textContent).toContain("Configuración");
    expect(screen.getByRole("listbox").textContent).not.toContain("Ayuda");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(ejecutado).toBe("config"));
  });
});

describe("atajos de la app", () => {
  it("Ctrl+K abre la paleta y F1 abre los atajos; Esc los cierra", async () => {
    montarApp();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Buscar comando" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Buscar comando" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "F1" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Paleta de comandos")).toBeInTheDocument();
  });
});
