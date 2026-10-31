// O027: arrastre restringido de las asas de ejes y niveles sobre la app real de
// Tauri. Sigue el arnés de O011/O014b/O021.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O027");
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

async function ajustesVista(ses, nombre = "Planta Nivel 0") {
  const vistas = await invocar(ses, "vistas.leer");
  const vista = vistas.find((v) => v.nombre === nombre);
  assert.ok(vista, `no existe ${nombre}`);
  return { vista, ejes: vista.ejes ?? {} };
}

async function seleccionarEjeEn(ses, x) {
  const punto = await proyectar(ses, x, 3);
  assert.ok(punto, `no se pudo proyectar el eje en x=${x}`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const opciones = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 3,
        pointerType: "mouse",
        clientX: punto.x,
        clientY: punto.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", opciones));
      window.dispatchEvent(new PointerEvent("pointerup", { ...opciones, buttons: 0 }));
    },
    punto,
  );
  await esperar(500);
  const seleccionado = await ses.driver.executeScript(() =>
    document.querySelector('[data-testid="visor"]')?.getAttribute("data-eje-seleccionado"),
  );
  assert.ok(seleccionado, `el eje en x=${x} no quedó seleccionado`);
}

const dentroDe = (v, esperado, tolerancia, mensaje) =>
  assert.ok(
    Math.abs(v - esperado) <= tolerancia,
    `${mensaje}: ${v} vs ${esperado} (tol ${tolerancia})`,
  );

// Arrastra un asa con dos movimientos; opciones: shift y cancelar (Escape antes de soltar).
async function arrastrarAsa(ses, etiqueta, lado, dx, dy, opciones = {}) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado),
    etiqueta,
    lado,
  );
  assert.ok(inicio, `no se encontró el asa ${etiqueta}/${lado}`);
  await ses.driver.executeScript(
    (inicio, dx, dy, opciones) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        pointerType: "mouse",
        shiftKey: !!opciones.shift,
        clientX: inicio.x,
        clientY: inicio.y,
      };
      const medio = { ...abajo, clientX: inicio.x + dx / 2, clientY: inicio.y + dy / 2 };
      const fin = { ...abajo, clientX: inicio.x + dx, clientY: inicio.y + dy };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(new PointerEvent("pointermove", medio));
      window.dispatchEvent(new PointerEvent("pointermove", fin));
      if (opciones.cancelar) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
        );
      }
      window.dispatchEvent(new PointerEvent("pointerup", { ...fin, buttons: 0 }));
    },
    inicio,
    dx,
    dy,
    opciones,
  );
  await esperar(900);
  return inicio;
}

async function arrastrarNivel(ses, globalid, dx, dy) {
  const inicio = await ses.driver.executeScript(
    (globalid) =>
      document.querySelector('[data-testid="visor"]').__openrvtNivelAPantalla(globalid),
    globalid,
  );
  assert.ok(inicio, "no se encontró el asa de la cabeza de nivel");
  await ses.driver.executeScript(
    (inicio, dx, dy) => {
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
      const fin = { ...abajo, clientX: inicio.x + dx, clientY: inicio.y + dy };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          ...abajo,
          clientX: inicio.x + dx / 2,
          clientY: inicio.y + dy / 2,
        }),
      );
      window.dispatchEvent(new PointerEvent("pointermove", fin));
      window.dispatchEvent(new PointerEvent("pointerup", { ...fin, buttons: 0 }));
    },
    inicio,
    dx,
    dy,
  );
  await esperar(900);
  return inicio;
}

test("O027: asas de ejes y niveles con movimiento restringido", async () => {
  const ses = await Sesion.abrir({
    prueba: "o027",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o027-"));
  const ruta = path.join(carpeta, "o027.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 1);
    await dibujarEjes(ses, [0, 4]);
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);

    const referencias = await invocar(ses, "modelo.referencias");
    const ejes = referencias.ejes.filter((e) => e.etiqueta).sort((a, b) => a.x1 - b.x1);
    assert.equal(ejes.length, 2, "faltan los ejes de la prueba");
    const eje1 = ejes[0];
    const eje2 = ejes[1];
    const x1 = eje1.x2;
    await ses.captura(path.join(PROGRESO, "o027-antes.png"));

    // 1) Un extremo de eje vertical arrastrado en diagonal (80, 40) solo cambia su
    // largo: la x queda igual al milímetro (0,001 m).
    await arrastrarAsa(ses, "1", "fin", 80, 40);
    let ajustes = (await ajustesVista(ses)).ejes;
    dentroDe(ajustes[eje1.globalid].extremoFin[0], x1, 0.001, "el extremo se movió de lado");
    assert.ok(
      Math.abs(ajustes[eje1.globalid].extremoFin[1] - eje1.y2) > 0.3,
      "el extremo no se alargó",
    );
    const yTrasExtremo = ajustes[eje1.globalid].extremoFin[1];

    // 2) Un solo Deshacer revierte el arrastre completo (también los ejes alineados).
    await activar(ses, "cmd-deshacer");
    await esperar(800);
    ajustes = (await ajustesVista(ses)).ejes;
    assert.equal(ajustes[eje1.globalid]?.extremoFin, undefined, "Deshacer no quitó el extremo");
    assert.equal(ajustes[eje2.globalid]?.extremoFin, undefined, "Deshacer no revirtió el grupo");

    // 3) Globo con codo: al arrastrarlo en diagonal solo se mueve en horizontal.
    await seleccionarEjeEn(ses, 4);
    await activar(ses, "eje-codo-fin-agregar");
    ajustes = (await ajustesVista(ses)).ejes;
    assert.equal(ajustes[eje2.globalid].codosFin?.length, 1, "no se creó el codo");
    const yGlobo = ajustes[eje2.globalid].extremoFin[1];
    const xGlobo = ajustes[eje2.globalid].extremoFin[0];
    await arrastrarAsa(ses, "2", "fin", 70, 50);
    ajustes = (await ajustesVista(ses)).ejes;
    dentroDe(ajustes[eje2.globalid].extremoFin[1], yGlobo, 0.001, "el globo cambió de altura");
    assert.ok(
      Math.abs(ajustes[eje2.globalid].extremoFin[0] - xGlobo) > 0.2,
      "el globo no se desplazó perpendicular",
    );
    await ses.captura(path.join(PROGRESO, "o027-globo-codo.png"));

    // 4) Escape cancela: el arrastre no deja nada escrito.
    const antesEscape = JSON.stringify((await ajustesVista(ses)).ejes[eje2.globalid]);
    await arrastrarAsa(ses, "2", "fin", -90, 120, { cancelar: true });
    const trasEscape = JSON.stringify((await ajustesVista(ses)).ejes[eje2.globalid]);
    assert.equal(trasEscape, antesEscape, "Escape no restauró el acomodo");

    // 5) Shift = libre: con el candado abierto el extremo se mueve en las dos
    // direcciones. Sin candado el arrastre de alineación solo aplicaría el eje.
    await seleccionarEjeEn(ses, 0);
    await activar(ses, "eje-candado-fin");
    const baseLibre = JSON.stringify((await ajustesVista(ses)).ejes[eje1.globalid] ?? null);
    await arrastrarAsa(ses, "1", "fin", 60, 70, { shift: true });
    ajustes = (await ajustesVista(ses)).ejes;
    assert.notEqual(JSON.stringify(ajustes[eje1.globalid] ?? null), baseLibre);
    dentroDe(ajustes[eje1.globalid].extremoFin[1], yTrasExtremo, 2, "el Shift no movió la y");
    assert.ok(
      Math.abs(ajustes[eje1.globalid].extremoFin[0] - x1) > 0.05,
      "el Shift no movió la x (debería ser libre)",
    );

    // 6) Cabeza de nivel en alzado: arrastre diagonal (60, -70) solo la mueve en
    // vertical; su x en pantalla no cambia.
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    const niveles = await invocar(ses, "modelo.niveles");
    const nivel = niveles[0];
    const antesNivel = await ses.driver.executeScript(
      (gid) => document.querySelector('[data-testid="visor"]').__openrvtNivelAPantalla(gid),
      nivel.globalid,
    );
    assert.ok(antesNivel, "no se encontró la cabeza del nivel en alzado");
    await arrastrarNivel(ses, nivel.globalid, 60, -70);
    const despuesNivel = await ses.driver.executeScript(
      (gid) => document.querySelector('[data-testid="visor"]').__openrvtNivelAPantalla(gid),
      nivel.globalid,
    );
    dentroDe(despuesNivel.x, antesNivel.x, 1, "la cabeza de nivel se movió de lado");
    assert.ok(Math.abs(despuesNivel.y - antesNivel.y) > 20, "la cabeza de nivel no subió");
    const vistaAlzado = (await invocar(ses, "vistas.leer")).find(
      (v) => v.nombre === "Alzado Norte",
    );
    assert.ok(
      Math.abs(vistaAlzado.nivelesAjuste[nivel.globalid].desplazamiento) > 0.1,
      "el desplazamiento vertical no se guardó",
    );
    await ses.captura(path.join(PROGRESO, "o027-nivel-alzado.png"));
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
