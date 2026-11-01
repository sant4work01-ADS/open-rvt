// O032: reproduce la captura. Retícula 4×3 con muros de 0.15 a eje y losa a eje:
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

test("O032: la losa llega al paño exterior y sigue al muro", async () => {
  const ses = await Sesion.abrir({
    prueba: "o032",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o032-"));
    const ruta = path.join(carpeta, "o032.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "O032 captura" });
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
        (
          await invocar(ses, "muros.crear", {
            tipo,
            nivel,
            x1,
            y1,
            x2,
            y2,
            linea_ubicacion: "eje_nucleo",
          })
        ).creados[0],
      );
    }
    await invocar(ses, "losas.desde_muros", {
      nivel,
      globalids: muros,
      lado: "eje",
      desfase: 0,
    });
    const losa = (await invocar(ses, "modelo.elementos")).find(
      (e) => e.clase === "IfcSlab",
    ).globalid;
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o032.ifc",
      30_000,
      "no abrió el modelo O032",
    );

    // 1–2. La captura: la losa va de eje a eje y los muros sobresalen 0.075.
    const antes = await huella(ses, losa);
    assert.equal(antes.x0, 0);
    assert.equal(antes.x1, 4);
    assert.equal(antes.y0, 0);
    assert.equal(antes.y1, 3);
    await elegirVista(ses, "Alzado Norte");
    await ses.captura(path.join(CAPTURAS, "o032-faltante.png"));

    // 3. «Borde a: paño exterior»: la losa cubre los 0.075 de cada muro.
    const bordes = JSON.parse(antes.pset.Bordes).map((borde) => ({
      ...borde,
      lado: "exterior",
      desfase: 0,
    }));
    await invocar(ses, "elementos.editar", {
      globalid: losa,
      cambios: { bordes },
    });
    const fuera = await huella(ses, losa);
    assert.equal(Math.round(fuera.x0 * 1000) / 1000, -0.075);
    assert.equal(Math.round(fuera.x1 * 1000) / 1000, 4.075);
    assert.equal(Math.round(fuera.y0 * 1000) / 1000, -0.075);
    assert.equal(Math.round(fuera.y1 * 1000) / 1000, 3.075);

    // 4. Muro derecho a «paño interior»: su cara exterior se va al eje x=4.
    await invocar(ses, "elementos.editar", {
      globalid: muros[1],
      cambios: { linea_ubicacion: "cara_interior" },
    });
    const sigue = await huella(ses, losa);
    assert.equal(Math.round(sigue.x1 * 1000) / 1000, 4);
    assert.equal(Math.round(sigue.x0 * 1000) / 1000, -0.075);
    assert.equal(Math.round(sigue.y1 * 1000) / 1000, 3.075);
    await elegirVista(ses, "Alzado Norte");
    await ses.captura(path.join(CAPTURAS, "o032-sin-faltante.png"));
    assert.ok(fs.existsSync(path.join(CAPTURAS, "o032-sin-faltante.png")));
  } finally {
    await ses.cerrar();
  }
});
