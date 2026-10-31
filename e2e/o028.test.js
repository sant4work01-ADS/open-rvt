// O028: enlaces a ejes con la app real. Retícula 3×3, «Zapatas en ejes» (9),
// «Contratrabes entre ejes» en el eje 2, mover el eje B 1 m y comprobar que las
// zapatas siguen en x=6 y los tramos miden 6.00 y 4.00 m. Después mover el nivel
// de desplante −1.20 → −1.50 y comprobar que todo baja 0.30. Deshacer en un paso.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O028");

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

async function piezas(ses, clase) {
  const elementos = await invocar(ses, "modelo.elementos");
  return elementos.filter((e) => e.clase === clase).map((e) => e.globalid);
}

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function esperarHasta(fn, ms, mensaje) {
  const fin = Date.now() + ms;
  for (;;) {
    const valor = await fn();
    if (valor) return valor;
    if (Date.now() > fin) throw new Error(mensaje);
    await esperar(300);
  }
}

test("O028: zapatas y contratrabes enlazados siguen al eje y al nivel", async () => {
  const ses = await Sesion.abrir({
    prueba: "o028",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o028-"));
    const ruta = path.join(carpeta, "o028.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "Ejes O028" });
    const n0 = (await invocar(ses, "modelo.niveles"))[0];
    await invocar(ses, "niveles.editar", {
      globalid: n0.globalid,
      nombre: "Desplante",
      elevacion: -1.20,
    });
    const ejes = {};
    for (const [etiqueta, x1, y1, x2, y2] of [
      ["A", 0, -2, 0, 12],
      ["B", 5, -2, 5, 12],
      ["C", 10, -2, 10, 12],
      ["1", -2, 0, 12, 0],
      ["2", -2, 4, 12, 4],
      ["3", -2, 8, 12, 8],
    ]) {
      ejes[etiqueta] = (
        await invocar(ses, "ejes.crear", { etiqueta, x1, y1, x2, y2 })
      ).creados[0];
    }
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o028.ifc",
      30_000,
      "no abrió el modelo O028",
    );
    await elegirVista(ses, "Planta Desplante");

    const pestana = await ses.driver.wait(
      until.elementLocated(By.xpath('//button[@role="tab"][normalize-space(.)="Modelar"]')),
      10_000,
      "no apareció la pestaña Modelar",
    );
    await pestana.click();
    await esperar(300);

    // «Zapatas en ejes»: 3×3 = 9 zapatas.
    await activar(ses, "cmd-zapatas-en-ejes");
    const zapatas = await esperarHasta(
      async () => {
        const gids = await piezas(ses, "IfcFooting");
        return gids.length === 9 ? gids : null;
      },
      15_000,
      "no se crearon las 9 zapatas",
    );

    // El eje 2 se selecciona con un clic sobre su línea; luego el lote de contratrabes.
    await clicMundo(ses, 2.5, 4, 0);
    await ses.driver.wait(
      async () => (await ses.porTestid("propiedades-eje", 3_000)) !== null,
      5_000,
      "no se seleccionó el eje 2",
    );
    await activar(ses, "cmd-contratrabes-entre-ejes");
    const contratrabes = await esperarHasta(
      async () => {
        const gids = await piezas(ses, "IfcFooting");
        const largos = [];
        for (const gid of gids) {
          const p = await props(ses, gid);
          const dato = p.psets.OPENRVT_Estructura || {};
          if (dato.Longitud !== undefined) largos.push(gid);
        }
        return largos.length === 2 ? largos : null;
      },
      15_000,
      "no se crearon los 2 contratrabes entre A-B y B-C",
    );

    // Mover el eje B de x=5 a x=6.
    await ses.driver.executeScript(
      (eje) => document.querySelector('[data-testid="visor"]').__openrvtMoverEje(eje, 1),
      ejes.B,
    );
    await esperar(1400);
    const xs = [];
    for (const gid of zapatas) {
      const p = await props(ses, gid);
      xs.push(Number(p.psets.OPENRVT_Estructura.X));
    }
    xs.sort((a, b) => a - b);
    assert.deepEqual(xs, [0, 0, 0, 6, 6, 6, 10, 10, 10]);
    const largos = [];
    for (const gid of contratrabes) {
      const p = await props(ses, gid);
      largos.push(Number(p.psets.OPENRVT_Estructura.Longitud));
    }
    largos.sort((a, b) => a - b);
    assert.deepEqual(largos, [4, 6]);

    // Deshacer en un paso: el eje vuelve y con él zapatas y tramos.
    await activar(ses, "cmd-deshacer");
    await esperar(1200);
    const xsVuelta = [];
    for (const gid of zapatas) {
      const p = await props(ses, gid);
      xsVuelta.push(Number(p.psets.OPENRVT_Estructura.X));
    }
    xsVuelta.sort((a, b) => a - b);
    assert.deepEqual(xsVuelta, [0, 0, 0, 5, 5, 5, 10, 10, 10]);

    // Mover el nivel de desplante de −1.20 a −1.50: zapata y contratrabe bajan 0.30.
    const zAntes = Number((await props(ses, zapatas[0])).psets.OPENRVT_Estructura.Z);
    const zVigaAntes = Number(
      (await props(ses, contratrabes[0])).psets.OPENRVT_Estructura.Z,
    );
    await invocar(ses, "niveles.editar", {
      globalid: n0.globalid,
      elevacion: -1.50,
    });
    await esperar(800);
    const zDespues = Number((await props(ses, zapatas[0])).psets.OPENRVT_Estructura.Z);
    const zVigaDespues = Number(
      (await props(ses, contratrabes[0])).psets.OPENRVT_Estructura.Z,
    );
    assert.ok(Math.abs(zDespues - (zAntes
 - 0.3)) < 1e-6, `${zAntes} → ${zDespues}`);
    assert.ok(
      Math.abs(zVigaDespues - (zVigaAntes - 0.3)) < 1e-6,
      `${zVigaAntes} → ${zVigaDespues}`,
    );

    const captura = path.join(CAPTURAS, "o028-enlaces.png");
    await ses.captura(captura);
    assert.ok(fs.existsSync(captura), "no se escribió la captura");
  } finally {
    await ses.cerrar();
  }
});
