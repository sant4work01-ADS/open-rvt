// O014a: centrado real del texto de las burbujas y estilo de nivel configurable.
// Se ejecuta sobre la app real (Tauri) como los e2e de O011/O013.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const RESULTADOS = path.join(RAIZ, "resultados", "O014a");
fs.mkdirSync(CAPTURAS, { recursive: true });
fs.mkdirSync(RESULTADOS, { recursive: true });

// --- Lector PNG mínimo (8 bits, RGB/RGBA) para medir los píxeles de la captura.
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

function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function distancia(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Centro del anillo y centro de la caja de los píxeles del texto, en coordenadas de
// la captura. El relleno del globo cubre la línea del eje, así que el interior solo
// tiene el glifo.
function medirBurbuja(rutaPng, info) {
  const png = leerPng(rutaPng);
  const sx = png.ancho / info.anchoVentana;
  const sy = png.alto / info.altoVentana;
  const cx = info.x * sx;
  const cy = info.y * sy;
  const r = info.radio * sx;
  const tinta = rgb(info.colorAnillo);
  const fondo = rgb(info.colorFondo);
  const esTinta = (x, y) => {
    const i = (y * png.ancho + x) * png.canales;
    const c = [png.datos[i], png.datos[i + 1], png.datos[i + 2]];
    return distancia(c, tinta) < 160 && distancia(c, fondo) > 50;
  };
  const caja = (hasta, radialMin) => {
    const x0 = Math.max(0, Math.floor(cx - hasta));
    const x1 = Math.min(png.ancho - 1, Math.ceil(cx + hasta));
    const y0 = Math.max(0, Math.floor(cy - hasta));
    const y1 = Math.min(png.alto - 1, Math.ceil(cy + hasta));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d < radialMin * r || d > hasta) continue;
        if (!esTinta(x, y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!(minX <= maxX && minY <= maxY)) {
      const k = (Math.round(cy) * png.ancho + Math.round(cx)) * png.canales;
      assert.fail(
        `sin píxeles (hasta=${hasta.toFixed(1)} radialMin=${radialMin}) ` +
          `centro=(${cx.toFixed(1)},${cy.toFixed(1)}) r=${r.toFixed(1)} ` +
          `pixel=(${png.datos[k]},${png.datos[k + 1]},${png.datos[k + 2]}) ` +
          `esperado=${JSON.stringify(tinta)}`,
      );
    }
    return { x: (minX + maxX) / 2 / sx, y: (minY + maxY) / 2 / sy };
  };
  // Anillo: solo la corona (la línea del eje queda fuera de este radio, así no
  // sesga la caja). El texto se mide por dentro, donde el relleno tapa la línea.
  const anillo = caja(1.02 * r, 0.86);
  const texto = caja(0.8 * r, 0);
  return {
    desvioX: Math.abs(texto.x - anillo.x),
    desvioY: Math.abs(texto.y - anillo.y),
    anillo,
    texto,
  };
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

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
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
  await esperar(320);
}

async function tecla(ses, key, code) {
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
  await esperar(250);
}

async function crearModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await cambiarPestana(ses, "Modelar");
}

async function crearNiveles(ses, cantidad) {
  for (let i = 0; i < cantidad; i += 1) await activar(ses, "cmd-nivel");
}

async function dibujarEjes(ses, xs) {
  await activar(ses, "cmd-eje");
  for (const x of xs) {
    await clicMundo(ses, x, -2);
    await clicMundo(ses, x, 8);
  }
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(400);
  await activar(ses, "visor-ajustar");
  await esperar(600);
}

async function dibujarMuroAlto(ses, alto) {
  await activar(ses, "cmd-muro");
  await fijarValor(ses, "muro-altura", String(alto));
  await clicMundo(ses, 0, 0);
  await clicMundo(ses, 18, 0);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(700);
}

async function burbuja(ses, etiqueta) {
  return ses.driver.executeScript(
    (etiqueta) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla(etiqueta),
    etiqueta,
  );
}

async function zoomEn(ses, factor, x, y) {
  await ses.driver.executeScript(
    (factor, x, y) =>
      document.querySelector('[data-testid="visor"]').__openrvtZoomEn(factor, x, y),
    factor,
    x,
    y,
  );
  await esperar(600);
}

test("O014a-1: burbujas centradas, cabeza de nivel y estilo guardado", async () => {
  const ses = await Sesion.abrir({
    prueba: "o014a",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o014a-"));
  const ruta = path.join(carpeta, "o014a.ifc");
  const etiquetas = ["A", "12", "A.1"];
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 2);
    await dibujarMuroAlto(ses, 6);
    await dibujarEjes(ses, [0, 6, 12]);

    // Renombrar los tres ejes (el núcleo es la única puerta de entrada) y reabrir
    // para que la vista los dibuje con sus etiquetas reales.
    const referencias = await invocar(ses, "modelo.referencias");
    const ejes = [...referencias.ejes].sort((a, b) => a.x1 - b.x1);
    assert.equal(ejes.length, 3, "faltan ejes de la prueba");
    for (let i = 0; i < 3; i += 1) {
      await invocar(ses, "ejes.editar", { globalid: ejes[i].globalid, etiqueta: etiquetas[i] });
    }
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o014a.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    assert.equal(await atributoVisor(ses, "ejes"), "3");
    assert.deepEqual(
      (await atributoVisor(ses, "ejes-etiquetas")).split(",").sort(),
      [...etiquetas].sort(),
      "no quedaron las tres etiquetas de la prueba",
    );

    // 100 %: las tres burbujas en una sola captura.
    const png100 = path.join(CAPTURAS, "o014a-planta-zoom-100.png");
    await ses.captura(png100);
    const infos100 = {};
    for (const etiqueta of etiquetas) {
      infos100[etiqueta] = await burbuja(ses, etiqueta);
      assert.ok(infos100[etiqueta], `no se encontró la burbuja ${etiqueta}`);
      assert.ok(infos100[etiqueta].radio > 6, `la burbuja ${etiqueta} quedó muy chica`);
    }
    for (const etiqueta of etiquetas) {
      const m = medirBurbuja(png100, infos100[etiqueta]);
      assert.ok(
        m.desvioX <= 0.5 && m.desvioY <= 0.5,
        `«${etiqueta}» no está centrada a 100 %: ΔX=${m.desvioX.toFixed(3)} ΔY=${m.desvioY.toFixed(3)}`,
      );
    }

    // 400 %: se acerca a cada burbuja para que siga dentro de la ventana.
    for (const etiqueta of etiquetas) {
      await activar(ses, "visor-ajustar");
      await esperar(500);
      const base = await burbuja(ses, etiqueta);
      await zoomEn(ses, 0.25, base.x, base.y);
      const info = await burbuja(ses, etiqueta);
      const png = path.join(CAPTURAS, `o014a-planta-zoom-400-${etiqueta.replace(".", "_")}.png`);
      await ses.captura(png);
      const m = medirBurbuja(png, info);
      assert.ok(
        info.radio > base.radio * 3.2,
        `la burbuja ${etiqueta} no creció ×4: ${base.radio} → ${info.radio}`,
      );
      assert.ok(
        m.desvioX <= 1 && m.desvioY <= 1,
        `«${etiqueta}» no está centrada a 400 %: ΔX=${m.desvioX.toFixed(3)} ΔY=${m.desvioY.toFixed(3)}`,
      );
    }

    // Parte 2: en el alzado la cabeza usa el formato Npt con signo y 2 decimales.
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    let nivelesTexto = await atributoVisor(ses, "niveles-texto");
    assert.ok(nivelesTexto.includes("Npt 0.00m"), `falta «Npt 0.00m» en: ${nivelesTexto}`);
    assert.ok(nivelesTexto.includes("Npt +3.00m"), `falta «Npt +3.00m» en: ${nivelesTexto}`);
    const cotasPorDefecto = JSON.parse(await atributoVisor(ses, "niveles-cotas"));
    // Tres niveles (0, 3 y 6 m) dan dos tramos parciales y una total de 6 m.
    assert.deepEqual(cotasPorDefecto[0].parciales, ["3.00", "3.00"]);
    assert.equal(cotasPorDefecto[0].total, "Total 6.00");

    // Parte 3: el diálogo guarda el estilo de nivel y la vista lo aplica.
    await cambiarPestana(ses, "Vista");
    await activar(ses, "cmd-estilos");
    await cambiarPestana(ses, "Niveles");
    await fijarValor(ses, "nivel-prefijo", "NPT-");
    await fijarValor(ses, "nivel-decimales", "3");
    await fijarValor(ses, "nivel-unidad", "");
    await activar(ses, "nivel-cotas");
    await activar(ses, "nivel-mostrar-nombre");
    await activar(ses, "boton-guardar-estilos");
    await esperar(700);
    nivelesTexto = await atributoVisor(ses, "niveles-texto");
    assert.ok(nivelesTexto.includes("NPT- +3.000"), `el prefijo no se aplicó: ${nivelesTexto}`);
    assert.ok(!nivelesTexto.includes("Nivel 0"), "el nombre debía ocultarse");
    const cotasOcultas = JSON.parse(await atributoVisor(ses, "niveles-cotas"));
    assert.deepEqual(cotasOcultas[0].parciales, [], "cotas:false no ocultó la cadena");
    assert.equal(cotasOcultas[0].total, null, "cotas:false no ocultó el total");
    await ses.captura(path.join(CAPTURAS, "o014a-alzado-estilo-niveles.png"));

    // Se guardó en el pset y sobrevive a cerrar y reabrir el archivo.
    const guardado = await invocar(ses, "estilos.leer");
    assert.equal(guardado.niveles.prefijo, "NPT-");
    assert.equal(guardado.niveles.decimales, 3);
    assert.equal(guardado.niveles.unidad, "");
    assert.equal(guardado.niveles.cotas, false);
    assert.equal(guardado.niveles.mostrarNombre, false);

    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o014a.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo con el estilo nuevo");
    await elegirVista(ses, "Alzado Norte");
    await esperar(700);
    const releido = await invocar(ses, "estilos.leer");
    assert.deepEqual(releido.niveles, guardado.niveles, "el estilo no persistió");
    const textoReabierto = await atributoVisor(ses, "niveles-texto");
    assert.ok(
      textoReabierto.includes("NPT- +3.000"),
      `el estilo no se aplicó al reabrir: ${textoReabierto}`,
    );
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
