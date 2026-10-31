// O022: sidebars en la app real. Buscar «alzado», plegar «Plantas», renombrar,
// duplicar y eliminar con confirmación; se mide el panel derecho al ancho mínimo.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const SALIDA = path.join(RAIZ, "docs", "progreso", "O022");
fs.mkdirSync(SALIDA, { recursive: true });

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

async function textoDom(ses, selector) {
  return ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );
}

async function items(ses) {
  return ses.driver.executeScript(() =>
    Array.from(document.querySelectorAll('[data-testid="vista-item"]')).map((el) => ({
      id: el.dataset.vistaId,
      texto: el.textContent.trim(),
    })),
  );
}

async function elemento(ses, testid) {
  return ses.porTestid(testid);
}

async function dobleClic(ses, el) {
  await ses.driver.executeScript((el) => {
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 80, clientY: 120 }));
  }, el);
  await esperar(200);
}

async function menuContextual(ses, el) {
  await ses.driver.executeScript((el) => {
    el.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 220,
        button: 2,
      }),
    );
  }, el);
  await esperar(150);
  await ses.porTestid("vista-menu");
}

async function porTextoVista(ses, nombre) {
  const lista = await items(ses);
  const hallado = lista.find((v) => v.texto === nombre);
  assert.ok(hallado, `no está la vista «${nombre}»; hay: ${lista.map((v) => v.texto).join(", ")}`);
  return ses.q(`[data-testid="vista-item"][data-vista-id="${hallado.id}"]`);
}

test("O022: sidebars con buscador, plegado, menú y ancho mínimo en la app real", async () => {
  const ses = await Sesion.abrir({
    prueba: "o022",
    tamano: { ancho: 1400, alto: 900 },
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
    await cambiarPestana(ses, "Vista");
    await esperar(400);

    await ses.captura(path.join(SALIDA, "antes-claro.png"));
    await activar(ses, "cmd-tema-oscuro");
    await esperar(300);
    await ses.captura(path.join(SALIDA, "antes-oscuro.png"));
    await activar(ses, "cmd-tema-claro");
    await esperar(300);

    const iniciales = await items(ses);
    const plantas = iniciales.filter((v) => v.texto.startsWith("Planta "));
    assert.equal(plantas.length, 1, "el modelo nuevo trae una planta");
    assert.equal(
      iniciales.find((v) => v.texto === "Alzado Norte")?.texto,
      "Alzado Norte",
    );

    // 1. Buscar «alzado» (sin acentos ni mayúsculas): queda una sola vista.
    await ses.driver.executeScript(() => {
      const campo = document.querySelector('[data-testid="vistas-buscador"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
        campo,
        "alzado",
      );
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await esperar(200);
    const buscadas = await items(ses);
    assert.equal(buscadas.length, 4, "el modelo nuevo trae los cuatro alzados");
    assert.deepEqual(
      buscadas.map((v) => v.texto).sort(),
      ["Alzado Este", "Alzado Norte", "Alzado Oeste", "Alzado Sur"],
    );
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-grupo="plantas"]') === null,
      ),
      true,
      "el grupo Plantas no debe mostrarse sin coincidencias",
    );
    await activar(ses, "vistas-buscador-limpiar");
    assert.equal((await items(ses)).length, iniciales.length);

    // 2. Plegar «Plantas»: desaparece su vista y el estado queda guardado.
    const antesPlegar = (await items(ses)).length;
    await activar(ses, "grupo-plantas-plegar");
    assert.equal((await items(ses)).length, antesPlegar - plantas.length);
    assert.deepEqual(
      await ses.driver.executeScript(() => {
        const crudo = localStorage.getItem("openrvt.vistas.grupos-plegados");
        return crudo ? JSON.parse(crudo) : [];
      }),
      ["plantas"],
    );
    await activar(ses, "grupo-plantas-plegar");
    assert.equal((await items(ses)).length, antesPlegar);

    // 3. Renombrar con doble clic + Enter.
    const alzado = await porTextoVista(ses, "Alzado Norte");
    await dobleClic(ses, alzado);
    const campo = await elemento(ses, "vista-renombrar");
    await campo.sendKeys(Key.CONTROL, "a");
    await campo.sendKeys("Alzado Renombrado");
    await campo.sendKeys(Key.ENTER);
    await esperar(400);
    assert.ok(
      (await items(ses)).some((v) => v.texto === "Alzado Renombrado"),
      "el nombre nuevo no quedó en el navegador",
    );

    // 4. Duplicar desde el menú contextual (clic derecho).
    const renombrada = await porTextoVista(ses, "Alzado Renombrado");
    await menuContextual(ses, renombrada);
    await activar(ses, "vista-menu-duplicar");
    await esperar(500);
    const copias = (await items(ses)).filter((v) => v.texto === "Alzado Renombrado (copia)");
    assert.equal(copias.length, 1, "debe existir exactamente una copia");

    // 5. Eliminar la copia con confirmación.
    const copia = await porTextoVista(ses, "Alzado Renombrado (copia)");
    await menuContextual(ses, copia);
    await activar(ses, "vista-menu-eliminar");
    assert.ok(
      (await textoDom(ses, '[data-testid="vista-menu"]')).includes("¿Eliminar"),
      "debe pedir confirmación antes de eliminar",
    );
    await activar(ses, "vista-eliminar-confirmar");
    await esperar(400);
    assert.equal(
      (await items(ses)).filter((v) => v.texto === "Alzado Renombrado (copia)").length,
      0,
      "la copia eliminada sigue en la lista",
    );

    // 6. La última vista de su tipo no se puede eliminar: botón deshabilitado.
    const unica = await porTextoVista(ses, "3D Isométrica");
    await menuContextual(ses, unica);
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid="vista-menu-eliminar"]')?.disabled,
      ),
      true,
      "no debe ofrecerse eliminar la última vista iso",
    );
    await ses.driver.executeScript(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    await esperar(150);

    // 7. Panel derecho al ancho mínimo: sin scroll horizontal.
    const asa = await elemento(ses, "asa-panel-propiedades");
    await asa.click();
    for (let i = 0; i < 8; i += 1) await asa.sendKeys(Key.ARROW_RIGHT);
    await esperar(250);
    const medidas = await ses.driver.executeScript(() => {
      const panel = document.querySelector('[data-testid="panel-propiedades"]');
      const contenido = document.querySelector('[data-testid="propiedades-vista"]');
      return {
        ancho: Number(panel.dataset.ancho),
        panelIgual: panel.scrollWidth <= panel.clientWidth,
        contenidoIgual: contenido.scrollWidth <= contenido.clientWidth,
        panelScroll: panel.scrollWidth,
        panelCliente: panel.clientWidth,
        contenidoScroll: contenido.scrollWidth,
        contenidoCliente: contenido.clientWidth,
      };
    });
    assert.equal(medidas.ancho, 270, "el panel debe quedar en su ancho mínimo");
    assert.ok(
      medidas.panelIgual,
      `panel con scroll horizontal: ${medidas.panelScroll} > ${medidas.panelCliente}`,
    );
    assert.ok(
      medidas.contenidoIgual,
      `contenido con scroll horizontal: ${medidas.contenidoScroll} > ${medidas.contenidoCliente}`,
    );

    // 7b. A ancho mínimo ningún texto del panel queda cortado (sin elipsis).
    const recortes = await ses.driver.executeScript(() => {
      const panel = document.querySelector('[data-testid="panel-propiedades"]');
      return Array.from(panel.querySelectorAll("*"))
        .filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() !== "")
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => ({
          etiqueta: el.tagName,
          texto: el.textContent.trim(),
          scroll: el.scrollWidth,
          cliente: el.clientWidth,
        }));
    });
    assert.deepEqual(recortes, [], `textos cortados en el panel: ${JSON.stringify(recortes)}`);

    // 7c. El diseño angosto se activa: etiqueta arriba, categorías en una columna y
    //     el nombre del objeto de estilos en su propia fila.
    const disposicion = await ses.driver.executeScript(() => {
      const panel = document.querySelector('[data-testid="panel-propiedades"]');
      const campoNombre = document.querySelector('[data-testid="vista-nombre"]')?.closest("label");
      const categorias = panel.querySelector(".prop-categorias");
      const estilo = panel.querySelector(".prop-estilo-fila");
      return {
        nombreColumna: getComputedStyle(campoNombre).flexDirection,
        columnasCategorias: getComputedStyle(categorias)
          .gridTemplateColumns.trim()
          .split(/\s+/).length,
        estiloBloque: getComputedStyle(estilo).display,
      };
    });
    assert.equal(disposicion.nombreColumna, "column", "la etiqueta debe ir arriba del campo");
    assert.equal(disposicion.columnasCategorias, 1, "las categorías deben ir en una columna");
    assert.equal(disposicion.estiloBloque, "block", "el objeto de estilos va en su propia fila");

    // 7d. Captura del bloque de estilos a ancho mínimo (nombre completo + dos campos).
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="seccion-estilos"]')?.scrollIntoView({ block: "end" });
    });
    await esperar(200);
    await ses.captura(path.join(SALIDA, "despues-estilos-claro.png"));

    // 8. Las secciones del panel derecho se pliegan y lo recuerdan.
    await activar(ses, "seccion-niveles-plegar");
    assert.equal(
      await ses.driver.executeScript(
        () => document.querySelector('[data-testid^="nivel-visible-"]') === null,
      ),
      true,
      "la sección Niveles no se plegó",
    );

    await ses.captura(path.join(SALIDA, "despues-claro.png"));
    await activar(ses, "cmd-tema-oscuro");
    await esperar(300);
    await ses.captura(path.join(SALIDA, "despues-oscuro.png"));
    await ses.driver.executeScript(() => {
      document.querySelector('[data-testid="seccion-estilos"]')?.scrollIntoView({ block: "end" });
    });
    await esperar(200);
    await ses.captura(path.join(SALIDA, "despues-estilos-oscuro.png"));

    for (const nombre of [
      "antes-claro.png",
      "antes-oscuro.png",
      "despues-claro.png",
      "despues-oscuro.png",
      "despues-estilos-claro.png",
      "despues-estilos-oscuro.png",
    ]) {
      const ruta = path.join(SALIDA, nombre);
      assert.ok(fs.statSync(ruta).size > 5000, `captura vacía: ${ruta}`);
    }
  } finally {
    await ses.cerrar();
  }
});
