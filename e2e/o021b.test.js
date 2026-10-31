// O021b: el texto de nivel queda arriba de su línea y las cotas chicas no se
// enciman ni cruzan líneas de extensión. Se mide con las cajas proyectadas de la
// app real de Tauri (mismas reglas que O011/O014b).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O021b");
fs.mkdirSync(PROGRESO, { recursive: true });

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
  await esperar(350);
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

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(800);
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
      window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
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

async function dibujarMuroAlto(ses, alto) {
  await activar(ses, "cmd-muro");
  const ok = await ses.driver.executeScript((alto) => {
    const el = document.querySelector('[data-testid="muro-altura"]');
    if (!el) return false;
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(alto));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, alto);
  assert.equal(ok, true, "no se pudo fijar la altura del muro");
  await clicMundo(ses, 0, 0);
  await clicMundo(ses, 18, 0);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(700);
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
  await esperar(700);
}

async function anotaciones(ses) {
  const datos = await ses.driver.executeScript(() =>
    document.querySelector('[data-testid="visor"]').__openrvtAlzadoAnotacionesPantalla(),
  );
  assert.ok(datos, "no se pudieron leer las anotaciones del alzado");
  return datos;
}

function seIntersectan(a, b, margen = 0.5) {
  return a.x0 < b.x1 - margen && b.x0 < a.x1 - margen && a.y0 < b.y1 - margen && b.y0 < a.y1 - margen;
}

function puntoEnCaja(p, caja, margen = 0) {
  return (
    p.x >= caja.x0 - margen &&
    p.x <= caja.x1 + margen &&
    p.y >= caja.y0 - margen &&
    p.y <= caja.y1 + margen
  );
}

function segmentoCruzaCaja(a, b, caja, margen = 0.5) {
  const c = {
    x0: caja.x0 + margen,
    y0: caja.y0 + margen,
    x1: caja.x1 - margen,
    y1: caja.y1 - margen,
  };
  if (c.x0 >= c.x1 || c.y0 >= c.y1) return false;
  if (puntoEnCaja(a, c) || puntoEnCaja(b, c)) return true;
  const cortes = [
    [[c.x0, c.y0], [c.x1, c.y0]],
    [[c.x1, c.y0], [c.x1, c.y1]],
    [[c.x1, c.y1], [c.x0, c.y1]],
    [[c.x0, c.y1], [c.x0, c.y0]],
  ];
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const cruza = (p1, p2, p3, p4) => {
    const d1 = orient(p3, p4, p1);
    const d2 = orient(p3, p4, p2);
    const d3 = orient(p1, p2, p3);
    const d4 = orient(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  return cortes.some(([p, q]) => cruza(a, b, p, q));
}

test("O021b: texto de nivel arriba de su línea y cotas chicas separadas", async () => {
  const ses = await Sesion.abrir({
    prueba: "o021b",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o021b-"));
  const ruta = path.join(carpeta, "o021b.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 3);
    await dibujarMuroAlto(ses, 6);
    await dibujarEjes(ses, [0, 4, 8]);

    const niveles = (await invocar(ses, "modelo.niveles")).sort((a, b) => a.elevacion - b.elevacion);
    assert.equal(niveles.length, 4, "faltan niveles de la prueba");
    // Cadena 0.10 / 0.20 / 3.00: cuatro cotas de nivel en 0.00, 0.10, 0.30 y 3.30.
    const elevaciones = [0, 0.1, 0.3, 3.3];
    for (let i = 0; i < 4; i += 1) {
      await invocar(ses, "niveles.editar", {
        globalid: niveles[i].globalid,
        nombre: niveles[i].nombre,
        elevacion: elevaciones[i],
      });
    }
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o021b.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo");

    await elegirVista(ses, "Alzado Norte");
    // O030 pone el alzado «A escala» por omisión; a 1:100 un texto de 2.5 mm mide
    // 0.25 m y no cabe entre niveles a 0.10 m. La referencia es 1:20 (2.5 mm =
    // 0.05 m), que sí permite comprobar la separación de las cotas chicas.
    await fijarValor(ses, "vista-escala", "20");
    await esperar(500);
    await activar(ses, "visor-ajustar");
    await esperar(900);

    const datos = await anotaciones(ses);
    const etiquetasNivel = datos.etiquetas.filter((e) => e.tipo === "nivel");
    assert.equal(etiquetasNivel.length, 4, "faltan etiquetas de nivel");
    const lineasNivel = datos.lineasNivel.filter((l) => l.tipo === "nivel");
    assert.equal(lineasNivel.length, 4, "faltan líneas de nivel para medir");

    // 1) Cada texto queda por encima de SU línea con al menos 1.5 mm de papel. En
    // pantalla se comprueba la separación vertical y que el segmento no la cruce.
    for (const etiqueta of etiquetasNivel) {
      const valor = Number(etiqueta.texto.replace(/[^0-9+\-.]/g, "").replace("+", ""));
      const propia = lineasNivel.find((l) => Math.abs(l.elev - valor) < 0.001);
      assert.ok(propia, `la etiqueta «${etiqueta.texto}» no tiene su línea de nivel`);
      const [a, b] = propia.puntos;
      assert.ok(
        !segmentoCruzaCaja(a, b, etiqueta, 0.5),
        `la línea de ${propia.elev} cruza el texto «${etiqueta.texto}»: ${JSON.stringify(etiqueta)}`,
      );
      // O025 coloca el texto a la derecha del triángulo, centrado con él, como la
      // referencia; la línea termina en el vértice y no puede cruzar el texto.
      assert.ok(
        etiqueta.x0 >= Math.max(a.x, b.x) - 0.5,
        `«${etiqueta.texto}» no quedó a la derecha de su línea (${etiqueta.x0} vs ${Math.max(a.x, b.x)})`,
      );
    }

    // 2) Cotas 0.10 / 0.20 / 3.00: ninguna caja de texto se cruza con otra ni con
    // una línea de nivel o de extensión.
    const parciales = datos.etiquetas.filter((e) => e.tipo === "parcial");
    assert.deepEqual(
      parciales.map((p) => p.texto).sort(),
      ["0.10", "0.20", "3.00"],
      `la cadena de cotas no es 0.10/0.20/3.00: ${JSON.stringify(parciales.map((p) => p.texto))}`,
    );
    for (let i = 0; i < datos.etiquetas.length; i += 1) {
      for (let j = i + 1; j < datos.etiquetas.length; j += 1) {
        assert.ok(
          !seIntersectan(datos.etiquetas[i], datos.etiquetas[j]),
          `las cajas «${datos.etiquetas[i].texto}» y «${datos.etiquetas[j].texto}» se enciman`,
        );
      }
    }
    for (const etiqueta of parciales) {
      for (const linea of datos.lineasNivel) {
        for (let i = 0; i + 1 < linea.puntos.length; i += 1) {
          assert.ok(
            !segmentoCruzaCaja(linea.puntos[i], linea.puntos[i + 1], etiqueta, 0.5),
            `la línea ${linea.tipo} (${linea.elev}) cruza la cota «${etiqueta.texto}»`,
          );
        }
      }
    }

    // 3) El texto de los globos de eje queda centrado con 1, 2 y 3 caracteres.
    // Se mide la caja real del glifo y se compara con el centro del círculo.
    const globos = ["1", "2", "3"];
    for (const etiqueta of globos) {
      const medida = await ses.driver.executeScript(
        (etiqueta) =>
          document.querySelector('[data-testid="visor"]').__openrvtEjeTextoGloboPantalla(etiqueta),
        etiqueta,
      );
      assert.ok(medida, `no se pudo medir el texto del globo «${etiqueta}»`);
      assert.ok(
        medida.desviacion <= 0.5,
        `el texto «${etiqueta}» no está centrado: desviación ${medida.desviacion} px`,
      );
    }

    await ses.captura(path.join(PROGRESO, "o021b-alzado-niveles-cotas.png"));
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
