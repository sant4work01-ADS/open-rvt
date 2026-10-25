// O007a: editor de tipos con muro multicapa, biblioteca de materiales y capas en
// planta a 1:50. Con la app Tauri real bajo xvfb.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

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
  await esperar(250);
}

async function tecla(ses, key, code) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
    },
    key,
    code,
  );
  await esperar(100);
}

async function cambiarMaterial(ses, indice, material, espesorCm) {
  await fijarValor(ses, `capa-material-${indice}`, material);
  await fijarValor(ses, `capa-espesor-${indice}`, espesorCm);
}

async function abrirEditor(ses) {
  await cambiarPestana(ses, "Modelar");
  await activar(ses, "cmd-tipos");
  return ses.porTestid("editor-tipos");
}

test("O007a: duplica Block 15, arma seis capas, aplica y dibuja las capas en planta", async () => {
  const ses = await Sesion.abrir({
    prueba: "o007a-editor",
    tamano: { ancho: 1700, alto: 1000 },
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

    // Planta a 1:50 desde el principio.
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-escala", "50");
    await cambiarPestana(ses, "Modelar");

    // Un muro de 6 m con el tipo base Block 15.
    await activar(ses, "cmd-muro");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 6, 0);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");

    // El muro de Block 15 existe y tiene una sola capa.
    const antes = await invocar(ses, "geometria.teselar", { globalids: null });
    const muroAntes = antes.elementos.find((e) => e.clase === "IfcWall");
    assert.ok(muroAntes, "no se creó el muro");
    assert.equal(muroAntes.capas.length, 1);
    assert.equal(muroAntes.capas[0].espesor, 0.15);

    await abrirEditor(ses);
    await (await ses.porTestid("tipo-Block 15")).click();
    await esperar(200);
    assert.match(await textoDom(ses, '[data-testid="tipos-instancias"]'), /^Instancias: 1$/);

    // Duplicar «Block 15» como «Block 15 aplanado».
    await activar(ses, "tipos-duplicar");
    await fijarValor(ses, "dialogo-nombre-input", "Block 15 aplanado");
    await activar(ses, "dialogo-nombre-aceptar");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="tipo-Block 15 aplanado"]')),
      10_000,
    );

    // El muro existente pasa al tipo duplicado con la lista de propiedades. Así la
    // edición del tipo demuestra que cambian todas sus instancias.
    await activar(ses, "editor-cerrar");
    await clicMundo(ses, 3, 0);
    await fijarValor(ses, "elemento-tipo", "Block 15 aplanado");
    await esperar(700);
    const conTipo = await invocar(ses, "geometria.teselar", { globalids: null });
    assert.equal(conTipo.elementos.find((e) => e.clase === "IfcWall").capas.length, 1);

    await abrirEditor(ses);
    await (await ses.porTestid("tipo-Block 15 aplanado")).click();
    await esperar(200);
    assert.match(await textoDom(ses, '[data-testid="tipos-instancias"]'), /^Instancias: 1$/);

    // Seis capas: pintura · fino · repellado · block 15 · yeso · pintura.
    await activar(ses, "capa-insertar-0");
    await cambiarMaterial(ses, 1, "Pintura", "0.05");
    await activar(ses, "capa-insertar-0");
    await cambiarMaterial(ses, 1, "Yeso", "1.0");
    await activar(ses, "capa-insertar-0");
    await cambiarMaterial(ses, 1, "Aplanado de mortero (repellado)", "1.5");
    await activar(ses, "capa-subir-1");
    await activar(ses, "capa-insertar-0");
    await cambiarMaterial(ses, 1, "Aplanado fino", "0.5");
    await activar(ses, "capa-insertar-0");
    await cambiarMaterial(ses, 1, "Pintura", "0.05");
    await activar(ses, "capa-subir-1");
    await activar(ses, "capa-subir-2");

    const capas = await ses.driver.executeScript(() =>
      Array.from(document.querySelectorAll('[data-testid^="capa-"]'))
        .filter((el) => el.tagName === "TR")
        .map((el) => el.getAttribute("data-funcion")),
    );
    assert.deepEqual(capas, [
      "acabado",
      "acabado",
      "acabado",
      "núcleo",
      "acabado",
      "acabado",
    ]);
    const total = await textoDom(ses, '[data-testid="capas-total"]');
    assert.match(total, /18\.1 cm · 0\.181 m/);
    const bandas = await ses.driver.findElements(
      By.css('[data-testid^="previa-capa-"]'),
    );
    assert.equal(bandas.length, 6);

    await ses.captura(path.join(CAPTURAS, "o007a_editor_tipos.png"));
    await activar(ses, "tipos-aplicar");
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="editor-tipos"]') === null,
        )) === true,
      15_000,
      "el editor no se cerró al aplicar",
    );
    await esperar(600);

    // La instancia existente cambió de espesor y conserva sus seis capas.
    const despues = await invocar(ses, "geometria.teselar", { globalids: null });
    const muro = despues.elementos.find((e) => e.clase === "IfcWall");
    assert.ok(muro, "el muro desapareció");
    assert.equal(muro.capas.length, 6);
    const suma = muro.capas.reduce((s, c) => s + c.espesor, 0);
    assert.ok(Math.abs(suma - 0.181) < 1e-9, `espesor total ${suma}`);
    assert.deepEqual(
      muro.capas.map((c) => c.funcion),
      ["acabado", "acabado", "acabado", "núcleo", "acabado", "acabado"],
    );

    // A 1:50 se dibujan las líneas de capas y el rayado del núcleo.
    await ses.driver.wait(async () => {
      const valor = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.capasPlanta,
      );
      return Number(valor) > 6;
    }, 10_000, "no se dibujaron las capas en planta");
    const lineas = Number(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.capasPlanta,
      ),
    );
    assert.ok(lineas >= 6, `solo ${lineas} líneas de capa`);
    await ses.captura(path.join(CAPTURAS, "o007a_planta_capas.png"));
    assert.ok(dimensionesPng(path.join(CAPTURAS, "o007a_planta_capas.png")).ancho > 1000);

    // A 1:100 solo queda el contorno exterior: no hay líneas de capa.
    await tecla(ses, "Escape", "Escape");
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-escala", "100");
    await ses.driver.wait(async () => {
      const valor = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.capasPlanta,
      );
      return valor === "0";
    }, 10_000, "a 1:100 no deberían dibujarse capas");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.capasPlanta,
      ),
      "0",
    );

    // Pestaña Materiales: quince materiales de la biblioteca.
    await abrirEditor(ses);
    await activar(ses, "pestana-materiales");
    await ses.porTestid("tabla-materiales");
    const filas = await ses.driver.findElements(By.css('[data-testid^="material-"]'));
    assert.ok(filas.length >= 15, `solo ${filas.length} materiales`);
    assert.equal(
      await ses.driver.executeScript(
        () =>
          document.querySelector('[data-testid="material-nombre-0"]')?.value ?? null,
      ) !== null,
      true,
    );
    await ses.captura(path.join(CAPTURAS, "o007a_materiales.png"));
    const medidasEditor = dimensionesPng(path.join(CAPTURAS, "o007a_editor_tipos.png"));
    assert.ok(medidasEditor.ancho > 1000 && medidasEditor.alto > 600);
    await activar(ses, "editor-cerrar");
  } finally {
    await ses.cerrar();
  }
});
