// O051: niveles sin 3 m automáticos y botón Orbitar, con clics y teclas reales en
// la app Tauri. Las elevaciones esperadas salen de la spec, no de lo que devuelve
// el código: 2.20, luego +0.20 sobre 2.20 = 2.40 y luego 3.00 exactos.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O051");
fs.mkdirSync(CAPTURAS, { recursive: true });

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
  await esperar(250);
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
  await esperar(700);
}

async function irModulo(ses, id) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`nav[aria-label="Módulos"] [data-modulo="${id}"]`)),
    10_000,
  );
  await boton.click();
  await esperar(400);
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
  await esperar(150);
}

async function niveles(ses) {
  return invocar(ses, "modelo.niveles");
}

async function vistas(ses) {
  return invocar(ses, "vistas.leer");
}

async function escribir(ses, valor) {
  await ses.driver.actions({ async: true }).sendKeys(valor).perform();
  await esperar(120);
}

async function tecla(ses, key) {
  await ses.driver.actions({ async: true }).sendKeys(key).perform();
  await esperar(300);
}

async function camara(ses) {
  return ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    const crudo = visor?.dataset.camara;
    if (!crudo) throw new Error("el visor no publica data-camara");
    return JSON.parse(crudo);
  });
}

function distancia(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Arrastre sintético sobre el visor; los manejadores leen move/up en window. */
async function arrastrar(ses, boton, { x = 700, y = 420, dx = -90, dy = 50 } = {}) {
  await ses.driver.executeScript(
    (boton, x, y, dx, dy) => {
      const visor = document.querySelector('[data-testid="visor"]');
      const comun = {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        buttons: boton === 2 ? 2 : 1,
      };
      visor.dispatchEvent(
        new PointerEvent("pointerdown", { ...comun, button: boton, clientX: x, clientY: y }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...comun, clientX: x + dx, clientY: y + dy }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          ...comun,
          clientX: x + dx * 2,
          clientY: y + dy * 2,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          ...comun,
          button: boton,
          buttons: 0,
          clientX: x + dx * 2,
          clientY: y + dy * 2,
        }),
      );
    },
    boton,
    x,
    y,
    dx,
    dy,
  );
  await esperar(250);
}

async function clicPantalla(ses, punto) {
  await ses.driver.executeScript(
    (punto) => {
      const visor = document.querySelector('[data-testid="visor"]');
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
      visor.dispatchEvent(new PointerEvent("pointerdown", opciones));
      window.dispatchEvent(new PointerEvent("pointerup", { ...opciones, buttons: 0 }));
    },
    punto,
  );
  await esperar(350);
}

async function proyectar(ses, x, y, z = 0) {
  const punto = await ses.driver.executeScript(
    (x, y, z) => {
      const visor = document.querySelector('[data-testid="visor"]');
      return visor?.__openrvtMundoAPantalla?.(x, y, z) ?? null;
    },
    x,
    y,
    z,
  );
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  return punto;
}

async function esperarHasta(fn, ms, mensaje) {
  const fin = Date.now() + ms;
  for (;;) {
    const valor = await fn();
    if (valor) return valor;
    if (Date.now() > fin) throw new Error(mensaje);
    await esperar(200);
  }
}

test("O051: niveles por teclado, sin 3 m automáticos, y Orbitar solo en 3D", async () => {
  const ses = await Sesion.abrir({
    prueba: "o051",
    tamano: { ancho: 1920, alto: 1000 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o051-"));
    const ruta = path.join(carpeta, "o051.ifc");
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        const visor = await ses.porTestid("visor");
        return (await visor.getAttribute("data-mallas")) !== null;
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no abrió el visor");
    const iniciales = await niveles(ses);
    assert.deepEqual(
      iniciales.map((n) => n.elevacion),
      [0],
      "el proyecto nuevo debe tener solo el nivel 0",
    );

    // El botón Orbitar no existe en planta.
    assert.equal(
      await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="visor-orbitar"]'),
      ),
      false,
      "Orbitar no debe aparecer en planta",
    );

    // 1. Comando Nivel: cuadro vacío, con el foco y sin crear nada.
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-nivel");
    await ses.porTestid("dialogo-nivel");
    const foco = await ses.driver.executeScript(() => {
      const campo = document.querySelector('[data-testid="nivel-dialogo-elevacion"]');
      return {
        vacio: campo?.value === "",
        enfocado: document.activeElement === campo,
      };
    });
    assert.deepEqual(foco, { vacio: true, enfocado: true }, "el campo nace vacío y con foco");
    await tecla(ses, Key.ENTER);
    assert.equal(
      (await niveles(ses)).length,
      1,
      "Enter con el campo vacío no debe crear nada",
    );
    assert.equal(
      await textoDom(ses, '[data-testid="nivel-dialogo-error"]'),
      "Escribe la elevación en metros.",
      "el vacío debe explicarse con un mensaje",
    );

    // 2. Secuencia de la spec: 2.20, +0.2, 3 y Esc.
    await escribir(ses, "2.20");
    await tecla(ses, Key.ENTER);
    await esperarHasta(
      async () => (await niveles(ses)).some((n) => Math.abs(n.elevacion - 2.2) < 1e-9),
      10_000,
      "no se creó el nivel a 2.20",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="nivel-dialogo-elevacion"]')?.value,
      ),
      "",
      "Enter debe limpiar el campo y dejar el cuadro abierto",
    );
    await escribir(ses, "+0.2");
    await tecla(ses, Key.ENTER);
    await esperarHasta(
      async () => (await niveles(ses)).some((n) => Math.abs(n.elevacion - 2.4) < 1e-9),
      10_000,
      "«+0.2» sobre 2.20 debe dar 2.40",
    );
    await escribir(ses, "3");
    await tecla(ses, Key.ENTER);
    await esperarHasta(
      async () => (await niveles(ses)).some((n) => Math.abs(n.elevacion - 3) < 1e-9),
      10_000,
      "no se creó el nivel a 3.00",
    );
    await tecla(ses, Key.ESCAPE);
    assert.equal(
      await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="dialogo-nivel"]'),
      ),
      false,
      "Esc debe cerrar el cuadro",
    );

    const creados = await niveles(ses);
    const elevaciones = creados.map((n) => n.elevacion).sort((a, b) => a - b);
    assert.deepEqual(
      elevaciones,
      [0, 2.2, 2.4, 3],
      "las elevaciones deben ser exactamente 0, 2.20, 2.40 y 3.00; ninguna a +3 automáticos",
    );
    const plantas = (await vistas(ses)).filter((v) => v.tipo === "planta");
    assert.equal(plantas.length, 4, "cada nivel debe tener su planta");
    await ses.captura(path.join(CAPTURAS, "o051-niveles-creados.png"));

    // 3. Duplicado: mensaje y ningún nivel nuevo.
    await activar(ses, "cmd-nivel");
    await ses.porTestid("dialogo-nivel");
    await escribir(ses, "2.20");
    await tecla(ses, Key.ENTER);
    await esperarHasta(
      async () => (await textoDom(ses, '[data-testid="nivel-dialogo-error"]'))?.includes("Nivel 1"),
      5_000,
      "el duplicado debe explicar qué nivel ocupa la elevación",
    );
    assert.equal((await niveles(ses)).length, 4, "2.20 repetido no debe crear nada");
    await tecla(ses, Key.ESCAPE);

    // 4. Copiar y arreglo: campos vacíos y obligatorios; no avanzan.
    await irModulo(ses, "niveles");
    const nivelCero = (await niveles(ses)).find((n) => Math.abs(n.elevacion) < 1e-9);
    assert.ok(nivelCero, "falta el nivel 0");
    await fijarValor(ses, "nivel-copiar-base", nivelCero.globalid);
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="nivel-copiar-desfase"]')?.value,
      ),
      "",
      "el desfase al copiar debe arrancar vacío",
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="nivel-arreglo-separacion"]')?.value,
      ),
      "",
      "la separación del arreglo debe arrancar vacía",
    );
    await activar(ses, "nivel-copiar");
    assert.equal(
      await textoDom(ses, '[data-testid="nivel-copiar-error"]'),
      "El desfase debe ser un número distinto de cero.",
      "copiar sin desfase debe avisar y no crear",
    );
    assert.equal((await niveles(ses)).length, 4, "copiar con el desfase vacío no crea niveles");
    await activar(ses, "nivel-arreglo");
    assert.equal(
      await textoDom(ses, '[data-testid="nivel-copiar-error"]'),
      "La separación debe ser un número distinto de cero.",
      "el arreglo sin separación debe avisar y no crear",
    );
    assert.equal((await niveles(ses)).length, 4, "el arreglo con la separación vacía no crea niveles");
    await ses.captura(path.join(CAPTURAS, "o051-tabla-niveles.png"));

    // 5. Flujo completo: guardar, reabrir y comprobar que los niveles persisten.
    await irModulo(ses, "modelo");
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o051.ifc",
      30_000,
      "no se guardó el modelo",
    );
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => {
        const info = await invocar(ses, "proyecto.info");
        return info.ruta === ruta;
      },
      30_000,
      "el modelo no se reabrió desde el archivo guardado",
    );
    await ses.driver.wait(
      async () => {
        const trasAbrir = await niveles(ses);
        return trasAbrir.map((n) => n.elevacion).sort((a, b) => a - b).join(",") === "0,2.2,2.4,3";
      },
      30_000,
      "los niveles no sobrevivieron a guardar y reabrir",
    );

    // 6. Una pared para probar que el clic sin arrastre selecciona en 3D.
    await elegirVista(ses, "Planta Nivel 0");
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-muro");
    const antesMuro = (await invocar(ses, "modelo.elementos")).length;
    await clicPantalla(ses, await proyectar(ses, 0, 0, 0));
    await clicPantalla(ses, await proyectar(ses, 4, 0, 0));
    await esperarHasta(
      async () => (await invocar(ses, "modelo.elementos")).length === antesMuro + 1,
      15_000,
      "no se creó la pared de prueba",
    );
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="herramienta-cancelar"]')?.click();
    });
    await esperar(500);

    // 7. En alzado tampoco aparece Orbitar; en 3D sí.
    await elegirVista(ses, "Alzado Norte");
    assert.equal(
      await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="visor-orbitar"]'),
      ),
      false,
      "Orbitar no debe aparecer en alzado",
    );
    await elegirVista(ses, "3D Perspectiva");
    await ses.q('[data-testid="visor"] canvas');
    await esperar(600);
    await ses.porTestid("visor-orbitar");

    // 8. Encendido orbita con el botón izquierdo; apagado no.
    await activar(ses, "visor-orbitar");
    assert.equal(
      await ses.driver.executeScript(() =>
        document.querySelector('[data-testid="visor-orbitar"]')?.getAttribute("aria-pressed"),
      ),
      "true",
      "encendido debe verse resaltado (aria-pressed)",
    );
    assert.equal(
      await ses.driver.executeScript(() => localStorage.getItem("openrvt.orbitar")),
      "1",
      "el conmutador debe guardarse",
    );
    const antesOrbita = await camara(ses);
    await arrastrar(ses, 0);
    const trasOrbita = await camara(ses);
    assert.ok(
      distancia(trasOrbita.direccion, antesOrbita.direccion) > 1e-3,
      `encendido, el arrastre izquierdo debe orbitar: ${antesOrbita.direccion} → ${trasOrbita.direccion}`,
    );
    await ses.captura(path.join(CAPTURAS, "o051-orbitar-3d.png"));

    await activar(ses, "visor-orbitar");
    const antesApagado = await camara(ses);
    await arrastrar(ses, 0);
    const trasApagado = await camara(ses);
    assert.deepEqual(
      trasApagado.direccion,
      antesApagado.direccion,
      "apagado, el arrastre izquierdo no debe mover la cámara",
    );

    // 9. Al ir a planta y volver, el estado encendido se conserva.
    await activar(ses, "visor-orbitar");
    await elegirVista(ses, "Planta Nivel 0");
    assert.equal(
      await ses.driver.executeScript(
        () => !!document.querySelector('[data-testid="visor-orbitar"]'),
      ),
      false,
      "en planta no debe mostrarse el conmutador",
    );
    await elegirVista(ses, "3D Perspectiva");
    assert.equal(
      await ses.driver.executeScript(() =>
        document.querySelector('[data-testid="visor-orbitar"]')?.getAttribute("aria-pressed"),
      ),
      "true",
      "al volver a 3D debe conservar el estado encendido",
    );

    // 10. Con Empujar/Tirar activo, el arrastre izquierdo sigue orbitando.
    await activar(ses, "cmd-empujar");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.herramienta,
      ),
      "empujar",
      "Empujar/Tirar debe quedar activo",
    );
    const antesEmpujar = await camara(ses);
    await arrastrar(ses, 0, { x: 760, y: 430, dx: 70, dy: -40 });
    const trasEmpujar = await camara(ses);
    assert.ok(
      distancia(trasEmpujar.direccion, antesEmpujar.direccion) > 1e-3,
      `con Empujar/Tirar activo el arrastre izquierdo debe orbitar: ${antesEmpujar.direccion} → ${trasEmpujar.direccion}`,
    );
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="herramienta-cancelar"]')?.click();
    });
    await esperar(400);

    // 11. Clic sin arrastre: sigue seleccionando (no dispara Empujar).
    assert.equal(
      await ses.driver.executeScript(() =>
        document.querySelector('[data-testid="visor-orbitar"]')?.getAttribute("aria-pressed"),
      ),
      "true",
      "Orbitar debe seguir encendido para probar el clic",
    );
    const puntoMuro = await proyectar(ses, 2, 0, 1.3);
    await clicPantalla(ses, puntoMuro);
    assert.ok(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.dataset.seleccion,
      ),
      "con Orbitar encendido, un clic sin arrastre debe seleccionar el elemento",
    );

    // 12. Panel fantasma: tras pasar por el botón Recortar/Extender y salir, no
    // debe quedar ningún panel de ayuda en el DOM.
    await elegirVista(ses, "Planta Nivel 0");
    await cambiarPestana(ses, "Modelar");
    const recorte = await ses.porTestid("cmd-recortar-extender");
    const caja = await recorte.getRect();
    await ses.driver
      .actions({ async: true })
      .move({ x: Math.round(caja.x + caja.width / 2), y: Math.round(caja.y + caja.height / 2) })
      .perform();
    await esperar(1500);
    await ses.driver.actions({ async: true }).move({ x: 700, y: 500 }).perform();
    await esperar(1200);
    assert.equal(
      await ses.driver.executeScript(() =>
        [...document.querySelectorAll("body *")].some((el) => {
          if (!(el instanceof HTMLElement)) return false;
          const caja = el.getBoundingClientRect();
          if (caja.width <= 0 || caja.height <= 0) return false;
          const estilo = getComputedStyle(el);
          if (estilo.visibility === "hidden" || estilo.display === "none") return false;
          return /Herramienta\s+Recortes?/i.test(el.textContent ?? "");
        }),
      ),
      false,
      "no debe quedar el panel «Herramienta Recortes» sobre la planta",
    );
    await ses.captura(path.join(CAPTURAS, "o051-sin-panel-fantasma.png"));
  } finally {
    await ses.cerrar();
  }
});
