// O006e: la clasificación por ráfaga distingue rueda, touchpad y pellizco.
import { describe, expect, it } from "vitest";
import {
  DetectorRueda,
  factorPellizco,
  factorRueda,
  factorZoomRueda,
  resumirGrabacion,
  textoDiagnosticoRueda,
  textoResumenGrabacion,
  type EventoGrabado,
} from "./rueda";

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

  it("el diagnóstico conserva los últimos 50 eventos con su clasificación", () => {
    const detector = new DetectorRueda();
    for (let i = 0; i < 60; i += 1) {
      detector.clasificar(evento({ deltaY: i === 0 ? 12.5 : 2 }), "auto", i * 50);
    }
    const ultimos = detector.ultimos();
    expect(ultimos).toHaveLength(50);
    expect(ultimos[49].accion).toBe("paneo");
    expect(ultimos[49].ms).toBe(59 * 50);
  });

  it("el factor de zoom crece con el delta y es simétrico", () => {
    expect(factorRueda(100)).toBeGreaterThan(1);
    expect(factorRueda(-100)).toBeLessThan(1);
    expect(factorRueda(100) * factorRueda(-100)).toBeCloseTo(1, 6);
  });

  // O017: valores calculados a mano con 1,01^delta (y acotados a [0,8; 1,25]).
  it("factorPellizco: 1,01^delta acotado por evento", () => {
    expect(factorPellizco(0)).toBe(1);
    expect(factorPellizco(5)).toBeCloseTo(1.05101, 5);
    expect(factorPellizco(-5)).toBeCloseTo(0.951466, 6);
    expect(factorPellizco(200)).toBe(1.25);
    expect(factorPellizco(-200)).toBe(0.8);
  });

  it("factorZoomRueda usa pellizco solo con Ctrl y delta de touchpad", () => {
    const base = evento({ deltaY: -5, ctrlKey: true });
    expect(factorZoomRueda(base, "raton")).toBeCloseTo(0.951466, 6);
    expect(factorZoomRueda(base, "touchpad")).toBeCloseTo(0.951466, 6);
    // Rueda real con Ctrl: conserva el factor fino de O006d.
    expect(factorZoomRueda(evento({ deltaY: 100, ctrlKey: true }), "raton")).toBeCloseTo(
      Math.pow(1.0018, 100),
      8,
    );
    // Sin Ctrl nunca es pellizco (aunque el touchpad mande delta fraccionario).
    expect(factorZoomRueda(evento({ deltaY: 0.5 }), "touchpad")).toBeCloseTo(
      Math.pow(1.0018, 0.5),
      8,
    );
  });

  // O017b: con Ctrl, un gesto que solo trae deltaX también hace zoom; el paso
  // mínimo de 0,75 evita que deltas de 0,5 dejen la vista casi quieta.
  it("factorZoomRueda acepta deltaX y aplica un paso mínimo al pellizco", () => {
    // 1,01^−2 = 0,9802960494… (dos dedos horizontales con Ctrl).
    expect(factorZoomRueda(evento({ deltaY: 0, deltaX: -2, ctrlKey: true }), "raton")).toBeCloseTo(
      0.980296,
      6,
    );
    // 1,01^−0,75 = 0,9925639… (delta real de 0,5 elevado al paso mínimo).
    expect(factorZoomRueda(evento({ deltaY: -0.5, ctrlKey: true }), "touchpad")).toBeCloseTo(
      0.992565,
      6,
    );
    // Sin movimiento no hay factor: la vista no debe saltar.
    expect(factorZoomRueda(evento({ deltaY: 0, deltaX: 0, ctrlKey: true }), "touchpad")).toBe(1);
  });

  // O017b: valores calculados a mano; dos ruedas de zoom con factores 0,9 y 0,8,
  // un pointerdown sin Ctrl y un keydown/keyup de Control (100 ms entre eventos).
  it("resumirGrabacion agrupa por tipo y por acción y multiplica los factores", () => {
    const eventos: EventoGrabado[] = [
      {
        t: 0,
        tipo: "wheel",
        ctrlKey: true,
        shiftKey: false,
        deltaX: 0,
        deltaY: -0.5,
        deltaMode: 0,
        accion: "zoom",
        dispositivo: "touchpad",
        factor: 0.9,
        escalaAntes: 10,
        escalaDespues: 9,
      },
      {
        t: 100,
        tipo: "wheel",
        ctrlKey: true,
        shiftKey: false,
        deltaX: 0,
        deltaY: -1.25,
        deltaMode: 0,
        accion: "zoom",
        dispositivo: "touchpad",
        factor: 0.8,
        escalaAntes: 9,
        escalaDespues: 7.2,
      },
      { t: 200, tipo: "pointerdown", ctrlKey: false, shiftKey: false, pointerType: "touch" },
      { t: 300, tipo: "keydown", ctrlKey: true, shiftKey: false, key: "Control" },
      { t: 400, tipo: "keyup", ctrlKey: false, shiftKey: false, key: "Control" },
    ];
    const resumen = resumirGrabacion(eventos);
    expect(resumen.total).toBe(5);
    expect(resumen.duracionMs).toBe(400);
    expect(resumen.porTipo.wheel).toEqual({
      cantidad: 2,
      pctCtrl: 100,
      deltaMode: 0,
      deltaYMin: -1.25,
      deltaYMax: -0.5,
      deltaYMedia: -0.875,
      pctFraccionarios: 100,
      intervaloMedioMs: 100,
    });
    expect(resumen.porTipo.pointerdown).toEqual({
      cantidad: 1,
      pctCtrl: 0,
      deltaMode: null,
      deltaYMin: null,
      deltaYMax: null,
      deltaYMedia: null,
      pctFraccionarios: null,
      intervaloMedioMs: null,
    });
    expect(resumen.porTipo.keydown?.pctCtrl).toBe(100);
    expect(resumen.porTipo.keyup?.pctCtrl).toBe(0);
    expect(resumen.porAccion.zoom?.cantidad).toBe(2);
    expect(resumen.zoom.eventos).toBe(2);
    expect(resumen.zoom.productoFactores).toBeCloseTo(0.72, 12);
    expect(resumen.zoom.escalaInicial).toBe(10);
    expect(resumen.zoom.escalaFinal).toBe(7.2);
    expect(textoResumenGrabacion(resumen)).toContain(
      "zoom: 2 eventos · producto 0.72 · escala 10 → 7.2",
    );
  });

  it("el texto del diagnóstico lleva cabecera y una fila TSV por evento", () => {
    const detector = new DetectorRueda();
    detector.clasificar(evento({ deltaY: -5, ctrlKey: true }), "raton", 1000);
    detector.clasificar(evento({ deltaX: 2, deltaY: 3 }), "touchpad", 1160);
    expect(textoDiagnosticoRueda(detector.ultimos())).toBe(
      [
        "#\tdeltaX\tdeltaY\tmodo\tctrl\tshift\tms\tintervaloMs\tdispositivo\taccion",
        "1\t0\t-5\t0\tsi\tno\t1000\t\traton\tzoom",
        "2\t2\t3\t0\tno\tno\t1160\t160\ttouchpad\tpaneo",
      ].join("\n"),
    );
  });
});
