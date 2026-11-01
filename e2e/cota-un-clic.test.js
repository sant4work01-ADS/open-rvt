// Cota en un clic: el usuario tenía que dar muchos clics para que saliera el campo
// y Esc no lo quitaba. Con la app real: un solo clic algo desviado del centro del
// texto abre el campo; Esc lo cierra aunque el campo haya perdido el foco; un clic
// fuera también lo cierra; y editar con un clic mueve el eje.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Sesion, esperar, By, until, Key } = require("./arnes");


async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(150);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
}

async function fijarValor(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      const prototipo =
        el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototipo, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    testid,
    valor,
  );
  await esperar(100);
}

async function invocar(ses, metodo, params = {}) {
  const respuesta = await ses.driver.executeAsyncScript(
    function (metodo, params, done) {
      window.__TAURI_INTERNALS__
        .invoke("nucleo_llamar", { metodo, params })
        .then((crudo) => done({ ok: true, valor: crudo && crudo.status === "ok" ? crudo.data : crudo }))
        .catch((error) => done({ ok: false, error: String(error) }));
    },
    metodo,
    params,
  );
  assert.equal(respuesta.ok, true, `falló ${metodo}: ${respuesta.error}`);
  return respuesta.valor;
}

async function instalarDialogos(ses, rutas) {
  await ses.driver.executeScript(
    (rutas) => {
      window.__PP_DIALOGO_PRUEBAS__ = async (peticion) => {
        if (peticion.tipo === "abrir-ifc") return rutas.abrir || null;
        if (peticion.tipo === "guardar-ifc") return rutas.guardar || null;
        return null;
      };
    },
    rutas,
  );
}

async function dialogoEjes(
  ses,
  { direccion, origen, separaciones, longitud, etiqueta },
) {
  await cambiarPestana(ses, "Modelar");
  await activar(ses, "cmd-ejes-separaciones");
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
    10_000,
    "no abrió el diálogo de ejes por separaciones",
  );
  // O006d: el diálogo pide las dos familias; aquí se deja vacía la que no toca y se
  // usa el modo origen con su longitud.
  if (direccion === "vertical") {
    await fijarValor(ses, "eje-sep-horizontal-separaciones", "");
    await fijarValor(ses, "eje-sep-vertical-separaciones", separaciones);
    await fijarValor(ses, "eje-sep-vertical-etiqueta", etiqueta);
    await fijarValor(ses, "eje-sep-vertical-origen", String(origen));
    await fijarValor(ses, "eje-sep-vertical-longitud", String(longitud));
  } else {
    await fijarValor(ses, "eje-sep-vertical-separaciones", "");
    await fijarValor(ses, "eje-sep-horizontal-separaciones", separaciones);
    await fijarValor(ses, "eje-sep-horizontal-etiqueta", etiqueta);
    await fijarValor(ses, "eje-sep-horizontal-origen", String(origen));
    await fijarValor(ses, "eje-sep-horizontal-longitud", String(longitud));
  }
  await ses.driver.executeScript(() => {
    document.querySelector('[data-testid="eje-sep-aceptar"]')?.click();
  });
  await ses.driver.wait(
    async () => (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]'))).length === 0,
    10_000,
    "el diálogo no se cerró al crear los ejes",
  );
  await esperar(300);
}

async function cotas(ses) {
  const crudo = await atributoVisor(ses, "cotas");
  return crudo ? JSON.parse(crudo) : [];
}

async function posicionCota(ses, texto, indice = 0) {
  return ses.driver.executeScript(
    (texto, indice) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtCotaAPantalla !== "function") {
        throw new Error("el visor no expone la posición de las cotas");
      }
      return visor.__openrvtCotaAPantalla(texto, indice);
    },
    texto,
    indice,
  );
}


async function clicReal(ses, x, y) {
  await ses.driver.executeScript(
    (x, y) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
      const base = {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 7,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
      window.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent("click", base));
    },
    x,
    y,
  );
  await esperar(300);
}

async function cambiarCota(ses, valor) {
  const campo = await ses.porTestid("cota-campo");
  await campo.click();
  await campo.sendKeys(Key.CONTROL, "a");
  await campo.sendKeys(valor);
  await campo.sendKeys(Key.ENTER);
  await esperar(500);
}

async function hayCampo(ses) {
  return (await ses.driver.findElements(By.css('[data-testid="cota-campo"]'))).length > 0;
}

test("Cota: un clic abre el campo, Esc y clic fuera lo cierran", async () => {
  const ses = await Sesion.abrir({
    prueba: "cota-un-clic",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await ses.q('[data-testid="visor"] canvas');
    await dialogoEjes(ses, {
      direccion: "vertical",
      origen: 0,
      separaciones: "5, 4.5, 5",
      longitud: 20,
      etiqueta: "1",
    });

    // 1. Un solo clic 6 px a la derecha y 5 px abajo del centro del texto «4.50».
    const p = await posicionCota(ses, "4.50");
    assert.ok(p, "no se encontró la cota 4.50");
    await clicReal(ses, p.x + 6, p.y + 5);
    assert.ok(await hayCampo(ses), "un clic sobre el texto de la cota no abrió el campo");

    // 2. El campo pierde el foco y Esc igual lo cierra.
    await ses.driver.executeScript(() => document.activeElement && document.activeElement.blur());
    await ses.driver.actions().sendKeys(Key.ESCAPE).perform();
    await esperar(300);
    assert.equal(await hayCampo(ses), false, "Esc no cerró el campo de cota");

    // 3. Clic fuera lo cierra.
    await clicReal(ses, p.x + 6, p.y + 5);
    assert.ok(await hayCampo(ses), "el segundo clic no abrió el campo");
    await clicReal(ses, p.x, p.y + 220);
    assert.equal(await hayCampo(ses), false, "un clic fuera no cerró el campo");

    // 4. Editar con un clic: 4.50 → 6.00 mueve los ejes siguientes.
    await clicReal(ses, p.x - 5, p.y - 4);
    await cambiarCota(ses, "6");
    const ejes = await invocar(ses, "ejes.listar");
    const cuatro = ejes.find((e) => e.etiqueta === "4");
    assert.equal(Math.round(cuatro.x1 * 1000) / 1000, 16);
    // Captura de la planta: las cotas usan el estilo de la vista (flecha rellena
    // por omisión). Se lee como imagen al revisar.
    await activar(ses, "visor-zoom-ajustar");
    await esperar(500);
    await ses.captura(require("node:path").join(__dirname, "..", "docs", "progreso", "cota-planta.png"));
  } finally {
    await ses.cerrar();
  }
});
