// O057: cuatro cerramientos sobre los muros de Nivel 2 (corona 3.00) en la
// planta del Nivel 4, castillos del usuario que siguen a 3.60 y reinicio del
// trazo tras un error. Los números salen de la spec, no del código:
// N0 0.00, N1 2.20, N2 2.40, N3 3.00, N4 3.20, N5 3.60; peralte 0.20 → Z 3.10.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O057");
const DIMENSION = { ancho: 1600, alto: 900 };
const CASTILLO = "K-1 Castillo 15×15";
const LADOS = [
  [0, 0, 2.5, 0],
  [2.5, 0, 2.5, 1.5],
  [2.5, 1.5, 0, 1.5],
  [0, 1.5, 0, 0],
];

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

async function herramientaActiva(ses) {
  return ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-herramienta") ?? null,
  );
}

async function asegurarHerramienta(ses, nombre) {
  if ((await herramientaActiva(ses)) !== nombre) await activar(ses, `cmd-${nombre}`);
  assert.equal(await herramientaActiva(ses), nombre, `no quedó activa la herramienta ${nombre}`);
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
  const code = key === "Escape" ? "Escape" : key;
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
    },
    key,
    code,
  );
  await esperar(80);
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

async function dibujarMuros(ses, altura) {
  await activar(ses, "cmd-muro");
  await fijarValor(ses, "muro-altura", String(altura));
  for (const [x1, y1, x2, y2] of LADOS) {
    await clicMundo(ses, x1, y1);
    await clicMundo(ses, x2, y2);
    await tecla(ses, "Escape");
    await esperar(250);
  }
  await tecla(ses, "Escape");
  await activar(ses, "visor-ajustar");
  await esperar(600);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

const cerramientosDe = (elementos) =>
  elementos.filter((e) => e.estructura?.alias === "cerramiento");
const castillosDe = (elementos) =>
  elementos.filter((e) => e.estructura?.alias === "castillo");

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function alturaMuro(ses, gid) {
  return Number((await props(ses, gid)).psets?.OPENRVT_Muro?.Altura ?? NaN);
}

async function alturaCastillo(ses, gid) {
  return Number((await props(ses, gid)).psets?.OPENRVT_Estructura?.Altura ?? NaN);
}

async function esperarCantidad(ses, filtro, cuantos, mensaje) {
  return ses.driver.wait(
    async () => {
      const encontrados = filtro(await teselado(ses));
      return encontrados.length === cuantos ? encontrados : false;
    },
    20_000,
    mensaje,
  );
}

async function esperarAltura(ses, gid, esperado, mensaje) {
  await ses.driver.wait(
    async () => Math.abs((await alturaCastillo(ses, gid)) - esperado) < 1e-6,
    20_000,
    mensaje,
  );
}

const puntosHerramienta = (ses) =>
  ses.driver.executeScript(
    () =>
      Number(
        document
          .querySelector('[data-testid="visor"]')
          ?.getAttribute("data-puntos-herramienta") ?? -1,
      ),
  );

test("O057: cerramientos sobre N2, castillos del usuario a 3.60 y trazo reiniciado", async () => {
  const rutaIfc = path.join(os.tmpdir(), `o057-${Date.now()}.ifc`);
  const ses = await Sesion.abrir({
    prueba: "o057",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await crearNivel(ses, "Nivel 1", 2.2);
    await crearNivel(ses, "Nivel 2", 2.4);
    await crearNivel(ses, "Nivel 3", 3.0);
    await crearNivel(ses, "Nivel 4", 3.2);
    await crearNivel(ses, "Nivel 5", 3.6);
    await cambiarPestana(ses, "Modelar");

    // Muros de N0 (base 0.00, tope N1 → 2.20) y de N2 (base 2.40, tope N3 → 0.60).
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await dibujarMuros(ses, 2.2);
    await elegirVista(ses, "Planta Nivel 2");
    await activar(ses, "visor-ajustar");
    await dibujarMuros(ses, 0.6);

    let elementos = await teselado(ses);
    assert.equal(elementos.filter((e) => e.clase === "IfcWall").length, 8, "faltan muros");

    const niveles = await invocar(ses, "modelo.niveles");
    const nivel = (nombre) => {
      const encontrado = niveles.find((n) => n.nombre === nombre);
      assert.ok(encontrado, `falta ${nombre}`);
      return encontrado;
    };
    const n0 = nivel("Nivel 0");
    const n2 = nivel("Nivel 2");
    const n4 = nivel("Nivel 4");
    const n5 = nivel("Nivel 5");

    const referencias = await invocar(ses, "modelo.referencias");
    assert.equal(referencias.muros.length, 8, "referencias no ve los ocho muros");
    const muroEn = (base, x1, y1, x2, y2) => {
      const muro = referencias.muros.find(
        (m) =>
          Math.abs((m.base ?? 0) - base) < 1e-6 &&
          Math.abs(m.x1 - x1) < 1e-6 &&
          Math.abs(m.y1 - y1) < 1e-6 &&
          Math.abs(m.x2 - x2) < 1e-6 &&
          Math.abs(m.y2 - y2) < 1e-6,
      );
      assert.ok(muro, `no está el muro base ${base} (${x1}, ${y1})→(${x2}, ${y2})`);
      return muro;
    };
    const murosN0 = LADOS.map(([x1, y1, x2, y2]) => muroEn(0, x1, y1, x2, y2));
    const murosN2 = LADOS.map(([x1, y1, x2, y2]) => muroEn(2.4, x1, y1, x2, y2));

    // Cuatro castillos de esquina creados en los muros de N0 y con tope del
    // usuario en N5 (3.60), como en la bitácora.
    const castillos = [];
    for (const muro of murosN0) {
      const creado = await invocar(ses, "castillos.crear_en_muro", {
        tipo: CASTILLO,
        muro: muro.globalid,
        distancia: 0.075,
      });
      castillos.push(creado.creados[0]);
    }
    for (const gid of castillos) {
      await invocar(ses, "restricciones.editar", {
        globalid: gid,
        nivel_base: n0.globalid,
        desfase_base: 0,
        nivel_tope: n5.globalid,
        desfase_tope: 0,
      });
    }
    for (const gid of castillos) {
      await esperarAltura(ses, gid, 3.6, `el castillo ${gid} no arranca en 3.60`);
    }

    // Guardar y reabrir para que la UI cargue los castillos de la sesión.
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

    await elegirVista(ses, "Planta Nivel 4");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "01-planta-n4-antes.png");

    await activar(ses, "cmd-cerramiento");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="cerramiento-nivel"]')?.value,
      ),
      n4.globalid,
      "la barra no preselecciona el Nivel 4",
    );
    for (const [x, y] of [
      [0, 0],
      [2.5, 0],
      [2.5, 1.5],
      [0, 1.5],
      [0, 0],
    ]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape");
    const cerramientos = await esperarCantidad(
      ses,
      cerramientosDe,
      4,
      "la cadena no creó cuatro cerramientos",
    );
    await captura(ses, "02-cuatro-cerramientos.png");

    // Peralte 0.20 sobre la corona 3.00 → centro 3.10, de 3.00 a 3.20.
    for (const [i, cerramiento] of cerramientos.entries()) {
      const p = await props(ses, cerramiento.globalid);
      const z = Number(p.psets?.OPENRVT_Estructura?.Z);
      const peralte = Number(
        cerramiento.estructura?.seccion?.Peralte ?? cerramiento.estructura?.seccion?.H,
      );
      assert.ok(Math.abs(z - 3.1) < 1e-9, `cerramiento ${i}: Z ${z}`);
      assert.ok(Math.abs(peralte - 0.2) < 1e-9, `cerramiento ${i}: peralte ${peralte}`);
      assert.equal(
        p.restricciones?.NivelBase,
        n4.globalid,
        `cerramiento ${i}: NivelBase`,
      );
      const ligado = p.muro_liga?.muro;
      assert.ok(ligado, `cerramiento ${i} no quedó ligado a un muro`);
      assert.ok(
        murosN2.some((m) => m.globalid === ligado),
        `cerramiento ${i} se ligó al muro equivocado (${ligado})`,
      );
      assert.ok(
        !murosN0.some((m) => m.globalid === ligado),
        `cerramiento ${i} se ligó al muro de N0`,
      );
    }
    for (const muro of murosN0) {
      assert.ok(Math.abs((await alturaMuro(ses, muro.globalid)) - 2.2) < 1e-6, "muro N0");
    }
    for (const muro of murosN2) {
      assert.ok(Math.abs((await alturaMuro(ses, muro.globalid)) - 0.6) < 1e-6, "muro N2");
    }

    // El tope del usuario manda: los castillos siguen a 3.60 tras el trazo.
    for (const gid of castillos) {
      await esperarAltura(ses, gid, 3.6, `el cerramiento bajó el castillo ${gid}`);
      const p = await props(ses, gid);
      assert.equal(p.restricciones?.NivelTope, n5.globalid, "se perdió el NivelTope");
      assert.equal(p.restricciones?.NivelBase, n0.globalid, "se perdió el NivelBase");
    }
    assert.equal(castillosDe(await teselado(ses)).length, 4, "castillos duplicados");

    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "03-castillos-360.png");

    // Error al repetir un lado: el trazo queda reiniciado (0 puntos), no con el
    // primer punto viejo que dibujaría la diagonal en el clic siguiente.
    await elegirVista(ses, "Planta Nivel 4");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await asegurarHerramienta(ses, "cerramiento");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 2.5, 0);
    const diagnostico = async () =>
      JSON.stringify({
        aviso: await textoDom(ses, '[data-testid="estado-aviso"]'),
        error: await textoDom(ses, '[data-testid="estado-error"]'),
        puntos: await puntosHerramienta(ses),
        cerramientos: cerramientosDe(await teselado(ses)).length,
      });
    let avisoDuplicado = "";
    for (let i = 0; i < 30; i += 1) {
      avisoDuplicado = (await textoDom(ses, '[data-testid="estado-aviso"]')) ?? "";
      if (/ya tiene cerramiento/i.test(avisoDuplicado)) break;
      await esperar(300);
    }
    assert.match(
      avisoDuplicado,
      /ya tiene cerramiento/i,
      `repetir el lado no avisó: ${await diagnostico()}`,
    );
    assert.equal(await puntosHerramienta(ses), 0, "el trazo no se reinició tras el error");
    assert.equal(
      cerramientosDe(await teselado(ses)).length,
      4,
      "el error duplicó cerramientos",
    );
    // Un clic más tras el error empieza un trazo nuevo: si el primer punto viejo
    // se hubiera conservado, el cerramiento saldría diagonal y serían 5.
    await clicMundo(ses, 1.25, 1.0);
    assert.equal(await puntosHerramienta(ses), 1, "el clic tras el error no abrió trazo");
    assert.equal(
      cerramientosDe(await teselado(ses)).length,
      4,
      "el clic tras el error creó la diagonal",
    );
    await captura(ses, "04-error-reinicio.png");
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
  } finally {
    await ses.cerrar();
  }
});
