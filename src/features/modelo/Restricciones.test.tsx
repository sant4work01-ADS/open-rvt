// O016: restricciones de base y tope en el panel de propiedades.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { llamar } = vi.hoisted(() => ({ llamar: vi.fn() }));

vi.mock("@/lib/bitacora", () => ({
  llamarConBitacora: (metodo: string, params: Record<string, unknown>) =>
    llamar(metodo, params),
}));

import { useModelo } from "./estado";
import { PropiedadesElemento } from "./PanelPropiedades";
import type { PropiedadesElemento as Propiedades } from "./tipos";

function props(restricciones: NonNullable<Propiedades["restricciones"]>): Propiedades {
  return {
    globalid: "m1",
    clase: "IfcWall",
    nombre: "Muro Block 15",
    nivel: "Nivel 0",
    tipo: "Block 15",
    atributos: {},
    materiales: [],
    psets: {
      OPENRVT_Muro: { Altura: restricciones.NivelTope ? 3.0 : restricciones.AlturaSinConexion },
    },
    restricciones,
  };
}

describe("restricciones de base y tope (O016)", () => {
  beforeEach(() => {
    llamar.mockReset();
    llamar.mockImplementation(async (metodo: string) => {
      if (metodo === "modelo.propiedades") return props(base);
      return { creados: [], modificados: ["m1"], borrados: [] };
    });
    useModelo.setState({
      error: null,
      niveles: [
        { globalid: "n0", nombre: "Nivel 0", elevacion: 0 },
        { globalid: "n1", nombre: "Nivel 1", elevacion: 3 },
      ],
      tiposMuro: [],
    });
  });
  afterEach(cleanup);

  const base = {
    NivelBase: "n0",
    DesfaseBase: 0,
    NivelTope: "n1",
    DesfaseTope: 0,
    AlturaSinConexion: 3,
  };

  it("los combos muestran los niveles y «Sin conexión»", () => {
    useModelo.setState({ propiedades: props(base) });
    render(<PropiedadesElemento />);
    const opciones = (testid: string) =>
      Array.from(screen.getByTestId(testid).querySelectorAll("option")).map((o) => o.textContent);
    expect(opciones("restriccion-base")).toEqual(["Nivel 0", "Nivel 1"]);
    expect(opciones("restriccion-tope")).toEqual(["Sin conexión", "Nivel 0", "Nivel 1"]);
  });

  it("con tope ligado la altura se muestra calculada y sin editar", () => {
    useModelo.setState({ propiedades: props(base) });
    render(<PropiedadesElemento />);
    const altura = screen.getByTestId("elemento-altura");
    expect(altura.tagName).toBe("SPAN");
    expect(altura.textContent).toBe("3.00");
  });

  it("«Sin conexión» habilita la altura y llama al RPC con sus argumentos", async () => {
    useModelo.setState({
      propiedades: props({ ...base, NivelTope: "", AlturaSinConexion: 2.6 }),
    });
    render(<PropiedadesElemento />);
    const altura = screen.getByTestId("elemento-altura") as HTMLInputElement;
    expect(altura.tagName).toBe("INPUT");
    expect(altura.value).toBe("2.6");
    fireEvent.blur(altura, { target: { value: "2.75" } });
    await waitFor(() =>
      expect(llamar).toHaveBeenCalledWith("restricciones.editar", {
        globalid: "m1",
        altura_sin_conexion: 2.75,
      }),
    );
  });

  it("cambiar base y tope envía los GlobalId de los niveles", async () => {
    useModelo.setState({ propiedades: props(base) });
    render(<PropiedadesElemento />);
    fireEvent.change(screen.getByTestId("restriccion-base"), {
      target: { value: "n1" },
    });
    await waitFor(() =>
      expect(llamar).toHaveBeenCalledWith("restricciones.editar", {
        globalid: "m1",
        nivel_base: "n1",
      }),
    );
    fireEvent.change(screen.getByTestId("restriccion-tope"), {
      target: { value: "" },
    });
    await waitFor(() =>
      expect(llamar).toHaveBeenCalledWith("restricciones.editar", {
        globalid: "m1",
        nivel_tope: "",
      }),
    );
  });
});
