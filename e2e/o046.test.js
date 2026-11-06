// O046: prototipo Empujar/Tirar en la vista 3D real (Tauri + WebKitGTK).
// Los cuatro sólidos se teclean y se comprueban contra medidas calculadas a mano:
//   muro 4 × 0.15 × 2.6  → 4.0 m de largo y 2.6 m de alto;
//   losa 5 × 4 × 0.12    → 20.0 m² de área;
//   columna 0.3 × 0.3 × 2.6;
//   genérico 2 × 2 × 1   → 2·2·1 = 4.0 m³.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O046");
fs.mkdirSync(PROGRESO, { recursive: true });

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
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
  await esperar(600);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(250);
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

async function elementos(ses) {
  return invocar(ses, "modelo.elementos");
}

async function contarClase(ses, clase) {
  return (await elementos(ses)).filter((e) => e.clase === clase).length;
}

async function esperarClase(ses, clase, cantidad, ms = 15_000) {
  await ses.driver.wait(
    async () => (await contarClase(ses, clase)) === cantidad,
    ms,
    `no hay ${cantidad} ${clase}`,
  );
}

async function proyectar(ses, x, y, z = 0) {
  const punto = await ses.driver.executeScript(
    (x, y, z) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  return punto;
}

async function moverPantalla(ses, punto) {
  await ses.driver.executeScript(
    (punto) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
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
  await esperar(120);
}

async function clicPantalla(ses, punto) {
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
  await esperar(300);
}

async function clicMundo(ses, x, y) {
  await clicPantalla(ses, await proyectar(ses, x, y, 0));
}

async function moverMundo(ses, x, y, z = 0) {
  await moverPantalla(ses, await proyectar(ses, x, y, z));
}

async function tecla(ses, key) {
  const code =
    key === "," ? "Comma" :
    key === "." ? "Period" :
    key === "-" ? "Minus" :
    key === "Enter" ? "Enter" :
    key === "Escape" ? "Escape" :
    /^\d$/.test(key) ? `Digit${key}` : key;
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true }));
    },
    key,
    code,
  );
  await esperar(50);
}

async function teclear(ses, texto) {
  for (const caracter of texto) await tecla(ses, caracter);
}

async function teclearYEnter(ses, texto) {
  await teclear(ses, texto);
  await tecla(ses, "Enter");
}

async function crearModelo(ses) {
  await activar(ses, "cmd-nuevo");
  const descartar = await ses.driver.findElements(
    By.xpath('//button[normalize-space(.)="No guardar"]'),
  );
  if (descartar.length > 0) {
    await descartar[0].click();
    await esperar(500);
  }
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await cambiarPestana(ses, "Modelar");
}

async function ajustarVista(ses) {
  await activar(ses, "visor-ajustar");
  await esperar(500);
}

/**
 * Dibuja un rectángulo tecleado desde (0,0) y una altura tecleada. El ratón solo
 * marca la dirección (cuadrante positivo) y el primer punto; el resto es teclado.
 */
async function empujarTecleado(ses, anchoLargo, altura) {
  await ajustarVista(ses);
  await clicMundo(ses, 0, 0);
  await moverMundo(ses, 1, 1);
  await teclearYEnter(ses, anchoLargo);
  assert.equal(
    await (await ses.porTestid("barra-herramienta")).getAttribute("data-herramienta"),
    "empujar",
  );
  await teclearYEnter(ses, altura);
}

test("O046: empujar/tirar crea muro, losa, columna y genérico en 3D", async () => {
  const ses = await Sesion.abrir({
    prueba: "o046",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    await elegirVista(ses, "3D Perspectiva");
    await ajustarVista(ses);

    // En planta el botón queda deshabilitado con el tooltip «Solo en 3D».
    await elegirVista(ses, "Planta Nivel 0");
    const botonPlanta = await ses.porTestid("cmd-empujar");
    assert.equal(await botonPlanta.isEnabled(), false, "Empujar/Tirar debe estar deshabilitado en planta");
    assert.match(await botonPlanta.getAttribute("title"), /Solo en 3D/);
    await elegirVista(ses, "3D Perspectiva");
    const boton3d = await ses.porTestid("cmd-empujar");
    assert.equal(await boton3d.isEnabled(), true, "Empujar/Tirar debe estar habilitado en 3D");

    await activar(ses, "cmd-empujar");
    assert.equal(
      await (await ses.porTestid("barra-herramienta")).getAttribute("data-herramienta"),
      "empujar",
    );

    // 1) Muro 4 × 0.15 × 2.6.
    await empujarTecleado(ses, "4,0.15", "2.6");
    await esperarClase(ses, "IfcWall", 1);
    const muro = (await elementos(ses)).find((e) => e.clase === "IfcWall");
    const propsMuro = await invocar(ses, "modelo.propiedades", { globalid: muro.globalid });
    assert.equal(propsMuro.psets.OPENRVT_Muro.Longitud, 4);
    assert.equal(propsMuro.psets.OPENRVT_Muro.Altura, 2.6);
    assert.equal(propsMuro.psets.OPENRVT_Muro.Espesor, 0.15);

    // 2) Losa 5 × 4 × 0.12 → 20 m².
    await empujarTecleado(ses, "5,4", "0.12");
    await esperarClase(ses, "IfcSlab", 1);
    const losa = (await elementos(ses)).find((e) => e.clase === "IfcSlab");
    const propsLosa = await invocar(ses, "modelo.propiedades", { globalid: losa.globalid });
    assert.equal(propsLosa.psets.OPENRVT_Losa.Area, 20);
    assert.equal(propsLosa.psets.OPENRVT_Losa.Espesor, 0.12);

    // 3) Columna 0.3 × 0.3 × 2.6.
    await empujarTecleado(ses, "0.3,0.3", "2.6");
    await esperarClase(ses, "IfcColumn", 1);

    // 4) Genérico 2 × 2 × 1 → 4 m³.
    await empujarTecleado(ses, "2,2", "1");
    await esperarClase(ses, "IfcBuildingElementProxy", 1);
    const generico = (await elementos(ses)).find(
      (e) => e.clase === "IfcBuildingElementProxy",
    );
    const propsGenerico = await invocar(ses, "modelo.propiedades", {
      globalid: generico.globalid,
    });
    assert.equal(propsGenerico.psets.OPENRVT_Generico.Volumen, 4);
    assert.equal(propsGenerico.psets.OPENRVT_Generico.AreaBase, 4);

    await ajustarVista(ses);
    await ses.captura(path.join(PROGRESO, "cuatro-elementos.png"));

    // Ctrl+Z quita completo el último sólido (el genérico).
    const antesDeshacer = (await elementos(ses)).length;
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await esperar(800);
    assert.equal((await elementos(ses)).length, antesDeshacer - 1, "Ctrl+Z no quitó el sólido");
    assert.equal(await contarClase(ses, "IfcBuildingElementProxy"), 0);

    // Ctrl+Z recarga el modelo: vuelve a la planta y deja el modo, como el resto
    // de las herramientas. Se vuelve al 3D y se activa antes de probar Esc.
    await elegirVista(ses, "3D Perspectiva");
    await ajustarVista(ses);
    await activar(ses, "cmd-empujar");

    // Esc a media operación: contorno ya cerrado, altura sin confirmar.
    const antesEscape = (await elementos(ses)).length;
    await clicMundo(ses, 0, 0);
    await moverMundo(ses, 1, 1);
    await clicMundo(ses, 1, 1);
    await moverMundo(ses, 0.5, 0.5, 2);
    await tecla(ses, "Escape");
    await esperar(500);
    assert.equal((await elementos(ses)).length, antesEscape, "Esc dejó un sólido a medias");
    assert.equal(
      await (await ses.porTestid("barra-herramienta")).getAttribute("data-herramienta"),
      "empujar",
      "Esc debe cancelar la operación, no salir de la herramienta",
    );

    // Capturas del contorno a medias y de la vista previa de la altura.
    await clicMundo(ses, 0, 0);
    await moverMundo(ses, 1, 1);
    assert.equal(
      await (await ses.porTestid("empujar-preview")).getAttribute("data-paso"),
      "contorno",
    );
    await ses.captura(path.join(PROGRESO, "contorno-a-medias.png"));
    await clicMundo(ses, 1, 1);
    await moverMundo(ses, 0.5, 0.5, 2);
    assert.equal(
      await (await ses.porTestid("empujar-preview")).getAttribute("data-paso"),
      "altura",
    );
    await ses.captura(path.join(PROGRESO, "altura-previa.png"));
    await tecla(ses, "Escape");
    await esperar(300);

    // Con el ratón, sin teclear: un sólido cualquiera.
    const antesRaton = (await elementos(ses)).length;
    await ajustarVista(ses);
    await clicMundo(ses, 0, 0);
    await moverMundo(ses, 0.5, 0.5);
    await clicMundo(ses, 0.5, 0.5);
    const puntoAltura = await proyectar(ses, 0.25, 0.25, 2);
    await moverPantalla(ses, puntoAltura);
    await clicPantalla(ses, puntoAltura);
    await ses.driver.wait(
      async () => (await elementos(ses)).length === antesRaton + 1,
      10_000,
      "el sólido con el ratón no se creó",
    );

    // La altura negativa se rechaza en una clase que no es Genérico, sin dejar nada.
    const antesNegativa = (await elementos(ses)).length;
    await ajustarVista(ses);
    await clicMundo(ses, 0, 0);
    await moverMundo(ses, 1, 1);
    await teclearYEnter(ses, "4,0.15");
    await moverMundo(ses, 0.5, 0.5, 2);
    await teclearYEnter(ses, "-2.6");
    await esperar(600);
    assert.equal(
      (await elementos(ses)).length,
      antesNegativa,
      "una altura negativa creó un muro",
    );
    assert.match(
      (await textoDom(ses, '[data-testid="estado-aviso"]')) ?? "",
      /altura negativa solo se permite en Genérico/i,
    );
    await tecla(ses, "Escape");
    await esperar(300);

    for (const nombre of [
      "cuatro-elementos.png",
      "contorno-a-medias.png",
      "altura-previa.png",
    ]) {
      assert.ok(fs.existsSync(path.join(PROGRESO, nombre)), `no se guardó ${nombre}`);
    }
  } finally {
    await ses.cerrar();
  }
});
