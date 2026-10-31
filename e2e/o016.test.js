// O016: restricciones de base y tope con la app real. Crea N0/N1 y un muro con
// tope N1, edita la elevación de N1 en «Niveles y ejes» y comprueba en el panel
// de propiedades que la altura calculada del muro pasa a 3.20 m.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
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

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(200);
}

async function cambiarModulo(ses, id) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`nav[aria-label="Módulos"] [data-modulo="${id}"]`)),
    10_000,
  );
  await boton.click();
  await esperar(300);
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

async function proyectar(ses, x, y, z = 1.2) {
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

async function clicMundo(ses, x, y, z = 1.2) {
  const punto = await proyectar(ses, x, y, z);
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

test("O016: mover el nivel de tope recalcula la altura del muro en el panel", async () => {
  const ses = await Sesion.abrir({
    prueba: "o016",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o016-"));
    const ruta = path.join(carpeta, "o016.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "Restricciones O016" });
    const n0 = (await invocar(ses, "modelo.niveles"))[0];
    const n1 = (
      await invocar(ses, "niveles.crear", { nombre: "Nivel 1", elevacion: 3.0 })
    ).creados[0];
    const muro = (
      await invocar(ses, "muros.crear", {
        tipo: "Block 15",
        nivel: n0.globalid,
        x1: 0,
        y1: 0,
        x2: 5,
        y2: 0,
      })
    ).creados[0];
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o016.ifc",
      30_000,
      "no abrió el modelo O016",
    );

    const antes = await invocar(ses, "modelo.propiedades", { globalid: muro });
    assert.equal(antes.psets.OPENRVT_Restricciones.NivelTope, n1);
    assert.equal(antes.psets.OPENRVT_Restricciones.NivelBase, n0.globalid);
    assert.equal(antes.psets.OPENRVT_Muro.Altura, 3.0);

    await cambiarModulo(ses, "niveles");
    const campo = await ses.porTestid(`nivel-elevacion-${n1}`);
    await campo.clear();
    await campo.sendKeys("3.20");
    await campo.sendKeys(Key.TAB);
    await ses.driver.wait(
      async () => {
        const niveles = await invocar(ses, "modelo.niveles");
        return niveles.find((n) => n.globalid === n1)?.elevacion === 3.2;
      },
      15_000,
      "el Nivel 1 no pasó a 3,20",
    );

    await cambiarModulo(ses, "modelo");
    await elegirVista(ses, "Planta Nivel 0");
    await clicMundo(ses, 2.5, 0, 1.2);
    await ses.porTestid("propiedades-elemento", 10_000);
    const altura = await textoDom(ses, '[data-testid="elemento-altura"]');
    assert.equal(altura, "3.20", "el panel no muestra la altura calculada 3.20");
    const tope = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="restriccion-tope"]')?.value ?? null,
    );
    assert.equal(tope, n1);
    const captura = path.join(CAPTURAS, "o016-restricciones.png");
    await ses.captura(captura);
    assert.ok(fs.existsSync(captura), "no se escribió la captura");

    const despues = await invocar(ses, "modelo.propiedades", { globalid: muro });
    assert.equal(despues.psets.OPENRVT_Muro.Altura, 3.2);
    assert.equal(despues.psets.OPENRVT_Restricciones.NivelTope, n1);
  } finally {
    await ses.cerrar();
  }
});
