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
async function rueda(ses, { deltaY, deltaX = 0, ctrlKey = false }, veces = 1) {
  for (let i = 0; i < veces; i += 1) {
    await ses.driver.executeScript(
      (deltaY, deltaX, ctrlKey) => {
        const visor = document.querySelector('[data-testid="visor"]');
        visor.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY,
            deltaX,
            deltaMode: 0,
            ctrlKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      deltaY,
      deltaX,
      ctrlKey,
    );
    await esperar(30);
  }
  await esperar(150);
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

async function abrirDiagnostico(ses) {
  await ses.driver.executeScript(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "D",
        code: "KeyD",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="diagnostico-rueda"]')),
    5_000,
    "no abrió el panel de diagnóstico",
  );
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

test("O017b: Ctrl + dos dedos cambia la escala en planta y en 3D", async () => {
  const ses = await Sesion.abrir({
    prueba: "o017b-ctrl-dos-dedos",
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

    // Secuencia típica de touchpad: deltas fraccionarios y pequeños. El de 0,5
    // se eleva al paso mínimo de 0,75; suma por ciclo −(0,75+1,25+2+3,75) = −7,75,
    // cinco ciclos = −38,75 → factor 1,01^−38,75.
    const deltas = [-0.5, -1.25, -2, -3.75];
    const antes = escala(await camara(ses));
    for (let ciclo = 0; ciclo < 5; ciclo += 1) {
      for (const deltaY of deltas) await rueda(ses, { deltaY, ctrlKey: true }, 1);
    }
    const tras = escala(await camara(ses));
    const esperado = Math.pow(1.01, -38.75);
    assert.ok(tras < antes * 0.9, `debe acercar ≥10 %: ${antes} → ${tras}`);
    assert.ok(
      Math.abs(tras / antes - esperado) < 1e-9,
      `factor acumulado ${tras / antes} ≠ ${esperado}`,
    );

    // Un gesto que solo trae deltaX también es zoom: 20 × −2 = 1,01^−40.
    const antesX = escala(await camara(ses));
    await rueda(ses, { deltaY: 0, deltaX: -2, ctrlKey: true }, 20);
    const trasX = escala(await camara(ses));
    assert.ok(
      Math.abs(trasX / antesX - Math.pow(1.01, -40)) < 1e-9,
      `deltaX debe acercar: ${trasX / antesX}`,
    );

    // Lo mismo en 3D perspectiva: la distancia de la navegación debe bajar.
    await elegirVista(ses, "3D Perspectiva");
    const camPersp = await camara(ses);
    assert.equal(camPersp.tipo, "perspectiva");
    const antesP = camPersp.distancia;
    for (let ciclo = 0; ciclo < 5; ciclo += 1) {
      for (const deltaY of deltas) await rueda(ses, { deltaY, ctrlKey: true }, 1);
    }
    const trasP = (await camara(ses)).distancia;
    assert.ok(trasP < antesP * 0.9, `en 3D debe acercar ≥10 %: ${antesP} → ${trasP}`);
    assert.ok(
      Math.abs(trasP / antesP - esperado) < 1e-9,
      `factor en 3D ${trasP / antesP} ≠ ${esperado}`,
    );
  } finally {
    await ses.cerrar();
  }
});

test("O017b: grabar 2 s, resumir y exportar el diagnóstico", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const destino = path.join(__dirname, "salida", "diagnostico-o017b.json");
  fs.rmSync(destino, { force: true });
  const ses = await Sesion.abrir({
    prueba: "o017b-exportar",
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
    await esperar(400);
    await abrirDiagnostico(ses);
    await activar(ses, "diagnostico-rueda-grabar");

    // Seis wheel de zoom y eventos de puntero/toque/Control mientras graba.
    await rueda(ses, { deltaY: -2, ctrlKey: true }, 6);
    await ses.driver.executeScript(() => {
      const visor = document.querySelector('[data-testid="visor"]');
      visor.dispatchEvent(
        new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true }),
      );
      visor.dispatchEvent(
        new PointerEvent("pointermove", { pointerType: "touch", bubbles: true }),
      );
      visor.dispatchEvent(
        new PointerEvent("pointerup", { pointerType: "touch", bubbles: true }),
      );
      const toque = (tipo, toques) => {
        const evento = new Event(tipo, { bubbles: true, cancelable: true });
        Object.defineProperty(evento, "touches", { value: Array(toques).fill({}) });
        visor.dispatchEvent(evento);
      };
      toque("touchstart", 2);
      toque("touchend", 0);
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Control", code: "ControlLeft", bubbles: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Control", code: "ControlLeft", bubbles: true }),
      );
    });
    await esperar(2_000);
    await activar(ses, "diagnostico-rueda-grabar");

    const resumenTexto = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="diagnostico-rueda-resumen"]')?.textContent ?? "",
    );
    assert.match(resumenTexto, /tipo wheel/, "el resumen debe incluir las ruedas");
    assert.match(resumenTexto, /zoom 6 ·/, "el resumen debe incluir los seis zoom");

    // La costura decide la ruta y el JSON se escribe con el comando real.
    await ses.driver.executeScript(
      (ruta) => {
        window.__PETICION_DIAGNOSTICO__ = null;
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) => {
          window.__PETICION_DIAGNOSTICO__ = peticion;
          return ruta;
        };
      },
      destino,
    );
    await activar(ses, "diagnostico-rueda-exportar");
    const fin = Date.now() + 10_000;
    while (!fs.existsSync(destino) && Date.now() < fin) await esperar(200);
    assert.ok(fs.existsSync(destino), "no se escribió el JSON del diagnóstico");

    const peticion = await ses.driver.executeScript(() => window.__PETICION_DIAGNOSTICO__);
    assert.equal(peticion.tipo, "guardar-diagnostico");
    assert.match(peticion.predeterminado, /^diagnostico-rueda-\d{8}-\d{4}\.json$/);

    const datos = JSON.parse(fs.readFileSync(destino, "utf8"));
    for (const clave of [
      "version_app",
      "fecha",
      "userAgent",
      "devicePixelRatio",
      "preferencia_rueda",
      "dispositivo_detectado",
      "ajustes_webview",
      "resumen",
      "eventos",
    ]) {
      assert.ok(clave in datos, `falta ${clave} en el JSON`);
    }
    assert.equal(typeof datos.version_app, "string");
    assert.ok(!Number.isNaN(Date.parse(datos.fecha)), "fecha ISO válida");
    assert.ok(datos.userAgent.length > 0, "userAgent presente");
    assert.equal(typeof datos.devicePixelRatio, "number");
    if (process.platform === "win32") {
      assert.deepEqual(datos.ajustes_webview, {
        zoom_control: false,
        pinch_zoom: true,
        atajos_navegador: false,
      });
    } else {
      assert.equal(datos.ajustes_webview, null);
    }

    assert.equal(datos.resumen.total, datos.eventos.length);
    assert.equal(datos.resumen.porTipo.wheel.cantidad, 6);
    assert.equal(datos.resumen.zoom.eventos, 6);
    // Seis eventos de −2: producto exacto 1,01^−12.
    assert.ok(
      Math.abs(datos.resumen.zoom.productoFactores - Math.pow(1.01, -12)) < 1e-9,
      `producto ${datos.resumen.zoom.productoFactores}`,
    );
    assert.ok(
      datos.resumen.zoom.escalaFinal < datos.resumen.zoom.escalaInicial,
      "la escala final debe ser menor que la inicial",
    );
    // El producto de los factores guardados debe explicar el cambio de escala.
    const ruedas = datos.eventos.filter((evento) => evento.tipo === "wheel");
    assert.equal(ruedas.length, 6);
    const producto = ruedas.reduce((valor, evento) => valor * evento.factor, 1);
    assert.ok(Math.abs(producto - datos.resumen.zoom.productoFactores) < 1e-9);
    assert.ok(
      Math.abs(
        datos.resumen.zoom.escalaFinal / datos.resumen.zoom.escalaInicial - producto,
      ) < 1e-9,
      "escala final/inicial debe coincidir con el producto de factores",
    );
  } finally {
    await ses.cerrar();
  }
});
