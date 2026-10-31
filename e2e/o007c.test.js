// O007c con la app Tauri real: muros en rectángulo, castillos automáticos,
// cerramientos ligados, retícula 3×3 con columnas y zapatas, trabes y contratrabes,
// movimiento de un eje y capturas de la entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const PROGRESO = path.join(RAIZ, "docs", "progreso");

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
  await esperar(250);
}

async function crearNivelLista(ses) {
  const niveles = await invocar(ses, "modelo.niveles");
  const elevacion =
    niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) + 3 : 0;
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(300);
  await fijarValor(ses, "nivel-nuevo-nombre", `Nivel ${niveles.length}`);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(700);
  const modelo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="modelo"]')),
    10_000,
  );
  await modelo.click();
  await esperar(300);
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

async function zoomMundo(ses, x, y, pasos = 3) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto, pasos) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
      for (let i = 0; i < pasos; i += 1) {
        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -120,
            deltaMode: 0,
            clientX: punto.x,
            clientY: punto.y,
          }),
        );
      }
    },
    punto,
    pasos,
  );
  await esperar(700);
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

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
  );
  await boton.click();
  await esperar(600);
}

async function estructura(ses) {
  const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
  return teselado.elementos.filter((e) => e.estructura);
}

test("O007c: castillos en muros, cerramientos, retícula con zapatas y trabes", async () => {
  const ses = await Sesion.abrir({
    prueba: "o007c-interacciones",
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

    // 1. Cuatro muros en rectángulo de 7.00 × 5.00.
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-muro");
    for (const [x, y] of [[0, 0], [7, 0], [7, 5], [0, 5], [0, 0]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    const muros = (await invocar(ses, "geometria.teselar", { globalids: null })).elementos
      .filter((e) => e.clase === "IfcWall");
    assert.equal(muros.length, 4);
    assert.deepEqual(
      muros.map((m) => Math.round(Math.hypot(
        m.eje[2] - m.eje[0],
        m.eje[3] - m.eje[1],
      ) * 100) / 100).sort((a, b) => a - b),
      [5, 5, 7, 7],
    );

    // 2. Castillos automáticos con la separación de omisión (3.00 m).
    await activar(ses, "cmd-castillos-automaticos");
    await ses.porTestid("dialogo-castillos");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="castillos-separacion"]')?.value,
      ),
      "3.00",
    );
    await activar(ses, "castillos-aceptar");
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="dialogo-castillos"]')))
          .length === 0,
      10_000,
      "el diálogo de castillos no se cerró",
    );
    let elementos = await estructura(ses);
    assert.equal(elementos.filter((e) => e.estructura.alias === "castillo").length, 10);

    // 3. Un cerramiento CE-1 ligado a cada muro (clic sobre el muro).
    await activar(ses, "cmd-cerramiento");
    for (const [x, y] of [[3.5, 0], [7, 2.5], [3.5, 5], [0, 2.5]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape", "Escape");
    elementos = await estructura(ses);
    const cerramientos = elementos.filter((e) => e.estructura.alias === "cerramiento");
    assert.equal(cerramientos.length, 4);
    assert.ok(cerramientos.every((c) => Math.abs(c.estructura.datos.Longitud - 7) < 1e-6 ||
      Math.abs(c.estructura.datos.Longitud - 5) < 1e-6));
    // Los castillos bajaron al lecho bajo del cerramiento (2.40 m).
    assert.ok(
      elementos
        .filter((e) => e.estructura.alias === "castillo")
        .every((c) => Math.abs(c.estructura.datos.Altura - 2.4) < 1e-6),
    );

    // Captura de la planta 1:50 con castillos, acabados y cerramientos.
    await cambiarPestana(ses, "Vista");
    await fijarValor(ses, "vista-escala", "50");
    await esperar(500);
    await elegirVista(ses, "Planta Nivel 0");
    await ses.captura(path.join(CAPTURAS, "o007c_castillos_auto.png"));
    // Acercamiento a la esquina superior derecha para revisar castillo y acabados.
    await zoomMundo(ses, 7, 5, 3);
    await ses.captura(path.join(CAPTURAS, "o007c_esquina_castillo.png"));
    await elegirVista(ses, "Planta Nivel 0");
    for (const archivo of ["o007c_castillos_auto.png", "o007c_esquina_castillo.png"]) {
      const medidas = dimensionesPng(path.join(CAPTURAS, archivo));
      assert.ok(medidas.ancho > 1000 && medidas.alto > 600);
    }

    // 4. Nivel superior y retícula 3 × 3; columnas en todos los cruces con zapata.
    await cambiarPestana(ses, "Modelar");
    await crearNivelLista(ses);
    await esperar(500);
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "cmd-ejes-separaciones");
    await ses.porTestid("dialogo-ejes-separaciones");
    await fijarValor(ses, "eje-sep-vertical-separaciones", "2, 2");
    await fijarValor(ses, "eje-sep-horizontal-separaciones", "2, 2");
    await activar(ses, "eje-sep-aceptar");
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]')))
          .length === 0,
      10_000,
      "el diálogo de ejes no se cerró",
    );
    await esperar(500);
    const ejes = await invocar(ses, "ejes.listar", {});
    assert.equal(ejes.length, 6);

    await activar(ses, "cmd-columna");
    await activar(ses, "columna-con-zapata");
    await activar(ses, "columna-en-cruces");
    await ses.driver.wait(async () => {
      const actuales = await estructura(ses);
      return (
        actuales.filter((e) => e.estructura.alias === "columna").length === 9 &&
        actuales.filter(
          (e) => e.clase === "IfcFooting" && e.estructura.alias === "zapata",
        ).length === 9
      );
    }, 20_000, "no aparecieron las 9 columnas con sus zapatas");
    elementos = await estructura(ses);

    // 5. Contratrabes entre zapatas y trabes entre columnas.
    await activar(ses, "cmd-unir-zapatas");
    await ses.driver.wait(async () => {
      const actuales = await estructura(ses);
      return actuales.filter((e) => e.estructura.alias === "contratrabe").length === 12;
    }, 20_000, "no aparecieron los 12 contratrabes");
    await activar(ses, "cmd-unir-trabes");
    await ses.driver.wait(async () => {
      const actuales = await estructura(ses);
      return actuales.filter((e) => e.estructura.alias === "trabe").length === 12;
    }, 20_000, "no aparecieron las 12 trabes");
    elementos = await estructura(ses);

    // 6. Mover el eje B (y = 2) medio metro: sus columnas y zapatas lo siguen.
    const ejeB = ejes.find((e) => e.etiqueta === "B");
    await invocar(ses, "ejes.mover", {
      globalid: ejeB.globalid,
      desplazamiento: 0.5,
    });
    const traslado = await invocar(ses, "geometria.teselar", { globalids: null });
    const columnasB = traslado.elementos.filter(
      (e) =>
        e.estructura?.alias === "columna" &&
        Math.abs(e.estructura.datos.Y - 1.5) < 1e-6,
    );
    assert.equal(columnasB.length, 3);
    const zapatasB = traslado.elementos.filter(
      (e) =>
        e.clase === "IfcFooting" &&
        e.estructura?.alias === "zapata" &&
        Math.abs(e.estructura.datos.Y - 1.5) < 1e-6,
    );
    assert.equal(zapatasB.length, 3);

    // Captura 3D con columnas, zapatas, trabes y contratrabes.
    await elegirVista(ses, "3D Isométrica");
    await esperar(1000);
    await ses.captura(path.join(CAPTURAS, "o007c_reticula_columnas.png"));
    const iso = dimensionesPng(path.join(CAPTURAS, "o007c_reticula_columnas.png"));
    assert.ok(iso.ancho > 1000 && iso.alto > 600);

    // Cuantificación por prioridad (no hay panel todavía: se guarda la salida).
    const cantidades = await invocar(ses, "cantidades.estructura", {});
    assert.ok(cantidades.total.volumen_neto_m3 > 0);
    assert.ok(Math.abs(cantidades.total.volumen_neto_m3 - cantidades.union_m3) < 1e-6);
    fs.mkdirSync(PROGRESO, { recursive: true });
    fs.writeFileSync(
      path.join(PROGRESO, "o007c_cantidades.json"),
      JSON.stringify(cantidades, null, 2),
    );
  } finally {
    await ses.cerrar();
  }
});
