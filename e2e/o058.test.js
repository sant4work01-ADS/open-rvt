// O058: un muro de N0 con tope N5 atraviesa la losa de N4 y los cerramientos
// de N2. Los números salen de la spec, no del código: N0 0.00, N1 2.20,
// N2 2.40, N3 3.00, N4 3.20, N5 3.60; cerramientos 15×20 (2.20–2.40) y losa de
// N4 3.08–3.20. El cuerpo del muro va de 0.00 a 3.60 y se corta en los dos
// intervalos: volumen = huella × (3.60 − 0.20 − 0.12) = huella × 3.28.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O058");
const DIMENSION = { ancho: 1600, alto: 900 };
const LADOS = [
  [0, 0, 2.5, 0],
  [2.5, 0, 2.5, 1.5],
  [2.5, 1.5, 0, 1.5],
  [0, 1.5, 0, 0],
];
const CERRAMIENTO = "CE-1 Cerramiento 15×20";

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
  await activar(ses, "panel-pestana-vistas");
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
        .catch((error) => done({ ok: false, error: JSON.stringify(error) }));
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

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function seleccionarEnArbol(ses, gid) {
  await activar(ses, "panel-pestana-proyecto");
  await ses.driver.executeScript(
    (gid) => {
      const buscador = document.querySelector('[data-testid="arbol-buscador"]');
      if (!buscador) throw new Error("falta el buscador del árbol");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        buscador,
        gid,
      );
      buscador.dispatchEvent(new Event("input", { bubbles: true }));
    },
    gid,
  );
  await esperar(500);
  const fila = await ses.driver.wait(
    until.elementLocated(By.css(`[data-clave="elemento:${gid}"]`)),
    15_000,
    `el árbol no muestra el elemento ${gid}`,
  );
  await ses.driver.executeScript(
    (gid) => {
      const fila = document.querySelector(`[data-clave="elemento:${gid}"]`);
      if (!fila) throw new Error(`no está la fila ${gid}`);
      fila.click();
    },
    gid,
  );
  await esperar(800);
  const abrir = await ses.driver.findElements(By.css('[data-testid="panel-derecho-abrir"]'));
  if (abrir.length > 0) {
    await abrir[0].click();
    await esperar(300);
  }
}

function decodificarVertices(elemento) {
  const buffer = Buffer.from(elemento.vertices, "base64");
  const vertices = [];
  for (let i = 0; i + 12 <= buffer.length; i += 12) {
    vertices.push([
      buffer.readFloatLE(i),
      buffer.readFloatLE(i + 4),
      buffer.readFloatLE(i + 8),
    ]);
  }
  return vertices;
}

const murosDe = (elementos) => elementos.filter((e) => e.clase === "IfcWall");

test("O058: muro de N0 a N5 atraviesa cerramientos de N2 y losa de N4", async () => {
  const rutaIfc = path.join(os.tmpdir(), `o058-${Date.now()}.ifc`);
  const ses = await Sesion.abrir({
    prueba: "o058",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await invocar(ses, "proyecto.nuevo", { nombre: "O058" });
    for (const [nombre, elevacion] of [
      ["Nivel 1", 2.2],
      ["Nivel 2", 2.4],
      ["Nivel 3", 3.0],
      ["Nivel 4", 3.2],
      ["Nivel 5", 3.6],
    ]) {
      await invocar(ses, "niveles.crear", { nombre, elevacion });
    }
    const niveles = {};
    for (const nivel of await invocar(ses, "modelo.niveles")) {
      niveles[nivel.nombre] = nivel;
    }
    const n0 = niveles["Nivel 0"];
    assert.ok(n0, "falta el Nivel 0");

    // Muros de N0: al existir Nivel 1 quedan con tope automático en 2.20, que es
    // justo la cara inferior de los cerramientos de N2.
    const muros = [];
    for (const [x1, y1, x2, y2] of LADOS) {
      const creado = await invocar(ses, "muros.crear", {
        tipo: "Block 15",
        nivel: n0.globalid,
        x1,
        y1,
        x2,
        y2,
        altura: 3.6,
      });
      muros.push(creado.creados[0]);
    }

    // Losa de N0 de −0.12 a 0.00 y losa de N4 de 3.08 a 3.20.
    const contorno = LADOS.map(([x1, y1]) => [x1, y1]);
    await invocar(ses, "losas.crear", {
      nivel: n0.globalid,
      puntos: contorno,
      espesor: 0.12,
      desfase: 0,
    });
    for (const [x1, y1, x2, y2] of LADOS) {
      await invocar(ses, "cerramientos.crear", {
        tipo: CERRAMIENTO,
        x1,
        y1,
        x2,
        y2,
        nivel: niveles["Nivel 2"].globalid,
        desfase: 0,
      });
    }
    await invocar(ses, "losas.crear", {
      nivel: niveles["Nivel 4"].globalid,
      puntos: contorno,
      espesor: 0.12,
      desfase: 0,
    });

    // Guardar y reabrir para que la UI cargue los elementos creados por el núcleo.
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

    // El dueño cambia el tope de cada muro a Nivel 5 desde Propiedades.
    for (const gid of muros) {
      await seleccionarEnArbol(ses, gid);
      await ses.driver.wait(
        async () =>
          !!(await ses.driver.executeScript(
            () => document.querySelector('[data-testid="restriccion-tope"]'),
          )),
        10_000,
        "Propiedades no mostró la restricción de tope",
      );
      await fijarValor(ses, "restriccion-tope", niveles["Nivel 5"].globalid);
      await ses.driver.wait(
        async () => {
          const p = await props(ses, gid);
          return (
            p.restricciones?.NivelTope === niveles["Nivel 5"].globalid &&
            Math.abs(Number(p.psets?.OPENRVT_Muro?.Altura) - 3.6) < 1e-6
          );
        },
        20_000,
        `el muro ${gid} no quedó de N0 a N5`,
      );
    }

    // Geometría real: cada muro va de 0.00 a 3.60 y tiene vértices en los cortes.
    const elementos = (await invocar(ses, "geometria.teselar", { globalids: null }))
      .elementos;
    const murosTeselados = murosDe(elementos);
    assert.equal(murosTeselados.length, 4, `muros teselados: ${murosTeselados.length}`);
    const cortes = [2.2, 2.4, 3.08, 3.2];
    for (const muro of murosTeselados) {
      const vertices = decodificarVertices(muro);
      assert.ok(vertices.length > 0, `${muro.globalid} no tiene vértices`);
      const zs = vertices.map((v) => v[2]);
      const zmin = Math.min(...zs);
      const zmax = Math.max(...zs);
      assert.ok(Math.abs(zmin - 0.0) < 1e-4, `${muro.globalid}: z mín ${zmin}`);
      assert.ok(Math.abs(zmax - 3.6) < 1e-4, `${muro.globalid}: z máx ${zmax}`);
      for (const corte of cortes) {
        assert.ok(
          zs.some((z) => Math.abs(z - corte) < 1e-4),
          `${muro.globalid} no tiene el corte en ${corte}`,
        );
      }
    }

    // Cantidades del núcleo: el bruto es huella × 3.60 y el neto huella × 3.28.
    const cantidades = await invocar(ses, "cantidades.estructura", {});
    const filas = cantidades.elementos.filter((e) => e.alias === "muro");
    assert.equal(filas.length, 4, `muros en cantidades: ${filas.length}`);
    let bruto = 0;
    let neto = 0;
    for (const fila of filas) {
      assert.ok(
        Math.abs(Number(fila.detalle?.base_m) - 0.0) < 1e-6,
        `${fila.globalid}: base ${fila.detalle?.base_m}`,
      );
      assert.ok(
        Math.abs(Number(fila.detalle?.cima_m) - 3.6) < 1e-6,
        `${fila.globalid}: cima ${fila.detalle?.cima_m}`,
      );
      assert.ok(
        Number(fila.volumen_neto_m3) < Number(fila.volumen_bruto_m3),
        `${fila.globalid}: el neto no descontó los intermedios`,
      );
      bruto += Number(fila.volumen_bruto_m3);
      neto += Number(fila.volumen_neto_m3);
    }
    const razon = neto / bruto;
    assert.ok(
      Math.abs(razon - 3.28 / 3.6) < 1e-3,
      `neto/bruto ${razon.toFixed(6)} no es 3.28/3.60`,
    );

    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(800);
    await captura(ses, "01-muro-n0-n5-3d.png");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "02-planta-n0.png");
  } finally {
    await ses.cerrar();
  }
});
