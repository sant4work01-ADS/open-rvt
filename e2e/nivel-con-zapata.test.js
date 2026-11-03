// Falla reportada: con una zapata aislada en el modelo, editar la cota de un
// nivel en el módulo Niveles daba «Error interno del núcleo IFC: 'NivelTope'».
// Se crea la zapata, se cambia la cota y el nombre desde la tabla de Niveles y
// se comprueba que el nivel cambió y la zapata lo siguió. El fallo salía al
// editar un nivel distinto al de la zapata.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Sesion, esperar, By, until, Key } = require("./arnes");

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

async function nuevoModelo(ses) {
  const ok = await ses.driver.executeScript(() => {
    const el = document.querySelector('[data-testid="cmd-nuevo"]');
    if (!el || el.disabled) return false;
    el.click();
    return true;
  });
  assert.equal(ok, true, "no se pudo pulsar Nuevo");
  await ses.driver.wait(
    async () => (await ses.driver.executeScript(
      () => document.querySelector('[data-testid="estado-esquema"]')?.textContent?.trim(),
    )) === "IFC4",
    20_000,
    "el modelo nuevo no cargó",
  );
}

async function modulo(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`[data-modulo="${nombre}"]`)),
    10_000,
    `no apareció el módulo ${nombre}`,
  );
  await boton.click();
  await esperar(600);
}

async function fijarValor(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    testid,
    valor,
  );
  await esperar(150);
}

async function escribir(ses, testid, texto) {
  const campo = await ses.porTestid(testid);
  await campo.sendKeys(Key.CONTROL, "a");
  await campo.sendKeys(texto);
  await ses.driver.executeScript((el) => el.blur(), campo);
  await esperar(1200);
}

test("Editar un nivel con una zapata aislada no da error", async () => {
  const ses = await Sesion.abrir({ prueba: "nivel-con-zapata", tamano: { ancho: 1600, alto: 900 } });
  try {
    await nuevoModelo(ses);
    const n0 = (await invocar(ses, "modelo.niveles"))[0];
    const zapata = await invocar(ses, "zapatas.crear", {
      tipo: "Z-1 Zapata 1.20×1.20",
      nivel: n0.globalid,
      x: 0,
      y: 0,
      desplante: 1.0,
    });
    const gid = zapata.creados[0];
    const antes = (await invocar(ses, "modelo.propiedades", { globalid: gid })).psets.OPENRVT_Estructura.Z;

    // El fallo salía al editar un nivel distinto al de la zapata.
    await modulo(ses, "niveles");
    await fijarValor(ses, "nivel-nuevo-nombre", "Azotea");
    await fijarValor(ses, "nivel-nuevo-elevacion", "3");
    const agregar = await ses.porTestid("nivel-agregar");
    await agregar.click();
    await esperar(1000);
    const azotea = (await invocar(ses, "modelo.niveles")).find((n) => n.nombre === "Azotea");
    assert.ok(azotea, "no se creó Azotea");
    await escribir(ses, `nivel-elevacion-${azotea.globalid}`, "3.2");
    let nivel = (await invocar(ses, "modelo.niveles")).find((n) => n.globalid === azotea.globalid);
    assert.ok(Math.abs(nivel.elevacion - 3.2) < 1e-6, `Azotea quedó en ${nivel.elevacion}`);
    await escribir(ses, `nivel-nombre-${azotea.globalid}`, "Azotea 1");
    nivel = (await invocar(ses, "modelo.niveles")).find((n) => n.globalid === azotea.globalid);
    assert.equal(nivel.nombre, "Azotea 1");

    // Y el nivel de la zapata: la zapata lo sigue.
    await escribir(ses, `nivel-elevacion-${n0.globalid}`, "0.5");
    nivel = (await invocar(ses, "modelo.niveles")).find((n) => n.globalid === n0.globalid);
    assert.ok(Math.abs(nivel.elevacion - 0.5) < 1e-6, `la cota quedó en ${nivel.elevacion}`);
    const despues = (await invocar(ses, "modelo.propiedades", { globalid: gid })).psets.OPENRVT_Estructura.Z;
    assert.ok(Math.abs(despues - antes - 0.5) < 1e-6, `la zapata pasó de ${antes} a ${despues}`);
  } finally {
    await ses.cerrar();
  }
});
