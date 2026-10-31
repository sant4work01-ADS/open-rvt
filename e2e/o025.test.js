// O021b: el texto de nivel queda arriba de su línea y las cotas chicas no se
// enciman ni cruzan líneas de extensión. Se mide con las cajas proyectadas de la
// app real de Tauri (mismas reglas que O011/O014b).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O025");
fs.mkdirSync(PROGRESO, { recursive: true });

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
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

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(800);
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
  await esperar(320);
}

async function tecla(ses, key, code) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
    },
    key,
    code,
  );
  await esperar(250);
}

async function crearModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await cambiarPestana(ses, "Modelar");
}

async function crearNiveles(ses, cantidad) {
  for (let i = 0; i < cantidad; i += 1) await activar(ses, "cmd-nivel");
}

async function dibujarMuroAlto(ses, alto) {
  await activar(ses, "cmd-muro");
  const ok = await ses.driver.executeScript((alto) => {
    const el = document.querySelector('[data-testid="muro-altura"]');
    if (!el) return false;
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(alto));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, alto);
  assert.equal(ok, true, "no se pudo fijar la altura del muro");
  await clicMundo(ses, 0, 0);
  await clicMundo(ses, 18, 0);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(700);
}

async function dibujarEjes(ses, xs) {
  await activar(ses, "cmd-eje");
  for (const x of xs) {
    await clicMundo(ses, x, -2);
    await clicMundo(ses, x, 8);
  }
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(400);
  await activar(ses, "visor-ajustar");
  await esperar(700);
}

async function anotaciones(ses) {
  const datos = await ses.driver.executeScript(() =>
    document.querySelector('[data-testid="visor"]').__openrvtAlzadoAnotacionesPantalla(),
  );
  assert.ok(datos, "no se pudieron leer las anotaciones del alzado");
  return datos;
}
async function fijarValor(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      const prototipo =
        el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototipo, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    testid,
    valor,
  );
  await esperar(120);
}

async function crearEjesReferencia(ses) {
  await cambiarPestana(ses, "Modelar");
  await activar(ses, "cmd-ejes-separaciones");
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
    10_000,
    "no abrió el diálogo de ejes por separaciones",
  );
  await fijarValor(ses, "eje-sep-horizontal-separaciones", "");
  await fijarValor(ses, "eje-sep-vertical-separaciones", "4, 4, 4");
  await fijarValor(ses, "eje-sep-vertical-etiqueta", "1");
  await fijarValor(ses, "eje-sep-vertical-origen", "0");
  await fijarValor(ses, "eje-sep-vertical-longitud", "20");
  await ses.driver.executeScript(() => {
    document.querySelector('[data-testid="eje-sep-aceptar"]')?.click();
  });
  await ses.driver.wait(
    async () =>
      (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]')))
        .length === 0,
    10_000,
    "el diálogo de ejes no se cerró",
  );
  await esperar(400);
}

function seIntersectan(a, b, margen = 0.5) {
  return (
    a.x0 < b.x1 - margen &&
    b.x0 < a.x1 - margen &&
    a.y0 < b.y1 - margen &&
    b.y0 < a.y1 - margen
  );
}

async function datosVisor(ses) {
  return ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    return {
      globoZ: Number(visor.dataset.ejesGloboZ),
      nivelesZ: JSON.parse(visor.dataset.nivelesZ ?? "[]"),
      nivelesX: JSON.parse(visor.dataset.nivelesX ?? "{}"),
      remate: visor.dataset.nivelesCotaRemate,
      patron: visor.dataset.nivelesPatron,
      separacion: Number(visor.dataset.nivelesSeparacionGlobos),
    };
  });
}

test("O025: niveles, ejes y cotas en alzado como la referencia", async () => {
  const ses = await Sesion.abrir({
    prueba: "o025",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o025-"));
  const ruta = path.join(carpeta, "o025.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 4);
    await dibujarMuroAlto(ses, 6);
    await crearEjesReferencia(ses);

    const niveles = (await invocar(ses, "modelo.niveles")).sort(
      (a, b) => a.elevacion - b.elevacion,
    );
    assert.equal(niveles.length, 5, "faltan niveles de la prueba");
    const elevaciones = [0, 0.5, 1.5, 2, 2.2];
    for (let i = 0; i < 5; i += 1) {
      await invocar(ses, "niveles.editar", {
        globalid: niveles[i].globalid,
        nombre: niveles[i].nombre,
        elevacion: elevaciones[i],
      });
    }
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o025.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo");

    await elegirVista(ses, "Alzado Norte");
    await esperar(900);
    await activar(ses, "visor-ajustar");
    await esperar(700);

    const datos = await anotaciones(ses);
    const etiquetasNivel = datos.etiquetas.filter((e) => e.tipo === "nivel");
    assert.deepEqual(
      etiquetasNivel.map((e) => e.texto),
      ["Npt 0.00m", "Npt +0.50m", "Npt +1.50m", "Npt +2.00m", "Npt +2.20m"],
    );
    const parciales = datos.etiquetas.filter((e) => e.tipo === "parcial").map((e) => e.texto);
    assert.deepEqual(parciales, ["0.50", "1.00", "0.50", "0.20"]);
    const totales = datos.etiquetas.filter((e) => e.tipo === "total").map((e) => e.texto);
    assert.deepEqual(totales, ["2.20"]);

    const base = await datosVisor(ses);
    assert.deepEqual(base.nivelesZ, [0, 0.5, 1.5, 2, 2.2]);
    // A 1:100, 10 mm de papel = 1.00 m y el radio del globo = 0.40 m: 2.20+1.00+0.40.
    assert.ok(Math.abs(base.globoZ - 3.6) < 0.001, `globo en ${base.globoZ}`);
    // 7 mm entre filas = 0.70 m.
    assert.ok(Math.abs(base.nivelesX.totalX - base.nivelesX.parcialX - 0.7) < 1e-6);
    assert.equal(base.remate, "flecha-rellena");
    assert.equal(base.patron, "trazo-punto", `patrón de nivel ${base.patron}`);

    // Captura a 1:100 con Ajustar (vista completa).
    await cambiarPestana(ses, "Vista");
    await ses.captura(path.join(PROGRESO, "alzado-referencia-ajustar.png"));

    // Encuadrar la anotación para que llene la vista, como la referencia:
    // los cinco niveles y el globo, con la cadena y las cabezas.
    const encuadre = await datosVisor(ses);
    await ses.driver.executeScript(
      (t, z, alto) => {
        document.querySelector('[data-testid="visor"]').__openrvtEnfocarAlzado(t, z, alto);
      },
      encuadre.nivelesX.etiquetaX,
      1.5,
      3.5,
    );
    await esperar(700);
    // Cerrar el aviso de navegación para que no tape los niveles bajos.
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="ayuda-navegacion-cerrar"]')?.click();
    });
    await esperar(300);
    const acercado = await anotaciones(ses);
    // Cajas reales a zoom de anotación: nada se encima.
    for (let i = 0; i < acercado.etiquetas.length; i += 1) {
      for (let j = i + 1; j < acercado.etiquetas.length; j += 1) {
        assert.equal(
          seIntersectan(acercado.etiquetas[i], acercado.etiquetas[j]),
          false,
          `se enciman «${acercado.etiquetas[i].texto}» ${JSON.stringify(acercado.etiquetas[i])} y «${acercado.etiquetas[j].texto}» ${JSON.stringify(acercado.etiquetas[j])}`,
        );
      }
    }
    for (const globo of acercado.globos) {
      for (const etiqueta of acercado.etiquetas) {
        const caja = {
          x0: globo.x - globo.radio,
          x1: globo.x + globo.radio,
          y0: globo.y - globo.radio,
          y1: globo.y + globo.radio,
        };
        assert.equal(
          seIntersectan(caja, etiqueta),
          false,
          `el globo ${globo.etiqueta} encima de ${etiqueta.texto}`,
        );
      }
    }
    const cabezas = acercado.etiquetas.filter((e) => e.tipo === "nivel");
    assert.equal(cabezas.length, 5);
    const xCabezas = cabezas.map((e) => e.x0);
    for (const x of xCabezas) {
      assert.ok(Math.abs(x - xCabezas[0]) < 2, `cabeza descentrada: ${xCabezas.join(",")}`);
    }
    const c220 = cabezas.find((e) => e.texto === "Npt +2.20m");
    const c200 = cabezas.find((e) => e.texto === "Npt +2.00m");
    assert.ok(c220 && c200, "faltan las cabezas 2.00/2.20");
    assert.ok(
      (c220.y0 + c220.y1) / 2 < (c200.y0 + c200.y1) / 2,
      "la cabeza 2.20 debe quedar arriba de la 2.00",
    );

    await activar(ses, "cmd-tema-oscuro");
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "alzado-referencia-oscuro.png"));
    await activar(ses, "cmd-tema-claro");
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "alzado-referencia-claro.png"));

    await activar(ses, "cmd-estilos-anotacion");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="dialogo-anotacion"]')),
      10_000,
      "no abrió el editor de anotación",
    );
    const tabEjes = await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="pestana-anotacion-ejes"]')),
      10_000,
    );
    await tabEjes.click();
    await esperar(250);
    await fijarValor(ses, "eje-separacion-globos", "20");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="boton-guardar-anotacion"]')?.click();
    });
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="dialogo-anotacion"]'))).length === 0,
      15_000,
      "el editor de anotación no se cerró",
    );
    await esperar(800);
    const moved = await datosVisor(ses);
    // 20 mm de papel = 2.00 m: centro = 2.20 + 2.00 + 0.40.
    assert.ok(Math.abs(moved.globoZ - 4.6) < 0.001, `globo en ${moved.globoZ}`);
    assert.ok(moved.separacion > base.separacion + 0.5, "la separación no se guardó");

    await activar(ses, "cmd-estilos-anotacion");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="dialogo-anotacion"]')),
      10_000,
    );
    const tabCotas = await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="pestana-anotacion-cotas"]')),
      10_000,
    );
    await tabCotas.click();
    await esperar(250);
    await fijarValor(ses, "cota-remate", "tick-arquitectonico");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="boton-guardar-anotacion"]')?.click();
    });
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="dialogo-anotacion"]'))).length === 0,
      15_000,
    );
    await esperar(800);
    const conTick = await datosVisor(ses);
    assert.equal(conTick.remate, "tick-arquitectonico");
    await ses.captura(path.join(PROGRESO, "alzado-referencia-tick.png"));
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
