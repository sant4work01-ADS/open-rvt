// O017: zoom con touchpad en la app real. El pellizco simulado (wheel con
// ctrlKey y deltaY fraccionario/pequeño) debe acercar; los botones +/− y la
// tecla + también. La escala se lee del encuadre que el visor publica en
// data-camara (cámara ortográfica de la planta).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Sesion, esperar, By, until } = require("./arnes");


async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(250);
}

async function camara(ses) {
  return ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    if (!visor || !visor.dataset.camara) throw new Error("el visor no publica data-camara");
    return JSON.parse(visor.dataset.camara);
  });
}

/** Lanza un wheel real (burbujea) sobre el visor; el visor lo captura con preventDefault. */
async function rueda(ses, { deltaY, ctrlKey = false }, veces = 1) {
  for (let i = 0; i < veces; i += 1) {
    await ses.driver.executeScript(
      (deltaY, ctrlKey) => {
        const visor = document.querySelector('[data-testid="visor"]');
        visor.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY,
            deltaX: 0,
            deltaMode: 0,
            ctrlKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      deltaY,
      ctrlKey,
    );
    await esperar(30);
  }
  await esperar(150);
}

async function tecla(ses, key, code) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }),
      );
    },
    key,
    code,
  );
  await esperar(250);
}

function escala(cam) {
  assert.equal(cam.tipo, "orto", "la prueba necesita la cámara ortográfica de la planta");
  return cam.derecha - cam.izquierda;
}

test("O017: pellizco, botones +/−, Ajustar y tecla + cambian el zoom", async () => {
  const ses = await Sesion.abrir({
    prueba: "o017-zoom",
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

    // 1) Pellizco: 10 eventos ctrl+wheel con deltaY -5. El factor por evento es
    //    1,01^−5 = 0,9514656876067488; la escala final debe ser la inicial × eso^10.
    const antes = escala(await camara(ses));
    await rueda(ses, { deltaY: -5, ctrlKey: true }, 10);
    const trasPellizco = escala(await camara(ses));
    const factorEsperado = Math.pow(Math.pow(1.01, -5), 10);
    assert.ok(
      trasPellizco < antes * 0.95,
      `el pellizco debe acercar: ${antes} → ${trasPellizco}`,
    );
    assert.ok(
      Math.abs(trasPellizco / antes - factorEsperado) < 1e-9,
      `factor del pellizco: ${trasPellizco / antes} ≠ ${factorEsperado}`,
    );

    // 2) Los botones flotantes existen y actúan en el centro de la vista.
    const antesMas = escala(await camara(ses));
    await activar(ses, "visor-zoom-mas");
    const trasMas = escala(await camara(ses));
    assert.ok(Math.abs(trasMas / antesMas - 0.8) < 1e-9, `«+» debe acercar ×0,8: ${trasMas / antesMas}`);

    await activar(ses, "visor-zoom-menos");
    const trasMenos = escala(await camara(ses));
    assert.ok(
      Math.abs(trasMenos / trasMas - 1.25) < 1e-9,
      `«−» debe alejar ×1,25: ${trasMenos / trasMas}`,
    );

    // 3) La tecla «+» acerca igual que el botón.
    const antesTecla = escala(await camara(ses));
    await tecla(ses, "+", "Equal");
    const trasTecla = escala(await camara(ses));
    assert.ok(
      Math.abs(trasTecla / antesTecla - 0.8) < 1e-9,
      `la tecla + debe acercar ×0,8: ${trasTecla / antesTecla}`,
    );

    // 4) «Ajustar» devuelve el encuadre inicial de la vista.
    await activar(ses, "visor-zoom-ajustar");
    const trasAjustar = escala(await camara(ses));
    assert.ok(
      Math.abs(trasAjustar / antes - 1) < 1e-6,
      `«Ajustar» debe restaurar la escala: ${trasAjustar} ≠ ${antes}`,
    );

    // 5) La tarjeta de ayuda menciona el pellizco y los botones.
    const ayuda = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="ayuda-navegacion"]')?.textContent ?? "",
    );
    if (ayuda) {
      assert.match(ayuda, /Pellizca para zoom/);
      assert.match(ayuda, /Ctrl \+ dos dedos/);
      assert.ok(ayuda.includes("botones"), "la ayuda menciona los botones");
      assert.ok(ayuda.includes("abajo a la derecha"), "la ayuda indica dónde están");
    }
  } finally {
    await ses.cerrar();
  }
});
