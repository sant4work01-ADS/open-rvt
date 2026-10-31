// O029: en planta o 3D la herramienta Nivel no ofrece su barra de opciones; solo
// avisa que hace falta un alzado o corte.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BarraHerramienta } from "./BarraHerramienta";
import { useModelo } from "./estado";
import { CATEGORIAS_TODAS, type Vista } from "./tipos";

function vista(tipo: Vista["tipo"], id: string = tipo): Vista {
  return {
    id,
    nombre: id,
    tipo,
    nivelesVisibles: ["n1"],
    categorias: CATEGORIAS_TODAS(),
    estilo: "lineas-ocultas",
    escala: 100,
  };
}

afterEach(cleanup);

describe("O029: barra de la herramienta Nivel", () => {
  it("en alzado muestra las opciones en una sola línea", () => {
    const alzado = vista("alzado", "alz");
    useModelo.setState({
      herramienta: "nivel",
      vistas: [alzado],
      vistaActivaId: alzado.id,
      opcionesNivel: {
        nombre: "Nivel 1.5",
        nombreAutomatico: true,
        crearPlanta: true,
        elevacionTexto: "",
      },
    });
    render(<BarraHerramienta />);
    expect(screen.getByTestId("nivel-herramienta-crear-planta")).toBeTruthy();
    expect(screen.getByText("Crear vista de planta")).toBeTruthy();
    expect(screen.queryByTestId("nivel-solo-alzado")).toBeNull();
  });

  it("en planta solo avisa «Abre un alzado o corte», sin barra ni cotas", () => {
    const planta = vista("planta", "pl");
    useModelo.setState({
      herramienta: "nivel",
      vistas: [planta],
      vistaActivaId: planta.id,
      opcionesNivel: {
        nombre: "Nivel 1.5",
        nombreAutomatico: true,
        crearPlanta: true,
        elevacionTexto: "",
      },
    });
    render(<BarraHerramienta />);
    expect(screen.getByTestId("nivel-solo-alzado").textContent).toBe("Abre un alzado o corte");
    expect(screen.queryByTestId("nivel-herramienta-nombre")).toBeNull();
    expect(screen.queryByTestId("nivel-herramienta-crear-planta")).toBeNull();
    expect(screen.queryByTestId("nivel-herramienta-cotas")).toBeNull();
  });
});
