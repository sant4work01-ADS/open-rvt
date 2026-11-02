// Reporte 2-nov: muro Block 12 con castillos cambiado a «Block 15 aplanado-yeso».
// El núcleo nuevo se comía medio castillo (los castillos seguían de 12 y el castillo
// intermedio quedaba como hueco que el cuerpo del muro rellenaba).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "cambio-tipo-muro");

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

test("cambio de tipo de muro con castillos: el muro no se come el castillo", async () => {
  const ses = await Sesion.abrir({
    prueba: "cambio-tipo-muro",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await invocar(ses, "proyecto.nuevo", { nombre: "Cambio de tipo" });
    const nivel = (await invocar(ses, "modelo.niveles"))[0].globalid;
    const muro = (await invocar(ses, "muros.crear", {
      tipo: "Block 12", nivel, x1: 0, y1: 0, x2: 4, y2: 0, linea_ubicacion: "eje_nucleo",
    })).creados[0];
    await invocar(ses, "castillos.automaticos", { muros: [muro], separacion_max: 3.0 });
    // Lo mismo que hace Propiedades → Tipo.
    await invocar(ses, "elementos.editar", { globalid: muro, cambios: { tipo: "Block 15 aplanado-yeso" } });
    const tes = await invocar(ses, "geometria.teselar", { globalids: null });
    const castillos = tes.elementos.filter((e) => e.clase === "IfcColumn");
    assert.equal(castillos.length, 3);
    for (const c of castillos) {
      const p = await invocar(ses, "modelo.propiedades", { globalid: c.globalid });
      assert.equal(Number(p.psets.OPENRVT_Estructura.H), 0.15, "el castillo debe tomar el núcleo de 15");
    }
    // Las llamadas directas no pasan por React: deshacer y rehacer recarga y re-tesela.
    const pestana = await ses.driver.wait(
      until.elementLocated(By.xpath('//*[@role="tab"][normalize-space(.)="Modelar"]')),
      10_000,
    );
    await pestana.click();
    await esperar(300);
    for (const id of ["cmd-deshacer", "cmd-rehacer"]) {
      await (await ses.porTestid(id)).click();
      await esperar(900);
    }
    const abrirVista = async (nombre) => {
      const b = await ses.driver.wait(
        until.elementLocated(By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`)),
        10_000,
      );
      await b.click();
      await esperar(900);
    };
    await abrirVista("3D Isométrica");
    await ses.captura(path.join(CAPTURAS, "cambio-tipo-3d.png"));
    await abrirVista("Planta Nivel 0");
    await ses.captura(path.join(CAPTURAS, "cambio-tipo-planta.png"));
  } finally {
    await ses.cerrar();
  }
});
