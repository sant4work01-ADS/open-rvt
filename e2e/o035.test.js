// O035: el muro baja hasta el lecho superior de la cimentación con la INTERFAZ
// real de Tauri. Se dibuja una contratrabe con su herramienta, se baja su
// desfase en Propiedades, se dibuja un muro encima con la herramienta Muro y se
// comprueba que su base llega a la cimentación. Después se quita la casilla
// «Bajar hasta la cimentación» y el muro vuelve a nacer en el nivel.
// Capturas en docs/progreso/O035/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, activar } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O035");
const DIMENSION = { ancho: 1600, alto: 900 };

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

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
  await esperar(200);
}

async function fijarCampoPanel(ses, testid, valor) {
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
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      el.blur();
    },
    testid,
    valor,
  );
  await esperar(500);
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
  await esperar(700);
}

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) =>
      document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function clicMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
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
  await esperar(300);
}

async function moverMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: -1,
          buttons: 0,
          pointerId: 1,
          pointerType: "mouse",
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(250);
}

async function tecla(ses, ...teclas) {
  for (const tecla of teclas) {
    await ses.driver.executeScript((tecla) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const opciones = {
        key: tecla,
        code: tecla,
        bubbles: true,
        cancelable: true,
      };
      canvas.dispatchEvent(new KeyboardEvent("keydown", opciones));
      window.dispatchEvent(new KeyboardEvent("keyup", opciones));
      document.body.dispatchEvent(new KeyboardEvent("keydown", opciones));
      document.body.dispatchEvent(new KeyboardEvent("keyup", opciones));
    }, tecla);
    await esperar(250);
  }
}

async function tabHasta(ses, aliasEsperado) {
  const vistos = [];
  for (let i = 0; i < 8; i += 1) {
    await tecla(ses, "Tab");
    const gid = await ses.driver.executeScript(
      () =>
        document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    if (!gid) {
      vistos.push("(nada)");
      continue;
    }
    const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
    vistos.push(props.alias ?? props.clase);
    if ((props.alias ?? props.clase) === aliasEsperado) return gid;
  }
  assert.fail(`Tab no llegó a ${aliasEsperado}; pasó por ${vistos.join(" → ")}`);
}

function verticesDe(elemento) {
  const bytes = Uint8Array.from(Buffer.from(elemento.vertices, "base64"));
  const v = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const puntos = [];
  for (let i = 0; i + 2 < v.length; i += 3) puntos.push([v[i], v[i + 1], v[i + 2]]);
  return puntos;
}

function cajaDe(elemento) {
  const puntos = verticesDe(elemento);
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const zs = puntos.map((p) => p[2]);
  return {
    x0: Math.min(...xs), x1: Math.max(...xs),
    y0: Math.min(...ys), y1: Math.max(...ys),
    z0: Math.min(...zs), z1: Math.max(...zs),
  };
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

async function esperarMallas(ses, minimo) {
  await ses.driver.wait(async () => {
    const texto = await ses.driver.executeScript(
      () =>
        document.querySelector('[data-testid="visor"]')?.getAttribute("data-mallas") ??
        "0",
    );
    return Number(texto) >= minimo;
  }, 30_000, `no se dibujaron ${minimo} mallas`);
}

async function refrescarTodo(ses) {
  // Los dibujos por herramienta no siempre refrescan la tienda de React.
  await activar(ses, "cmd-deshacer");
  await esperar(600);
  await activar(ses, "cmd-rehacer");
  await esperar(1000);
}

async function ajustar(ses) {
  await ses.porTestid("visor-ajustar").then((b) => b.click());
  await esperar(600);
}

async function capturar(ses, archivo) {
  const ruta = path.join(CAPTURAS, archivo);
  await ses.captura(ruta);
  assert.ok(fs.existsSync(ruta), `falta ${archivo}`);
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${archivo} no es PNG`);
  assert.ok(cabecera.readUInt32BE(16) > 800, `${archivo} quedó pequeña`);
}

async function nuevoModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await cambiarPestana(ses, "Modelar");
  await elegirVista(ses, "Planta Nivel 0");
  await ajustar(ses);
}

function muroDe(elementos) {
  const muro = elementos.find((e) => e.clase === "IfcWall");
  assert.ok(muro, "no se creó el muro");
  return muro;
}

test("O035: el muro baja a la contratrabe y la casilla lo devuelve al nivel", async () => {
  const ses = await Sesion.abrir({
    prueba: "o035",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await nuevoModelo(ses);

    // 1. Contratrabe CT-1 (0.20 × 0.40) dibujada con la herramienta.
    await activar(ses, "cmd-contratrabe");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await tecla(ses, "Escape", "Escape");
    await esperarMallas(ses, 1);
    await refrescarTodo(ses);

    let elementos = await teselado(ses);
    const ct = elementos.find((e) => e.estructura?.alias === "contratrabe");
    assert.ok(ct, "no se creó la contratrabe con la herramienta");

    // 2. Se selecciona en planta y se baja el desfase a −0.30 con el panel.
    await clicMundo(ses, 2, 0, -0.15);
    await ses.driver.wait(
      async () =>
        !!(await ses.driver.executeScript(
          () => document.querySelector('[data-testid="elemento-desfase"]'),
        )),
      10_000,
      "el panel no mostró el desfase de la contratrabe",
    );
    await fijarCampoPanel(ses, "elemento-desfase", "-0.30");
    await ses.driver.wait(async () => {
      const props = await invocar(ses, "modelo.propiedades", { globalid: ct.globalid });
      return Math.abs(Number(props.psets?.OPENRVT_Estructura?.Desfase ?? 0) + 0.3) < 1e-6;
    }, 10_000, "el desfase de la contratrabe no quedó en −0.30");

    // 3. Muro Block 15 de 2.60 m encima, dibujado con la herramienta Muro.
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15");
    await fijarValor(ses, "muro-altura", "2.6");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await tecla(ses, "Escape", "Escape");
    await esperarMallas(ses, 2);
    await refrescarTodo(ses);

    elementos = await teselado(ses);
    const muro = muroDe(elementos);
    const cajaMuro = cajaDe(muro);
    // La cara superior de la contratrabe está en 0 − 0.30 = −0.30.
    assert.ok(
      Math.abs(cajaMuro.z0 + 0.30) < 1e-6,
      `la base del muro quedó en ${cajaMuro.z0}, se esperaba −0.30`,
    );
    assert.ok(Math.abs(cajaMuro.z1 - 2.60) < 1e-6, `la corona quedó en ${cajaMuro.z1}`);

    const cantidades = await invocar(ses, "cantidades.estructura", {});
    const infoMuro = cantidades.elementos.find((e) => e.globalid === muro.globalid);
    // 4 · 2.90 · 0.15 = 1.74 m³ (valor calculado a mano).
    assert.ok(
      Math.abs(infoMuro.volumen_bruto_m3 - 1.74) < 1e-6,
      `volumen bruto ${infoMuro.volumen_bruto_m3}`,
    );

    // 4. Capturas de alzado y 3D con el muro llegando a la cimentación.
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "Alzado Norte");
    await ajustar(ses);
    await capturar(ses, "o035-alzado.png");
    await elegirVista(ses, "3D Perspectiva");
    await ajustar(ses);
    await capturar(ses, "o035-3d.png");

    // 5. Propiedades: la casilla aparece activada; al quitarla el muro sube.
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await ajustar(ses);
    await moverMundo(ses, 2, 0);
    const seleccionado = await tabHasta(ses, "IfcWall");
    assert.equal(seleccionado, muro.globalid, "Tab no seleccionó el muro dibujado");
    const marcada = await ses.driver.executeScript(
      () =>
        document.querySelector('[data-testid="elemento-bajar-cimentacion"]')?.checked,
    );
    assert.equal(marcada, true, "la casilla no viene activada por omisión");

    await activar(ses, "elemento-bajar-cimentacion");
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      const fresco = lista.find((e) => e.globalid === muro.globalid);
      return fresco && Math.abs(cajaDe(fresco).z0) < 1e-6;
    }, 15_000, "el muro no volvió a nacer en el nivel al quitar la casilla");

    const props = await invocar(ses, "modelo.propiedades", { globalid: muro.globalid });
    assert.equal(props.psets?.OPENRVT_Muro?.BajarACimentacion, false);
    const despues = await invocar(ses, "cantidades.estructura", {});
    const infoDespues = despues.elementos.find((e) => e.globalid === muro.globalid);
    assert.ok(
      Math.abs(infoDespues.volumen_bruto_m3 - 1.56) < 1e-6,
      `volumen sin bajar ${infoDespues.volumen_bruto_m3}`,
    );

    await capturar(ses, "o035-casilla-quitada.png");
  } finally {
    await ses.cerrar();
  }
});
