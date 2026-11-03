// O034: asas en planta para el desfase de cada borde de losa.
// Dibuja una losa de 4×3 con la herramienta, la selecciona y arrastra el asa del
// borde norte +0.20 (área 12.80 m²), deshace/rehace, cancela otro arrastre con Esc
// y escribe −0.10 en el borde sur (área 12.40 m²). Los valores salen a mano.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O034");

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

async function instalarDialogos(ses) {
  await ses.driver.executeScript(() => {
    window.__PP_DIALOGO_PRUEBAS__ = async () => null;
  });
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

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
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
  await esperar(180);
}

async function dobleClic(ses) {
  await ses.driver.executeScript(() => {
    const canvas = document.querySelector('[data-testid="visor"] canvas');
    canvas.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  await esperar(250);
}

async function asas(ses) {
  return ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]').__openrvtAsasLosa(),
  );
}

async function asaPantalla(ses, indice) {
  return ses.driver.executeScript(
    (indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtAsaLosaAPantalla(indice),
    indice,
  );
}

async function ajustarVista(ses) {
  await activar(ses, "visor-ajustar");
  await esperar(600);
}

async function arrastrarAsa(ses, indice, destinoMundo, { cancelar = false, capturar = null } = {}) {
  const inicio = await asaPantalla(ses, indice);
  assert.ok(inicio, `no hay asa en el borde ${indice}`);
  const destino = await proyectar(ses, destinoMundo[0], destinoMundo[1]);
  // Primero solo pulsar y mover: la vista previa y la cota deben verse ahí.
  await ses.driver.executeScript(
    (inicio, destino) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 9,
        pointerType: "mouse",
        clientX: inicio.x,
        clientY: inicio.y,
      };
      const medio = {
        ...abajo,
        clientX: (inicio.x + destino.x) / 2,
        clientY: (inicio.y + destino.y) / 2,
      };
      const fin = { ...abajo, clientX: destino.x, clientY: destino.y };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(new PointerEvent("pointermove", medio));
      window.dispatchEvent(new PointerEvent("pointermove", fin));
    },
    inicio,
    destino,
  );
  await esperar(400);
  if (capturar) {
    // Cota temporal y contorno de vista previa reales durante el arrastre.
    assert.equal(await textoDom(ses, '[data-testid="cota-arrastre"]'), "+0.20 m");
    const previa = await ses.driver.executeScript(
      () =>
        document.querySelector('[data-testid="preview-losa"]')?.dataset.puntos ?? null,
    );
    assert.equal(previa, "4");
    await ses.captura(capturar);
  }
  // Ahora se suelta (o se cancela con Esc) en un segundo paso, como el usuario.
  await ses.driver.executeScript(
    (fin, cancelar) => {
      if (cancelar) {
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
        );
      }
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          pointerId: 9,
          pointerType: "mouse",
          clientX: fin.x,
          clientY: fin.y,
        }),
      );
    },
    destino,
    cancelar,
  );
  await esperar(900);
}

async function props(ses, gid) {
  return invocar(ses, "modelo.propiedades", { globalid: gid });
}

function areaDe(props) {
  return Number(props.psets.OPENRVT_Losa.Area);
}

function bordesDe(props) {
  return JSON.parse(String(props.psets.OPENRVT_Losa.Bordes));
}

async function esperarArea(ses, gid, esperada, ms = 20_000) {
  await ses.driver.wait(
    async () => {
      try {
        const p = await props(ses, gid);
        return Math.abs(areaDe(p) - esperada) < 1e-6;
      } catch {
        return false;
      }
    },
    ms,
    `el área no llegó a ${esperada} m²`,
  );
}

test("O034: asas de borde de losa en planta", async () => {
  const ses = await Sesion.abrir({
    prueba: "o034",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await instalarDialogos(ses);
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await ses.q('[data-testid="visor"] canvas');
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");

    // 1. Losa de 4×3 con la herramienta (cuatro clics y doble clic).
    await activar(ses, "cmd-losa");
    for (const [x, y] of [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]) {
      await clicMundo(ses, x, y);
    }
    await dobleClic(ses);
    await ses.driver.wait(
      async () =>
        (await (await ses.porTestid("visor")).getAttribute("data-mallas")) === "1",
      20_000,
      "la losa no se creó",
    );
    const losa = (await invocar(ses, "modelo.elementos")).find(
      (elemento) => elemento.clase === "IfcSlab",
    ).globalid;
    assert.ok(losa, "no hay IfcSlab");
    await props(ses, losa); // el panel necesita las propiedades del núcleo

    // Sale de la herramienta y selecciona la losa en planta.
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    await esperar(250);
    await clicMundo(ses, 2, 1.5);
    await ses.porTestid("tabla-bordes-losa");
    await ses.driver.wait(async () => {
      const valor = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]').__openrvtAsasLosa().length,
      );
      return valor === 4;
    }, 10_000, "no aparecieron las cuatro asas");

    const inicial = await props(ses, losa);
    assert.equal(Math.round(areaDe(inicial) * 100) / 100, 12.0);
    await ajustarVista(ses);
    const listaAsas = await asas(ses);
    // El borde norte es el de punto medio con Y máxima (a mano: (2,3)).
    const norte = listaAsas.reduce((mejor, asa) => (asa.medio[1] > mejor.medio[1] ? asa : mejor));
    assert.equal(norte.medio[0], 2);
    assert.equal(norte.medio[1], 3);
    assert.deepEqual(norte.normal, [0, 1]);
    await ses.captura(path.join(CAPTURAS, "o034-planta-asas.png"));

    // 2. Arrastrar el asa norte 0.20 hacia afuera: 4×3.20 = 12.80 m².
    const capturaArrastre = path.join(CAPTURAS, "o034-arrastre.png");
    await arrastrarAsa(ses, norte.indice, [2, 3.2], { capturar: capturaArrastre });
    await esperarArea(ses, losa, 12.8);
    let despues = await props(ses, losa);
    assert.equal(Math.round(areaDe(despues) * 1000) / 1000, 12.8);
    assert.equal(bordesDe(despues)[norte.indice].desfase, 0.2);
    const tablaNorte = await ses.driver.executeScript(
      (indice) =>
        Number(
          document.querySelector(`[data-testid="elemento-borde-${indice}-desfase"]`)?.value,
        ),
      norte.indice,
    );
    assert.equal(tablaNorte, 0.2);
    await ses.captura(path.join(CAPTURAS, "o034-despues.png"));

    // 3. Deshacer → 12.00 m²; rehacer → 12.80 m².
    await activar(ses, "cmd-deshacer");
    await esperarArea(ses, losa, 12.0);
    assert.equal(bordesDe(await props(ses, losa))[norte.indice].desfase, 0);
    await activar(ses, "cmd-rehacer");
    await esperarArea(ses, losa, 12.8);

    // La losa sigue seleccionada tras deshacer/rehacer; si no, se vuelve a tocar.
    const asasTrasRehacer = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]').__openrvtAsasLosa().length,
    );
    if (asasTrasRehacer === 0) await clicMundo(ses, 2, 1.5);

    // 4. Arrastrar el borde este y pulsar Esc: no cambia nada.
    const antesEsc = await props(ses, losa);
    const este = (await asas(ses)).find((asa) => asa.normal[0] === 1);
    assert.ok(este, "no hay asa con normal +X");
    await arrastrarAsa(ses, este.indice, [4.1, 1.5], { cancelar: true });
    const trasEsc = await props(ses, losa);
    assert.equal(Math.round(areaDe(trasEsc) * 1000) / 1000, 12.8);
    assert.deepEqual(bordesDe(trasEsc), bordesDe(antesEsc));

    // 5. Clic sobre el asa sur y escribir −0.10: 4×3.10 = 12.40 m².
    const sur = (await asas(ses)).find((asa) => asa.normal[1] === -1);
    assert.ok(sur, "no hay asa con normal −Y");
    const puntoSur = await asaPantalla(ses, sur.indice);
    await ses.driver.executeScript(
      (punto) => {
        const canvas = document.querySelector('[data-testid="visor"] canvas');
        const opciones = {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          pointerId: 11,
          pointerType: "mouse",
          clientX: punto.x,
          clientY: punto.y,
        };
        canvas.dispatchEvent(new PointerEvent("pointerdown", opciones));
        window.dispatchEvent(new PointerEvent("pointerup", { ...opciones, buttons: 0 }));
      },
      puntoSur,
    );
    const campo = await ses.porTestid("asa-losa-desfase");
    await campo.click();
    await campo.sendKeys(Key.chord(Key.CONTROL, "a"));
    await campo.sendKeys("-0.1");
    await campo.sendKeys(Key.ENTER);
    await esperarArea(ses, losa, 12.4);
    const final = await props(ses, losa);
    assert.equal(Math.round(areaDe(final) * 1000) / 1000, 12.4);
    const bordesFinales = bordesDe(final);
    assert.equal(bordesFinales[sur.indice].desfase, -0.1);
    assert.equal(bordesFinales[norte.indice].desfase, 0.2);
    const tablaSur = await ses.driver.executeScript(
      (indice) =>
        Number(
          document.querySelector(`[data-testid="elemento-borde-${indice}-desfase"]`)?.value,
        ),
      sur.indice,
    );
    assert.equal(tablaSur, -0.1);
    await ses.captura(path.join(CAPTURAS, "o034-editor-desfase.png"));

    assert.ok(fs.existsSync(path.join(CAPTURAS, "o034-planta-asas.png")));
    assert.ok(fs.existsSync(path.join(CAPTURAS, "o034-arrastre.png")));
    assert.ok(fs.existsSync(path.join(CAPTURAS, "o034-despues.png")));
  } finally {
    await ses.cerrar();
  }
});
