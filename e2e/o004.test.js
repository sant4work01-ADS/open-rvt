// O004: la app empaquetada usa su Python embebido, sin Python del sistema.
// Se ejecuta contra el binario extraído del .deb:
//   OPENRVT_E2E_BINARIO=<extracción>/usr/bin/open-rvt \
//   xvfb-run -a node --test e2e/o004.test.js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");

/** PATH con python3/python que fallan: si la app los usara, el núcleo no respondería. */
function pathSinPython() {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-sin-python-"));
  for (const nombre of ["python", "python3", "python3.12"]) {
    const ruta = path.join(carpeta, nombre);
    fs.writeFileSync(
      ruta,
      `#!/bin/sh\necho "python del sistema prohibido en la prueba O004" >&2\nexit 127\n`,
      { mode: 0o755 },
    );
  }
  return carpeta;
}

async function invocar(ses, metodo, params = {}) {
  const respuesta = await ses.driver.executeAsyncScript(
    function (metodo, params, done) {
      window.__TAURI_INTERNALS__
        .invoke("nucleo_llamar", { metodo, params })
        .then((crudo) => {
          const valor = crudo && crudo.status === "ok" ? crudo.data : crudo;
          done({ ok: true, valor });
        })
        .catch((error) => done({ ok: false, error: String(error) }));
    },
    metodo,
    params,
  );
  assert.equal(respuesta.ok, true, `falló ${metodo}: ${respuesta.error}`);
  return respuesta.valor;
}

test("O004: .deb con Python embebido responde ping, crea muro y guarda", async () => {
  const binario = process.env.OPENRVT_E2E_BINARIO;
  assert.ok(binario, "define OPENRVT_E2E_BINARIO con el binario extraído del .deb");
  assert.ok(fs.existsSync(binario), `no existe el binario ${binario}`);

  const carpetaPython = pathSinPython();
  const salida = path.join(os.tmpdir(), `openrvt-o004-${process.pid}.ifc`);
  fs.rmSync(salida, { force: true });

  const pathOriginal = process.env.PATH;
  const pythonOriginal = process.env.OPENRVT_PYTHON;
  process.env.PATH = `${carpetaPython}${path.delimiter}${pathOriginal}`;
  delete process.env.OPENRVT_PYTHON;
  process.env.OPENRVT_E2E_BINARIO = binario;

  let ses;
  try {
    ses = await Sesion.abrir({
      prueba: "o004-embebido",
      tamano: { ancho: 1600, alto: 900 },
      lateralExpandido: true,
    });

    const ping = await invocar(ses, "nucleo.ping");
    assert.equal(ping.disponible, true, `núcleo no disponible: ${JSON.stringify(ping)}`);
    assert.equal(ping.ifcopenshell, "0.9.0.post1");

    const nuevo = await invocar(ses, "proyecto.nuevo", { nombre: "Casa embebida" });
    assert.equal(nuevo.esquema, "IFC4");

    const niveles = await invocar(ses, "modelo.niveles");
    assert.ok(Array.isArray(niveles) && niveles.length >= 1);
    const nivel = niveles[0].globalid;

    const muro = await invocar(ses, "muros.crear", {
      tipo: "Block 15",
      nivel,
      x1: 0,
      y1: 0,
      x2: 8,
      y2: 0,
      altura: 3,
    });
    assert.equal(muro.creados.length, 1);
    assert.equal(muro.uniones.length, 0);

    const guardado = await invocar(ses, "proyecto.guardar", { ruta: salida });
    assert.equal(guardado.ruta, salida);
    assert.ok(fs.existsSync(salida), "no se creó el IFC");
    const texto = fs.readFileSync(salida, "utf8");
    assert.ok(texto.length > 1000, "el IFC guardado es demasiado pequeño");
    assert.equal((texto.match(/IFCWALL\(/g) || []).length, 1);

    // La captura deja constancia de la app empaquetada funcionando sin Python del sistema.
    await ses.captura(path.join(RAIZ, "docs", "capturas", "o004-linux-embebido.png"));
  } finally {
    if (ses) await ses.cerrar();
    process.env.PATH = pathOriginal;
    if (pythonOriginal === undefined) delete process.env.OPENRVT_PYTHON;
    else process.env.OPENRVT_PYTHON = pythonOriginal;
    fs.rmSync(carpetaPython, { recursive: true, force: true });
    fs.rmSync(salida, { force: true });
  }
});
