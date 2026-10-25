// O006d: retícula en ambos sentidos con rebase, edición de la cota del rebase y eje
// suelto restringido con distancia tecleada. Con la app Tauri real bajo xvfb.
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
  await esperar(80);
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
  await esperar(100);
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
  await esperar(180);
}

async function tecla(ses, key, code) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    key,
    code,
  );
  await esperar(80);
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

async function dobleClicCota(ses, texto, indice = 0) {
  const punto = await posicionCota(ses, texto, indice);
  assert.ok(punto, `no se encontró la cota ${texto}`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(200);
}

async function cambiarCota(ses, valor) {
  const campo = await ses.porTestid("cota-campo");
  await campo.click();
  await campo.sendKeys(Key.CONTROL, "a");
  await campo.sendKeys(valor);
  await campo.sendKeys(Key.ENTER);
  await esperar(500);
}

async function cotas(ses) {
  const crudo = await (await ses.porTestid("visor")).getAttribute("data-cotas");
  return crudo ? JSON.parse(crudo) : [];
}

function largo(eje) {
  return Math.hypot(eje.x2 - eje.x1, eje.y2 - eje.y1);
}

test("O006d: tres ejes sueltos paralelos quedan con dos parciales y una total editables", async () => {
  const ses = await Sesion.abrir({
    prueba: "o006d-tres-ejes",
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
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-eje");

    // Tres verticales: el primero libre y los otros dos restringidos a la familia.
    await clicMundo(ses, 0, 0);
    await moverRaton(ses, 0, 5);
    await clicMundo(ses, 0, 5);
    await clicMundo(ses, 2, 0);
    await moverRaton(ses, 2.1, 4);
    await clicMundo(ses, 2.1, 4);
    await clicMundo(ses, 4, 0);
    await moverRaton(ses, 4.1, 4);
    await clicMundo(ses, 4.1, 4);
    await ses.driver.wait(
      async () =>
        (await (await ses.porTestid("visor")).getAttribute("data-ejes-etiquetas")) ===
        "1,2,3",
      15_000,
      "no se crearon los tres ejes",
    );

    const familias = await cotas(ses);
    assert.equal(familias.length, 1, "los tres ejes forman una sola familia");
    assert.deepEqual(familias[0].parciales, ["2.00", "2.00"]);
    assert.equal(familias[0].total, "4.00");
    assert.equal(
      await (await ses.porTestid("visor")).getAttribute("data-cotas-editables"),
      "2",
      "las dos parciales son editables y la total no",
    );

    await dobleClicCota(ses, "2.00", 0);
    assert.equal(
      await (await ses.porTestid("cota-mover-siguientes")).isSelected(),
      true,
      "«Mover los siguientes» viene marcada",
    );
    await cambiarCota(ses, "3");
    await ses.driver.wait(
      async () => {
        const actuales = await cotas(ses);
        return actuales[0]?.total === "5.00";
      },
      15_000,
      "la cota total no pasó a 5,00",
    );
    const editadas = await cotas(ses);
    assert.deepEqual(editadas[0].parciales, ["3.00", "2.00"]);
    assert.equal(editadas[0].total, "5.00");
    const ejes = await invocar(ses, "ejes.listar");
    assert.equal(ejes.find((e) => e.etiqueta === "2").x1, 3);
    assert.equal(ejes.find((e) => e.etiqueta === "3").x1, 5);
  } finally {
    await ses.cerrar();
  }
});

test("O006d: retícula con rebase, cota editable y eje suelto restringido", async () => {
  const ses = await Sesion.abrir({
    prueba: "o006d-ejes",
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

    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-ejes-separaciones");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
      10_000,
      "no abrió el diálogo de ejes",
    );
    assert.equal(
      await (await ses.porTestid("eje-sep-modo-rebase")).isSelected(),
      true,
      "el modo rebase viene por omisión",
    );
    await fijarValor(ses, "eje-sep-vertical-separaciones", "5, 4.5, 5");
    await fijarValor(ses, "eje-sep-vertical-etiqueta", "1");
    await fijarValor(ses, "eje-sep-horizontal-separaciones", "4, 4");
    await fijarValor(ses, "eje-sep-horizontal-etiqueta", "A");
    await fijarValor(ses, "eje-sep-rebase", "1.5");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="eje-sep-aceptar"]')?.click();
    });
    await esperar(300);
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]')))
          .length === 0,
      10_000,
      "el diálogo no se cerró",
    );
    await ses.driver.wait(
      async () =>
        (await (await ses.porTestid("visor")).getAttribute("data-ejes-etiquetas")) ===
        "1,2,3,4,A,B,C",
      10_000,
      "no aparecieron los siete ejes",
    );

    let ejes = await invocar(ses, "ejes.listar");
    const porEtiqueta = (lista, etiqueta) => {
      const eje = lista.find((e) => e.etiqueta === etiqueta);
      assert.ok(eje, `falta el eje ${etiqueta}`);
      return eje;
    };
    for (const etiqueta of ["1", "2", "3", "4"]) {
      assert.ok(
        Math.abs(largo(porEtiqueta(ejes, etiqueta)) - 11) < 1e-6,
        `el vertical ${etiqueta} debe medir 8 + 3 = 11 m`,
      );
    }
    for (const etiqueta of ["A", "B", "C"]) {
      assert.ok(
        Math.abs(largo(porEtiqueta(ejes, etiqueta)) - 17.5) < 1e-6,
        `el horizontal ${etiqueta} debe medir 14.5 + 3 = 17.5 m`,
      );
    }
    assert.deepEqual(await invocar(ses, "ejes.reticula"), { modo: "rebase", rebase: 1.5 });

    await activar(ses, "visor-ajustar");
    await esperar(400);
    const familias = await cotas(ses);
    const vertical = familias.find((f) => f.vertical);
    assert.equal(vertical.rebase, "1.50", "se dibuja la cota del rebase");
    await ses.captura(path.join(CAPTURAS, "o006d_reticula.png"));

    // Editar la cota del rebase a 2 m: todos los verticales pasan a 12 m.
    await dobleClicCota(ses, "1.50", 0);
    await ses.porTestid("cota-campo");
    await cambiarCota(ses, "2");
    await ses.driver.wait(
      async () => (await invocar(ses, "ejes.reticula")).rebase === 2,
      15_000,
      "el rebase no pasó a 2,00 m",
    );
    ejes = await invocar(ses, "ejes.listar");
    for (const etiqueta of ["1", "2", "3", "4"]) {
      assert.ok(
        Math.abs(largo(porEtiqueta(ejes, etiqueta)) - 12) < 1e-6,
        `con rebase 2 el vertical ${etiqueta} debe medir 12 m`,
      );
    }
    const editadas = await cotas(ses);
    assert.equal(editadas.find((f) => f.vertical).rebase, "2.00");
    await ses.captura(path.join(CAPTURAS, "o006d_reticula.png"));
    assert.deepEqual(dimensionesPng(path.join(CAPTURAS, "o006d_reticula.png")), {
      ancho: 1600,
      alto: 900,
    });

    // Eje suelto a 6 m del eje 4, con la distancia tecleada.
    await activar(ses, "visor-ajustar");
    await esperar(300);
    await activar(ses, "cmd-eje");
    await clicMundo(ses, 20, 3);
    await moverRaton(ses, 20.4, 8);
    await tecla(ses, "6", "Digit6");
    assert.equal(
      await (await ses.porTestid("visor")).getAttribute("data-largo-tecleado"),
      "6",
    );
    await tecla(ses, "Enter", "Enter");
    await ses.driver.wait(
      async () =>
        (await (await ses.porTestid("visor")).getAttribute("data-ejes-etiquetas")) ===
        "1,2,3,4,5,A,B,C",
      15_000,
      "no se creó el eje 5",
    );
    ejes = await invocar(ses, "ejes.listar");
    const nuevo = porEtiqueta(ejes, "5");
    assert.equal(nuevo.x1, 20.5, "el eje queda a 6 m del eje 4 (14.5 + 6)");
    assert.equal(nuevo.x2, 20.5);
    assert.ok(Math.abs(nuevo.y1 - -2) < 1e-6, "hereda el extremo inferior rebasado");
    assert.ok(Math.abs(nuevo.y2 - 10) < 1e-6, "hereda el extremo superior rebasado");
    assert.ok(Math.abs(largo(nuevo) - 12) < 1e-6, "hereda la longitud de la familia");

    // Las cotas automáticas lo incluyen enseguida: 6,00 entre el 4 y el 5.
    const conNuevo = await cotas(ses);
    const verticalFinal = conNuevo.find((f) => f.vertical);
    assert.deepEqual(verticalFinal.parciales, ["5.00", "4.50", "5.00", "6.00"]);
    assert.equal(verticalFinal.total, "20.50");
    await activar(ses, "visor-ajustar");
    await esperar(400);
    const capturaEje = path.join(CAPTURAS, "o006d_eje_suelto.png");
    await ses.captura(capturaEje);
    assert.deepEqual(dimensionesPng(capturaEje), { ancho: 1600, alto: 900 });
  } finally {
    await ses.cerrar();
  }
});
