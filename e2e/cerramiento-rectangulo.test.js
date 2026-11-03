"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O043");
const DIMENSION = { ancho: 1700, alto: 1000 };
const PERALTE = 0.2; // CE-1 Cerramiento 15×20: 20 cm de peralte.

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
  await esperar(150);
}

/** Campo controlado del panel: escribe, confirma con Enter y sale del campo. */
async function fijarCampoPanel(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      el.blur();
    },
    testid,
    valor,
  );
  await esperar(350);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
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

async function moverMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: -1,
          buttons: 0,
          pointerId: 1,
          pointerType: "mouse",
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(250);
  return punto;
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
  await esperar(350);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicEn(ses, await proyectar(ses, x, y, z));
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

async function atributoVisor(ses, nombre) {
  return ses.driver.executeScript(
    (nombre) => document.querySelector('[data-testid="visor"]')?.getAttribute(nombre),
    nombre,
  );
}

async function esperarMurosVisibles(ses, gidsMuros, cuantos) {
  await ses.driver.wait(
    async () => {
      const visibles = new Set(((await atributoVisor(ses, "data-mallas-visibles")) ?? "").split(","));
      return gidsMuros.filter((gid) => visibles.has(gid)).length === cuantos;
    },
    15_000,
    `la planta no mostró ${cuantos} muros`,
  );
}

function distanciaASegmento(x, y, muro) {
  const dx = muro.x2 - muro.x1;
  const dy = muro.y2 - muro.y1;
  const largo2 = dx * dx + dy * dy;
  const t =
    largo2 <= 1e-12
      ? 0
      : Math.max(0, Math.min(1, ((x - muro.x1) * dx + (y - muro.y1) * dy) / largo2));
  return Math.hypot(x - (muro.x1 + t * dx), y - (muro.y1 + t * dy));
}

/** GlobalId del muro más cercano al clic, con la misma regla de la interfaz. */
function gidDelMuroEn(referencias, x, y) {
  let mejor = null;
  let distancia = Infinity;
  for (const muro of referencias.muros) {
    const d = distanciaASegmento(x, y, muro);
    if (d < distancia) {
      distancia = d;
      mejor = muro;
    }
  }
  assert.ok(mejor && distancia < 0.35, `no hay muro bajo (${x}, ${y})`);
  return mejor.globalid;
}

function cerramientosDe(elementos) {
  return elementos.filter((e) => e.estructura?.alias === "cerramiento");
}

async function esperarSeleccion(ses, aliasEsperado) {
  return ses.driver.wait(
    async () => {
      const actual = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
      );
      if (!actual) return false;
      const props = await invocar(ses, "modelo.propiedades", { globalid: actual });
      return props.alias === aliasEsperado ? actual : false;
    },
    15_000,
    `Tab no seleccionó un ${aliasEsperado}`,
  );
}

async function tabHasta(ses, aliasEsperado) {
  const vistos = [];
  for (let i = 0; i < 8; i += 1) {
    await tecla(ses, "Tab", "Tab");
    const gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    if (!gid) {
      vistos.push("(nada)");
      continue;
    }
    const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
    vistos.push(props.alias ?? props.clase);
    if (props.alias === aliasEsperado) return gid;
  }
  assert.fail(`Tab no llegó a ${aliasEsperado}; pasó por ${vistos.join(" → ")}`);
}

async function alturaMuro(ses, gid) {
  const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
  return Number(props.psets?.OPENRVT_Muro?.Altura ?? NaN);
}

async function esperarAltura(ses, gid, esperado) {
  await ses.driver.wait(
    async () => Math.abs((await alturaMuro(ses, gid)) - esperado) < 1e-6,
    15_000,
    `el muro ${gid} no llegó a ${esperado} m`,
  );
}


// Reporte del dueño (3-nov, 0.5.26): rectángulo de 4 muros con castillos en las esquinas; tres cerramientos salen y
// el del muro izquierdo no se puede dibujar.
test("Rectángulo de 4 muros con castillos: un cerramiento por muro, en cualquier orden", async () => {
  const ses = await Sesion.abrir({ prueba: "cerramiento-rectangulo", tamano: DIMENSION, lateralExpandido: true, compositar: true });
  try {
    await nuevoModelo(ses);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    for (const [x1, y1, x2, y2] of [[0, 0, 7, 0], [7, 0, 7, 5], [7, 5, 0, 5], [0, 5, 0, 0]]) await dibujarMuro(ses, x1, y1, x2, y2);
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await activar(ses, "cmd-castillos-automaticos");
    await ses.porTestid("dialogo-castillos");
    await activar(ses, "castillos-aceptar");
    await esperar(1500);
    const niveles0 = await invocar(ses, "modelo.niveles");
    for (const [nombre, elev] of [["N 2.20", 2.2], ["N 3.00", 3.0], ["N 3.20", 3.2], ["N 3.60", 3.6]]) {
      await crearNivel(ses, nombre, elev);
    }
    const niveles = await invocar(ses, "modelo.niveles");
    const tope = niveles.find((n) => n.nombre === "N 3.60");
    const muros = (await teselado(ses)).filter((e) => e.clase === "IfcWall").map((e) => e.globalid);
    for (const gid of muros) {
      await invocar(ses, "restricciones.editar", { globalid: gid, nivel_tope: tope.globalid, desfase_tope: 0 });
    }
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta N 2.20");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    void niveles0;
    // O045: cada cerramiento se dibuja con inicio y fin sobre su muro.
    const cuenta = [];
    const avisos = [];
    for (const [x1, y1, x2, y2] of [
      [0, 5, 7, 5],
      [7, 0, 7, 5],
      [0, 0, 7, 0],
      [0, 0, 0, 5],
    ]) {
      await activar(ses, "cmd-cerramiento");
      await clicMundo(ses, x1, y1);
      await clicMundo(ses, x2, y2);
      await esperar(600);
      cuenta.push((await teselado(ses)).filter((e) => e.estructura?.alias === "cerramiento").length);
      avisos.push((await textoDom(ses, `[data-testid="estado-aviso"]`)) + " / " + (await textoDom(ses, `[data-testid="estado-error"]`)));
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
    }
    await ses.captura(require("node:path").join(require("node:os").tmpdir(), "cer-rect.png"));
    assert.deepEqual(cuenta, [1, 2, 3, 4], `cerramientos tras cada clic: ${cuenta} · avisos: ${JSON.stringify(avisos)}`);
  } finally {
    await ses.cerrar();
  }
});
