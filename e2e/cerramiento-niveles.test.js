// Reporte del dueño (3-nov): 5 niveles (0, 2.20, 3.00, 3.20, 3.60), losa en el 0,
// zapatas, muros con restricción de Nivel 0 a Nivel 3.60, y cerramientos dibujados
// en la planta de 2.20. «No se dibujó bien con respecto a mis clics: el último no se
// dibujó, se redibujó de nuevo el primero.» Reproducción con la interfaz real.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O043");
const DIMENSION = { ancho: 1700, alto: 1000 };
const PERALTE = 0.2; // CE-1 Cerramiento 15×20: 20 cm de peralte.

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
  assert.ok(ancho > 100 && alto > 100, `${ruta} mide ${ancho}×${alto}`);
  return { ancho, alto };
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
  await esperar(150);
}

/** Campo controlado del panel: escribe, confirma con Enter y sale del campo. */
async function fijarCampoPanel(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
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
  await esperar(350);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
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
  return ses.driver.executeScript(
    (x, y, z) =>
      document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function moverMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
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
  return punto;
}

async function clicEn(ses, punto) {
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
  await esperar(350);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicEn(ses, await proyectar(ses, x, y, z));
}

async function tecla(ses, key, code = key) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }),
      );
    },
    key,
    code,
  );
  await esperar(350);
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

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(350);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

async function atributoVisor(ses, nombre) {
  return ses.driver.executeScript(
    (nombre) => document.querySelector('[data-testid="visor"]')?.getAttribute(nombre),
    nombre,
  );
}

async function esperarMurosVisibles(ses, gidsMuros, cuantos) {
  await ses.driver.wait(
    async () => {
      const visibles = new Set(((await atributoVisor(ses, "data-mallas-visibles")) ?? "").split(","));
      return gidsMuros.filter((gid) => visibles.has(gid)).length === cuantos;
    },
    15_000,
    `la planta no mostró ${cuantos} muros`,
  );
}

function gidDelMuroExacto(referencias, x1, y1, x2, y2) {
  const muro = referencias.muros.find(
    (m) =>
      Math.abs(m.x1 - x1) < 1e-6 &&
      Math.abs(m.y1 - y1) < 1e-6 &&
      Math.abs(m.x2 - x2) < 1e-6 &&
      Math.abs(m.y2 - y2) < 1e-6,
  );
  assert.ok(muro, `no está el muro (${x1}, ${y1})→(${x2}, ${y2})`);
  return muro.globalid;
}

function cerramientosDe(elementos) {
  return elementos.filter((e) => e.estructura?.alias === "cerramiento");
}

async function esperarSeleccion(ses, aliasEsperado) {
  return ses.driver.wait(
    async () => {
      const actual = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
      );
      if (!actual) return false;
      const props = await invocar(ses, "modelo.propiedades", { globalid: actual });
      return props.alias === aliasEsperado ? actual : false;
    },
    15_000,
    `Tab no seleccionó un ${aliasEsperado}`,
  );
}

async function tabHasta(ses, aliasEsperado) {
  const vistos = [];
  for (let i = 0; i < 8; i += 1) {
    await tecla(ses, "Tab", "Tab");
    const gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    if (!gid) {
      vistos.push("(nada)");
      continue;
    }
    const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
    vistos.push(props.alias ?? props.clase);
    if (props.alias === aliasEsperado) return gid;
  }
  assert.fail(`Tab no llegó a ${aliasEsperado}; pasó por ${vistos.join(" → ")}`);
}

async function alturaMuro(ses, gid) {
  const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
  return Number(props.psets?.OPENRVT_Muro?.Altura ?? NaN);
}

async function esperarAltura(ses, gid, esperado) {
  await ses.driver.wait(
    async () => Math.abs((await alturaMuro(ses, gid)) - esperado) < 1e-6,
    15_000,
    `el muro ${gid} no llegó a ${esperado} m`,
  );
}


test("Cerramientos en la planta de un nivel intermedio: uno por cada clic, en su muro", async () => {
  const ses = await Sesion.abrir({ prueba: "cerramiento-niveles", tamano: DIMENSION, lateralExpandido: true, compositar: true });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await nuevoModelo(ses);
    for (const [nombre, elev] of [["N 2.20", 2.2], ["N 3.00", 3.0], ["N 3.20", 3.2], ["N 3.60", 3.6]]) {
      await crearNivel(ses, nombre, elev);
    }
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    const muros = [
      [0, 0, 8, 0],
      [0, 3, 8, 3],
      [0, 6, 8, 6],
      [0, 0, 0, 6],
      [4, 0, 4, 6],
      [8, 0, 8, 6],
    ];
    for (const [x1, y1, x2, y2] of muros) await dibujarMuro(ses, x1, y1, x2, y2);
    await activar(ses, "visor-ajustar");
    await esperar(700);
    let elementos = await teselado(ses);
    const gidsMuros = elementos.filter((e) => e.clase === "IfcWall").map((e) => e.globalid);
    assert.equal(gidsMuros.length, 6, `muros: ${gidsMuros.length}`);
    const niveles = await invocar(ses, "modelo.niveles");
    const tope = niveles.find((n) => n.nombre === "N 3.60");
    for (const gid of gidsMuros) {
      await invocar(ses, "restricciones.editar", { globalid: gid, nivel_tope: tope.globalid, desfase_tope: 0 });
    }

    // O043: la planta de 2.20 es un corte horizontal y muestra los seis muros
    // del Nivel 0 aunque suban a 3.60, antes de dibujar nada.
    await elegirVista(ses, "Planta N 2.20");
    await activar(ses, "visor-ajustar");
    await esperarMurosVisibles(ses, gidsMuros, 6);
    const antes = path.join(CAPTURAS, "antes.png");
    await ses.captura(antes);
    dimensionesPng(antes);

    const nivel220 = niveles.find((n) => n.nombre === "N 2.20");
    const referencias = await invocar(ses, "modelo.referencias");
    await activar(ses, "cmd-cerramiento");
    const nivelBarra = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="cerramiento-nivel"]')?.value,
    );
    assert.equal(
      nivelBarra,
      nivel220.globalid,
      "la barra de la herramienta no preselecciona el nivel de la planta",
    );
    // Salir de la herramienta: el bucle la activa en cada trazo y activarla dos
    // veces seguidas la apagaría.
    await tecla(ses, "Escape", "Escape");
    const creados = [];
    const hechos = [];
    for (const [x1, y1, x2, y2] of muros) {
      const muroEsperado = gidDelMuroExacto(referencias, x1, y1, x2, y2);
      const previos = new Set(cerramientosDe(await teselado(ses)).map((c) => c.globalid));
      await activar(ses, "cmd-cerramiento");
      await clicMundo(ses, x1, y1);
      await clicMundo(ses, x2, y2);
      const nuevos = await ses.driver.wait(
        async () => {
          const actuales = cerramientosDe(await teselado(ses));
          const diff = actuales.filter((c) => !previos.has(c.globalid));
          return diff.length === 1 ? diff : false;
        },
        15_000,
        `el trazo (${x1}, ${y1})→(${x2}, ${y2}) no creó exactamente un cerramiento`,
      );
      creados.push(cerramientosDe(await teselado(ses)).length);
      const p = await invocar(ses, "modelo.propiedades", { globalid: nuevos[0].globalid });
      assert.equal(
        p.muro_liga?.muro,
        muroEsperado,
        `el cerramiento (${x1}, ${y1})→(${x2}, ${y2}) no quedó en su muro`,
      );
      assert.equal(
        p.restricciones?.NivelBase,
        nivel220.globalid,
        `el cerramiento ${p.nombre} no quedó en N 2.20`,
      );
      assert.equal(
        Number(p.restricciones?.DesfaseBase),
        0,
        `el cerramiento ${p.nombre} no tiene desfase 0`,
      );
      hechos.push({ cerramiento: nuevos[0].globalid, muro: muroEsperado });
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
    }
    const despues = path.join(CAPTURAS, "despues.png");
    await ses.captura(despues);
    dimensionesPng(despues);
    assert.deepEqual(creados, [1, 2, 3, 4, 5, 6], `cerramientos tras cada clic: ${creados}`);

    elementos = await teselado(ses);
    let cers = cerramientosDe(elementos);
    assert.equal(cers.length, 6, `cerramientos: ${cers.length}`);
    assert.deepEqual(
      new Set(hechos.map((h) => h.muro)),
      new Set(gidsMuros),
      "los seis cerramientos no cubren los seis muros",
    );
    for (const gid of gidsMuros) {
      await esperarAltura(ses, gid, 3.6);
    }
    const visibles = new Set(((await atributoVisor(ses, "data-mallas-visibles")) ?? "").split(","));
    for (const gid of gidsMuros) assert.ok(visibles.has(gid), `el muro ${gid} no se ve en la planta`);
    for (const c of cers) assert.ok(visibles.has(c.globalid), `el cerramiento ${c.globalid} no se ve`);

    // O043/O045: repetir el trazo del primer muro avisa y no toca el modelo.
    const gidsAntes = new Set(cers.map((c) => c.globalid));
    const alturasAntes = new Map();
    for (const gid of gidsMuros) alturasAntes.set(gid, await alturaMuro(ses, gid));
    await activar(ses, "cmd-cerramiento");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 8, 0);
    await esperar(800);
    const aviso = await textoDom(ses, '[data-testid="estado-aviso"]');
    assert.match(
      aviso ?? "",
      /ya tiene cerramiento en N 2\.20/,
      `aviso del tramo repetido: ${aviso}`,
    );
    elementos = await teselado(ses);
    cers = cerramientosDe(elementos);
    assert.equal(cers.length, 6, `el séptimo clic dejó ${cers.length} cerramientos`);
    assert.deepEqual(new Set(cers.map((c) => c.globalid)), gidsAntes);
    for (const gid of gidsMuros) {
      assert.ok(
        Math.abs((await alturaMuro(ses, gid)) - alturasAntes.get(gid)) < 1e-9,
        `el tramo repetido cambió la altura del muro ${gid}`,
      );
    }
  } finally {
    await ses.cerrar();
  }
});

test("Caso del dueño: losa, zapatas, muros de 0 a 3.60 y cerramientos desde la planta de 2.20", async () => {
  const ses = await Sesion.abrir({
    prueba: "cerramiento-dueno",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await nuevoModelo(ses);
    for (const [nombre, elev] of [
      ["N 2.20", 2.2],
      ["N 3.00", 3.0],
      ["N 3.20", 3.2],
      ["N 3.60", 3.6],
    ]) {
      await crearNivel(ses, nombre, elev);
    }
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    const muros = [
      [0, 0, 8, 0],
      [0, 3, 8, 3],
      [0, 6, 8, 6],
      [0, 0, 0, 6],
      [4, 0, 4, 6],
      [8, 0, 8, 6],
    ];
    for (const [x1, y1, x2, y2] of muros) await dibujarMuro(ses, x1, y1, x2, y2);
    await activar(ses, "visor-ajustar");
    await esperar(700);
    let elementos = await teselado(ses);
    const gidsMuros = elementos.filter((e) => e.clase === "IfcWall").map((e) => e.globalid);
    assert.equal(gidsMuros.length, 6, `muros: ${gidsMuros.length}`);
    const niveles = await invocar(ses, "modelo.niveles");
    const nivel0 = niveles.find((n) => n.nombre === "Nivel 0") ?? niveles[0];
    const nivel220 = niveles.find((n) => n.nombre === "N 2.20");
    const tope = niveles.find((n) => n.nombre === "N 3.60");
    for (const gid of gidsMuros) {
      await invocar(ses, "restricciones.editar", {
        globalid: gid,
        nivel_tope: tope.globalid,
        desfase_tope: 0,
      });
    }

    // Losa en el Nivel 0 (8 × 6 × 0.10) y nueve zapatas aisladas en las esquinas
    // y cruces de la retícula (x = 0, 4, 8; y = 0, 3, 6).
    await invocar(ses, "losas.crear", {
      nivel: nivel0.globalid,
      puntos: [
        [0, 0],
        [8, 0],
        [8, 6],
        [0, 6],
      ],
      espesor: 0.1,
    });
    for (const x of [0, 4, 8]) {
      for (const y of [0, 3, 6]) {
        await invocar(ses, "zapatas.crear", {
          tipo: "Z-1 Zapata 1.20×1.20",
          nivel: nivel0.globalid,
          x,
          y,
          desplante: 1.0,
        });
      }
    }
    // Las creaciones por comando se recargan con deshacer/rehacer, como en O041.
    await activar(ses, "cmd-deshacer");
    await esperar(600);
    await activar(ses, "cmd-rehacer");
    await esperar(1200);
    elementos = await teselado(ses);
    assert.equal(elementos.filter((e) => e.clase === "IfcSlab").length, 1, "falta la losa");
    assert.equal(
      elementos.filter((e) => e.clase === "IfcFooting").length,
      9,
      "no están las nueve zapatas",
    );

    // Cerramientos desde la planta de 2.20, en el orden 1 a 6, uno por muro.
    await elegirVista(ses, "Planta N 2.20");
    await activar(ses, "visor-ajustar");
    await esperarMurosVisibles(ses, gidsMuros, 6);
    const antes = path.join(CAPTURAS, "dueno-antes.png");
    await ses.captura(antes);
    dimensionesPng(antes);

    const referencias = await invocar(ses, "modelo.referencias");
    const creados = [];
    const hechos = [];
    for (const [x1, y1, x2, y2] of muros) {
      const muroEsperado = gidDelMuroExacto(referencias, x1, y1, x2, y2);
      const previos = new Set(cerramientosDe(await teselado(ses)).map((c) => c.globalid));
      await activar(ses, "cmd-cerramiento");
      await clicMundo(ses, x1, y1);
      await clicMundo(ses, x2, y2);
      const nuevos = await ses.driver.wait(
        async () => {
          const actuales = cerramientosDe(await teselado(ses));
          const diff = actuales.filter((c) => !previos.has(c.globalid));
          return diff.length === 1 ? diff : false;
        },
        15_000,
        `el trazo (${x1}, ${y1})→(${x2}, ${y2}) no creó exactamente un cerramiento`,
      );
      creados.push(cerramientosDe(await teselado(ses)).length);
      const p = await invocar(ses, "modelo.propiedades", { globalid: nuevos[0].globalid });
      assert.equal(p.muro_liga?.muro, muroEsperado, `cerramiento fuera del muro (${x1}, ${y1})→(${x2}, ${y2})`);
      assert.equal(p.restricciones?.NivelBase, nivel220.globalid, `nivel de ${p.nombre}`);
      assert.equal(Number(p.restricciones?.DesfaseBase), 0, `desfase de ${p.nombre}`);
      hechos.push({ cerramiento: nuevos[0].globalid, muro: muroEsperado });
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
    }
    const despues = path.join(CAPTURAS, "dueno-despues.png");
    await ses.captura(despues);
    dimensionesPng(despues);
    assert.deepEqual(creados, [1, 2, 3, 4, 5, 6], `cerramientos tras cada clic: ${creados}`);

    elementos = await teselado(ses);
    let cers = cerramientosDe(elementos);
    assert.equal(cers.length, 6, `cerramientos: ${cers.length}`);
    assert.deepEqual(new Set(hechos.map((h) => h.muro)), new Set(gidsMuros));
    for (const gid of gidsMuros) await esperarAltura(ses, gid, 3.6);
    const visibles = new Set(((await atributoVisor(ses, "data-mallas-visibles")) ?? "").split(","));
    for (const gid of gidsMuros) assert.ok(visibles.has(gid), `el muro ${gid} no se ve`);
    for (const c of cers) assert.ok(visibles.has(c.globalid), `el cerramiento ${c.globalid} no se ve`);

    const gidsAntes = new Set(cers.map((c) => c.globalid));
    const alturasAntes = new Map();
    for (const gid of gidsMuros) alturasAntes.set(gid, await alturaMuro(ses, gid));
    await activar(ses, "cmd-cerramiento");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 8, 0);
    await esperar(800);
    const aviso = await textoDom(ses, '[data-testid="estado-aviso"]');
    assert.match(aviso ?? "", /ya tiene cerramiento en N 2\.20/, `aviso: ${aviso}`);
    cers = cerramientosDe(await teselado(ses));
    assert.equal(cers.length, 6, `el séptimo clic dejó ${cers.length} cerramientos`);
    assert.deepEqual(new Set(cers.map((c) => c.globalid)), gidsAntes);
    for (const gid of gidsMuros) {
      assert.ok(
        Math.abs((await alturaMuro(ses, gid)) - alturasAntes.get(gid)) < 1e-9,
        `el tramo repetido cambió la altura del muro ${gid}`,
      );
    }
  } finally {
    await ses.cerrar();
  }
});
