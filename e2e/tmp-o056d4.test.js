// O056: empujar caras de elementos existentes con clics y arrastres reales.
// Medidas calculadas a mano:
//   muro 4.00 × 0.15 × 2.60, +0.40 arriba → 3.00 m (volumen 1.800 m³);
//   su extremo este +1.00 → 5.00 m, con el castillo de 2.00 m quieto;
//   losa 4 × 3, lado este +0.50 → 4.5 × 3 = 13.50 m²;
//   columna 0.30 × 0.30, +0.40 → 3.00 m;
//   genérico 1 × 1 × 1, cara +X +0.25 → 1.25 m³;
//   muro de 2.60 bajo una losa con cara inferior en 2.72 → sube 0.12.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O056");
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

function casi(actual, esperado, mensaje = "") {
  assert.ok(
    Math.abs(Number(actual) - Number(esperado)) <= 1e-9,
    `${mensaje} ${actual} !== ${esperado}`,
  );
}

async function propiedades(ses, globalid) {
  return invocar(ses, "modelo.propiedades", { globalid });
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

async function moverPantalla(ses, punto) {
  await ses.driver.executeScript(
    (punto) => {
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
        }),
      );
    },
    punto,
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
  await esperar(300);
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
  await esperar(50);
}

async function teclear(ses, texto) {
  for (const caracter of texto) await tecla(ses, caracter);
}

async function teclearYEnter(ses, texto) {
  await teclear(ses, texto);
  await tecla(ses, "Enter");
  await esperar(500);
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
  await esperar(600);
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

async function hoverCara(ses, x, y, z) {
  await moverMundo(ses, x, y, z);
  const tooltip = await ses.porTestid("empujar-cara-tooltip");
  return tooltip.getText();
}

async function empujarCaraTecleado(ses, punto, texto) {
  await moverPantalla(ses, punto);
  await clicPantalla(ses, punto);
  const estado = await estadoEmpujar(ses);
  assert.ok(estado.cara, "el clic sobre la cara no abrió el empuje");
  await teclearYEnter(ses, texto);
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

test("O056: empujar caras de muro, losa, columna y genérico; enganche, Esc, deshacer y reabrir", async () => {
  const rutaIfc = path.join(os.tmpdir(), `o056-${Date.now()}.ifc`);
  const ses = await Sesion.abrir({
    prueba: "o056",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await invocar(ses, "proyecto.nuevo", { nombre: "O056 E2E" });
    const nivel = (await invocar(ses, "modelo.niveles"))[0].globalid;

    // Muro con un castillo intermedio, losa, columna, genérico y el par
    // muro/losa para el enganche a la cara inferior.
    const muro = (
      await invocar(ses, "muros.crear", {
        tipo: "Block 15",
        nivel,
        x1: 0,
        y1: 0,
        x2: 4,
        y2: 0,
        altura: 2.6,
      })
    ).creados[0];
    const castillo = (
      await invocar(ses, "castillos.crear_en_muro", {
        tipo: "K-1 Castillo 15×15",
        muro,
        distancia: 2.0,
      })
    ).creados[0];
    const losa = (
      await invocar(ses, "losas.crear", {
        nivel,
        puntos: [[6, 0], [10, 0], [10, 3], [6, 3]],
        espesor: 0.12,
        desfase: 0.12,
      })
    ).creados[0];
    const columna = (
      await invocar(ses, "columnas.crear", {
        tipo: "C-1 Columna 30×30",
        nivel,
        x: 12,
        y: 0,
        altura: 2.6,
      })
    ).creados[0];
    const generico = (
      await invocar(ses, "genericos.crear", {
        nivel,
        puntos: [[14, 0], [15, 0], [15, 1], [14, 1]],
        altura: 1.0,
      })
    ).creados[0];
    const muroEnganche = (
      await invocar(ses, "muros.crear", {
        tipo: "Block 15",
        nivel,
        x1: 20,
        y1: 0,
        x2: 22,
        y2: 0,
        altura: 2.6,
      })
    ).creados[0];
    const losaEnganche = (
      await invocar(ses, "losas.crear", {
        nivel,
        puntos: [[20, 0], [22, 0], [22, 1], [20, 1]],
        espesor: 0.12,
        desfase: 2.84,
      })
    ).creados[0];
    assert.ok(muro && castillo && losa && columna && generico && muroEnganche && losaEnganche);

    // Los elementos se crearon por RPC: se guardan y se abren para que la vista
    // cargue sus mallas, igual que haría el usuario con un IFC existente.
    await invocar(ses, "proyecto.guardar", { ruta: rutaIfc });
    await instalarDialogos(ses, { abrir: rutaIfc });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () =>
        (await textoDom(ses, '[data-testid="estado-modelo"]')) === path.basename(rutaIfc),
      30_000,
      "no se reabrió el modelo de trabajo",
    );
    await cambiarPestana(ses, "Modelar");

    await elegirVista(ses, "3D Perspectiva");
    await ajustarVista(ses);
    await activar(ses, "cmd-empujar");
    assert.equal(
      await (await ses.porTestid("barra-herramienta")).getAttribute("data-herramienta"),
      "empujar",
    );

    // 1) Muro superior: hover azul con tooltip y +0.40 tecleado → 3.00 m.
    const tapaMuro = await proyectar(ses, 3, 0, 2.6);
    assert.equal(await hoverCara(ses, 3, 0, 2.6), "Altura del muro");
    await ses.captura(path.join(PROGRESO, "antes-muro.png"));
    await clicPantalla(ses, tapaMuro);
    await moverMundo(ses, 3, 0, 3.2);
    await ses.captura(path.join(PROGRESO, "muro-arrastrando.png"));
    await teclearYEnter(ses, "0.4");
    let props = await propiedades(ses, muro);
    casi(props.psets.OPENRVT_Muro.Altura, 3.0, "altura del muro");
    // 4.00 × 0.15 × 3.00 = 1.800 m³
    casi(
      props.psets.OPENRVT_Muro.Longitud *
        props.psets.OPENRVT_Muro.Espesor *
        props.psets.OPENRVT_Muro.Altura,
      1.8,
      "volumen del muro",
    );
    await ses.captura(path.join(PROGRESO, "despues-muro.png"));

    // 2) Muro extremo este: +1.00 → 5.00 m y el castillo sigue en 2.00.
    { const pp = await proyectar(ses, 4, 0, 1.5); await moverPantalla(ses, pp);
      console.error("EXT", JSON.stringify(await inferenciaEmpujar(ses)), JSON.stringify(await estadoEmpujar(ses)));
      const cd = await ses.driver.executeScript((x,y)=>document.querySelector('[data-testid="visor"]').__openrvtCaraEmpujarEn(x,y), pp.x, pp.y);
      console.error("EXTC", cd && cd.clasificacion && cd.clasificacion.accion); }
    assert.equal(await hoverCara(ses, 4, 0, 1.5), "Extremo del muro");
    await empujarCaraTecleado(ses, await proyectar(ses, 4, 0, 1.5), "1.0");
    props = await propiedades(ses, muro);
    casi(props.psets.OPENRVT_Muro.Longitud, 5.0, "longitud del muro");
    const castilloProps = await propiedades(ses, castillo);
    casi(castilloProps.psets.OPENRVT_Estructura.X, 2.0, "x del castillo");
    casi(castilloProps.psets.OPENRVT_Estructura.Y, 0.0, "y del castillo");

    // 3) Losa lado este: +0.50 → 4.50 × 3.00 = 13.50 m².
    assert.equal(await hoverCara(ses, 10, 1.5, 0.06), "Borde de losa");
    await empujarCaraTecleado(ses, await proyectar(ses, 10, 1.5, 0.06), "0.5");
    props = await propiedades(ses, losa);
    casi(props.psets.OPENRVT_Losa.Area, 13.5, "área de la losa");

    // 4) Columna superior: +0.40 → 3.00 m.
    assert.equal(await hoverCara(ses, 12, 0, 2.6), "Altura de la columna");
    await empujarCaraTecleado(ses, await proyectar(ses, 12, 0, 2.6), "0.4");
    props = await propiedades(ses, columna);
    casi(props.psets.OPENRVT_Estructura.Altura, 3.0, "altura de la columna");

    // 5) Genérico cara +X: +0.25 → 1.25 × 1 × 1 = 1.250 m³.
    assert.equal(await hoverCara(ses, 15, 0.5, 0.5), "Medida del genérico");
    await empujarCaraTecleado(ses, await proyectar(ses, 15, 0.5, 0.5), "0.25");
    props = await propiedades(ses, generico);
    casi(props.psets.OPENRVT_Generico.AreaBase, 1.25, "área base del genérico");
    casi(props.psets.OPENRVT_Generico.Volumen, 1.25, "volumen del genérico");
    await ajustarVista(ses);
    await ses.captura(path.join(PROGRESO, "despues-cuatro.png"));

    // 6) Enganche a la cara inferior de la losa: de 2.60 a 2.72 (+0.12).
    await moverMundo(ses, 21, 0, 2.6);
    await clicMundo(ses, 21, 0, 2.6);
    assert.ok((await estadoEmpujar(ses)).cara, "no se abrió el empuje del muro bajo la losa");
    await moverMundo(ses, 21, 0, 2.72);
    const inf = await inferenciaEmpujar(ses);
    assert.ok(inf && inf.punto, "no hubo inferencia al acercarse a la cara inferior");
    assert.equal(inf.punto.z, 2.72);
    const conEnganche = await estadoEmpujar(ses);
    casi(conEnganche.cara.distancia, 0.12, "distancia enganchada");
    await clicPantalla(ses, await proyectar(ses, 21, 0, 2.72));
    await esperar(500);
    props = await propiedades(ses, muroEnganche);
    casi(props.psets.OPENRVT_Muro.Altura, 2.72, "altura del muro enganchado");

    // 7) Esc a medias no deja cambios (muro que ya está en 2.72).
    await moverMundo(ses, 21, 0, 2.72);
    await clicMundo(ses, 21, 0, 2.72);
    await moverMundo(ses, 21, 0, 3.5);
    assert.ok((await estadoEmpujar(ses)).cara.distancia > 0.1);
    await tecla(ses, "Escape");
    await esperar(300);
    props = await propiedades(ses, muroEnganche);
    casi(props.psets.OPENRVT_Muro.Altura, 2.72, "Esc dejó un cambio a medias");
    assert.equal((await estadoEmpujar(ses)).cara, null);

    // 8) Deshacer: un empuje es un solo paso (columna de 3.00 a 3.20 y vuelta).
    await moverMundo(ses, 12, 0, 3.0);
    await clicMundo(ses, 12, 0, 3.0);
    await teclearYEnter(ses, "0.2");
    props = await propiedades(ses, columna);
    casi(props.psets.OPENRVT_Estructura.Altura, 3.2, "altura tras el segundo empuje");
    await ses.driver.executeScript(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          code: "KeyZ",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await esperar(900);
    props = await propiedades(ses, columna);
    casi(props.psets.OPENRVT_Estructura.Altura, 3.0, "Ctrl+Z no deshizo el empuje");

    // 9) Guardar y reabrir: todo queda en el IFC.
    await instalarDialogos(ses, { guardar: rutaIfc, abrir: rutaIfc });
    await elegirVista(ses, "3D Perspectiva");
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar-como");
    await ses.driver.wait(() => fs.existsSync(rutaIfc), 15_000, "no se guardó el IFC");
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () =>
        (await textoDom(ses, '[data-testid="estado-modelo"]')) === path.basename(rutaIfc),
      30_000,
      "no se reabrió el IFC",
    );
    await elegirVista(ses, "3D Perspectiva");
    await ajustarVista(ses);
    props = await propiedades(ses, muro);
    casi(props.psets.OPENRVT_Muro.Altura, 3.0, "altura del muro tras reabrir");
    casi(props.psets.OPENRVT_Muro.Longitud, 5.0, "longitud del muro");
    props = await propiedades(ses, losa);
    casi(props.psets.OPENRVT_Losa.Area, 13.5, "área de la losa");
    props = await propiedades(ses, generico);
    casi(props.psets.OPENRVT_Generico.Volumen, 1.25, "volumen del genérico");
    props = await propiedades(ses, muroEnganche);
    casi(props.psets.OPENRVT_Muro.Altura, 2.72, "altura del muro enganchado");
    await ses.captura(path.join(PROGRESO, "guardado-reabierto.png"));

    for (const nombre of [
      "antes-muro.png",
      "muro-arrastrando.png",
      "despues-muro.png",
      "despues-cuatro.png",
      "guardado-reabierto.png",
    ]) {
      assert.ok(fs.existsSync(path.join(PROGRESO, nombre)), `no se guardó ${nombre}`);
    }
  } finally {
    await ses.cerrar();
    fs.rmSync(rutaIfc, { force: true });
  }
});
