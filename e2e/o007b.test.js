// O007b: elementos estructurales con la app Tauri real bajo xvfb. Crea una retícula
// de 2×2 ejes a 4 m, coloca C-1 en los cuatro cruces (con enganche), una trabe T-1 y
// una zapata Z-1, cambia K-1 a armex en el editor y toma las capturas de la entrega.
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

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(200);
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

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone __openrvtMundoAPantalla");
      }
      return visor.__openrvtMundoAPantalla(x, y, z);
    },
    x,
    y,
    z,
  );
}

async function tecla(ses, key, code = key) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
    },
    key,
    code,
  );
  await esperar(150);
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
  await esperar(350);
}

async function crearReticula(ses) {
  await cambiarPestana(ses, "Modelar");
  await activar(ses, "cmd-ejes-separaciones");
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
    10_000,
    "no abrió el diálogo de ejes",
  );
  await fijarValor(ses, "eje-sep-vertical-separaciones", "4");
  await fijarValor(ses, "eje-sep-horizontal-separaciones", "4");
  await activar(ses, "eje-sep-aceptar");
  await ses.driver.wait(
    async () =>
      (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]')))
        .length === 0,
    10_000,
    "el diálogo no se cerró",
  );
  await esperar(500);
}

async function abrirEditor(ses) {
  await cambiarPestana(ses, "Modelar");
  await activar(ses, "cmd-tipos");
  return ses.porTestid("editor-tipos");
}

test("O007b: columnas en los cruces, trabe, zapata, editor con armex y capturas", async () => {
  const ses = await Sesion.abrir({
    prueba: "o007b-estructura",
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
    await crearReticula(ses);

    const ejes = await invocar(ses, "ejes.listar", {});
    const verticales = ejes.filter((e) => e.vertical).map((e) => e.x1).sort((a, b) => a - b);
    const horizontales = ejes.filter((e) => !e.vertical).map((e) => e.y1).sort((a, b) => a - b);
    assert.deepEqual(verticales, [0, 4]);
    assert.deepEqual(horizontales, [0, 4]);

    // Columna C-1 en los cuatro cruces. Los clics caen a 0.1 m del cruce: el enganche
    // «cruce de ejes» debe llevarlos exactamente a 0/4.
    await activar(ses, "cmd-columna");
    const barra = await textoDom(ses, '[data-testid="barra-herramienta"]');
    assert.match(barra, /columna/);
    assert.match(barra, /Girar 90°/);
    for (const [x, y] of [[0.10, -0.10], [3.90, 0.10], [0.10, 3.90], [4.10, 4.10]]) {
      await clicMundo(ses, x, y);
    }
    const teseladoColumnas = await invocar(ses, "geometria.teselar", { globalids: null });
    const columnas = teseladoColumnas.elementos.filter((e) => e.clase === "IfcColumn");
    assert.equal(columnas.length, 4);
    const centros = columnas
      .map((c) => [Math.round(c.estructura.datos.X * 100) / 100, Math.round(c.estructura.datos.Y * 100) / 100])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    assert.deepEqual(centros, [[0, 0], [0, 4], [4, 0], [4, 4]]);
    assert.ok(columnas.every((c) => c.estructura.alias === "columna"));
    assert.ok(columnas.every((c) => Math.abs(c.estructura.seccion.B - 0.30) < 1e-9));

    // Trabe T-1 entre dos columnas y zapata Z-1 bajo una columna.
    await activar(ses, "cmd-trabe");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await activar(ses, "cmd-zapata");
    await clicMundo(ses, 0, 0);

    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const trabe = teselado.elementos.find((e) => e.clase === "IfcBeam");
    assert.ok(trabe, "no se creó la trabe");
    assert.equal(trabe.estructura.alias, "trabe");
    assert.ok(Math.abs(trabe.estructura.datos.X2 - 4) < 1e-9);
    const zapata = teselado.elementos.find((e) => e.clase === "IfcFooting");
    assert.ok(zapata, "no se creó la zapata");
    assert.equal(zapata.estructura.alias, "zapata");
    assert.ok(Math.abs(zapata.estructura.datos.Desplante - 1.0) < 1e-9);
    assert.ok(Math.abs(zapata.estructura.seccion.Largo - 1.2) < 1e-9);

    // Captura de la planta con columnas llenas y trabe/zapata discontinuas.
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-escala", "50");
    await esperar(500);
    await ses.captura(path.join(CAPTURAS, "o007b_planta.png"));
    const planta = dimensionesPng(path.join(CAPTURAS, "o007b_planta.png"));
    assert.ok(planta.ancho > 1000 && planta.alto > 600);

    // Editor: C-1 con sección armada y Z-1 con parrilla y dado.
    await abrirEditor(ses);
    await (await ses.porTestid("tipo-C-1 Columna 30×30")).click();
    await esperar(400);
    await ses.porTestid("formulario-estructura");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="seccion-B"]')?.value,
      ),
      "30",
    );
    const varillas = await ses.driver.findElements(By.css('[data-testid^="varilla-"]'));
    assert.equal(varillas.length, 4);
    assert.match(await textoDom(ses, '[data-testid="acero-tipo"]'), /^Acero estimado por pieza tipo:/);
    await ses.captura(path.join(CAPTURAS, "o007b_editor_columna.png"));

    await (await ses.porTestid("tipo-Z-1 Zapata 1.20×1.20")).click();
    await esperar(400);
    await ses.porTestid("vista-previa-zapata");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="seccion-Largo"]')?.value,
      ),
      "120",
    );
    await ses.captura(path.join(CAPTURAS, "o007b_editor_zapata.png"));

    // K-1: cambia el armado a armex y aplica.
    await (await ses.porTestid("tipo-K-1 Castillo 15×15")).click();
    await esperar(300);
    await fijarValor(ses, "armado-Armex", "15x15-4");
    await activar(ses, "tipos-aplicar");
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="editor-tipos"]') === null,
        )) === true,
      15_000,
      "el editor no se cerró al aplicar",
    );
    await esperar(500);
    const tipos = await invocar(ses, "tipos.listar", { clase: "IfcColumnType" });
    const castillo = tipos.find((t) => t.nombre === "K-1 Castillo 15×15");
    assert.equal(castillo.armado.Armex, "15x15-4");
    assert.ok(Math.abs(castillo.acero.total_kg - 1.82) < 1e-3);

    // 3D con el color del material.
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-tipo", "perspectiva");
    await fijarValor(ses, "vista-estilo", "sombreado");
    await esperar(500);
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await ses.captura(path.join(CAPTURAS, "o007b_3d.png"));
    const trid = dimensionesPng(path.join(CAPTURAS, "o007b_3d.png"));
    assert.ok(trid.ancho > 1000 && trid.alto > 600);

    const medidasEditor = dimensionesPng(path.join(CAPTURAS, "o007b_editor_columna.png"));
    assert.ok(medidasEditor.ancho > 1000 && medidasEditor.alto > 600);
  } finally {
    await ses.cerrar();
  }
});
