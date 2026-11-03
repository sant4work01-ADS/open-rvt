// O036b: auto-enlace de lineales y ejes solo ortogonales con la app real.
// Retícula 2×2 con la herramienta Eje: 1 (x=0), 2 (x=4), A (y=0), B (y=3).
// Muro de (0,0) a (4,0): debe quedar enlazado al eje A, de 1 a 2.
// Giro de 10° del eje 2 alrededor de su punto medio (4, 1.5):
//   cruce 2-A = 4 + 1.5·tan 10° = 4.2644904711 → el muro mide eso.
// Deshacer devuelve el eje a x=4 y el muro a 4.00 m.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O036");
fs.mkdirSync(CAPTURAS, { recursive: true });

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

/** Una captura se lee como imagen: tiene tamaño y muchos colores distintos. */
function comprobarCaptura(ruta) {
  const img = leerPng(ruta);
  assert.ok(img.ancho >= 800 && img.alto >= 600, `captura pequeña ${ruta}`);
  const colores = new Set();
  for (let i = 0; i < img.datos.length; i += img.canales * 37) {
    colores.add(
      `${img.datos[i]},${img.datos[i + 1]},${img.datos[i + 2]}`,
    );
  }
  assert.ok(colores.size > 20, `la captura ${ruta} parece vacía`);
  return img;
}

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(300);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
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

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function piezas(ses, clase) {
  const elementos = await invocar(ses, "modelo.elementos");
  return elementos.filter((e) => e.clase === clase).map((e) => e.globalid);
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
  await esperar(350);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicEn(ses, await proyectar(ses, x, y, z));
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
  await esperar(200);
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
  await activar(ses, "visor-ajustar");
  await esperar(700);
}

test("O036: reticula, eje ortogonal y muro enlazado", async () => {
  const ses = await Sesion.abrir({
    prueba: "o036",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    const descartar = await ses.driver.findElements(
      By.xpath('//button[normalize-space(.)="No guardar"]'),
    );
    if (descartar.length > 0) {
      await descartar[0].click();
      await esperar(700);
    }
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");

    // 0) O036b: un segundo clic algo inclinado no crea un eje chueco: |dx| = 5
    // domina sobre |dy| = 0.8 y el eje queda horizontal de (0,0) a (5,0).
    await activar(ses, "cmd-eje");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 5, 0.8);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    const inclinado = await invocar(ses, "modelo.referencias");
    assert.equal(inclinado.ejes.length, 1, "el eje inclinado debía quedar creado");
    const ejeOrtogonalCreado = inclinado.ejes[0];
    assert.equal(ejeOrtogonalCreado.y1, 0, `el eje no quedó horizontal: ${JSON.stringify(ejeOrtogonalCreado)}`);
    assert.equal(ejeOrtogonalCreado.y2, 0, `el eje no quedó horizontal: ${JSON.stringify(ejeOrtogonalCreado)}`);
    assert.ok(Math.abs(ejeOrtogonalCreado.x1 - 0) < 1e-6);
    assert.ok(Math.abs(ejeOrtogonalCreado.x2 - 5) < 1e-6);
    await activar(ses, "visor-ajustar");
    await esperar(700);
    const ejeCaptura = path.join(CAPTURAS, "o036b-eje-horizontal.png");
    await ses.captura(ejeCaptura);
    // Deshacer refresca el estado de la interfaz y deja el modelo vacío para
    // dibujar la retícula 2×2 con las etiquetas 1, 2, A y B.
    await activar(ses, "cmd-deshacer");
    await esperar(1200);

    // 1) Retícula 2×2 con la herramienta Eje.
    await dibujarEjes(ses, [
      [[0, -2], [0, 5]],
      [[4, -2], [4, 5]],
      [[-2, 0], [6, 0]],
      [[-2, 3], [6, 3]],
    ]);
    const referencias = await invocar(ses, "modelo.referencias");
    const eje = (etiqueta) => {
      const encontrado = referencias.ejes.find((e) => e.etiqueta === etiqueta);
      assert.ok(encontrado, `no existe el eje ${etiqueta}`);
      return encontrado.globalid;
    };
    const reticula = path.join(CAPTURAS, "o036-reticula.png");
    await ses.captura(reticula);

    // 2) Muro con dos clics en los cruces 1-A y 2-A: queda enlazado a A.
    await activar(ses, "cmd-muro");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 4, 0);
    await tecla(ses, "Escape", "Escape");
    await esperar(500);
    const muros = await piezas(ses, "IfcWall");
    assert.equal(muros.length, 1, "no se creó exactamente un muro");
    const muro = muros[0];
    const pset = (await props(ses, muro)).psets.OPENRVT_Restricciones;
    assert.equal(pset.EnlaceTipo, "tramo");
    assert.equal(pset.EnlaceEjeGuia, eje("A"));
    assert.equal(pset.EnlaceEjeInicio, eje("1"));
    assert.equal(pset.EnlaceEjeFin, eje("2"));

    // El panel muestra el enlace del muro (el candado de enlace). Se elige en el
    // árbol porque la línea del eje A tiene prioridad sobre el muro en el visor.
    await activar(ses, "panel-pestana-proyecto");
    await fijarValor(ses, "arbol-buscador", "Muro");
    const nodoMuro = await ses.driver.wait(
      until.elementLocated(
        By.css('[data-testid="arbol-nodo"][data-tipo="elemento"]'),
      ),
      10_000,
      "el árbol no muestra el muro",
    );
    await ses.driver.executeScript((nodo) => nodo.click(), nodoMuro);
    await ses.driver.wait(
      async () => (await ses.porTestid("elemento-enlace", 3_000)) !== null,
      5_000,
      "el panel no muestra el enlace del muro",
    );
    assert.equal(
      await textoDom(ses, '[data-testid="elemento-enlace"] span'),
      "Enlazado a: eje A, de 1 a 2",
    );
    const enlace = path.join(CAPTURAS, "o036-enlace.png");
    await ses.captura(enlace);

    // 5) Las capturas se leen como imagen (tamaño y contenido).
    for (const ruta of [ejeCaptura, reticula, enlace]) {
      const img = comprobarCaptura(ruta);
      assert.ok(fs.statSync(ruta).size > 5000, `PNG vacío: ${ruta}`);
      assert.ok(img.datos.length === img.ancho * img.alto * img.canales);
    }
  } finally {
    await ses.cerrar();
  }
});
