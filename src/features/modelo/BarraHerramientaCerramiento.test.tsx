// O041: la herramienta Cerramiento muestra «Nivel» y «Desfase» antes del clic,
// con la corona del muro como valor por omisión; lo elegido se guarda en el
// estado y viaja al núcleo al crear.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BarraHerramienta } from "./BarraHerramienta";
import { useModelo } from "./estado";

afterEach(cleanup);

describe("O041: barra de la herramienta Cerramiento", () => {
  beforeEach(() => {
    useModelo.setState({
      herramienta: "cerramiento",
      niveles: [
        { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
        { globalid: "n1", nombre: "Nivel 1", elevacion: 2.6 },
      ],
      tiposHerramienta: [
        {
          globalid: "t1",
          nombre: "CE-1 Cerramiento 15×20",
          alias: "cerramiento",
          descripcion: "",
        },
      ],
      opcionesCerramiento: { nivel: "", desfase: "" },
    });
  });

  it("muestra el selector de nivel con «Corona del muro» por omisión y el desfase", () => {
    render(<BarraHerramienta />);
    const selector = screen.getByTestId("cerramiento-nivel") as HTMLSelectElement;
    expect(selector.value).toBe("");
    expect(selector.options[0].textContent).toBe("Corona del muro");
    expect(selector.options.length).toBe(3);
    const desfase = screen.getByTestId("cerramiento-desfase") as HTMLInputElement;
    expect(desfase.value).toBe("");
  });

  it("elegir nivel y desfase los fija en el estado", () => {
    render(<BarraHerramienta />);
    fireEvent.change(screen.getByTestId("cerramiento-nivel"), {
      target: { value: "n1" },
    });
    fireEvent.change(screen.getByTestId("cerramiento-desfase"), {
      target: { value: "-0.20" },
    });
    expect(useModelo.getState().opcionesCerramiento).toEqual({
      nivel: "n1",
      desfase: "-0.20",
    });
  });

  it("la herramienta dala no muestra nivel ni desfase", () => {
    useModelo.setState({ herramienta: "dala" });
    render(<BarraHerramienta />);
    expect(screen.queryByTestId("cerramiento-nivel")).toBeNull();
    expect(screen.queryByTestId("cerramiento-desfase")).toBeNull();
  });
});
