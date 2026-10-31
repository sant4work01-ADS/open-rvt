// O026: herramienta Alinear con la app real. En planta, un eje x=3 y dos muros
// Block 15 (x=4 y x=6). Se alinea la cara de cada muro al eje (el eje del muro
// queda en 3.075), se cierra el candado del primero, se mueve el eje 1 m y se
// comprueba que el primero pasa a 4.075 y el segundo se queda en 3.075.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O026");

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
  await (await ses.porTestid(testid)).click();
  await esperar(200);
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
  await esperar(600);
}

async function muroDe(ses, gid) {
  const referencias = await invocar(ses, "modelo.referencias");
  return referencias.muros.find((m) => m.globalid === gid) ?? null;
}

test("O026: alinear dos muros a un eje y el candado los sigue", async () => {
  const ses = await Sesion.abrir({
    prueba: "o026",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o026-"));
    const ruta = path.join(carpeta, "o026.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "Alinear O026" });
    const n0 = (await invocar(ses, "modelo.niveles"))[0];
    const eje = (
      await invocar(ses, "ejes.crear", {
        etiqueta: "3",
        x1: 3,
        y1: -2,
        x2: 3,
        y2: 8,
      })
    ).creados[0];
    const muroA = (
      await invocar(ses, "muros.crear", {
        tipo: "Block 15",
        nivel: n0.globalid,
        x1: 4,
        y1: 0,
        x2: 4,
        y2: 5,
      })
    ).creados[0];
    const muroB = (
      await invocar(ses, "muros.crear", {
        tipo: "Block 15",
        nivel: n0.globalid,
        x1: 6,
        y1: 0,
        x2: 6,
        y2: 5,
      })
    ).creados[0];
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o026.ifc",
      30_000,
      "no abrió el modelo O026",
    );
    await elegirVista(ses, "Planta Nivel 0");

    // Atajo AL con el foco en la ventana (la cinta también tiene el comando).
    await ses.driver.executeScript(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true }));
    });
    await ses.driver.wait(
      async () => (await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.herramienta ?? null,
      )) === "alinear",
      5_000,
      "el atajo AL no activó Alinear",
    );
    const pestana = await ses.driver.wait(
      until.elementLocated(
        By.xpath('//button[@role="tab"][normalize-space(.)="Modelar"]'),
      ),
      10_000,
      "no apareció la pestaña Modelar",
    );
    await pestana.click();
    await esperar(300);
    const cmd = await ses.porTestid("cmd-alinear");
    assert.equal((await cmd.getText()).trim(), "Alinear");

    // Paso 1: eje x=3. Paso 2: cara izquierda del muro de x=4 → eje del muro 3.075.
    await clicMundo(ses, 3, 2.5);
    await clicMundo(ses, 3.95, 2.5);
    await ses.driver.wait(
      async () => (await ses.porTestid("candado-alinear", 5_000)) !== null,
      10_000,
      "no apareció el candado de la alineación",
    );
    assert.equal(await muroDe(ses, muroA).then((m) => m.x1), 3.075);
    assert.equal(
      await (await ses.porTestid("candado-alinear")).getAttribute("data-bloqueada"),
      "no",
    );

    // Cerrar el candado del primer muro.
    await (await ses.porTestid("candado-alinear")).click();
    await ses.driver.wait(
      async () =>
        (await (await ses.porTestid("candado-alinear")).getAttribute("data-bloqueada")) ===
        "si",
      10_000,
      "el candado no se cerró",
    );

    // La referencia sigue activa: alinear el segundo muro sin cerrar su candado.
    await clicMundo(ses, 5.95, 2.5);
    await esperar(600);
    assert.equal(await muroDe(ses, muroB).then((m) => m.x1), 3.075);

    // Mover el eje 1 m: el muro con candado lo sigue; el otro no se mueve.
    await ses.driver.executeScript(
      (eje) => document.querySelector('[data-testid="visor"]').__openrvtMoverEje(eje, 1),
      eje,
    );
    await esperar(1200);
    assert.equal(await muroDe(ses, muroA).then((m) => m.x1), 4.075);
    assert.equal(await muroDe(ses, muroB).then((m) => m.x1), 3.075);

    const propsA = await invocar(ses, "modelo.propiedades", { globalid: muroA });
    const propsB = await invocar(ses, "modelo.propiedades", { globalid: muroB });
    assert.equal(propsA.psets.OPENRVT_Restricciones.AlinearBloqueada, true);
    assert.equal(propsA.psets.OPENRVT_Restricciones.AlinearReferencia, eje);
    assert.equal(propsB.psets.OPENRVT_Restricciones.AlinearBloqueada, false);

    const captura = path.join(CAPTURAS, "o026-alinear.png");
    await ses.captura(captura);
    assert.ok(fs.existsSync(captura), "no se escribió la captura");
  } finally {
    await ses.cerrar();
  }
});
