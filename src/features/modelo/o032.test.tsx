// O032: barra de opciones y propiedades de losa. Valores de la spec: desfase
// común 0.075 m; con 0.10 y 0 en dos lados, el campo común muestra «Varios».
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarraHerramienta } from "./BarraHerramienta";
import { PropiedadesElemento } from "./PanelPropiedades";
import { useModelo } from "./estado";
import type { PropiedadesElemento as Props } from "./tipos";

afterEach(cleanup);

function propiedades(psets: Record<string, Record<string, unknown>>): Props {
  return {
    globalid: "losa-1",
    clase: "IfcSlab",
    nombre: "Losa",
    nivel: "n0",
    tipo: "",
    atributos: {},
    materiales: [],
    psets,
  } as unknown as Props;
}

describe("O032: barra de opciones", () => {
  it("el muro ofrece línea de ubicación y desfase", () => {
    useModelo.setState({
      herramienta: "muro",
      tiposMuro: [{ globalid: "t1", nombre: "Block 15", espesor: 0.15 }],
      opcionesMuro: {
        tipo: "Block 15",
        altura: 2.6,
        alineacion: "centro",
        lineaUbicacion: "cara_exterior",
        desfaseUbicacion: 0.075,
      },
    });
    render(<BarraHerramienta />);
    const linea = screen.getByTestId("muro-linea-ubicacion") as HTMLSelectElement;
    const desfase = screen.getByTestId("muro-desfase-ubicacion") as HTMLInputElement;
    expect(linea.value).toBe("cara_exterior");
    expect(desfase.value).toBe("0.075");
    fireEvent.change(linea, { target: { value: "cara_interior" } });
    expect(useModelo.getState().opcionesMuro.lineaUbicacion).toBe("cara_interior");
  });

  it("la losa ofrece borde a y desfase común", () => {
    useModelo.setState({
      herramienta: "losa",
      opcionesLosa: { lado: "eje", desfase: 0.075, uso: "entrepiso" },
    });
    render(<BarraHerramienta />);
    expect((screen.getByTestId("losa-borde-a") as HTMLSelectElement).value).toBe("eje");
    expect((screen.getByTestId("losa-desfase") as HTMLInputElement).value).toBe("0.075");
    fireEvent.change(screen.getByTestId("losa-borde-a"), {
      target: { value: "exterior" },
    });
    expect(useModelo.getState().opcionesLosa.lado).toBe("exterior");
  });
});

describe("O032: propiedades de losa y muro", () => {
  it("muestra «Varios» y una fila por borde con su desfase", () => {
    const editar = vi.fn(async () => {});
    useModelo.setState({
      propiedades: propiedades({
        OPENRVT_Losa: {
          Espesor: 0.12,
          Bordes: JSON.stringify([
            { referencia: "muro", lado: "exterior", desfase: 0.1 },
            { referencia: "muro", lado: "exterior", desfase: 0 },
            { referencia: "libre", desfase: 0 },
          ]),
        },
      }),
      editarElemento: editar,
      tiposMuro: [],
      referencias: useModelo.getState().referencias,
    });
    render(<PropiedadesElemento />);
    expect((screen.getByTestId("elemento-desfase-bordes") as HTMLInputElement).value).toBe(
      "Varios",
    );
    expect(screen.getByTestId("elemento-borde-0")).toBeTruthy();
    expect(screen.getByTestId("elemento-borde-2")).toBeTruthy();
    fireEvent.blur(screen.getByTestId("elemento-borde-1-desfase"), {
      target: { value: "0.25" },
    });
    expect(editar).toHaveBeenCalledWith("losa-1", {
      cambio_borde: { indice: 1, desfase: 0.25 },
    });
  });

  it("el muro cambia la línea y tiene flecha de volteo", () => {
    const editar = vi.fn(async () => {});
    const voltear = vi.fn(async () => {});
    useModelo.setState({
      propiedades: {
        globalid: "muro-1",
        clase: "IfcWall",
        nombre: "Muro",
        nivel: "n0",
        tipo: "Block 15",
        atributos: {},
        materiales: [],
        psets: {
          OPENRVT_Muro: {
            Altura: 2.6,
            LineaUbicacion: "eje_nucleo",
            DesfaseUbicacion: 0,
          },
        },
      } as unknown as Props,
      editarElemento: editar,
      voltearMuro: voltear,
      tiposMuro: [{ globalid: "t1", nombre: "Block 15", espesor: 0.15 }],
      referencias: useModelo.getState().referencias,
    });
    render(<PropiedadesElemento />);
    fireEvent.change(screen.getByTestId("elemento-linea-ubicacion"), {
      target: { value: "cara_exterior" },
    });
    expect(editar).toHaveBeenCalledWith("muro-1", {
      linea_ubicacion: "cara_exterior",
    });
    fireEvent.click(screen.getByTestId("elemento-voltear-muro"));
    expect(voltear).toHaveBeenCalledWith("muro-1");
  });
});
