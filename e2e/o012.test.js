// O012 con la app real: cimentación de la captura 1 con 6 zapatas, contratrabes
// unidas por eje (L, T y hueco de 3 cm), y los 4 muros de la captura 2 con capas.
// Capturas antes/después en resultados/O012 y conteo de aristas dentro del nodo.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const RESULTADOS = path.join(RAIZ, "resultados", "O012");
const CAPTURAS_USUARIO = path.join(RAIZ, "docs", "notas-usuario", "capturas");
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

async function atributoVisor(ses, nombre) {
  return (await ses.porTestid("visor")).getAttribute(`data-${nombre}`);
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
        .then((crudo) => done({ ok: true, valor: crudo && crudo.status === "ok" ? crudo.data : crudo }))
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

async function zoomMundo(ses, x, y, pasos = 4) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto, pasos) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
      for (let i = 0; i < pasos; i += 1) {
        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaY: -120,
            clientX: punto.x,
            clientY: punto.y,
          }),
        );
      }
    },
    punto,
    pasos,
  );
  await esperar(450);
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
    const texto = await atributoVisor(ses, "mallas");
    return Number(texto ?? 0) >= minimo;
  }, 30_000, `no se dibujaron ${minimo} mallas`);
}

function antesDelUsuario(origen, destino) {
  fs.copyFileSync(path.join(CAPTURAS_USUARIO, origen), path.join(RESULTADOS, destino));
}

test("O012-1: cimentación con 6 zapatas, L, T y hueco de 3 cm", async () => {
  antesDelUsuario(
    "2026-10-27-3d-uniones-cimentacion.jpg",
    "antes-fundacion-perspectiva.jpg",
  );
  const ses = await Sesion.abrir({
    prueba: "o012-fundacion",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
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

    // 6 zapatas.
    await activar(ses, "cmd-zapata");
    for (const [x, y] of [
      [0, 0], [6, 0], [12, 0], [0, 8], [6, 8], [12, 8],
    ]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    assert.equal(
      (await invocar(ses, "geometria.teselar", { globalids: null })).elementos.filter(
        (e) => e.clase === "IfcFooting" && e.estructura?.alias === "zapata",
      ).length,
      6,
    );

    // 3 columnas en la fila de zapatas y=0.
    await activar(ses, "cmd-columna");
    for (const [x, y] of [[0, 0], [6, 0], [12, 0]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");

    // Contratrabes: dos por eje en X, tres por eje en Y, una L y una T.
    const vigas = [
      [0, 0, 6, 0],
      [6, 0, 12, 0],
      [0, 0, 0, 8],
      [12, 0, 12, 8],
      [0, 8, 12, 8],
      [6, 0, 6, 8],
      [0, 4, 5.87, 4], // termina 3 cm antes de la cara de la contratrabe x = 6
    ];
    for (const [x1, y1, x2, y2] of vigas) {
      await activar(ses, "cmd-contratrabe");
      await clicMundo(ses, x1, y1);
      await clicMundo(ses, x2, y2);
      await tecla(ses, "Escape");
      await tecla(ses, "Escape");
    }

    await esperarMallas(ses, 16);
    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const contratrabes = teselado.elementos.filter(
      (e) => e.clase === "IfcFooting" && e.estructura?.alias === "contratrabe",
    );
    assert.equal(contratrabes.length, 7);

    const cantidades = await invocar(ses, "cantidades.estructura", {});
    const volumenes = cantidades.elementos
      .filter((e) => e.alias === "contratrabe")
      .map((e) => e.volumen_neto_m3)
      .sort((a, b) => a - b);
    // Cálculo a mano con CT-1 de 0.20 × 0.40 (0.08 m² por metro):
    // 6.00 − 0.15 − 0.15 = 5.70 → 0.456; el dado de zapata de 0.40 × 0.40
    //   se traslapa 0.05 × 0.20 × 0.25 en cada punta → 0.451 (dos veces).
    // 8.00 − 0.15 − 0.10 = 7.75 → 0.620; dados en ambos extremos:
    //   0.05 × 0.20 × 0.25 + 0.10 × 0.20 × 0.25 = 0.0075 → 0.6125 (tres veces).
    // 12.00 + 0.10 + 0.10 = 12.20 pasante → 0.976; tres dados → 0.926.
    // Hueco de 3 cm: 5.90 − 0.10 = 5.80 → 0.464 (sin zapata en y = 4).
    const esperados = [0.451, 0.451, 0.464, 0.6125, 0.6125, 0.6125, 0.926];
    volumenes.forEach((valor, i) => {
      assert.ok(
        Math.abs(valor - esperados[i]) < 5e-3,
        `volumen ${i}: ${valor} != ${esperados[i]}`,
      );
    });
    assert.ok(
      Math.abs(cantidades.total.volumen_neto_m3 - cantidades.union_m3) < 1e-6,
      "la suma de netos debe ser el volumen de la unión",
    );

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Perspectiva");
    await ajustar(ses);
    await zoomMundo(ses, 6, 4, 1);
    await esperar(800);
    await ses.captura(path.join(RESULTADOS, "despues-fundacion-perspectiva.png"));
    await elegirVista(ses, "3D Isométrica");
    await esperar(800);
    await ses.captura(path.join(RESULTADOS, "despues-fundacion-isometrico.png"));

    // Aristas dentro del nudo en T de (6, 8): la contratrabe pasante conserva sus
    // dos líneas de silueta (arriba y abajo) y el extremo recortado no dibuja sus
    // cuatro aristas sobre la cara del pasante. Sin la supresión serían 6.
    const aristasNodo = await ses.driver.executeScript(() => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (typeof visor.__openrvtAristasEnCaja !== "function") return -1;
      return visor.__openrvtAristasEnCaja([5.7, 7.85, -0.42], [6.3, 7.95, 0.02]);
    });
    assert.equal(aristasNodo, 2, `quedaron ${aristasNodo} aristas internas en el nudo`);

    for (const archivo of [
      "antes-fundacion-perspectiva.jpg",
      "despues-fundacion-perspectiva.png",
      "despues-fundacion-isometrico.png",
    ]) {
      const ruta = path.join(RESULTADOS, archivo);
      assert.ok(fs.existsSync(ruta), `falta ${archivo}`);
      if (archivo.endsWith(".png")) {
        const medidas = dimensionesPng(ruta);
        assert.ok(medidas.ancho > 1000 && medidas.alto > 600);
      }
    }
  } finally {
    await ses.cerrar();
  }
});

test("O012-2: muros de la captura 2 con capas ingleteadas en 3D", async () => {
  antesDelUsuario("2026-10-27-3d-uniones-muros.jpg", "antes-muros-perspectiva.jpg");
  const ses = await Sesion.abrir({
    prueba: "o012-muros",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
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
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    await fijarValor(ses, "muro-altura", "2.6");
    for (const [x, y] of [[0, 0], [5, 0], [5, 4], [0, 4], [0, 0]]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    // Muro que llega en T al muro inferior.
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-tipo", "Block 15 aplanado-yeso");
    await clicMundo(ses, 2.5, 0);
    await clicMundo(ses, 2.5, 2);
    await tecla(ses, "Escape");
    await tecla(ses, "Escape");
    await esperarMallas(ses, 5);

    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const muros = teselado.elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(muros.length, 5);
    assert.ok(muros.every((m) => m.capas.length >= 2));

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Perspectiva");
    await ajustar(ses);
    await esperar(900);
    // Cada muro aporta una franja por capa; si no se dibujaran, el contador sería 0.
    const capas3d = Number(await atributoVisor(ses, "capas3d"));
    assert.ok(capas3d >= 5, `sólo se dibujaron ${capas3d} franjas de capa en 3D`);
    await ses.captura(path.join(RESULTADOS, "despues-muros-perspectiva.png"));

    await elegirVista(ses, "3D Isométrica");
    await ajustar(ses);
    await esperar(800);
    await ses.captura(path.join(RESULTADOS, "despues-muros-isometrico.png"));

    await elegirVista(ses, "Planta Nivel 0");
    await ajustar(ses);
    await ses.captura(path.join(RESULTADOS, "despues-muros-planta.png"));

    for (const archivo of [
      "antes-muros-perspectiva.jpg",
      "despues-muros-perspectiva.png",
      "despues-muros-isometrico.png",
      "despues-muros-planta.png",
    ]) {
      const ruta = path.join(RESULTADOS, archivo);
      assert.ok(fs.existsSync(ruta), `falta ${archivo}`);
      if (archivo.endsWith(".png")) {
        const medidas = dimensionesPng(ruta);
        assert.ok(medidas.ancho > 1000 && medidas.alto > 600);
      }
    }
  } finally {
    await ses.cerrar();
  }
});
