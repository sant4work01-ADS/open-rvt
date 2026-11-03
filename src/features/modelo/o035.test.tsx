// O035: casilla «Bajar hasta la cimentación» en Propiedades del muro. Viene
// activada por omisión y al quitarla avisa al núcleo con el cambio exacto.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropiedadesElemento } from "./PanelPropiedades";
import { useModelo } from "./estado";
import type { PropiedadesElemento as Props } from "./tipos";

afterEach(cleanup);

function propiedades(psets: Record<string, Record<string, unknown>>): Props {
  return {
    globalid: "muro-1",
    clase: "IfcWall",
    nombre: "Muro",
    nivel: "n0",
    tipo: "Block 15",
    atributos: {},
    materiales: [],
    psets,
  } as unknown as Props;
}

function montar(psets: Record<string, Record<string, unknown>>) {
  const editar = vi.fn(async () => {});
  useModelo.setState({
    propiedades: propiedades(psets),
    editarElemento: editar,
    tiposMuro: [{ globalid: "t1", nombre: "Block 15", espesor: 0.15 }],
    referencias: useModelo.getState().referencias,
  });
  render(<PropiedadesElemento />);
  return editar;
}

describe("O035: casilla de bajar hasta la cimentación", () => {
  it("aparece activada cuando el muro no trae la propiedad", () => {
    montar({ OPENRVT_Muro: { Altura: 2.6, LineaUbicacion: "eje_nucleo" } });
    const casilla = screen.getByTestId(
      "elemento-bajar-cimentacion",
    ) as HTMLInputElement;
    expect(casilla.checked).toBe(true);
  });

  it("respeta el valor guardado en el pset", () => {
    montar({
      OPENRVT_Muro: { Altura: 2.6, BajarACimentacion: false },
    });
    const casilla = screen.getByTestId(
      "elemento-bajar-cimentacion",
    ) as HTMLInputElement;
    expect(casilla.checked).toBe(false);
  });

  it("al quitarla manda bajar_a_cimentacion=false al núcleo", () => {
    const editar = montar({
      OPENRVT_Muro: { Altura: 2.6, BajarACimentacion: true },
    });
    fireEvent.click(screen.getByTestId("elemento-bajar-cimentacion"));
    expect(editar).toHaveBeenCalledWith("muro-1", {
      bajar_a_cimentacion: false,
    });
  });
});
