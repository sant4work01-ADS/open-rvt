// O010: pulir lo que hay. Pruebas E2E de la app real bajo xvfb: cámara estable por
// vista, perspectiva con aristas, niveles y ejes, paneles y capturas de entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const RESULTADOS = path.join(RAIZ, "resultados", "O010");
fs.mkdirSync(RESULTADOS, { recursive: true });

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function atributoVisor(ses, nombre) {
  return (await ses.porTestid("visor")).getAttribute(`data-${nombre}`);
}

async function crearNivelLista(ses) {
  const niveles = await invocar(ses, "modelo.niveles");
  const elevacion =
    niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) + 3 : 0;
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

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(150);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(220);
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

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    10_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(500);
}

async function nuevaVistaCorte(ses) {
  await cambiarPestana(ses, "Vista");
  await activar(ses, "cmd-nuevo-corte");
  const puntoA = await ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    const r = visor.getBoundingClientRect();
    return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.5 };
  });
  const puntoB = await ses.driver.executeScript(() => {
    const visor = document.querySelector('[data-testid="visor"]');
    const r = visor.getBoundingClientRect();
    return { x: r.left + r.width * 0.7, y: r.top + r.height * 0.5 };
  });
  for (const punto of [puntoA, puntoB]) {
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
  await cambiarPestana(ses, "Modelar");
}

async function rueda(ses, deltaY = -240) {
  await ses.driver.executeScript(
    (deltaY) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
          clientX: 600,
          clientY: 400,
        }),
      );
    },
    deltaY,
  );
  await esperar(250);
}

async function panear(ses, dx = 55, dy = 28) {
  await ses.driver.executeScript(
    (dx, dy) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const r = canvas.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 1,
        buttons: 4,
        pointerId: 2,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: x + dx, clientY: y + dy }),
      );
      window.dispatchEvent(new PointerEvent("pointerup", { ...abajo, buttons: 0, clientX: x + dx, clientY: y + dy }));
    },
    dx,
    dy,
  );
  await esperar(250);
}

async function camara(ses) {
  const crudo = await atributoVisor(ses, "camara");
  assert.ok(crudo, "el visor no publica data-camara");
  return JSON.parse(crudo);
}

function iguales(a, b, tolerancia = 1e-6) {
  const campos = ["objetivo", "direccion", "distancia", "izquierda", "derecha", "arribaPlano", "abajo", "fov"];
  const diferencias = [];
  for (const campo of campos) {
    const va = a[campo];
    const vb = b[campo];
    if (Array.isArray(va) && Array.isArray(vb)) {
      va.forEach((n, i) => {
        if (Math.abs(n - vb[i]) > tolerancia) diferencias.push(`${campo}[${i}]: ${n} != ${vb[i]}`);
      });
    } else if (va === null || vb === null) {
      if (va !== vb) diferencias.push(`${campo}: ${va} != ${vb}`);
    } else if (Math.abs(va - vb) > tolerancia) {
      diferencias.push(`${campo}: ${va} != ${vb}`);
    }
  }
  return diferencias;
}

async function proyectar(ses, x, y) {
  return ses.driver.executeScript(
    (x, y) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone __openrvtMundoAPantalla");
      }
      return visor.__openrvtMundoAPantalla(x, y, 0);
    },
    x,
    y,
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
  await esperar(300);
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
  await esperar(150);
}

async function dibujarMuro(ses, x1, y1, x2, y2, tipo) {
  await activar(ses, "cmd-muro");
  if (tipo) await fijarValor(ses, "muro-tipo", tipo);
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
}

async function posicionCota(ses, texto, indice = 0) {
  return ses.driver.executeScript(
    (texto, indice) => {
      const visor = document.querySelector('[data-testid="visor"]');
      return visor.__openrvtCotaAPantalla(texto, indice);
    },
    texto,
    indice,
  );
}

async function dobleClicCota(ses, texto, indice = 0) {
  const punto = await posicionCota(ses, texto, indice);
  assert.ok(punto, `no se encontró la cota ${texto}`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      canvas.dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: punto.x,
          clientY: punto.y,
        }),
      );
    },
    punto,
  );
  await esperar(250);
}

test("O010-1: la cámara conserva zoom y paneo en las 5 vistas tras crear y editar", async () => {
  const ses = await Sesion.abrir({
    prueba: "o010-camara",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await nuevaVistaCorte(ses);

    const nombres = ["Planta Nivel 0", "Alzado Norte", "Corte 1", "3D Isométrica", "3D Perspectiva"];
    const antes = {};
    for (const nombre of nombres) {
      await elegirVista(ses, nombre);
      const inicial = await camara(ses);
      await rueda(ses, nombre.includes("Perspectiva") ? -180 : -240);
      await panear(ses, nombre.includes("3D") ? 35 : 55, 25);
      antes[nombre] = await camara(ses);
      assert.ok(
        iguales(inicial, antes[nombre]).length > 0,
        `el zoom/paneo de «${nombre}» no cambió la cámara`,
      );
    }

    // Cambios que antes reencuadraban la cámara: nivel, eje, muro, cota y propiedad.
    await elegirVista(ses, "Planta Nivel 0");
    await crearNivelLista(ses);
    // Deja visibles todos los niveles para que el muro se vea en las capturas.
    const visibles = await ses.driver.findElements(By.css('[data-testid^="nivel-visible-"]'));
    for (const check of visibles) {
      if (!(await check.isSelected())) await check.click();
    }
    await esperar(250);
    await activar(ses, "cmd-eje");
    await clicMundo(ses, -1, -1);
    await clicMundo(ses, -1, 6);
    await tecla(ses, "Escape", "Escape");
    await dibujarMuro(ses, 0, 0, 5, 0);
    await ses.driver.wait(async () => {
      const visor = await ses.porTestid("visor");
      return Number(await visor.getAttribute("data-mallas")) >= 1;
    }, 15_000, "no se teseló el muro de la prueba de cámara");
    await elegirVista(ses, "Alzado Norte");
    await dobleClicCota(ses, "3.00", 0);
    const campo = await ses.porTestid("cota-campo");
    await campo.sendKeys(Key.CONTROL, "a");
    await campo.sendKeys("4");
    await campo.sendKeys(Key.ENTER);
    await esperar(600);
    const niveles = await invocar(ses, "modelo.niveles");
    assert.ok(
      niveles.some((n) => Math.abs(n.elevacion - 4) < 1e-6),
      `la cota del nivel no cambió: ${JSON.stringify(niveles)}`,
    );
    await elegirVista(ses, "Planta Nivel 0");
    await fijarValor(ses, "vista-nombre", "Planta Nivel 0");
    await esperar(300);

    for (const nombre of nombres) {
      await elegirVista(ses, nombre);
      const despues = await camara(ses);
      const diferencias = iguales(antes[nombre], despues);
      assert.deepEqual(diferencias, [], `la cámara de «${nombre}» se movió: ${diferencias.join("; ")}`);
    }

    await elegirVista(ses, "3D Perspectiva");
    const antesAjustar = await camara(ses);
    await (await ses.porTestid("visor-ajustar")).click();
    await esperar(400);
    assert.ok(
      iguales(antesAjustar, await camara(ses)).length > 0,
      "Ajustar no reencuadró la perspectiva",
    );
    await ses.captura(path.join(RESULTADOS, "despues-camara-perspectiva.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O010-2: niveles, cotas, ejes ordenados, paneles y rango de vista", async () => {
  const ses = await Sesion.abrir({
    prueba: "o010-niveles",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");

    await cambiarPestana(ses, "Modelar");
    await crearNivelLista(ses);
    await crearNivelLista(ses);
    const niveles = await invocar(ses, "modelo.niveles");
    assert.equal(niveles.length, 3);

    // Formatos de elevación en el módulo Niveles y ejes.
    const modulo = await ses.driver.wait(
      until.elementLocated(By.css('[data-modulo="niveles"]')),
      10_000,
    );
    await modulo.click();
    await esperar(200);
    const objetivo = niveles.find((n) => Math.abs(n.elevacion - 3) < 1e-6);
    assert.ok(objetivo, "falta el nivel de 3.00");
    for (const [texto, esperado] of [
      ["10cm", 0.1],
      ["100mm", 0.1],
      [".1", 0.1],
      ["0,1", 0.1],
      ["-2", -2],
    ]) {
      const entrada = await ses.porTestid(`nivel-elevacion-${objetivo.globalid}`);
      await entrada.sendKeys(Key.CONTROL, "a");
      await entrada.sendKeys(texto);
      await ses.driver.executeScript((el) => el.blur(), entrada);
      await esperar(450);
      const actuales = await invocar(ses, "modelo.niveles");
      const nivel = actuales.find((n) => n.globalid === objetivo.globalid);
      assert.ok(
        nivel && Math.abs(nivel.elevacion - esperado) < 1e-6,
        `«${texto}» no dio ${esperado}: ${JSON.stringify(nivel)}`,
      );
    }
    const entradaFinal = await ses.porTestid(`nivel-elevacion-${objetivo.globalid}`);
    await entradaFinal.sendKeys(Key.CONTROL, "a");
    await entradaFinal.sendKeys("abc");
    await ses.driver.executeScript((el) => el.blur(), entradaFinal);
    await esperar(250);
    assert.match(await textoDom(ses, `[data-testid="nivel-error-${objetivo.globalid}"]`), /Cota no válida/);
    assert.equal((await ses.driver.findElements(By.css('[data-testid="cota-error"]'))).length, 0);

    // Renombrar y borrar niveles desde el módulo.
    const renombrar = await ses.porTestid(`nivel-nombre-${objetivo.globalid}`);
    await renombrar.sendKeys(Key.CONTROL, "a");
    await renombrar.sendKeys("Nivel renombrado");
    await ses.driver.executeScript((el) => el.blur(), renombrar);
    await esperar(400);
    const conNombre = await invocar(ses, "modelo.niveles");
    assert.ok(conNombre.some((n) => n.nombre === "Nivel renombrado"));
    const borrable = niveles.find((n) => n.globalid !== objetivo.globalid);
    await (await ses.porTestid(`nivel-borrar-${borrable.globalid}`)).click();
    await esperar(500);
    const trasBorrar = await invocar(ses, "modelo.niveles");
    assert.equal(trasBorrar.length, 2);
    // Se agrega otro nivel para que haya cota total (tres niveles).
    await fijarValor(ses, "nivel-nuevo-nombre", "Nivel extra");
    await fijarValor(ses, "nivel-nuevo-elevacion", "9");
    await (await ses.porTestid("nivel-agregar")).click();
    await esperar(500);
    assert.equal((await invocar(ses, "modelo.niveles")).length, 3);

    // Ejes creados en orden no monótono: el alzado Norte los ordena por su x de
    // pantalla (derecha a izquierda del plano), no por el orden de creación.
    await (await ses.driver.findElement(By.css('[data-modulo="modelo"]'))).click();
    await esperar(200);
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "Planta Nivel renombrado");
    await cambiarPestana(ses, "Modelar");
    for (const x of [8, 0, 4, 2, 6]) {
      await activar(ses, "cmd-eje");
      await clicMundo(ses, x, -1);
      await clicMundo(ses, x, 6);
      await tecla(ses, "Escape", "Escape");
    }
    await elegirVista(ses, "Alzado Norte");
    const orden = (await atributoVisor(ses, "ejes-alzado-orden")) || "";
    assert.equal(orden, "1,5,3,4,2", `orden de ejes inesperado: ${orden}`);
    const textos = (await atributoVisor(ses, "niveles-texto")) || "";
    // O025 quitó la palabra «Total» de su fila: la total es el número solo.
    // Se comprueba el valor exacto y que la cadena suma la total (8.00 + 3.00).
    const filas = JSON.parse((await atributoVisor(ses, "niveles-cotas")) || "[]");
    const filaNiveles = filas.find((f) => f.nombre === "Niveles");
    assert.ok(filaNiveles, `faltan las cotas de niveles: ${textos}`);
    assert.deepEqual(filaNiveles.parciales, ["8.00", "3.00"]);
    assert.equal(filaNiveles.total, "11.00", `la cota total no es 11.00: ${textos}`);

    // Grupo de rango de vista plegado.
    await elegirVista(ses, "Planta Nivel renombrado");
    await cambiarPestana(ses, "Vista");
    const grupo = await ses.porTestid("vista-rango-avanzado");
    assert.equal(await grupo.getTagName(), "details");
    assert.equal(await grupo.getAttribute("open"), null);
    const campoAltura = await ses.driver.findElement(By.css('[data-testid="vista-altura"]'));
    assert.equal(await campoAltura.isDisplayed(), false);

    // Paneles redimensionables: el ancho cambia y se conserva en la preferencia.
    await (await ses.porTestid("visor-ajustar")).click();
    await esperar(300);
    const asaVistas = await ses.porTestid("asa-panel-vistas");
    const anchoAntes = Number(await (await ses.porTestid("panel-vistas")).getAttribute("data-ancho"));
    await asaVistas.sendKeys(Key.ARROW_RIGHT);
    const anchoDespues = Number(await (await ses.porTestid("panel-vistas")).getAttribute("data-ancho"));
    assert.equal(anchoDespues, anchoAntes + 16);
    const guardado = await ses.driver.executeScript(() =>
      localStorage.getItem("openrvt.ancho-panel.vistas"),
    );
    assert.equal(Number(guardado), anchoDespues);
    const asaProp = await ses.porTestid("asa-panel-propiedades");
    assert.equal(await asaProp.getAttribute("aria-orientation"), "vertical");
    await ses.captura(path.join(RESULTADOS, "despues-paneles.png"));

    await elegirVista(ses, "Alzado Norte");
    await (await ses.porTestid("visor-ajustar")).click();
    await esperar(600);
    await ses.captura(path.join(RESULTADOS, "despues-niveles-alzado.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O010-4: las cotas azules de la retícula son del rebase, no residuos", async () => {
  const ses = await Sesion.abrir({
    prueba: "o010-rebase",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await cambiarPestana(ses, "Modelar");
    for (let i = 0; i < 3; i += 1) await crearNivelLista(ses);
    await activar(ses, "cmd-ejes-separaciones");
    await ses.driver.wait(
      until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
      10_000,
      "no abrió el diálogo de ejes",
    );
    await fijarValor(ses, "eje-sep-vertical-separaciones", "2, 1.95, 1.55, 2.5");
    await fijarValor(ses, "eje-sep-vertical-etiqueta", "1");
    await fijarValor(ses, "eje-sep-horizontal-separaciones", "2, 1.25, 2.25, 1.85");
    await fijarValor(ses, "eje-sep-horizontal-etiqueta", "A");
    await fijarValor(ses, "eje-sep-rebase", "2");
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="eje-sep-aceptar"]')?.click();
    });
    await esperar(500);
    await activar(ses, "visor-ajustar");
    await esperar(600);
    const familias = JSON.parse((await atributoVisor(ses, "cotas")) || "[]");
    const rebases = familias.map((f) => f.rebase).filter(Boolean);
    assert.deepEqual(rebases.sort(), ["2.00", "2.00"], "las cotas azules deben ser rebases de 2.00");
    await ses.captura(path.join(RESULTADOS, "despues-rebase-planta.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O010-3: 3D iso y perspectiva, esquinas L/T/espesores y cotas residuales", async () => {
  const ses = await Sesion.abrir({
    prueba: "o010-3d",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await activar(ses, "cmd-nuevo");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
      } catch {
        return false;
      }
    }, 20_000, "el modelo nuevo no cargó");
    await cambiarPestana(ses, "Modelar");
    await dibujarMuro(ses, 0, 0, 4, 0, "Block 15");
    await dibujarMuro(ses, 4, 0, 4, 3, "Block 20");
    await dibujarMuro(ses, 4, 3, 0, 3, "Block 15");
    await dibujarMuro(ses, 0, 3, 0, 0, "Block 20");
    await dibujarMuro(ses, 2, 0, 2, 1.5, "Block 15");
    await ses.driver.wait(async () => {
      const visor = await ses.porTestid("visor");
      return Number(await visor.getAttribute("data-mallas")) >= 5;
    }, 25_000, "no se dibujaron los cinco muros");

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Isométrica");
    await esperar(800);
    await ses.captura(path.join(RESULTADOS, "despues-iso.png"));
    const estiloIso = await atributoVisor(ses, "estilo-vista");
    assert.equal(estiloIso, "aristas");

    await elegirVista(ses, "3D Perspectiva");
    await esperar(800);
    await ses.captura(path.join(RESULTADOS, "despues-perspectiva.png"));
    const estiloPersp = await atributoVisor(ses, "estilo-vista");
    assert.equal(estiloPersp, "sombreado");
    const mallas = Number(await atributoVisor(ses, "mallas-dibujadas"));
    assert.equal(mallas, 5);

    await elegirVista(ses, "Planta Nivel 0");
    await ses.porTestid("visor-ajustar").then((b) => b.click());
    await esperar(500);
    await ses.captura(path.join(RESULTADOS, "despues-esquinas-planta.png"));
  } finally {
    await ses.cerrar();
  }
});
