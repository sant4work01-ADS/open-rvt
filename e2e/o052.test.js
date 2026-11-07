// O052: recorrido del dueño con clics y teclas reales sobre un modelo nuevo y el
// mismo archivo. Las medidas esperadas salen del cálculo a mano del propio modelo,
// no de lo que devuelve el código.
//
// CÁLCULO A MANO DE LA LOSA (Nivel 0, espesor 0.12):
//   contorno exterior de los cuatro muros Block 15 (0.15 m) = (4.00 + 0.15) ×
//   (3.00 + 0.15) = 4.15 × 3.15 = 13.0725 m².
//   El contratrabe CT-1 (20 cm) corre por y = 0; dentro de la losa ocupa desde la
//   cara exterior del muro (-0.075) hasta su cara superior (0.10): 0.175 m de ancho
//   × 4.00 m = 0.70 m².
//   Área neta = 13.0725 − 0.70 = 12.3725 m². Volumen = 12.3725 × 0.12 = 1.4847 m³.
//
// CÁLCULO A MANO DE LOS MUROS (todos con NivelTope = Nivel 1, ya a 2.80 m):
//   Sur, 4.00 m: 4.00 × 2.80 = 11.20; dos esquinas restan 2 × (0.15 × 0.15) × 2.80 /
//     0.15 = 0.84 → 10.36 m² (sin vano: la puerta se borró).
//   Este, 3.00 m sobre la dala (base +0.20): 3.00 × 2.60 = 7.80; ventana 1.20 × 1.20
//     = 1.44; columnas 0.78 → 5.58 m².
//   Norte, 4.00 m sobre la dala: 4.00 × 2.60 = 10.40 − 0.78 = 9.62 m².
//   Oeste, 3.00 m sobre la dala: 3.00 × 2.60 = 7.80 − 0.78 = 7.02 m².
//   Copia del muro este con su ventana, 3.00 m: 3.00 × 2.80 = 8.40 − 1.44 = 6.96 m².
//   Muro recortado A, 1.00 m: 1.00 × 2.80 = 2.80 m².
//   Muro extendido B, 4.50 m: 4.50 × 2.80 = 12.60 m².
//   Muro alineado E, 2.00 m: 2.00 × 2.80 = 5.60 m².
//   Total = 10.36 + 5.58 + 9.62 + 7.02 + 6.96 + 2.80 + 12.60 + 5.60 = 60.54 m².
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "progreso", "O052");
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
    `no apareció la pestaña ${nombre}`,
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
  await ses.driver.executeScript(() => {
    const tab = document.querySelector('[data-testid="panel-pestana-vistas"]');
    if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
  });
  await esperar(200);
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

async function irModulo(ses, id) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.css(`nav[aria-label="Módulos"] [data-modulo="${id}"]`)),
    10_000,
    `no apareció el módulo ${id}`,
  );
  await boton.click();
  await esperar(400);
}

async function seleccionarElementoArbol(ses, globalid) {
  await ses.driver.executeScript(() => {
    const tab = document.querySelector('[data-testid="panel-pestana-proyecto"]');
    if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
  });
  await esperar(250);
  await fijarValor(ses, "arbol-buscador", globalid);
  const clave = `elemento:${globalid}`;
  await esperarHasta(
    async () =>
      (await ses.driver.findElements(By.css(`[data-clave="${clave}"]`))).length > 0,
    10_000,
    `el árbol no muestra el elemento ${globalid}`,
  );
  await ses.driver.executeScript((clave) => {
    const fila = document.querySelector(`[data-clave="${clave}"]`);
    if (!fila) throw new Error(`no está ${clave}`);
    fila.click();
  }, clave);
  await esperarHasta(async () => (await seleccion(ses)) === globalid, 10_000, `el árbol no seleccionó ${globalid}`);
}

async function seleccionarMurosEnArbol(ses) {
  await ses.driver.executeScript(() => {
    const tab = document.querySelector('[data-testid="panel-pestana-proyecto"]');
    if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
  });
  await esperar(250);
  await fijarValor(ses, "arbol-buscador", "Muro");
  await esperar(400);
  const ok = await ses.driver.executeScript(() => {
    const filas = [...document.querySelectorAll('[data-testid="arbol-nodo"]')];
    const grupo = filas.find(
      (f) => f.dataset.tipo === "categoria" && (f.textContent || "").trim().startsWith("Muros"),
    );
    if (!grupo) return false;
    grupo.click();
    return true;
  });
  assert.equal(ok, true, "el árbol no mostró la categoría Muros");
  await esperar(500);
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

async function escribir(ses, texto) {
  await ses.driver.actions({ async: true }).sendKeys(texto).perform();
  await esperar(120);
}

async function tecla(ses, key, code = key, extras = {}) {
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
  await esperar(300);
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

async function moverMundo(ses, x, y, z = 0) {
  const punto = await proyectar(ses, x, y, z);
  await ses.driver.executeScript(
    (punto) => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerType: "mouse",
          buttons: 0,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(150);
  return punto;
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

async function clicMundo(ses, x, y, z = 0) {
  await clicPantalla(ses, await proyectar(ses, x, y, z));
}

async function arrastrar(ses, boton, { x = 900, y = 500, dx = -90, dy = 50 } = {}) {
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
        new PointerEvent("pointermove", { ...comun, clientX: x + dx * 2, clientY: y + dy * 2 }),
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

function distancia3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function capturar(ses, nombre) {
  const ruta = path.join(CAPTURAS, nombre);
  await ses.captura(ruta);
  const cabecera = fs.readFileSync(ruta).subarray(0, 24);
  assert.equal(cabecera.toString("ascii", 1, 4), "PNG", `${ruta} no es PNG`);
  return ruta;
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

async function elementos(ses, filtro = {}) {
  return invocar(ses, "modelo.elementos", { filtro });
}

async function props(ses, globalid) {
  return invocar(ses, "modelo.propiedades", { globalid });
}

async function contarClase(ses, clase) {
  return (await elementos(ses)).filter((e) => e.clase === clase).length;
}

async function esperarClase(ses, clase, cantidad, ms = 20_000) {
  await esperarHasta(
    async () => (await contarClase(ses, clase)) === cantidad,
    ms,
    `${clase}: se esperaban ${cantidad}, hay ${await contarClase(ses, clase)}`,
  );
}

async function muros(ses) {
  return (await invocar(ses, "modelo.referencias")).muros;
}

async function nivelPorNombre(ses, nombre) {
  return (await invocar(ses, "modelo.niveles")).find((n) => n.nombre === nombre);
}

async function muroPorEje(ses, x1, y1, x2, y2) {
  const lista = await muros(ses);
  const normal = (m) => {
    const ida = Math.abs(m.x1 - x1) < 1e-6 && Math.abs(m.y1 - y1) < 1e-6 &&
      Math.abs(m.x2 - x2) < 1e-6 && Math.abs(m.y2 - y2) < 1e-6;
    const vuelta = Math.abs(m.x1 - x2) < 1e-6 && Math.abs(m.y1 - y2) < 1e-6 &&
      Math.abs(m.x2 - x1) < 1e-6 && Math.abs(m.y2 - y1) < 1e-6;
    return ida || vuelta;
  };
  const encontrado = lista.find(normal);
  assert.ok(encontrado, `no hay muro entre (${x1},${y1}) y (${x2},${y2})`);
  return encontrado;
}

async function columnaEn(ses, x, y) {
  const columnas = (await elementos(ses, { clase: "IfcColumn" })).filter(
    (e) => (e.tipo || "").includes("C-1") || true,
  );
  for (const col of columnas) {
    const p = await props(ses, col.globalid);
    const datos = p.psets?.OPENRVT_Estructura;
    if (datos && Math.abs(Number(datos.X) - x) < 1e-6 && Math.abs(Number(datos.Y) - y) < 1e-6) {
      return col.globalid;
    }
  }
  return null;
}

async function seleccion(ses) {
  return ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.getAttribute("data-seleccion") ?? null,
  );
}

async function tabHastaClase(ses, clase, globalidEsperado = null) {
  const vistos = [];
  for (let i = 0; i < 14; i += 1) {
    await tecla(ses, "Tab", "Tab");
    const gid = await seleccion(ses);
    if (!gid) {
      vistos.push("(nada)");
      continue;
    }
    if (globalidEsperado && gid !== globalidEsperado) {
      const p = await props(ses, gid);
      vistos.push(p.clase);
      continue;
    }
    const p = await props(ses, gid);
    vistos.push(p.clase);
    if (p.clase === clase) return gid;
  }
  assert.fail(`Tab no llegó a ${clase}; pasó por ${vistos.join(" → ")}`);
}

async function moverPunto(ses, x1, y1, x2, y2) {
  const herramienta = await ses.driver.executeScript(
    () => document.querySelector('[data-testid="visor"]')?.dataset.herramienta ?? null,
  );
  if (herramienta !== "mover") await activar(ses, "cmd-mover");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await esperar(600);
}

async function sumaPartida(ses, aguja) {
  const calculo = await invocar(ses, "medicion.calcular");
  const partida = calculo.partidas.find((p) => p.nombre.includes(aguja));
  assert.ok(partida, `no hay partida que contenga «${aguja}»: ${calculo.partidas.map((p) => p.nombre).join(", ")}`);
  return partida;
}

function firma(ses) {
  return (async () => {
    const lista = await elementos(ses);
    const porClase = {};
    for (const e of lista) porClase[e.clase] = (porClase[e.clase] || 0) + 1;
    const murosLista = (await muros(ses))
      .map((m) => [m.x1, m.y1, m.x2, m.y2, m.espesor, m.altura])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
    const losa = (
      await invocar(ses, "cantidades.estructura")
    ).elementos.find((e) => e.alias === "losa");
    return {
      total: lista.length,
      porClase,
      muros: murosLista,
      losaArea: losa ? (await props(ses, losa.globalid)).psets.OPENRVT_Losa.Area : null,
      losaVolumen: losa ? losa.volumen_neto_m3 : null,
    };
  })();
}

test(
  "O052: recorrido del dueño por las demás herramientas",
  { timeout: 900_000 },
  async () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o052-"));
    const ruta = path.join(carpeta, "o052.ifc");
    const ses = await Sesion.abrir({
      prueba: "o052",
      tamano: { ancho: 1920, alto: 1000 },
      lateralExpandido: true,
      compositar: true,
    });
    try {
      await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
      await activar(ses, "cmd-nuevo");
      await ses.driver.wait(async () => {
        try {
          return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
        } catch {
          return false;
        }
      }, 20_000, "el modelo nuevo no cargó");
      await ses.q('[data-testid="visor"] canvas');

      // Niveles 0 / 2.60 / 5.20 con el cuadro de Nivel (el 0 ya existe).
      await cambiarPestana(ses, "Modelar");
      for (const elevacion of ["2.60", "5.20"]) {
        await activar(ses, "cmd-nivel");
        await ses.porTestid("dialogo-nivel");
        await escribir(ses, elevacion);
        await escribir(ses, Key.ENTER);
        await esperarHasta(
          async () =>
            (await invocar(ses, "modelo.niveles")).some(
              (n) => Math.abs(n.elevacion - Number(elevacion)) < 1e-9,
            ),
          10_000,
          `no se creó el nivel ${elevacion}`,
        );
        await tecla(ses, "Escape", "Escape");
      }
      const niveles = await invocar(ses, "modelo.niveles");
      assert.deepEqual(
        niveles.map((n) => n.elevacion).sort((a, b) => a - b),
        [0, 2.6, 5.2],
        "faltan los niveles 0 / 2.60 / 5.20",
      );

      // Paso 1: retícula 2 × 2 de 4 × 3 m, zapatas en los 4 cruces y columna en cada uno.
      await activar(ses, "cmd-ejes-separaciones");
      await ses.driver.wait(
        until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
        10_000,
        "no abrió el diálogo de ejes",
      );
      await fijarValor(ses, "eje-sep-vertical-separaciones", "4");
      await fijarValor(ses, "eje-sep-horizontal-separaciones", "3");
      await activar(ses, "eje-sep-aceptar");
      await ses.driver.wait(
        async () =>
          (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]')))
            .length === 0,
        10_000,
        "el diálogo de ejes no se cerró",
      );
      const ejes = await invocar(ses, "ejes.listar");
      assert.deepEqual(
        ejes.filter((e) => e.vertical).map((e) => e.x1).sort((a, b) => a - b),
        [0, 4],
        "los ejes verticales no están en x = 0 y 4",
      );
      assert.deepEqual(
        ejes.filter((e) => !e.vertical).map((e) => e.y1).sort((a, b) => a - b),
        [0, 3],
        "los ejes horizontales no están en y = 0 y 3",
      );

      await elegirVista(ses, "Planta Nivel 0");
      await activar(ses, "cmd-zapatas-en-ejes");
      await esperarClase(ses, "IfcFooting", 4);
      const zapatas = (await elementos(ses, { clase: "IfcFooting" })).filter(
        (e) => e.tipo.includes("Z-1"),
      );
      assert.equal(zapatas.length, 4, "deben quedar 4 zapatas Z-1 en los cruces");

      await activar(ses, "cmd-columna");
      for (const [x, y] of [
        [0, 0],
        [4, 0],
        [0, 3],
        [4, 3],
      ]) {
        await clicMundo(ses, x, y);
      }
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcColumn", 4);
      for (const [x, y] of [
        [0, 0],
        [4, 0],
        [0, 3],
        [4, 3],
      ]) {
        assert.ok(await columnaEn(ses, x, y), `no hay columna en el cruce (${x}, ${y})`);
      }
      await capturar(ses, "01-reticula-zapatas-columnas.png");

      // Paso 2: contratrabe entre dos ejes y trabe en Planta Nivel 1 entre dos columnas.
      await activar(ses, "cmd-contratrabe");
      await clicMundo(ses, 0, 0);
      await clicMundo(ses, 4, 0);
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcFooting", 5);
      const contratrabe = (await elementos(ses, { clase: "IfcFooting" })).find(
        (e) => e.tipo.includes("CT-1"),
      );
      assert.ok(contratrabe, "no se creó la contratrabe CT-1");
      const pc = await props(ses, contratrabe.globalid);
      assert.equal(pc.alias, "contratrabe");
      assert.equal(Number(pc.psets.OPENRVT_Estructura.X1), 0);
      assert.equal(Number(pc.psets.OPENRVT_Estructura.X2), 4);

      await elegirVista(ses, "Planta Nivel 1");
      await activar(ses, "cmd-trabe");
      await clicMundo(ses, 0, 0);
      await clicMundo(ses, 4, 0);
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcBeam", 1);
      const trabe = (await elementos(ses, { clase: "IfcBeam" }))[0];
      const pt = await props(ses, trabe.globalid);
      assert.equal(pt.alias, "trabe");
      assert.equal(pt.nivel, "Nivel 1");
      assert.equal(Number(pt.psets.OPENRVT_Estructura.X1), 0);
      assert.equal(Number(pt.psets.OPENRVT_Estructura.X2), 4);
      assert.equal(Number(pt.psets.OPENRVT_Estructura.Z), 2.4);
      await capturar(ses, "02-contratrabe-y-trabe.png");

      // Paso 3: muros en cadena (5 puntos, cierra el rectángulo) con la longitud
      // del primer tramo tecleada.
      await elegirVista(ses, "Planta Nivel 0");
      await activar(ses, "cmd-muro");
      await clicMundo(ses, 0, 0);
      await moverMundo(ses, 4, 0);
      await escribir(ses, "4");
      await escribir(ses, Key.ENTER);
      await esperarHasta(async () => (await muros(ses)).length === 1, 10_000, "no nació el muro sur");
      await clicMundo(ses, 4, 3);
      await clicMundo(ses, 0, 3);
      await clicMundo(ses, 0, 0);
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcWall", 4);
      const sur = await muroPorEje(ses, 0, 0, 4, 0);
      const este = await muroPorEje(ses, 4, 0, 4, 3);
      const norte = await muroPorEje(ses, 4, 3, 0, 3);
      const oeste = await muroPorEje(ses, 0, 3, 0, 0);
      for (const [m, largo] of [
        [sur, 4],
        [este, 3],
        [norte, 4],
        [oeste, 3],
      ]) {
        const pm = await props(ses, m.globalid);
        assert.equal(Number(pm.psets.OPENRVT_Muro.Longitud), largo);
        assert.equal(Number(pm.psets.OPENRVT_Muro.Espesor), 0.15);
      }

      // Losa del circuito de los cuatro muros (necesaria para el paso 9).
      await seleccionarMurosEnArbol(ses);
      await activar(ses, "cmd-losa");
      await activar(ses, "losa-desde-muros");
      await esperarClase(ses, "IfcSlab", 1);

      // Dala sobre el muro norte (el paso 2 la pide sobre un muro; los muros nacen
      // en el paso 3, así que se coloca en cuanto existen).
      await activar(ses, "cmd-dala");
      await clicMundo(ses, 2, 3);
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcBeam", 2);
      const dala = (await elementos(ses, { clase: "IfcBeam" })).find(
        (e) => e.tipo.includes("DD-1"),
      );
      assert.ok(dala, "no se creó la dala DD-1");
      const pd = await props(ses, dala.globalid);
      assert.equal(pd.alias, "dala");
      assert.equal(pd.muro_liga?.muro, norte.globalid, "la dala debe colgar del muro norte");
      await capturar(ses, "03-muros-losa-y-dala.png");

      // Paso 4: puerta y ventana, volteo con Espacio, mover, borrar, deshacer y rehacer.
      await activar(ses, "cmd-puerta");
      await tecla(ses, " ", "Space");
      await clicMundo(ses, 1.45, 0);
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcDoor", 1);
      const puerta = (await elementos(ses, { clase: "IfcDoor" }))[0];
      const pp = await props(ses, puerta.globalid);
      assert.equal(pp.psets.OPENRVT_Abertura.Volteado, true, "Espacio no volteó la puerta");
      assert.equal(Number(pp.psets.OPENRVT_Abertura.Distancia), 1.0);
      assert.equal(pp.psets.OPENRVT_Abertura.Muro, sur.globalid);

      await activar(ses, "cmd-ventana");
      await clicMundo(ses, 4, 2.1);
      await tecla(ses, "Escape", "Escape");
      await esperarClase(ses, "IfcWindow", 1);
      const ventana = (await elementos(ses, { clase: "IfcWindow" }))[0];
      const pv = await props(ses, ventana.globalid);
      assert.equal(Number(pv.psets.OPENRVT_Abertura.Distancia), 1.5);
      assert.equal(pv.psets.OPENRVT_Abertura.Muro, este.globalid);

      // Mover la puerta 0.50 m sobre su muro. Se selecciona en 3D y se mueve en planta.
      const areaSurConPuerta = (
        await invocar(ses, "cantidades.estructura")
      ).elementos.find((e) => e.globalid === sur.globalid).area_neta_m2;
      assert.ok(
        Math.abs(areaSurConPuerta - 7.73) < 1e-6,
        `el muro sur con puerta debía medir 7.73 m²: ${areaSurConPuerta}`,
      );
      await seleccionarElementoArbol(ses, puerta.globalid);
      await elegirVista(ses, "Planta Nivel 0");
      await esperarHasta(async () => (await seleccion(ses)) === puerta.globalid, 5_000, "la selección de la puerta se perdió al volver a planta");
      // Destino en 1.65: lejos del punto medio del muro (2.00) para que el imán no
      // altere el desplazamiento; la distancia pasa de 1.00 a 1.20.
      await moverPunto(ses, 1.45, 0, 1.65, 0);
      await esperarHasta(
        async () =>
          Math.abs(
            Number((await props(ses, puerta.globalid)).psets.OPENRVT_Abertura.Distancia) - 1.2,
          ) < 1e-6,
        10_000,
        "la puerta no se movió a 1.20 m sobre el muro",
      );

      // Borrar la puerta; el hueco debe cerrarse.
      await seleccionarElementoArbol(ses, puerta.globalid);
      await activar(ses, "cmd-borrar");
      await esperarClase(ses, "IfcDoor", 0);
      const areaSurSinPuerta = (
        await invocar(ses, "cantidades.estructura")
      ).elementos.find((e) => e.globalid === sur.globalid).area_neta_m2;
      assert.ok(
        Math.abs(areaSurSinPuerta - 9.62) < 1e-6,
        `al borrar la puerta el muro sur debía cerrar el hueco y medir 9.62 m²: ${areaSurSinPuerta}`,
      );
      await tecla(ses, "z", "KeyZ", { ctrlKey: true });
      await esperarClase(ses, "IfcDoor", 1);
      const puertaDeshecha = (await elementos(ses, { clase: "IfcDoor" }))[0];
      const pDes = await props(ses, puertaDeshecha.globalid);
      assert.ok(
        Math.abs(Number(pDes.psets.OPENRVT_Abertura.Distancia) - 1.2) < 1e-6,
        "Deshacer no recuperó la puerta movida",
      );
      await tecla(ses, "y", "KeyY", { ctrlKey: true });
      await esperarClase(ses, "IfcDoor", 0);
      await capturar(ses, "04-puerta-ventana-mover-borrar.png");

      // Paso 5: mover un muro (su ventana lo sigue), copiar el muro con su ventana,
      // espejo y matriz de una columna.
      await elegirVista(ses, "Planta Nivel 0");
      await seleccionarElementoArbol(ses, este.globalid);
      await elegirVista(ses, "Planta Nivel 0");
      await moverPunto(ses, 4, 1.5, 4.5, 1.5);
      const esteMovido = await muroPorEje(ses, 4.5, 0, 4.5, 3);
      const pvMovida = await props(ses, ventana.globalid);
      assert.equal(pvMovida.psets.OPENRVT_Abertura.Muro, esteMovido.globalid, "la ventana no siguió al muro");
      await seleccionarElementoArbol(ses, esteMovido.globalid);
      await moverPunto(ses, 4.5, 1.5, 4, 1.5);
      const esteVuelto = await muroPorEje(ses, 4, 0, 4, 3);
      assert.equal((await props(ses, ventana.globalid)).psets.OPENRVT_Abertura.Muro, esteVuelto.globalid);

      // Copiar el muro este (con ventana) 5 m a la derecha.
      await seleccionarElementoArbol(ses, esteVuelto.globalid);
      await activar(ses, "cmd-copiar");
      await clicMundo(ses, 4, 1.5);
      await clicMundo(ses, 9, 1.5);
      await esperarClase(ses, "IfcWall", 5);
      await esperarClase(ses, "IfcWindow", 2);
      const copia = await muroPorEje(ses, 9, 0, 9, 3);
      const ventanas = (await elementos(ses, { clase: "IfcWindow" })).map((e) => e.globalid);
      let ventanaCopia = null;
      for (const gid of ventanas) {
        const p = await props(ses, gid);
        if (p.psets.OPENRVT_Abertura.Muro === copia.globalid) ventanaCopia = gid;
      }
      assert.ok(ventanaCopia, "la copia del muro no arrastró su ventana");
      assert.equal(Number((await props(ses, ventanaCopia)).psets.OPENRVT_Abertura.Distancia), 1.5);

      // Espejo de la columna de (0,3) respecto al eje y = 0 → (0,−3).
      const col03 = await columnaEn(ses, 0, 3);
      await seleccionarElementoArbol(ses, col03);
      await activar(ses, "cmd-espejo");
      await clicMundo(ses, 2, 0);
      await esperarHasta(async () => (await columnaEn(ses, 0, -3)) !== null, 15_000, "el espejo no creó la columna en (0,−3)");

      // Matriz lineal de la columna de (4,3) hacia (6,3): 2 piezas.
      const col43 = await columnaEn(ses, 4, 3);
      await seleccionarElementoArbol(ses, col43);
      await activar(ses, "cmd-matriz");
      await fijarValor(ses, "matriz-numero", "2");
      await clicMundo(ses, 4, 3);
      await clicMundo(ses, 6, 3);
      await esperarHasta(async () => (await columnaEn(ses, 6, 3)) !== null, 15_000, "la matriz no creó la columna en (6,3)");
      await capturar(ses, "05-mover-copiar-espejo-matriz.png");

      // Paso 6: recortar/extender dos muros que no llegan y alinear uno a un eje.
      const dibujar = async (x1, y1, x2, y2) => {
        await activar(ses, "cmd-muro");
        await clicMundo(ses, x1, y1);
        await clicMundo(ses, x2, y2);
        await tecla(ses, "Escape", "Escape");
        await tecla(ses, "Escape", "Escape");
        await esperar(300);
      };
      await dibujar(11, 0.5, 13, 0.5);
      await dibujar(12, 1, 12, 5);
      await dibujar(14, 5, 14, 7);
      await esperarClase(ses, "IfcWall", 8);
      await activar(ses, "visor-ajustar");
      await esperar(900);
      const muroA = await muroPorEje(ses, 11, 0.5, 13, 0.5);
      const muroB = await muroPorEje(ses, 12, 1, 12, 5);

      await activar(ses, "cmd-recortar-extender");
      assert.equal(
        await ses.driver.executeScript(
          () => document.querySelector('[data-testid="recorte-modo"]')?.value,
        ),
        "esquina",
        "Recortar/Extender debe arrancar en modo esquina",
      );
      await clicMundo(ses, 11.5, 0.5);
      await clicMundo(ses, 12, 2);
      await esperar(800);
      const aRecortado = await muroPorEje(ses, 11, 0.5, 12, 0.5);
      const bExtendido = await muroPorEje(ses, 12, 0.5, 12, 5);
      assert.equal(aRecortado.globalid, muroA.globalid);
      assert.equal(bExtendido.globalid, muroB.globalid);
      await tecla(ses, "Escape", "Escape");

      await activar(ses, "visor-ajustar");
      await esperar(900);
      await activar(ses, "cmd-alinear");
      await clicMundo(ses, 4, 4);
      await clicMundo(ses, 13.95, 6);
      await esperar(800);
      const alineado = await muroPorEje(ses, 4.075, 5, 4.075, 7);
      assert.ok(alineado, "el muro E no quedó alineado a 4.075 m");
      await tecla(ses, "Escape", "Escape");
      await capturar(ses, "06-recortar-extender-y-alinear.png");

      // Paso 7: Nivel 1 de 2.60 a 2.80; muros, columnas y trabe se ajustan.
      const nivel1 = await nivelPorNombre(ses, "Nivel 1");
      await irModulo(ses, "niveles");
      await fijarValor(ses, `nivel-elevacion-${nivel1.globalid}`, "2.8");
      await ses.driver.executeScript((testid) => {
        const campo = document.querySelector(`[data-testid="${testid}"]`);
        if (!campo) throw new Error(`falta ${testid}`);
        campo.focus();
        campo.blur();
      }, `nivel-elevacion-${nivel1.globalid}`);
      await esperarHasta(
        async () =>
          Math.abs((await nivelPorNombre(ses, "Nivel 1")).elevacion - 2.8) < 1e-9,
        15_000,
        "el Nivel 1 no pasó a 2.80",
      );
      await irModulo(ses, "modelo");
      for (const m of await muros(ses)) {
        const pm = await props(ses, m.globalid);
        assert.equal(Number(pm.psets.OPENRVT_Muro.Altura), 2.8, `el muro ${m.globalid} no creció a 2.80`);
      }
      for (const col of await elementos(ses, { clase: "IfcColumn" })) {
        const pcol = await props(ses, col.globalid);
        assert.equal(Number(pcol.psets.OPENRVT_Estructura.Altura), 2.8, `la columna ${col.globalid} no creció a 2.80`);
      }
      const trabeFinal = (await elementos(ses, { clase: "IfcBeam" })).find((e) => e.tipo.includes("T-1"));
      assert.ok(
        Math.abs(Number((await props(ses, trabeFinal.globalid)).psets.OPENRVT_Estructura.Z) - 2.6) < 1e-6,
        "la trabe no subió con el nivel",
      );
      await elegirVista(ses, "Alzado Norte");
      await capturar(ses, "07-nivel-1-a-2.80.png");

      // Paso 8: corte y las cuatro vistas de alzado sin perder nada ni espejarse;
      // en 3D se orbita y se selecciona.
      await elegirVista(ses, "Planta Nivel 0");
      await tecla(ses, "Escape", "Escape");
      await tecla(ses, "Escape", "Escape");
      await ses.driver.wait(
        until.elementLocated(By.css('[data-testid="propiedades-vista"]')),
        10_000,
        "el panel no muestra las propiedades de la vista",
      );
      await activar(ses, "niveles-todos");
      await cambiarPestana(ses, "Vista");
      await activar(ses, "cmd-nuevo-corte");
      await clicMundo(ses, 2, -1);
      await clicMundo(ses, 2, 4);
      await esperar(900);
      assert.equal(await textoDom(ses, '[data-testid="vista-activa-nombre"]'), "Corte 1");

      const todos = new Set((await elementos(ses)).map((e) => e.globalid));
      const visibles = async () =>
        new Set(
          (
            await ses.driver.executeScript(
              () => document.querySelector('[data-testid="visor"]')?.dataset.mallasVisibles ?? "",
            )
          )
            .split(",")
            .filter(Boolean),
        );
      for (const nombre of ["Corte 1", "Alzado Norte", "Alzado Sur", "Alzado Este", "Alzado Oeste"]) {
        if (nombre !== "Corte 1") await elegirVista(ses, nombre);
        const vistos = await visibles();
        const faltan = [...todos].filter((gid) => !vistos.has(gid));
        assert.equal(
          faltan.length,
          0,
          `${nombre} pierde ${faltan.length} elementos: faltan ${faltan.slice(0, 4).join(", ")}`,
        );
      }

      // Sin espejo: el orden horizontal de dos puntos conocidos sigue la orientación
      // de cada alzado. Norte mira desde +Y (+X a la izquierda); Sur desde −Y (+X a
      // la derecha); Este desde +X (+Y a la derecha); Oeste desde −X (+Y a la izquierda).
      const xPantalla = async (x, y, z) => (await proyectar(ses, x, y, z)).x;
      await elegirVista(ses, "Alzado Norte");
      assert.ok(
        (await xPantalla(0, 0, 1)) > (await xPantalla(4, 0, 1)),
        "Alzado Norte se ve en espejo: +X debe quedar a la izquierda",
      );
      await elegirVista(ses, "Alzado Sur");
      assert.ok(
        (await xPantalla(0, 0, 1)) < (await xPantalla(4, 0, 1)),
        "Alzado Sur se ve en espejo: +X debe quedar a la derecha",
      );
      await elegirVista(ses, "Alzado Este");
      assert.ok(
        (await xPantalla(4, 0, 1)) < (await xPantalla(4, 3, 1)),
        "Alzado Este se ve en espejo: +Y debe quedar a la derecha",
      );
      await elegirVista(ses, "Alzado Oeste");
      assert.ok(
        (await xPantalla(4, 0, 1)) > (await xPantalla(4, 3, 1)),
        "Alzado Oeste se ve en espejo: +Y debe quedar a la izquierda",
      );

      await elegirVista(ses, "3D Perspectiva");
      await ses.q('[data-testid="visor"] canvas');
      await esperar(700);
      await moverMundo(ses, 2, 0, 1.2);
      await tabHastaClase(ses, "IfcWall", sur.globalid);
      await activar(ses, "visor-orbitar");
      assert.equal(
        await ses.driver.executeScript(() =>
          document.querySelector('[data-testid="visor-orbitar"]')?.getAttribute("aria-pressed"),
        ),
        "true",
        "Orbitar no quedó encendido",
      );
      const antesOrbita = await camara(ses);
      await arrastrar(ses, 0);
      const trasOrbita = await camara(ses);
      assert.ok(
        distancia3(trasOrbita.direccion, antesOrbita.direccion) > 1e-3,
        "en 3D el arrastre no orbitó la cámara",
      );
      await capturar(ses, "08-corte-alzados-y-3d.png");

      // Paso 9: cantidades contra el cálculo a mano del comentario de arriba.
      const partidaMuros = await sumaPartida(ses, "Muro de Block de concreto 15");
      assert.equal(partidaMuros.unidad, "m2");
      assert.ok(
        Math.abs(partidaMuros.total - 60.54) < 1e-6,
        `área de muros ${partidaMuros.total}, se esperaban 60.54 m²`,
      );
      const partidaLosa = await sumaPartida(ses, "Área de la losa");
      assert.equal(partidaLosa.unidad, "m2");
      assert.ok(
        Math.abs(partidaLosa.total - 12.3725) < 1e-6,
        `área de losa ${partidaLosa.total}, se esperaban 12.3725 m²`,
      );
      const partidaVentanas = await sumaPartida(ses, "Ventana");
      assert.equal(partidaVentanas.total, 2, "deben medirse dos ventanas");
      const cantidades = await invocar(ses, "cantidades.estructura");
      const losa = cantidades.elementos.find((e) => e.alias === "losa");
      assert.ok(Math.abs(losa.volumen_neto_m3 - 1.4847) < 1e-6, `volumen de losa ${losa.volumen_neto_m3}`);

      // Vista de cantidades como la ve el dueño.
      const cantidadesItem = await ses.driver.wait(
        until.elementLocated(By.css('[data-testid="vista-cantidades-item"]')),
        10_000,
        "no apareció la vista de Cantidades",
      );
      await cantidadesItem.click();
      await esperar(900);
      await capturar(ses, "09-cantidades.png");
      await elegirVista(ses, "3D Perspectiva");

      // Paso 10: guardar, cerrar y abrir; mismo número de elementos y medidas.
      const antes = await firma(ses);
      await cambiarPestana(ses, "Inicio");
      await activar(ses, "cmd-guardar");
      await ses.driver.wait(
        async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o052.ifc",
        30_000,
        "no se guardó el modelo",
      );
      assert.ok(fs.existsSync(ruta), "no se creó el IFC");
      await activar(ses, "cmd-nuevo");
      await esperarHasta(async () => (await elementos(ses)).length === 0, 20_000, "el modelo no se cerró");
      await activar(ses, "cmd-abrir");
      // El modelo nuevo vacío queda con cambios; al abrir otro archivo la app
      // pregunta si guardarlos. El dueño elige «No guardar».
      const noGuardar = await ses.driver
        .wait(
          until.elementLocated(
            By.xpath(
              '//*[@data-testid="dialogo-guardar-cambios"]//button[normalize-space(.)="No guardar"]',
            ),
          ),
          5_000,
          "no apareció el aviso de cambios al cerrar",
        )
        .catch(() => null);
      if (noGuardar) await noGuardar.click();
      await ses.driver.wait(
        async () => (await invocar(ses, "proyecto.info")).ruta === ruta,
        30_000,
        "el modelo no se reabrió desde el archivo guardado",
      );
      await esperarHasta(async () => (await elementos(ses)).length > 0, 20_000, "el modelo reabierto quedó vacío");
      const despues = await firma(ses);
      assert.deepEqual(despues, antes, "al guardar y reabrir cambiaron los elementos o las medidas");
      assert.equal(despues.total, 24, "el modelo final debe tener 24 elementos");
      assert.deepEqual(
        despues.porClase,
        {
          IfcWall: 8,
          IfcColumn: 6,
          IfcFooting: 5,
          IfcBeam: 2,
          IfcWindow: 2,
          IfcSlab: 1,
        },
        "conteo por clase distinto del recorrido",
      );
      await capturar(ses, "10-guardar-cerrar-abrir.png");
    } finally {
      await ses.cerrar();
      fs.rmSync(carpeta, { recursive: true, force: true });
    }
  },
);
