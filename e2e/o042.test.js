// O042: codo de eje con V1/V2, arrastre de V2 y dibujo. Se ejecuta sobre la app
// real (Tauri + WebKitGTK) con clics y arrastres de ratón en planta.
//
// Valores calculados a mano (D = 0.8 m = globo de 8 mm a 1:100):
//   eje (0,0)→(10,0): globo sin codo con borde en x=10 y centro en (10.4, 0).
//   con codo: centro (10.4, 0.48), V2 = (9.2, 0.48), V1 = (8.52, 0).
//   Diagonal: 0.85·D a lo largo y 0.6·D de lado. Tramo final: 1.0·D hasta el borde.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O042");
fs.mkdirSync(PROGRESO, { recursive: true });

/** Lector PNG propio (sin Pillow): capturas de 8 bits RGB/RGBA. */
function leerPng(ruta) {
  const b = fs.readFileSync(ruta);
  let p = 8;
  let ancho = 0;
  let alto = 0;
  let tipoColor = 0;
  const idat = [];
  while (p < b.length) {
    const largo = b.readUInt32BE(p);
    const tipo = b.toString("ascii", p + 4, p + 8);
    const datos = b.subarray(p + 8, p + 8 + largo);
    p += 12 + largo;
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      assert.equal(datos[8], 8, "se esperaba una captura PNG de 8 bits");
      tipoColor = datos[9];
    } else if (tipo === "IDAT") {
      idat.push(datos);
    } else if (tipo === "IEND") {
      break;
    }
  }
  const canales = tipoColor === 6 ? 4 : tipoColor === 2 ? 3 : 0;
  assert.ok(canales, `tipo de color PNG no soportado: ${tipoColor}`);
  const crudo = zlib.inflateSync(Buffer.concat(idat));
  const fila = ancho * canales + 1;
  const salida = Buffer.alloc(ancho * alto * canales);
  for (let y = 0; y < alto; y += 1) {
    const filtro = crudo[y * fila];
    const src = crudo.subarray(y * fila + 1, (y + 1) * fila);
    const dst = salida.subarray(y * ancho * canales, (y + 1) * ancho * canales);
    const previa = y > 0 ? salida.subarray((y - 1) * ancho * canales, y * ancho * canales) : null;
    for (let x = 0; x < ancho * canales; x += 1) {
      const a = x >= canales ? dst[x - canales] : 0;
      const arriba = previa ? previa[x] : 0;
      const c = previa && x >= canales ? previa[x - canales] : 0;
      let valor = src[x];
      if (filtro === 1) valor += a;
      else if (filtro === 2) valor += arriba;
      else if (filtro === 3) valor += (a + arriba) >> 1;
      else if (filtro === 4) {
        const pp = a + arriba - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - arriba);
        const pc = Math.abs(pp - c);
        valor += pa <= pb && pa <= pc ? a : pb <= pc ? arriba : c;
      }
      dst[x] = valor & 255;
    }
  }
  return { ancho, alto, canales, datos: salida };
}

function colorDistancia(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function esNaranja(c) {
  // Pinzamiento del eje seleccionado (#f59e0b): rojo alto, azul bajo.
  return c[0] >= 170 && c[1] >= 90 && c[1] <= 220 && c[2] <= 120;
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
  await esperar(250);
}

async function fijarValor(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    testid,
    valor,
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

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
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
  await esperar(600);
}

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
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
  await esperar(320);
}

async function tecla(ses, key, code, extras = {}) {
  await ses.driver.executeScript(
    (key, code, extras) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true, ...extras }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true, ...extras }),
      );
    },
    key,
    code,
    extras,
  );
  await esperar(250);
}

async function crearNivelLista(ses) {
  const niveles = await invocar(ses, "modelo.niveles");
  const elevacion = niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) + 3 : 0;
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(300);
  await fijarValor(ses, "nivel-nuevo-nombre", `Nivel ${niveles.length}`);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(700);
  const modelo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="modelo"]')),
    10_000,
  );
  await modelo.click();
  await esperar(300);
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
    const a = await proyectar(ses, x1, y1);
    const b = await proyectar(ses, x2, y2);
    await clicEn(ses, a);
    await clicEn(ses, b);
  }
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(400);
  await activar(ses, "visor-ajustar");
  await esperar(600);
}

async function ajustes(ses) {
  return JSON.parse((await atributoVisor(ses, "ejes-ajustes")) || "{}");
}

async function seleccionarEje(ses, etiqueta) {
  const punto = await ses.driver.executeScript(
    (etiqueta) => document.querySelector('[data-testid="visor"]').__openrvtEjeLineaAPantalla(etiqueta),
    etiqueta,
  );
  assert.ok(punto, `no se pudo proyectar el eje ${etiqueta}`);
  await clicEn(ses, punto);
  await ses.driver.wait(
    async () => (await atributoVisor(ses, "eje-seleccionado")) !== null,
    5_000,
    "el eje no quedó seleccionado",
  );
}

/** Arrastra el asa `indiceCodo` (o la base) en píxeles de pantalla. */
async function arrastrarAsa(ses, etiqueta, lado, dx, dy, opciones = {}) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado, indice, tipoAsa) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(
        etiqueta,
        lado,
        indice,
        tipoAsa,
      ),
    etiqueta,
    lado,
    opciones.indiceCodo,
    opciones.tipoAsa,
  );
  assert.ok(inicio, `no se encontró el asa ${etiqueta}/${lado}/${opciones.indiceCodo ?? "base"}`);
  await ses.driver.executeScript(
    (inicio, dx, dy, opciones) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        pointerType: "mouse",
        clientX: inicio.x,
        clientY: inicio.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: inicio.x + dx / 2, clientY: inicio.y + dy / 2 }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: inicio.x + dx, clientY: inicio.y + dy }),
      );
      if (opciones.cancelar) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
        );
      }
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...abajo,
          buttons: 0,
          clientX: inicio.x + dx,
          clientY: inicio.y + dy,
        }),
      );
    },
    inicio,
    dx,
    dy,
    opciones,
  );
  await esperar(900);
}

/** Arrastra un asa hasta una coordenada de mundo (para las capturas). */
async function arrastrarAsaAMundo(ses, etiqueta, lado, indiceCodo, destinoMundo) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado, indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado, indice),
    etiqueta,
    lado,
    indiceCodo,
  );
  const fin = await proyectar(ses, destinoMundo[0], destinoMundo[1]);
  assert.ok(inicio && fin, "no se pudo proyectar el arrastre del codo");
  await ses.driver.executeScript(
    (inicio, fin) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        pointerType: "mouse",
        clientX: inicio.x,
        clientY: inicio.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(new PointerEvent("pointermove", { ...abajo, clientX: fin.x, clientY: fin.y }));
      window.dispatchEvent(new PointerEvent("pointerup", { ...abajo, buttons: 0, clientX: fin.x, clientY: fin.y }));
    },
    inicio,
    fin,
  );
  await esperar(900);
}

async function quitarCodoConMenu(ses, etiqueta, lado = "fin", indiceCodo = 1) {
  const punto = await ses.driver.executeScript(
    (etiqueta, lado, indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado, indice),
    etiqueta,
    lado,
    indiceCodo,
  );
  assert.ok(punto, "no se encontró el asa del codo para el menú");
  await ses.driver.executeScript(
    (punto) => {
      document.querySelector('[data-testid="visor"] canvas').dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(300);
  await activar(ses, "eje-quitar-codo");
}

async function arrastrarEnPantalla(ses, punto, dx, dy, pointerId = 12) {
  await ses.driver.executeScript(
    (punto, dx, dy, pointerId) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId,
        pointerType: "mouse",
        clientX: punto.x,
        clientY: punto.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: punto.x + dx, clientY: punto.y + dy }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...abajo,
          buttons: 0,
          clientX: punto.x + dx,
          clientY: punto.y + dy,
        }),
      );
    },
    punto,
    dx,
    dy,
    pointerId,
  );
  await esperar(500);
}

function cerca(p, q, tolerancia = 1e-6) {
  return Math.abs(p[0] - q[0]) <= tolerancia && Math.abs(p[1] - q[1]) <= tolerancia;
}

/** Muestrea un cuadrado de píxeles alrededor de un punto de pantalla. */
function muestrear(img, punto, ventana, radio = 10) {
  const sx = img.ancho / ventana.ancho;
  const sy = img.alto / ventana.alto;
  const px = (x, y) => {
    const xi = Math.max(0, Math.min(img.ancho - 1, Math.round(x * sx)));
    const yi = Math.max(0, Math.min(img.alto - 1, Math.round(y * sy)));
    const i = (yi * img.ancho + xi) * img.canales;
    return [img.datos[i], img.datos[i + 1], img.datos[i + 2]];
  };
  const muestras = [];
  for (let dy = -radio; dy <= radio; dy += 1) {
    for (let dx = -radio; dx <= radio; dx += 1) {
      muestras.push(px(punto.x + dx, punto.y + dy));
    }
  }
  return { px, muestras };
}

function hayNaranja(img, punto, ventana, radio = 10) {
  return muestrear(img, punto, ventana, radio).muestras.some(esNaranja);
}

test("O042: codo de eje con V1/V2, arrastre de V2, píxeles y capturas", async () => {
  const ses = await Sesion.abrir({
    prueba: "o042",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    await crearNivelLista(ses);
    // Eje 1 vertical en x=0 y eje A horizontal en y=4.
    await dibujarEjes(ses, [
      [[0, -2], [0, 8]],
      [[-2, 4], [10, 4]],
    ]);
    await elegirVista(ses, "Planta Nivel 0");

    const vista = (await invocar(ses, "vistas.leer")).find((v) => v.nombre === "Planta Nivel 0");
    assert.ok(vista, "falta la vista Planta Nivel 0");
    // D = 8 mm de papel en el modelo: a 1:100 son 0.8 m. Calculado de la escala.
    const D = (8 * vista.escala) / 1000;
    assert.equal(D, 0.8, "la escala de la vista no es 1:100");

    const referencias = await invocar(ses, "modelo.referencias");
    const vertical = referencias.ejes.find((e) => e.vertical && e.etiqueta);
    const horizontal = referencias.ejes.find((e) => !e.vertical && e.etiqueta);
    assert.ok(vertical && horizontal, "faltan los ejes 1 y A de la prueba");
    assert.equal(vertical.etiqueta, "1");
    assert.equal(horizontal.etiqueta, "A");

    // 1) Los globos sin codo tienen el borde sobre el extremo y el centro a D/2.
    const finH = [horizontal.x2, horizontal.y2];
    const ajustesIniciales = await ajustes(ses);
    const asaGlobo = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla("A", "fin"),
    );
    const bu = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    const centroSinCodo = await proyectar(ses, finH[0] + D / 2, finH[1]);
    assert.ok(
      Math.hypot(bu.x - centroSinCodo.x, bu.y - centroSinCodo.y) < 2,
      `el globo sin codo no está a D/2 del extremo: burbuja=${JSON.stringify(bu)} centro=${JSON.stringify(centroSinCodo)} fin=${JSON.stringify(finH)} ajustes=${JSON.stringify(ajustesIniciales)} asa=${JSON.stringify(asaGlobo)}`,
    );

    // 2) Agregar codo al extremo de cada uno.
    await seleccionarEje(ses, "1");
    await activar(ses, "eje-codo-fin-agregar");
    await seleccionarEje(ses, "A");
    await activar(ses, "eje-codo-fin-agregar");
    let a = await ajustes(ses);

    // Eje A horizontal: dirección +x, perpendicular +y.
    const gidH = horizontal.globalid;
    const dirH = [1, 0];
    const perpH = [0, 1];
    const centroH = [finH[0] + dirH[0] * (D / 2), finH[1] + dirH[1] * (D / 2)];
    const v2H = [
      centroH[0] - dirH[0] * 1.5 * D + perpH[0] * 0.6 * D,
      centroH[1] - dirH[1] * 1.5 * D + perpH[1] * 0.6 * D,
    ];
    const v1H = [
      v2H[0] - dirH[0] * 0.85 * D - perpH[0] * 0.6 * D,
      v2H[1] - dirH[1] * 0.85 * D - perpH[1] * 0.6 * D,
    ];
    assert.equal(a[gidH].codosFin.length, 2);
    assert.ok(cerca(a[gidH].codosFin[0], v1H, 1e-6), `V1 horizontal incorrecto: ${a[gidH].codosFin[0]}`);
    assert.ok(cerca(a[gidH].codosFin[1], v2H, 1e-6), `V2 horizontal incorrecto: ${a[gidH].codosFin[1]}`);
    assert.equal(a[gidH].extremoFin, undefined);

    // El globo solo se separa 0.6·D de lado: su x no cambia.
    const burbujaH = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    const centroConCodo = await proyectar(ses, centroH[0], centroH[1] + 0.6 * D);
    assert.ok(
      Math.hypot(burbujaH.x - centroConCodo.x, burbujaH.y - centroConCodo.y) < 2,
      "el globo no quedó en la misma x y 0.6·D de lado",
    );

    // Eje 1 vertical: comprobar la forma con los mismos valores.
    const v = a[vertical.globalid];
    assert.equal(v.codosFin.length, 2);
    const finV = [vertical.x2, vertical.y2];
    const largoV = Math.hypot(finV[0] - vertical.x1, finV[1] - vertical.y1);
    const dirV = [(finV[0] - vertical.x1) / largoV, (finV[1] - vertical.y1) / largoV];
    const perpV = [-dirV[1], dirV[0]];
    const centroV = [finV[0] + dirV[0] * (D / 2), finV[1] + dirV[1] * (D / 2)];
    const v2V = [
      centroV[0] - dirV[0] * 1.5 * D + perpV[0] * 0.6 * D,
      centroV[1] - dirV[1] * 1.5 * D + perpV[1] * 0.6 * D,
    ];
    const v1V = [
      v2V[0] - dirV[0] * 0.85 * D - perpV[0] * 0.6 * D,
      v2V[1] - dirV[1] * 0.85 * D - perpV[1] * 0.6 * D,
    ];
    assert.ok(cerca(v.codosFin[0], v1V, 1e-6), "V1 vertical incorrecto");
    assert.ok(cerca(v.codosFin[1], v2V, 1e-6), "V2 vertical incorrecto");

    // 3) V2 horizontal: arrastre casi vertical (perpendicular) y luego casi
    // horizontal (a lo largo). Solo cambia la componente elegida.
    const v2Antes = [...a[gidH].codosFin[1]];
    await arrastrarAsa(ses, "A", "fin", 10, 90, { indiceCodo: 1 });
    a = await ajustes(ses);
    let v2 = a[gidH].codosFin[1];
    assert.ok(Math.abs(v2[0] - v2Antes[0]) <= 0.0011, `casi vertical movió x: ${v2[0]} vs ${v2Antes[0]}`);
    assert.ok(Math.abs(v2[1] - v2Antes[1]) > 0.2, "casi vertical no movió y");

    const v2TrasPerp = [...v2];
    await arrastrarAsa(ses, "A", "fin", 90, 10, { indiceCodo: 1 });
    a = await ajustes(ses);
    v2 = a[gidH].codosFin[1];
    assert.ok(Math.abs(v2[1] - v2TrasPerp[1]) <= 0.0011, `casi horizontal movió y: ${v2[1]} vs ${v2TrasPerp[1]}`);
    assert.ok(Math.abs(v2[0] - v2TrasPerp[0]) > 0.2, "casi horizontal no movió x");

    // El globo sigue a V2 con el tramo final de 1.0·D, paralelo al eje (+x).
    const centroActual = [v2[0] + 1.5 * D, v2[1]];
    const burbuja = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    const globoPantalla = await proyectar(ses, centroActual[0], centroActual[1]);
    assert.ok(
      Math.hypot(burbuja.x - globoPantalla.x, burbuja.y - globoPantalla.y) < 2,
      "el globo no sigue a V2 a 1.5·D (borde a 1.0·D)",
    );

    // Píxeles: el pinzamiento de V2 se ve (naranja) con el eje seleccionado.
    await seleccionarEje(ses, "A");
    await esperar(400);
    const capturaPix = path.join(os.tmpdir(), `o042-pix-${process.pid}.png`);
    await ses.captura(capturaPix);
    const img = leerPng(capturaPix);
    const ventana = await ses.driver.executeScript(() => ({
      ancho: window.innerWidth,
      alto: window.innerHeight,
    }));
    const pV2 = await proyectar(ses, v2[0], v2[1]);
    assert.ok(hayNaranja(img, pV2, ventana), "el pinzamiento de V2 no se ve en pantalla");
    // Sin pinzamiento flotante en el extremo original (base oculta con codo).
    const baseH = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla("A", "fin", undefined, "base"),
    );
    assert.equal(baseH, null, "el extremo original todavía tiene pinzamiento");
    const pBase = await proyectar(ses, horizontal.x2, horizontal.y2);
    assert.equal(hayNaranja(img, pBase, ventana, 6), false, "hay un pinzamiento flotando en el extremo original");
    // V1 no tiene pinzamiento.
    assert.equal(
      await ses.driver.executeScript(() =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla("A", "fin", 0),
      ),
      null,
      "V1 no debe tener pinzamiento",
    );
    // La polilínea dibujada no tiene huecos: se muestrean los puntos medios de
    // V1→V2 y V2→borde del globo (fuera de los nodos).
    const fondo = muestrear(img, pBase, ventana, 4).px(img.ancho - 5, img.alto - 5);
    const puntoMedio = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const bordeActual = [v2[0] + D, v2[1]];
    for (const [p, q] of [
      [a[gidH].codosFin[0], v2],
      [v2, bordeActual],
    ]) {
      for (const t of [0.35, 0.5, 0.65]) {
        const m = puntoMedio(p, q, t);
        const pm = await proyectar(ses, m[0], m[1]);
        const c = muestrear(img, pm, ventana, 2).px(pm.x, pm.y);
        assert.ok(
          colorDistancia(c, fondo) > 25,
          `hueco en la polilínea cerca de ${JSON.stringify(m)}`,
        );
      }
    }
    fs.rmSync(capturaPix, { force: true });

    // 4) V1 y el globo no se pueden arrastrar.
    const antesV1 = JSON.stringify(a[gidH]);
    const pV1 = await proyectar(ses, a[gidH].codosFin[0][0], a[gidH].codosFin[0][1]);
    await arrastrarEnPantalla(ses, pV1, 60, 60, 13);
    assert.equal(JSON.stringify((await ajustes(ses))[gidH]), antesV1, "V1 se pudo arrastrar");

    const antesGlobo = JSON.stringify((await ajustes(ses))[gidH]);
    const burbujaAntes = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    await arrastrarEnPantalla(ses, burbujaAntes, 40, 40, 11);
    assert.equal(
      JSON.stringify((await ajustes(ses))[gidH]),
      antesGlobo,
      "el globo del codo se pudo arrastrar",
    );

    // 5) Escape a mitad de un arrastre de V2 no deja nada escrito.
    const antesEscape = JSON.stringify((await ajustes(ses))[gidH]);
    await arrastrarAsa(ses, "A", "fin", -80, 70, { indiceCodo: 1, cancelar: true });
    assert.equal(JSON.stringify((await ajustes(ses))[gidH]), antesEscape, "Escape no canceló");

    // 6) Deshacer y Rehacer alrededor de un arrastre de V2.
    const codosDe = (valor) => (valor?.codosFin ?? []).map((p) => [...p]);
    const antesArrastre = codosDe((await ajustes(ses))[gidH]);
    await arrastrarAsa(ses, "A", "fin", 60, 4, { indiceCodo: 1 });
    const trasArrastre = codosDe((await ajustes(ses))[gidH]);
    assert.notDeepEqual(trasArrastre, antesArrastre, "el arrastre no cambió el codo");
    await activar(ses, "cmd-deshacer");
    await esperar(700);
    const deshecho = codosDe((await ajustes(ses))[gidH]);
    assert.equal(deshecho.length, antesArrastre.length, "Deshacer dejó otro número de nodos");
    deshecho.forEach((p, i) => assert.ok(cerca(p, antesArrastre[i]), "Deshacer no revirtió"));
    await activar(ses, "cmd-rehacer");
    await esperar(700);
    const rehecho = codosDe((await ajustes(ses))[gidH]);
    assert.equal(rehecho.length, trasArrastre.length, "Rehacer dejó otro número de nodos");
    rehecho.forEach((p, i) => assert.ok(cerca(p, trasArrastre[i]), "Rehacer no repitió"));

    // 7) Quitar el codo desde el menú de V2: línea recta y globo al extremo.
    await quitarCodoConMenu(ses, "A", "fin", 1);
    a = await ajustes(ses);
    assert.equal(a[gidH], undefined, "quitar el codo no devolvió el ajuste original");
    const burbujaFinal = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    const finReal = await proyectar(ses, horizontal.x2 + D / 2, horizontal.y2);
    assert.ok(
      Math.hypot(burbujaFinal.x - finReal.x, burbujaFinal.y - finReal.y) < 2,
      "el globo no volvió al extremo (borde sobre el extremo, centro a D/2)",
    );

    // 8) Capturas: los 4 casos de la referencia en ejes horizontales, el eje
    // vertical con codo y un eje seleccionado con sus pinzamientos.
    await cambiarPestana(ses, "Inicio");
    await crearModelo(ses);
    await crearNivelLista(ses);
    await dibujarEjes(ses, [
      [[-2, 0], [10, 0]],
      [[-2, 4], [10, 4]],
      [[-2, 8], [10, 8]],
      [[-2, 12], [10, 12]],
      [[14, 0], [14, 10]],
    ]);
    await elegirVista(ses, "Planta Nivel 0");
    const refs2 = await invocar(ses, "modelo.referencias");
    const horizontales = refs2.ejes
      .filter((e) => !e.vertical && e.etiqueta)
      .sort((a, b) => a.y1 - b.y1);
    const vert = refs2.ejes.find((e) => e.vertical && e.etiqueta);
    assert.equal(horizontales.length, 4, "faltan los cuatro ejes horizontales");
    const [h1, h2, h3, h4] = horizontales;

    // Caso 2: codo hacia un lado (el de por omisión).
    await seleccionarEje(ses, h2.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    // Caso 3: codo hacia el otro lado, arrastrando V2 de lado.
    await seleccionarEje(ses, h3.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    const centro3 = [h3.x2 + D / 2, h3.y2];
    await arrastrarAsaAMundo(ses, h3.etiqueta, "fin", 1, [centro3[0] - 1.5 * D, centro3[1] - 0.6 * D]);
    // Caso 4: V2 de lado y hacia afuera a lo largo: diagonal y recorrido más
    // largos; el globo sigue a V2 conservando el tramo final de 1.0·D.
    await seleccionarEje(ses, h4.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    const centro4 = [h4.x2 + D / 2, h4.y2];
    await arrastrarAsaAMundo(ses, h4.etiqueta, "fin", 1, [centro4[0] - 1.5 * D, centro4[1] + 1.2 * D]);
    await arrastrarAsaAMundo(ses, h4.etiqueta, "fin", 1, [centro4[0] + 0.5 * D, centro4[1] + 1.2 * D]);
    // Eje vertical con codo.
    await seleccionarEje(ses, vert.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    await esperar(600);

    // Zoom suficiente para que los cuatro casos se lean como la referencia.
    await activar(ses, "visor-ajustar");
    await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtZoom(0.85),
    );
    await esperar(600);
    await ses.captura(path.join(PROGRESO, "casos-referencia.png"));

    // Eje horizontal seleccionado: se ve el único pinzamiento en V2.
    await seleccionarEje(ses, h4.etiqueta);
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "eje-seleccionado-pinzamientos.png"));

    // Un eje vertical suelto, ampliado, para comparar con el caso vertical.
    await seleccionarEje(ses, vert.etiqueta);
    const burbujaV = await ses.driver.executeScript(
      (etiqueta) =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla(etiqueta),
      vert.etiqueta,
    );
    await ses.driver.executeScript(
      (x, y) => document.querySelector('[data-testid="visor"]').__openrvtZoomEn(0.3, x, y),
      burbujaV.x,
      burbujaV.y,
    );
    await esperar(600);
    await ses.captura(path.join(PROGRESO, "eje-vertical.png"));

    // Casos 1 y 2 sueltos para leerlos con detalle.
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "casos-referencia-y-vertical.png"));

    const capturas = fs.readdirSync(PROGRESO).filter((f) => f.endsWith(".png"));
    for (const nombre of [
      "casos-referencia.png",
      "eje-seleccionado-pinzamientos.png",
      "eje-vertical.png",
    ]) {
      assert.ok(capturas.includes(nombre), `no se guardó ${nombre}`);
    }
  } finally {
    await ses.cerrar();
  }
});
