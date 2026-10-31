// O021: edición del acomodo de ejes (extremos, candado, globos por extremo y copia
// entre vistas) sobre la app real de Tauri. Sigue el arnés de O011/O014b.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O021");
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

async function arrastrarAsa(ses, etiqueta, lado, deltaY) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado),
    etiqueta,
    lado,
  );
  assert.ok(inicio, `no se encontró el asa ${etiqueta}/${lado}`);
  const fin = { x: inicio.x, y: inicio.y + deltaY };
  await ses.driver.executeScript(
    (inicio, fin) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        pointerType: "mouse",
        clientX: inicio.x,
        clientY: inicio.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(new PointerEvent("pointermove", { ...abajo, clientX: (inicio.x + fin.x) / 2, clientY: (inicio.y + fin.y) / 2 }));
      window.dispatchEvent(new PointerEvent("pointermove", { ...abajo, clientX: fin.x, clientY: fin.y }));
      window.dispatchEvent(new PointerEvent("pointerup", { ...abajo, buttons: 0, clientX: fin.x, clientY: fin.y }));
    },
    inicio,
    fin,
  );
  await esperar(900);
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

test("O021: candado, globos, codo y copia de acomodo entre plantas", async () => {
  const ses = await Sesion.abrir({
    prueba: "o021",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o021-"));
  const ruta = path.join(carpeta, "o021.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 1);
    await dibujarEjes(ses, [0, 4, 8]);
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    const referencias = await invocar(ses, "modelo.referencias");
    const ejes = referencias.ejes.filter((e) => e.etiqueta).sort((a, b) => a.x1 - b.x1);
    assert.equal(ejes.length, 3, "faltan los tres ejes de la prueba");
    const gid1 = ejes[0].globalid;
    const gid2 = ejes[1].globalid;
    const gid3 = ejes[2].globalid;
    const baseY = ejes[0].y2;
    await ses.captura(path.join(PROGRESO, "o021-antes.png"));

    // 1) Candado cerrado (por omisión): arrastrar un extremo mueve los tres aliñados.
    await arrastrarAsa(ses, "1", "fin", 80);
    let { ejes: ajustes } = await ajustesVista(ses);
    for (const gid of [gid1, gid2, gid3]) {
      assert.ok(ajustes[gid]?.extremoFin, `el eje ${gid} no siguió la alineación`);
    }
    const ys = [gid1, gid2, gid3].map((gid) => ajustes[gid].extremoFin[1]);
    assert.ok(
      Math.abs(ys[0] - ys[1]) < 1e-6 && Math.abs(ys[1] - ys[2]) < 1e-6,
      `los extremos alineados no quedaron a la misma altura: ${JSON.stringify(ys)}`,
    );
    assert.ok(Math.abs(ys[0] - baseY) > 0.3, `el arrastre no movió el extremo: ${ys[0]} vs ${baseY}`);
    const yConCandado = ys[0];

    // 2) Candado abierto: solo cambia el eje arrastrado.
    await seleccionarEjeEn(ses, 4);
    await activar(ses, "eje-candado-fin");
    const candadoAbierto = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="eje-candado-fin"]')?.getAttribute("aria-pressed"),
    );
    assert.equal(candadoAbierto, "true", "el candado no quedó abierto");

    await arrastrarAsa(ses, "2", "fin", -60);
    ({ ejes: ajustes } = await ajustesVista(ses));
    assert.ok(
      Math.abs(ajustes[gid1].extremoFin[1] - yConCandado) < 1e-6,
      "el candado abierto movió también el eje 1",
    );
    assert.ok(
      Math.abs(ajustes[gid3].extremoFin[1] - yConCandado) < 1e-6,
      "el candado abierto movió también el eje 3",
    );
    assert.ok(
      Math.abs(ajustes[gid2].extremoFin[1] - yConCandado) > 0.2,
      "el eje 2 no se movió solo con el candado abierto",
    );

    // 3) Ocultar el globo de un extremo: no se dibuja y queda guardado.
    await seleccionarEjeEn(ses, 0);
    await activar(ses, "eje-globo-fin");
    ({ ejes: ajustes } = await ajustesVista(ses));
    assert.equal(ajustes[gid1].globoFin, false, "no se guardó el globo oculto");
    const burbuja = await ses.driver.executeScript(
      (etiqueta) =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla(etiqueta),
      "1",
    );
    assert.equal(burbuja, null, "el globo oculto se siguió dibujando");

    // 4) Crear codo en el eje 3 con el botón del eje seleccionado.
    await seleccionarEjeEn(ses, 8);
    await activar(ses, "eje-codo-fin-agregar");
    ({ ejes: ajustes } = await ajustesVista(ses));
    assert.equal(ajustes[gid3].codosFin?.length, 1, "no se creó el codo del eje 3");
    assert.ok(ajustes[gid3].extremoFin, "el codo no desplazó el globo");
    const acomodo3 = JSON.parse(JSON.stringify(ajustes[gid3]));

    // 5) Copiar el acomodo a la otra planta con el menú contextual.
    const globo3 = await ses.driver.executeScript(
      (etiqueta) =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, "fin"),
      "3",
    );
    assert.ok(globo3, "no se encontró el globo del eje 3");
    await ses.driver.executeScript(
      (punto) => {
        document.querySelector('[data-testid="visor"] canvas').dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: punto.x,
            clientY: punto.y,
          }),
        );
      },
      globo3,
    );
    await esperar(300);
    await activar(ses, "eje-menu-copiar");
    const casillas = await ses.driver.findElements(By.css('[data-testid^="eje-copiar-vista-"]'));
    assert.ok(casillas.length >= 1, "el diálogo no ofrece otras plantas");
    await activar(ses, "eje-copiar-aceptar");
    await esperar(1200);

    const otras = (await invocar(ses, "vistas.leer")).filter(
      (v) => v.tipo === "planta" && v.nombre !== "Planta Nivel 0",
    );
    assert.ok(otras.length >= 1, "no hay otra planta para comprobar");
    assert.deepEqual(
      otras[0].ejes?.[gid3],
      acomodo3,
      "la copia no guardó extremos, codos y globos en la otra planta",
    );

    // Guardar y reabrir: la copia y los globos quedan en el pset de cada vista.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o021.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo");
    const reabiertas = await invocar(ses, "vistas.leer");
    const planta0 = reabiertas.find((v) => v.nombre === "Planta Nivel 0");
    const planta1 = reabiertas.find((v) => v.nombre !== "Planta Nivel 0" && v.tipo === "planta");
    assert.equal(planta0.ejes[gid1].globoFin, false, "el globo oculto no persistió");
    assert.deepEqual(planta1.ejes[gid3], acomodo3, "la copia no persistió al guardar");
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await ses.captura(path.join(PROGRESO, "o021-despues.png"));
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
