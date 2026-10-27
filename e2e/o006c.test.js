// O006c: bitácora completa con la app Tauri real. Crea dos ejes con la herramienta,
// fuerza un error (etiqueta de eje repetida), abre el panel de Ayuda, despliega el
// detalle del error, exporta el .zip y comprueba dentro del .zip los eventos de clic,
// acción, resultado correcto y resultado con mensaje y traza.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
// La versión de la app vive en package.json; la prueba la lee para no volver a
// quedarse clavada en una versión anterior.
const VERSION = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"),
).version;

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

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
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
  await esperar(100);
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
  await esperar(160);
}

async function moverRaton(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: punto.x,
          clientY: punto.y,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
    },
    punto,
  );
  await esperar(60);
}

async function eje(ses, [x1, y1], [x2, y2], cantidad) {
  await clicMundo(ses, x1, y1);
  await moverRaton(ses, x2, y2);
  await clicMundo(ses, x2, y2);
  await ses.driver.wait(
    async () => (await (await ses.porTestid("visor")).getAttribute("data-ejes")) === String(cantidad),
    15_000,
    `el visor no dibujó ${cantidad} ejes`,
  );
}

function leerJsonl(directorio) {
  const eventos = [];
  for (const nombre of fs.readdirSync(directorio)) {
    if (!nombre.endsWith(".jsonl")) continue;
    const lineas = fs
      .readFileSync(path.join(directorio, nombre), "utf8")
      .split("\n")
      .filter(Boolean);
    for (const linea of lineas) eventos.push(JSON.parse(linea));
  }
  return eventos;
}

test("O006c: bitácora con clics, acciones, errores con traza y exportación .zip", async () => {
  const ses = await Sesion.abrir({
    prueba: "o006c-bitacora",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const salida = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-bitacora-e2e-"));
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

    // 1) Dos ejes con la herramienta Eje (un clic real en el botón de la cinta).
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-eje");
    await eje(ses, [0, 0], [0, 6], 1);
    await eje(ses, [0, 3], [6, 3], 2);
    assert.equal(
      await (await ses.porTestid("visor")).getAttribute("data-ejes-etiquetas"),
      "1,A",
    );

    // 2) Error forzado desde la interfaz: repetir la etiqueta «1».
    await activar(ses, "cmd-ejes-separaciones");
    await ses.q('[data-testid="dialogo-ejes-separaciones"]');
    await fijarValor(ses, "eje-sep-horizontal-separaciones", "");
    await fijarValor(ses, "eje-sep-vertical-separaciones", "5");
    await fijarValor(ses, "eje-sep-vertical-etiqueta", "1");
    await fijarValor(ses, "eje-sep-vertical-origen", "0");
    await fijarValor(ses, "eje-sep-vertical-longitud", "10");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="eje-sep-aceptar"]')?.click();
    });
    await ses.driver.wait(
      async () => {
        const texto = await textoDom(ses, '[data-testid="dialogo-ejes-separaciones"]');
        return /Ya existe un eje/i.test(texto || "");
      },
      15_000,
      "el error de etiqueta repetida no apareció en el diálogo",
    );
    await (await ses.porTestid("modal-cerrar")).click();
    await esperar(300);

    // 3) Panel Bitácora: solo errores, detalle con traza.
    const ayuda = await ses.driver.findElement(By.xpath('//nav//button[@aria-label="Ayuda"]'));
    await ayuda.click();
    await activar(ses, "ayuda-pestana-bitacora");
    await ses.q('[data-testid="bitacora-panel"]');
    await activar(ses, "bitacora-solo-errores");
    await ses.q('[data-testid="bitacora-fila-error"]');
    await ses.driver.executeScript(() => {
      const filas = Array.from(
        document.querySelectorAll('[data-testid="bitacora-fila-error"][data-tipo="resultado"]'),
      );
      const fila =
        filas.find((f) => (f.textContent || "").includes("Ya existe un eje")) ?? filas[0];
      if (!fila) throw new Error("no hay fila de resultado con error");
      fila.click();
    });
    const detalle = await ses.q('[data-testid="bitacora-detalle"]');
    const textoDetalle = await detalle.getText();
    assert.match(textoDetalle, /Ya existe un eje/);
    assert.match(textoDetalle, /Traceback \(most recent call last\)/);
    assert.match(textoDetalle, /20 acciones previas/);

    const captura = path.join(CAPTURAS, "o006c_bitacora.png");
    await ses.captura(captura);
    assert.deepEqual(dimensionesPng(captura), { ancho: 1600, alto: 900 });

    // 4) Exportar el .zip con el diálogo simulado y descomprimirlo.
    const zip = path.join(salida, "bitacora-openrvt.zip");
    await ses.driver.executeScript(
      (zip) => {
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) =>
          peticion.tipo === "guardar-zip" ? zip : null;
      },
      zip,
    );
    await activar(ses, "bitacora-exportar");
    const dialogo = await ses.porTestid("bitacora-exportar-dialogo");
    assert.equal(await (await ses.porTestid("bitacora-todas")).isSelected(), false);
    assert.equal(await (await ses.porTestid("bitacora-incluir-ifc")).isSelected(), false);
    assert.ok(await dialogo.isDisplayed());
    await activar(ses, "bitacora-exportar-confirmar");

    const fin = Date.now() + 20_000;
    while (!fs.existsSync(zip) && Date.now() < fin) await esperar(100);
    assert.ok(fs.existsSync(zip), "no se creó el .zip de la bitácora");

    const extraido = path.join(salida, "contenido");
    execFileSync("unzip", ["-q", "-o", zip, "-d", extraido]);
    assert.ok(fs.existsSync(path.join(extraido, "OPEN-RVT.log")), "falta OPEN-RVT.log");
    const sistema = JSON.parse(fs.readFileSync(path.join(extraido, "sistema.json"), "utf8"));
    assert.equal(sistema.tipo, "inicio");
    assert.equal(sistema.version, VERSION);
    assert.ok(sistema.ifcopenshell && sistema.ifcopenshell !== "no disponible");
    assert.ok(sistema.python);

    const eventos = leerJsonl(path.join(extraido, "sesiones"));
    assert.ok(eventos.length > 10, "la bitácora exportada tiene muy pocos eventos");
    assert.ok(
      eventos.some(
        (e) =>
          e.tipo === "clic" &&
          (e.testid === "cmd-eje" || String(e.ruta || "").includes("Eje")),
      ),
      "falta el clic de Eje",
    );

    const acciones = eventos.filter((e) => e.tipo === "accion");
    const crear = acciones.find((e) => e.metodo === "ejes.crear");
    assert.ok(crear, "falta la acción ejes.crear");
    const okCrear = eventos.find(
      (e) => e.tipo === "resultado" && e.id === crear.id && e.ok === true,
    );
    assert.ok(okCrear, "falta el resultado correcto de ejes.crear");
    assert.ok(okCrear.duracion_ms >= 0);

    const accionError = acciones.find((e) => e.metodo === "ejes.crear_reticula");
    assert.ok(accionError, "falta la acción que provoca el error");
    const error = eventos.find(
      (e) => e.tipo === "resultado" && e.id === accionError.id && e.ok === false,
    );
    assert.ok(error, "falta el resultado de error");
    assert.match(String(error.mensaje), /Ya existe un eje con la etiqueta «1»/);
    assert.match(String(error.traza), /Traceback \(most recent call last\)/);
    assert.match(String(error.traza), /ErrorNucleo/);

    // La privacidad: los eventos no guardan el contenido del IFC.
    assert.ok(eventos.every((e) => !("ifc" in e) && !("contenido" in e)));
  } finally {
    await ses.cerrar();
    fs.rmSync(salida, { recursive: true, force: true });
  }
});
