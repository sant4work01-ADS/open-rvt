// O068: Mover con selección previa o sin ella, mover un eje y colocar una
// ventana en Nivel 1 sobre un muro N0→N2 (antepecho real 3.90).
// Valores a mano: muro A de 5 m; dos desplazamientos de 2.00 m dejan su eje en
// x = 4.00..9.00. Eje A en y = −2.00 movido 1.00 m queda en y = −1.00.
// Muro B N0→N2 de 6 m: N1 = 3.00, antepecho 0.90 → z del vano 3.90.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O068");
const DIMENSION = { ancho: 1700, alto: 1000 };

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 300 && alto > 300, `${ruta} mide ${ancho}×${alto}`);
}

async function captura(ses, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  dimensionesPng(ruta);
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(350);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(250);
}

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    15_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(900);
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
  await esperar(250);
}

async function invocar(ses, metodo, params = {}) {
  const respuesta = await ses.driver.executeAsyncScript(
    function (metodo, params, done) {
      window.__TAURI_INTERNALS__
        .invoke("nucleo_llamar", { metodo, params })
        .then((crudo) =>
          done({ ok: true, valor: crudo && crudo.status === "ok" ? crudo.data : crudo }),
        )
        .catch((error) => done({ ok: false, error: String(error) }));
    },
    metodo,
    params,
  );
  assert.equal(respuesta.ok, true, `falló ${metodo}: ${respuesta.error}`);
  return respuesta.valor;
}

async function instalarDialogos(ses) {
  await ses.driver.executeScript(() => {
    window.__PP_DIALOGO_PRUEBAS__ = async () => null;
  });
}

async function proyectar(ses, x, y, z = 0) {
  const punto = await ses.driver.executeScript(
    (x, y, z) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  return punto;
}

async function clicPantalla(ses, punto) {
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

async function clicMundo(ses, x, y, z = 0) {
  await clicPantalla(ses, await proyectar(ses, x, y, z));
}

async function tecla(ses, key) {
  await ses.driver.executeScript(
    (key) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true }));
    },
    key,
  );
  await esperar(150);
}

async function nuevoModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(
    async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    },
    20_000,
    "el modelo nuevo no cargó",
  );
  await ses.q('[data-testid="visor"] canvas');
}

async function crearNivel(ses, nombre, elevacion) {
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(400);
  await fijarValor(ses, "nivel-nuevo-nombre", nombre);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(900);
  await (
    await ses.driver.wait(until.elementLocated(By.css('[data-modulo="modelo"]')), 10_000)
  ).click();
  await esperar(400);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

async function muros(ses) {
  return (await teselado(ses)).filter((e) => e.clase === "IfcWall");
}

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await fijarValor(ses, "muro-altura", "6");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await esperar(700);
  for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");
}

const cerca = (a, b, tolerancia = 0.02) => Math.abs(a - b) <= tolerancia;

test("O068: Mover sin selección, con selección, eje y ventana en N1", async () => {
  const ses = await Sesion.abrir({
    prueba: "o068",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await instalarDialogos(ses);
    await nuevoModelo(ses);
    // N2 antes de los muros: el muro N0 mide así N0→N2 = 6.00 m. N1 se crea
    // después para que no recorte la altura ya creada.
    await crearNivel(ses, "Nivel 2", 6);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await dibujarMuro(ses, 0, 0, 5, 0);
    await dibujarMuro(ses, 0, 3, 6, 3);
    await crearNivel(ses, "Nivel 1", 3);

    let lista = await muros(ses);
    assert.equal(lista.length, 2, `muros: ${lista.length}`);
    const muroA = lista.find((m) => cerca(m.eje[0], 0) && cerca(m.eje[2], 5));
    assert.ok(muroA, `no está el muro A: ${JSON.stringify(lista.map((m) => m.eje))}`);

    // (a) Mover SIN selección previa: activar, clic en el muro, Enter, base y destino.
    await tecla(ses, "Escape");
    await activar(ses, "cmd-mover");
    assert.match(
      (await textoDom(ses, '[data-testid="mover-paso"]')) || "",
      /Seleccione/,
      "Mover sin selección debe pedir elementos",
    );
    await clicMundo(ses, 2.5, 0);
    await captura(ses, "01-mover-seleccionando.png");
    await tecla(ses, "Enter");
    assert.match(
      (await textoDom(ses, '[data-testid="mover-paso"]')) || "",
      /Punto base/,
      "Enter debe pasar a punto base",
    );

    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 2, 0);
    await esperar(900);
    let tras = (await muros(ses)).find((m) => m.globalid === muroA.globalid);
    assert.ok(cerca(tras.eje[0], 2.0) && cerca(tras.eje[2], 7.0), `eje A: ${tras.eje}`);
    await captura(ses, "02-mover-sin-seleccion.png");

    // (b) CON selección previa: salir, seleccionar el muro y activar Mover.
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    await clicMundo(ses, 4.0, 0);
    const gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    assert.equal(gid, muroA.globalid, "no se seleccionó el muro A");
    await activar(ses, "cmd-mover");
    assert.match(
      (await textoDom(ses, '[data-testid="mover-paso"]')) || "",
      /Punto base/,
      "con selección previa debe saltar al punto base",
    );
    await clicMundo(ses, 4, 0);
    await clicMundo(ses, 6, 0);
    await esperar(900);
    tras = (await muros(ses)).find((m) => m.globalid === muroA.globalid);
    assert.ok(cerca(tras.eje[0], 4.0) && cerca(tras.eje[2], 9.0), `eje A: ${tras.eje}`);
    await captura(ses, "03-mover-con-seleccion.png");

    // (c) Mover un eje 1.00 m: crear el eje A con la herramienta y moverlo.
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    await clicMundo(ses, 0, 8);
    await activar(ses, "cmd-eje");
    await clicMundo(ses, 0, -2);
    await clicMundo(ses, 10, -2);
    await esperar(900);
    for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await activar(ses, "cmd-mover");
    await clicMundo(ses, 5, -2);
    assert.match(
      (await textoDom(ses, '[data-testid="mover-paso"]')) || "",
      /eje/,
      "debe quedar elegido el eje",
    );
    await tecla(ses, "Enter");
    await clicMundo(ses, 5, -2);
    await clicMundo(ses, 5, -1);
    await esperar(900);
    const referencias = await invocar(ses, "modelo.referencias");
    const eje = referencias.ejes.find((e) => e.etiqueta === "A");
    assert.ok(eje, `no está el eje A: ${JSON.stringify(referencias.ejes)}`);
    assert.ok(cerca(eje.y1, -1.0) && cerca(eje.y2, -1.0), `eje A: ${eje.y1}, ${eje.y2}`);
    await captura(ses, "04-mover-eje.png");

    // Ventana en Planta Nivel 1 sobre el muro B N0→N2, nivel de la vista N1.
    for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await activar(ses, "cmd-ventana");
    const niveles = await invocar(ses, "modelo.niveles");
    const n1 = niveles.find((n) => n.nombre === "Nivel 1");
    assert.ok(n1, "no está Nivel 1");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="abertura-ancho"]')?.value ?? null,
      ),
      "1.2",
      "ancho por omisión",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="abertura-alto"]')?.value ?? null,
      ),
      "1.2",
      "alto por omisión",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="abertura-antepecho"]')?.value ?? null,
      ),
      "0.9",
      "antepecho por omisión",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="abertura-nivel"]')?.value ?? null,
      ),
      n1.globalid,
      "nivel de referencia = el de la vista",
    );
    await clicMundo(ses, 3, 3);
    await ses.driver.wait(
      async () => (await teselado(ses)).filter((e) => e.clase === "IfcWindow").length === 1,
      20_000,
      "no se creó la ventana",
    );
    const ventana = (await teselado(ses)).find((e) => e.clase === "IfcWindow");
    const datos = await props(ses, ventana.globalid);
    assert.equal(datos.psets.OPENRVT_Abertura.Nivel, n1.globalid);
    assert.ok(
      Math.abs(Number(datos.psets.OPENRVT_Abertura.Antepecho) - 3.9) < 1e-6,
      `antepecho absoluto: ${datos.psets.OPENRVT_Abertura.Antepecho}`,
    );
    // `geometria.teselar` viaja con los vértices en base64 (float32).
    const crudos = Buffer.from(ventana.vertices, "base64");
    const flotantes = new Float32Array(
      crudos.buffer,
      crudos.byteOffset,
      crudos.length / 4,
    );
    const zs = [];
    for (let i = 2; i < flotantes.length; i += 3) zs.push(flotantes[i]);
    assert.ok(cerca(Math.min(...zs), 3.9, 0.01), `z mínimo de la ventana: ${Math.min(...zs)}`);
    await captura(ses, "05-ventana-nivel-1.png");

    // Ficha en Alzado Sur: se elige la ventana en el hueco del muro (z 3.90 a
    // 5.10) y la ficha muestra antepecho relativo 0.90 y nivel N1.
    for (let i = 0; i < 2; i += 1) await tecla(ses, "Escape");
    await elegirVista(ses, "Alzado Sur");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await clicMundo(ses, 3, 0, 4.5);
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="elemento-antepecho"]')?.value ?? null,
      ),
      "0.9",
      "la ficha debe mostrar el antepecho relativo a N1",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="elemento-nivel-abertura"]')?.value ?? null,
      ),
      n1.globalid,
      "la ficha debe mostrar N1",
    );
    const distanciaPanel = Number(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="elemento-distancia"]')?.value ?? null,
      ),
    );
    assert.ok(cerca(distanciaPanel, 2.4, 1e-6), `distancia en la ficha: ${distanciaPanel}`);
    await captura(ses, "06-ventana-alzado-propiedades.png");
  } finally {
    await ses.cerrar();
  }
});
