// O038: árbol del proyecto (modo Modelo). Con la app real: ocultar Muros en planta
// no los dibuja pero sí en 3D, aislar una zapata, bloquear Losas para que un clic no
// la seleccione, y seleccionar en la vista expande el árbol. Capturas en
// docs/progreso/O038/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O038");

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

async function clicReal(ses, selector) {
  const el = await ses.driver.wait(until.elementLocated(By.css(selector)), 5000, selector);
  await ses.driver.actions({ bridge: true }).move({ origin: el }).click().perform();
  await esperar(600);
}

async function abrirMenu(ses, clave) {
  const el = await ses.driver.wait(
    until.elementLocated(By.css(`[data-testid="arbol-nodo"][data-clave="${clave}"]`)),
    5000,
    `nodo ${clave}`,
  );
  await ses.driver.actions({ bridge: true }).contextClick(el).perform();
  await esperar(500);
}

async function leerVisor(ses, campo) {
  return ses.driver.executeScript(
    (campo) => document.querySelector('[data-testid="visor"]')?.dataset[campo] ?? null,
    campo,
  );
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

async function seleccionEnArbol(ses) {
  return ses.driver.executeScript(
    () =>
      document.querySelector('[data-testid="arbol-nodo"][data-seleccionado="true"]')
        ?.getAttribute("data-clave") ?? null,
  );
}

async function irVistas(ses) {
  await clicSelector(ses, '[data-testid="panel-pestana-vistas"]');
}

async function irProyecto(ses) {
  await clicSelector(ses, '[data-testid="panel-pestana-proyecto"]');
}

test("O038: árbol del proyecto oculta, aísla, bloquea y sincroniza la selección", async () => {
  const ses = await Sesion.abrir({
    prueba: "o038",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o038-"));
    const ruta = path.join(carpeta, "o038.ifc");
    await ses.driver.executeScript((ruta) => {
      window.__PP_DIALOGO_PRUEBAS__ = async (p) => (p.tipo === "abrir-ifc" ? ruta : null);
    }, ruta);

    // Modelo de la spec: 4 muros, losa, zapata y 2 ejes en 2 niveles.
    await invocar(ses, "proyecto.nuevo", { nombre: "O038 árbol" });
    const nivel0 = (await invocar(ses, "modelo.niveles"))[0].globalid;
    await invocar(ses, "niveles.crear", { nombre: "Nivel 1", elevacion: 2.6 });
    await invocar(ses, "ejes.crear", { etiqueta: "A", x1: 0, y1: -2, x2: 0, y2: 6 });
    await invocar(ses, "ejes.crear", { etiqueta: "1", x1: -2, y1: 0, x2: 6, y2: 0 });
    const muros = [];
    for (const [x1, y1, x2, y2] of [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]]) {
      muros.push(
        (await invocar(ses, "muros.crear", { tipo: "Block 15", nivel: nivel0, x1, y1, x2, y2 }))
          .creados[0],
      );
    }
    await invocar(ses, "losas.crear", {
      nivel: (await invocar(ses, "modelo.niveles"))[1].globalid,
      puntos: [[0, 0], [4, 0], [4, 3], [0, 3]],
    });
    const zapata = (
      await invocar(ses, "zapatas.crear", {
        tipo: "Z-1 Zapata 1.20×1.20",
        nivel: nivel0,
        x: 6,
        y: 0,
      })
    ).creados[0];
    await invocar(ses, "proyecto.guardar", { ruta });

    const abrir = await ses.porTestid("cmd-abrir");
    await abrir.click();
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="estado-modelo"]')?.textContent?.trim(),
        )) === "o038.ifc",
      30_000,
      "no abrió el modelo",
    );

    // 1. Ocultar Muros en Planta Nivel 0.
    await elegirVista(ses, "Planta Nivel 0");
    await irProyecto(ses);
    const basePlanta = Number(await leerVisor(ses, "mallasDibujadas"));
    await clicSelector(ses, '[data-testid="arbol-ojo"][data-clave="categoria:muros"]');
    await esperar(800);
    const sinMuros = Number(await leerVisor(ses, "mallasDibujadas"));
    assert.equal(sinMuros, basePlanta - 4, "en planta deben quedar 4 muros menos");
    await ses.captura(path.join(CAPTURAS, "o038-planta-sin-muros.png"));

    // En 3D sí aparecen los muros (el ojo se guarda por vista).
    await irVistas(ses);
    await elegirVista(ses, "3D Isométrica");
    const en3d = Number(await leerVisor(ses, "mallasDibujadas"));
    assert.ok(en3d >= 4, `en 3D deben aparecer los muros (hubo ${en3d} mallas)`);
    await ses.captura(path.join(CAPTURAS, "o038-3d-con-muros.png"));

    // 2. Aislar la zapata en planta.
    await irVistas(ses);
    await elegirVista(ses, "Planta Nivel 0");
    await irProyecto(ses);
    await abrirMenu(ses, "categoria:zapatas");
    await clicSelector(ses, '[data-testid="arbol-menu-aislar"]');
    await esperar(800);
    const aislado = Number(await leerVisor(ses, "mallasDibujadas"));
    assert.equal(aislado, 1, `al aislar la zapata debe quedar 1 malla (hubo ${aislado})`);
    await ses.captura(path.join(CAPTURAS, "o038-zapata-aislada.png"));

    // 3. Bloquear Losas: un clic sobre la losa no la selecciona (en la misma vista 3D).
    await abrirMenu(ses, "categoria:muros");
    await clicSelector(ses, '[data-testid="arbol-menu-mostrar-todo"]');
    await irVistas(ses);
    await elegirVista(ses, "3D Isométrica");
    await irProyecto(ses);
    await clicSelector(ses, '[data-testid="arbol-candado"][data-clave="categoria:losas"]');
    await irVistas(ses);
    await clicMundo(ses, 2, 1.5, 2.6); // centro de la losa
    await irProyecto(ses);
    const seleccionBloqueada = await seleccionEnArbol(ses);
    assert.equal(seleccionBloqueada, null, "la losa bloqueada no debe seleccionarse");

    // 4. Seleccionar en la vista expande el árbol hasta el elemento.
    await irVistas(ses);
    await elegirVista(ses, "Planta Nivel 0");
    await clicMundo(ses, 2, 3, 0); // centro del muro superior (lejos de los ejes)
    await irProyecto(ses);
    const seleccion = await seleccionEnArbol(ses);
    assert.ok(
      seleccion && seleccion.startsWith("elemento:"),
      `el clic en el muro debe seleccionar un elemento (fue ${seleccion})`,
    );
    await ses.captura(path.join(CAPTURAS, "o038-seleccion-expandida.png"));
  } finally {
    await ses.cerrar();
  }
});
