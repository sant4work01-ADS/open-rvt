// O005c: herramientas de dibujo con la app Tauri real. Crea dos ejes perpendiculares,
// comprueba sus burbujas en planta, dibuja tres verticales y dos horizontales para la
// captura de la entrega, y cierra una losa con cuatro clics y doble clic.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG");
  return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
}

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

async function proyectar(ses, x, y) {
  return ses.driver.executeScript(
    (x, y) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone la proyección");
      }
      return visor.__openrvtMundoAPantalla(x, y, 0);
    },
    x,
    y,
  );
}

async function moverRaton(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: punto.x,
          clientY: punto.y,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
    },
    punto,
  );
  await esperar(60);
}

async function clicMundo(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
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
  await esperar(140);
}

async function dobleClic(ses) {
  await ses.driver.executeScript(() => {
    const canvas = document.querySelector('[data-testid="visor"] canvas');
    if (!canvas) throw new Error("no hay canvas");
    canvas.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  await esperar(200);
}

async function tecla(ses, key, extra = {}) {
  await ses.driver.executeScript(
    (key, extra) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
          bubbles: true,
          cancelable: true,
          ...extra,
        }),
      );
      window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, ...extra }));
    },
    key,
    extra,
  );
  await esperar(80);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(150);
}

async function atributoVisor(ses, nombre) {
  return (await ses.porTestid("visor")).getAttribute(nombre);
}

async function ejesDelNucleo(ses) {
  return ses.driver.executeScript(async () => {
    const crudo = await window.__TAURI_INTERNALS__.invoke("nucleo_llamar", {
      metodo: "modelo.referencias",
      params: {},
    });
    const respuesta = crudo && crudo.status === "ok" ? crudo.data : crudo;
    return respuesta.ejes.map((eje) => ({ etiqueta: eje.etiqueta, vertical: eje.vertical }));
  });
}

async function eje(ses, [x1, y1], [x2, y2], cantidad) {
  await clicMundo(ses, x1, y1);
  await moverRaton(ses, x2, y2);
  await clicMundo(ses, x2, y2);
  // El alta del eje es asíncrona: hay que esperar antes del siguiente primer clic.
  await esperarEjes(ses, cantidad);
}

async function esperarEjes(ses, cantidad, ms = 15_000) {
  await ses.driver.wait(
    async () => (await atributoVisor(ses, "data-ejes")) === String(cantidad),
    15_000,
    `el visor no dibujó ${cantidad} ejes`,
  );
}

test("O005c: ejes perpendiculares con burbuja y losa con doble clic", async () => {
  const ses = await Sesion.abrir({
    prueba: "o005c-herramientas",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
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
    await activar(ses, "cmd-eje");

    // Dos ejes perpendiculares: el vertical recibe «1» y el horizontal «A».
    await eje(ses, [0, 0], [0, 6], 1);
    await eje(ses, [0, 3], [6, 3], 2);
    assert.equal(await atributoVisor(ses, "data-ejes-etiquetas"), "1,A");
    assert.deepEqual(await ejesDelNucleo(ses), [
      { etiqueta: "1", vertical: true },
      { etiqueta: "A", vertical: false },
    ]);
    assert.ok(
      Number(await atributoVisor(ses, "data-ejes")) >= 2,
      "los ejes deben quedar dibujados en la planta",
    );

    // Tres verticales y dos horizontales para la captura de la entrega.
    // Longitud tecleada y Enter: eje vertical de 6 m desde (3, 0).
    await clicMundo(ses, 3, 0);
    await moverRaton(ses, 3, 6);
    for (const digito of "6") await tecla(ses, digito);
    await tecla(ses, "Enter");
    await esperarEjes(ses, 3);

    // Doble clic: eje vertical desde (6, 0) hasta el cursor.
    await clicMundo(ses, 6, 0);
    await moverRaton(ses, 6, 6);
    await dobleClic(ses);
    await esperarEjes(ses, 4);

    // Clic normal para la segunda horizontal.
    await eje(ses, [0, 0], [6, 0], 5);
    assert.equal(await atributoVisor(ses, "data-ejes-etiquetas"), "1,2,3,A,B");
    const captura = path.join(CAPTURAS, "o005c_ejes.png");
    await ses.captura(captura);
    assert.deepEqual(dimensionesPng(captura), { ancho: 1600, alto: 900 });

    // Dos clics en el mismo punto no crean un eje de longitud cero.
    await clicMundo(ses, 8, 8);
    await clicMundo(ses, 8, 8);
    assert.equal(await atributoVisor(ses, "data-ejes"), "5");
    assert.match(
      (await textoDom(ses, '[data-testid="estado-aviso"]')) || "",
      /dos puntos distintos/i,
    );

    // La herramienta siguió activa: Esc cancela el trazo y el segundo Esc sale.
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    await esperar(150);
    assert.equal(
      await ses.driver.executeScript(
        () =>
          document
            .querySelector('[data-testid="barra-herramienta"]')
            ?.getAttribute("data-herramienta") ?? null,
      ),
      "eje",
      "el primer Esc no debe salir de la herramienta",
    );
    assert.equal(await atributoVisor(ses, "data-ejes"), "5", "el primer Esc no borra ejes");
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    await esperar(150);
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="barra-herramienta"]') === null,
      ),
      true,
      "el segundo Esc no salió de la herramienta",
    );

    // Losa con cuatro clics y doble clic.
    await activar(ses, "cmd-losa");
    for (const [x, y] of [
      [-1, -1],
      [7, -1],
      [7, 5],
      [-1, 5],
    ]) {
      await clicMundo(ses, x, y);
    }
    await dobleClic(ses);
    await ses.driver.wait(
      async () => (await atributoVisor(ses, "data-mallas")) === "1",
      15_000,
      "la losa no se creó",
    );
    const clases = await ses.driver.executeScript(async () => {
      const crudo = await window.__TAURI_INTERNALS__.invoke("nucleo_llamar", {
        metodo: "modelo.elementos",
        params: {},
      });
      const respuesta = crudo && crudo.status === "ok" ? crudo.data : crudo;
      return respuesta.map((elemento) => elemento.clase);
    });
    assert.deepEqual(clases, ["IfcSlab"]);
  } finally {
    await ses.cerrar();
  }
});

test("O005c: el eje también se dibuja y se crea en la casa de O003b/FZK", async () => {
  const FZK = path.join(RAIZ, "muestras", "AC20-FZK-Haus.ifc");
  const ses = await Sesion.abrir({
    prueba: "o005c-eje-casa",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await ses.driver.executeScript(
      (ruta) => {
        window.__PP_DIALOGO_PRUEBAS__ = async (peticion) =>
          peticion.tipo === "abrir-ifc" ? ruta : null;
      },
      FZK,
    );
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "AC20-FZK-Haus.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no abrió FZK-Haus");
    await ses.q('[data-testid="visor"] canvas');
    await cambiarPestana(ses, "Modelar");

    const datos = await ses.driver.executeScript(async () => {
      const crudo = await window.__TAURI_INTERNALS__.invoke("nucleo_llamar", {
        metodo: "modelo.referencias",
        params: {},
      });
      const r = crudo && crudo.status === "ok" ? crudo.data : crudo;
      const min = [Infinity, Infinity];
      const max = [-Infinity, -Infinity];
      for (const muro of r.muros) {
        min[0] = Math.min(min[0], muro.x1, muro.x2);
        min[1] = Math.min(min[1], muro.y1, muro.y2);
        max[0] = Math.max(max[0], muro.x1, muro.x2);
        max[1] = Math.max(max[1], muro.y1, muro.y2);
      }
      return { min, max, ejes: r.ejes.length };
    });
    await activar(ses, "cmd-eje");
    const cx = (datos.min[0] + datos.max[0]) / 2;
    await eje(ses, [cx, datos.min[1]], [cx, datos.max[1]], datos.ejes + 1);
    assert.equal(await atributoVisor(ses, "data-ejes"), String(datos.ejes + 1));
    const ejes = await ejesDelNucleo(ses);
    assert.equal(ejes.length, datos.ejes + 1);
    assert.ok(
      ejes.some((e) => e.vertical),
      "el eje creado sobre la casa debe ser vertical",
    );
  } finally {
    await ses.cerrar();
  }
});
