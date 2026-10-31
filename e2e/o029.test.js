// O029: herramienta «Nivel» en alzado con la app real.
// 1) Alzado Norte; 2) «Nivel», clic y teclear 1.50 + Enter; 3) aparece «Npt +1.50m»
// y la planta nueva; 4) Copiar el nivel +3.00 → 4.50; 5) Deshacer en un paso.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O029");

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

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(250);
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(400);
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
  await esperar(800);
}

async function irModulo(ses, id) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`nav[aria-label="Módulos"] [data-modulo="${id}"]`)),
    10_000,
  );
  await boton.click();
  await esperar(350);
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
  await esperar(150);
}

async function clicMundo(ses, x, y, z = 0) {
  const punto = await ses.driver.executeScript(
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

async function niveles(ses) {
  return invocar(ses, "modelo.niveles");
}

async function anotaciones(ses) {
  return ses.driver.executeScript(() =>
    document.querySelector('[data-testid="visor"]').__openrvtAlzadoAnotacionesPantalla(),
  );
}

async function esperarHasta(fn, ms, mensaje) {
  const fin = Date.now() + ms;
  for (;;) {
    const valor = await fn();
    if (valor) return valor;
    if (Date.now() > fin) throw new Error(mensaje);
    await esperar(300);
  }
}

test("O029: nivel intermedio dibujado en alzado, planta y copia +3.00", async () => {
  const ses = await Sesion.abrir({
    prueba: "o029",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o029-"));
    const ruta = path.join(carpeta, "o029.ifc");
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await activar(ses, "cmd-nuevo");
    await esperar(900);
    // Nivel 2 a 3.00 desde la lista: así el guardado escribe también los alzados.
    await irModulo(ses, "niveles");
    // El proyecto nuevo nace con «Nivel 0»; se renombra a «Nivel 1» para que el
    // intermedio entre Nivel 1 y Nivel 2 sea exactamente «Nivel 1.5».
    await ses.driver.executeScript(() => {
      const input = document.querySelector('[data-testid^="nivel-nombre-"]');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(input, "Nivel 1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.blur();
    });
    await esperar(700);
    await fijarValor(ses, "nivel-nuevo-nombre", "Nivel 2");
    await fijarValor(ses, "nivel-nuevo-elevacion", "3.00");
    await activar(ses, "nivel-agregar");
    await esperar(800);
    await irModulo(ses, "modelo");
    await activar(ses, "cmd-guardar");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o029.ifc",
      30_000,
      "no guardó el modelo O029",
    );

    // 1. Alzado Norte.
    await elegirVista(ses, "Alzado Norte");
    await cambiarPestana(ses, "Modelar");
    // 2. «Nivel» + clic + cota 1.50 + Enter.
    await activar(ses, "cmd-nivel");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="barra-herramienta"]')?.dataset.herramienta,
      ),
      "nivel",
      "la herramienta Nivel no se activó en el alzado",
    );
    await clicMundo(ses, 1, 0, 1.2);
    await ses.driver.actions({ async: true }).sendKeys("1.50").perform();
    await ses.driver.actions({ async: true }).sendKeys(Key.ENTER).perform();
    await esperar(1500);

    const creado = await esperarHasta(
      async () => (await niveles(ses)).find((n) => Math.abs(n.elevacion - 1.5) < 1e-6),
      15_000,
      "no se creó el nivel a +1.50",
    );
    assert.equal(creado.nombre, "Nivel 1.5");
    const orden = (await niveles(ses)).map((n) => n.elevacion);
    assert.deepEqual([...orden].sort((a, b) => a - b), [0, 1.5, 3]);

    // 3. «Npt +1.50m» medido en el alzado y planta nueva en el navegador.
    await activar(ses, "visor-ajustar");
    await esperar(700);
    const datos = await anotaciones(ses);
    const textos = datos.etiquetas.filter((e) => e.tipo === "nivel").map((e) => e.texto);
    assert.ok(
      textos.includes("Npt +1.50m"),
      `faltó «Npt +1.50m» en el alzado: ${textos.join(", ")}`,
    );
    const planta = await ses.driver.wait(
      until.elementLocated(
        By.xpath(
          '//button[@data-testid="vista-item"][normalize-space(.)="Planta Nivel 1.5"]',
        ),
      ),
      10_000,
      "no apareció la planta del nivel nuevo",
    );
    assert.ok(planta);
    await ses.captura(path.join(CAPTURAS, "o029-nivel-1-50.png"));

    // 4. Copiar/Desfasar +3.00 → 4.50 desde el módulo Niveles.
    await irModulo(ses, "niveles");
    await fijarValor(ses, "nivel-copiar-base", creado.globalid);
    await fijarValor(ses, "nivel-copiar-desfase", "3.00");
    await activar(ses, "nivel-copiar");
    const copia = await esperarHasta(
      async () => (await niveles(ses)).find((n) => Math.abs(n.elevacion - 4.5) < 1e-6),
      15_000,
      "Copiar +3.00 no creó el nivel a 4.50",
    );
    assert.ok(copia);
    await ses.captura(path.join(CAPTURAS, "o029-copiar-4-50.png"));

    // 5. Deshacer en un paso quita la copia; otro paso quita el 1.50 y su planta.
    await activar(ses, "cmd-deshacer");
    await ses.driver.wait(
      async () => !(await niveles(ses)).some((n) => Math.abs(n.elevacion - 4.5) < 1e-6),
      10_000,
      "Deshacer no quitó el nivel de 4.50",
    );
    assert.ok((await niveles(ses)).some((n) => Math.abs(n.elevacion - 1.5) < 1e-6));
    await activar(ses, "cmd-deshacer");
    await ses.driver.wait(
      async () => !(await niveles(ses)).some((n) => Math.abs(n.elevacion - 1.5) < 1e-6),
      10_000,
      "el segundo Deshacer no quitó el nivel de 1.50",
    );
    const vistas = await invocar(ses, "vistas.leer");
    assert.equal(
      vistas.some((v) => v.nombre === "Planta Nivel 1.5"),
      false,
      "la planta del nivel deshecho sigue guardada",
    );
  } finally {
    await ses.cerrar();
  }
});
