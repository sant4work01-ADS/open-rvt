// O055: ejes, niveles, cotas y notas en las vistas 3D (Tauri + WebDriver real).
// Caso calculado a mano: retícula 3 × 3 (3 ejes verticales y 3 horizontales),
// niveles 0.00 y 3.00 y 4 muros de 2.60. En la isométrica:
//   · 6 ejes × 2 extremos = 12 globos;
//   · 2 niveles = 2 rectángulos discontinuos;
//   · 3 ejes por familia → 2 parciales + 1 total por familia = 6 cotas.
// La nota 3D va en la cara del muro A que mira a +Y; como la línea de ubicación
// puede desplazar el espesor, la cara esperada se toma de la malla teselada del
// muro (cara +Y) y se pide a z = 1.30 y x = 4.00. La nota de planta va en (2, 2, 0).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O055");
fs.mkdirSync(CAPTURAS, { recursive: true });

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
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

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
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

async function irModulo(ses, id) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`nav[aria-label="Módulos"] [data-modulo="${id}"]`)),
    10_000,
  );
  await boton.click();
  await esperar(400);
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

async function limitesMalla(ses, globalid) {
  const teselado = await invocar(ses, "geometria.teselar", { globalids: [globalid] });
  const elemento = teselado.elementos.find((e) => e.globalid === globalid);
  assert.ok(elemento, `no se teseló ${globalid}`);
  const bytes = Buffer.from(elemento.vertices, "base64");
  const vertices = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let eje = 0; eje < 3; eje += 1) {
      min[eje] = Math.min(min[eje], vertices[i + eje]);
      max[eje] = Math.max(max[eje], vertices[i + eje]);
    }
  }
  return { min, max };
}

async function clicPantalla(ses, punto) {  await ses.driver.executeScript(
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
  await esperar(300);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicPantalla(ses, await proyectar(ses, x, y, z));
}

async function asegurarNota(ses) {
  const activa = await ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-herramienta"),
  );
  if (activa !== "nota") await activar(ses, "cmd-nota");
}

async function clicNota(ses, punto) {  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(300);
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
  await esperar(120);
}

async function escribirNota(ses, texto) {
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="nota-campo"]')),
    10_000,
    "no apareció el editor de la nota",
  );
  await ses.driver.executeScript((texto) => {
    const campo = document.querySelector('[data-testid="nota-campo"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
      campo,
      texto,
    );
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  }, texto);
  await esperar(150);
  await ses.driver.executeScript(() => {
    const campo = document.querySelector('[data-testid="nota-campo"]');
    campo.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await esperar(600);
}

async function notas(ses) {
  return invocar(ses, "notas.listar");
}

async function esperarNotas(ses, cantidad, ms = 15_000) {
  return ses.driver.wait(
    async () => (await notas(ses)).length === cantidad,
    ms,
    `no hay ${cantidad} notas`,
  );
}

async function dataset(ses, nombre) {
  return ses.driver.executeScript(
    (nombre) => document.querySelector('[data-testid="visor"]')?.dataset?.[nombre] ?? null,
    nombre,
  );
}

async function crearModelo(ses) {
  await activar(ses, "cmd-nuevo");
  const descartar = await ses.driver.findElements(
    By.xpath('//button[normalize-space(.)="No guardar"]'),
  );
  if (descartar.length > 0) {
    await descartar[0].click();
    await esperar(600);
  }
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await cambiarPestana(ses, "Modelar");
}

async function dibujarEjes(ses, tramos) {
  await activar(ses, "cmd-eje");
  for (const [[x1, y1], [x2, y2]] of tramos) {
    await clicMundo(ses, x1, y1);
    await clicMundo(ses, x2, y2);
  }
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(500);
}

async function crearNivel(ses, nombre, elevacion) {
  await irModulo(ses, "niveles");
  await fijarValor(ses, "nivel-nuevo-nombre", nombre);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(800);
  await irModulo(ses, "modelo");
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(350);
}

async function marcarTodosLosNiveles(ses) {
  await ses.driver.executeScript(() => {
    for (const casilla of document.querySelectorAll('[data-testid^="nivel-visible-"]')) {
      if (!casilla.checked) casilla.click();
    }
  });
  await esperar(500);
}

async function fijarEstilo(ses, estilo) {
  await cambiarPestana(ses, "Vista");
  await fijarValor(ses, "vista-estilo", estilo);
  await esperar(700);
  assert.equal(await dataset(ses, "estiloVista"), estilo, `no se aplicó el estilo ${estilo}`);
}

async function abrirPanelAnotaciones(ses) {
  const abierto = await ses.driver.executeScript(() => {
    const boton = document.querySelector('[data-testid="visor-anotaciones"]');
    if (!boton) return false;
    if (boton.getAttribute("aria-expanded") !== "true") boton.click();
    return true;
  });
  assert.equal(abierto, true, "no apareció el botón Anotaciones");
  await ses.porTestid("visor-anotaciones-panel");
}

async function conmutador(ses, clave, encender) {
  await ses.driver.executeScript(
    (clave, encender) => {
      const casilla = document.querySelector(`[data-testid="visor-anotaciones-${clave}"]`);
      if (!casilla) throw new Error(`falta el conmutador ${clave}`);
      if (casilla.checked !== encender) casilla.click();
    },
    clave,
    encender,
  );
  await esperar(500);
}

async function comprobarAnotaciones(ses, esperado, contexto) {
  const globos = Number(await dataset(ses, "globosEjes3d"));
  const niveles = Number(await dataset(ses, "niveles3d"));
  const cotas = Number(await dataset(ses, "cotas3d"));
  assert.deepEqual(
    { globos, niveles, cotas },
    esperado,
    `${contexto}: dataset de anotaciones 3D`,
  );
}

test("O055: ejes, niveles, cotas y notas en 3D, planta y alzado", async () => {
  const ses = await Sesion.abrir({
    prueba: "o055",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const ruta = path.join(os.tmpdir(), "o055.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await elegirVista(ses, "Planta Nivel 0");

    // 1. Niveles 0 / 3.00 (el 0 ya existe).
    await crearNivel(ses, "Nivel 1", 3);
    const nivelesModelo = await invocar(ses, "modelo.niveles");
    assert.deepEqual(
      nivelesModelo.map((n) => n.elevacion).sort((a, b) => a - b),
      [0, 3],
      "faltan los niveles 0 y 3.00",
    );

    // 2. Retícula 3 × 3: tres verticales (1, 2, 3) y tres horizontales (A, B, C).
    await dibujarEjes(ses, [
      [[0, -2], [0, 10]],
      [[4, -2], [4, 10]],
      [[8, -2], [8, 10]],
      [[-2, 0], [10, 0]],
      [[-2, 4], [10, 4]],
      [[-2, 8], [10, 8]],
    ]);
    const referencias = await invocar(ses, "modelo.referencias");
    assert.equal(referencias.ejes.length, 6, "la retícula debe tener 6 ejes");
    assert.equal(referencias.ejes.filter((e) => e.vertical).length, 3, "faltan verticales");
    assert.equal(referencias.ejes.filter((e) => !e.vertical).length, 3, "faltan horizontales");

    // 3. Cuatro muros de 2.60 sobre el perímetro de la retícula.
    await dibujarMuro(ses, 0, 0, 8, 0);
    await dibujarMuro(ses, 8, 0, 8, 8);
    await dibujarMuro(ses, 8, 8, 0, 8);
    await dibujarMuro(ses, 0, 8, 0, 0);
    const elementos = await invocar(ses, "modelo.elementos");
    const muros = elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(muros.length, 4, `muros: ${muros.length}`);

    // 4. Isométrica con todos los niveles visibles.
    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await cambiarPestana(ses, "Vista");
    await marcarTodosLosNiveles(ses);
    await abrirPanelAnotaciones(ses);

    await conmutador(ses, "ejes3d", true);
    await conmutador(ses, "niveles3d", true);
    await conmutador(ses, "cotas3d", true);
    // Las notas vienen encendidas por omisión: se apagan y se vuelven a encender.
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor-anotaciones-notas3d"]')?.checked,
      ),
      true,
      "Notas debe venir encendido por omisión",
    );
    await conmutador(ses, "notas3d", false);
    assert.equal(Number(await dataset(ses, "notas3d")), 0, "con Notas apagado no debe haber notas");
    await conmutador(ses, "notas3d", true);

    // 6 ejes × 2 globos, 2 niveles y 6 cotas (2 parciales + 1 total por familia).
    await comprobarAnotaciones(ses, { globos: 12, niveles: 2, cotas: 6 }, "iso");

    // La etiqueta del nivel va fuera de su rectángulo y su caja en pantalla no se
    // cruza con ningún globo de eje ni con la otra etiqueta de nivel.
    const cajasGlobos = JSON.parse(await dataset(ses, "globosEjesPx"));
    const cajasNiveles = JSON.parse(await dataset(ses, "etiquetasNivelPx"));
    assert.equal(cajasGlobos.length, 12, "faltan las 12 cajas de globos en pantalla");
    assert.equal(cajasNiveles.length, 2, "faltan las 2 etiquetas de nivel en pantalla");
    const seCruzan = (a, b) =>
      a.x < b.x + b.ancho &&
      b.x < a.x + a.ancho &&
      a.y < b.y + b.alto &&
      b.y < a.y + a.alto;
    for (let i = 0; i < cajasNiveles.length; i += 1) {
      for (let j = 0; j < cajasGlobos.length; j += 1) {
        assert.equal(
          seCruzan(cajasNiveles[i], cajasGlobos[j]),
          false,
          `la etiqueta de nivel ${i} se cruza con el globo ${j}: ${JSON.stringify(cajasNiveles[i])} vs ${JSON.stringify(cajasGlobos[j])}`,
        );
      }
      for (let j = i + 1; j < cajasNiveles.length; j += 1) {
        assert.equal(
          seCruzan(cajasNiveles[i], cajasNiveles[j]),
          false,
          `las etiquetas de nivel ${i} y ${j} se cruzan`,
        );
      }
    }
    await ses.captura(path.join(CAPTURAS, "iso-anotaciones.png"));

    // 5. Nota sobre la cara +Y del muro A. La cara se mide en su malla teselada.
    const refsMuros = await invocar(ses, "modelo.referencias");
    const muroA = refsMuros.muros.find(
      (m) =>
        Math.abs(m.x1) < 1e-6 &&
        Math.abs(m.x2 - 8) < 1e-6 &&
        Math.abs(m.y1) < 1e-6 &&
        Math.abs(m.y2) < 1e-6,
    );
    assert.ok(muroA, "no se encontró el muro A en las referencias");
    const limitesMuroA = await limitesMalla(ses, muroA.globalid);
    const caraY = limitesMuroA.max[1];
    await cambiarPestana(ses, "Anotar");
    await activar(ses, "cmd-nota");
    await clicNota(ses, await proyectar(ses, 4, caraY, 1.3));
    await escribirNota(ses, "Nota en cara del muro");
    await esperarNotas(ses, 1);
    const [notaMuro] = await notas(ses);
    assert.equal(notaMuro.texto, "Nota en cara del muro");
    assert.ok(
      Math.abs(notaMuro.posicion[0] - 4) < 0.1,
      `la nota no quedó a x = 4.00: x = ${notaMuro.posicion[0]}`,
    );
    assert.ok(
      Math.abs(notaMuro.posicion[1] - caraY) < 0.02,
      `la nota no quedó en la cara +Y (${caraY}): y = ${notaMuro.posicion[1]}`,
    );
    assert.ok(
      Math.abs(notaMuro.posicion[2] - 1.3) < 0.1,
      `la nota no quedó a z = 1.30: z = ${notaMuro.posicion[2]}`,
    );
    await ses.captura(path.join(CAPTURAS, "nota-cara-muro.png"));

    // 6. Nota en planta en (2, 2, 0) del Nivel 0.
    await elegirVista(ses, "Planta Nivel 0");
    await esperar(500);
    await asegurarNota(ses);
    await clicNota(ses, await proyectar(ses, 2, 2, 0));
    await escribirNota(ses, "Nota en planta");
    await esperarNotas(ses, 2);
    const todas = await notas(ses);
    const notaPlanta = todas.find((n) => n.texto === "Nota en planta");
    assert.ok(notaPlanta, "no se creó la nota de planta");
    // El clic se redondea a la rejilla de pantalla: se admite 5 cm en planta.
    assert.ok(Math.abs(notaPlanta.posicion[0] - 2) < 0.05, `x = ${notaPlanta.posicion[0]}`);
    assert.ok(Math.abs(notaPlanta.posicion[1] - 2) < 0.05, `y = ${notaPlanta.posicion[1]}`);
    assert.equal(notaPlanta.posicion[2], 0, "la nota de planta debe quedar a la elevación 0");
    assert.equal(notaPlanta.nivel, "Nivel 0");
    await ses.captura(path.join(CAPTURAS, "nota-planta.png"));

    // 7. Las dos notas se ven en 3D, en planta y en alzado, en los 3 estilos.
    const esperadoNotas = todas.map((n) => n.globalid).sort().join(",");
    for (const vista of ["3D Isométrica", "Planta Nivel 0", "Alzado Sur"]) {
      await elegirVista(ses, vista);
      for (const estilo of ["sombreado", "aristas", "lineas-ocultas"]) {
        await fijarEstilo(ses, estilo);
        assert.equal(
          Number(await dataset(ses, "notas3d")),
          2,
          `${vista} en estilo ${estilo}: deben verse las 2 notas`,
        );
        assert.equal(
          (await dataset(ses, "notasVisibles")).split(",").sort().join(","),
          esperadoNotas,
          `${vista} en estilo ${estilo}: notas visibles`,
        );
      }
      await ses.captura(path.join(CAPTURAS, `notas-${vista.split(" ")[0].toLowerCase()}.png`));
    }

    // 8. Guardar, reabrir y seguir viendo las notas.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o055.ifc",
      30_000,
      "no se guardó el modelo",
    );
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await invocar(ses, "proyecto.info")).ruta === ruta,
      30_000,
      "el modelo no se reabrió desde el archivo guardado",
    );
    await esperarNotas(ses, 2, 30_000);
    const reabiertas = await notas(ses);
    assert.deepEqual(
      reabiertas.map((n) => n.texto).sort(),
      ["Nota en cara del muro", "Nota en planta"],
      "las notas no sobrevivieron a guardar y reabrir",
    );
    const notaMuroReabierta = reabiertas.find((n) => n.texto === "Nota en cara del muro");
    for (let eje = 0; eje < 3; eje += 1) {
      assert.ok(
        Math.abs(notaMuroReabierta.posicion[eje] - notaMuro.posicion[eje]) < 1e-6,
        `la nota del muro cambió al reabrir: ${JSON.stringify(notaMuroReabierta.posicion)} ≠ ${JSON.stringify(notaMuro.posicion)}`,
      );
    }

    for (const vista of ["3D Isométrica", "Planta Nivel 0", "Alzado Sur"]) {
      await elegirVista(ses, vista);
      await ses.driver.wait(
        async () => Number(await dataset(ses, "notas3d")) === 2,
        10_000,
        `${vista} tras reabrir no muestra las 2 notas`,
      );
    }
    await ses.captura(path.join(CAPTURAS, "tras-reabrir.png"));

    for (const nombre of [
      "iso-anotaciones.png",
      "nota-cara-muro.png",
      "nota-planta.png",
      "notas-3d.png",
      "notas-planta.png",
      "notas-alzado.png",
      "tras-reabrir.png",
    ]) {
      const rutaPng = path.join(CAPTURAS, nombre);
      assert.ok(fs.existsSync(rutaPng), `no se guardó ${nombre}`);
      assert.ok(fs.statSync(rutaPng).size > 5000, `PNG vacío: ${nombre}`);
    }
  } finally {
    await ses.cerrar();
  }
});
