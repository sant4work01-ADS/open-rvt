// O039 con la app real: dibujar 2 muros, losa y puerta; abrir Proyecto → Obra y
// comprobar capítulos y totales; mover el aplanado con el menú contextual, deshacer,
// crear y renombrar «Extras», guardar, cerrar y reabrir. Capturas en
// docs/progreso/O039/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O039");

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG");
  return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
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

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(250);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
    `no apareció la pestaña ${nombre}`,
  );
  await pestana.click();
  await esperar(200);
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
  await esperar(120);
}

async function clicSelector(ses, selector) {
  const ok = await ses.driver.executeScript((selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
  assert.equal(ok, true, `no se pudo pulsar ${selector}`);
  await esperar(600);
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
  await ses.driver.executeScript((punto) => {
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
  }, punto);
  await esperar(650);
}

async function dobleClic(ses) {
  await ses.driver.executeScript(() => {
    const canvas = document.querySelector('[data-testid="visor"] canvas');
    if (!canvas) throw new Error("no hay canvas");
    canvas.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  await esperar(300);
}

async function tecla(ses, key) {
  await ses.driver.executeScript(
    (key) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    key,
  );
  await esperar(180);
}

async function abrirProyectoObra(ses) {
  await clicSelector(ses, '[data-testid="panel-pestana-proyecto"]');
  await clicSelector(ses, '[data-testid="arbol-modo-obra"]');
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="arbol-obra"]')),
    10_000,
    "no apareció el árbol de Obra",
  );
  await esperar(400);
}

async function capitulosObra(ses) {
  return ses.driver.executeScript(() =>
    Array.from(document.querySelectorAll('[data-testid="obra-capitulo"]')).map((el) => ({
      texto: el.textContent?.trim() ?? "",
      identificacion: el.getAttribute("data-identificacion"),
      nombre: el.getAttribute("data-nombre"),
    })),
  );
}

async function partidasObra(ses) {
  return ses.driver.executeScript(() =>
    Array.from(document.querySelectorAll('[data-testid="obra-partida"]')).map((el) => ({
      texto: el.textContent?.trim() ?? "",
      clave: el.getAttribute("data-clave"),
      capitulo: el.getAttribute("data-capitulo"),
      clavePP: el.getAttribute("data-clave-pp"),
    })),
  );
}

async function contextMenuPorTexto(ses, testid, texto) {
  const elemento = await ses.driver.wait(
    async () => {
      const elementos = await ses.driver.findElements(By.css(`[data-testid="${testid}"]`));
      for (const el of elementos) {
        const contenido = (await el.getText()).trim();
        if (contenido.includes(texto)) return el;
      }
      return null;
    },
    10_000,
    `no apareció ${testid} con «${texto}»`,
  );
  await ses.driver.actions({ bridge: true }).contextClick(elemento).perform();
  await esperar(450);
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

test("O039: árbol de Obra, mover partida, deshacer, capítulos y reapertura", async () => {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o039-"));
  const ruta = path.join(carpeta, "o039.ifc");
  let ses = await Sesion.abrir({
    prueba: "o039",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await instalarDialogos(ses, { guardar: ruta, abrir: ruta });
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await ses.q('[data-testid="visor"] canvas');

    // 1. Dos muros de 4 × 2.60, una losa de 4 × 4 × 0.12 y una puerta.
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    await fijarValor(ses, "muro-altura", "2.6");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await tecla(ses, "Escape");
    await clicMundo(ses, 0, 2);
    await clicMundo(ses, 4, 2);
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");

    await activar(ses, "cmd-puerta");
    await clicMundo(ses, 2, 0);
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");

    await activar(ses, "cmd-losa");
    for (const [x, y] of [[0, 0], [4, 0], [4, 4], [0, 4]]) {
      await clicMundo(ses, x, y);
    }
    await dobleClic(ses);
    await ses.driver.wait(async () => {
      const elementos = await invocar(ses, "modelo.elementos");
      return (
        elementos.filter((e) => e.clase === "IfcWall").length === 2 &&
        elementos.filter((e) => e.clase === "IfcSlab").length === 1 &&
        elementos.filter((e) => e.clase === "IfcDoor").length === 1
      );
    }, 20_000, "no se dibujaron los dos muros, la losa y la puerta");

    // 2. Proyecto → Obra: siete capítulos en orden y los totales a mano.
    //    Muros: 2 × 4.00 × 2.60 = 20.80 m²; la puerta 0.90 × 2.10 = 1.89 m²
    //    descuenta el mismo vano: 20.80 − 1.89 = 18.91 m².
    //    Losa: 4 × 4 × 0.12 = 1.92 m³.
    await abrirProyectoObra(ses);
    const capitulos = await capitulosObra(ses);
    assert.deepEqual(
      capitulos.map((c) => c.texto),
      [
        "Preliminares (0)",
        "Cimentación (0)",
        "Estructura (3)",
        "Albañilería (1)",
        "Acabados (5)",
        "Cancelería (1)",
        "Instalaciones (0)",
      ],
      "capítulos y conteos de partidas",
    );
    const partidas = await partidasObra(ses);
    const textos = partidas.map((p) => p.texto);
    assert.ok(
      textos.includes("Muro de Block de concreto 15 · 18.910 m²"),
      `falta el block con 18.910 m²: ${JSON.stringify(textos)}`,
    );
    assert.ok(
      textos.includes("Aplanado exterior · 18.910 m²"),
      `falta el aplanado con 18.910 m²: ${JSON.stringify(textos)}`,
    );
    assert.ok(
      textos.includes("Volumen de concreto · 1.920 m³"),
      `falta el concreto de losa con 1.920 m³: ${JSON.stringify(textos)}`,
    );
    assert.ok(
      textos.includes("Puerta · 1.000 pza"),
      `falta la puerta con 1.000 pza: ${JSON.stringify(textos)}`,
    );
    const capturaObra = path.join(CAPTURAS, "o039-obra.png");
    await ses.captura(capturaObra);
    assert.ok(dimensionesPng(capturaObra).ancho > 1000);

    // 3. Mover el aplanado exterior a Albañilería con el menú contextual.
    await contextMenuPorTexto(ses, "obra-partida", "Aplanado exterior");
    await clicSelector(ses, '[data-testid="obra-menu-mover"]');
    await clicSelector(ses, '[data-testid="obra-mover-capitulo-04"]');
    await ses.driver.wait(async () => {
      const actuales = await partidasObra(ses);
      return (
        actuales.find((p) => p.texto.includes("Aplanado exterior"))?.capitulo === "04"
      );
    }, 10_000, "el aplanado no se movió a Albañilería");
    const capturaMovida = path.join(CAPTURAS, "o039-aplanado-en-albanileria.png");
    await ses.captura(capturaMovida);
    assert.ok(dimensionesPng(capturaMovida).alto > 600);

    // 4. Deshacer: vuelve a Acabados (05). «Deshacer» vive en la pestaña Modelar.
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-deshacer");
    await ses.driver.wait(async () => {
      const actuales = await partidasObra(ses);
      return (
        actuales.find((p) => p.texto.includes("Aplanado exterior"))?.capitulo === "05"
      );
    }, 15_000, "deshacer no devolvió el aplanado a Acabados");

    // 5. Crear el capítulo «Extras» y renombrarlo.
    await contextMenuPorTexto(ses, "obra-capitulo", "Preliminares");
    await clicSelector(ses, '[data-testid="obra-menu-nuevo"]');
    await fijarValor(ses, "obra-nombre", "Extras");
    await clicSelector(ses, '[data-testid="obra-nombre-aceptar"]');
    await ses.driver.wait(async () => {
      const actuales = await capitulosObra(ses);
      return actuales.some(
        (c) => c.nombre === "Extras" && c.identificacion === "08",
      );
    }, 10_000, "no se creó el capítulo Extras");

    await contextMenuPorTexto(ses, "obra-capitulo", "Extras");
    await clicSelector(ses, '[data-testid="obra-menu-renombrar"]');
    await fijarValor(ses, "obra-nombre", "Extras y varios");
    await clicSelector(ses, '[data-testid="obra-nombre-aceptar"]');
    await ses.driver.wait(async () => {
      const actuales = await capitulosObra(ses);
      return actuales.some((c) => c.nombre === "Extras y varios");
    }, 10_000, "no se renombró el capítulo Extras");
    // Se vuelve a mover el aplanado para comprobar que el cambio persiste en el IFC.
    await contextMenuPorTexto(ses, "obra-partida", "Aplanado exterior");
    await clicSelector(ses, '[data-testid="obra-menu-mover"]');
    await clicSelector(ses, '[data-testid="obra-mover-capitulo-04"]');
    await ses.driver.wait(async () => {
      const actuales = await partidasObra(ses);
      return (
        actuales.find((p) => p.texto.includes("Aplanado exterior"))?.capitulo === "04"
      );
    }, 10_000, "el aplanado no volvió a Albañilería");
    const capturaCapitulos = path.join(CAPTURAS, "o039-capitulos.png");
    await ses.captura(capturaCapitulos);
    assert.ok(dimensionesPng(capturaCapitulos).ancho > 1000);

    // 6. Guardar, cerrar y abrir: se conservan capítulos y asignación de partidas.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar-como");
    await ses.driver.wait(() => fs.existsSync(ruta), 20_000, "no se creó el IFC");
    assert.ok(fs.statSync(ruta).size > 1000);
    // Cerrar la app y abrir el IFC en una sesión nueva.
    await ses.cerrar();
    ses = null;
    const reabrir = await Sesion.abrir({
      prueba: "o039-reabrir",
      tamano: { ancho: 1600, alto: 900 },
      lateralExpandido: true,
      compositar: true,
    });
    try {
      await instalarDialogos(reabrir, { abrir: ruta, guardar: ruta });
      await activar(reabrir, "cmd-abrir");
      await reabrir.driver.wait(async () => {
        try {
          return (
            (await textoDom(reabrir, '[data-testid="estado-modelo"]')) === "o039.ifc"
          );
        } catch {
          return false;
        }
      }, 30_000, "no reabrió el IFC guardado");
      await abrirProyectoObra(reabrir);
      const reabiertas = await partidasObra(reabrir);
      assert.equal(
        reabiertas.find((p) => p.texto.includes("Aplanado exterior"))?.capitulo,
        "04",
        "el aplanado no conservó su capítulo al reabrir",
      );
      assert.ok(
        reabiertas.some((p) => p.texto === "Muro de Block de concreto 15 · 18.910 m²"),
        "el total del block cambió al reabrir",
      );
      const reabiertos = await capitulosObra(reabrir);
      assert.ok(
        reabiertos.some(
          (c) => c.nombre === "Extras y varios" && c.identificacion === "08",
        ),
        "no se conservó el capítulo Extras y varios",
      );
      const capturaReabierta = path.join(CAPTURAS, "o039-reabierta.png");
      await reabrir.captura(capturaReabierta);
      assert.ok(dimensionesPng(capturaReabierta).alto > 600);
    } finally {
      await reabrir.cerrar();
    }
  } finally {
    if (ses) await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
