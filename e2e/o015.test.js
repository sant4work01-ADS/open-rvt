// O015: las losas se rellenan en planta (proyección tenue) y en corte (patrón
// del material). Se ejecuta sobre la app real (Tauri + WebView2/Edge).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const RESULTADOS = path.join(RAIZ, "docs", "capturas");
fs.mkdirSync(RESULTADOS, { recursive: true });

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
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
  await esperar(700);
}

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone __openrvtMundoAPantalla");
      }
      return {
        ...visor.__openrvtMundoAPantalla(x, y, z),
        ancho: window.innerWidth,
        alto: window.innerHeight,
      };
    },
    x,
    y,
    z,
  );
}

async function clicMundo(ses, x, y) {
  const punto = await proyectar(ses, x, y);
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

async function abrirRangoAvanzado(ses) {
  await ses.driver.executeScript(() => {
    const details = document.querySelector('[data-testid="vista-rango-avanzado"]');
    if (details && !details.open) details.open = true;
  });
  await esperar(150);
}

async function marcarTodosLosNiveles(ses) {
  await ses.driver.executeScript(() => {
    for (const casilla of document.querySelectorAll('[data-testid^="nivel-visible-"]')) {
      if (!casilla.checked) casilla.click();
    }
  });
  await esperar(400);
}

/** Decodifica un PNG RGB/RGBA de 8 bits con el zlib de Node (sin dependencias). */
function leerPng(ruta) {
  const bytes = fs.readFileSync(ruta);
  let pos = 8;
  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const partes = [];
  while (pos + 8 <= bytes.length) {
    const largo = bytes.readUInt32BE(pos);
    const tipo = bytes.toString("ascii", pos + 4, pos + 8);
    const datos = bytes.subarray(pos + 8, pos + 8 + largo);
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      if (datos[8] !== 8) throw new Error("PNG sin 8 bits por canal");
      canales = datos[9] === 6 ? 4 : datos[9] === 2 ? 3 : 0;
    } else if (tipo === "IDAT") {
      partes.push(datos);
    } else if (tipo === "IEND") {
      break;
    }
    pos += 12 + largo;
  }
  assert.ok(canales > 0, "la captura no es un PNG RGB/RGBA de 8 bits");
  const crudo = zlib.inflateSync(Buffer.concat(partes));
  const fila = ancho * canales;
  const pixeles = Buffer.alloc(alto * fila);
  let origen = 0;
  for (let y = 0; y < alto; y += 1) {
    const filtro = crudo[origen];
    origen += 1;
    const filaCruda = crudo.subarray(origen, origen + fila);
    origen += fila;
    const salida = pixeles.subarray(y * fila, (y + 1) * fila);
    const previa = y > 0 ? pixeles.subarray((y - 1) * fila, y * fila) : null;
    for (let x = 0; x < fila; x += 1) {
      const a = x >= canales ? salida[x - canales] : 0;
      const b = previa ? previa[x] : 0;
      const c = previa && x >= canales ? previa[x - canales] : 0;
      let valor = filaCruda[x];
      if (filtro === 1) valor += a;
      else if (filtro === 2) valor += b;
      else if (filtro === 3) valor += Math.floor((a + b) / 2);
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        valor += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      salida[x] = valor & 0xff;
    }
  }
  return { ancho, alto, canales, pixeles };
}

/** Proporción de píxeles que no son fondo dentro del rectángulo que abarcan los
 *  puntos de mundo dados, medido sobre la captura real. */
async function proporcionNoFondo(ses, png, puntos, umbral) {
  const pantalla = [];
  for (const [x, y, z] of puntos) pantalla.push(await proyectar(ses, x, y, z));
  const anchoVentana = pantalla[0].ancho;
  const altoVentana = pantalla[0].alto;
  const xs = pantalla.map((p) => p.x);
  const ys = pantalla.map((p) => p.y);
  // La banda de un corte de 0,12 m ocupa pocas filas: se recorta solo en
  // horizontal para no salir por los bordes del contorno.
  const margenX = 2;
  const x0 = Math.min(...xs) + margenX;
  const x1 = Math.max(...xs) - margenX;
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  assert.ok(x1 - x0 > 8 && y1 - y0 >= 2, "el rectángulo de medición quedó degenerado");
  const imagen = leerPng(png);
  const sx = imagen.ancho / anchoVentana;
  const sy = imagen.alto / altoVentana;
  const ix0 = Math.max(0, Math.round(x0 * sx));
  const ix1 = Math.min(imagen.ancho, Math.round(x1 * sx));
  const iy0 = Math.max(0, Math.round(y0 * sy));
  const iy1 = Math.min(imagen.alto, Math.round(y1 * sy));
  let total = 0;
  let noFondo = 0;
  for (let y = iy0; y < iy1; y += 1) {
    for (let x = ix0; x < ix1; x += 1) {
      const i = (y * imagen.ancho + x) * imagen.canales;
      const dr = imagen.pixeles[i] - 255;
      const dg = imagen.pixeles[i + 1] - 255;
      const db = imagen.pixeles[i + 2] - 255;
      total += 1;
      if (Math.hypot(dr, dg, db) >= umbral) noFondo += 1;
    }
  }
  assert.ok(total > 0, "la región de medición quedó vacía");
  return noFondo / total;
}

test("O015: losa con relleno de proyección en planta y de material en corte", async () => {
  const ses = await Sesion.abrir({
    prueba: "o015-losas",
    tamano: { ancho: 1920, alto: 1000 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    // Modelo nuevo con Nivel 0 (0,00) y Nivel 1 (+3,00).
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await cambiarPestana(ses, "Modelar");
    // El modelo nuevo ya trae el Nivel 0 (0,00); «Nivel» abre el cuadro y se
    // teclea 3.00 (O051: ya no hay +3 automáticos).
    // O029: en un alzado «Nivel» activa el dibujo; hay que situarse en una planta.
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "cmd-nivel");
    await ses.driver.actions({ async: true }).sendKeys("3").perform();
    await ses.driver.actions({ async: true }).sendKeys(Key.ENTER).perform();
    await ses.driver.actions({ async: true }).sendKeys(Key.ESCAPE).perform();
    let niveles = [];
    await ses.driver.wait(async () => {
      niveles = await invocar(ses, "modelo.niveles");
      return niveles.length === 2;
    }, 15_000, "no se crearon los dos niveles");
    const nivel0 = niveles.reduce((a, b) => (a.elevacion <= b.elevacion ? a : b));
    const nivel1 = niveles.reduce((a, b) => (a.elevacion >= b.elevacion ? a : b));
    assert.equal(nivel0.elevacion, 0);
    assert.equal(nivel1.elevacion, 3);

    // Muro de concreto de 2,80 m en el Nivel 0 (interfaz real).
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-altura", "2.8");
    await clicMundo(ses, -1, 0);
    await clicMundo(ses, 7, 0);
    await activar(ses, "visor-ajustar");
    await esperar(500);

    // Losa de concreto de 0,12 m con su cara superior a +2,80. La app no ofrece
    // desfase de losa en la interfaz; se crea por el mismo RPC del núcleo y se
    // confirma con deshacer/rehacer, que recarga el modelo desde el IFC.
    await invocar(ses, "losas.crear", {
      nivel: nivel0.globalid,
      puntos: [
        [-1, -1],
        [7, -1],
        [7, 5],
        [-1, 5],
      ],
      espesor: 0.12,
      desfase: 2.8,
    });
    await activar(ses, "cmd-deshacer");
    await activar(ses, "cmd-rehacer");
    await ses.driver.wait(async () => {
      const elementos = await invocar(ses, "modelo.elementos");
      const losa = elementos.find((e) => e.clase === "IfcSlab");
      if (!losa) return false;
      const propiedades = await invocar(ses, "modelo.propiedades", { globalid: losa.globalid });
      const datos = propiedades.psets?.OPENRVT_Losa || {};
      return Number(datos.Espesor) === 0.12 && Number(datos.Desfase) === 2.8;
    }, 15_000, "la losa de 0,12 m a +2,80 no quedó en el modelo");

    // Planta Nivel 1 con el plano de corte a +2,90 y el Nivel 0 visible.
    await elegirVista(ses, "Planta Nivel 1");
    await cambiarPestana(ses, "Vista");
    await marcarTodosLosNiveles(ses);
    await abrirRangoAvanzado(ses);
    await fijarValor(ses, "vista-altura", "2.9");
    await fijarValor(ses, "vista-estilo", "lineas-ocultas");
    await esperar(900);
    const visor = await ses.porTestid("visor");
    assert.equal(await visor.getAttribute("data-relleno-losa-proyeccion"), "1");
    const pngPlanta = path.join(RESULTADOS, "o015-despues-planta.png");
    await ses.captura(pngPlanta);
    const planta = await proporcionNoFondo(
      ses,
      pngPlanta,
      [
        [-0.5, -0.5, 2.9],
        [6.5, -0.5, 2.9],
        [6.5, 4.5, 2.9],
        [-0.5, 4.5, 2.9],
      ],
      12,
    );
    console.log(`O015 planta: ${(planta * 100).toFixed(1)} % de píxeles no-fondo`);
    assert.ok(
      planta >= 0.05,
      `la losa debajo del corte no tiene proyección tenue: ${(planta * 100).toFixed(1)} %`,
    );

    // Corte transversal a y = 2: la losa cortada se rellena con su patrón.
    await cambiarPestana(ses, "Vista");
    await activar(ses, "cmd-nuevo-corte");
    await clicMundo(ses, -2, 2);
    await clicMundo(ses, 8, 2);
    await elegirVista(ses, "Corte 1");
    await fijarValor(ses, "vista-estilo", "sombreado");
    await esperar(900);
    const visorCorte = await ses.porTestid("visor");
    assert.ok(
      Number(await visorCorte.getAttribute("data-relleno-losa-patron")) >= 1,
      "el corte no generó el patrón de la losa",
    );
    const pngCorte = path.join(RESULTADOS, "o015-despues-corte.png");
    await ses.captura(pngCorte);
    const corte = await proporcionNoFondo(
      ses,
      pngCorte,
      [
        [-0.5, 2, 2.68],
        [6.5, 2, 2.68],
        [6.5, 2, 2.8],
        [-0.5, 2, 2.8],
      ],
      40,
    );
    console.log(`O015 corte: ${(corte * 100).toFixed(1)} % de píxeles no-fondo`);
    assert.ok(
      corte >= 0.3,
      `la sección de la losa no está rellena: ${(corte * 100).toFixed(1)} %`,
    );

    // Alzado sin corte: la losa no se achura; solo aristas.
    await elegirVista(ses, "Alzado Norte");
    await esperar(700);
    const visorAlzado = await ses.porTestid("visor");
    assert.equal(
      await visorAlzado.getAttribute("data-relleno-losa-patron"),
      "0",
      "el alzado no debe achurado de losa",
    );
    assert.equal(
      await visorAlzado.getAttribute("data-relleno-losa-proyeccion"),
      "0",
      "el alzado no debe relleno de proyección",
    );
  } finally {
    await ses.cerrar();
  }
});
