"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O045");
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

function distanciaASegmento(x, y, muro) {
  const dx = muro.x2 - muro.x1;
  const dy = muro.y2 - muro.y1;
  const largo2 = dx * dx + dy * dy;
  const t =
    largo2 <= 1e-12
      ? 0
      : Math.max(0, Math.min(1, ((x - muro.x1) * dx + (y - muro.y1) * dy) / largo2));
  return Math.hypot(x - (muro.x1 + t * dx), y - (muro.y1 + t * dy));
}

/** GlobalId del muro más cercano al clic, con la misma regla de la interfaz. */
function gidDelMuroEn(referencias, x, y) {
  let mejor = null;
  let distancia = Infinity;
  for (const muro of referencias.muros) {
    const d = distanciaASegmento(x, y, muro);
    if (d < distancia) {
      distancia = d;
      mejor = muro;
    }
  }
  assert.ok(mejor && distancia < 0.35, `no hay muro bajo (${x}, ${y})`);
  return mejor.globalid;
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


// Reporte del dueño (3-nov, 0.5.26): rectángulo de 4 muros con castillos en las esquinas; tres cerramientos salen y
// el del muro izquierdo no se puede dibujar.
function murosDe(elementos) {
  return elementos.filter((e) => e.clase === "IfcWall");
}

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

// Reporte del dueño (3-nov): cerramiento dibujado como muro sobre el muro izquierdo.
test("O045: archivo del dueño, trazo de esquina a esquina del muro izquierdo", async () => {
  const ses = await Sesion.abrir({ prueba: "o045-dueno", tamano: DIMENSION, lateralExpandido: true, compositar: true });
  const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O045");
  fs.mkdirSync(CAPTURAS, { recursive: true });
  try {
    const ruta = path.join(RAIZ, "e2e", "datos", "cerramiento-dueno.ifc");
    const copia = path.join(require("node:os").tmpdir(), "cerramiento-dueno-o045.ifc");
    fs.copyFileSync(ruta, copia);
    await ses.driver.executeScript(
      (rutas) => {
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) =>
          peticion.tipo === "abrir-ifc" ? rutas.abrir : null;
      },
      { abrir: copia },
    );
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () =>
        ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes(
          "cerramiento-dueno-o045",
        ),
      20_000,
      "no abrió el archivo del dueño",
    );
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(800);

    // O045: al abrir, los cuatro muros recuperan sus 3.60 (su tope).
    const elementos0 = await teselado(ses);
    const muros = murosDe(elementos0);
    assert.equal(muros.length, 4, `muros: ${muros.length}`);
    for (const muro of muros) {
      assert.ok(
        Math.abs((await alturaMuro(ses, muro.globalid)) - 3.6) < 1e-6,
        `el muro ${muro.globalid} no mide 3.60`,
      );
    }
    const referencias = await invocar(ses, "modelo.referencias");
    const izquierdo = referencias.muros.find(
      (m) => Math.abs(m.x1 - m.x2) < 1e-6 && Math.abs(m.x1) < 1e-6,
    );
    assert.ok(izquierdo, "no se encontró el muro izquierdo");
    const nivel1 = (await invocar(ses, "modelo.niveles")).find(
      (n) => Math.abs(n.elevacion - 2.2) < 1e-6,
    );
    assert.ok(nivel1, "no existe el nivel 2.20");
    const antes = cerramientosDe(elementos0);
    assert.equal(antes.length, 3, `cerramientos iniciales: ${antes.length}`);

    const antesPng = path.join(CAPTURAS, "01-dueno-antes.png");
    await ses.captura(antesPng);
    dimensionesPng(antesPng);

    // Una sola cadena: inicio en una esquina y fin en la otra.
    await activar(ses, "cmd-cerramiento");
    await clicMundo(ses, izquierdo.x1, izquierdo.y1);
    await clicMundo(ses, izquierdo.x2, izquierdo.y2);
    await esperar(1000);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");

    const despues = cerramientosDe(await teselado(ses));
    assert.equal(despues.length, 4, `antes 3, después ${despues.length}`);
    const previos = new Set(antes.map((c) => c.globalid));
    const nuevo = despues.find((c) => !previos.has(c.globalid));
    const datos = await props(ses, nuevo.globalid);
    assert.equal(datos.muro_liga?.muro, izquierdo.globalid, "no quedó ligado al muro izquierdo");
    assert.equal(datos.restricciones?.NivelBase, nivel1.globalid, "no quedó en el Nivel 1");
    assert.equal(Number(datos.restricciones?.DesfaseBase), 0, "no tiene desfase 0");
    // Sin duplicados en los otros tres muros.
    const porMuro = new Map();
    for (const c of despues) {
      const p = await props(ses, c.globalid);
      const muro = p.muro_liga?.muro;
      porMuro.set(muro, (porMuro.get(muro) ?? 0) + 1);
    }
    assert.equal(porMuro.size, 4, `muros con cerramiento: ${porMuro.size}`);
    for (const [muro, cuantos] of porMuro) assert.equal(cuantos, 1, `muro ${muro}: ${cuantos}`);

    const despuesPng = path.join(CAPTURAS, "02-dueno-despues.png");
    await ses.captura(despuesPng);
    dimensionesPng(despuesPng);
  } finally {
    await ses.cerrar();
  }
});

// Rectángulo nuevo de 7 × 5 m: cadena de 5 clics que recorre las 4 esquinas y cierra.
test("O045: cadena de 5 clics en un rectángulo de 7 × 5 deja uno por muro", async () => {
  const ses = await Sesion.abrir({ prueba: "o045-rectangulo", tamano: DIMENSION, lateralExpandido: true, compositar: true });
  const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O045");
  fs.mkdirSync(CAPTURAS, { recursive: true });
  try {
    await nuevoModelo(ses);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    for (const [x1, y1, x2, y2] of [
      [0, 0, 7, 0],
      [7, 0, 7, 5],
      [7, 5, 0, 5],
      [0, 5, 0, 0],
    ]) {
      await dibujarMuro(ses, x1, y1, x2, y2);
    }
    await activar(ses, "visor-ajustar");
    await esperar(700);
    const elementos = await teselado(ses);
    const muros = murosDe(elementos);
    assert.equal(muros.length, 4, `muros: ${muros.length}`);
    const alturasAntes = new Map();
    for (const muro of muros) {
      alturasAntes.set(
        muro.globalid,
        await alturaMuro(ses, muro.globalid),
      );
    }
    const referencias = await invocar(ses, "modelo.referencias");

    // Cadena: el fin de un muro es el inicio del siguiente; el quinto cierra.
    await activar(ses, "cmd-cerramiento");
    for (const [x, y] of [
      [0, 0],
      [7, 0],
      [7, 5],
      [0, 5],
      [0, 0],
    ]) {
      await clicMundo(ses, x, y);
      await esperar(500);
    }
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await esperar(600);

    const despues = await teselado(ses);
    const cers = cerramientosDe(despues);
    assert.equal(cers.length, 4, `cerramientos: ${cers.length}`);
    for (const c of cers) {
      const p = await props(ses, c.globalid);
      assert.ok(p.muro_liga?.muro, `${p.nombre} no quedó ligado a un muro`);
    }
    const murosLigados = new Set();
    for (const c of cers) {
      const p = await props(ses, c.globalid);
      murosLigados.add(p.muro_liga.muro);
    }
    assert.equal(murosLigados.size, 4, "los cuatro cerramientos no cubren los cuatro muros");
    for (const muro of muros) {
      assert.ok(
        Math.abs((await alturaMuro(ses, muro.globalid)) - alturasAntes.get(muro.globalid)) <
          1e-6,
        `el muro ${muro.globalid} cambió de altura`,
      );
      const p = await props(ses, cers[0].globalid);
      // O043/O050: en un modelo de un solo nivel no hay nivel intermedio que
      // fuerce la base; el cerramiento cuelga de la corona del muro de 2.60.
      assert.equal(Number(p.restricciones?.DesfaseBase), 2.6);
    }
    const cadenaPng = path.join(CAPTURAS, "03-rectangulo-cadena.png");
    await ses.captura(cadenaPng);
    dimensionesPng(cadenaPng);
    void referencias;
  } finally {
    await ses.cerrar();
  }
});

// Cantidades exactas: 7 × 2.60 de block 15, cerramiento 15 × 20 y dos castillos 15 × 15.
test("O045: cantidades descuentan cerramiento y castillos embebidos (16.08 m²)", async () => {
  const ses = await Sesion.abrir({ prueba: "o045-cantidades", tamano: DIMENSION, lateralExpandido: true, compositar: true });
  const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O045");
  fs.mkdirSync(CAPTURAS, { recursive: true });
  try {
    await nuevoModelo(ses);
    await crearNivel(ses, "N 2.20", 2.2);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    // Muro de 7 m de block 15 con altura 2.60 (la opción de la barra).
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    await fijarValor(ses, "muro-altura", "2.6");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 7, 0);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    await esperar(700);
    let elementos = await teselado(ses);
    const muro = murosDe(elementos)[0];
    assert.ok(muro, "no se dibujó el muro");
    // Con el nivel 2.20 encima, el muro nace restringido a 2.20; el caso mide
    // 2.60, así que su tope se fija en Nivel 0 + 2.60 como hace el usuario.
    const niveles = await invocar(ses, "modelo.niveles");
    const n0 = niveles.find((n) => n.nombre === "Nivel 0");
    await invocar(ses, "restricciones.editar", {
      globalid: muro.globalid,
      nivel_tope: n0.globalid,
      desfase_tope: 2.6,
    });
    await esperar(500);
    assert.ok(Math.abs((await alturaMuro(ses, muro.globalid)) - 2.6) < 1e-6, "altura del muro");

    // Cerramiento de 0 a 7 en la planta de 2.20, dibujado con la herramienta.
    await elegirVista(ses, "Planta N 2.20");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await activar(ses, "cmd-cerramiento");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 7, 0);
    await esperar(800);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    elementos = await teselado(ses);
    assert.equal(cerramientosDe(elementos).length, 1, "no se creó el cerramiento");

    // Dos castillos completos dentro del muro (centrados a 7.5 cm de cada extremo).
    await invocar(ses, "castillos.crear_en_muro", {
      tipo: "K-1 Castillo 15×15",
      muro: muro.globalid,
      distancia: 0.075,
    });
    await invocar(ses, "castillos.crear_en_muro", {
      tipo: "K-1 Castillo 15×15",
      muro: muro.globalid,
      distancia: 6.925,
    });
    await esperar(500);

    const cantidades = await invocar(ses, "cantidades.estructura");
    const info = cantidades.elementos.find((e) => e.alias === "muro");
    assert.ok(info, "no hay muro en cantidades");
    // 7 × 2.60 = 18.20; − (7 − 2×0.15) × 0.20 = 1.34; − 2×0.15×2.60 = 0.78.
    assert.equal(info.area_neta_m2, 16.08, `área de block: ${info.area_neta_m2}`);
    assert.equal(info.detalle.cima_m, 2.6, `cima del muro: ${info.detalle.cima_m}`);

    const medicion = await invocar(ses, "medicion.calcular");
    const block = medicion.partidas.find(
      (p) => p.nombre === "Muro de Block de concreto 15",
    );
    assert.ok(block, "no está la partida de block");
    assert.equal(block.total, 16.08, `block: ${block.total}`);
    const acabados = medicion.partidas.filter(
      (p) =>
        p.unidad === "m2" &&
        ["Pintura", "Aplanado", "Yeso"].some((prefijo) => p.nombre.startsWith(prefijo)),
    );
    assert.ok(acabados.length >= 4, `acabados: ${acabados.length}`);
    for (const partida of acabados) {
      assert.equal(partida.total, 18.2, `${partida.nombre}: ${partida.total}`);
    }
    const cantidadesPng = path.join(CAPTURAS, "04-cantidades.png");
    await ses.captura(cantidadesPng);
    dimensionesPng(cantidadesPng);
  } finally {
    await ses.cerrar();
  }
});
