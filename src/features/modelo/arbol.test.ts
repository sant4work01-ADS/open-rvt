// O038: pruebas de las funciones puras del árbol del proyecto.
import { describe, expect, it } from "vitest";
import {
  elementosDeNodo,
  estadoDeNodo,
  expandirGlobalids,
  filtrarArbol,
  indexarArbol,
  nodoCoincide,
  rutaDeElemento,
  type NodoArbol,
} from "./arbol";

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
      {
        clave: "referencias",
        nombre: "Referencias",
        tipo: "referencias",
        hijos: [
          {
            clave: "referencias:ejes",
            nombre: "Ejes",
            tipo: "grupo",
            conteo: 1,
            hijos: [{ clave: "eje:g1", nombre: "1", tipo: "eje", globalid: "g1", conteo: 1 }],
          },
        ],
      },
    ],
  };
}

describe("indexarArbol y expandirGlobalids", () => {
  it("ocultar un padre expande a todos sus elementos descendientes", () => {
    const indice = indexarArbol(arbolEjemplo());
    expect(expandirGlobalids(indice, ["categoria:muros"])).toEqual(new Set(["e1", "e2"]));
    expect(expandirGlobalids(indice, ["nivel:n0"])).toEqual(new Set(["e1", "e2", "e3"]));
    expect(expandirGlobalids(indice, ["elemento:e1"])).toEqual(new Set(["e1"]));
  });

  it("elementosDeNodo devuelve los GlobalIds de un tipo", () => {
    const indice = indexarArbol(arbolEjemplo());
    expect(elementosDeNodo(indice, "tipo:t1").sort()).toEqual(["e1", "e2"]);
  });
});

describe("estadoDeNodo", () => {
  const indice = indexarArbol(arbolEjemplo());

  it("un nodo oculto completo y sus hijos muestran «completo»", () => {
    const ocultos = new Set(["categoria:muros"]);
    expect(estadoDeNodo(indice, "categoria:muros", ocultos)).toBe("completo");
    // el padre (nivel) ya tiene todos sus muros ocultos pero aún hay losa visible.
    expect(estadoDeNodo(indice, "nivel:n0", ocultos)).toBe("parcial");
  });

  it("hijos mezclados muestran «parcial» en el padre", () => {
    const ocultos = new Set(["elemento:e1"]);
    expect(estadoDeNodo(indice, "elemento:e1", ocultos)).toBe("completo");
    expect(estadoDeNodo(indice, "tipo:t1", ocultos)).toBe("parcial");
    expect(estadoDeNodo(indice, "categoria:losas", ocultos)).toBe("ninguno");
  });

  it("un nodo sin descendientes ocultos muestra «ninguno»", () => {
    expect(estadoDeNodo(indice, "categoria:losas", new Set(["elemento:e1"]))).toBe("ninguno");
  });
});

describe("búsqueda", () => {
  it("filtra por nombre y conserva la rama que contiene la coincidencia", () => {
    const filtrado = filtrarArbol(arbolEjemplo(), "losa");
    expect(filtrado).not.toBeNull();
    const nivel = filtrado!.hijos!.find((h) => h.tipo === "nivel")!;
    expect(nivel.hijos!.map((h) => h.nombre)).toEqual(["Losas"]);
  });

  it("coincide por GlobalId aunque el nombre no lo contenga", () => {
    expect(nodoCoincide({ clave: "x", nombre: "Muro 1", tipo: "elemento", globalid: "e1" }, "e1")).toBe(true);
    expect(nodoCoincide({ clave: "x", nombre: "Muro 1", tipo: "elemento", globalid: "e1" }, "e2")).toBe(false);
  });

  it("sin consulta devuelve el árbol completo", () => {
    expect(filtrarArbol(arbolEjemplo(), "")).toEqual(arbolEjemplo());
  });
});

describe("rutaDeElemento", () => {
  it("devuelve las claves desde la raíz hasta el elemento", () => {
    expect(rutaDeElemento(arbolEjemplo(), "e2")).toEqual([
      "edificio",
      "nivel:n0",
      "categoria:muros",
      "tipo:t1",
      "elemento:e2",
    ]);
    expect(rutaDeElemento(arbolEjemplo(), "e99")).toBeNull();
  });
});
