// O059: losas por uso desde la interfaz real. Proyecto nuevo, un firme en N0 y
// una azotea en N1 dibujados con el selector «Uso»; Propiedades muestra el uso,
// la azotea se cambia a entrepiso, se guarda, se reabre y se comprueba.
// Valores a mano: rectángulo 4 × 5 = 20.00 m²; firme 0.10 → 2.00 m³; entrepiso
// y azotea 0.12 → 2.40 m³. Al final: firme 20.00 m² / 2.00 m³ y la azotea
// convertida en entrepiso 20.00 m² / 2.40 m³.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O059");
const DIMENSION = { ancho: 1600, alto: 900 };
const RECTANGULO = [
  [0, 0],
  [4, 0],
  [4, 5],
  [0, 5],
];
// La azotea se dibuja aparte para no confundir la selección en planta: mismo
// tamaño 4 × 5, desplazada 6 m en X.
const RECTANGULO_AZOTEA = RECTANGULO.map(([x, y]) => [x + 6, y]);

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 100 && alto > 100, `${ruta} mide ${ancho}×${alto}`);
  return { ancho, alto };
}

async function captura(ses, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  dimensionesPng(ruta);
  return ruta;
}

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

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
  await esperar(800);
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(300);
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
  await esperar(450);
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
  await esperar(120);
}

async function descartarCambiosSiPregunta(ses) {
  for (let i = 0; i < 20; i += 1) {
    const dialogos = await ses.driver.findElements(
      By.css('[data-testid="dialogo-guardar-cambios"]'),
    );
    if (dialogos.length > 0) {
      const boton = await ses.driver.findElement(
        By.xpath('//button[normalize-space(.)="No guardar"]'),
      );
      await boton.click();
      await esperar(200);
      return;
    }
    await esperar(100);
  }
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
  await esperar(800);
  await (
    await ses.driver.wait(until.elementLocated(By.css('[data-modulo="modelo"]')), 10_000)
  ).click();
  await esperar(400);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

async function losas(ses) {
  return (await teselado(ses)).filter((e) => e.clase === "IfcSlab");
}

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function esperarLosas(ses, cuantas, mensaje) {
  return ses.driver.wait(async () => {
    const encontradas = await losas(ses);
    return encontradas.length === cuantas ? encontradas : false;
  }, 20_000, mensaje);
}

async function dibujarLosa(ses, uso, z, puntos = RECTANGULO) {
  await activar(ses, "cmd-losa");
  await fijarValor(ses, "losa-uso", uso);
  for (const [x, y] of puntos) await clicMundo(ses, x, y, z);
  await activar(ses, "losa-cerrar");
  await esperar(800);
  for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");
}

async function seleccionarLosaEn(ses, x, y, z) {
  await clicMundo(ses, x, y, z);
  const gid = await ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
  );
  assert.ok(gid, `no quedó seleccionada la losa en (${x}, ${y})`);
  const p = await props(ses, gid);
  assert.equal(p.clase, "IfcSlab", `en (${x}, ${y}) se seleccionó ${p.clase}`);
  return gid;
}

const valorUsoPanel = (ses) =>
  ses.driver.executeScript(
    () => document.querySelector('[data-testid="prop-uso-losa"]')?.value ?? null,
  );

test("O059: firme en N0 y azotea en N1 con el selector, cambio a entrepiso y reapertura", async () => {
  const rutaIfc = path.join(os.tmpdir(), `o059-${Date.now()}.ifc`);
  const ses = await Sesion.abrir({
    prueba: "o059",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await crearNivel(ses, "Nivel 1", 2.2);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="losa-uso"]')?.value ?? null,
      ),
      null,
      "la barra no debe mostrar el selector antes de activar la losa",
    );

    // 1. Firme en N0 (por omisión el selector ya está en Entrepiso).
    await activar(ses, "cmd-losa");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="losa-uso"]')?.value ?? null,
      ),
      "entrepiso",
      "el selector de uso no arranca en entrepiso",
    );
    await fijarValor(ses, "losa-uso", "firme");
    for (const [x, y] of RECTANGULO) await clicMundo(ses, x, y, 0);
    await activar(ses, "losa-cerrar");
    await esperar(800);
    await esperarLosas(ses, 1, "no se creó el firme");
    for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");

    // 2. Azotea en N1 con el selector.
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await dibujarLosa(ses, "azotea", 2.2, RECTANGULO_AZOTEA);
    const encontradas = await esperarLosas(ses, 2, "no se creó la azotea");
    const usos = {};
    for (const losa of encontradas) {
      const p = await props(ses, losa.globalid);
      usos[losa.globalid] = {
        uso: p.psets?.OPENRVT_Losa?.Uso,
        nivel: p.nivel,
      };
    }
    const valores = Object.values(usos);
    assert.ok(
      valores.some((v) => v.uso === "firme" && v.nivel === "Nivel 0"),
      `el firme no quedó en Nivel 0: ${JSON.stringify(usos)}`,
    );
    assert.ok(
      valores.some((v) => v.uso === "azotea" && v.nivel === "Nivel 1"),
      `la azotea no quedó en Nivel 1: ${JSON.stringify(usos)}`,
    );

    // 3. Propiedades del firme: uso y datos guardados.
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    for (let i = 0; i < 2; i += 1) await tecla(ses, "Escape");
    const gidFirme = await seleccionarLosaEn(ses, 2, 2, 0);
    await ses.porTestid("prop-uso-losa", 10_000);
    assert.equal(await valorUsoPanel(ses), "firme", "Propiedades no muestra firme");
    let datos = await props(ses, gidFirme);
    assert.equal(datos.psets.OPENRVT_Losa.Uso, "firme");
    assert.equal(datos.psets.OPENRVT_Losa.Espesor, 0.1);
    assert.equal(datos.atributos.PredefinedType, "BASESLAB");
    assert.equal(datos.nombre, "Firme");

    // 4. Propiedades de la azotea y cambio a entrepiso desde el panel.
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    for (let i = 0; i < 2; i += 1) await tecla(ses, "Escape");
    const gidAzotea = await seleccionarLosaEn(ses, 8, 2, 2.2);
    assert.notEqual(gidAzotea, gidFirme, "la selección no cambió a la azotea");
    await ses.porTestid("prop-uso-losa", 10_000);
    assert.equal(await valorUsoPanel(ses), "azotea", "Propiedades no muestra azotea");
    await fijarValor(ses, "prop-uso-losa", "entrepiso");
    await ses.driver.wait(async () => {
      const p = await props(ses, gidAzotea);
      return (
        p.psets?.OPENRVT_Losa?.Uso === "entrepiso" &&
        p.atributos?.PredefinedType === "FLOOR" &&
        p.nombre === "Losa de entrepiso"
      );
    }, 15_000, "el cambio de uso a entrepiso no llegó al modelo");

    await captura(ses, "01-propiedades-uso.png");

    // 5. Guardar, reabrir y comprobar que el uso viajó en el IFC.
    await instalarDialogos(ses, { abrir: rutaIfc });
    await invocar(ses, "proyecto.guardar", { ruta: rutaIfc });
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-abrir");
    await descartarCambiosSiPregunta(ses);
    await ses.driver.wait(
      async () =>
        ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes(
          path.basename(rutaIfc),
        ),
      30_000,
      "no se reabrió el modelo de trabajo",
    );
    await cambiarPestana(ses, "Modelar");

    const firmeReabierto = await props(ses, gidFirme);
    const entrepisoReabierto = await props(ses, gidAzotea);
    assert.equal(firmeReabierto.psets.OPENRVT_Losa.Uso, "firme");
    assert.equal(firmeReabierto.atributos.PredefinedType, "BASESLAB");
    assert.equal(entrepisoReabierto.psets.OPENRVT_Losa.Uso, "entrepiso");
    assert.equal(entrepisoReabierto.atributos.PredefinedType, "FLOOR");

    // La pantalla vuelve a leer el mismo uso tras la reapertura.
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    for (let i = 0; i < 2; i += 1) await tecla(ses, "Escape");
    await seleccionarLosaEn(ses, 8, 2, 2.2);
    await ses.porTestid("prop-uso-losa", 10_000);
    assert.equal(await valorUsoPanel(ses), "entrepiso", "la pantalla no releyó entrepiso");

    // 6. Medición: las partidas no se revuelven entre usos.
    const partidas = (await invocar(ses, "medicion.calcular")).partidas;
    const porNombre = Object.fromEntries(partidas.map((p) => [p.nombre, p.total]));
    assert.equal(porNombre["Área de firme"], 20.0);
    assert.equal(porNombre["Volumen de firme"], 2.0);
    assert.equal(porNombre["Área de losa de entrepiso"], 20.0);
    assert.equal(porNombre["Volumen de losa de entrepiso"], 2.4);
    assert.equal(porNombre["Cimbra de borde de firme"], 1.8);
    assert.equal(porNombre["Cimbra de borde de losa de entrepiso"], 2.16);
    assert.equal(porNombre["Área de losa de azotea"], undefined);

    // 7. Capturas de 3D y Cantidades.
    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(800);
    await captura(ses, "02-3d-firme-entrepiso.png");

    await activar(ses, "vista-cantidades-item");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="vista-cantidades"]')),
      10_000,
    );
    await esperar(500);
    const filas = await ses.driver.executeScript(() =>
      Array.from(document.querySelectorAll('[data-testid^="cantidades-partida-"]')).map(
        (el) => el.innerText,
      ),
    );
    assert.ok(
      filas.some((f) => f.includes("Área de firme") && /20(\.0+)?\b/.test(f)),
      `falta «Área de firme» = 20 en Cantidades: ${JSON.stringify(filas)}`,
    );
    assert.ok(
      filas.some((f) => f.includes("Volumen de losa de entrepiso") && /2\.4\b/.test(f)),
      `falta «Volumen de losa de entrepiso» = 2.4 en Cantidades: ${JSON.stringify(filas)}`,
    );
    await captura(ses, "03-cantidades-por-uso.png");
  } finally {
    await ses.cerrar();
  }
});
