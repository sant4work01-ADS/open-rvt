// O033: zapata corrida con la app real. Ejes 1–2, muros a eje, «Zapatas en ejes»
// y una zapata corrida sobre el eje 1. Se selecciona sin error, se baja el
// desplante a 1.00, se sube Npt 0 y se guardan capturas de planta y alzado.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O033");

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

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(500);
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

async function fijarYPerderFoco(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        el,
        valor,
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
    },
    testid,
    valor,
  );
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
  await esperar(700);
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

test("O033: la zapata corrida cuelga de Npt 0 y se centra en el eje", async () => {
  const ses = await Sesion.abrir({
    prueba: "o033",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o033-"));
    const ruta = path.join(carpeta, "o033.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "Zapata corrida O033" });
    const n0 = (await invocar(ses, "modelo.niveles"))[0];
    await invocar(ses, "niveles.editar", {
      globalid: n0.globalid,
      nombre: "Npt 0",
      elevacion: 0,
    });
    const ejes = {};
    for (const [etiqueta, x1, y1, x2, y2] of [
      ["A", 0, -2, 0, 7],
      ["B", 5, -2, 5, 7],
      ["1", -2, 0, 7, 0],
      ["2", -2, 4, 7, 4],
    ]) {
      ejes[etiqueta] = (
        await invocar(ses, "ejes.crear", { etiqueta, x1, y1, x2, y2 })
      ).creados[0];
    }

    const tiposMuro = await invocar(ses, "tipos.listar", { clase: "IfcWallType" });
    const tipoMuro = tiposMuro[0].nombre;
    for (const y of [0, 4]) {
      await invocar(ses, "muros.crear", {
        tipo: tipoMuro,
        nivel: n0.globalid,
        x1: 0,
        y1: y,
        x2: 5,
        y2: y,
        altura: 2.6,
        alineacion: "centro",
      });
    }

    const tiposZapata = await invocar(ses, "tipos.listar", { clase: "IfcFootingType" });
    const tipoCorrida = tiposZapata.find((t) => t.alias === "zapata_corrida");
    assert.ok(tipoCorrida, "la biblioteca no tiene zapata corrida");
    // Trazo ligeramente fuera del eje 1: el núcleo lo centra y prolonga medio ancho.
    const corrida = await invocar(ses, "zapatas_corridas.crear", {
      tipo: tipoCorrida.nombre,
      nivel: n0.globalid,
      x1: 0,
      y1: 0.06,
      x2: 5,
      y2: 0.05,
      desplante: 0.8,
    });
    const gid = corrida.creados[0];

    // Guardar y abrir por la interfaz: el estado de React carga tipos y ejes
    // (crearlos por RPC no actualiza la tienda). Es el flujo de O028.
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o033.ifc",
      30_000,
      "no abrió el modelo O033",
    );

    // «Zapatas en ejes»: una zapata aislada en cada cruce (4).
    const pestana = await ses.driver.wait(
      until.elementLocated(By.xpath('//button[@role="tab"][normalize-space(.)="Modelar"]')),
      10_000,
      "no apareció la pestaña Modelar",
    );
    await pestana.click();
    await esperar(400);
    await activar(ses, "cmd-zapatas-en-ejes");
    // 5 zapatas: la corrida creada antes + una aislada en cada cruce (4).
    await esperarHasta(
      async () =>
        (await invocar(ses, "modelo.elementos")).filter((e) => e.clase === "IfcFooting")
          .length === 5,
      15_000,
      "no se crearon las 4 zapatas en ejes junto a la corrida",
    );

    // El modelo aún no tiene vistas guardadas: la tienda crea «Planta Npt 0» y
    // los alzados estándar al abrirlo.
    const planta = "Planta Npt 0";
    const alzado = "Alzado Norte";
    await elegirVista(ses, planta);

    // 1. Selecciona la zapata en planta (fuera del espesor del muro): sin error.
    await clicMundo(ses, 2.5, 0.26, -0.7);
    await esperarHasta(
      async () => (await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="elemento-desplante"]'),
      )),
      10_000,
      "el panel no mostró el desplante de la zapata",
    );
    const barra = (await textoDom(ses, "body")) || "";
    assert.ok(!barra.includes("No existe el elemento"), "la barra de estado muestra el error");
    assert.equal(
      await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="elemento-error"]'),
      ),
      false,
      "el panel muestra un error al seleccionar la zapata",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => !document.querySelector('[data-testid="desfase-base"]') &&
          !document.querySelector('[data-testid="restriccion-tope"]') &&
          !document.querySelector('[data-testid="elemento-altura-estructura"]'),
      ),
      true,
      "el panel de zapata todavía muestra desfase, tope o altura",
    );

    // 2. Desplante 1.00 por el campo del panel.
    await fijarYPerderFoco(ses, "elemento-desplante", "1.00");
    const tras = await invocar(ses, "modelo.propiedades", { globalid: gid });
    assert.equal(tras.psets.OPENRVT_Estructura.Desplante, 1);
    // Centro Z = 0 − 1.00 + 0.20/2 = −0.90; fondo −1.00.
    assert.ok(Math.abs(tras.psets.OPENRVT_Estructura.Z - -0.9) < 1e-6);
    // Volver a seleccionar refresca el panel: muestra el valor guardado.
    await clicMundo(ses, 2.5, 3.0, -0.9);
    await esperar(300);
    await clicMundo(ses, 2.5, 0.26, -0.9);
    await esperarHasta(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="elemento-desplante"]')?.value,
        )) === "1",
      10_000,
      "el panel no mostr� el desplante 1.00",
    );
    await elegirVista(ses, alzado);
    await ses.captura(path.join(CAPTURAS, "o033-alzado-desplante-1-00.png"));

    // 3. Subir Npt 0 +0.50 desde el m�dulo Niveles: la zapata la sigue.
    const moduloNiveles = await ses.driver.wait(
      until.elementLocated(By.css('[data-modulo="niveles"]')),
      10_000,
      "no apareci� el m�dulo Niveles",
    );
    await moduloNiveles.click();
    await esperar(500);
    const cota = await ses.porTestid(`nivel-elevacion-${n0.globalid}`);
    await cota.sendKeys(Key.CONTROL, "a");
    await cota.sendKeys("0.5");
    await ses.driver.executeScript((el) => el.blur(), cota);
    await esperar(1200);
    const moduloModelo = await ses.driver.wait(
      until.elementLocated(By.css('[data-modulo="modelo"]')),
      10_000,
      "no apareci� el m�dulo Modelo",
    );
    await moduloModelo.click();
    await esperar(700);
    const subida = await invocar(ses, "modelo.propiedades", { globalid: gid });
    assert.equal(subida.psets.OPENRVT_Estructura.Desplante, 1);
    // Centro Z = 0.50 − 1.00 + 0.10 = −0.40.
    assert.ok(Math.abs(subida.psets.OPENRVT_Estructura.Z - -0.4) < 1e-6);

    // 4. Capturas de planta y alzado.
    await elegirVista(ses, planta);
    await clicMundo(ses, 2.5, 0.26, -0.4);
    await ses.captura(path.join(CAPTURAS, "o033-planta.png"));
    await elegirVista(ses, alzado);
    await ses.captura(path.join(CAPTURAS, "o033-alzado.png"));

    for (const archivo of ["o033-planta.png", "o033-alzado.png", "o033-alzado-desplante-1-00.png"]) {
      const ruta = path.join(CAPTURAS, archivo);
      assert.ok(fs.existsSync(ruta), `falta la captura ${archivo}`);
      assert.ok(fs.statSync(ruta).size > 10_000, `la captura ${archivo} está vacía`);
    }
  } finally {
    await ses.cerrar();
  }
});
