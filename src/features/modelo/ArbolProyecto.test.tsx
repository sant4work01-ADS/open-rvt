// O038: árbol del proyecto (componente). Prueba el ojo que oculta a los hijos, el
// estado intermedio con hijos mezclados, que lo bloqueado no se selecciona, que un
// tipo selecciona todos sus elementos y que la búsqueda filtra y expande.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArbolProyecto } from "./ArbolProyecto";
import type { NodoArbol } from "./arbol";

function arbolEjemplo(): NodoArbol {
  return {
    clave: "edificio",
    nombre: "Edificio",
    tipo: "edificio",
    conteo: 3,
    hijos: [
      {
        clave: "nivel:n0",
        nombre: "Nivel 0",
        tipo: "nivel",
        globalid: "n0",
        elevacion: 0,
        conteo: 3,
        hijos: [
          {
            clave: "categoria:muros",
            nombre: "Muros",
            tipo: "categoria",
            categoria: "muros",
            conteo: 2,
            hijos: [
              {
                clave: "tipo:t1",
                nombre: "Block 15",
                tipo: "tipo",
                globalid: "t1",
                conteo: 2,
                hijos: [
                  { clave: "elemento:e1", nombre: "Muro 1", tipo: "elemento", globalid: "e1", clase: "IfcWall", conteo: 1 },
                  { clave: "elemento:e2", nombre: "Muro 2", tipo: "elemento", globalid: "e2", clase: "IfcWall", conteo: 1 },
                ],
              },
            ],
          },
          {
            clave: "categoria:losas",
            nombre: "Losas",
            tipo: "categoria",
            categoria: "losas",
            conteo: 1,
            hijos: [
              {
                clave: "tipo:sin-tipo",
                nombre: "(sin tipo)",
                tipo: "tipo",
                conteo: 1,
                hijos: [
                  { clave: "elemento:e3", nombre: "Losa 1", tipo: "elemento", globalid: "e3", clase: "IfcSlab", conteo: 1 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function propsBase() {
  return {
    arbol: arbolEjemplo(),
    ocultos: [] as string[],
    bloqueados: [] as string[],
    seleccionados: [] as string[],
    onAlternar: vi.fn(),
    onAislar: vi.fn(),
    onMostrarTodo: vi.fn(),
    onElegirElemento: vi.fn(),
    onElegirElementos: vi.fn(),
    onElegirEje: vi.fn(),
    onElegirNivel: vi.fn(),
    onAjustar: vi.fn(),
  };
}

function ojo(container: HTMLElement, clave: string): Element {
  const el = container.querySelector(`[data-testid="arbol-ojo"][data-clave="${clave}"]`);
  if (!el) throw new Error(`no hay ojo para ${clave}`);
  return el;
}

/** Expande un nodo plegable para que sus hijos queden renderizados. */
function expandir(container: HTMLElement, clave: string): void {
  const boton = container.querySelector(
    `[data-testid="arbol-nodo"][data-clave="${clave}"] [data-testid="arbol-expandir"]`,
  );
  if (!boton) throw new Error(`no hay botón de expandir para ${clave}`);
  fireEvent.click(boton);
}

afterEach(cleanup);

describe("ojo (visible/oculto)", () => {
  it("el ojo de un padre pide ocultar el nodo completo", () => {
    const props = propsBase();
    const { container } = render(<ArbolProyecto {...props} />);
    fireEvent.click(ojo(container, "categoria:muros"));
    expect(props.onAlternar).toHaveBeenCalledWith("categoria:muros", "oculto");
  });

  it("muestra estado intermedio cuando los hijos están mezclados", () => {
    const props = propsBase();
    props.ocultos = ["elemento:e1"];
    const { container } = render(<ArbolProyecto {...props} />);
    expandir(container, "categoria:muros");
    const estado = container.querySelector(
      '[data-testid="arbol-ojo"][data-clave="tipo:t1"] svg',
    )?.getAttribute("data-visible");
    expect(estado).toBe("parcial");
    const categoria = container.querySelector(
      '[data-testid="arbol-ojo"][data-clave="categoria:muros"] svg',
    )?.getAttribute("data-visible");
    expect(categoria).toBe("parcial");
    const losa = container.querySelector(
      '[data-testid="arbol-ojo"][data-clave="categoria:losas"] svg',
    )?.getAttribute("data-visible");
    expect(losa).toBe("true");
  });
});

describe("candado (bloqueado)", () => {
  it("un elemento bloqueado no se selecciona al hacer clic", () => {
    const props = propsBase();
    props.bloqueados = ["elemento:e1"];
    const { container } = render(<ArbolProyecto {...props} />);
    expandir(container, "categoria:muros");
    expandir(container, "tipo:t1");
    const nodo = container.querySelector('[data-testid="arbol-nodo"][data-clave="elemento:e1"]');
    fireEvent.click(nodo!);
    expect(props.onElegirElemento).not.toHaveBeenCalled();
  });
});

describe("selección", () => {
  it("clic en un tipo selecciona todos sus elementos", () => {
    const props = propsBase();
    const { container } = render(<ArbolProyecto {...props} />);
    expandir(container, "categoria:muros");
    const nodo = container.querySelector('[data-testid="arbol-nodo"][data-clave="tipo:t1"]');
    fireEvent.click(nodo!);
    expect(props.onElegirElementos).toHaveBeenCalledWith(["e1", "e2"]);
  });

  it("clic en un elemento selecciona solo ese elemento", () => {
    const props = propsBase();
    const { container } = render(<ArbolProyecto {...props} />);
    expandir(container, "categoria:muros");
    expandir(container, "tipo:t1");
    const nodo = container.querySelector('[data-testid="arbol-nodo"][data-clave="elemento:e1"]');
    fireEvent.click(nodo!);
    expect(props.onElegirElemento).toHaveBeenCalledWith("e1");
  });
});

describe("búsqueda", () => {
  it("filtra y expande las ramas que coinciden", () => {
    const props = propsBase();
    const { container } = render(<ArbolProyecto {...props} />);
    fireEvent.change(container.querySelector('[data-testid="arbol-buscador"]')!, {
      target: { value: "losa" },
    });
    expect(container.textContent).toContain("Losas");
    expect(container.textContent).not.toContain("Muros");
  });
});
