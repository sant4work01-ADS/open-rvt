// O036: el comando «Girar» está en la cinta junto a Mover y llama a su acción.
import { describe, expect, it, vi } from "vitest";
import { construirComandosRibbon, type AccionesRibbon } from "./comandos";

function acciones(parcial: Partial<AccionesRibbon>): AccionesRibbon {
  return {
    herramientaActiva: null,
    ...parcial,
  } as unknown as AccionesRibbon;
}

describe("comandos O036", () => {
  it("«Girar» existe en Modificar y llama a iniciarGiroEje", () => {
    const girar = vi.fn();
    const comandos = construirComandosRibbon(acciones({ girarEje: girar }));
    const comando = comandos.find((c) => c.id === "girar-eje");
    expect(comando?.texto).toBe("Girar");
    expect(comando?.grupo).toBe("Modificar");
    comando?.accion?.();
    expect(girar).toHaveBeenCalledTimes(1);
  });
});
