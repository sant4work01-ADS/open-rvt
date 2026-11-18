// O070: pantalla dividida. Planta Nivel 0 a la izquierda y 3D Perspectiva a la
// derecha; el muro de 4.00 m dibujado en la planta aparece en el 3D; la selección
// en el 3D se resalta en la planta y en Propiedades; el separador llega al 70 %;
// con el 3D activo, ocultar Muros no los oculta en la planta.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, activar } = require("./arnes");

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
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 300 && alto > 300, `${ruta} mide ${ancho}×${alto}`);
}

async function captura(ses, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  dimensionesPng(ruta);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(250);
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

const panel = (i) => `[data-testid="panel-vista-${i}"]`;
const visor = (i) => `${panel(i)} [data-testid="visor"]`;

async function activarPanel(ses, i) {
  await ses.q(`${panel(i)} [data-testid="panel-nombre-${i}"]`);
  // La barra del panel queda bajo el asa del panel lateral derecho; se envía el
  // pointerdown al elemento (que es lo que activa el panel) en vez de un clic
  // por coordenadas, que el asa interceptaría.
  await ses.driver.executeScript(
    (i) => {
      const barra = document.querySelector(
        `[data-testid="panel-vista-${i}"] [data-testid="panel-nombre-${i}"]`,
      );
      if (!barra) throw new Error(`falta la barra del panel ${i}`);
      barra.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "mouse",
          button: 0,
        }),
      );
    },
    i,
  );
  await esperar(250);
  assert.equal(
    await ses.driver.executeScript(
      (i) => document.querySelector(`[data-testid="panel-vista-${i}"]`)?.dataset.activo,
      i,
    ),
    "si",
    `el panel ${i} no quedó activo`,
  );
}

async function atributoVisor(ses, i, atributo) {
  return ses.driver.executeScript(
    (selector, atributo) =>
      document.querySelector(selector)?.getAttribute(atributo) ?? null,
    visor(i),
    atributo,
  );
}

async function visibles(ses, i) {
  return ses.driver.executeScript((selector) => {
    const nodo = document.querySelector(selector);
    return nodo && typeof nodo.__openrvtMallasVisibles === "function"
      ? nodo.__openrvtMallasVisibles()
      : [];
  }, visor(i));
}

async function proyectar(ses, i, x, y, z = 0) {
  const punto = await ses.driver.executeScript(
    (selector, x, y, z) =>
      document.querySelector(selector)?.__openrvtMundoAPantalla(x, y, z) ?? null,
    visor(i),
    x,
    y,
    z,
  );
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z}) en el panel ${i}`);
  return punto;
}

async function impactoEn(ses, i, punto) {
  return ses.driver.executeScript(
    (selector, punto) =>
      document.querySelector(selector)?.__openrvtImpactoEn(punto.x, punto.y) ?? null,
    visor(i),
    punto,
  );
}

async function clicPantalla(ses, i, punto) {
  await ses.driver.executeScript(
    (selector, punto) => {
      const canvas = document.querySelector(selector)?.querySelector("canvas");
      if (!canvas) throw new Error("falta el canvas");
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
    visor(i),
    punto,
  );
  await esperar(500);
}

async function clicMundo(ses, i, x, y, z = 0) {
  await clicPantalla(ses, i, await proyectar(ses, i, x, y, z));
}

async function ajustarPanel(ses, i) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`${panel(i)} [data-testid="visor-zoom-ajustar"]`)),
    10_000,
  );
  await boton.click();
  await esperar(800);
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

async function esperarHasta(fn, ms, mensaje) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await fn()) return true;
    await esperar(250);
  }
  throw new Error(mensaje);
}

test("O070: dividir, muro en planta y 3D, selección compartida y separador al 70 %", async () => {
  const ses = await Sesion.abrir({
    prueba: "o070",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await cambiarPestana(ses, "Modelar");
    const itemPlanta = await ses.driver.wait(
      until.elementLocated(
        By.xpath('//button[@data-testid="vista-item"][normalize-space(.)="Planta Nivel 0"]'),
      ),
      15_000,
    );
    await itemPlanta.click();
    await esperar(900);
    const rect = await ses.driver.executeScript(() => {
      const nodo = document.querySelector('[data-testid="visor"]');
      const r = nodo.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    assert.ok(rect.width > 300 && rect.height > 200, `visor pequeño: ${JSON.stringify(rect)}`);

    // Dividir vertical desde la cinta de la pestaña Vista.
    await cambiarPestana(ses, "Vista");
    await activar(ses, "cmd-dividir-vertical");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="area-dividida"]')?.dataset.dividida,
      ),
      "si",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="area-dividida"]')?.dataset.orientacion,
      ),
      "vertical",
    );
    assert.ok((await atributoVisor(ses, 0, "data-vista")).startsWith("planta-"));
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelectorAll('[data-testid="panel-vista-0"] [data-testid="visor"]').length,
      ),
      1,
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelectorAll('[data-testid="panel-vista-1"] [data-testid="visor"]').length,
      ),
      1,
    );

    // 3D Perspectiva al panel derecho por el menú contextual del navegador.
    const item3d = await ses.driver.wait(
      until.elementLocated(
        By.xpath('//button[@data-testid="vista-item"][normalize-space(.)="3D Perspectiva"]'),
      ),
      15_000,
    );
    await ses.driver.executeScript(
      (el) =>
        el.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 260,
            clientY: 240,
          }),
        ),
      item3d,
    );
    await activar(ses, "vista-menu-otro-panel");
    await esperarHasta(
      async () => (await atributoVisor(ses, 1, "data-vista")) === "perspectiva",
      8_000,
      "la vista 3D Perspectiva no se abrió en el panel derecho",
    );
    await ajustarPanel(ses, 1);
    await captura(ses, "o070-01-dividir.png");

    // Muro de 4.00 m en la planta (panel 0).
    await activarPanel(ses, 0);
    await ajustarPanel(ses, 0);
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-altura", "3");
    await clicMundo(ses, 0, 0, 0);
    await clicMundo(ses, 0, 4, 0);
    await ses.driver.wait(
      async () => (await teselado(ses)).some((e) => e.clase === "IfcWall"),
      20_000,
      "no se creó el muro",
    );
    for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");
    const muro = (await teselado(ses)).find((e) => e.clase === "IfcWall");
    assert.ok(muro, "falta el IfcWall teselado");
    const largo = Math.hypot(muro.eje[2] - muro.eje[0], muro.eje[3] - muro.eje[1]);
    assert.ok(Math.abs(largo - 4) < 0.02, `el muro mide ${largo}, debía medir 4.00`);
    await esperarHasta(
      async () => (await visibles(ses, 0)).includes(muro.globalid),
      10_000,
      "el muro no aparece dibujado en la planta",
    );
    await ajustarPanel(ses, 1);
    await esperarHasta(
      async () => (await visibles(ses, 1)).includes(muro.globalid),
      10_000,
      "el muro no aparece dibujado en el 3D",
    );

    // Selección en el 3D: se resalta en la planta y aparece la ficha del elemento.
    let punto = null;
    for (const [x, z] of [[2, 1.5], [1.5, 1.5], [2.5, 1.5], [2, 2.5], [2, 0.5]]) {
      const candidato = await proyectar(ses, 1, x, 0, z);
      if ((await impactoEn(ses, 1, candidato)) === muro.globalid) {
        punto = candidato;
        break;
      }
    }
    assert.ok(punto, "no se encontró el muro bajo el cursor del 3D");
    await clicPantalla(ses, 1, punto);
    await esperarHasta(
      async () =>
        (await atributoVisor(ses, 0, "data-seleccion")) === muro.globalid &&
        (await atributoVisor(ses, 1, "data-seleccion")) === muro.globalid,
      10_000,
      "la selección del 3D no se resaltó en los dos paneles",
    );
    assert.match(
      (await textoDom(ses, '[data-testid="elemento-clase"]')) || "",
      /IfcWall/,
      "Propiedades debe mostrar el muro seleccionado",
    );
    await captura(ses, "o070-02-seleccion-compartida.png");

    // Separador al 70 % del ancho (la spec exige 20–80 %).
    await ses.driver.executeScript(() => {
      const area = document.querySelector('[data-testid="area-dividida"]');
      const sep = document.querySelector('[data-testid="separador-paneles"]');
      const r = area.getBoundingClientRect();
      sep.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "mouse",
          clientX: r.left + r.width * 0.5,
          clientY: r.top + r.height * 0.5,
        }),
      );
    });
    await esperarHasta(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="area-dividida"]')?.dataset.arrastrando,
        )) === "si",
      5_000,
      "el separador no empezó el arrastre",
    );
    await ses.driver.executeScript(() => {
      const area = document.querySelector('[data-testid="area-dividida"]');
      const r = area.getBoundingClientRect();
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          clientX: r.left + r.width * 0.7,
          clientY: r.top + r.height * 0.5,
        }),
      );
    });
    await esperar(300);
    await ses.driver.executeScript(() => {
      const area = document.querySelector('[data-testid="area-dividida"]');
      const r = area.getBoundingClientRect();
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          clientX: r.left + r.width * 0.7,
          clientY: r.top + r.height * 0.5,
        }),
      );
    });
    await esperarHasta(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="area-dividida"]')?.dataset.proporcion,
        )) === "0.7000",
      5_000,
      "el separador no quedó al 70 %",
    );
    await esperarHasta(async () => {
      const datos = await invocar(ses, "paneles.leer");
      return (
        datos?.dividida === true &&
        datos?.proporcion === 0.7 &&
        datos?.orientacion === "vertical"
      );
    }, 8_000, "el pset no guardó la división al 70 %");
    await captura(ses, "o070-03-separador-70.png");

    // Con el 3D activo, ocultar Muros: solo deja de verse en el 3D.
    await tecla(ses, "Escape");
    await activarPanel(ses, 1);
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="categoria-muros"]')),
      8_000,
      "el panel derecho no volvió a las propiedades de la vista",
    );
    await ses.driver.executeScript(() => {
      const casilla = document.querySelector('[data-testid="categoria-muros"]');
      if (!casilla) throw new Error("falta la casilla de Muros");
      casilla.click();
    });
    await esperarHasta(
      async () => !(await visibles(ses, 1)).includes(muro.globalid),
      8_000,
      "los muros siguen visibles en el 3D",
    );
    assert.ok(
      (await visibles(ses, 0)).includes(muro.globalid),
      "ocultar Muros en el 3D no debe ocultarlos en la planta",
    );
    await captura(ses, "o070-04-categorias-por-panel.png");

    // Al activar la planta, la casilla vuelve a estar marcada: es su propia vista.
    await activarPanel(ses, 0);
    await esperarHasta(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="categoria-muros"]')?.checked,
        )) === true,
      5_000,
      "la planta perdió su categoría de Muros",
    );

    // «Una vista» cierra el segundo panel y conserva la vista activa.
    await cambiarPestana(ses, "Vista");
    await activar(ses, "cmd-una-vista");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="area-dividida"]')?.dataset.dividida,
      ),
      "no",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelectorAll('[data-testid="visor"]').length,
      ),
      1,
    );
    assert.ok(
      (
        await ses.driver.executeScript(
          () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-vista"),
        )
      ).startsWith("planta-"),
    );
    await esperarHasta(async () => {
      const datos = await invocar(ses, "paneles.leer");
      return datos?.dividida === false;
    }, 8_000, "el pset no guardó «Una vista»");
    await captura(ses, "o070-05-una-vista.png");
  } finally {
    await ses.cerrar();
  }
});
