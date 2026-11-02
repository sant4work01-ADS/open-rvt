// O032b: en planta las esquinas de muros a paño cierran sin sobresalir (reporte 1-nov).
// Antes: O032: reproduce la captura. Retícula 4×3 con muros de 0.15 a eje y losa a eje:
// el contorno queda de 0 a 4 y falta medio espesor (0.075) en cada extremo.
// Con «Borde a: paño exterior» la losa llega a −0.075..4.075; al cambiar un muro
// a «paño interior» su paño exterior pasa al eje x=4 y la losa lo sigue.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O032");

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
        return null;
      };
    },
    rutas,
  );
}

async function activar(ses, testid) {
  const boton = await ses.porTestid(testid);
  await boton.click();
  await esperar(400);
}

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
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
  await esperar(700);
}

async function huella(ses, gid) {
  const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
  const contorno = String(props.psets.OPENRVT_Losa.Contorno);
  const numeros = contorno.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const xs = numeros.filter((_, i) => i % 2 === 0);
  const ys = numeros.filter((_, i) => i % 2 === 1);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
    pset: props.psets.OPENRVT_Losa,
  };
}

test("O032b: planta sin salientes con un muro a paño interior", async () => {
  const ses = await Sesion.abrir({
    prueba: "o032b",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o032b-"));
    const ruta = path.join(carpeta, "o032b.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "O032b planta" });
    const nivel = (await invocar(ses, "modelo.niveles"))[0].globalid;
    const tipo = (await invocar(ses, "tipos.listar", { clase: "IfcWallType" })).find(
      (t) => t.nombre === "Block 15",
    ).nombre;
    const muros = [];
    for (const [x1, y1, x2, y2] of [
      [0, 0, 4, 0],
      [4, 0, 4, 3],
      [4, 3, 0, 3],
      [0, 3, 0, 0],
    ]) {
      muros.push(
        (await invocar(ses, "muros.crear", { tipo, nivel, x1, y1, x2, y2, linea_ubicacion: "eje_nucleo" }))
          .creados[0],
      );
    }
    await invocar(ses, "elementos.editar", {
      globalid: muros[1],
      cambios: { linea_ubicacion: "cara_interior" },
    });
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o032b.ifc",
      30_000,
      "no abrió el modelo O032b",
    );
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-zoom-ajustar");
    // La planta que dibuja la app: contorno unido de los muros, leído del visor.
    const contorno = await ses.driver.executeScript(() => window.__OPENRVT_PLANTA_MUROS__ ?? null);
    assert.ok(contorno, "el visor no expuso el contorno de planta");
    assert.equal(contorno.length, 1);
    // Ningún muro vecino sobresale ni deja muesca: afuera y adentro son
    // rectángulos de 4 vértices.
    assert.equal(contorno[0].exterior.length - 1, 4, JSON.stringify(contorno[0].exterior));
    assert.equal(contorno[0].huecos.length, 1);
    assert.equal(contorno[0].huecos[0].length - 1, 4, JSON.stringify(contorno[0].huecos[0]));
    await ses.captura(path.join(CAPTURAS, "o032b-planta-pano.png"));
  } finally {
    await ses.cerrar();
  }
});
