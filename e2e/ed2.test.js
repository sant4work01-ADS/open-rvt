// ED2: espejo y matriz con la INTERFAZ real (clics en la planta y barra de
// opciones). Capturas en docs/progreso/ED2/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "ED2");
const DIMENSION = { ancho: 1700, alto: 1000 };

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 100 && alto > 100, `${ruta} mide ${ancho}×${alto}`);
  return { ancho, alto };
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(300);
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
  await esperar(200);
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
  await esperar(800);
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

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) =>
      document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function clicEn(ses, punto) {
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
  await esperar(400);
}

async function clicMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  await clicEn(ses, punto);
}

async function tecla(ses, key, code = key) {
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
  await esperar(350);
}

async function nuevoModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await ses.q('[data-testid="visor"] canvas');
}

async function crearNivel(ses, nombre, elevacion) {
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(400);
  await fijarValor(ses, "nivel-nuevo-nombre", nombre);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(800);
  await (
    await ses.driver.wait(until.elementLocated(By.css('[data-modulo="modelo"]')), 10_000)
  ).click();
  await esperar(400);
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(350);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

function verticesDe(malla) {
  const bytes = Buffer.from(malla.vertices, "base64");
  const v = new Float32Array(bytes.length / 4);
  for (let i = 0; i < v.length; i += 1) v[i] = bytes.readFloatLE(i * 4);
  return v;
}

function cajaMalla(malla) {
  const v = verticesDe(malla);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    x0 = Math.min(x0, v[i]);
    x1 = Math.max(x1, v[i]);
    y0 = Math.min(y0, v[i + 1]);
    y1 = Math.max(y1, v[i + 1]);
  }
  return { x0, x1, y0, y1 };
}

function datosMalla(elementos, clase) {
  return elementos.filter((e) => e.clase === clase);
}

async function seleccionado(ses) {
  return ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
  );
}

test("ED2: espejo con puerta, matriz lineal y polar, deshacer y capturas", async () => {
  const ses = await Sesion.abrir({
    prueba: "ed2",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await nuevoModelo(ses);
    await crearNivel(ses, "Nivel 1", 2.6);
    await activar(ses, "cmd-modelar-pestana").catch(() => undefined);
    const pestanaModelar = await ses.driver.findElements(
      By.xpath('//*[@role="tab"][normalize-space(.)="Modelar"]'),
    );
    if (pestanaModelar.length) {
      await pestanaModelar[0].click();
      await esperar(250);
    }
    await elegirVista(ses, "Planta Nivel 0");

    // 1. Espejo de un muro con puerta respecto al eje x = 0.
    await dibujarMuro(ses, 0, 0, 4, 0);
    await activar(ses, "cmd-puerta");
    await clicMundo(ses, 1.45, 0);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    // Eje vertical en x = 0, de (0,−1) a (0,5).
    await activar(ses, "cmd-eje");
    await clicMundo(ses, 0, -1);
    await clicMundo(ses, 0, 5);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await clicMundo(ses, 3.5, 0);
    const muroGid = await seleccionado(ses);
    assert.ok(muroGid, "no se seleccionó el muro");
    const propsMuro = await invocar(ses, "modelo.propiedades", { globalid: muroGid });
    assert.equal(propsMuro.clase, "IfcWall");
    // Atajo MM: activa Espejo; la barra debe decir espejo.
    await tecla(ses, "m", "KeyM");
    await tecla(ses, "m", "KeyM");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="barra-herramienta"]')?.dataset.herramienta,
      ),
      "espejo",
      "MM no activó Espejo",
    );
    // Copiar marcado por omisión.
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="espejo-copiar"]')?.checked,
      ),
      true,
      "la casilla Copiar no viene marcada",
    );
    await clicMundo(ses, 0, 2)
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      return datosMalla(lista, "IfcWall").length === 2;
    }, 15_000, "el espejo no creó el muro copiado");
    let elementos = await teselado(ses);
    assert.equal(datosMalla(elementos, "IfcWall").length, 2);
    assert.equal(datosMalla(elementos, "IfcDoor").length, 2);
    const cajasMuro = datosMalla(elementos, "IfcWall").map(cajaMalla);
    assert.ok(
      cajasMuro.some((c) => Math.abs(c.x0 + 4) < 1e-6 && Math.abs(c.x1) < 1e-6),
      `no hay muro reflejado de −4 a 0: ${JSON.stringify(cajasMuro)}`,
    );
    const cajasPuerta = datosMalla(elementos, "IfcDoor").map(cajaMalla);
    const centros = cajasPuerta.map((c) => (c.x0 + c.x1) / 2).sort((a, b) => a - b);
    assert.ok(
      Math.abs(centros[0] + 1.45) < 0.05 && Math.abs(centros[1] - 1.45) < 0.05,
      `puertas en ${centros}`,
    );
    await activar(ses, "visor-ajustar");
    await esperar(1200);
    const capturaEspejo = await ses.captura(path.join(CAPTURAS, "01-espejo.png"));
    dimensionesPng(capturaEspejo);

    // 4a (deshacer). Un paso quita la copia y deja el original.
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      return (
        datosMalla(lista, "IfcWall").length === 1 &&
        datosMalla(lista, "IfcDoor").length === 1
      );
    }, 15_000, "Ctrl+Z no deshizo el espejo");

    // 2. Matriz lineal de 4 columnas, separación 3 m: x = 10, 13, 16, 19.
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await activar(ses, "cmd-columna");
    await clicMundo(ses, 10, 0);
    await tecla(ses, "Escape", "Escape");
    await ses.driver.wait(async () => (await teselado(ses)).filter(
      (e) => e.clase === "IfcColumn",
    ).length === 1, 15_000, "no se creó la columna");
    await clicMundo(ses, 10, 0);
    const columnaGid = await seleccionado(ses);
    assert.ok(columnaGid, "no se seleccionó la columna");
    assert.equal(
      (await invocar(ses, "modelo.propiedades", { globalid: columnaGid })).clase,
      "IfcColumn",
    );
    await activar(ses, "cmd-matriz");
    await fijarValor(ses, "matriz-numero", "4");
    await clicMundo(ses, 10, 0);
    await clicMundo(ses, 13, 0);
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      return datosMalla(lista, "IfcColumn").length >= 4;
    }, 15_000, "la matriz lineal no creó 4 columnas");
    elementos = await teselado(ses);
    const columnasLineales = datosMalla(elementos, "IfcColumn")
      .map((m) => (cajaMalla(m).x0 + cajaMalla(m).x1) / 2)
      .filter((x) => x >= 9 && x <= 20)
      .sort((a, b) => a - b);
    assert.deepEqual(
      columnasLineales.map((x) => Math.round(x * 1e6) / 1e6),
      [10, 13, 16, 19],
      `columnas lineales en ${columnasLineales}`,
    );
    await activar(ses, "visor-ajustar");
    await esperar(1200);
    const capturaLineal = await ses.captura(path.join(CAPTURAS, "02-matriz-lineal.png"));
    dimensionesPng(capturaLineal);

    // 3. Matriz polar de 6 columnas alrededor de (0,0): radio 10 cada 60°.
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await clicMundo(ses, 10, 0);
    await activar(ses, "cmd-matriz");
    await fijarValor(ses, "matriz-modo", "polar");
    await fijarValor(ses, "matriz-numero", "6");
    await fijarValor(ses, "matriz-angulo", "360");
    await clicMundo(ses, 0, 0);
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      return datosMalla(lista, "IfcColumn").length >= 9;
    }, 15_000, "la matriz polar no creó las copias");
    elementos = await teselado(ses);
    const polares = datosMalla(elementos, "IfcColumn")
      .map((m) => {
        const c = cajaMalla(m);
        return { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 };
      })
      .filter((p) => Math.abs(Math.hypot(p.x, p.y) - 10) < 0.2)
      .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
    assert.equal(polares.length, 6, `columnas polares: ${polares.length}`);
    const angulos = polares.map((p) => Math.round((Math.atan2(p.y, p.x) * 180) / Math.PI));
    assert.deepEqual(angulos, [-120, -60, 0, 60, 120, 180], `ángulos: ${angulos}`);
    await activar(ses, "visor-ajustar");
    await esperar(1200);
    const capturaPolar = await ses.captura(path.join(CAPTURAS, "03-matriz-polar.png"));
    dimensionesPng(capturaPolar);

    // 4b (deshacer). Un paso quita solo la matriz polar.
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      return datosMalla(lista, "IfcColumn").length === 4;
    }, 15_000, "Ctrl+Z no deshizo la matriz polar");
    await activar(ses, "visor-ajustar");
    await esperar(1200);
    const capturaDeshacer = await ses.captura(path.join(CAPTURAS, "04-deshacer.png"));
    dimensionesPng(capturaDeshacer);

    // Atajo AR: activa Matriz.
    await tecla(ses, "a", "KeyA");
    await tecla(ses, "r", "KeyR");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="barra-herramienta"]')?.dataset.herramienta,
      ),
      "matriz",
      "AR no activó Matriz",
    );
  } finally {
    await ses.cerrar();
  }
});
