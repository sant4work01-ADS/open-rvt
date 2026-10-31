// O020: orbitar en 3D con touchpad en la app real.
// (a) Shift + rueda con deltas enteros (como el ELAN) cambia la dirección de la
// cámara; (b) arrastre con botón derecho también; (c) con «Orbitar» activo el
// arrastre izquierdo orbita; (d) en planta Shift + rueda sigue paneando.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Sesion, esperar, By, until } = require("./arnes");

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(250);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
}

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(600);
}

async function camara(ses) {
  return ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    if (!visor || !visor.dataset.camara) throw new Error("el visor no publica data-camara");
    return JSON.parse(visor.dataset.camara);
  });
}

/** Rueda con los deltas enteros que manda el touchpad ELAN en Windows. */
async function rueda(ses, { deltaX = 0, deltaY = 0, shiftKey = false }, veces = 1) {
  for (let i = 0; i < veces; i += 1) {
    await ses.driver.executeScript(
      (deltaX, deltaY, shiftKey) => {
        const visor = document.querySelector('[data-testid="visor"]');
        visor.dispatchEvent(
          new WheelEvent("wheel", {
            deltaX,
            deltaY,
            deltaMode: 0,
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      deltaX,
      deltaY,
      shiftKey,
    );
    await esperar(30);
  }
  await esperar(150);
}

/** Arrastre con puntero real sobre el visor; el visor escucha move/up en window. */
async function arrastrar(ses, boton, { x = 720, y = 420, dx = -90, dy = 50 } = {}) {
  await ses.driver.executeScript(
    (boton, x, y, dx, dy) => {
      const visor = document.querySelector('[data-testid="visor"]');
      const comun = {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        buttons: boton === 2 ? 2 : 1,
      };
      visor.dispatchEvent(
        new PointerEvent("pointerdown", { ...comun, button: boton, clientX: x, clientY: y }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...comun, clientX: x + dx, clientY: y + dy }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          ...comun,
          clientX: x + dx * 2,
          clientY: y + dy * 2,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...comun,
          button: boton,
          buttons: 0,
          clientX: x + dx * 2,
          clientY: y + dy * 2,
        }),
      );
    },
    boton,
    x,
    y,
    dx,
    dy,
  );
  await esperar(200);
}

function distancia(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test("O020: órbita en 3D con Shift + rueda, botón derecho y «Orbitar»", async () => {
  const ses = await Sesion.abrir({
    prueba: "o020-orbitar",
    tamano: { ancho: 1500, alto: 900 },
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        const visor = await ses.porTestid("visor");
        return (await visor.getAttribute("data-mallas")) !== null;
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no abrió el visor");
    await cambiarPestana(ses, "Vista");
    await ses.q('[data-testid="visor"] canvas');
    await esperar(500);
    await elegirVista(ses, "3D Perspectiva");

    const inicial = await camara(ses);
    assert.equal(inicial.tipo, "perspectiva");

    // (a) Shift + rueda horizontal con deltas enteros de 120 (ELAN como ratón).
    await rueda(ses, { deltaX: 120, deltaY: 0, shiftKey: true });
    const trasRueda = await camara(ses);
    assert.ok(
      distancia(trasRueda.direccion, inicial.direccion) > 1e-3,
      `Shift + rueda debe orbitar: ${inicial.direccion} → ${trasRueda.direccion}`,
    );
    // El paneo habría movido el objetivo, no la dirección.
    assert.deepEqual(trasRueda.objetivo, inicial.objetivo);

    // (b) Arrastre con botón derecho.
    const antesDerecho = await camara(ses);
    await arrastrar(ses, 2);
    const trasDerecho = await camara(ses);
    assert.ok(
      distancia(trasDerecho.direccion, antesDerecho.direccion) > 1e-3,
      `el botón derecho debe orbitar: ${antesDerecho.direccion} → ${trasDerecho.direccion}`,
    );

    // (c) Con «Orbitar» activo, arrastre izquierdo. También se recuerda.
    await activar(ses, "visor-orbitar");
    const guardado = await ses.driver.executeScript(() =>
      localStorage.getItem("openrvt.orbitar"),
    );
    assert.equal(guardado, "1");
    const antesIzquierdo = await camara(ses);
    await arrastrar(ses, 0);
    const trasIzquierdo = await camara(ses);
    assert.ok(
      distancia(trasIzquierdo.direccion, antesIzquierdo.direccion) > 1e-3,
      `con Orbitar el izquierdo debe orbitar: ${antesIzquierdo.direccion} → ${trasIzquierdo.direccion}`,
    );

    // En 3D el botón derecho no abre el menú contextual del navegador.
    const bloqueado = await ses.driver.executeScript(() => {
      const visor = document.querySelector('[data-testid="visor"]');
      const evento = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 5,
        clientY: 5,
      });
      visor.dispatchEvent(evento);
      return evento.defaultPrevented;
    });
    assert.equal(bloqueado, true, "el menú contextual debe estar bloqueado en 3D");

    // (d) En planta, Shift + rueda sigue paneando: cambia el objetivo, no la dirección.
    await elegirVista(ses, "Planta Nivel 0");
    const planta = await camara(ses);
    assert.equal(planta.tipo, "orto");
    await rueda(ses, { deltaX: 120, deltaY: 0, shiftKey: true });
    const trasPlanta = await camara(ses);
    assert.ok(
      distancia(trasPlanta.objetivo, planta.objetivo) > 1e-3,
      `en planta Shift + rueda debe panear: ${planta.objetivo} → ${trasPlanta.objetivo}`,
    );
    assert.deepEqual(trasPlanta.direccion, planta.direccion);

    // La ayuda menciona las tres formas nuevas de orbitar.
    const ayuda = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="ayuda-navegacion"]')?.textContent ?? "",
    );
    assert.match(ayuda, /Shift \+ dos dedos/, "la ayuda menciona Shift + dos dedos");
    assert.match(ayuda, /botón derecho/, "la ayuda menciona el botón derecho");
    assert.match(ayuda, /Orbitar para usar un dedo/, "la ayuda menciona el botón Orbitar");
  } finally {
    await ses.cerrar();
  }
});
