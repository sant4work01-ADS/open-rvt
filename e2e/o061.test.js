// O061: la obra del dueño abre con las losas completas (sin huecos de dados ni
// castillos), los cerramientos toman el ancho del muro y los castillos se
// parten contra firme y azotea. Capturas 3D isométrica y acercamiento de una
// esquina en docs/progreso/O061/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O061");
const DUENO = path.join(RAIZ, "nucleo", "tests", "datos", "o061-fallo-dueno.ifc");
const DIMENSION = { ancho: 1700, alto: 1000 };
const FIRME_AREA = 4.59;

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

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(250);
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

test("O061: losas completas, cerramientos al ancho del muro y capturas", async () => {
  const copia = path.join(os.tmpdir(), `o061-${Date.now()}.ifc`);
  fs.copyFileSync(DUENO, copia);
  const ses = await Sesion.abrir({
    prueba: "o061",
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
    const losas = elementos.filter((e) => e.clase === "IfcSlab");
    const muros = elementos.filter((e) => e.clase === "IfcWall");
    const castillos = elementos.filter((e) => e.estructura?.alias === "castillo");
    const cerramientos = elementos.filter(
      (e) => e.estructura?.alias === "cerramiento",
    );
    assert.equal(losas.length, 2, `losas: ${losas.length}`);
    assert.equal(muros.length, 4, `muros: ${muros.length}`);
    assert.equal(castillos.length, 4, `castillos: ${castillos.length}`);
    assert.equal(cerramientos.length, 4, `cerramientos: ${cerramientos.length}`);

    const usos = {};
    for (const losa of losas) {
      const props = await invocar(ses, "modelo.propiedades", {
        globalid: losa.globalid,
      });
      const datos = props.psets.OPENRVT_Losa;
      usos[datos.Uso] = datos;
      assert.equal(Number(datos.Area), FIRME_AREA, `área de ${datos.Uso}`);
      assert.equal(
        datos.Recorte.includes("HOLE"),
        false,
        `el recorte de ${datos.Uso} no debe tener huecos`,
      );
    }
    assert.equal(Number(usos.firme.Area), FIRME_AREA, "falta el firme");
    assert.equal(Number(usos.azotea.Area), FIRME_AREA, "falta la azotea");

    for (const cerramiento of cerramientos) {
      const props = await invocar(ses, "modelo.propiedades", {
        globalid: cerramiento.globalid,
      });
      const datos = props.psets.OPENRVT_Estructura;
      assert.equal(datos.AnchoDelMuro, true);
      assert.equal(Number(datos.B), 0.2, `ancho de ${cerramiento.nombre}`);
    }

    let esquina = null;
    for (const castillo of castillos) {
      const props = await invocar(ses, "modelo.propiedades", {
        globalid: castillo.globalid,
      });
      if (
        Number(props.psets.OPENRVT_Estructura.X) === 0 &&
        Number(props.psets.OPENRVT_Estructura.Y) === 0
      ) {
        esquina = castillo;
        break;
      }
    }
    assert.ok(esquina, "no está el castillo de la esquina (0, 0)");
    const propsEsquina = await invocar(ses, "modelo.propiedades", {
      globalid: esquina.globalid,
    });
    const datosEsquina = propsEsquina.psets.OPENRVT_Estructura;
    assert.equal(Number(datosEsquina.Base), 0.0);
    assert.equal(Number(datosEsquina.Altura), 3.6);
    assert.equal(Number(datosEsquina.B), 0.15);
    assert.equal(Number(datosEsquina.H), 0.15);

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Isométrica");
    await captura(ses, "01-3d.png");

    await zoomEn(ses, 0, 0, 1.2, 0.45);
    await captura(ses, "02-esquina.png");
    await zoomEn(ses, 0, 0, 1.2, 1 / 0.45);
  } finally {
    await ses.cerrar();
  }
});
