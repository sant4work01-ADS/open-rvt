// O018: gesto nativo de Windows (pellizco). El comando de prueba inyecta
// `gesto-nativo` como si viniera de la escucha nativa: 100 → 120 debe acercar
// ×1/1.2 y quedar registrado en el resumen y en el JSON exportado.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

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
  await esperar(250);
}

async function camara(ses) {
  return ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    if (!visor || !visor.dataset.camara) throw new Error("el visor no publica data-camara");
    return JSON.parse(visor.dataset.camara);
  });
}

async function abrirDiagnostico(ses) {
  await ses.driver.executeScript(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "D",
        code: "KeyD",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="diagnostico-rueda"]')),
    5_000,
    "no abrió el panel de diagnóstico",
  );
}

async function gestoNativo(ses, valor) {
  await ses.driver.executeScript(async (v) => {
    await window.__TAURI_INTERNALS__.invoke("simular_gesto_nativo", {
      tipo: "GID_ZOOM",
      valor: v,
    });
  }, valor);
}

test("O018: GID_ZOOM 100→120 acerca ×1/1.2 y aparece en la grabación", async () => {
  const ses = await Sesion.abrir({
    prueba: "o018-gesto-nativo",
    tamano: { ancho: 1500, alto: 900 },
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        const visor = await ses.porTestid("visor");
        return (await visor.getAttribute("data-mallas")) !== null;
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no abrió el visor");
    await cambiarPestana(ses, "Vista");
    await ses.q('[data-testid="visor"] canvas');
    await esperar(500);

    // La corrección del dato deja IsPinchZoomEnabled en true para que WebView2
    // entregue el pellizco como wheel con Ctrl a la página.
    if (process.platform === "win32") {
      const ajustes = await ses.driver.executeScript(async () => {
        const crudo = await window.__TAURI_INTERNALS__.invoke("diagnostico_webview");
        return crudo;
      });
      assert.equal(ajustes.pinch_zoom, true, "IsPinchZoomEnabled debe quedar en true");
    }

    await abrirDiagnostico(ses);
    await activar(ses, "diagnostico-rueda-grabar");

    const antes = (await camara(ses)).derecha - (await camara(ses)).izquierda;
    await gestoNativo(ses, 100);
    await esperar(80);
    await gestoNativo(ses, 120);
    await esperar(250);

    const despues = (await camara(ses)).derecha - (await camara(ses)).izquierda;
    const factorEsperado = 1 / 1.2;
    assert.ok(
      Math.abs(despues / antes - factorEsperado) < 1e-9,
      `GID_ZOOM 100→120 debe dejar escala ×1/1.2: ${despues / antes}`,
    );

    await activar(ses, "diagnostico-rueda-grabar");
    const resumenTexto = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="diagnostico-rueda-resumen"]')?.textContent ?? "",
    );
    assert.match(resumenTexto, /tipo nativo:GID_ZOOM2/);
    const nativosTexto = await ses.driver.executeScript(
      () =>
        document.querySelector('[data-testid="diagnostico-rueda-nativos"]')?.textContent ?? "",
    );
    assert.match(nativosTexto, /nativo: GID_ZOOM 2/);
    assert.match(nativosTexto, /ventana: principal 2/);

    // Flujo completo: exportar y comprobar que el dato nativo quedó guardado.
    const destino = path.join(__dirname, "salida", "diagnostico-o018.json");
    fs.rmSync(destino, { force: true });
    await ses.driver.executeScript(
      (ruta) => {
        window.__PP_DIALOGO_PRUEBAS__ = async () => ruta;
      },
      destino,
    );
    await activar(ses, "diagnostico-rueda-exportar");
    const fin = Date.now() + 10_000;
    while (!fs.existsSync(destino) && Date.now() < fin) await esperar(200);
    assert.ok(fs.existsSync(destino), "no se escribió el JSON del diagnóstico");
    const datos = JSON.parse(fs.readFileSync(destino, "utf8"));
    assert.equal(datos.resumen.nativos.porMensaje.GID_ZOOM, 2);
    assert.equal(datos.resumen.nativos.porVentana.principal, 2);
    const nativos = datos.eventos.filter((evento) => evento.tipo === "nativo:GID_ZOOM");
    assert.equal(nativos.length, 2);
    assert.equal(nativos[1].detalle.ullArguments, 120);
  } finally {
    await ses.cerrar();
  }
});
