// O006e: la clasificación por ráfaga distingue rueda, touchpad y pellizco.
import { describe, expect, it } from "vitest";
import { DetectorRueda, factorRueda } from "./rueda";

const evento = (cambios: Partial<Parameters<DetectorRueda["clasificar"]>[0]> = {}) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  shiftKey: false,
  ...cambios,
});

describe("detector de rueda y touchpad", () => {
  it("una rueda real (100 cada 80 ms) hace zoom", () => {
    const detector = new DetectorRueda();
    const acciones = [0, 80, 160, 240].map((ms) =>
      detector.clasificar(evento({ deltaY: 100 }), "auto", ms),
    );
    expect(acciones).toEqual(["zoom", "zoom", "zoom", "zoom"]);
    expect(detector.ultimoDispositivo()).toBe("raton");
  });

  it("una ráfaga de enteros de 100 cada 8 ms se detecta como touchpad y panea", () => {
    const detector = new DetectorRueda();
    const acciones = [0, 8, 16, 24, 32, 40, 48].map((ms) =>
      detector.clasificar(evento({ deltaY: 100 }), "auto", ms),
    );
    // Los primeros eventos son ambiguos; tras la ráfaga manda el touchpad.
    expect(detector.ultimoDispositivo()).toBe("touchpad");
    expect(acciones.slice(3)).toEqual(["paneo", "paneo", "paneo", "paneo"]);
  });

  it("los deltas fraccionarios son touchpad y panean", () => {
    const detector = new DetectorRueda();
    expect(detector.clasificar(evento({ deltaY: 12.5 }), "auto", 0)).toBe("paneo");
    expect(detector.ultimoDispositivo()).toBe("touchpad");
  });

  it("el pellizco con ctrlKey siempre hace zoom", () => {
    const detector = new DetectorRueda();
    detector.clasificar(evento({ deltaY: 12.5 }), "auto", 0);
    expect(
      detector.clasificar(evento({ deltaY: 3.25, ctrlKey: true }), "auto", 100),
    ).toBe("zoom");
  });

  it("Shift + dos dedos panea en horizontal; en 3D el visor lo convierte en órbita", () => {
    const detector = new DetectorRueda("touchpad");
    expect(
      detector.clasificar(evento({ deltaY: 12.5, shiftKey: true }), "auto", 0),
    ).toBe("paneo-horizontal");
  });

  it("la preferencia manual manda sobre la detección", () => {
    const detector = new DetectorRueda("touchpad");
    expect(detector.clasificar(evento({ deltaY: 12.5 }), "raton", 0)).toBe("zoom");
    const otro = new DetectorRueda("raton");
    expect(otro.clasificar(evento({ deltaY: 100 }), "touchpad", 0)).toBe("paneo");
  });

  it("el diagnóstico conserva los últimos 20 eventos con su clasificación", () => {
    const detector = new DetectorRueda();
    for (let i = 0; i < 25; i += 1) {
      detector.clasificar(evento({ deltaY: i === 0 ? 12.5 : 2 }), "auto", i * 50);
    }
    const ultimos = detector.ultimos();
    expect(ultimos).toHaveLength(20);
    expect(ultimos[19].accion).toBe("paneo");
    expect(ultimos[19].ms).toBe(24 * 50);
  });

  it("el factor de zoom crece con el delta y es simétrico", () => {
    expect(factorRueda(100)).toBeGreaterThan(1);
    expect(factorRueda(-100)).toBeLessThan(1);
    expect(factorRueda(100) * factorRueda(-100)).toBeCloseTo(1, 6);
  });
});
