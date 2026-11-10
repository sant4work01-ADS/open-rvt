// O062: la obra del dueño abre y las caras exteriores del muro se ven
// continuas en las franjas de cerramiento (2.20–2.40) y losa (3.08–3.20).
// Capturas de cerca en docs/progreso/O062/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O062");
const DUENO = path.join(RAIZ, "nucleo", "tests", "datos", "o061-fallo-dueno.ifc");
const DIMENSION = { ancho: 1700, alto: 1000 };

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
  assert.ok(ancho > 300 && alto > 300, `${ruta} mide ${ancho}×${alto}`);
}

async function captura(ses, nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  dimensionesPng(ruta);
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

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    15_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(900);
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

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) =>
      document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function fijarCheck(ses, testid, valor) {
  const ok = await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) return false;
      if (el.checked !== valor) el.click();
      return true;
    },
    testid,
    valor,
  );
  assert.equal(ok, true, `no se encontró ${testid}`);
  await esperar(120);
}

async function todasCategorias(ses) {
  for (const id of [
    "muros",
    "losas",
    "columnas",
    "vigas",
    "puertas",
    "ventanas",
    "cubiertas",
    "escaleras",
    "otros",
  ]) {
    await fijarCheck(ses, `categoria-${id}`, true);
  }
}

async function conAnotaciones(ses) {
  for (const id of ["ejes3d", "niveles3d", "cotas3d", "notas3d"]) {
    await fijarCheck(ses, `vista-${id}`, true);
  }
}

async function sinAnotaciones(ses) {
  for (const id of ["ejes3d", "niveles3d", "cotas3d", "notas3d"]) {
    await fijarCheck(ses, `vista-${id}`, false);
  }
}

async function zoomEn(ses, x, y, z, factor) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  await ses.driver.executeScript(
    (p, factor) => {
      document.querySelector('[data-testid="visor"]').__openrvtZoomEn(factor, p.x, p.y);
    },
    punto,
    factor,
  );
  await esperar(500);
}

test("O062: caras del muro continuas en las franjas de cerramiento y losa", async () => {
  const copia = path.join(os.tmpdir(), `o062-${Date.now()}.ifc`);
  fs.copyFileSync(DUENO, copia);
  const ses = await Sesion.abrir({
    prueba: "o062",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await instalarDialogos(ses, { abrir: copia });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () =>
        ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes(
          path.basename(copia),
        ),
      30_000,
      "no abrió la obra del dueño",
    );

    const elementos = (await invocar(ses, "geometria.teselar", { globalids: null }))
      .elementos;
    const muros = elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(muros.length, 4, `muros: ${muros.length}`);
    assert.equal(
      elementos.filter((e) => e.clase === "IfcSlab").length,
      2,
      "losas del dueño",
    );
    assert.equal(
      elementos.filter((e) => e.clase === "IfcBeam").length,
      4,
      "cerramientos del dueño",
    );
    assert.equal(
      elementos.filter((e) => e.clase === "IfcColumn").length,
      4,
      "castillos del dueño",
    );

    await activar(ses, "panel-pestana-vistas");
    await elegirVista(ses, "3D Isométrica");
    // Iso con «Ajustar» y todas las categorías, como las ve el dueño: niveles y
    // ejes encendidos, que es donde se ven las cuñas y líneas enrasadas.
    await todasCategorias(ses);
    await conAnotaciones(ses);
    await activar(ses, "visor-zoom-ajustar");
    await esperar(900);
    await captura(ses, "01-3d.png");

    // Todas las categorías (muros, losas y estructura) sin anotaciones: cualquier
    // línea o cuña sobre la cara del muro viene de los elementos enrasados.
    await todasCategorias(ses);
    await sinAnotaciones(ses);
    await captura(ses, "02-3d-todas-sin-anotaciones.png");

    // Acercamiento 3D a la franja de la azotea en la cara sur (y = −0.10).
    await zoomEn(ses, 1.25, -0.10, 2.75, 0.6);
    await captura(ses, "03-cara-sur-3d.png");
    await zoomEn(ses, 1.25, -0.10, 2.75, 0.5);
    await captura(ses, "04-cara-sur-cerca-3d.png");
    await zoomEn(ses, 1.25, -0.10, 2.75, 1 / 0.3);

    // Acercamiento a la esquina y a la cara este (x = 2.60).
    await zoomEn(ses, 2.60, 0.75, 2.75, 0.6);
    await captura(ses, "05-cara-este-3d.png");

    // Muy lejos (zoom fuera desde el encuadre ajustado): la piel tiene que
    // seguir tapando las aristas internas sin líneas tenues ni parpadeo.
    await activar(ses, "visor-zoom-ajustar");
    for (let i = 0; i < 4; i += 1) await activar(ses, "visor-zoom-menos");
    await esperar(900);
    await captura(ses, "06-iso-muy-lejos.png");
  } finally {
    await ses.cerrar();
  }
});
