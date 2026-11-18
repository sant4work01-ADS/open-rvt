// O069: la planta dibuja la ventana con los datos del núcleo, se puede
// seleccionar con un clic y Mover funciona en Alzado Sur.
// Valores a mano (spec O069, 18-nov-2026): muro de (0,0) a (5,0) y ventana de
// 0.60 m colocada con su centro en x = 1.00 (distancia 0.70). Al editar la
// distancia a 2.00, el vano va de x = 2.00 a 2.60 (centro 2.30). Al mover
// 0.50 m hacia arriba en Alzado Sur, el antepecho pasa de 0.90 a 1.40.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const DIMENSION = { ancho: 1700, alto: 1000 };

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  assert.ok(cabecera.readUInt32BE(16) > 300, `${ruta} es muy angosto`);
  assert.ok(cabecera.readUInt32BE(20) > 300, `${ruta} es muy bajo`);
}

async function captura(ses, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  dimensionesPng(ruta);
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(350);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(250);
}

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    15_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(900);
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
  await esperar(250);
}

/** Escribe un campo del panel y lo confirma perdiendo el foco (CampoEditable). */
async function guardarCampo(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        el,
        valor,
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.focus();
      el.blur();
    },
    testid,
    valor,
  );
  await esperar(700);
}

async function invocar(ses, metodo, params = {}) {
  const respuesta = await ses.driver.executeAsyncScript(
    function (metodo, params, done) {
      window.__TAURI_INTERNALS__
        .invoke("nucleo_llamar", { metodo, params })
        .then((crudo) =>
          done({ ok: true, valor: crudo && crudo.status === "ok" ? crudo.data : crudo }),
        )
        .catch((error) => done({ ok: false, error: String(error) }));
    },
    metodo,
    params,
  );
  assert.equal(respuesta.ok, true, `falló ${metodo}: ${respuesta.error}`);
  return respuesta.valor;
}

async function instalarDialogos(ses) {
  await ses.driver.executeScript(() => {
    window.__PP_DIALOGO_PRUEBAS__ = async () => null;
  });
}

async function proyectar(ses, x, y, z = 0) {
  const punto = await ses.driver.executeScript(
    (x, y, z) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  return punto;
}

async function clicPantalla(ses, punto) {
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
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
  await esperar(500);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicPantalla(ses, await proyectar(ses, x, y, z));
}

async function tecla(ses, key) {
  await ses.driver.executeScript(
    (key) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true }));
    },
    key,
  );
  await esperar(150);
}

async function nuevoModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(
    async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    },
    20_000,
    "el modelo nuevo no cargó",
  );
  await ses.q('[data-testid="visor"] canvas');
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await fijarValor(ses, "muro-altura", "3.6");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await esperar(700);
  for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");
}

function rango(ventana) {
  const crudos = Buffer.from(ventana.vertices, "base64");
  const flotantes = new Float32Array(crudos.buffer, crudos.byteOffset, crudos.length / 4);
  const salida = { x: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (let i = 0; i < flotantes.length; i += 3) {
    salida.x[0] = Math.min(salida.x[0], flotantes[i]);
    salida.x[1] = Math.max(salida.x[1], flotantes[i]);
    salida.z[0] = Math.min(salida.z[0], flotantes[i + 2]);
    salida.z[1] = Math.max(salida.z[1], flotantes[i + 2]);
  }
  return salida;
}

const cerca = (a, b, tolerancia = 0.02) => Math.abs(a - b) <= tolerancia;

test("O069: planta sincronizada, selección de la ventana y Mover en Alzado Sur", async () => {
  const ses = await Sesion.abrir({
    prueba: "o069",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await instalarDialogos(ses);
    await nuevoModelo(ses);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await dibujarMuro(ses, 0, 0, 5, 0);
    await activar(ses, "visor-ajustar");
    await esperar(500);

    // Ventana de 0.60 m con centro en x = 1.00 (distancia 0.70).
    await activar(ses, "cmd-ventana");
    await fijarValor(ses, "abertura-ancho", "0.6");
    await clicMundo(ses, 1.0, 0);
    await ses.driver.wait(
      async () => (await teselado(ses)).filter((e) => e.clase === "IfcWindow").length === 1,
      20_000,
      "no se creó la ventana",
    );
    let ventana = (await teselado(ses)).find((e) => e.clase === "IfcWindow");
    let datos = await props(ses, ventana.globalid);
    assert.ok(
      Math.abs(Number(datos.psets.OPENRVT_Abertura.Distancia) - 0.7) < 1e-6,
      `distancia inicial: ${datos.psets.OPENRVT_Abertura.Distancia}`,
    );
    await captura(ses, "o069-01-ventana-inicial.png");

    // (1) Seleccionar en planta con el símbolo: el clic gana sobre el muro.
    for (let i = 0; i < 2; i += 1) await tecla(ses, "Escape");
    await clicMundo(ses, 1.0, 0);
    let gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    assert.equal(gid, ventana.globalid, "el clic en planta no seleccionó la ventana");

    // (2) Editar la distancia en Propiedades: la planta debe mover el símbolo.
    await guardarCampo(ses, "elemento-distancia", "2");
    await ses.driver.wait(
      async () => {
        const w = (await teselado(ses)).find((e) => e.clase === "IfcWindow");
        return w && cerca(rango(w).x[0], 2.0, 0.01);
      },
      20_000,
      "la ventana no se movió en el 3D",
    );
    ventana = (await teselado(ses)).find((e) => e.clase === "IfcWindow");
    datos = await props(ses, ventana.globalid);
    assert.ok(
      Math.abs(Number(datos.psets.OPENRVT_Abertura.Distancia) - 2.0) < 1e-6,
      `distancia tras editar: ${datos.psets.OPENRVT_Abertura.Distancia}`,
    );
    let caja = rango(ventana);
    assert.ok(
      cerca(caja.x[0], 2.0, 0.01) && cerca(caja.x[1], 2.6, 0.01),
      `caja 3D de la ventana: ${caja.x[0]}..${caja.x[1]}`,
    );

    // (1b) El símbolo de planta está en la caja nueva del 3D (centro 2.30).
    await clicMundo(ses, 2.3, 0);
    gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    assert.equal(gid, ventana.globalid, "la planta no dibujó la ventana en su lugar nuevo");
    await captura(ses, "o069-02-planta-tras-editar.png");

    // (3) Mover 0.50 hacia arriba en Alzado Sur: el antepecho 0.90 → 1.40.
    await elegirVista(ses, "Alzado Sur");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await activar(ses, "cmd-mover");
    assert.match(
      (await textoDom(ses, '[data-testid="mover-paso"]')) || "",
      /Punto base/,
      "con la ventana seleccionada, Mover debe pedir el punto base",
    );
    await clicMundo(ses, 2.3, 0, 1.0);
    await clicMundo(ses, 2.3, 0, 1.5);
    await esperar(1000);

    datos = await props(ses, ventana.globalid);
    assert.ok(
      Math.abs(Number(datos.psets.OPENRVT_Abertura.Antepecho) - 1.4) < 1e-6,
      `antepecho tras mover: ${datos.psets.OPENRVT_Abertura.Antepecho}`,
    );
    assert.ok(
      Math.abs(Number(datos.psets.OPENRVT_Abertura.AntepechoNivel) - 1.4) < 1e-6,
      `antepecho relativo tras mover: ${datos.psets.OPENRVT_Abertura.AntepechoNivel}`,
    );
    ventana = (await teselado(ses)).find((e) => e.clase === "IfcWindow");
    caja = rango(ventana);
    assert.ok(
      cerca(caja.z[0], 1.4, 0.01) && cerca(caja.z[1], 2.6, 0.01),
      `caja 3D en z: ${caja.z[0]}..${caja.z[1]}`,
    );
    assert.ok(
      cerca(caja.x[0], 2.0, 0.01) && cerca(caja.x[1], 2.6, 0.01),
      `mover en vertical no debe cambiar x: ${caja.x[0]}..${caja.x[1]}`,
    );
    await captura(ses, "o069-03-alzado-movido.png");

    // La planta sigue coincidiendo con la caja 3D tras mover en el alzado.
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await clicMundo(ses, 2.3, 0);
    gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    assert.equal(gid, ventana.globalid, "tras mover en alzado, la planta debe seguir al día");
    await captura(ses, "o069-04-planta-final.png");
  } finally {
    await ses.cerrar();
  }
});
