// O006e: esquinas de muros limpias (L, T y X), capas en planta a 1:50 y 1:100,
// 3D y enganche a un cruce de ejes con marcador. App Tauri real bajo xvfb.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG");
  return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
}

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(200);
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
  await esperar(120);
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

async function proyectar(ses, x, y) {
  return ses.driver.executeScript(
    (x, y) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone __openrvtMundoAPantalla");
      }
      return visor.__openrvtMundoAPantalla(x, y, 0);
    },
    x,
    y,
  );
}

async function clicMundo(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
      const opciones = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "mouse",
        clientX: punto.x,
        clientY: punto.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", opciones));
      window.dispatchEvent(new PointerEvent("pointerup", { ...opciones, buttons: 0 }));
    },
    punto,
  );
  await esperar(260);
}

async function moverRaton(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: punto.x,
          clientY: punto.y,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
    },
    punto,
  );
  await esperar(250);
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
  await esperar(120);
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
}

async function esperarMallas(ses, minimo, ms) {
  await ses.driver.wait(async () => {
    const visor = await ses.porTestid("visor");
    return Number(await visor.getAttribute("data-mallas")) >= minimo;
  }, ms, `el visor no recibió ${minimo} mallas`);
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

async function elegirVistaTipo(ses, tipo) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`[data-testid="vista-item"][data-tipo="${tipo}"]`)),
    10_000,
    `no apareció una vista de tipo ${tipo}`,
  );
  await boton.click();
  await esperar(600);
}

test("O006e: caja con esquinas L, T y X, capas en planta, 3D y enganche", async () => {
  const ses = await Sesion.abrir({
    prueba: "o006e-esquinas",
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
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-escala", "50");
    await cambiarPestana(ses, "Modelar");
    // Muros multicapa para que a 1:50 se vean las líneas de capa.
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    await tecla(ses, "Escape", "Escape");

    // Caja de 4 × 3 m: cuatro esquinas en L.
    await dibujarMuro(ses, 0, 0, 4, 0);
    await dibujarMuro(ses, 4, 0, 4, 3);
    await dibujarMuro(ses, 4, 3, 0, 3);
    await dibujarMuro(ses, 0, 3, 0, 0);
    // Muro interior que llega en T al muro inferior.
    await dibujarMuro(ses, 2, 0, 2, 1.5);
    // Cruce en X: dos muros interiores perpendiculares.
    await dibujarMuro(ses, 2.5, 1.5, 3.5, 1.5);
    await dibujarMuro(ses, 3, 1, 3, 2);

    await esperarMallas(ses, 7, 25_000);
    const muros = await invocar(ses, "modelo.elementos", { filtro: { clase: "IfcWall" } });
    assert.equal(muros.length, 7, "deben existir siete muros");
    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const mallasMuro = teselado.elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(mallasMuro.length, 7);
    const volumenes = await ses.driver.executeScript(() => {
      const visor = document.querySelector('[data-testid="visor"]');
      return Number(visor?.dataset.capasPlanta ?? "0");
    });
    assert.ok(volumenes > 8, `solo ${volumenes} líneas de capa/rayado`);

    const captura150 = path.join(CAPTURAS, "o006e_esquinas_150.png");
    await ses.captura(captura150);
    assert.deepEqual(dimensionesPng(captura150).ancho > 1000, true);

    // A 1:100 solo queda el contorno unido.
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-escala", "100");
    await cambiarPestana(ses, "Modelar");
    await ses.driver.wait(async () => {
      const valor = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.capasPlanta,
      );
      return valor === "0";
    }, 10_000, "a 1:100 no deben dibujarse capas");
    const captura100 = path.join(CAPTURAS, "o006e_esquinas_1100.png");
    await ses.captura(captura100);
    assert.ok(dimensionesPng(captura100).ancho > 1000);

    // 3D isométrico.
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Isométrica");
    await esperar(800);
    const captura3d = path.join(CAPTURAS, "o006e_3d.png");
    await ses.captura(captura3d);
    assert.ok(dimensionesPng(captura3d).alto > 500);

    // Enganche a un cruce de ejes con el marcador visible.
    await cambiarPestana(ses, "Vista");
    await elegirVistaTipo(ses, "planta");
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-eje");
    await clicMundo(ses, 6, -1);
    await clicMundo(ses, 6, 5);
    await tecla(ses, "Escape", "Escape");
    await activar(ses, "cmd-eje");
    await clicMundo(ses, -1, 4);
    await clicMundo(ses, 8, 4);
    await tecla(ses, "Escape", "Escape");
    await fijarValor(ses, "vista-escala", "50");
    const referencias = await invocar(ses, "modelo.referencias");
    assert.equal(referencias.ejes.length, 2, "deben existir dos ejes");
    assert.ok(
      referencias.intersecciones.some(
        ([x, y]) => Math.abs(x - 6) < 0.01 && Math.abs(y - 4) < 0.01,
      ),
      `el cruce (6,4) no está en ${JSON.stringify(referencias.intersecciones)}`,
    );
    await activar(ses, "cmd-muro");
    await moverRaton(ses, 6.01, 4.01);
    await ses.driver.wait(async () => {
      const visor = await ses.porTestid("visor");
      return (await visor.getAttribute("data-enganche")) === "interseccion";
    }, 8_000, "el cursor no enganchó al cruce de ejes");
    const capturaEnganche = path.join(CAPTURAS, "o006e_enganche.png");
    await ses.captura(capturaEnganche);
    assert.ok(dimensionesPng(capturaEnganche).ancho > 1000);
    await tecla(ses, "Escape", "Escape");
  } finally {
    await ses.cerrar();
  }
});
