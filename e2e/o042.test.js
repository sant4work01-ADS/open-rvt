// O042: codo de eje con V1/V2, arrastre de V2 y dibujo. Se ejecuta sobre la app
// real (Tauri + WebKitGTK) con clics y arrastres de ratón en planta.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O042");
fs.mkdirSync(PROGRESO, { recursive: true });

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function atributoVisor(ses, nombre) {
  return (await ses.porTestid("visor")).getAttribute(`data-${nombre}`);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(250);
}

async function fijarValor(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    testid,
    valor,
  );
  await esperar(150);
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

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function clicEn(ses, punto) {
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

async function tecla(ses, key, code, extras = {}) {
  await ses.driver.executeScript(
    (key, code, extras) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true, ...extras }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true, ...extras }),
      );
    },
    key,
    code,
    extras,
  );
  await esperar(250);
}

async function crearNivelLista(ses) {
  const niveles = await invocar(ses, "modelo.niveles");
  const elevacion = niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) + 3 : 0;
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(300);
  await fijarValor(ses, "nivel-nuevo-nombre", `Nivel ${niveles.length}`);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(700);
  const modelo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="modelo"]')),
    10_000,
  );
  await modelo.click();
  await esperar(300);
}

async function crearModelo(ses) {
  await activar(ses, "cmd-nuevo");
  // Con cambios sin guardar, «Nuevo» pregunta; se descarta para empezar limpio.
  const descartar = await ses.driver.findElements(
    By.xpath('//button[normalize-space(.)="No guardar"]'),
  );
  if (descartar.length > 0) {
    await descartar[0].click();
    await esperar(600);
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

async function dibujarEjes(ses, tramos) {
  await activar(ses, "cmd-eje");
  for (const [[x1, y1], [x2, y2]] of tramos) {
    const a = await proyectar(ses, x1, y1);
    const b = await proyectar(ses, x2, y2);
    await clicEn(ses, a);
    await clicEn(ses, b);
  }
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(400);
  await activar(ses, "visor-ajustar");
  await esperar(600);
}

async function ajustes(ses) {
  return JSON.parse((await atributoVisor(ses, "ejes-ajustes")) || "{}");
}

async function seleccionarEje(ses, etiqueta) {
  const punto = await ses.driver.executeScript(
    (etiqueta) => document.querySelector('[data-testid="visor"]').__openrvtEjeLineaAPantalla(etiqueta),
    etiqueta,
  );
  assert.ok(punto, `no se pudo proyectar el eje ${etiqueta}`);
  await clicEn(ses, punto);
  await ses.driver.wait(
    async () => (await atributoVisor(ses, "eje-seleccionado")) !== null,
    5_000,
    "el eje no quedó seleccionado",
  );
}

/** Arrastra el asa `indiceCodo` (o la base) en píxeles de pantalla. */
async function arrastrarAsa(ses, etiqueta, lado, dx, dy, opciones = {}) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado, indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado, indice),
    etiqueta,
    lado,
    opciones.indiceCodo,
  );
  assert.ok(inicio, `no se encontró el asa ${etiqueta}/${lado}/${opciones.indiceCodo ?? "base"}`);
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
        clientX: inicio.x,
        clientY: inicio.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: inicio.x + dx / 2, clientY: inicio.y + dy / 2 }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: inicio.x + dx, clientY: inicio.y + dy }),
      );
      if (opciones.cancelar) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
        );
      }
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...abajo,
          buttons: 0,
          clientX: inicio.x + dx,
          clientY: inicio.y + dy,
        }),
      );
    },
    inicio,
    dx,
    dy,
    opciones,
  );
  await esperar(900);
}

/** Arrastra un asa hasta una coordenada de mundo (para las capturas). */
async function arrastrarAsaAMundo(ses, etiqueta, lado, indiceCodo, destinoMundo) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado, indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado, indice),
    etiqueta,
    lado,
    indiceCodo,
  );
  const fin = await proyectar(ses, destinoMundo[0], destinoMundo[1]);
  assert.ok(inicio && fin, "no se pudo proyectar el arrastre del codo");
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
      window.dispatchEvent(new PointerEvent("pointermove", { ...abajo, clientX: fin.x, clientY: fin.y }));
      window.dispatchEvent(new PointerEvent("pointerup", { ...abajo, buttons: 0, clientX: fin.x, clientY: fin.y }));
    },
    inicio,
    fin,
  );
  await esperar(900);
}

async function quitarCodoConMenu(ses, etiqueta, lado = "fin", indiceCodo = 1) {
  const punto = await ses.driver.executeScript(
    (etiqueta, lado, indice) =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, lado, indice),
    etiqueta,
    lado,
    indiceCodo,
  );
  assert.ok(punto, "no se encontró el asa del codo para el menú");
  await ses.driver.executeScript(
    (punto) => {
      document.querySelector('[data-testid="visor"] canvas').dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(300);
  await activar(ses, "eje-quitar-codo");
}

async function arrastrarEnPantalla(ses, punto, dx, dy, pointerId = 12) {
  await ses.driver.executeScript(
    (punto, dx, dy, pointerId) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId,
        pointerType: "mouse",
        clientX: punto.x,
        clientY: punto.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: punto.x + dx, clientY: punto.y + dy }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...abajo,
          buttons: 0,
          clientX: punto.x + dx,
          clientY: punto.y + dy,
        }),
      );
    },
    punto,
    dx,
    dy,
    pointerId,
  );
  await esperar(500);
}

function cerca(p, q, tolerancia = 1e-6) {
  return Math.abs(p[0] - q[0]) <= tolerancia && Math.abs(p[1] - q[1]) <= tolerancia;
}

test("O042: codo de eje con V1/V2, arrastre de V2 y capturas", async () => {
  const ses = await Sesion.abrir({
    prueba: "o042",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    await crearNivelLista(ses);
    // Eje 1 vertical en x=0 y eje A horizontal en y=4.
    await dibujarEjes(ses, [
      [[0, -2], [0, 8]],
      [[-2, 4], [10, 4]],
    ]);
    await elegirVista(ses, "Planta Nivel 0");

    const vista = (await invocar(ses, "vistas.leer")).find((v) => v.nombre === "Planta Nivel 0");
    assert.ok(vista, "falta la vista Planta Nivel 0");
    // D = 8 mm de papel en el modelo: a 1:100 son 0.8 m. Calculado de la escala.
    const D = (8 * vista.escala) / 1000;

    const referencias = await invocar(ses, "modelo.referencias");
    const vertical = referencias.ejes.find((e) => e.vertical && e.etiqueta);
    const horizontal = referencias.ejes.find((e) => !e.vertical && e.etiqueta);
    assert.ok(vertical && horizontal, "faltan los ejes 1 y A de la prueba");
    assert.equal(vertical.etiqueta, "1");
    assert.equal(horizontal.etiqueta, "A");

    // 2) Agregar codo al extremo de cada uno.
    await seleccionarEje(ses, "1");
    await activar(ses, "eje-codo-fin-agregar");
    await seleccionarEje(ses, "A");
    await activar(ses, "eje-codo-fin-agregar");
    let a = await ajustes(ses);

    const finV = [vertical.x2, vertical.y2];
    const dirV = [
      (vertical.x2 - vertical.x1) / Math.hypot(vertical.x2 - vertical.x1, vertical.y2 - vertical.y1),
      (vertical.y2 - vertical.y1) / Math.hypot(vertical.x2 - vertical.x1, vertical.y2 - vertical.y1),
    ];
    // V1 = fin - 2D; V2 = V1 + D afuera + D de lado; perpendicular = (-dy, dx).
    const v1V = [finV[0] - dirV[0] * 2 * D, finV[1] - dirV[1] * 2 * D];
    const v2V = [
      v1V[0] + dirV[0] * D + -dirV[1] * D,
      v1V[1] + dirV[1] * D + dirV[0] * D,
    ];
    assert.equal(a[vertical.globalid].codosFin.length, 2);
    assert.ok(cerca(a[vertical.globalid].codosFin[0], v1V, 1e-6), "V1 vertical incorrecto");
    assert.ok(cerca(a[vertical.globalid].codosFin[1], v2V, 1e-6), "V2 vertical incorrecto");
    assert.equal(a[vertical.globalid].extremoFin, undefined);
    // El tramo final es paralelo al eje: el globo de 1 queda en V2 + D·dirV.
    const globoV = [v2V[0] + dirV[0] * D, v2V[1] + dirV[1] * D];
    const burbujaV = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("1"),
    );
    const globoVPantalla = await proyectar(ses, globoV[0], globoV[1]);
    assert.ok(
      Math.hypot(burbujaV.x - globoVPantalla.x, burbujaV.y - globoVPantalla.y) < 2,
      "el globo del eje vertical no está D más allá de V2 sobre el eje",
    );

    // 3) V2 horizontal: arrastre casi vertical (perpendicular) y luego casi
    // horizontal (a lo largo). Solo cambia la componente elegida.
    const gidH = horizontal.globalid;
    const v2Antes = [...a[gidH].codosFin[1]];
    await arrastrarAsa(ses, "A", "fin", 10, 90, { indiceCodo: 1 });
    a = await ajustes(ses);
    let v2 = a[gidH].codosFin[1];
    assert.ok(Math.abs(v2[0] - v2Antes[0]) <= 0.0011, `casi vertical movió x: ${v2[0]} vs ${v2Antes[0]}`);
    assert.ok(Math.abs(v2[1] - v2Antes[1]) > 0.2, "casi vertical no movió y");

    const v2TrasPerp = [...v2];
    await arrastrarAsa(ses, "A", "fin", 90, 10, { indiceCodo: 1 });
    a = await ajustes(ses);
    v2 = a[gidH].codosFin[1];
    assert.ok(Math.abs(v2[1] - v2TrasPerp[1]) <= 0.0011, `casi horizontal movió y: ${v2[1]} vs ${v2TrasPerp[1]}`);
    assert.ok(Math.abs(v2[0] - v2TrasPerp[0]) > 0.2, "casi horizontal no movió x");

    // 8) El globo se deriva de V2: mismo largo final, paralelo al eje (+x).
    const globoH = [v2[0] + D, v2[1]];
    const burbuja = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    const globoPantalla = await proyectar(ses, globoH[0], globoH[1]);
    assert.ok(
      Math.hypot(burbuja.x - globoPantalla.x, burbuja.y - globoPantalla.y) < 2,
      "el globo no está D más allá de V2 sobre el eje",
    );

    // 4) V1 y el globo no se pueden arrastrar.
    const antesV1 = JSON.stringify(a[gidH]);
    const pV1 = await proyectar(ses, a[gidH].codosFin[0][0], a[gidH].codosFin[0][1]);
    await arrastrarEnPantalla(ses, pV1, 60, 60, 13);
    assert.equal(JSON.stringify((await ajustes(ses))[gidH]), antesV1, "V1 se pudo arrastrar");
    assert.equal(
      await ses.driver.executeScript(() =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla("A", "fin", 0),
      ),
      null,
      "V1 no debe tener pinzamiento",
    );

    const antesGlobo = JSON.stringify((await ajustes(ses))[gidH]);
    const burbujaAntes = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    await ses.driver.executeScript(
      (punto) => {
        const canvas = document.querySelector('[data-testid="visor"] canvas');
        const abajo = {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          pointerId: 11,
          pointerType: "mouse",
          clientX: punto.x,
          clientY: punto.y,
        };
        canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
        window.dispatchEvent(
          new PointerEvent("pointermove", { ...abajo, clientX: punto.x + 40, clientY: punto.y + 40 }),
        );
        window.dispatchEvent(
          new PointerEvent("pointerup", { ...abajo, buttons: 0, clientX: punto.x + 40, clientY: punto.y + 40 }),
        );
      },
      burbujaAntes,
    );
    await esperar(500);
    assert.equal(
      JSON.stringify((await ajustes(ses))[gidH]),
      antesGlobo,
      "el globo del codo se pudo arrastrar",
    );

    // 5) Escape a mitad de un arrastre de V2 no deja nada escrito.
    const antesEscape = JSON.stringify((await ajustes(ses))[gidH]);
    await arrastrarAsa(ses, "A", "fin", -80, 70, { indiceCodo: 1, cancelar: true });
    assert.equal(JSON.stringify((await ajustes(ses))[gidH]), antesEscape, "Escape no canceló");

    // 6) Deshacer y Rehacer alrededor de un arrastre de V2.
    const codosDe = (valor) => (valor?.codosFin ?? []).map((p) => [...p]);
    const antesArrastre = codosDe((await ajustes(ses))[gidH]);
    await arrastrarAsa(ses, "A", "fin", 60, 4, { indiceCodo: 1 });
    const trasArrastre = codosDe((await ajustes(ses))[gidH]);
    assert.notDeepEqual(trasArrastre, antesArrastre, "el arrastre no cambió el codo");
    await activar(ses, "cmd-deshacer");
    await esperar(700);
    const deshecho = codosDe((await ajustes(ses))[gidH]);
    assert.equal(deshecho.length, antesArrastre.length, "Deshacer dejó otro número de nodos");
    deshecho.forEach((p, i) => assert.ok(cerca(p, antesArrastre[i]), "Deshacer no revirtió"));
    await activar(ses, "cmd-rehacer");
    await esperar(700);
    const rehecho = codosDe((await ajustes(ses))[gidH]);
    assert.equal(rehecho.length, trasArrastre.length, "Rehacer dejó otro número de nodos");
    rehecho.forEach((p, i) => assert.ok(cerca(p, trasArrastre[i]), "Rehacer no repitió"));

    // 7) Quitar el codo desde el menú de V2: línea recta y globo al extremo.
    await quitarCodoConMenu(ses, "A", "fin", 1);
    a = await ajustes(ses);
    assert.equal(a[gidH], undefined, "quitar el codo no devolvió el ajuste original");
    const burbujaFinal = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla("A"),
    );
    const finH = await proyectar(ses, horizontal.x2, horizontal.y2);
    assert.ok(
      Math.hypot(burbujaFinal.x - finH.x, burbujaFinal.y - finH.y) < 2,
      "el globo no volvió al extremo del eje",
    );

    // 9) Capturas: los 4 casos de la referencia en ejes horizontales, el eje
    // vertical con codo y un eje seleccionado con sus pinzamientos.
    await cambiarPestana(ses, "Inicio");
    await crearModelo(ses);
    await crearNivelLista(ses);
    await dibujarEjes(ses, [
      [[-2, 0], [10, 0]],
      [[-2, 4], [10, 4]],
      [[-2, 8], [10, 8]],
      [[-2, 12], [10, 12]],
      [[14, 0], [14, 10]],
    ]);
    await elegirVista(ses, "Planta Nivel 0");
    const refs2 = await invocar(ses, "modelo.referencias");
    const horizontales = refs2.ejes
      .filter((e) => !e.vertical && e.etiqueta)
      .sort((a, b) => a.y1 - b.y1);
    const vert = refs2.ejes.find((e) => e.vertical && e.etiqueta);
    assert.equal(horizontales.length, 4, "faltan los cuatro ejes horizontales");
    const [h1, h2, h3, h4] = horizontales;

    // Caso 2: codo hacia un lado (el de por omisión).
    await seleccionarEje(ses, h2.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    // Caso 3: codo hacia el otro lado (V2 arrastrado de lado más de D).
    await seleccionarEje(ses, h3.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    await arrastrarAsaAMundo(ses, h3.etiqueta, "fin", 1, [h3.x2 - D, h3.y2 - D]);
    // Caso 4: diagonal más larga (V2 arrastrado a lo largo, hacia afuera).
    await seleccionarEje(ses, h4.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    await arrastrarAsaAMundo(ses, h4.etiqueta, "fin", 1, [h4.x2 + D, h4.y2 + D]);
    // Eje vertical con codo.
    await seleccionarEje(ses, vert.etiqueta);
    await activar(ses, "eje-codo-fin-agregar");
    await esperar(600);

    await ses.captura(path.join(PROGRESO, "casos-referencia-y-vertical.png"));
    // Eje horizontal seleccionado: se ve el único pinzamiento en V2.
    await seleccionarEje(ses, h4.etiqueta);
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "eje-seleccionado-pinzamientos.png"));

    const capturas = fs.readdirSync(PROGRESO).filter((f) => f.endsWith(".png"));
    assert.ok(capturas.length >= 2, "no se guardaron las capturas");
  } finally {
    await ses.cerrar();
  }
});
