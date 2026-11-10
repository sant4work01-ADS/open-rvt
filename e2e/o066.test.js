// O066 punto 3: abrir un IFC ajeno, crear un muro, pulsar Guardar y cancelar
// el aviso deja el archivo original idéntico (mismo SHA-256).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const FZK = path.join(RAIZ, "muestras", "AC20-FZK-Haus.ifc");
const DIMENSION = { ancho: 1400, alto: 900 };

const sha256 = (ruta) =>
  crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");

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

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
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

test("O066: guardar sobre un IFC ajeno avisa y Cancelar no toca el original", async () => {
  const copia = path.join(os.tmpdir(), `o066-ajeno-${Date.now()}.ifc`);
  fs.copyFileSync(FZK, copia);
  const hashAntes = sha256(copia);
  const ses = await Sesion.abrir({ prueba: "o066", tamano: DIMENSION });
  try {
    await ses.driver.executeScript(
      (ruta) => {
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) =>
          peticion.tipo === "abrir-ifc" ? ruta : null;
      },
      copia,
    );
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () =>
        ((await textoDom(ses, '[data-testid="estado-modelo"]')) || "").includes(
          path.basename(copia),
        ),
      30_000,
      "no abrió el IFC ajeno",
    );

    const niveles = await invocar(ses, "modelo.niveles");
    assert.ok(niveles.length > 0, "el FZK debe tener niveles");
    await invocar(ses, "muros.crear", {
      tipo: "Block 15",
      nivel: niveles[0].globalid,
      x1: 0,
      y1: 0,
      x2: 4,
      y2: 0,
    });

    await activar(ses, "cmd-guardar");
    const modal = await ses.driver.wait(
      async () => {
        const visible = await ses.driver.executeScript(() => {
          const el = document.querySelector('[data-testid="dialogo-guardar-ajeno"]');
          return el ? el.textContent : null;
        });
        return visible ? visible : false;
      },
      10_000,
      "no apareció el aviso de IFC ajeno",
    );
    assert.match(
      String(modal),
      /Este IFC no lo creó OPEN-RVT\. Guardarlo reescribe el archivo completo\./,
    );
    await activar(ses, "ajeno-cancelar");
    await esperar(500);
    assert.equal(
      await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="dialogo-guardar-ajeno"]'),
      ),
      false,
      "el aviso debe cerrarse con Cancelar",
    );
    assert.equal(sha256(copia), hashAntes, "Cancelar no debe escribir el original");
  } finally {
    await ses.cerrar();
  }
});
