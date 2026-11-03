// O041: cerramientos de verdad, con la INTERFAZ (clics, panel y Tab) sobre la app
// real de Tauri. Retícula 2×2 de muros dibujada con la herramienta Muro, castillos
// automáticos con su botón, cerramientos con un clic en cada muro, Tab para elegir
// uno y cambiar su nivel en Propiedades, Supr para borrar otro, y la zapata bajo la
// losa. Capturas en docs/progreso/O041/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O041");
const DIMENSION = { ancho: 1700, alto: 1000 };

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

function dimensionesPng(ruta) {
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  const ancho = cabecera.readUInt32BE(16);
  const alto = cabecera.readUInt32BE(20);
  assert.ok(ancho > 100 && alto > 100, `${ruta} mide ${ancho}×${alto}`);
  return { ancho, alto };
}

async function activar(ses, testid) {
  const ok = await ses.driver.executeScript((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, testid);
  assert.equal(ok, true, `no se pudo pulsar ${testid}`);
  await esperar(300);
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

/** Campo controlado del panel: escribe, confirma con Enter y sale del campo. */
async function fijarCampoPanel(ses, testid, valor) {
  await ses.driver.executeScript(
    (testid, valor) => {
      const el = document.querySelector(`[data-testid="${testid}"]`);
      if (!el) throw new Error(`falta ${testid}`);
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
      el.blur();
    },
    testid,
    valor,
  );
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
    15_000,
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

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) =>
      document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
  );
}

async function moverMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  assert.ok(punto, `no se pudo proyectar (${x}, ${y}, ${z})`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: -1,
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
  await esperar(250);
  return punto;
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
  await esperar(350);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicEn(ses, await proyectar(ses, x, y, z));
}

async function tecla(ses, key, code = key) {
  await ses.driver.executeScript(
    (key, code) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }),
      );
    },
    key,
    code,
  );
  await esperar(350);
}

async function nuevoModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await ses.q('[data-testid="visor"] canvas');
}

async function crearNivel(ses, nombre, elevacion) {
  const modulo = await ses.driver.wait(
    until.elementLocated(By.css('[data-modulo="niveles"]')),
    10_000,
  );
  await modulo.click();
  await esperar(400);
  await fijarValor(ses, "nivel-nuevo-nombre", nombre);
  await fijarValor(ses, "nivel-nuevo-elevacion", String(elevacion));
  await activar(ses, "nivel-agregar");
  await esperar(800);
  await (
    await ses.driver.wait(until.elementLocated(By.css('[data-modulo="modelo"]')), 10_000)
  ).click();
  await esperar(400);
}

async function dibujarMuro(ses, x1, y1, x2, y2) {
  await activar(ses, "cmd-muro");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(350);
}

async function teselado(ses) {
  return (await invocar(ses, "geometria.teselar", { globalids: null })).elementos;
}

async function esperarSeleccion(ses, aliasEsperado) {
  return ses.driver.wait(
    async () => {
      const actual = await ses.driver.executeScript(
        () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
      );
      if (!actual) return false;
      const props = await invocar(ses, "modelo.propiedades", { globalid: actual });
      return props.alias === aliasEsperado ? actual : false;
    },
    15_000,
    `Tab no seleccionó un ${aliasEsperado}`,
  );
}

async function tabHasta(ses, aliasEsperado) {
  const vistos = [];
  for (let i = 0; i < 8; i += 1) {
    await tecla(ses, "Tab", "Tab");
    const gid = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
    );
    if (!gid) {
      vistos.push("(nada)");
      continue;
    }
    const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
    vistos.push(props.alias ?? props.clase);
    if (props.alias === aliasEsperado) return gid;
  }
  assert.fail(`Tab no llegó a ${aliasEsperado}; pasó por ${vistos.join(" → ")}`);
}

async function alturaMuro(ses, gid) {
  const props = await invocar(ses, "modelo.propiedades", { globalid: gid });
  return Number(props.psets?.OPENRVT_Muro?.Altura ?? NaN);
}

async function esperarAltura(ses, gid, esperado) {
  await ses.driver.wait(
    async () => Math.abs((await alturaMuro(ses, gid)) - esperado) < 1e-6,
    15_000,
    `el muro ${gid} no llegó a ${esperado} m`,
  );
}

test("O041: cerramientos con clics, Tab, panel, Supr y la losa sobre el dado", async () => {
  const ses = await Sesion.abrir({
    prueba: "o041",
    tamano: DIMENSION,
    lateralExpandido: true,
    compositar: true,
  });
  try {
    fs.mkdirSync(CAPTURAS, { recursive: true });
    await nuevoModelo(ses);
    await crearNivel(ses, "Nivel 1", 2.6);
    await cambiarPestana(ses, "Modelar");
    await elegirVista(ses, "Planta Nivel 0");

    // 1. Retícula 2×2 de cuartos (8 × 6 m) dibujada con la herramienta Muro:
    //    tres muros horizontales y tres verticales.
    for (const [x1, y1, x2, y2] of [
      [0, 0, 8, 0],
      [0, 3, 8, 3],
      [0, 6, 8, 6],
      [0, 0, 0, 6],
      [4, 0, 4, 6],
      [8, 0, 8, 6],
    ]) {
      await dibujarMuro(ses, x1, y1, x2, y2);
    }
    await activar(ses, "visor-ajustar");
    await esperar(700);
    let elementos = await teselado(ses);
    const muros = elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(muros.length, 6, `se dibujaron ${muros.length} muros`);

    // 2. Castillos automáticos con su botón; en la retícula 2×2 son 15 y deben
    //    tardar menos de 3 s (meta de la spec con holgura).
    await activar(ses, "cmd-castillos-automaticos");
    await ses.porTestid("dialogo-castillos");
    const inicio = Date.now();
    await activar(ses, "castillos-aceptar");
    await ses.driver.wait(
      async () =>
        (await ses.driver.findElements(By.css('[data-testid="dialogo-castillos"]'))).length === 0,
      20_000,
      "el diálogo de castillos no se cerró",
    );
    const segundos = (Date.now() - inicio) / 1000;
    elementos = await teselado(ses);
    const castillos = elementos.filter((e) => e.estructura?.alias === "castillo");
    assert.equal(castillos.length, 15, `castillos: ${castillos.length}`);
    assert.ok(segundos < 3, `los castillos tardaron ${segundos.toFixed(2)} s`);

    // 3. Herramienta Cerramiento: se dibuja como un muro, con inicio y fin sobre
    //    cada muro de la retícula (O045: ya no es «un clic = todo el muro»).
    for (const [x1, y1, x2, y2] of [
      [0, 0, 8, 0],
      [0, 3, 8, 3],
      [0, 6, 8, 6],
      [0, 0, 0, 6],
      [4, 0, 4, 6],
      [8, 0, 8, 6],
    ]) {
      await activar(ses, "cmd-cerramiento");
      await clicMundo(ses, x1, y1);
      await clicMundo(ses, x2, y2);
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
    }
    elementos = await teselado(ses);
    assert.equal(
      elementos.filter((e) => e.estructura?.alias === "cerramiento").length,
      6,
      "no se crearon los seis cerramientos",
    );

    // 4. Tab en planta sobre el muro de y = 0: primero el muro y después su
    //    cerramiento. Se cambia el nivel a Nivel 1 − 0.20; O045: el muro conserva
    //    su altura porque el cerramiento va embebido.
    const puntoTab = await moverMundo(ses, 2, 0);
    const candidatos = await ses.driver.executeScript(
      (p) => document.querySelector('[data-testid="visor"]').__openrvtCandidatosTab(p.x, p.y),
      puntoTab,
    );
    assert.ok(
      candidatos && candidatos.length >= 2,
      `Tab no ve muro y cerramiento bajo el cursor: ${JSON.stringify(candidatos)}`,
    );
    const cerramiento = await tabHasta(ses, "cerramiento");
    const pista = await textoDom(ses, '[data-testid="estado-pista-tab"]');
    assert.match(pista ?? "", /Tab: siguiente \(Cerramiento /, `pista: ${pista}`);
    const propsCer = await invocar(ses, "modelo.propiedades", { globalid: cerramiento });
    // Tras Tab muro → cerramiento, el campo Nombre debe ser el del cerramiento, no el del muro.
    const nombrePanel = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="elemento-nombre"]')?.value,
    );
    assert.equal(nombrePanel, propsCer.nombre, "el campo Nombre quedó con el del muro");
    const muroLiga = propsCer.muro_liga?.muro;
    assert.ok(muroLiga, "el cerramiento no está ligado a un muro");
    assert.ok(Math.abs((await alturaMuro(ses, muroLiga)) - 2.6) < 1e-6, "altura inicial del muro");
    const nivel1 = (await invocar(ses, "modelo.niveles")).find((n) => n.nombre === "Nivel 1");
    assert.ok(nivel1, "no existe Nivel 1");
    await fijarValor(ses, "restriccion-base", nivel1.globalid);
    await esperar(500);
    await fijarCampoPanel(ses, "desfase-base", "-0.20");
    assert.ok(
      Math.abs((await alturaMuro(ses, muroLiga)) - 2.6) < 1e-6,
      "O045: el muro no debe cambiar de altura al mover el cerramiento",
    );
    assert.ok(
      Math.abs(
        (await invocar(ses, "modelo.propiedades", { globalid: cerramiento })).restricciones
          .DesfaseBase + 0.2,
      ) < 1e-6,
      "el desfase guardado no es −0.20",
    );

    // 5. Supr sobre otro cerramiento (muro de x = 0): se borra y el muro queda.
    await moverMundo(ses, 0, 1.5);
    const aBorrar = await tabHasta(ses, "cerramiento");
    assert.notEqual(aBorrar, cerramiento);
    await tecla(ses, "Delete", "Delete");
    await ses.driver.wait(async () => {
      const lista = await teselado(ses);
      return !lista.some((e) => e.globalid === aBorrar);
    }, 15_000, "Supr no borró el cerramiento");
    elementos = await teselado(ses);
    assert.equal(
      elementos.filter((e) => e.estructura?.alias === "cerramiento").length,
      5,
      "deberían quedar cinco cerramientos",
    );
    assert.equal(elementos.filter((e) => e.clase === "IfcWall").length, 6, "se perdió un muro");

    // 6. Zapata con losa encima: la losa conserva su volumen (2 × 2 × 0.10 = 0.40).
    const nivel0 = (await invocar(ses, "modelo.niveles"))[0].globalid;
    await invocar(ses, "zapatas.crear", {
      tipo: "Z-1 Zapata 1.20×1.20",
      nivel: nivel0,
      x: 20,
      y: 0,
      desplante: 1.0,
    });
    const losa = (
      await invocar(ses, "losas.crear", {
        nivel: nivel0,
        puntos: [
          [19, -1],
          [21, -1],
          [21, 1],
          [19, 1],
        ],
        espesor: 0.10,
      })
    ).creados[0];
    // Las creaciones por comando se recargan con deshacer/rehacer, como en O012b.
    await activar(ses, "cmd-deshacer");
    await esperar(600);
    await activar(ses, "cmd-rehacer");
    await esperar(1000);
    const cantidades = await invocar(ses, "cantidades.estructura", {});
    const infoLosa = cantidades.elementos.find((e) => e.globalid === losa);
    assert.ok(infoLosa, "la losa no aparece en cantidades");
    assert.ok(
      Math.abs(infoLosa.volumen_neto_m3 - 0.4) < 1e-6,
      `la losa perdió volumen por el dado: ${infoLosa.volumen_neto_m3}`,
    );

    // 7. Capturas: planta, alzado y 3D con y sin selección.
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(700);
    await ses.captura(path.join(CAPTURAS, "planta-sin-seleccion.png"));

    await moverMundo(ses, 2, 0);
    await tabHasta(ses, "cerramiento");
    await ses.captura(path.join(CAPTURAS, "planta-seleccion.png"));

    await elegirVista(ses, "Alzado Sur");
    await esperar(700);
    await ses.captura(path.join(CAPTURAS, "alzado-seleccion.png"));
    await tecla(ses, "Escape", "Escape");
    await esperar(300);
    await ses.captura(path.join(CAPTURAS, "alzado-sin-seleccion.png"));

    await elegirVista(ses, "3D Isométrica");
    await esperar(900);
    await ses.captura(path.join(CAPTURAS, "3d-sin-seleccion.png"));
    const cerramiento3d = (await teselado(ses)).find((e) => {
      if (e.estructura?.alias !== "cerramiento") return false;
      const d = e.estructura.datos ?? {};
      return (
        Math.abs(Number(d.X1)) < 1e-9 &&
        Math.abs(Number(d.Y1) - 6) < 1e-9 &&
        Math.abs(Number(d.X2) - 8) < 1e-9 &&
        Math.abs(Number(d.Y2) - 6) < 1e-9
      );
    });
    assert.ok(cerramiento3d, "no se encontró el cerramiento del muro y = 6");
    const punto3d = await moverMundo(ses, 2, 6, 2.5);
    // El punto medio proyectado puede caer en un borde; se busca el píxel real
    // del cerramiento con el rayo de la propia vista y se hace clic allí.
    const pixel = await ses.driver.executeScript(
      (p, gid) => {
        const visor = document.querySelector('[data-testid="visor"]');
        const vistos = {};
        for (let dy = -40; dy <= 40; dy += 5) {
          for (let dx = -40; dx <= 40; dx += 5) {
            const impacto = visor.__openrvtImpactoEn(p.x + dx, p.y + dy);
            if (impacto === gid) return { x: p.x + dx, y: p.y + dy };
            if (impacto) vistos[impacto] = (vistos[impacto] ?? 0) + 1;
          }
        }
        return { diagnostico: vistos };
      },
      punto3d,
      cerramiento3d.globalid,
    );
    assert.ok(
      pixel && Number.isFinite(pixel.x),
      `el cerramiento no aparece en la vista 3D: ${JSON.stringify(pixel)} en ${JSON.stringify(punto3d)}`,
    );
    await clicEn(ses, pixel);
    const seleccion3d = await ses.driver.wait(
      async () =>
        (await ses.driver.executeScript(
          () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion"),
        )) || false,
      8_000,
      "el clic en 3D no seleccionó el cerramiento",
    );
    const props3d = await invocar(ses, "modelo.propiedades", { globalid: seleccion3d });
    assert.equal(props3d.alias, "cerramiento", `en 3D se seleccionó ${props3d.alias}`);
    await ses.captura(path.join(CAPTURAS, "3d-seleccion.png"));

    for (const nombre of [
      "planta-sin-seleccion.png",
      "planta-seleccion.png",
      "alzado-seleccion.png",
      "alzado-sin-seleccion.png",
      "3d-sin-seleccion.png",
      "3d-seleccion.png",
    ]) {
      dimensionesPng(path.join(CAPTURAS, nombre));
    }
  } finally {
    await ses.cerrar();
  }
});
