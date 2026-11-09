"use strict";

// O054: el modelo del dueño abre con las cuatro esquinas cerradas. Se abren los
// castillos a 0.20 × 0.20 (núcleo de Block 20), los cerramientos se cortan en su
// cara y el nombre dice la sección real. Capturas 3D de cada esquina y la planta
// con etiquetas en docs/progreso/O054/.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O054");
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
  return { ancho, alto };
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

test("O054: el modelo del dueño cierra las cuatro esquinas y muestra la sección real", async () => {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const ses = await Sesion.abrir({
    prueba: "o054",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    const copia = path.join(os.tmpdir(), "o054-modelo-dueno.ifc");
    fs.copyFileSync(
      path.join(RAIZ, "docs", "notas-usuario", "capturas", "2026-11-07", "modelo-dueno-0.5.28.ifc"),
      copia,
    );
    await instalarDialogos(ses, { abrir: copia });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes("o054-modelo-dueno"),
      20_000,
      "no abrió el modelo del dueño",
    );

    const elementos = (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
    const castillos = elementos.filter((e) => e.estructura?.alias === "castillo");
    const cerramientos = elementos.filter((e) => e.estructura?.alias === "cerramiento");
    assert.equal(castillos.length, 4, `castillos: ${castillos.length}`);
    assert.equal(cerramientos.length, 4, `cerramientos: ${cerramientos.length}`);
    for (const castillo of castillos) {
      assert.equal(castillo.nombre, "Castillo 20×20", "el nombre no dice la sección real");
      const props = await invocar(ses, "modelo.propiedades", { globalid: castillo.globalid });
      assert.equal(Number(props.psets.OPENRVT_Estructura.B), 0.2);
      assert.equal(Number(props.psets.OPENRVT_Estructura.H), 0.2);
      assert.equal(props.psets.OPENRVT_Estructura.Nivel, "Nivel 0", "Propiedades muestra el GlobalId");
    }
    for (const cerramiento of cerramientos) {
      assert.equal(cerramiento.nombre, "Cerramiento 20×20");
      const props = await invocar(ses, "modelo.propiedades", { globalid: cerramiento.globalid });
      assert.equal(Number(props.psets.OPENRVT_Estructura.B), 0.2);
    }

    // Cuatro capturas 3D, una por esquina, y la planta con etiquetas.
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Isométrica");
    const esquinas = [
      [0.0, 0.0, "esquina-00"],
      [2.5, 0.0, "esquina-25-00"],
      [2.5, 1.5, "esquina-25-15"],
      [0.0, 1.5, "esquina-00-15"],
    ];
    for (const [x, y, nombre] of esquinas) {
      await zoomEn(ses, x, y, 1.2, 0.45);
      const ruta = path.join(CAPTURAS, `${nombre}.png`);
      await ses.captura(ruta);
      dimensionesPng(ruta);
      await zoomEn(ses, x, y, 1.2, 1 / 0.45);
    }
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "Planta Nivel 0");
    const planta = path.join(CAPTURAS, "planta-etiquetas.png");
    await ses.captura(planta);
    dimensionesPng(planta);
  } finally {
    await ses.cerrar();
  }
});
