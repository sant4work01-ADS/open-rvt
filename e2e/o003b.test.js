// Pruebas E2E de O003b con la app Tauri real (tauri-driver + WebKitGTK bajo xvfb).
// Casa nueva de 8 × 6: cuatro muros con longitud tecleada, losa desde muros, puerta,
// ventana, mover/deshacer, guardar y reabrir. Toma las capturas de la entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
  await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  const pestana = await ses.driver.findElement(
    By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`),
  );
  await pestana.click();
  await esperar(150);
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

async function proyectar(ses, x, y) {
  return ses.driver.executeScript(
    (x, y) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone la proyección");
      }
      return visor.__openrvtMundoAPantalla(x, y, 0);
    },
    x,
    y,
  );
}

function eventoRaton(tipo, punto, extra = {}) {
  return {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: tipo === "pointerup" ? 0 : 1,
    pointerId: 1,
    pointerType: "mouse",
    clientX: punto.x,
    clientY: punto.y,
    ...extra,
  };
}

async function moverRaton(ses, x, y, extra = {}) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto, extra) => {
      window.dispatchEvent(new PointerEvent("pointermove", { ...extra, clientX: punto.x, clientY: punto.y, pointerId: 1, pointerType: "mouse", bubbles: true }));
    },
    punto,
    extra,
  );
  await esperar(60);
}

async function clicMundo(ses, x, y, extra = {}) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto, extra) => {
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
        ...extra,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", opciones));
      window.dispatchEvent(
        new PointerEvent("pointerup", { ...opciones, buttons: 0 }),
      );
    },
    punto,
    extra,
  );
  await esperar(120);
}

async function tecla(ses, key, extra = {}) {
  await ses.driver.executeScript(
    (key, extra) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
          bubbles: true,
          cancelable: true,
          ...extra,
        }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, bubbles: true, ...extra }),
      );
    },
    key,
    extra,
  );
  await esperar(80);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(120);
}

async function muroTecleado(ses, direccion, longitud) {
  await moverRaton(ses, direccion[0], direccion[1]);
  for (const digito of String(longitud)) await tecla(ses, digito);
  await tecla(ses, "Enter");
  await esperar(250);
}

async function esperarElementos(ses, cantidad, ms = 15_000) {
  await ses.driver.wait(async () => {
    const texto = await textoDom(ses, '[data-testid="estado-elementos"]');
    return texto === `${cantidad} elementos`;
  }, ms, `la barra de estado no muestra ${cantidad} elementos`);
}

test("O003b: casa nueva, losa, puerta, ventana, mover/deshacer y reabrir", async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o003b-"));
  const destino = path.join(carpeta, "o003b-casa.ifc");
  let ses = await Sesion.abrir({
    prueba: "o003b-casa",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await instalarDialogos(ses, { guardar: destino });
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
    await activar(ses, "cmd-muro");

    // Cuatro muros 8 × 6 con longitud tecleada y el ratón marcando la dirección.
    await clicMundo(ses, 0, 0);
    await muroTecleado(ses, [4, 0], 8);
    await muroTecleado(ses, [8, 3], 6);
    await muroTecleado(ses, [4, 6], 8);
    await muroTecleado(ses, [0, 3], 6);
    // O005c: el primer Esc cancela el trazo en curso y conserva la herramienta; el
    // segundo la apaga. Sin el segundo, volver a pulsar «Muro» la apagaría y no habría
    // snap que comprobar.
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    await esperarElementos(ses, 4);
    assert.equal(await (await ses.porTestid("visor")).getAttribute("data-mallas"), "4");

    // Captura de la planta dibujando, con el snap visible en el punto medio del muro.
    await activar(ses, "cmd-muro");
    await clicMundo(ses, 0, 0);
    await moverRaton(ses, 4.03, 0.02);
    await ses.driver.wait(
      async () =>
        (await (await ses.porTestid("visor")).getAttribute("data-enganche")) === "medio",
      5000,
      "no apareció el snap de punto medio",
    );
    await esperar(200);
    const capturaPlanta = path.join(CAPTURAS, "o003b_planta_dibujando.png");
    await ses.captura(capturaPlanta);
    assert.deepEqual(dimensionesPng(capturaPlanta), { ancho: 1600, alto: 900 });
    // O005c: el primer Esc cancela el trazo y el segundo apaga la herramienta; si
    // queda activa, los clics siguientes dibujan en vez de seleccionar.
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");

    // Selección de los cuatro muros y losa desde muros.
    for (const [x, y] of [
      [4, 0],
      [8, 3],
      [4, 6],
      [0, 3],
    ]) {
      await clicMundo(ses, x, y, { ctrlKey: true, metaKey: true });
    }
    const seleccionados = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="panel-propiedades"]')?.textContent || "",
    );
    assert.match(seleccionados, /Propiedades del elemento/);
    await activar(ses, "cmd-losa");
    await activar(ses, "losa-desde-muros");
    await esperarElementos(ses, 5);

    // Puerta en el muro sur y ventana en el muro este.
    await activar(ses, "cmd-puerta");
    await clicMundo(ses, 2, 0);
    await esperarElementos(ses, 6);
    await activar(ses, "cmd-ventana");
    await clicMundo(ses, 8, 3);
    await esperarElementos(ses, 7);
    await tecla(ses, "Escape");

    // Propiedades editables de un muro y captura.
    await clicMundo(ses, 4, 0);
    await ses.porTestid("propiedades-elemento");
    assert.ok(await ses.porTestid("elemento-nombre"));
    assert.ok(await ses.porTestid("elemento-altura"));
    await esperar(200);
    const capturaProps = path.join(CAPTURAS, "o003b_propiedades_muro.png");
    await ses.captura(capturaProps);
    assert.deepEqual(dimensionesPng(capturaProps), { ancho: 1600, alto: 900 });

    // Mover el muro seleccionado, deshacer y comprobar que vuelve.
    await activar(ses, "cmd-mover");
    await clicMundo(ses, 4, 0);
    await clicMundo(ses, 5.25, 0);
    await ses.driver.wait(async () => {
      const aviso = await textoDom(ses, '[data-testid="estado-aviso"]');
      return /movido/i.test(aviso || "");
    }, 10_000, "el núcleo no confirmó el movimiento");
    await activar(ses, "cmd-deshacer");
    await ses.driver.wait(async () => {
      const aviso = await textoDom(ses, '[data-testid="estado-aviso"]');
      return /deshecho/i.test(aviso || "");
    }, 10_000, "el núcleo no confirmó el deshacer");
    await esperarElementos(ses, 7);

    // Captura isométrica.
    await ses.driver.wait(
      until.elementLocated(
        By.xpath(
          '//button[@data-testid="vista-item"][normalize-space(.)="3D Isométrica"]',
        ),
      ),
      10_000,
    );
    const elegirVista = await ses.driver.findElement(
      By.xpath(
        '//button[@data-testid="vista-item"][normalize-space(.)="3D Isométrica"]',
      ),
    );
    await elegirVista.click();
    await esperar(600);
    const capturaIso = path.join(CAPTURAS, "o003b_casa_iso.png");
    await ses.captura(capturaIso);
    assert.deepEqual(dimensionesPng(capturaIso), { ancho: 1600, alto: 900 });

    // Guardar.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar-como");
    await ses.driver.wait(() => fs.existsSync(destino), 15_000, "no se creó el IFC");
    assert.ok(fs.statSync(destino).size > 1000);
  } finally {
    await ses.cerrar();
  }

  ses = await Sesion.abrir({
    prueba: "o003b-reabrir",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await instalarDialogos(ses, { abrir: destino });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el IFC guardado no reabrió");
    await esperarElementos(ses, 7);
    assert.equal(await (await ses.porTestid("visor")).getAttribute("data-mallas"), "7");
    const conteos = await ses.driver.executeScript(async () => {
      const crudo = await window.__TAURI_INTERNALS__.invoke("nucleo_llamar", {
        metodo: "modelo.elementos",
        params: {},
      });
      const respuesta = crudo && crudo.status === "ok" ? crudo.data : crudo;
      const porClase = {};
      for (const e of respuesta) porClase[e.clase] = (porClase[e.clase] || 0) + 1;
      return porClase;
    });
    assert.deepEqual(conteos, {
      IfcDoor: 1,
      IfcSlab: 1,
      IfcWall: 4,
      IfcWindow: 1,
    });
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
