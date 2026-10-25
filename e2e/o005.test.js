// O005: estilos de dibujo con la app Tauri real. Abre FZK-Haus, comprueba la planta
// con líneas ocultas, rellenos y simbología, cambia el grosor de Muros a 0,70, guarda,
// reabre y verifica la persistencia. Toma las capturas de la entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const FZK = path.join(RAIZ, "muestras", "AC20-FZK-Haus.ifc");
const INSTITUTE = path.join(RAIZ, "muestras", "AC20-Institute-Var-2.ifc");

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

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(150);
}

async function descartarCambiosSiPregunta(ses) {
  for (let i = 0; i < 20; i += 1) {
    const dialogos = await ses.driver.findElements(
      By.css('[data-testid="dialogo-guardar-cambios"]'),
    );
    if (dialogos.length > 0) {
      const boton = await ses.driver.findElement(
        By.xpath('//button[normalize-space(.)="No guardar"]'),
      );
      await boton.click();
      await esperar(200);
      return;
    }
    await esperar(100);
  }
}

async function abrirIfc(ses, ruta) {
  const nombre = path.basename(ruta);
  await instalarDialogos(ses, { abrir: ruta });
  await activar(ses, "cmd-abrir");
  await descartarCambiosSiPregunta(ses);
  await ses.driver.wait(
    async () =>
      (await textoDom(ses, '[data-testid="estado-modelo"]')) === nombre &&
      (await (await ses.porTestid("visor")).getAttribute("data-mallas")) !== "0",
    30_000,
    `no abrió ${nombre}`,
  );
  await esperar(700);
}

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    15_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(500);
}

async function elegirPrimeraPlanta(ses) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`(//button[@data-testid="vista-item"][@data-tipo="planta"])[1]`),
    ),
    15_000,
    "no apareció ninguna planta",
  );
  await boton.click();
  await esperar(700);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
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
        window.dispatchEvent(new PointerEvent("pointerup", { ...opciones, buttons: 0 }));
      }
    },
    puntos,
  );
  await esperar(400);
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

/** Crea por RPC la casa de O003b y la guarda, para abrirla después como en O003b. */
async function crearCasaO003b(ses, ruta) {
  await invocar(ses, "proyecto.nuevo", { nombre: "Casa O003b" });
  const nivel = (await invocar(ses, "modelo.niveles"))[0].globalid;
  const muros = [];
  for (const [x1, y1, x2, y2] of [
    [0, 0, 8, 0],
    [8, 0, 8, 6],
    [8, 6, 0, 6],
    [0, 6, 0, 0],
  ]) {
    const creado = await invocar(ses, "muros.crear", {
      tipo: "Block 15",
      nivel,
      x1,
      y1,
      x2,
      y2,
      altura: 2.6,
      alineacion: "centro",
    });
    muros.push(creado.creados[0]);
  }
  await invocar(ses, "losas.desde_muros", { nivel, globalids: muros });
  await invocar(ses, "aberturas.crear", {
    clase: "IfcDoor",
    muro: muros[0],
    distancia: 1.0,
    ancho: 0.9,
    alto: 2.1,
    antepecho: 0,
  });
  await invocar(ses, "aberturas.crear", {
    clase: "IfcWindow",
    muro: muros[1],
    distancia: 1.0,
    ancho: 1.2,
    alto: 1.2,
    antepecho: 0.9,
  });
  const guardado = await invocar(ses, "proyecto.guardar", { ruta });
  assert.equal(guardado.ruta, ruta);
  assert.ok(fs.existsSync(ruta));
}

async function grosorMuros(ses) {
  return (await ses.porTestid("visor")).getAttribute("data-estilo-muros-corte");
}

test("O005: estilos, rellenos, simbología, persistencia y capturas", async () => {
  assert.ok(fs.existsSync(FZK), "falta la muestra AC20-FZK-Haus.ifc");
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o005-"));
  const casa = path.join(carpeta, "o005-casa.ifc");
  let ses = await Sesion.abrir({
    prueba: "o005",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    // 1. FZK-Haus: planta con líneas ocultas, sección, rellenos y volados.
    await abrirIfc(ses, FZK);
    assert.match(await textoDom(ses, '[data-testid="estado-modelo"]'), /^AC20-FZK-Haus\.ifc/);
    await elegirVista(ses, "Planta Erdgeschoss");
    const visor = await ses.porTestid("visor");
    assert.equal(await visor.getAttribute("data-estilo-vista"), "lineas-ocultas");
    assert.equal(await grosorMuros(ses), "0.5");
    const polilineas = Number(await visor.getAttribute("data-seccion-polilineas"));
    assert.ok(polilineas >= 5, `la planta de FZK solo generó ${polilineas} secciones`);
    assert.ok(
      Number(await visor.getAttribute("data-relleno-materiales")) >= 7,
      "faltan patrones de relleno",
    );
    const capturaFzk = path.join(CAPTURAS, "o005_planta_fzk.png");
    await ses.captura(capturaFzk);
    assert.deepEqual(dimensionesPng(capturaFzk), { ancho: 1600, alto: 900 });

    // 2. Corte y alzado de FZK con las nuevas plumillas.
    await cambiarPestana(ses, "Vista");
    await activar(ses, "cmd-nuevo-corte");
    await dosClicsEnPlanta(ses, [
      [0.3, 0.45],
      [0.7, 0.45],
    ]);
    await elegirVista(ses, "Corte 1");
    const capturaCorte = path.join(CAPTURAS, "o005_corte_fzk.png");
    await ses.captura(capturaCorte);
    assert.deepEqual(dimensionesPng(capturaCorte), { ancho: 1600, alto: 900 });
    await elegirVista(ses, "Alzado Sur");
    const capturaAlzado = path.join(CAPTURAS, "o005_alzado_fzk.png");
    await ses.captura(capturaAlzado);
    assert.deepEqual(dimensionesPng(capturaAlzado), { ancho: 1600, alto: 900 });

    // 3. Casa de O003b: rellenos por capa y puerta/ventana en planta.
    await crearCasaO003b(ses, casa);
    await cambiarPestana(ses, "Inicio");
    await instalarDialogos(ses, { abrir: casa });
    await activar(ses, "cmd-abrir");
    await descartarCambiosSiPregunta(ses);
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o005-casa.ifc",
      30_000,
      "no abrió la casa de O003b",
    );
    await elegirPrimeraPlanta(ses);
    await esperar(600);
    assert.ok(
      Number(await (await ses.porTestid("visor")).getAttribute("data-seccion-polilineas")) >= 4,
      "la casa no generó las secciones de sus muros",
    );
    // O005c: puerta y ventana se dibujan solo con su simbología 2D en planta.
    assert.equal(
      await (await ses.porTestid("visor")).getAttribute("data-mallas-dibujadas"),
      "5",
      "no deben dibujarse las mallas 3D de puerta y ventana en planta",
    );
    const capturaCasa = path.join(CAPTURAS, "o005_planta_casa.png");
    await ses.captura(capturaCasa);
    assert.deepEqual(dimensionesPng(capturaCasa), { ancho: 1600, alto: 900 });

    // 4. Cambia el grosor de corte de Muros a 0,70 desde el diálogo de estilos.
    await cambiarPestana(ses, "Vista");
    await activar(ses, "cmd-estilos");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="dialogo-estilos"]')),
      10_000,
      "no abrió el diálogo de estilos",
    );
    const corteMuros = await ses.driver.findElement(
      By.css('[data-testid="estilo-corte-muros"]'),
    );
    assert.equal(await corteMuros.getAttribute("value"), "0.5");
    await fijarValor(ses, "estilo-corte-muros", "0.7");
    const capturaEstilos = path.join(CAPTURAS, "o005_estilos.png");
    await ses.captura(capturaEstilos);
    assert.deepEqual(dimensionesPng(capturaEstilos), { ancho: 1600, alto: 900 });
    await activar(ses, "boton-guardar-estilos");
    await ses.driver.wait(
      async () => (await grosorMuros(ses)) === "0.7",
      10_000,
      "la vista no reflejó el grosor 0,70",
    );
    // La vista se redibuja dentro del presupuesto de la spec.
    const redibujo = Number(
      await (await ses.porTestid("visor")).getAttribute("data-redibujo-ms"),
    );
    assert.ok(redibujo < 300, `la planta de FZK tardó ${redibujo} ms en redibujarse`);
    console.log(`FZK-Haus redibujado en ${redibujo} ms tras cambiar el estilo`);

    // 5. Guarda, cierra, reabre y comprueba que el estilo persiste.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(600);
    await ses.cerrar();
    ses = await Sesion.abrir({
      prueba: "o005-reabrir",
      tamano: { ancho: 1600, alto: 900 },
      lateralExpandido: true,
      compositar: true,
    });
    await abrirIfc(ses, casa);
    await elegirPrimeraPlanta(ses);
    await ses.driver.wait(
      async () => (await grosorMuros(ses)) === "0.7",
      10_000,
      "el estilo 0,70 no persistió al reabrir",
    );
    const estilos = await invocar(ses, "estilos.leer");
    assert.equal(estilos.categorias.muros.corte, 0.7);
    assert.equal(estilos.categorias.muros.proyeccion, 0.18);

    // 6. Institute: la planta se redibuja en menos de 1,5 s.
    await abrirIfc(ses, INSTITUTE);
    await elegirPrimeraPlanta(ses);
    const iteracion = Number(
      await (await ses.porTestid("visor")).getAttribute("data-redibujo"),
    );
    await fijarValor(ses, "vista-estilo-muros-proyeccion", "0.2");
    await ses.driver.wait(
      async () =>
        Number(await (await ses.porTestid("visor")).getAttribute("data-redibujo")) > iteracion,
      15_000,
      "Institute no terminó de redibujar",
    );
    const redibujoInstitute = Number(
      await (await ses.porTestid("visor")).getAttribute("data-redibujo-ms"),
    );
    assert.ok(
      redibujoInstitute < 1500,
      `la planta de Institute tardó ${redibujoInstitute} ms en redibujarse`,
    );
    console.log(`Institute redibujado en ${redibujoInstitute} ms tras cambiar el estilo`);
  } finally {
    if (ses) await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
