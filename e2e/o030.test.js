// O030: la anotación en modo «A escala» mide mm de papel por la escala de la
// vista (0.25 m de modelo por 2.5 mm a 1:100) y crece con el zoom; en
// «Pantalla» conserva su alto en píxeles. Se mide con la app real de Tauri.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O030");
fs.mkdirSync(PROGRESO, { recursive: true });

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
  await esperar(200);
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

async function clicMundo(ses, x, y) {
  const punto = await ses.driver.executeScript(
    (x, y) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, 0),
    x,
    y,
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
  await esperar(320);
}

async function tecla(ses, key, code) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
    },
    key,
    code,
  );
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
  await esperar(150);
}

async function altoNivel(ses, texto) {
  const dato = await ses.driver.executeScript(
    (texto) => {
      const datos = document.querySelector('[data-testid="visor"]').__openrvtAlzadoAnotacionesPantalla();
      const caja = datos?.etiquetas.find((e) => e.tipo === "nivel" && e.texto === texto);
      return caja ? caja.y1 - caja.y0 : datos?.etiquetas.map((e) => `${e.tipo}:${e.texto}`).join("|") ?? "sin datos";
    },
    texto,
  );
  assert.ok(typeof dato === "number" && dato > 0, `no se midió ${texto}: ${dato}`);
  return dato;
}

test("O030: anotación a escala crece con el zoom y en pantalla no", async () => {
  const ses = await Sesion.abrir({
    prueba: "o030",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o030-"));
  const ruta = path.join(carpeta, "o030.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await cambiarPestana(ses, "Modelar");
    for (let i = 0; i < 4; i += 1) await activar(ses, "cmd-nivel");
    await activar(ses, "cmd-muro");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 3, 0);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await esperar(500);

    const niveles = (await invocar(ses, "modelo.niveles")).sort(
      (a, b) => a.elevacion - b.elevacion,
    );
    const elevaciones = [0, 0.5, 1.5, 2, 2.2];
    for (let i = 0; i < 5; i += 1) {
      await invocar(ses, "niveles.editar", {
        globalid: niveles[i].globalid,
        nombre: niveles[i].nombre,
        elevacion: elevaciones[i],
      });
    }

    // Guardar y reabrir para que el visor reciba las elevaciones editadas.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o030.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo");

    await elegirVista(ses, "Alzado Norte");
    await esperar(900);
    await fijarValor(ses, "vista-escala", "100");
    await esperar(500);
    await activar(ses, "visor-ajustar");
    await esperar(600);
    // Encuadrar la anotación (ejes, cotas y cabezas) como en la captura de O025.
    const marco = await ses.driver.executeScript(() => {
      const visor = document.querySelector('[data-testid="visor"]');
      const x = JSON.parse(visor.dataset.nivelesX ?? "{}");
      const zs = JSON.parse(visor.dataset.nivelesZ ?? "[]");
      const zAlto = x.globoZ + x.radioGlobo;
      const zBajo = Math.min(...zs) - 0.1;
      const rect = visor.getBoundingClientRect();
      const aspecto = Math.max(rect.width, 1) / Math.max(rect.height, 1);
      const alto = Math.max(zAlto - zBajo, (x.anotacionFin - x.desde) / aspecto) * 1.08;
      visor.__openrvtEnfocarAlzado(
        (x.desde + x.anotacionFin) / 2,
        (zAlto + zBajo) / 2,
        alto,
      );
    });
    void marco;
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="ayuda-navegacion-cerrar"]')?.click();
    });
    await esperar(700);

    // Por omisión el alzado va «A escala»: 2.5 mm a 1:100 = 0.25 m de modelo.
    const aEscala = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor-a-escala"]')?.getAttribute("aria-pressed"),
    );
    assert.equal(aEscala, "true", "el alzado no arrancó en «A escala»");

    const h1 = await altoNivel(ses, "Npt +2.20m");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="visor"]').__openrvtZoom(0.5);
    });
    await esperar(500);
    const h2 = await altoNivel(ses, "Npt +2.20m");
    // El zoom ×2 duplica el alto en píxeles (tolerancia del 3 %).
    assert.ok(Math.abs(h2 / h1 - 2) < 0.06, `a escala h1=${h1} h2=${h2}`);
    await ses.captura(path.join(PROGRESO, "alzado-a-escala.png"));

    await activar(ses, "visor-a-escala");
    await esperar(400);
    const p1 = await altoNivel(ses, "Npt +2.20m");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="visor"]').__openrvtZoom(0.5);
    });
    await esperar(500);
    const p2 = await altoNivel(ses, "Npt +2.20m");
    assert.ok(Math.abs(p2 - p1) <= 1, `en pantalla p1=${p1} p2=${p2}`);
    await ses.captura(path.join(PROGRESO, "alzado-pantalla.png"));

    // 100 %: 1 mm de papel = 1 mm en pantalla (96 px/pulgada), en «A escala».
    await activar(ses, "visor-a-escala");
    await esperar(300);
    await activar(ses, "visor-zoom-100");
    await esperar(600);
    const h100 = await altoNivel(ses, "Npt +2.20m");
    // 2.5 mm de papel a 96 px/pulgada = 9.45 px.
    assert.ok(Math.abs(h100 - 9.45) < 1.5, `100 %: alto ${h100} px`);
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
