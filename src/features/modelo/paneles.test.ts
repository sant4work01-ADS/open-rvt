// O070: valores a mano de la spec: el separador nunca deja menos del 20 % de
// cada lado; la proporción guardada es la del dueño (0.70 exacto) y el pset
// conserva la vista de cada panel sin tocar la lista de vistas.
import { describe, expect, it } from "vitest";
import {
  conVistaEnPanel,
  limitarProporcion,
  normalizarPaneles,
  panelesIniciales,
  sanearPaneles,
  serializarPaneles,
} from "./paneles";

describe("O070: proporción del separador", () => {
  it("limita al 20 % por cada lado", () => {
    expect(limitarProporcion(0.2)).toBe(0.2);
    expect(limitarProporcion(0.05)).toBe(0.2);
    expect(limitarProporcion(0)).toBe(0.2);
    expect(limitarProporcion(-3)).toBe(0.2);
    expect(limitarProporcion(0.8)).toBe(0.8);
    expect(limitarProporcion(0.95)).toBe(0.8);
    expect(limitarProporcion(1)).toBe(0.8);
  });

  it("un valor que no es número vuelve al 50/50", () => {
    expect(limitarProporcion(Number.NaN)).toBe(0.5);
    expect(limitarProporcion("setenta")).toBe(0.5);
    expect(limitarProporcion(null)).toBe(0.5);
  });
});

describe("O070: paneles guardados en el pset", () => {
  it("serializa exactamente la división vertical al 70 % y las dos vistas", () => {
    const paneles = {
      dividida: true,
      orientacion: "vertical" as const,
      proporcion: 0.7,
      paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }] as [
        { vistaId: string | null },
        { vistaId: string | null },
      ],
      panelActivo: 1 as const,
    };
    expect(serializarPaneles(paneles)).toEqual({
      dividida: true,
      orientacion: "vertical",
      proporcion: 0.7,
      paneles: [{ vistaId: "planta-n0" }, { vistaId: "iso" }],
      panelActivo: 1,
    });
  });

  it("normaliza lo leído y no acepta vistas vacías ni orientaciones raras", () => {
    expect(
      normalizarPaneles({
        dividida: true,
        orientacion: "diagonal",
        proporcion: 0.9,
        paneles: [{ vistaId: "planta-n0" }, { vistaId: "" }],
        panelActivo: 7,
      }),
    ).toEqual({
      dividida: true,
      orientacion: "vertical",
      proporcion: 0.8,
      paneles: [{ vistaId: "planta-n0" }, { vistaId: null }],
      panelActivo: 0,
    });
  });

  it("sin datos arranca sin dividir y con el panel 0 vacío", () => {
    expect(normalizarPaneles(null)).toEqual(panelesIniciales());
    expect(panelesIniciales("planta-n0").paneles[0].vistaId).toBe("planta-n0");
  });

  it("cambiar la vista de un panel no toca la del otro", () => {
    const inicial = panelesIniciales("planta-n0");
    const conIso = conVistaEnPanel(inicial.paneles, 1, "iso");
    expect(conIso.map((p) => p.vistaId)).toEqual(["planta-n0", "iso"]);
    expect(inicial.paneles.map((p) => p.vistaId)).toEqual(["planta-n0", null]);
  });

  it("ninguna puerta deja un panel apuntando a una vista borrada", () => {
    const paneles: [{ vistaId: string | null }, { vistaId: string | null }] = [
      { vistaId: "planta-n0" },
      { vistaId: "iso" },
    ];
    const saneado = sanearPaneles(paneles, ["planta-n0"], null);
    expect(saneado.paneles.map((p) => p.vistaId)).toEqual(["planta-n0", null]);
  });
});
