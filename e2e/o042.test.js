// O044: codo del eje como el dibujo del dueño (V1 a lo largo, V2 en X o Y) y
// grosores de línea de pantalla independientes del zoom. Se ejecuta sobre la app
// real (Tauri + WebView2) con clics y arrastres de puntero en planta.
//
// Valores calculados a mano (D = 0.8 m = globo de 8 mm a 1:100):
//   Retícula del dueño: ejes verticales 1 y 2 en x = 0 y 2.5; ejes A y B en
//   y = 0 y 4.2. B termina en x = 3.7, a 1.2 m del cruce con el eje 2.
//   Globo sin codo de B: centro (3.7 + 0.4, 4.2) = (4.1, 4.2).
//   Codo sin corrimiento: V2 = (4.1 - 1.30·0.8, 4.2 + 0.55·0.8) = (3.06, 4.64);
//   V1 = V2 - 0.50·D a lo largo - 0.55·D de lado = (2.66, 4.2).
//   El cruce está en x = 2.5: V1 queda a 0.16 m (menos de 0.30·D = 0.24), así
//   que todo el codo se corre 0.08 m hacia afuera: V1 = (2.74, 4.2),
//   V2 = (3.14, 4.64) y globo = (4.18, 4.64); el tramo recto pasado el cruce
//   mide exactamente 0.24 m.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O044");
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

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicEn(ses, await proyectar(ses, x1, y1));
  await clicEn(ses, await proyectar(ses, x2, y2));
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(350);
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

/** Arrastra el asa `indiceCodo` en píxeles de pantalla (dos pasos de puntero). */
async function arrastrarAsa(ses, etiqueta, lado, dx, dy, opciones = {}) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado, indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(
        etiqueta,
        lado,
        indice,
      ),
    etiqueta,
    lado,
    opciones.indiceCodo,
  );
  assert.ok(inicio, `no se encontró el asa ${etiqueta}/${lado}/${opciones.indiceCodo}`);
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

async function moverPuntero(ses, punto) {
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: -1,
          buttons: 0,
          pointerId: 3,
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

/**
 * Grosor en píxeles de una línea horizontal: recorre una ventana vertical corta
 * alrededor del punto y cuenta los píxeles que se apartan del fondo. Es la
 * medida honesta de lo que se ve, no lo que dice el código.
 */
function colorFondo(img) {
  // El color más frecuente de la captura es el fondo del visor (blanco o el gris
  // oscuro del tema), sin depender de dónde esté el panel.
  const cuenta = new Map();
  for (let y = 0; y < img.alto; y += 5) {
    for (let x = 0; x < img.ancho; x += 5) {
      const i = (y * img.ancho + x) * img.canales;
      const clave = `${img.datos[i]},${img.datos[i + 1]},${img.datos[i + 2]}`;
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    }
  }
  let mejorClave = "255,255,255";
  let mejorCuenta = -1;
  for (const [clave, n] of cuenta) {
    if (n > mejorCuenta) {
      mejorCuenta = n;
      mejorClave = clave;
    }
  }
  return mejorClave.split(",").map(Number);
}

function grosorLinea(img, ventana, punto, fondo, radio = 6) {
  const { px } = muestrear(img, punto, ventana, 0);
  let mejor = 0;
  for (let dx = -2; dx <= 2; dx += 1) {
    let cuenta = 0;
    for (let dy = -radio; dy <= radio; dy += 1) {
      if (colorDistancia(px(punto.x + dx, punto.y + dy), fondo) > 24) cuenta += 1;
    }
    mejor = Math.max(mejor, cuenta);
  }
  return mejor;
}

function distanciaPantalla(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("O044: codo del dueño, arrastre V1/V2, proporciones y grosores", async () => {
  const ses = await Sesion.abrir({
    prueba: "o042",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    await crearNivelLista(ses);
    // Retícula de la captura del dueño: ejes 1 y 2 verticales; A y B horizontales.
    await dibujarEjes(ses, [
      [[0, -1], [0, 6]],
      [[2.5, -1], [2.5, 6]],
      [[-1, 0], [3.7, 0]],
      [[-1, 4.2], [3.7, 4.2]],
    ]);
    await elegirVista(ses, "Planta Nivel 0");

    const vista = (await invocar(ses, "vistas.leer")).find((v) => v.nombre === "Planta Nivel 0");
    assert.ok(vista, "falta la vista Planta Nivel 0");
    // D = 8 mm de papel en el modelo: a 1:100 son 0.8 m. Calculado de la escala.
    const D = (8 * vista.escala) / 1000;
    assert.equal(D, 0.8, "la escala de la vista no es 1:100");

    const referencias = await invocar(ses, "modelo.referencias");
    const verticales = referencias.ejes.filter((e) => e.vertical && e.etiqueta).sort((a, b) => a.x1 - b.x1);
    const horizontales = referencias.ejes.filter((e) => !e.vertical && e.etiqueta).sort((a, b) => a.y1 - b.y1);
    assert.equal(verticales.length, 2, "faltan los ejes 1 y 2");
    assert.equal(horizontales.length, 2, "faltan los ejes A y B");
    const eje2 = verticales[1];
    const ejeB = horizontales[1];
    assert.equal(ejeB.etiqueta, "B", "el eje horizontal de arriba no es B");
    assert.ok(
      Math.abs(ejeB.y1 - 4.2) < 1e-9 && Math.abs(ejeB.x2 - 3.7) < 1e-9,
      `B no quedó en el extremo previsto: ${JSON.stringify(referencias.ejes)}`,
    );

    // 1) Agregar codo en el extremo derecho de B (panel del eje seleccionado).
    await seleccionarEje(ses, "B");
    await activar(ses, "eje-codo-fin-agregar");
    const a = await ajustes(ses);
    const codos = a[ejeB.globalid]?.codosFin;
    assert.ok(Array.isArray(codos) && codos.length === 2, "no se crearon V1 y V2");

    // Valores de la spec calculados a mano en el comentario de cabecera.
    const finB = [ejeB.x2, ejeB.y2];
    const dir = [1, 0];
    const perp = [0, 1];
    const centroSin = [finB[0] + dir[0] * (D / 2), finB[1] + dir[1] * (D / 2)];
    const v2Sin = [
      centroSin[0] - dir[0] * 1.3 * D + perp[0] * 0.55 * D,
      centroSin[1] - dir[1] * 1.3 * D + perp[1] * 0.55 * D,
    ];
    const v1Sin = [v2Sin[0] - dir[0] * 0.5 * D, finB[1]];
    const cruce = [eje2.x1, ejeB.y1];
    const corrimiento = Math.max(0, cruce[0] + 0.3 * D - v1Sin[0]);
    assert.ok(corrimiento > 0, "el cruce no obligó a correr el codo");
    const v1 = [v1Sin[0] + corrimiento, v1Sin[1]];
    const v2 = [v2Sin[0] + corrimiento, v2Sin[1]];
    const globo = [centroSin[0] + corrimiento, centroSin[1] + perp[1] * 0.55 * D];
    const borde = [v2[0] + dir[0] * 0.8 * D, v2[1] + dir[1] * 0.8 * D];

    assert.ok(cerca(codos[0], v1), `V1 incorrecto: ${JSON.stringify(codos[0])} vs ${JSON.stringify(v1)}`);
    assert.ok(cerca(codos[1], v2), `V2 incorrecto: ${JSON.stringify(codos[1])} vs ${JSON.stringify(v2)}`);
    assert.equal(a[ejeB.globalid].codoNuevoFin, true, "el codo no se marcó como nuevo");
    // Tramo recto exigido pasado el cruce: 0.30·D exactos.
    assert.ok(Math.abs(codos[0][0] - (cruce[0] + 0.3 * D)) < 1e-9, "no hay 0.30·D de recta pasado el cruce");

    // 2) Proporciones medidas en pantalla con tolerancia ±10 %.
    const pV1 = await proyectar(ses, v1[0], v1[1]);
    const pV2 = await proyectar(ses, v2[0], v2[1]);
    const pBorde = await proyectar(ses, borde[0], borde[1]);
    const pLateral = await proyectar(ses, v2[0], v1[1]);
    const pCruce = await proyectar(ses, cruce[0], cruce[1]);
    const pD0 = await proyectar(ses, 0, 6.5);
    const pD1 = await proyectar(ses, D, 6.5);
    const Dpx = distanciaPantalla(pD0, pD1);
    const proporcion = (a, b) => distanciaPantalla(a, b) / Dpx;
    const medidas = {
      final: proporcion(pV2, pBorde),
      lado: proporcion(pV2, pLateral),
      aLoLargo: proporcion(pV1, pLateral),
      recta: (pV1.x - pCruce.x) / Dpx,
    };
    assert.ok(Math.abs(medidas.final - 0.8) <= 0.08, `tramo final ${medidas.final}·D`);
    assert.ok(Math.abs(medidas.lado - 0.55) <= 0.055, `lado ${medidas.lado}·D`);
    assert.ok(Math.abs(medidas.aLoLargo - 0.5) <= 0.05, `a lo largo ${medidas.aLoLargo}·D`);
    assert.ok(medidas.recta >= 0.27, `tramo recto pasado el cruce ${medidas.recta}·D`);

    // El globo se ve en la posición derivada de V2 (misma x que el centro + 0.55·D
    // de lado), no en el extremo viejo.
    const burbuja = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("B"),
    );
    const pGlobo = await proyectar(ses, globo[0], globo[1]);
    assert.ok(
      Math.hypot(burbuja.x - pGlobo.x, burbuja.y - pGlobo.y) < 2,
      "el globo no quedó donde dicta el codo",
    );

    // 3) Captura de la retícula del dueño con el codo recién creado, antes de
    // arrastrarlo: debe verse como la línea azul de la referencia.
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtZoom(0.9),
    );
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "codos.png"));
    assert.ok(
      fs.readdirSync(PROGRESO).includes("codos.png"),
      "no se guardó codos.png",
    );

    // 4) Arrastrar V1 en diagonal: solo se mueve a lo largo del eje (x); V2 y el
    // globo no se mueven y el cambio es un paso de Deshacer.
    const antesV1 = JSON.parse(JSON.stringify(a[ejeB.globalid]));
    await arrastrarAsa(ses, "B", "fin", 60, 60, { indiceCodo: 0 });
    let tras = (await ajustes(ses))[ejeB.globalid];
    assert.ok(Math.abs(tras.codosFin[0][1] - antesV1.codosFin[0][1]) < 1e-9, "V1 salió del eje");
    assert.ok(tras.codosFin[0][0] > antesV1.codosFin[0][0] + 0.1, "V1 no avanzó a lo largo");
    assert.ok(cerca(tras.codosFin[1], antesV1.codosFin[1]), "arrastrar V1 movió V2");
    await activar(ses, "cmd-deshacer");
    await esperar(700);
    tras = (await ajustes(ses))[ejeB.globalid];
    assert.ok(cerca(tras.codosFin[0], antesV1.codosFin[0]), "Deshacer no revirtió el arrastre de V1");
    await activar(ses, "cmd-rehacer");
    await esperar(700);

    // 5) V2 en X y después en Y, con el componente mayor de los primeros 4 px.
    tras = (await ajustes(ses))[ejeB.globalid];
    const v2AntesX = [...tras.codosFin[1]];
    await arrastrarAsa(ses, "B", "fin", 80, 10, { indiceCodo: 1 });
    tras = (await ajustes(ses))[ejeB.globalid];
    assert.ok(Math.abs(tras.codosFin[1][1] - v2AntesX[1]) < 1e-9, "el arrastre en X movió Y");
    assert.ok(Math.abs(tras.codosFin[1][0] - v2AntesX[0]) > 0.2, "el arrastre en X no movió X");
    const v2AntesY = [...tras.codosFin[1]];
    await arrastrarAsa(ses, "B", "fin", 10, 80, { indiceCodo: 1 });
    tras = (await ajustes(ses))[ejeB.globalid];
    assert.ok(Math.abs(tras.codosFin[1][0] - v2AntesY[0]) < 1e-9, "el arrastre en Y movió X");
    assert.ok(Math.abs(tras.codosFin[1][1] - v2AntesY[1]) > 0.2, "el arrastre en Y no movió Y");
    // El destino se redondea a 1 mm de papel (0.01 m a 1:100).
    const paso = (1 * vista.escala) / 1000;
    for (const punto of [tras.codosFin[0], tras.codosFin[1]]) {
      for (const valor of punto) {
        assert.ok(
          Math.abs(valor / paso - Math.round(valor / paso)) < 1e-6,
          `el arrastre no se redondeó a 1 mm de papel: ${valor}`,
        );
      }
    }
    // Escape cancela el arrastre en curso y no deja nada escrito.
    const antesEscape = JSON.stringify((await ajustes(ses))[ejeB.globalid]);
    await arrastrarAsa(ses, "B", "fin", -90, 120, { indiceCodo: 1, cancelar: true });
    assert.equal(
      JSON.stringify((await ajustes(ses))[ejeB.globalid]),
      antesEscape,
      "Escape no canceló el arrastre de V2",
    );
    // El globo sigue a V2 con el tramo final de 0.80·D, paralelo al eje (+x).
    const v2Final = tras.codosFin[1];
    const globoFinal = [v2Final[0] + 1.3 * D, v2Final[1]];
    const burbujaFinal = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("B"),
    );
    const pGloboFinal = await proyectar(ses, globoFinal[0], globoFinal[1]);
    assert.ok(
      Math.hypot(burbujaFinal.x - pGloboFinal.x, burbujaFinal.y - pGloboFinal.y) < 2,
      "el globo no siguió a V2 conservando el tramo final",
    );

    // 6) Con el eje seleccionado hay dos pinzamientos (V1 y V2) y ninguno más.
    await seleccionarEje(ses, "B");
    await esperar(400);
    const capturaPix = path.join(os.tmpdir(), `o044-pix-${process.pid}.png`);
    await ses.captura(capturaPix);
    const img = leerPng(capturaPix);
    const ventana = await ses.driver.executeScript(() => ({
      ancho: window.innerWidth,
      alto: window.innerHeight,
    }));
    const pV1Ahora = await proyectar(ses, v2Final[0], v2Final[1]);
    const pV1Real = await proyectar(ses, tras.codosFin[0][0], tras.codosFin[0][1]);
    assert.ok(hayNaranja(img, pV1Real, ventana, 7), "no se ve el pinzamiento de V1");
    assert.ok(hayNaranja(img, pV1Ahora, ventana, 7), "no se ve el pinzamiento de V2");
    assert.equal(
      await ses.driver.executeScript(() =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla("B", "fin", undefined, "base"),
      ),
      null,
      "el extremo original todavía tiene pinzamiento",
    );
    // Guía de flechas al pasar el cursor: V1 solo en el sentido del eje (B es
    // horizontal); V2 en X y en Y.
    await moverPuntero(ses, pV1Real);
    const guiaV1 = await (await ses.porTestid("guia-codo")).getAttribute("data-direcciones");
    assert.equal(guiaV1, "horizontal", `guía de V1: ${guiaV1}`);
    await moverPuntero(ses, pV1Ahora);
    const guiaV2 = await (await ses.porTestid("guia-codo")).getAttribute("data-direcciones");
    assert.equal(guiaV2, "x,y", `guía de V2: ${guiaV2}`);
    fs.rmSync(capturaPix, { force: true });

    // 7) Grosores: la retícula de 6 muros de O041, a zoom normal y cercano. Las
    // líneas deben medir lo mismo en pantalla (1–2 px) en los dos casos.
    await cambiarPestana(ses, "Inicio");
    await crearModelo(ses);
    await crearNivelLista(ses);
    for (const [x1, y1, x2, y2] of [
      [0, 0, 8, 0],
      [0, 3, 8, 3],
      [0, 6, 8, 6],
      [0, 0, 0, 6],
      [4, 0, 4, 6],
      [8, 0, 8, 6],
    ]) {
      await dibujarMuro(ses, x1, y1, x2, y2);
    }
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    const elementos = (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
    const muros = elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(muros.length, 6, `se dibujaron ${muros.length} muros`);
    // Cara exterior del muro de y = 6, tomada del contorno real que dibuja el visor.
    const contorno = await ses.driver.executeScript(() => window.__OPENRVT_PLANTA_MUROS__ ?? null);
    assert.ok(Array.isArray(contorno) && contorno.length > 0, "el visor no expuso la planta de muros");
    let caraExterior = -Infinity;
    for (const poligono of contorno) {
      for (const anillo of [poligono.exterior, ...poligono.huecos]) {
        for (const p of anillo) caraExterior = Math.max(caraExterior, p[1]);
      }
    }
    assert.ok(
      Number.isFinite(caraExterior) && caraExterior > 6 && caraExterior < 6.3,
      `no se encontró la cara exterior del muro de y = 6: ${caraExterior}`,
    );

    const puntoMuro = await proyectar(ses, 2, caraExterior, 0);
    await ses.captura(path.join(PROGRESO, "planta-grosores.png"));
    const normal = leerPng(path.join(PROGRESO, "planta-grosores.png"));
    const fondoNormal = colorFondo(normal);
    const grosorNormal = grosorLinea(normal, ventana, puntoMuro, fondoNormal);
    assert.ok(grosorNormal >= 1, "no se encontró la línea del muro");
    assert.ok(grosorNormal <= 3, `la línea se ve gruesa a zoom normal: ${grosorNormal} px`);

    await ses.driver.executeScript(
      (x, y) => document.querySelector('[data-testid="visor"]').__openrvtZoomEn(0.125, x, y),
      puntoMuro.x,
      puntoMuro.y,
    );
    await esperar(700);
    const puntoCerca = await proyectar(ses, 2, caraExterior, 0);
    await ses.captura(path.join(PROGRESO, "planta-grosores-zoom.png"));
    const cercano = leerPng(path.join(PROGRESO, "planta-grosores-zoom.png"));
    const fondoCercano = colorFondo(cercano);
    const grosorCercano = grosorLinea(cercano, ventana, puntoCerca, fondoCercano);
    assert.ok(grosorCercano >= 1, "no se encontró la línea del muro al acercar");
    assert.ok(grosorCercano <= 3, `la línea engordó con el zoom: ${grosorCercano} px`);
    assert.ok(
      Math.abs(grosorCercano - grosorNormal) <= 1,
      `el grosor cambió con el zoom: ${grosorNormal} → ${grosorCercano} px`,
    );
  } finally {
    await ses.cerrar();
  }
});
