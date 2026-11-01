// Rectángulo de selección: nace donde se pulsa. Antes se dibujaba con coordenadas
// de página dentro del visor y salía corrido el ancho del panel de vistas y el alto
// de la cinta (reporte del usuario, 31-oct).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Sesion, esperar, By, until } = require("./arnes");

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

test("el rectángulo de selección coincide con el arrastre", async () => {
  const ses = await Sesion.abrir({
    prueba: "seleccion-ventana",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await ses.driver.executeScript(() => document.querySelector('[data-testid="cmd-nuevo"]').click());
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4",
      20_000,
      "el modelo nuevo no cargó",
    );
    const boton = await ses.driver.wait(
      until.elementLocated(
        By.xpath('//button[@data-testid="vista-item"][normalize-space(.)="Planta Nivel 0"]'),
      ),
      10_000,
    );
    await boton.click();
    await esperar(800);
    const caja = await ses.driver.executeScript(() => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const r = canvas.getBoundingClientRect();
      const inicio = { x: r.left + r.width * 0.3, y: r.top + r.height * 0.3 };
      const fin = { x: r.left + r.width * 0.6, y: r.top + r.height * 0.7 };
      const base = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 9,
        pointerType: "mouse",
        clientX: inicio.x,
        clientY: inicio.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", base));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...base, clientX: fin.x, clientY: fin.y }),
      );
      return { inicio, fin, visor: document.querySelector('[data-testid="visor"]').getBoundingClientRect().toJSON() };
    });
    await esperar(300);
    const rect = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="ventana-seleccion"]')?.getBoundingClientRect().toJSON() ?? null,
    );
    await ses.driver.executeScript((fin) => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true, button: 0, buttons: 0, pointerId: 9, pointerType: "mouse",
          clientX: fin.x, clientY: fin.y,
        }),
      );
    }, caja.fin);
    assert.ok(rect, "no apareció el rectángulo de selección");
    assert.ok(caja.visor.left > 50 && caja.visor.top > 50, "el visor debe estar corrido para que la prueba valga");
    const cerca = (a, b) => Math.abs(a - b) <= 2;
    assert.ok(
      cerca(rect.left, caja.inicio.x) && cerca(rect.top, caja.inicio.y),
      `el rectángulo no nace donde se pulsó: ${JSON.stringify(rect)} vs ${JSON.stringify(caja.inicio)}`,
    );
    assert.ok(
      cerca(rect.right, caja.fin.x) && cerca(rect.bottom, caja.fin.y),
      `el rectángulo no llega al puntero: ${JSON.stringify(rect)} vs ${JSON.stringify(caja.fin)}`,
    );
  } finally {
    await ses.cerrar();
  }
});
