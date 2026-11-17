// O067: la losa se cambia de nivel y de desfase desde Propiedades.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropiedadesElemento } from "./PanelPropiedades";
import { useModelo } from "./estado";
import type { PropiedadesElemento as Props } from "./tipos";

afterEach(cleanup);

const NIVELES = [
  { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
  { globalid: "n1", nombre: "Nivel 1", elevacion: 3 },
];

function propiedades(extra: Partial<Props> = {}): Props {
  return {
    globalid: "losa-1",
    clase: "IfcSlab",
    nombre: "Losa de entrepiso",
    nivel: "Nivel 0",
    nivel_globalid: "n0",
    tipo: "",
    atributos: { PredefinedType: "FLOOR" },
    materiales: [],
    uso: "entrepiso",
    psets: { OPENRVT_Losa: { Uso: "entrepiso", Espesor: 0.12, Desfase: 0 } },
    ...extra,
  } as unknown as Props;
}

function montar(extra: Partial<Props> = {}) {
  const editar = vi.fn(async () => {});
  useModelo.setState({
    propiedades: propiedades(extra),
    editarElemento: editar,
    niveles: NIVELES,
    referencias: useModelo.getState().referencias,
  });
  render(<PropiedadesElemento />);
  return editar;
}

describe("O067: losa de nivel y desfase en el panel", () => {
  it("muestra el nivel actual de la losa y no lo adivina", () => {
    montar();
    const select = screen.getByTestId("prop-nivel-losa") as HTMLSelectElement;
    expect(select.value).toBe("n0");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["n0", "n1"]);
  });

  it("al cambiar el nivel llama a editar con el GlobalId del nivel", () => {
    const editar = montar();
    fireEvent.change(screen.getByTestId("prop-nivel-losa"), {
      target: { value: "n1" },
    });
    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledWith("losa-1", { nivel: "n1" });
  });

  it("el desfase muestra el valor guardado y guarda el negativo con Enter", () => {
    const editar = montar({
      psets: { OPENRVT_Losa: { Uso: "entrepiso", Espesor: 0.12, Desfase: 0 } },
    });
    const campo = screen.getByTestId("elemento-desfase-losa") as HTMLInputElement;
    expect(campo.step).toBe("0.01");
    campo.focus();
    fireEvent.change(campo, { target: { value: "-0.05" } });
    fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledWith("losa-1", { desfase: -0.05 });
  });

  it("el desfase ya guardado aparece en el campo, no cero", () => {
    montar({
      psets: { OPENRVT_Losa: { Uso: "entrepiso", Espesor: 0.12, Desfase: -0.05 } },
    });
    const campo = screen.getByTestId("elemento-desfase-losa") as HTMLInputElement;
    expect(campo.value).toBe("-0.05");
  });

  it("cambiar el nivel no toca el uso", () => {
    const editar = montar();
    fireEvent.change(screen.getByTestId("prop-nivel-losa"), {
      target: { value: "n1" },
    });
    expect(editar).not.toHaveBeenCalledWith(
      "losa-1",
      expect.objectContaining({ uso: expect.anything() }),
    );
  });
});
