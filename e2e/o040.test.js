// O040: cerramientos ligados a la corona del muro. Modelo de la spec: 4 muros Block 15
// a eje (4 × 3), castillos automáticos y cerramiento en los 4 muros. Se comprueba que
// seleccionar no da error, que el tope del cerramiento es la corona del muro y se
// capturan planta (proyección superior discontinua) y alzado.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O040");

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

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(900);
}

test("O040: cerramientos en la corona del muro, planta y alzado", async () => {
  const ses = await Sesion.abrir({
    prueba: "o040",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o040-"));
    const ruta = path.join(carpeta, "o040.ifc");
    await ses.driver.executeScript((ruta) => {
      window.__PP_DIALOGO_PRUEBAS__ = async (p) => (p.tipo === "abrir-ifc" ? ruta : null);
    }, ruta);
    await invocar(ses, "proyecto.nuevo", { nombre: "O040 cerramientos" });
    const nivel = (await invocar(ses, "modelo.niveles"))[0].globalid;
    const muros = [];
    for (const [x1, y1, x2, y2] of [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]]) {
      muros.push(
        (await invocar(ses, "muros.crear", {
          tipo: "Block 15", nivel, x1, y1, x2, y2, linea_ubicacion: "eje_nucleo",
        })).creados[0],
      );
    }
    await invocar(ses, "castillos.automaticos", { muros, separacion_max: 3.0 });
    const cerramientos = [];
    for (const muro of muros) {
      cerramientos.push(
        (await invocar(ses, "cerramientos.crear_en_muro", { tipo: "CE-1 Cerramiento 15×20", muro }))
          .creados[0],
      );
    }
    await invocar(ses, "proyecto.guardar", { ruta });
    const abrir = await ses.porTestid("cmd-abrir");
    await abrir.click();
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="estado-modelo"]')?.textContent?.trim(),
        )) === "o040.ifc",
      30_000,
      "no abrió el modelo",
    );

    // Tope del cerramiento = corona nominal del muro.
    const muro = await invocar(ses, "modelo.propiedades", { globalid: muros[0] });
    const cer = await invocar(ses, "modelo.propiedades", { globalid: cerramientos[0] });
    const corona = Number(muro.psets.OPENRVT_Muro?.Altura ?? 2.6);
    const r = cer.restricciones ?? {};
    assert.ok(r, "el cerramiento no trae restricciones");
    const teselado = await invocar(ses, "geometria.teselar", { globalids: [cerramientos[0]] });
    const v = teselado.elementos[0];
    assert.ok(v, "no se teseló el cerramiento");

    await elegirVista(ses, "Planta Nivel 0");
    const error = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="estado-error"]')?.textContent ?? "",
    );
    assert.equal(error, "", `error en la barra de estado: ${error}`);
    await ses.captura(path.join(CAPTURAS, "o040-planta.png"));
    // Los 4 muros están en la planta: exterior de 4 vértices y un hueco (antes el
    // muro x = 0 no se teselaba y el contorno quedaba abierto en forma de C).
    const contorno = await ses.driver.executeScript(() => window.__OPENRVT_PLANTA_MUROS__);
    assert.equal(contorno.length, 1);
    assert.equal(contorno[0].exterior.length - 1, 4, JSON.stringify(contorno));
    assert.equal(contorno[0].huecos.length, 1, JSON.stringify(contorno));
    await elegirVista(ses, "Alzado Sur");
    await ses.captura(path.join(CAPTURAS, "o040-alzado.png"));
    await elegirVista(ses, "3D Isométrica");
    await ses.captura(path.join(CAPTURAS, "o040-3d.png"));
    assert.ok(Math.abs(Number(r.DesfaseBase) - corona) < 1e-6, `tope ${r.DesfaseBase} != corona ${corona}`);
  } finally {
    await ses.cerrar();
  }
});
