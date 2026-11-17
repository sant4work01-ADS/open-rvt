// O067: cambiar la losa de nivel desde Propiedades. Proyecto nuevo, Nivel 1 en
// 3.00, una losa 4 × 5 dibujada en Nivel 0 y cambiada a Nivel 1 desde el select
// «Nivel» del panel; el árbol del proyecto debe mostrarla colgando de Nivel 1.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const DIMENSION = { ancho: 1600, alto: 900 };
const RECTANGULO = [
  [0, 0],
  [4, 0],
  [4, 5],
  [0, 5],
];

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 100 && alto > 100, `${ruta} mide ${ancho}×${alto}`);
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

async function clicMundo(ses, x, y, z = 0) {
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
  await esperar(450);
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

async function losaEnNivelDelArbol(ses, gid, nivel) {
  // Las filas del árbol son planas y en orden de profundidad: se busca la fila
  // del nivel, se despliega y se comprueba que la losa cae antes del nivel
  // siguiente.
  const desplegar = await ses.driver.executeScript(
    (nivel) => {
      const filas = Array.from(
        document.querySelectorAll('[data-testid="arbol-lista"] [data-testid="arbol-nodo"]'),
      );
      const fila = filas.find(
        (f) =>
          f.getAttribute("data-tipo") === "nivel" &&
          (f.querySelector("span[title]")?.textContent || "").trim().includes(nivel),
      );
      if (!fila) {
        return `sin-nivel: ${filas
          .map((f) => `${f.getAttribute("data-tipo")}=${(f.querySelector("span[title]")?.textContent || "").trim()}`)
          .slice(0, 12)
          .join(" | ")}`;
      }
      const boton = fila.querySelector('[data-testid="arbol-expandir"]');
      if (boton && boton.getAttribute("aria-expanded") !== "true") boton.click();
      return "ok";
    },
    nivel,
  );
  assert.equal(desplegar, "ok", `el árbol no muestra ${nivel}`);
  await esperar(400);
  return ses.driver.executeScript(
    (gid, nivel) => {
      const filas = Array.from(
        document.querySelectorAll('[data-testid="arbol-lista"] [data-testid="arbol-nodo"]'),
      );
      const indice = filas.findIndex(
        (f) =>
          f.getAttribute("data-tipo") === "nivel" &&
          (f.querySelector("span[title]")?.textContent || "").trim().includes(nivel),
      );
      if (indice < 0) return { ok: false, motivo: "nivel ausente" };
      let fin = filas.length;
      for (let i = indice + 1; i < filas.length; i += 1) {
        if (filas[i].getAttribute("data-tipo") === "nivel") {
          fin = i;
          break;
        }
      }
      const tramo = filas.slice(indice + 1, fin);
      const losa = tramo.find((f) => f.getAttribute("data-clave") === `elemento:${gid}`);
      return {
        ok: !!losa,
        motivo: tramo.map((f) => f.getAttribute("data-clave")).slice(0, 8),
      };
    },
    gid,
    nivel,
  );
}

test("O067: losa de Nivel 0 a Nivel 1 desde Propiedades y árbol", async () => {
    const ses = await Sesion.abrir({
    prueba: "o067",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await crearNivel(ses, "Nivel 1", 3.0);
    const niveles = await invocar(ses, "modelo.niveles");
    const n0 = niveles.find((n) => n.nombre === "Nivel 0");
    const n1 = niveles.find((n) => n.nombre === "Nivel 1");
    assert.ok(n0 && n1, `faltan niveles: ${JSON.stringify(niveles)}`);

    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(600);

    // Losa 4 × 5 = 20 m² en Nivel 0.
    await activar(ses, "cmd-losa");
    for (const [x, y] of RECTANGULO) await clicMundo(ses, x, y, 0);
    await activar(ses, "losa-cerrar");
    await esperar(800);
    for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape");

    // Seleccionar la losa y comprobar el nivel actual en el panel.
    await clicMundo(ses, 2, 2, 0);
    const gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    assert.ok(gid, "no quedó seleccionada la losa");
    const antes = await invocar(ses, "modelo.propiedades", { globalid: gid });
    assert.equal(antes.clase, "IfcSlab");
    assert.equal(antes.nivel, "Nivel 0");

    await ses.porTestid("prop-nivel-losa", 10_000);
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="prop-nivel-losa"]')?.value,
      ),
      n0.globalid,
      "el select no muestra el nivel actual de la losa",
    );

    // Cambiar al Nivel 1 desde el panel.
    await fijarValor(ses, "prop-nivel-losa", n1.globalid);
    await ses.driver.wait(
      async () => {
        const p = await invocar(ses, "modelo.propiedades", { globalid: gid });
        return p.nivel === "Nivel 1" && Number(p.psets?.OPENRVT_Losa?.Desfase ?? 0) === 0;
      },
      15_000,
      "la losa no cambió a Nivel 1",
    );

    // El árbol del proyecto la muestra colgando de Nivel 1.
    const pestana = await ses.driver.findElements(
      By.css('[data-testid="panel-pestana-proyecto"]'),
    );
    if (pestana.length > 0) {
      await pestana[0].click();
      await esperar(400);
    }
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="arbol-lista"] [data-testid="arbol-nodo"]')),
      10_000,
      "el árbol no cargó",
    );
    const arbol = await losaEnNivelDelArbol(ses, gid, "Nivel 1");
    assert.equal(arbol.ok, true, `la losa no cuelga de Nivel 1: ${JSON.stringify(arbol)}`);

    fs.mkdirSync(CAPTURAS, { recursive: true });
    const captura = path.join(CAPTURAS, "o067-losa-nivel.png");
    await ses.captura(captura);
    dimensionesPng(captura);

  } finally {
    await ses.cerrar();
  }
});
