// O009 con la app Tauri real: rectángulo con puerta, claves PP en tres partidas del
// tipo, vista Cantidades, exportación del contrato y capturas de la entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const EJEMPLOS = path.join(RAIZ, "docs", "ejemplos");
const SALIDA = path.join(EJEMPLOS, "rectangulo.openrvt-medicion.json");

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
  await esperar(300);
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

test("O009: partidas del tipo, cantidades y exportación a PP", async () => {
  fs.mkdirSync(EJEMPLOS, { recursive: true });
  try {
    fs.unlinkSync(SALIDA);
  } catch {
    /* la primera vez no existe */
  }
  const ses = await Sesion.abrir({
    prueba: "o009-medicion",
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

    // 1. Rectángulo de 7.00 × 5.00 con un muro multicapa y una puerta.
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    for (const [x, y] of [[0, 0], [7, 0], [7, 5], [0, 5], [0, 0]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await activar(ses, "cmd-puerta");
    await clicMundo(ses, 3.5, 0);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");

    const conPuerta = await invocar(ses, "cantidades.estructura", {});
    assert.equal(conPuerta.elementos.filter((e) => e.clase === "IfcWall").length, 4);
    const muros = conPuerta.elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(
      Math.round(muros.reduce((suma, m) => suma + m.area_neta_m2, 0) * 1000) / 1000,
      60.51,
    );

    // 2. Claves PP en tres partidas del tipo usado por los muros.
    await activar(ses, "cmd-tipos");
    await ses.porTestid("editor-tipos");
    await (await ses.porTestid("tipo-Block 15 aplanado-yeso")).click();
    await esperar(250);
    await activar(ses, "pestana-medicion");
    assert.equal(await textoDom(ses, '[data-testid="partida-unidad-0"]'), "m2");
    await fijarValor(ses, "partida-clave-0", "MUR-B15");
    await fijarValor(ses, "partida-clave-3", "APL-EXT");
    await fijarValor(ses, "partida-clave-4", "YESO-INT");
    await fijarValor(ses, "partida-nombre-3", "Aplanado exterior");
    await fijarValor(ses, "partida-nombre-4", "Yeso interior");
    await ses.captura(path.join(CAPTURAS, "o009_medicion_tipo.png"));
    const tipoPng = dimensionesPng(path.join(CAPTURAS, "o009_medicion_tipo.png"));
    assert.ok(tipoPng.ancho > 1000 && tipoPng.alto > 600);
    await activar(ses, "tipos-aplicar");
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="editor-tipos"]'))).length === 0,
      10_000,
      "el editor de tipos no se cerró",
    );

    // Persistencia de las partidas y del total exacto del núcleo.
    const tipos = await invocar(ses, "tipos.listar", { clase: "IfcWallType" });
    const tipo = tipos.find((t) => t.nombre === "Block 15 aplanado-yeso");
    const detalle = await invocar(ses, "tipos.obtener", { globalid: tipo.globalid });
    assert.deepEqual(
      detalle.partidas.slice(0, 5).filter((p) => p.ClavePP).map((p) => p.ClavePP),
      ["MUR-B15", "APL-EXT", "YESO-INT"],
    );

    // 3. Vista Cantidades: despliega la partida del núcleo.
    await (await ses.porTestid("vista-cantidades-item")).click();
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="vista-cantidades"]')),
      10_000,
    );
    const filaNucleo = await ses.driver.wait(async () => {
      const indice = await ses.driver.executeScript(() => {
        const filas = Array.from(
          document.querySelectorAll('[data-testid^="cantidades-partida-"]'),
        );
        const fila = filas.find((el) => el.innerText.includes("MUR-B15"));
        return fila ? fila.getAttribute("data-testid") : null;
      });
      return indice;
    }, 15_000, "no apareció la partida MUR-B15");
    const totalNucleo = await (await ses.porTestid(filaNucleo)).getText();
    assert.match(totalNucleo, /MUR-B15/);
    assert.match(totalNucleo, /60\.51/);
    const indiceNucleo = filaNucleo.replace("cantidades-partida-", "");
    await ses.driver.executeScript((testid) => {
      document.querySelector(`[data-testid="${testid}"]`).click();
    }, filaNucleo);
    await esperar(300);
    const renglon = await ses.driver.wait(
      until.elementLocated(
        By.css(`[data-testid="cantidades-renglon-${indiceNucleo}-0"]`),
      ),
      10_000,
    );
    assert.match(await renglon.getText(), /Nivel 0/);
    // Clic en el renglón: selecciona el elemento del modelo.
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid^="cantidades-renglon-"]').click();
    });
    await esperar(400);
    await ses.captura(path.join(CAPTURAS, "o009_cantidades.png"));
    const cantidadesPng = dimensionesPng(path.join(CAPTURAS, "o009_cantidades.png"));
    assert.ok(cantidadesPng.ancho > 1000 && cantidadesPng.alto > 600);

    // 4. Exportar y 5. revisar el JSON del contrato con PP.
    await ses.driver.executeScript((ruta) => {
      window.__PP_DIALOGO_PRUEBAS__ = async () => ruta;
    }, SALIDA);
    await activar(ses, "cantidades-exportar");
    const fin = Date.now() + 15_000;
    while (!fs.existsSync(SALIDA) && Date.now() < fin) {
      await esperar(100);
    }
    assert.ok(fs.existsSync(SALIDA), "no se escribió el archivo de medición");
    const datos = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
    assert.equal(datos.formato, "openrvt-medicion");
    assert.equal(datos.version, 1);
    assert.equal(datos.proyecto, "Modelo sin título");
    assert.equal(datos.partidas.length, 7);
    const claves = datos.partidas.map((p) => p.clave).filter(Boolean).sort();
    assert.deepEqual(claves, ["APL-EXT", "MUR-B15", "YESO-INT"]);
    for (const partida of datos.partidas) {
      const suma = partida.renglones.reduce((total, r) => total + r.resultado, 0);
      assert.ok(Math.abs(partida.total - suma) < 1e-9, `total ${partida.nombre}`);
      for (const renglon of partida.renglones) {
        assert.equal(typeof renglon.resultado, "number");
        assert.equal(typeof renglon.globalid, "string");
      }
    }
    const porClave = Object.fromEntries(datos.partidas.map((p) => [p.clave, p]));
    assert.ok(Math.abs(porClave["MUR-B15"].total - 60.51) < 1e-6);
    assert.ok(Math.abs(porClave["APL-EXT"].total - 62.226) < 1e-6);
    assert.ok(Math.abs(porClave["YESO-INT"].total - 58.846) < 1e-6);
  } finally {
    await ses.cerrar();
  }
});
