// ED1: recortar y extender con clics reales en la app (Tauri + WebDriver).
//
// Valores a mano:
//   M1 (0,0)-(3,0) y M2 (4,1)-(4,5) a esquina quedan M1 (0,0)-(4,0) y
//   M2 (4,0)-(4,5). El muro M3 (0,6)-(6,6) se recorta contra el eje x=4
//   conservando el clic en (1,6): queda (0,6)-(4,6). La contratrabe CT
//   (0,9)-(2,9) se extiende hasta el muro M4 en x=5: queda (0,9)-(5,9).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "ED1");
fs.mkdirSync(CAPTURAS, { recursive: true });

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
      assert.equal(datos[8], 8, "se esperaba PNG de 8 bits");
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

function esNaranja(png, i) {
  const r = png.datos[i];
  const g = png.datos[i + 1];
  const b = png.datos[i + 2];
  return r >= 190 && g >= 110 && g <= 230 && b <= 190 && r - b >= 40;
}

function naranjaNueva(antes, previa) {
  let cuenta = 0;
  for (let i = 0; i < previa.datos.length; i += previa.canales) {
    if (esNaranja(previa, i) && !esNaranja(antes, i)) cuenta += 1;
  }
  return cuenta;
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
        return null;
      };
    },
    rutas,
  );
}

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(350);
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
  await esperar(300);
}

async function escribir(ses, texto) {
  for (const letra of texto) {
    await tecla(ses, letra, `Key${letra.toUpperCase()}`);
  }
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
  await esperar(450);
}

async function moverEn(ses, punto) {
  await ses.driver.executeScript(
    (punto) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerType: "mouse",
          buttons: 0,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(350);
}

async function clicMundo(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y})`);
  await clicEn(ses, punto);
}

async function moverMundo(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y})`);
  await moverEn(ses, punto);
}

async function elegirModo(ses, modo) {
  await ses.driver.executeScript(
    (modo) => {
      const el = document.querySelector('[data-testid="recorte-modo"]');
      if (!el) throw new Error("falta recorte-modo");
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(
        el,
        modo,
      );
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    modo,
  );
  await esperar(250);
}

async function esperarHerramienta(ses, nombre) {
  await ses.driver.wait(
    async () =>
      (await (await ses.porTestid("barra-herramienta")).getAttribute("data-herramienta")) ===
      nombre,
    10_000,
    `no se activó la herramienta ${nombre}`,
  );
}

async function muro(ses, globalid) {
  const referencias = await invocar(ses, "modelo.referencias", {});
  return referencias.muros.find((m) => m.globalid === globalid);
}

async function estructura(ses, globalid) {
  const props = await invocar(ses, "modelo.propiedades", { globalid });
  const p = props.psets.OPENRVT_Estructura;
  return {
    x1: p.X1,
    y1: p.Y1,
    x2: p.X2,
    y2: p.Y2,
  };
}

function cerca(a, b) {
  return Math.abs(a - b) < 1e-6;
}

async function firmarVista(ses) {
  return ses.driver.executeScript(() => {
    const el = document.querySelector('[data-testid="visor"]');
    return {
      ancho: el.clientWidth,
      alto: el.clientHeight,
      herramienta: el.getAttribute("data-herramienta"),
      preview: el.getAttribute("data-recorte-preview"),
    };
  });
}

test("ED1: recortar y extender con clics reales", async () => {
  const ses = await Sesion.abrir({
    prueba: "ed1",
    tamano: { ancho: 1400, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-ed1-"));
    const ruta = path.join(carpeta, "ed1.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "ED1 E2E" });
    const nivel = (await invocar(ses, "modelo.niveles", {}))[0].globalid;
    const tipoMuro = "Block 15";
    const crearMuro = async (x1, y1, x2, y2) =>
      (
        await invocar(ses, "muros.crear", {
          tipo: tipoMuro,
          nivel,
          x1,
          y1,
          x2,
          y2,
          altura: 2.6,
        })
      ).creados[0];
    const m1 = await crearMuro(0, 0, 3, 0);
    const m2 = await crearMuro(4, 1, 4, 5);
    const m3 = await crearMuro(0, 6, 6, 6);
    const m4 = await crearMuro(5, 8, 5, 12);
    const m5 = await crearMuro(0, 7, 6, 7);
    const m6 = await crearMuro(0, 13, 6, 13);
    const eje = (
      await invocar(ses, "ejes.crear", {
        etiqueta: "A",
        x1: 4,
        y1: -2,
        x2: 4,
        y2: 14,
      })
    ).creados[0];
    const contratrabe = (
      await invocar(ses, "vigas.crear", {
        tipo: "CT-1 Contratrabe 20×40",
        nivel,
        x1: 0,
        y1: 9,
        x2: 2,
        y2: 9,
      })
    ).creados[0];
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "ed1.ifc",
      30_000,
      "no abrió el modelo ED1",
    );
    await activar(ses, "visor-ajustar");
    await esperar(600);

    // 1. A esquina con dos clics reales y captura de la vista previa.
    await escribir(ses, "tr");
    await esperarHerramienta(ses, "recortar_extender");
    assert.equal(await ses.driver.executeScript(() => document.querySelector('[data-testid="recorte-modo"]').value), "esquina");
    await ses.captura(path.join(CAPTURAS, "ed1-antes.png"));
    await clicMundo(ses, 1, 0);
    await moverMundo(ses, 4, 3);
    const firma = await firmarVista(ses);
    assert.equal(firma.preview, "si", "no se dibujó la vista previa");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="recorte-paso"]').textContent.trim(),
      ),
      "Clic en el segundo elemento",
    );
    await ses.captura(path.join(CAPTURAS, "ed1-previa.png"));
    await clicMundo(ses, 4, 3);
    await ses.captura(path.join(CAPTURAS, "ed1-despues.png"));
    const pngAntes = leerPng(path.join(CAPTURAS, "ed1-antes.png"));
    const pngPrevia = leerPng(path.join(CAPTURAS, "ed1-previa.png"));
    const pngDespues = leerPng(path.join(CAPTURAS, "ed1-despues.png"));
    assert.ok(pngAntes.ancho > 0 && pngAntes.alto > 0);
    assert.ok(
      naranjaNueva(pngAntes, pngPrevia) > 20,
      "la captura de vista previa no muestra la línea tenue",
    );
    assert.notDeepEqual(pngDespues.datos, pngPrevia.datos);
    const r1 = await muro(ses, m1);
    const r2 = await muro(ses, m2);
    assert.ok(cerca(r1.x1, 0) && cerca(r1.y1, 0) && cerca(r1.x2, 4) && cerca(r1.y2, 0));
    assert.ok(cerca(r2.x1, 4) && cerca(r2.y1, 0) && cerca(r2.x2, 4) && cerca(r2.y2, 5));
    const propsM1 = await invocar(ses, "modelo.propiedades", { globalid: m1 });
    assert.equal(propsM1.psets.OPENRVT_Muro.Longitud, 4);
    assert.equal(propsM1.psets.OPENRVT_Muro.Longitud * propsM1.psets.OPENRVT_Muro.Altura, 10.4);

    // 2. Recortar el muro M3 contra el eje x=4 conservando el clic en (1,6).
    await elegirModo(ses, "elemento");
    await clicMundo(ses, 4, 7);
    await clicMundo(ses, 1, 6);
    const r3 = await muro(ses, m3);
    assert.ok(cerca(r3.x1, 0) && cerca(r3.y1, 6) && cerca(r3.x2, 4) && cerca(r3.y2, 6));

    // 3. Extender la contratrabe hasta el muro M4 en x=5.
    await clicMundo(ses, 5, 10);
    await clicMundo(ses, 1, 9);
    const c1 = await estructura(ses, contratrabe);
    assert.ok(cerca(c1.x1, 0) && cerca(c1.y1, 9) && cerca(c1.x2, 5) && cerca(c1.y2, 9));

    // 4. Deshacer y rehacer desde el teclado.
    await tecla(ses, "z", "KeyZ", { ctrlKey: true });
    await esperar(500);
    const c2 = await estructura(ses, contratrabe);
    assert.ok(cerca(c2.x2, 2), "Deshacer no devolvió la contratrabe a x=2");
    await tecla(ses, "y", "KeyY", { ctrlKey: true });
    await esperar(500);
    const c3 = await estructura(ses, contratrabe);
    assert.ok(cerca(c3.x2, 5), "Rehacer no volvió a extender la contratrabe a x=5");

    // 5. Modo «Varios elementos»: una referencia y dos ajustes; Enter termina.
    // Deshacer/Rehacer recarga el modelo y sale de la herramienta: se reactiva.
    await escribir(ses, "tr");
    await esperarHerramienta(ses, "recortar_extender");
    await elegirModo(ses, "varios");
    await clicMundo(ses, 4, 11);
    await clicMundo(ses, 1, 7);
    await clicMundo(ses, 1, 13);
    const r5 = await muro(ses, m5);
    const r6 = await muro(ses, m6);
    assert.ok(cerca(r5.x1, 0) && cerca(r5.x2, 4) && cerca(r5.y2, 7));
    assert.ok(cerca(r6.x1, 0) && cerca(r6.x2, 4) && cerca(r6.y2, 13));
    await tecla(ses, "Enter", "Enter");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="recorte-paso"]').textContent.trim(),
      ),
      "Clic en la referencia (elemento o eje)",
    );

    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
  } finally {
    await ses.cerrar();
  }
});
