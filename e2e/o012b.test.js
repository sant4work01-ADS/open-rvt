// O012b con la app real: los dos dibujos del usuario.
// 1) zapata → dado → contratrabe → castillo → muro.
// 2) columnas y zapatas → trabes → losa entre las caras interiores.
// Capturas de planta, alzado y 3D en resultados/O012.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const RESULTADOS = path.join(RAIZ, "resultados", "O012");
fs.mkdirSync(RESULTADOS, { recursive: true });

const DIMENSION = { ancho: 1600, alto: 900 };

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG");
  return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
}

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(220);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
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

async function tecla(ses, key, code = key) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
    },
    key,
    code,
  );
  await esperar(150);
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
}

async function clicMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
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
  await esperar(280);
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
  await esperar(500);
}

async function ajustar(ses) {
  await ses.porTestid("visor-ajustar").then((b) => b.click());
  await esperar(500);
}

async function esperarMallas(ses, minimo) {
  await ses.driver.wait(async () => {
    const texto = await ses.driver.executeScript(
      () =>
        document
          .querySelector('[data-testid="visor"]')
          ?.getAttribute("data-mallas") ?? "0",
    );
    return Number(texto) >= minimo;
  }, 30_000, `no se dibujaron ${minimo} mallas`);
}

async function refrescarTodo(ses) {
  // Las creaciones por comando no pasan por el estado de React. Un deshacer y
  // rehacer por la interfaz recarga todos los elementos y vuelve a teselar.
  await activar(ses, "cmd-deshacer");
  await esperar(500);
  await activar(ses, "cmd-rehacer");
  await esperar(900);
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

async function capturar(ses, archivo) {
  const ruta = path.join(RESULTADOS, archivo);
  await ses.captura(ruta);
  assert.ok(fs.existsSync(ruta), `falta ${archivo}`);
  const medidas = dimensionesPng(ruta);
  assert.ok(medidas.ancho > 1000 && medidas.alto > 600, `${archivo} quedó pequeña`);
}

test("O012b-1: zapata, dado, contratrabe, castillo y muro (dibujo del usuario)", async () => {
  const ses = await Sesion.abrir({
    prueba: "o012b-jerarquia",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    const nivel = (await invocar(ses, "modelo.niveles", {}))[0].globalid;

    // Zapata Z-1 con dado 0.40 × 0.40: con desplante 0.85 su cara superior
    // (0.25 de peralte + 0.60 de dado) queda justo en el nivel 0.
    for (const x of [0, 4]) {
      await invocar(ses, "zapatas.crear", {
        tipo: "Z-1 Zapata 1.20×1.20",
        nivel,
        x,
        y: 0,
        desplante: 0.85,
      });
    }

    // Muro Block 15 de 0.15 a nivel 0.
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15");
    await fijarValor(ses, "muro-altura", "2.6");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");

    const teseladoMuro = await invocar(ses, "geometria.teselar", { globalids: null });
    const muro = teseladoMuro.elementos.find((e) => e.clase === "IfcWall");
    assert.ok(muro, "no se creó el muro");
    for (const distancia of [0, 4]) {
      await invocar(ses, "castillos.crear_en_muro", {
        tipo: "K-1 Castillo 15×15",
        muro: muro.globalid,
        distancia,
      });
    }

    // Contratrabe CT-1 de 0.20 × 0.40 en el lecho alto (cara superior en 0).
    await activar(ses, "cmd-contratrabe");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    await refrescarTodo(ses);
    await esperarMallas(ses, 5);

    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const ct = teselado.elementos.find(
      (e) => e.clase === "IfcFooting" && e.estructura?.alias === "contratrabe",
    );
    assert.ok(ct, "no se creó la contratrabe");
    const muroFresco = teselado.elementos.find(
      (e) => e.clase === "IfcWall" && e.globalid === muro.globalid,
    );
    assert.ok(muroFresco, "el muro desapareció al refrescar");
    // Dados de 0.40: 4.00 − 0.20 − 0.20 = 3.60 m.
    const cajaCt = cajaDe(ct);
    assert.ok(Math.abs(cajaCt.x1 - cajaCt.x0 - 3.60) < 1e-6, `CT mide ${cajaCt.x1 - cajaCt.x0}`);
    // El muro termina en las caras de los castillos de 0.15: 4.00 − 0.075 × 2 = 3.85.
    const cajaMuro = cajaDe(muroFresco);
    assert.ok(
      Math.abs(cajaMuro.x1 - cajaMuro.x0 - 3.85) < 1e-6,
      `muro mide ${cajaMuro.x1 - cajaMuro.x0}`,
    );
    assert.ok(Math.abs(cajaMuro.y0 + 0.075) < 1e-6 && Math.abs(cajaMuro.y1 - 0.075) < 1e-6);

    const cantidades = await invocar(ses, "cantidades.estructura", {});
    const infoCt = cantidades.elementos.find((e) => e.globalid === ct.globalid);
    const infoMuro = cantidades.elementos.find((e) => e.globalid === muro.globalid);
    // 0.20 · 0.40 · 3.60 = 0.288 m³ y 3.85 · 2.60 = 10.01 m².
    assert.ok(Math.abs(infoCt.volumen_neto_m3 - 0.288) < 1e-6, `CT ${infoCt.volumen_neto_m3}`);
    assert.ok(Math.abs(infoMuro.volumen_neto_m3 - 1.5015) < 1e-6, `muro ${infoMuro.volumen_neto_m3}`);
    assert.ok(Math.abs(infoMuro.detalle.area_neta_m2 - 10.01) < 1e-6);
    for (const castillo of cantidades.elementos.filter((e) => e.alias === "castillo")) {
      assert.ok(Math.abs(castillo.volumen_neto_m3 - 0.0585) < 1e-6);
    }
    assert.ok(
      Math.abs(cantidades.total.volumen_neto_m3 - cantidades.union_m3) < 1e-6,
      "la suma de netos debe ser el volumen de la unión",
    );

    const medicion = await invocar(ses, "medicion.calcular", {});
    const area = medicion.partidas.find((p) =>
      p.renglones.some((r) => r.globalid === muro.globalid && r.resultado > 9),
    );
    assert.equal(area.total, 10.01);

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Perspectiva");
    await ajustar(ses);
    await esperar(700);
    await capturar(ses, "despues-o012b-jerarquia-3d.png");

    await elegirVista(ses, "Alzado Norte");
    await ajustar(ses);
    await esperar(500);
    await capturar(ses, "despues-o012b-jerarquia-alzado.png");

    await elegirVista(ses, "Planta Nivel 0");
    await ajustar(ses);
    await esperar(500);
    await capturar(ses, "despues-o012b-jerarquia-planta.png");
  } finally {
    await ses.cerrar();
  }
});

test("O012b-2: losas entre trabes y columnas (dibujo del usuario)", async () => {
  const ses = await Sesion.abrir({
    prueba: "o012b-losas",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    const nivel = (await invocar(ses, "modelo.niveles", {}))[0].globalid;

    // Columnas en las cuatro esquinas de 5.00 × 4.00, con su zapata.
    await activar(ses, "cmd-columna");
    for (const [x, y] of [[0, 0], [5, 0], [5, 4], [0, 4]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    const teseladoColumnas = await invocar(ses, "geometria.teselar", { globalids: null });
    const columnas = teseladoColumnas.elementos.filter((e) => e.clase === "IfcColumn");
    assert.equal(columnas.length, 4);
    for (const columna of columnas) {
      await invocar(ses, "zapatas.bajo_columna", {
        tipo: "Z-1 Zapata 1.20×1.20",
        columna: columna.globalid,
      });
    }

    // Trabe T-25 de 0.25 de ancho centrada en los ejes.
    await invocar(ses, "tipos.crear", {
      clase: "trabe",
      nombre: "T-25",
      datos: { seccion: { Forma: "rectangular", B: 0.25, H: 0.40 } },
    });
    for (const [x1, y1, x2, y2] of [
      [0, 0, 5, 0], [5, 0, 5, 4], [5, 4, 0, 4], [0, 4, 0, 0],
    ]) {
      await invocar(ses, "vigas.crear", {
        tipo: "T-25", nivel, x1, y1, x2, y2,
      });
    }
    await invocar(ses, "losas.crear", {
      nivel,
      puntos: [[0, 0], [5, 0], [5, 4], [0, 4]],
      espesor: 0.10,
    });
    await refrescarTodo(ses);
    await esperarMallas(ses, 9);

    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const losa = teselado.elementos.find((e) => e.clase === "IfcSlab");
    assert.ok(losa, "no se creó la losa");
    const cajaLosa = cajaDe(losa);
    // Trabes de 0.25: caras interiores en 0.125 y 4.875 / 3.875.
    assert.ok(Math.abs(cajaLosa.x0 - 0.125) < 1e-6);
    assert.ok(Math.abs(cajaLosa.x1 - 4.875) < 1e-6);
    assert.ok(Math.abs(cajaLosa.y0 - 0.125) < 1e-6);
    assert.ok(Math.abs(cajaLosa.y1 - 3.875) < 1e-6);
    assert.ok(Math.abs(cajaLosa.z0 + 0.10) < 1e-6 && Math.abs(cajaLosa.z1) < 1e-6);

    const cantidades = await invocar(ses, "cantidades.estructura", {});
    const infoLosa = cantidades.elementos.find((e) => e.globalid === losa.globalid);
    // O041: el dado ya no entra en la losa: termina en su cara inferior. La losa solo
    // pierde lo que asoma la columna (0.025² = 0.000625 por esquina). La columna sí
    // atraviesa la losa, como siempre. 17.8125 − 4·0.000625 = 17.81 m² × 0.10 = 1.781.
    assert.ok(Math.abs(infoLosa.volumen_neto_m3 - 1.781) < 1e-6, `losa ${infoLosa.volumen_neto_m3}`);
    const trabes = cantidades.elementos
      .filter((e) => e.alias === "trabe")
      .map((e) => e.volumen_neto_m3)
      .sort((a, b) => a - b);
    // Dados de 0.40 en las esquinas: 4.00 − 0.40 = 3.60 y 5.00 − 0.40 = 4.60.
    for (const [i, esperado] of [[0, 0.36], [1, 0.36], [2, 0.46], [3, 0.46]]) {
      assert.ok(Math.abs(trabes[i] - esperado) < 1e-6, `trabe ${i}: ${trabes[i]}`);
    }
    assert.ok(
      Math.abs(cantidades.total.volumen_neto_m3 - cantidades.union_m3) < 1e-6,
      "la suma de netos debe ser el volumen de la unión",
    );

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Perspectiva");
    await ajustar(ses);
    await esperar(700);
    await capturar(ses, "despues-o012b-losas-3d.png");

    await elegirVista(ses, "Alzado Norte");
    await ajustar(ses);
    await esperar(500);
    await capturar(ses, "despues-o012b-losas-alzado.png");

    await elegirVista(ses, "Planta Nivel 0");
    await ajustar(ses);
    await esperar(500);
    await capturar(ses, "despues-o012b-losas-planta.png");
  } finally {
    await ses.cerrar();
  }
});
