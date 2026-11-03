// O038: árbol del proyecto (componente). Prueba el ojo que oculta a los hijos, el
// estado intermedio con hijos mezclados, que lo bloqueado no se selecciona, que un
// tipo selecciona todos sus elementos y que la búsqueda filtra y expande.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArbolProyecto } from "./ArbolProyecto";
import type { ArbolObra, NodoArbol } from "./arbol";

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


// ---------------------------------------------------------------- O039: modo Obra
function arbolObra(): ArbolObra {
  return {
    tipo: "obra",
    clave: "obra",
    nombre: "Obra",
    conteo: 2,
    capitulos: [
      {
        clave: "capitulo:c1",
        globalid: "c1",
        identificacion: "02",
        nombre: "Cimentación",
        orden: 1,
        conteo: 1,
        partidas: [
          {
            clave: "partida:clave|CIM-010|m3",
            clave_pp: "CIM-010",
            nombre: "Concreto en zapatas",
            unidad: "m3",
            total: 1.234,
            conteo: 2,
            renglones: [
              {
                clave: "renglon:z1",
                globalid: "z1",
                elemento: "Zapata 1",
                descripcion: "Z-1 · Zapata 1",
                resultado: 0.617,
              },
              {
                clave: "renglon:z2",
                globalid: "z2",
                elemento: "Zapata 2",
                descripcion: "Z-1 · Zapata 2",
                resultado: 0.617,
              },
            ],
          },
        ],
      },
      {
        clave: "capitulo:c2",
        globalid: "c2",
        identificacion: "05",
        nombre: "Acabados",
        orden: 2,
        conteo: 1,
        partidas: [
          {
            clave: "partida:nombre|Aplanado exterior|m2",
            clave_pp: "",
            nombre: "Aplanado exterior",
            unidad: "m2",
            total: 39.71,
            conteo: 1,
            renglones: [
              {
                clave: "renglon:m1",
                globalid: "m1",
                elemento: "Muro 1",
                descripcion: "Block 15 · Muro 1 · capa: Aplanado exterior",
                resultado: 39.71,
              },
            ],
          },
        ],
      },
    ],
  };
}

function propsObra() {
  return {
    ...propsBase(),
    arbolObra: arbolObra(),
    onMoverPartidaObra: vi.fn(),
    onCrearCapituloObra: vi.fn(),
    onRenombrarCapituloObra: vi.fn(),
    onMoverCapituloObra: vi.fn(),
    onBorrarCapituloObra: vi.fn(),
  };
}

function irAObra(container: HTMLElement): void {
  fireEvent.click(container.querySelector('[data-testid="arbol-modo-obra"]')!);
}

describe("O039 selector Modelo | Obra", () => {
  it("muestra los dos modos y cambia al árbol del presupuesto", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    expect(container.querySelector('[data-testid="arbol-modo-modelo"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="arbol-modo-obra"]')).not.toBeNull();
    irAObra(container);
    expect(container.textContent).toContain("Cimentación (1)");
    expect(container.textContent).toContain("CIM-010 Concreto en zapatas · 1.234 m³");
    expect(container.textContent).toContain("Aplanado exterior · 39.710 m²");
  });
});

describe("O039 selección en Obra", () => {
  it("clic en una partida selecciona todos sus elementos", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    fireEvent.click(container.querySelector('[data-testid="obra-partida"]')!);
    expect(props.onElegirElementos).toHaveBeenCalledWith(["z1", "z2"]);
  });

  it("clic en un capítulo selecciona todos sus elementos", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    fireEvent.click(container.querySelector('[data-testid="obra-capitulo"]')!);
    expect(props.onElegirElementos).toHaveBeenCalledWith(["z1", "z2"]);
  });

  it("clic en un renglón selecciona su elemento", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    fireEvent.click(container.querySelector('[data-testid="obra-renglon"]')!);
    expect(props.onElegirElemento).toHaveBeenCalledWith("z1");
  });
});

describe("O039 arrastrar una partida a otro capítulo", () => {
  it("llama a mover con la partida y el capítulo de destino", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    const partida = container.querySelector(
      '[data-testid="obra-partida"][data-capitulo="02"]',
    )!;
    const destino = container.querySelector(
      '[data-testid="obra-capitulo"][data-identificacion="05"]',
    )!;
    fireEvent.dragStart(partida);
    fireEvent.dragOver(destino);
    fireEvent.drop(destino);
    expect(props.onMoverPartidaObra).toHaveBeenCalledTimes(1);
    const [movida, capitulo] = props.onMoverPartidaObra.mock.calls[0];
    expect(movida.clave).toBe("partida:clave|CIM-010|m3");
    expect(capitulo.identificacion).toBe("05");
  });

  it("el menú contextual «Mover a capítulo…» llama al comando correcto", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    const partida = container.querySelector('[data-testid="obra-partida"]')!;
    fireEvent.contextMenu(partida);
    fireEvent.click(container.querySelector('[data-testid="obra-menu-mover"]')!);
    fireEvent.click(container.querySelector('[data-testid="obra-mover-capitulo-05"]')!);
    expect(props.onMoverPartidaObra).toHaveBeenCalledTimes(1);
    expect(props.onMoverPartidaObra.mock.calls[0][1].identificacion).toBe("05");
  });
});

describe("O039 menú de capítulos", () => {
  it("crear y renombrar piden el nombre y llaman a su comando", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    fireEvent.contextMenu(container.querySelector('[data-testid="obra-capitulo"]')!);
    fireEvent.click(container.querySelector('[data-testid="obra-menu-nuevo"]')!);
    const entrada = container.querySelector('[data-testid="obra-nombre"]') as HTMLInputElement;
    fireEvent.change(entrada, { target: { value: "Extras" } });
    fireEvent.click(container.querySelector('[data-testid="obra-nombre-aceptar"]')!);
    expect(props.onCrearCapituloObra).toHaveBeenCalledWith("Extras");

    fireEvent.contextMenu(container.querySelector('[data-testid="obra-capitulo"]')!);
    fireEvent.click(container.querySelector('[data-testid="obra-menu-renombrar"]')!);
    const renombrar = container.querySelector('[data-testid="obra-nombre"]') as HTMLInputElement;
    fireEvent.change(renombrar, { target: { value: "Cimentación profunda" } });
    fireEvent.click(container.querySelector('[data-testid="obra-nombre-aceptar"]')!);
    expect(props.onRenombrarCapituloObra).toHaveBeenCalledWith(
      "02",
      "Cimentación profunda",
    );
  });

  it("borrar pide confirmación antes de llamar al comando", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    fireEvent.contextMenu(container.querySelector('[data-testid="obra-capitulo"]')!);
    fireEvent.click(container.querySelector('[data-testid="obra-menu-borrar"]')!);
    expect(props.onBorrarCapituloObra).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-testid="obra-borrar-aceptar"]')!);
    expect(props.onBorrarCapituloObra).toHaveBeenCalledWith("02");
  });

  it("subir y bajar llaman al comando con su dirección", () => {
    const props = propsObra();
    const { container } = render(<ArbolProyecto {...props} />);
    irAObra(container);
    fireEvent.contextMenu(container.querySelector('[data-testid="obra-capitulo"]')!);
    fireEvent.click(container.querySelector('[data-testid="obra-menu-bajar"]')!);
    expect(props.onMoverCapituloObra).toHaveBeenCalledWith("02", "bajar");
  });
});
