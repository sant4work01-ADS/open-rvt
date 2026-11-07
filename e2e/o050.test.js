// O050: losas que cierran por el primer vértice, Enter, Espacio o doble clic;
// cerramientos que suben y bajan de nivel con sus castillos; puerta que invade
// el cerramiento. Todo con clics reales en la interfaz, como la sesión del dueño
// del 6-nov (niveles 0 / 2.20 / 2.40 / 3.00, rectángulo 2.50 × 1.50).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O050");
const DIMENSION = { ancho: 1700, alto: 1000 };
const TIPO_CERRAMIENTO = "CE-1 Cerramiento 15×20";
const CASTILLO = "K-1 Castillo 15×15";

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 100 && alto > 100, `${ruta} mide ${ancho}×${alto}`);
  return { ancho, alto };
}

async function captura(ses, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  dimensionesPng(ruta);
  return ruta;
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

async function pulsar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(200);
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

/** Campo controlado del panel: escribe, confirma con Enter y sale del campo. */
async function fijarCampoPanel(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      el.blur();
    },
    testid,
    valor,
  );
  await esperar(400);
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
    15_000,
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
    (x, y, z) =>
      document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function moverMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: -1,
          buttons: 0,
          pointerId: 1,
          pointerType: "mouse",
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(200);
  return punto;
}

async function clicEn(ses, punto, extra = {}) {
  await ses.driver.executeScript(
    (punto, extra) => {
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
        ...extra,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", opciones));
      window.dispatchEvent(
        new PointerEvent("pointerup", { ...opciones, buttons: 0 }),
      );
    },
    punto,
    extra,
  );
  await esperar(350);
}

async function clicMundo(ses, x, y, z = 0, extra = {}) {
  await clicEn(ses, await proyectar(ses, x, y, z), extra);
}

async function clicMundoCtrl(ses, x, y, z = 0) {
  await clicMundo(ses, x, y, z, { ctrlKey: true });
}

/** Rectángulo de selección de la interfaz entre dos puntos del mundo. */
async function seleccionarVentanaMundo(ses, x1, y1, x2, y2) {
  const inicio = await proyectar(ses, x1, y1, 0);
  const fin = await proyectar(ses, x2, y2, 0);
  assert.ok(inicio && fin, "no se pudieron proyectar las esquinas de la selección");
  await ses.driver.executeScript(
    (inicio, fin) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const comun = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        pointerType: "mouse",
      };
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", { ...comun, clientX: inicio.x, clientY: inicio.y }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...comun, clientX: fin.x, clientY: fin.y }),
      );
    },
    inicio,
    fin,
  );
  await esperar(300);
  await ses.driver.executeScript(
    (fin) => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          pointerId: 7,
          pointerType: "mouse",
          clientX: fin.x,
          clientY: fin.y,
        }),
      );
    },
    fin,
  );
  await esperar(700);
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
  await esperar(300);
}

async function atajo(ses, key, code = key) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key,
          code,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    key,
    code,
  );
  await esperar(700);
}

async function dobleClicMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y})`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new MouseEvent("dblclick", {
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
  await esperar(600);
}

async function descartarCambiosSiPregunta(ses) {
  for (let i = 0; i < 20; i += 1) {
    const dialogos = await ses.driver.findElements(
      By.css('[data-testid="dialogo-guardar-cambios"]'),
    );
    if (dialogos.length > 0) {
      const boton = await ses.driver.findElement(
        By.xpath('//button[normalize-space(.)="No guardar"]'),
      );
      await boton.click();
      await esperar(200);
      return;
    }
    await esperar(100);
  }
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
  await ses.q('[data-testid="visor"] canvas');
}

async function crearNivel(ses, nombre, elevacion) {
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(400);
  await fijarValor(ses, "nivel-nuevo-nombre", nombre);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(800);
  await (
    await ses.driver.wait(until.elementLocated(By.css('[data-modulo="modelo"]')), 10_000)
  ).click();
  await esperar(400);
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(300);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

const losasDe = (elementos) => elementos.filter((e) => e.clase === "IfcSlab");
const murosDe = (elementos) => elementos.filter((e) => e.clase === "IfcWall");
const cerramientosDe = (elementos) =>
  elementos.filter((e) => e.estructura?.alias === "cerramiento");

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

async function alturaMuro(ses, gid) {
  const p = await props(ses, gid);
  return Number(p.psets?.OPENRVT_Muro?.Altura ?? NaN);
}

async function alturaCastillo(ses, gid) {
  const p = await props(ses, gid);
  return Number(p.psets?.OPENRVT_Estructura?.Altura ?? NaN);
}

async function zCerramiento(ses, gid) {
  const p = await props(ses, gid);
  return Number(p.psets?.OPENRVT_Estructura?.Z ?? NaN);
}

async function esperarCantidad(ses, filtro, cuantos, mensaje) {
  return ses.driver.wait(
    async () => {
      const encontrados = filtro(await teselado(ses));
      return encontrados.length === cuantos ? encontrados : false;
    },
    15_000,
    mensaje,
  );
}

async function esperarZ(ses, gids, z, mensaje) {
  await ses.driver.wait(
    async () => {
      for (const gid of gids) {
        if (Math.abs((await zCerramiento(ses, gid)) - z) > 1e-6) return false;
      }
      return true;
    },
    15_000,
    mensaje,
  );
}

async function esperarAltura(ses, gid, esperado, mensaje = "") {
  await ses.driver.wait(
    async () => Math.abs((await alturaCastillo(ses, gid)) - esperado) < 1e-6,
    15_000,
    mensaje || `el castillo ${gid} no llegó a ${esperado} m`,
  );
}

async function seleccionarLosaEn(ses, x, y) {
  await clicMundo(ses, x, y);
  const gid = await ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
  );
  assert.ok(gid, `no quedó seleccionada la losa en (${x}, ${y})`);
  const p = await props(ses, gid);
  assert.equal(p.clase, "IfcSlab", `en (${x}, ${y}) se seleccionó ${p.clase}`);
  return gid;
}

async function filasBordes(ses) {
  return ses.driver.executeScript(() => {
    const tabla = document.querySelector('[data-testid="tabla-bordes-losa"]');
    return tabla ? tabla.querySelectorAll("tbody tr").length : 0;
  });
}

async function cerrarConLosa(ses, puntos, forma) {
  await activar(ses, "cmd-losa");
  for (const [x, y] of puntos) {
    await clicMundo(ses, x, y);
    await esperar(120);
  }
  if (forma === "primer-vertice") {
    await clicMundo(ses, puntos[0][0], puntos[0][1]);
  } else if (forma === "enter") {
    await tecla(ses, "Enter", "Enter");
  } else if (forma === "espacio") {
    await tecla(ses, " ", "Space");
  } else if (forma === "doble-clic") {
    await dobleClicMundo(ses, puntos[puntos.length - 1][0], puntos[puntos.length - 1][1]);
  }
  await esperar(700);
  // Cerrar la losa no sale de la herramienta; se sale para el siguiente caso.
  await tecla(ses, "Escape", "Escape");
  await esperar(200);
}

// ---------------------------------------------------------------------------
// 1) Losa del dueño: cierre por primer vértice, Enter, Espacio y doble clic.
// ---------------------------------------------------------------------------
test("O050: la losa cierra con primer vértice, Enter, Espacio y doble clic", async () => {
  const ses = await Sesion.abrir({
    prueba: "o050-losa",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);

    const rectangulos = [
      { x: 0, forma: "primer-vertice", nombre: "primer-vertice" },
      { x: 4, forma: "enter", nombre: "enter" },
      { x: 8, forma: "espacio", nombre: "espacio" },
      { x: 12, forma: "doble-clic", nombre: "doble-clic" },
    ];
    const creadas = [];
    for (const caso of rectangulos) {
      const antes = losasDe(await teselado(ses)).length;
      const puntos = [
        [caso.x, 0],
        [caso.x + 2.5, 0],
        [caso.x + 2.5, 1.5],
        [caso.x, 1.5],
      ];
      await cerrarConLosa(ses, puntos, caso.forma);
      const nuevas = await ses.driver.wait(
        async () => {
          const actuales = losasDe(await teselado(ses));
          return actuales.length === antes + 1 ? actuales : false;
        },
        15_000,
        `la losa que cierra con ${caso.nombre} no se creó`,
      );
      const gid = nuevas[nuevas.length - 1].globalid;
      const p = await props(ses, gid);
      assert.equal(
        Number(p.psets?.OPENRVT_Losa?.Puntos),
        4,
        `la losa de ${caso.nombre} no quedó de 4 vértices`,
      );
      // 2.50 × 1.50 = 3.75 m².
      assert.equal(
        Number(p.psets?.OPENRVT_Losa?.Area),
        3.75,
        `la losa de ${caso.nombre} no mide 3.75 m²`,
      );
      creadas.push(gid);
    }

    // Esc con cuatro vértices: quedan tres, no se borra todo de golpe.
    await activar(ses, "cmd-losa");
    for (const [x, y] of [
      [16, 0],
      [18.5, 0],
      [18.5, 1.5],
      [16, 1.5],
    ]) {
      await clicMundo(ses, x, y);
    }
    await tecla(ses, "Escape", "Escape");
    const aviso = await textoDom(ses, '[data-testid="estado-aviso"]');
    assert.match(
      aviso ?? "",
      /^Losa: 3 vértices\./,
      `Esc con cuatro vértices debía dejar tres: ${aviso}`,
    );
    const cuantas = losasDe(await teselado(ses)).length;
    assert.equal(cuantas, 4, `Esc no debía crear ni borrar losas: ${cuantas}`);
    for (let i = 0; i < 3; i += 1) await tecla(ses, "Escape", "Escape");

    // Bordes de la primera losa con desfase exterior 0.075: 2.65 × 1.65 = 4.3725.
    const primera = await seleccionarLosaEn(ses, 1.25, 0.75);
    assert.equal(primera, creadas[0], "no se seleccionó la losa del primer vértice");
    assert.equal(await filasBordes(ses), 4, "la losa no tiene cuatro bordes");
    await captura(ses, "01-losa-planta.png");
    await fijarCampoPanel(ses, "elemento-desfase-bordes", "0.075");
    await ses.driver.wait(
      async () => {
        const p = await props(ses, creadas[0]);
        return Math.abs(Number(p.psets?.OPENRVT_Losa?.Area) - 4.3725) < 1e-9;
      },
      15_000,
      "la losa con desfase 0.075 no llegó a 4.3725 m²",
    );
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await captura(ses, "02-losa-alzado.png");
    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await captura(ses, "03-losa-3d.png");
  } finally {
    await ses.cerrar();
  }
});

// ---------------------------------------------------------------------------
// 2) Losa vieja: IFC con cinco puntos; abre con cuatro y acepta cambio_borde.
// ---------------------------------------------------------------------------
test("O050: una losa vieja de cinco puntos abre con cuatro y edita su borde", async () => {
  const ses = await Sesion.abrir({
    prueba: "o050-losa-vieja",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    const ruta = path.join(RAIZ, "e2e", "datos", "losa-cinco-puntos.ifc");
    const copia = path.join(os.tmpdir(), "losa-cinco-puntos-o050.ifc");
    fs.copyFileSync(ruta, copia);
    await ses.driver.executeScript(
      (rutas) => {
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) =>
          peticion.tipo === "abrir-ifc" ? rutas.abrir : null;
      },
      { abrir: copia },
    );
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () =>
        ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes(
          "losa-cinco-puntos-o050",
        ),
      20_000,
      "no abrió la losa vieja",
    );
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(800);

    const gid = await seleccionarLosaEn(ses, 1.25, 0.75);
    assert.equal(await filasBordes(ses), 4, "la losa vieja no se reparó a cuatro bordes");
    const antes = await props(ses, gid);
    assert.equal(Number(antes.psets?.OPENRVT_Losa?.Puntos), 4, "Puntos sigue en cinco");
    // 2.50 × 1.50 = 3.75 m².
    assert.equal(Number(antes.psets?.OPENRVT_Losa?.Area), 3.75, "área antes de editar");
    await captura(ses, "04-losa-vieja-planta.png");

    await fijarCampoPanel(ses, "elemento-borde-0-desfase", "0.075");
    await ses.driver.wait(
      async () => {
        const p = await props(ses, gid);
        // Sólo el lado de 2.50 se separa 0.075: 3.75 + 2.50 × 0.075 = 3.9375.
        return Math.abs(Number(p.psets?.OPENRVT_Losa?.Area) - 3.9375) < 1e-9;
      },
      15_000,
      "cambio_borde no movió el área a 3.9375 m²",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="estado-error"]')?.textContent?.trim() ?? "",
      ),
      "",
      "cambio_borde no debía dejar un error",
    );
    await captura(ses, "05-losa-vieja-borde.png");
  } finally {
    await ses.cerrar();
  }
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
function muroEn(referencias, x1, y1, x2, y2) {
  const muro = referencias.muros.find(
    (m) =>
      Math.abs(m.x1 - x1) < 1e-6 &&
      Math.abs(m.y1 - y1) < 1e-6 &&
      Math.abs(m.x2 - x2) < 1e-6 &&
      Math.abs(m.y2 - y2) < 1e-6,
  );
  assert.ok(muro, `no está el muro (${x1}, ${y1})→(${x2}, ${y2})`);
  return muro;
}

async function atributoVisor(ses, nombre) {
  return ses.driver.executeScript(
    (nombre) => document.querySelector('[data-testid="visor"]')?.getAttribute(nombre),
    nombre,
  );
}

async function visiblesVisor(ses) {
  return new Set(((await atributoVisor(ses, "data-mallas-visibles")) ?? "").split(","));
}

test("O050: cerramientos del dueño suben y bajan de nivel con sus castillos", async () => {
  const ses = await Sesion.abrir({
    prueba: "o050-cerramientos",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await nuevoModelo(ses);
    await crearNivel(ses, "Nivel 1", 2.2);
    await crearNivel(ses, "Nivel 2", 2.4);
    await crearNivel(ses, "Nivel 3", 3.0);
    await cambiarPestana(ses, "Modelar");

    // Retícula del dueño.
    await invocar(ses, "ejes.crear", { etiqueta: "A", x1: -0.5, y1: -1, x2: -0.5, y2: 3 });
    await invocar(ses, "ejes.crear", { etiqueta: "1", x1: -1, y1: -0.5, x2: 3, y2: -0.5 });

    // Cuatro muros Block 15 de 2.60 en un rectángulo de 2.50 × 1.50.
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    const lados = [
      [0, 0, 2.5, 0],
      [2.5, 0, 2.5, 1.5],
      [2.5, 1.5, 0, 1.5],
      [0, 1.5, 0, 0],
    ];
    // La altura se fija con la herramienta de muro activa; el primer muro se
    // dibuja en el mismo trazo y los demás, activándola de nuevo.
    await activar(ses, "cmd-muro");
    await fijarValor(ses, "muro-altura", "2.6");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 2.5, 0);
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    for (const [x1, y1, x2, y2] of lados.slice(1)) {
      await dibujarMuro(ses, x1, y1, x2, y2);
    }
    await activar(ses, "visor-ajustar");
    await esperar(600);
    let elementos = await teselado(ses);
    const muros = murosDe(elementos);
    assert.equal(muros.length, 4, `muros: ${muros.length}`);
    const referencias = await invocar(ses, "modelo.referencias");
    const niveles = await invocar(ses, "modelo.niveles");
    const n0 = niveles.find((n) => n.nombre === "Nivel 0");
    const n1 = niveles.find((n) => n.nombre === "Nivel 1");
    const n2 = niveles.find((n) => n.nombre === "Nivel 2");
    const n3 = niveles.find((n) => n.nombre === "Nivel 3");
    assert.ok(n0 && n1 && n2 && n3, "faltan los niveles del dueño");

    // El muro se crea restringido al nivel siguiente (2.20); el dueño lo quiere
    // de 2.60, así que su tope se fija en Nivel 0 + 2.60 desde Propiedades.
    for (const [x1, y1, x2, y2] of lados) {
      await clicMundo(ses, (x1 + x2) / 2, (y1 + y2) / 2);
      const gidMuro = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
      );
      assert.ok(gidMuro, `no se seleccionó el muro (${x1}, ${y1})→(${x2}, ${y2})`);
      await ses.driver.wait(
        async () =>
          !!(await ses.driver.executeScript(
            () => document.querySelector('[data-testid="restriccion-tope"]'),
          )),
        10_000,
        "Propiedades no mostró la restricción de tope del muro",
      );
      await ses.driver.wait(
        async () =>
          !!(await ses.driver.executeScript(
            () => document.querySelector('[data-testid="desfase-tope"]'),
          )),
        10_000,
        "no apareció el desfase de tope",
      );
      // Primero el desfase y luego el tope: el tope solo no puede dejar altura cero.
      await fijarCampoPanel(ses, "desfase-tope", "2.6");
      await ses.driver.wait(
        async () => Math.abs(Number((await props(ses, gidMuro)).restricciones?.DesfaseTope) - 2.6) < 1e-6,
        10_000,
        "el desfase de tope no se guardó",
      );
      await fijarValor(ses, "restriccion-tope", n0.globalid);
      await ses.driver.wait(
        async () => (await props(ses, gidMuro)).restricciones?.NivelTope === n0.globalid,
        10_000,
        "el tope no se guardó en Nivel 0",
      );
      await ses.driver.wait(
        async () => Math.abs((await alturaMuro(ses, gidMuro)) - 2.6) < 1e-6,
        10_000,
        `el muro (${x1}, ${y1})→(${x2}, ${y2}) no quedó en 2.60`,
      );
    }
    await tecla(ses, "Escape", "Escape");
    for (const muro of muros) {
      assert.equal(await alturaMuro(ses, muro.globalid), 2.6, "el muro no mide 2.60");
    }

    // Losa del rectángulo cerrada con clic en el primer vértice.
    await cerrarConLosa(
      ses,
      [
        [0, 0],
        [2.5, 0],
        [2.5, 1.5],
        [0, 1.5],
      ],
      "primer-vertice",
    );
    const losas = losasDe(await teselado(ses));
    assert.equal(losas.length, 1, `losas: ${losas.length}`);
    assert.equal(
      Number((await props(ses, losas[0].globalid)).psets?.OPENRVT_Losa?.Area),
      3.75,
      "la losa del dueño no mide 3.75 m²",
    );
    await captura(ses, "06-rectangulo-losa-planta.png");

    // Cerramientos: cadena de cinco clics en la planta del Nivel 1.
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await activar(ses, "cmd-cerramiento");
    const nivelBarra = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="cerramiento-nivel"]')?.value,
    );
    assert.equal(nivelBarra, n1.globalid, "la barra no preselecciona el Nivel 1");

    const cadena = [
      [0, 0],
      [2.5, 0],
      [2.5, 1.5],
      [0, 1.5],
      [0, 0],
    ];
    for (const [x, y] of cadena) {
      await clicMundo(ses, x, y);
      await esperar(500);
    }
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");
    const cers = await esperarCantidad(ses, cerramientosDe, 4, "la cadena no creó 4 cerramientos");
    const midpoints = lados.map(([x1, y1, x2, y2]) => [(x1 + x2) / 2, (y1 + y2) / 2]);
    const murosLigados = new Set();
    for (const [i, c] of cers.entries()) {
      const p = await props(ses, c.globalid);
      assert.ok(p.muro_liga?.muro, `el cerramiento ${i} no quedó ligado a un muro`);
      murosLigados.add(p.muro_liga.muro);
      assert.equal(p.restricciones?.NivelBase, n1.globalid, `el cerramiento ${i} no está en Nivel 1`);
      assert.equal(Number(p.restricciones?.DesfaseBase), 0, `el cerramiento ${i} no tiene desfase 0`);
      // Nivel 1 (2.20) − peralte 0.20 → de 2.00 a 2.20.
      const z = await zCerramiento(ses, c.globalid);
      const peralte = Number(c.estructura?.seccion?.H ?? c.estructura?.seccion?.Peralte);
      assert.equal(z, 2.1, `cerramiento ${i}: Z`);
      assert.equal(peralte, 0.2, `cerramiento ${i}: peralte`);
      // Centro 2.10 ± 0.10 → cara inferior 2.00 y superior 2.20.
      assert.ok(Math.abs(z - peralte / 2 - 2.0) < 1e-9, `cerramiento ${i}: cara inferior`);
      assert.ok(Math.abs(z + peralte / 2 - 2.2) < 1e-9, `cerramiento ${i}: cara superior`);
    }
    assert.deepEqual(
      murosLigados,
      new Set(muros.map((m) => m.globalid)),
      "los cuatro cerramientos no cubren los cuatro muros",
    );
    for (const muro of muros) {
      assert.equal(await alturaMuro(ses, muro.globalid), 2.6, "un cerramiento cambió la altura del muro");
    }
    await captura(ses, "07-cerramientos-planta.png");
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "08-cerramientos-alzado.png");
    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "09-cerramientos-3d.png");
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(700);

    // Repetir la cadena: aviso y sin duplicados.
    const gidsAntes = new Set(cers.map((c) => c.globalid));
    await activar(ses, "cmd-cerramiento");
    await clicMundo(ses, 0, 0);
    await clicMundo(ses, 2.5, 0);
    await esperar(900);
    const aviso = await textoDom(ses, '[data-testid="estado-aviso"]');
    assert.match(
      aviso ?? "",
      /ya tiene cerramiento/i,
      `repetir la cadena debía avisar: ${aviso}`,
    );
    assert.equal(cerramientosDe(await teselado(ses)).length, 4, "la cadena repetida duplicó cerramientos");
    assert.deepEqual(
      new Set(cerramientosDe(await teselado(ses)).map((c) => c.globalid)),
      gidsAntes,
      "la cadena repetida cambió los cerramientos",
    );
    await tecla(ses, "Escape", "Escape");
    await tecla(ses, "Escape", "Escape");

    // Castillo de cada muro: nace en la cara inferior del cerramiento (2.00).
    const castillos = [];
    for (const [x1, y1, x2, y2] of lados) {
      const muro = muroEn(referencias, x1, y1, x2, y2);
      const creado = await invocar(ses, "castillos.crear_en_muro", {
        tipo: CASTILLO,
        muro: muro.globalid,
        distancia: 0.075,
      });
      castillos.push(creado.creados[0]);
    }
    for (const gid of castillos) {
      await esperarAltura(ses, gid, 2.0, `el castillo ${gid} no nace a 2.00`);
    }

    // Puerta de 2.10 en cada muro: se crea con el aviso de invasión.
    await activar(ses, "cmd-puerta");
    for (const [x, y] of midpoints) {
      await clicMundo(ses, x, y);
      await esperar(600);
    }
    const avisoPuerta = await textoDom(ses, '[data-testid="estado-aviso"]');
    assert.match(
      avisoPuerta ?? "",
      /La abertura invade el cerramiento \(cara inferior a 2\.00 m\)/,
      `la puerta 2.10 no avisó de la invasión: ${avisoPuerta}`,
    );
    await tecla(ses, "Escape", "Escape");
    elementos = await teselado(ses);
    const puertas = elementos.filter((e) => e.clase === "IfcDoor");
    assert.equal(puertas.length, 4, `puertas creadas: ${puertas.length}`);
    for (const muro of muros) {
      assert.equal(await alturaMuro(ses, muro.globalid), 2.6, "la puerta cambió la altura del muro");
    }

    // Selección múltiple: ocultar muros para que los clics tomen los cerramientos.
    await tecla(ses, "Escape", "Escape");
    await pulsar(ses, "categoria-muros");
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="categoria-muros"]')?.checked,
        )) === false,
      10_000,
      "no se ocultaron los muros",
    );
    await pulsar(ses, "categoria-losas");
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="categoria-losas"]')?.checked,
        )) === false,
      10_000,
      "no se ocultaron las losas",
    );
    await esperar(500);
    await seleccionarVentanaMundo(ses, -0.4, -0.4, 2.9, 1.9);
    await ses.driver.wait(
      async () =>
        !!(await ses.driver.executeScript(
          () => document.querySelector('[data-testid="cerramientos-varios"]')?.textContent,
        )),
      15_000,
      "Propiedades no mostró la edición de varios cerramientos",
    );
    const textoVarios = await textoDom(ses, '[data-testid="cerramientos-varios"]');
    assert.match(textoVarios ?? "", /4 cerramientos/, `texto de varios: ${textoVarios}`);

    const cambios = [
      { nivel: n2, z: 2.3, castillo: 2.2, captura: "10-nivel-2-alzado.png", vista: "Planta Nivel 2" },
      { nivel: n3, z: 2.9, castillo: 2.6, captura: "11-nivel-3-alzado.png", vista: "Planta Nivel 3" },
      { nivel: n1, z: 2.1, castillo: 2.0, captura: "12-nivel-1-alzado.png", vista: "Planta Nivel 1" },
    ];
    for (const cambio of cambios) {
      await fijarValor(ses, "restriccion-base", cambio.nivel.globalid);
      await esperarZ(
        ses,
        cers.map((c) => c.globalid),
        cambio.z,
        `los cerramientos no llegaron a Z ${cambio.z}`,
      );
      for (const c of cers) {
        const p = await props(ses, c.globalid);
        assert.equal(p.restricciones?.NivelBase, cambio.nivel.globalid, "NivelBase no cambió");
      }
      for (const gid of castillos) {
        await esperarAltura(ses, gid, cambio.castillo, `el castillo no siguió a ${cambio.castillo}`);
      }
      for (const muro of muros) {
        assert.equal(await alturaMuro(ses, muro.globalid), 2.6, "subir el cerramiento tocó el muro");
      }
      await elegirVista(ses, cambio.vista);
      await activar(ses, "visor-ajustar");
      await esperar(600);
      const visibles = await visiblesVisor(ses);
      for (const c of cers) {
        assert.ok(
          visibles.has(c.globalid),
          `el cerramiento ${c.globalid} no aparece en ${cambio.vista}`,
        );
      }
      await elegirVista(ses, "Alzado Norte");
      await activar(ses, "visor-ajustar");
      await esperar(600);
      await captura(ses, cambio.captura);
    }

    // Un solo deshacer revierte los cuatro de Nivel 1 a Nivel 3.
    await atajo(ses, "z", "KeyZ");
    await esperarZ(ses, cers.map((c) => c.globalid), 2.9, "un deshacer no revirtió los cuatro");
    for (const gid of castillos) {
      await esperarAltura(ses, gid, 2.6, "el deshacer no revirtió los castillos");
    }
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await captura(ses, "13-deshacer-alzado.png");
    await atajo(ses, "y", "KeyY");
    await esperarZ(ses, cers.map((c) => c.globalid), 2.1, "rehacer no devolvió el Nivel 1");
    for (const gid of castillos) {
      await esperarAltura(ses, gid, 2.0, "rehacer no devolvió el castillo a 2.00");
    }

    // Mostrar otra vez los muros y dejar las capturas finales con todo visible.
    await tecla(ses, "Escape", "Escape");
    await esperar(500);
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    // «Todos» se aplica a la vista activa: hay que volver a la planta antes.
    await pulsar(ses, "categorias-todos");
    await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="categoria-muros"]')?.checked,
        )) === true,
      10_000,
      "no se volvieron a mostrar los muros",
    );
    await esperar(700);
    await captura(ses, "14-final-planta.png");
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "15-final-alzado.png");
    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await captura(ses, "16-final-3d.png");

    // Guardar y reabrir conserva todo.
    const guardado = path.join(os.tmpdir(), `o050-cerramientos-${Date.now()}.ifc`);
    await ses.driver.executeScript(
      (rutas) => {
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) => {
          if (peticion.tipo === "abrir-ifc") return rutas.abrir;
          if (peticion.tipo === "guardar-ifc") return rutas.guardar;
          return null;
        };
      },
      { abrir: guardado, guardar: guardado },
    );
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(1500);
    assert.ok(fs.existsSync(guardado), "el archivo guardado no existe");
    await nuevoModelo(ses);
    await activar(ses, "cmd-abrir");
    await descartarCambiosSiPregunta(ses);
    await ses.driver.wait(
      async () =>
        ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes(
          path.basename(guardado, ".ifc"),
        ),
      20_000,
      "no reabrió el archivo guardado",
    );
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 1");
    await activar(ses, "visor-ajustar");
    await esperar(800);

    const reabiertos = cerramientosDe(await teselado(ses));
    assert.equal(reabiertos.length, 4, `cerramientos al reabrir: ${reabiertos.length}`);
    for (const c of reabiertos) {
      const p = await props(ses, c.globalid);
      assert.equal(p.restricciones?.NivelBase, n1.globalid, "NivelBase no se conservó");
      assert.equal(await zCerramiento(ses, c.globalid), 2.1, "Z no se conservó");
      assert.ok(p.muro_liga?.muro, "el cerramiento perdió su muro");
    }
    for (const gid of castillos) {
      await esperarAltura(ses, gid, 2.0, "la altura del castillo no se conservó");
    }
    for (const muro of muros) {
      assert.equal(await alturaMuro(ses, muro.globalid), 2.6, "la altura del muro no se conservó");
    }
    const losasReabiertas = losasDe(await teselado(ses));
    assert.equal(losasReabiertas.length, 1, `losas al reabrir: ${losasReabiertas.length}`);
    assert.equal(
      Number((await props(ses, losasReabiertas[0].globalid)).psets?.OPENRVT_Losa?.Area),
      3.75,
      "el área de la losa no se conservó",
    );
    const puertasReabiertas = (await teselado(ses)).filter((e) => e.clase === "IfcDoor");
    assert.equal(puertasReabiertas.length, 4, `puertas al reabrir: ${puertasReabiertas.length}`);
    await captura(ses, "17-reabierto-planta.png");
  } finally {
    await ses.cerrar();
  }
});
