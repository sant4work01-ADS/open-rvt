// Pruebas E2E de O003a con la app Tauri real (tauri-driver + WebKitGTK bajo xvfb).
// Abren la muestra FZK-Haus con el núcleo Python del venv, recorren las vistas, crean un
// corte, comprueban el guardado/reapertura y toman las capturas de la entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const FZK = path.join(RAIZ, "muestras", "AC20-FZK-Haus.ifc");
const INSTITUTE = path.join(RAIZ, "muestras", "AC20-Institute-Var-2.ifc");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG");
  return { ancho: cabecera.readUInt32BE(16), alto: cabecera.readUInt32BE(20) };
}

async function instalarDialogos(ses, rutas) {
  await ses.driver.executeScript(
    (rutas) => {
      window.__PP_DIALOGO_PRUEBAS__ = async (peticion) => {
        if (peticion.tipo === "abrir-ifc") return rutas.abrir || null;
        if (peticion.tipo === "guardar-ifc") return rutas.guardar || null;
        return null;
      };
    },
    rutas,
  );
}

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function esperarModelo(ses, ms = 30_000) {
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, ms, "el modelo no cargó en la barra de estado");
  await ses.q('[data-testid="visor"] canvas', ms);
  await ses.driver.wait(async () => {
    const visor = await ses.porTestid("visor");
    return Number(await visor.getAttribute("data-mallas")) > 0;
  }, ms, "el visor no recibió mallas");
}

async function abrirIfc(ses, ruta) {
  await instalarDialogos(ses, { abrir: ruta });
  await (await ses.porTestid("cmd-abrir")).click();
  await esperarModelo(ses);
  // Deja un ciclo de dibujo para que WebGL pinte el primer fotograma.
  await esperar(600);
}

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    require("selenium-webdriver").until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(450);
}

async function abrirRangoAvanzado(ses) {
  // O010: «Rango de vista (avanzado)» está plegado por omisión; la altura del
  // plano de corte solo se ve al desplegarlo.
  const detalles = await ses.porTestid("vista-rango-avanzado");
  if ((await detalles.getAttribute("open")) === null) {
    await (await detalles.findElement(By.css("summary"))).click();
    await esperar(150);
  }
}

async function vistasPorTipo(ses) {
  const datos = await ses.driver.executeScript(() =>
    Array.from(document.querySelectorAll('[data-testid="vista-item"]')).map((elemento) => ({
      tipo: elemento.getAttribute("data-tipo"),
      nombre: elemento.textContent.trim(),
    })),
  );
  const cuenta = { planta: 0, alzado: 0, corte: 0, iso: 0, perspectiva: 0 };
  for (const { tipo } of datos) cuenta[tipo] = (cuenta[tipo] || 0) + 1;
  return { cuenta, nombres: datos.map((d) => d.nombre) };
}

async function dosClicsEnPlanta(ses, puntos) {
  await ses.driver.executeScript(
    (puntos) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
      const r = canvas.getBoundingClientRect();
      for (const [fx, fy] of puntos) {
        const opciones = {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          pointerId: 1,
          pointerType: "mouse",
          clientX: r.left + r.width * fx,
          clientY: r.top + r.height * fy,
        };
        canvas.dispatchEvent(new PointerEvent("pointerdown", opciones));
        window.dispatchEvent(new PointerEvent("pointerup", opciones));
      }
    },
    puntos,
  );
}

async function fijarValor(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    testid,
    valor,
  );
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    require("selenium-webdriver").until.elementLocated(
      By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
  );
  await pestana.click();
  await esperar(150);
}

test("O003a: FZK-Haus abre con 2 plantas, 4 alzados, iso y perspectiva", async () => {
  const ses = await Sesion.abrir({
    prueba: "o003a-vistas",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    const inicio = Date.now();
    await abrirIfc(ses, FZK);
    const transcurrido = Date.now() - inicio;

    const { cuenta, nombres } = await vistasPorTipo(ses);
    assert.deepEqual(cuenta, { planta: 2, alzado: 4, corte: 0, iso: 1, perspectiva: 1 });
    assert.deepEqual(nombres, [
      "Planta Erdgeschoss",
      "Planta Dachgeschoss",
      "Alzado Norte",
      "Alzado Sur",
      "Alzado Este",
      "Alzado Oeste",
      "3D Isométrica",
      "3D Perspectiva",
    ]);
    assert.equal(await textoDom(ses, '[data-testid="estado-esquema"]'), "IFC4");
    assert.match(await textoDom(ses, '[data-testid="estado-elementos"]'), /^38 elementos$/);
    assert.match(await textoDom(ses, '[data-testid="estado-modelo"]'), /^AC20-FZK-Haus\.ifc/);

    const capturas = [
      ["o003a_planta.png", "Planta Erdgeschoss"],
      ["o003a_alzado_sur.png", "Alzado Sur"],
      ["o003a_iso.png", "3D Isométrica"],
      ["o003a_perspectiva.png", "3D Perspectiva"],
    ];
    for (const [archivo, vista] of capturas) {
      await elegirVista(ses, vista);
      const ruta = path.join(CAPTURAS, archivo);
      await ses.captura(ruta);
      assert.deepEqual(dimensionesPng(ruta), { ancho: 1600, alto: 900 });
    }
    console.log(`FZK-Haus abierto y dibujado en ${transcurrido} ms`);
    assert.ok(transcurrido < 5000, `FZK-Haus tardó ${transcurrido} ms (máx. 5000)`);
  } finally {
    await ses.cerrar();
  }
});

test("O003a: un corte con dos clics aparece en el navegador y se captura", async () => {
  const ses = await Sesion.abrir({
    prueba: "o003a-corte",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await abrirIfc(ses, FZK);
    await elegirVista(ses, "Planta Erdgeschoss");
    await cambiarPestana(ses, "Vista");
    await (await ses.porTestid("cmd-nuevo-corte")).click();
    assert.match(await textoDom(ses, '[data-testid="estado-aviso"]'), /dos clics/i);
    await dosClicsEnPlanta(ses, [
      [0.32, 0.5],
      [0.68, 0.5],
    ]);
    await ses.driver.wait(async () => {
      const { cuenta } = await vistasPorTipo(ses);
      return cuenta.corte === 1;
    }, 10_000, "el corte no apareció en el navegador");
    const { nombres } = await vistasPorTipo(ses);
    assert.ok(nombres.includes("Corte 1"));
    assert.equal(await ses.driver.executeScript(() => document.querySelector('[data-testid="visor"]').dataset.tipo), "corte");
    await esperar(500);
    const ruta = path.join(CAPTURAS, "o003a_corte.png");
    await ses.captura(ruta);
    assert.deepEqual(dimensionesPng(ruta), { ancho: 1600, alto: 900 });
  } finally {
    await ses.cerrar();
  }
});

test("O003a: altura de corte, corte y vistas sobreviven a guardar y reabrir", async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o003a-"));
  const destino = path.join(carpeta, "o003a-guardado.ifc");
  let ses = await Sesion.abrir({
    prueba: "o003a-guardar",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await abrirIfc(ses, FZK);
    await elegirVista(ses, "Planta Erdgeschoss");
    await cambiarPestana(ses, "Vista");
    await (await ses.porTestid("cmd-nuevo-corte")).click();
    await dosClicsEnPlanta(ses, [
      [0.3, 0.45],
      [0.7, 0.55],
    ]);
    await ses.driver.wait(async () => (await vistasPorTipo(ses)).cuenta.corte === 1, 10_000);

    await cambiarPestana(ses, "Inicio");
    await elegirVista(ses, "Planta Erdgeschoss");
    await abrirRangoAvanzado(ses);
    await fijarValor(ses, "vista-altura", "2.35");
    await ses.driver.wait(async () => {
      const el = await ses.porTestid("vista-altura");
      return (await el.getAttribute("value")) === "2.35";
    }, 5000, "la altura no se reflejó en el panel");

    await instalarDialogos(ses, { abrir: FZK, guardar: destino });
    await (await ses.porTestid("cmd-guardar-como")).click();
    await ses.driver.wait(() => fs.existsSync(destino), 15_000, "no se creó el IFC guardado");
    await ses.driver.wait(async () => {
      const texto = await textoDom(ses, '[data-testid="estado-modelo"]');
      return texto === "o003a-guardado.ifc" || texto === "o003a-guardado.ifc •";
    }, 15_000, "la barra de estado no refleja el archivo guardado");
  } finally {
    await ses.cerrar();
  }

  assert.ok(fs.statSync(destino).size > 1000, "el IFC guardado está vacío");
  ses = await Sesion.abrir({
    prueba: "o003a-reabrir",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await abrirIfc(ses, destino);
    const { cuenta, nombres } = await vistasPorTipo(ses);
    assert.equal(cuenta.planta, 2);
    assert.equal(cuenta.corte, 1);
    assert.ok(nombres.includes("Corte 1"));
    await elegirVista(ses, "Planta Erdgeschoss");
    await abrirRangoAvanzado(ses);
    const altura = await ses.porTestid("vista-altura");
    assert.equal(await altura.getAttribute("value"), "2.35");
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test("O003a: Institute abre y se dibuja en menos de 10 s", async () => {
  const ses = await Sesion.abrir({
    prueba: "o003a-rendimiento",
    tamano: { ancho: 1280, alto: 800 },
    lateralExpandido: false,
    compositar: true,
  });
  try {
    await abrirIfc(ses, FZK);
    const inicio = Date.now();
    await instalarDialogos(ses, { abrir: INSTITUTE });
    await (await ses.porTestid("cmd-abrir")).click();
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]'))?.includes(
          "AC20-Institute-Var-2.ifc",
        );
      } catch {
        return false;
      }
    }, 20_000, "Institute no abrió");
    await ses.driver.wait(async () => {
      const visor = await ses.porTestid("visor");
      return Number(await visor.getAttribute("data-mallas")) > 0;
    }, 20_000);
    const transcurrido = Date.now() - inicio;
    console.log(`Institute abierto y dibujado en ${transcurrido} ms`);
    assert.ok(transcurrido < 10_000, `Institute tardó ${transcurrido} ms (máx. 10000)`);
  } finally {
    await ses.cerrar();
  }
});
