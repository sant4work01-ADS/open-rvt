// O049: empujar/tirar con inferencias 3D reales (Tauri + WebKitGTK).
// Cálculos a mano:
//   losa 5 × 4 × 0.12 → su cara superior está en z = 0.12;
//   muro 4 × 0.15 × 2.6 sobre esa cara → base z = 0.12 y tope z = 2.72;
//   punto medio del borde de 5 m en y = 4 → (2.5, 4, 0.12).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O049");
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

async function esperarBarra(ses, cantidad, ms = 15_000) {
  await ses.driver.wait(async () => {
    const texto = await textoDom(ses, '[data-testid="estado-elementos"]');
    return texto === `${cantidad} elementos`;
  }, ms, `la barra de estado no muestra ${cantidad} elementos`);
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

async function moverPantalla(ses, punto, shiftKey = false) {
  await ses.driver.executeScript(
    (punto, shiftKey) => {
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
          shiftKey,
        }),
      );
    },
    punto,
    shiftKey,
  );
  await esperar(160);
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
  await esperar(350);
}

async function clicMundo(ses, x, y, z = 0) {
  await clicPantalla(ses, await proyectar(ses, x, y, z));
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
    key === "ArrowRight" ? "ArrowRight" :
    key === "ArrowLeft" ? "ArrowLeft" :
    key === "ArrowUp" ? "ArrowUp" :
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
  await esperar(60);
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

async function estadoEmpujar(ses) {
  return ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]').__openrvtEmpujar(),
  );
}

async function inferenciaEmpujar(ses) {
  return ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]').__openrvtEmpujarInferencia(),
  );
}

async function minZDe(ses, globalid) {
  const teselado = await invocar(ses, "geometria.teselar", { globalids: [globalid] });
  const elemento = teselado.elementos.find((e) => e.globalid === globalid);
  assert.ok(elemento, `no se teseló ${globalid}`);
  const bytes = Buffer.from(elemento.vertices, "base64");
  const vertices = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  let minZ = Infinity;
  for (let i = 2; i < vertices.length; i += 3) minZ = Math.min(minZ, vertices[i]);
  return minZ;
}

function desplazar(punto, dx, dy) {
  return { x: punto.x + dx, y: punto.y + dy };
}

test("O049: empujar con inferencias, dibujo en cara y bloqueo de eje", async () => {
  const ses = await Sesion.abrir({
    prueba: "o049",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    await elegirVista(ses, "3D Perspectiva");
    await ajustarVista(ses);
    await activar(ses, "cmd-empujar");

    // Referencia fija para comprobar que la cámara no salta al crear.
    const fijoAntes = await proyectar(ses, 0, 0, 0);

    // 1) Losa 5 × 4 × 0.12 tecleada: área 20 m².
    await clicMundo(ses, 0, 0);
    await moverMundo(ses, 1, 1);
    await teclearYEnter(ses, "5,4");
    await teclearYEnter(ses, "0.12");
    await esperarClase(ses, "IfcSlab", 1);
    assert.equal(
      await (await ses.porTestid("barra-herramienta")).getAttribute("data-herramienta"),
      "empujar",
      "la herramienta debe seguir activa tras crear la losa",
    );
    const losa = (await elementos(ses)).find((e) => e.clase === "IfcSlab");
    const propsLosa = await invocar(ses, "modelo.propiedades", { globalid: losa.globalid });
    assert.equal(propsLosa.psets.OPENRVT_Losa.Area, 20);
    assert.equal(propsLosa.psets.OPENRVT_Losa.Espesor, 0.12);
    await esperarBarra(ses, (await elementos(ses)).length);

    const fijoDespues = await proyectar(ses, 0, 0, 0);
    assert.ok(
      Math.hypot(fijoDespues.x - fijoAntes.x, fijoDespues.y - fijoAntes.y) <= 1,
      "la cámara saltó al crear la losa",
    );
    // Encuadre explícito (el usuario pulsaría Ajustar): con la cámara inicial la
    // losa se sale por la derecha del visor y los marcadores quedan ocultos.
    await ses.driver.executeScript(() =>
      document.querySelector('button[title^="Ajustar la vista"]').click(),
    );
    await esperar(400);

    // 2) Cursor a 5 px de la esquina superior (0,0,0.12), por fuera de la losa:
    //    debe ganar el extremo exacto de la malla, no el corte del plano. La
    //    dirección se toma alejándose del centro de la losa para no acercarse
    //    al vértice inferior (0,0,0), que en perspectiva cae a pocos píxeles.
    const esquina = await proyectar(ses, 0, 0, 0.12);
    const centroPantalla = await proyectar(ses, 2.5, 2, 0.12);
    const largo = Math.hypot(
      centroPantalla.x - esquina.x,
      centroPantalla.y - esquina.y,
    );
    const objetivo = desplazar(
      esquina,
      ((esquina.x - centroPantalla.x) / largo) * 5,
      ((esquina.y - centroPantalla.y) / largo) * 5,
    );
    await moverPantalla(ses, objetivo);
    const inferenciaEsquina = await inferenciaEmpujar(ses);
    assert.equal(inferenciaEsquina.tipo, "extremo");
    assert.deepEqual(inferenciaEsquina.punto, { x: 0, y: 0, z: 0.12 });
    const marcador = await ses.porTestid("empujar-marcador");
    assert.equal(await marcador.getAttribute("data-tipo"), "extremo");
    assert.equal(await (await ses.porTestid("empujar-tooltip")).getText(), "Extremo");
    await ses.captura(path.join(PROGRESO, "marcador-extremo.png"));
    await clicPantalla(ses, objetivo);
    await esperar(200);
    const trasPrimerClic = await estadoEmpujar(ses);
    assert.equal(trasPrimerClic.z, 0.12);
    assert.deepEqual(trasPrimerClic.puntos[0], [0, 0]);
    await tecla(ses, "Escape");
    await esperar(150);

    // 3) Muro 4 × 0.15 × 2.6 sobre la cara: base z = 0.12, tope z = 2.72.
    //    Se dibuja sobre el borde lejano (y = 4) para no tapar el punto medio
    //    del borde cercano que se comprueba después.
    await clicMundo(ses, 0, 4, 0.12);
    await moverMundo(ses, 2, 3, 0.12);
    await teclearYEnter(ses, "4,0.15");
    await teclearYEnter(ses, "2.6");
    await esperarClase(ses, "IfcWall", 1);
    const muro = (await elementos(ses)).find((e) => e.clase === "IfcWall");
    const propsMuro = await invocar(ses, "modelo.propiedades", { globalid: muro.globalid });
    assert.equal(propsMuro.psets.OPENRVT_Muro.Longitud, 4);
    assert.equal(propsMuro.psets.OPENRVT_Muro.Altura, 2.6);
    assert.equal(propsMuro.restricciones.DesfaseBase, 0.12);
    assert.ok(Math.abs((await minZDe(ses, muro.globalid)) - 0.12) < 1e-5);
    {
      const tes = await invocar(ses, "geometria.teselar", { globalids: [muro.globalid] });
      const el = tes.elementos.find((e) => e.globalid === muro.globalid);
      const bytes = Buffer.from(el.vertices, "base64");
      const verts = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
      for (let i = 0; i < verts.length; i += 3) {
        mnX = Math.min(mnX, verts[i]); mxX = Math.max(mxX, verts[i]);
        mnY = Math.min(mnY, verts[i + 1]); mxY = Math.max(mxY, verts[i + 1]);
      }
    }
    await esperarBarra(ses, (await elementos(ses)).length);
    assert.equal((await elementos(ses)).length, 2);

    // 4) Punto medio del borde de 5 m en y = 0 → (2.5, 0, 0.12). El cursor se
    //    pone 5 px por fuera del borde para que ninguna cara tape el candidato;
    //    el punto medio sigue dentro de la tolerancia de 10 px.
    const medioMundo = { x: 2.5, y: 0, z: 0.12 };
    const medioPantalla = await proyectar(ses, medioMundo.x, medioMundo.y, medioMundo.z);
    const centroLosa = await proyectar(ses, 2.5, 2, 0.12);
    const largoMedio = Math.hypot(
      centroLosa.x - medioPantalla.x,
      centroLosa.y - medioPantalla.y,
    );
    const medioObjetivo = desplazar(
      medioPantalla,
      ((medioPantalla.x - centroLosa.x) / largoMedio) * 5,
      ((medioPantalla.y - centroLosa.y) / largoMedio) * 5,
    );
    await moverPantalla(ses, medioObjetivo);
    const inferenciaMedio = await inferenciaEmpujar(ses);
    assert.equal(inferenciaMedio.tipo, "medio");
    assert.deepEqual(inferenciaMedio.punto, { x: 2.5, y: 0, z: 0.12 });
    assert.equal(
      await (await ses.porTestid("empujar-marcador")).getAttribute("data-tipo"),
      "medio",
    );
    await ses.captura(path.join(PROGRESO, "marcador-medio.png"));
    await clicPantalla(ses, medioObjetivo);
    await esperar(150);
    assert.equal((await estadoEmpujar(ses)).z, 0.12);
    await tecla(ses, "Escape");
    await esperar(200);

    // 5) Shift congela el eje X: el segundo punto conserva y y z del primero.
    const primeroEje = await proyectar(ses, 2.5, 2, 0.12);
    await moverPantalla(ses, primeroEje);
    await clicPantalla(ses, primeroEje);
    await esperar(200);
    assert.equal((await estadoEmpujar(ses)).z, 0.12);
    // Cerca del eje X se adquiere el bloqueo; después se mueve lejos con Shift,
    // fuera de la losa para que ninguna cara tape el punto del eje.
    await moverPantalla(ses, await proyectar(ses, 3.5, 2, 0.12), true);
    await moverPantalla(ses, await proyectar(ses, 3.5, 3.5, 0.12), true);
    const inferenciaEje = await inferenciaEmpujar(ses);
    assert.equal(inferenciaEje.tipo, "eje_x");
    // El eje conserva la y y la z del primer punto; la x depende del rayo.
    assert.equal(inferenciaEje.punto.y, 2);
    assert.equal(inferenciaEje.punto.z, 0.12);
    await ses.captura(path.join(PROGRESO, "bloqueo-eje.png"));
    // Se lee del DOM sin exigir visibilidad de Selenium: el marcador es un punto
    // de 9 px y la prueba de visibilidad del driver no es fiable con él.
    const eje = await ses.driver.executeScript(() => ({
      tipo: document.querySelector('[data-testid="empujar-marcador"]')?.getAttribute("data-tipo"),
      texto: document.querySelector('[data-testid="empujar-tooltip"]')?.textContent,
    }));
    assert.deepEqual(eje, { tipo: "eje_x", texto: "Eje X" });
    await tecla(ses, "Escape");
    await esperar(200);

    // 6) La misma flecha fija y suelta el eje X.
    await moverPantalla(ses, primeroEje);
    await clicPantalla(ses, primeroEje);
    await esperar(200);
    await tecla(ses, "ArrowRight");
    await moverPantalla(ses, await proyectar(ses, 4, 5, 0.12));
    const conFlecha = await inferenciaEmpujar(ses);
    assert.equal(conFlecha.tipo, "eje_x");
    assert.equal(conFlecha.punto.y, 2);
    assert.equal(conFlecha.punto.z, 0.12);
    await tecla(ses, "ArrowRight");
    await moverPantalla(ses, await proyectar(ses, 4, 3, 0.12));
    const sinFlecha = await inferenciaEmpujar(ses);
    assert.equal(sinFlecha.tipo, "sobre_cara");
    await tecla(ses, "Escape");
    await esperar(200);

    // 7) Genérico 1 × 1 × 1: la barra cuenta el proxy (el fallo de O046 era 4 vs 3).
    // Sobre la losa, lejos de esquinas y bordes, para quedar dentro del encuadre.
    await clicMundo(ses, 1, 1, 0.12);
    await moverMundo(ses, 2, 2, 0.12);
    await teclearYEnter(ses, "1,1");
    await teclearYEnter(ses, "1");
    await esperarClase(ses, "IfcBuildingElementProxy", 1);
    const total = (await elementos(ses)).length;
    assert.equal(total, 3);
    await esperarBarra(ses, total);
    assert.equal(await textoDom(ses, '[data-testid="estado-elementos"]'), "3 elementos");

    for (const nombre of [
      "marcador-extremo.png",
      "marcador-medio.png",
      "bloqueo-eje.png",
    ]) {
      assert.ok(fs.existsSync(path.join(PROGRESO, nombre)), `no se guardó ${nombre}`);
    }
  } finally {
    await ses.cerrar();
  }
});
