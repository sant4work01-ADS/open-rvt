// O028: los comandos del lote existen en la cinta y llaman a su acción.
import { describe, expect, it, vi } from "vitest";
import { construirComandosRibbon, type AccionesRibbon } from "./comandos";

function acciones(parcial: Partial<AccionesRibbon>): AccionesRibbon {
  return {
    herramientaActiva: null,
    ...parcial,
  } as unknown as AccionesRibbon;
}

describe("comandos O028", () => {
  it("«Zapatas en ejes» llama a la acción del lote", () => {
    const zapatas = vi.fn();
    const comandos = construirComandosRibbon(acciones({ zapatasEnCruces: zapatas }));
    const comando = comandos.find((c) => c.id === "zapatas-en-ejes");
    expect(comando?.texto).toBe("Zapatas en ejes");
    comando?.accion?.();
    expect(zapatas).toHaveBeenCalledTimes(1);
  });

  it("«Contratrabes entre ejes» y «Muros entre ejes» están conectados", () => {
    const contratrabes = vi.fn();
    const muros = vi.fn();
    const comandos = construirComandosRibbon(
      acciones({ contratrabesEntreEjes: contratrabes, murosEntreEjes: muros }),
    );
    comandos.find((c) => c.id === "contratrabes-entre-ejes")?.accion?.();
    comandos.find((c) => c.id === "muros-entre-ejes")?.accion?.();
    expect(contratrabes).toHaveBeenCalledTimes(1);
    expect(muros).toHaveBeenCalledTimes(1);
  });
});
