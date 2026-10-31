// O019 con la app real: cuatro muros ingleteados sobre una losa, vista 3D
// Perspectiva. Cuenta las aristas verticales únicas dibujadas: 8 esquinas de muro
// (exterior + interior en cada una de las 4 esquinas) y 4 cantos de la losa = 12.
// Antes del arreglo las esquinas de los muros se suprimían y sólo quedaban 4.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const RESULTADOS = path.join(RAIZ, "docs", "progreso", "O019");
fs.mkdirSync(RESULTADOS, { recursive: true });

const DIMENSION = { ancho: 1600, alto: 900 };

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

async function atributoVisor(ses, nombre) {
  return (await ses.porTestid("visor")).getAttribute(`data-${nombre}`);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(220);
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

async function tecla(ses, key) {
  await ses.driver.executeScript(
    (key) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }),
      );
    },
    key,
  );
  await esperar(150);
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
  await esperar(280);
}

async function dobleClic(ses) {
  await ses.driver.executeScript(() => {
    const canvas = document.querySelector('[data-testid="visor"] canvas');
    if (!canvas) throw new Error("no hay canvas");
    canvas.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  await esperar(200);
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
  await esperar(500);
}

async function ajustar(ses) {
  await ses.porTestid("visor-ajustar").then((b) => b.click());
  await esperar(500);
}

async function esperarMallas(ses, minimo) {
  await ses.driver.wait(async () => {
    const texto = await atributoVisor(ses, "mallas");
    return Number(texto ?? 0) >= minimo;
  }, 30_000, `no se dibujaron ${minimo} mallas`);
}

test("O019: las esquinas verticales de muros y losa se dibujan en 3D", async () => {
  const ses = await Sesion.abrir({
    prueba: "o019",
    tamano: DIMENSION,
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

    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await ajustar(ses);

    // Losa de 8 × 6 m que sobresale de los muros: sus 4 esquinas quedan libres.
    await activar(ses, "cmd-losa");
    for (const [x, y] of [[-1, -1], [7, -1], [7, 5], [-1, 5]]) {
      await clicMundo(ses, x, y);
    }
    await dobleClic(ses);
    await esperarMallas(ses, 1);

    // Caja cerrada de 4 muros de 5 × 4 m sobre la losa.
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    await fijarValor(ses, "muro-altura", "2.6");
    for (const [x, y] of [[0, 0], [5, 0], [5, 4], [0, 4], [0, 0]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    await esperarMallas(ses, 5);

    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    assert.equal(teselado.elementos.filter((e) => e.clase === "IfcWall").length, 4);
    assert.equal(teselado.elementos.filter((e) => e.clase === "IfcSlab").length, 1);

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Perspectiva");
    await ajustar(ses);
    await esperar(900);

    // Cálculo a mano: cada muro es un prisma con 4 esquinas verticales (16 en la
    // caja) y la losa que sobresale aporta sus 4 cantos. Antes del arreglo las
    // esquinas de los muros se suprimían y sólo quedaban los 4 cantos de la losa.
    const detalle = await ses.driver.executeScript(() => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (typeof visor.__openrvtAristasVerticales !== "function") return [];
      return visor.__openrvtAristasVerticales(true);
    });
    // Cada entrada es "x1,y1,zMin,zMax" redondeado a 1e-4 m.
    const verticales = detalle.map((clave) => {
      const [x, y, z0, z1] = clave.split(",").map(Number);
      return { x, y, z0, z1 };
    });
    // Spec O019: al menos 12 segmentos verticales (esquinas de muros + cantos de losa).
    assert.ok(
      verticales.length >= 12,
      `se dibujaron ${verticales.length} aristas verticales; se esperaban al menos 12`,
    );
    // Los 4 muros de la caja aportan sus esquinas: cada muro es un prisma con 4
    // verticales; la unión de una caja cerrada tiene al menos 8 esquinas distintas.
    const deMuro = verticales.filter((v) => Math.abs(v.z0) < 1e-3);
    assert.ok(
      deMuro.length >= 8,
      `sólo ${deMuro.length} verticales de muro; antes del arreglo eran 0`,
    );
    // La losa sobresale de los muros y su canto va de z=-0.12 a z=0: exactamente
    // una vertical en cada esquina dibujada del contorno.
    const deLosa = verticales.filter((v) => v.z1 <= 1e-3);
    const esquinasLosa = deLosa
      .map((v) => `${v.x.toFixed(4)},${v.y.toFixed(4)}`)
      .sort();
    assert.deepEqual(esquinasLosa, [
      "-1.0000,-1.0000",
      "-1.0000,5.0000",
      "7.0000,-1.0000",
      "7.0000,5.0000",
    ]);

    const captura = path.join(RESULTADOS, "o019-perspectiva.png");
    await ses.captura(captura);
    const medidas = dimensionesPng(captura);
    assert.ok(medidas.ancho > 1000 && medidas.alto > 600);
  } finally {
    await ses.cerrar();
  }
});
