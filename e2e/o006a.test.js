// O006a: cotas que mandan. Con la app Tauri real crea dos retículas por
// separaciones, comprueba los valores exactos de las cotas, edita una parcial con
// cadena, deshace con Ctrl+Z y cambia un entrepiso en alzado comprobando que los
// muros del nivel superior suben. Toma las capturas de la entrega.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");

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

async function atributoVisor(ses, atributo) {
  return (await ses.porTestid("visor")).getAttribute(`data-${atributo}`);
}

/** Proyecta un punto del modelo a la pantalla con la cámara real del visor. */
async function puntoPantalla(ses, x, y, z = 1.2) {
  return ses.driver.executeScript(
    (x, y, z) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtMundoAPantalla !== "function") {
        throw new Error("el visor no expone __openrvtMundoAPantalla");
      }
      return visor.__openrvtMundoAPantalla(x, y, z);
    },
    x,
    y,
    z,
  );
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
  await esperar(150);
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
  await esperar(100);
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

async function dialogoEjes(
  ses,
  { direccion, origen, separaciones, longitud, etiqueta },
) {
  await cambiarPestana(ses, "Modelar");
  await activar(ses, "cmd-ejes-separaciones");
  await ses.driver.wait(
    until.elementLocated(By.css('[data-testid="dialogo-ejes-separaciones"]')),
    10_000,
    "no abrió el diálogo de ejes por separaciones",
  );
  // O006d: el diálogo pide las dos familias; aquí se deja vacía la que no toca y se
  // usa el modo origen con su longitud.
  if (direccion === "vertical") {
    await fijarValor(ses, "eje-sep-horizontal-separaciones", "");
    await fijarValor(ses, "eje-sep-vertical-separaciones", separaciones);
    await fijarValor(ses, "eje-sep-vertical-etiqueta", etiqueta);
    await fijarValor(ses, "eje-sep-vertical-origen", String(origen));
    await fijarValor(ses, "eje-sep-vertical-longitud", String(longitud));
  } else {
    await fijarValor(ses, "eje-sep-vertical-separaciones", "");
    await fijarValor(ses, "eje-sep-horizontal-separaciones", separaciones);
    await fijarValor(ses, "eje-sep-horizontal-etiqueta", etiqueta);
    await fijarValor(ses, "eje-sep-horizontal-origen", String(origen));
    await fijarValor(ses, "eje-sep-horizontal-longitud", String(longitud));
  }
  await ses.driver.executeScript(() => {
    document.querySelector('[data-testid="eje-sep-aceptar"]')?.click();
  });
  await ses.driver.wait(
    async () => (await ses.driver.findElements(By.css('[data-testid="dialogo-ejes-separaciones"]'))).length === 0,
    10_000,
    "el diálogo no se cerró al crear los ejes",
  );
  await esperar(300);
}

async function cotas(ses) {
  const crudo = await atributoVisor(ses, "cotas");
  return crudo ? JSON.parse(crudo) : [];
}

async function posicionCota(ses, texto, indice = 0) {
  return ses.driver.executeScript(
    (texto, indice) => {
      const visor = document.querySelector('[data-testid="visor"]');
      if (!visor || typeof visor.__openrvtCotaAPantalla !== "function") {
        throw new Error("el visor no expone la posición de las cotas");
      }
      return visor.__openrvtCotaAPantalla(texto, indice);
    },
    texto,
    indice,
  );
}

async function dobleClicCota(ses, texto, indice = 0) {
  const punto = await posicionCota(ses, texto, indice);
  assert.ok(punto, `no se encontró el texto de cota ${texto}`);
  await ses.driver.executeScript(
    (punto) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      if (!canvas) throw new Error("no hay canvas");
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
  await esperar(200);
}

async function cambiarCota(ses, valor) {
  const campo = await ses.porTestid("cota-campo");
  await campo.click();
  await campo.sendKeys(Key.CONTROL, "a");
  await campo.sendKeys(valor);
  await campo.sendKeys(Key.ENTER);
  await esperar(500);
}

async function cajaMalla(ses, globalid) {
  const teselado = await invocar(ses, "geometria.teselar", { globalids: [globalid] });
  const elemento = teselado.elementos.find((e) => e.globalid === globalid);
  assert.ok(elemento, `sin malla para ${globalid}`);
  const bytes = Buffer.from(elemento.vertices, "base64");
  let minZ = Infinity;
  for (let i = 0; i + 12 <= bytes.length; i += 12) {
    minZ = Math.min(minZ, bytes.readFloatLE(i + 8));
  }
  assert.ok(Number.isFinite(minZ), "la malla no tiene vértices");
  return minZ;
}

test("O006a: cotas de ejes, edición con cadena, deshacer y Ctrl+Z", async () => {
  const ses = await Sesion.abrir({
    prueba: "o006a-cotas",
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
    await ses.q('[data-testid="visor"] canvas');

    await dialogoEjes(ses, {
      direccion: "vertical",
      origen: 0,
      separaciones: "5, 4.5, 5",
      longitud: 20,
      etiqueta: "1",
    });
    await dialogoEjes(ses, {
      direccion: "horizontal",
      origen: 0,
      separaciones: "4, 4",
      longitud: 12,
      etiqueta: "A",
    });
    assert.equal(await atributoVisor(ses, "ejes-etiquetas"), "1,2,3,4,A,B,C");

    // O006b: la planta no está girada. En pantalla el 1 queda a la izquierda del 4
    // y la A (y = 0) abajo de la C (y = 8), con +Y arriba.
    const ejesCreados = await invocar(ses, "ejes.listar");
    const posEje = async (etiqueta) => {
      const eje = ejesCreados.find((e) => e.etiqueta === etiqueta);
      assert.ok(eje, `falta el eje ${etiqueta}`);
      return puntoPantalla(ses, eje.x2, eje.y2);
    };
    const [p1, p4, pA, pC] = await Promise.all([
      posEje("1"),
      posEje("4"),
      posEje("A"),
      posEje("C"),
    ]);
    assert.ok(
      p1.x < p4.x - 1,
      `el eje 1 debe quedar a la izquierda del 4 (x ${p1.x} vs ${p4.x})`,
    );
    assert.ok(
      pA.y > pC.y + 1,
      `el eje A debe quedar abajo del C (y ${pA.y} vs ${pC.y})`,
    );
    const ejeUno = ejesCreados.find((e) => e.etiqueta === "1");
    const ejeCuatro = ejesCreados.find((e) => e.etiqueta === "4");
    assert.equal(ejeUno.x1, 0);
    assert.equal(ejeCuatro.x1, 14.5);

    const familias = await cotas(ses);
    assert.equal(familias.length, 2, "deben ser dos familias paralelas");
    const vertical = familias.find((f) => f.vertical);
    const horizontal = familias.find((f) => !f.vertical);
    assert.deepEqual(vertical.parciales, ["5.00", "4.50", "5.00"]);
    assert.equal(vertical.total, "14.50");
    assert.deepEqual(horizontal.parciales, ["4.00", "4.00"]);
    assert.equal(horizontal.total, "8.00");

    const capturaPlanta = path.join(CAPTURAS, "o006a_planta_cotas.png");
    await ses.captura(capturaPlanta);
    assert.deepEqual(dimensionesPng(capturaPlanta), { ancho: 1600, alto: 900 });

    // La cota total es de lectura: el doble clic avisa y no abre el campo.
    await dobleClicCota(ses, "14.50");
    assert.equal(
      (await ses.driver.findElements(By.css('[data-testid="cota-campo"]'))).length,
      0,
      "la cota total no debe ser editable",
    );
    assert.match(
      (await textoDom(ses, '[data-testid="estado-aviso"]')) || "",
      /lectura/i,
    );

    // Editar 4,50 a 6,00 con cadena: el total pasa a 16,00 y el último eje se mueve 1,5 m.
    await dobleClicCota(ses, "4.50");
    await ses.porTestid("cota-campo");
    const casilla = await ses.porTestid("cota-mover-siguientes");
    assert.equal(await casilla.isSelected(), true, "«Mover los siguientes» viene marcada");
    const capturaEditor = path.join(CAPTURAS, "o006a_editar_cota.png");
    await ses.captura(capturaEditor);
    assert.deepEqual(dimensionesPng(capturaEditor), { ancho: 1600, alto: 900 });
    await cambiarCota(ses, "6");

    await ses.driver.wait(
      async () => {
        const actuales = await cotas(ses);
        const v = actuales.find((f) => f.vertical);
        return v && v.total === "16.00";
      },
      15_000,
      "el total no pasó a 16,00",
    );
    const editadas = await cotas(ses);
    const verticalEditada = editadas.find((f) => f.vertical);
    assert.deepEqual(verticalEditada.parciales, ["5.00", "6.00", "5.00"]);
    assert.equal(verticalEditada.total, "16.00");
    const ejes = await invocar(ses, "ejes.listar");
    const ultimo = ejes.find((e) => e.etiqueta === "4");
    assert.equal(ultimo.x1, 16.0, "el último eje debe quedar a 16,00 m");

    // Ctrl+Z devuelve eje, cadenas y cotas.
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
    await ses.driver.wait(
      async () => {
        const actuales = await cotas(ses);
        const v = actuales.find((f) => f.vertical);
        return v && v.total === "14.50";
      },
      15_000,
      "Ctrl+Z no restauró las cotas",
    );
    const ejesDespues = await invocar(ses, "ejes.listar");
    assert.equal(ejesDespues.find((e) => e.etiqueta === "4").x1, 14.5);
  } finally {
    await ses.cerrar();
  }
});

test("O006a: el entrepiso manda y los muros del nivel superior suben", async () => {
  const ses = await Sesion.abrir({
    prueba: "o006a-niveles",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    const carpeta = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "openrvt-o006a-"));
    const ruta = path.join(carpeta, "o006a-niveles.ifc");
    await instalarDialogos(ses, { abrir: ruta });
    await invocar(ses, "proyecto.nuevo", { nombre: "Cotas O006a" });
    await invocar(ses, "niveles.crear", { nombre: "Nivel 1", elevacion: 2.7 });
    const niveles = await invocar(ses, "modelo.niveles");
    const nivel1 = niveles.find((n) => n.nombre === "Nivel 1");
    assert.ok(nivel1, "falta el Nivel 1");
    const muro = await invocar(ses, "muros.crear", {
      tipo: "Block 15",
      nivel: nivel1.globalid,
      x1: 0,
      y1: 0,
      x2: 5,
      y2: 0,
      altura: 2.6,
      alineacion: "centro",
    });
    await invocar(ses, "proyecto.guardar", { ruta });
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(
      async () => (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o006a-niveles.ifc",
      30_000,
      "no abrió la casa de dos niveles",
    );
    await elegirVista(ses, "Alzado Sur");
    await esperar(500);
    const zAntes = await cajaMalla(ses, muro.creados[0]);

    const textos = (await atributoVisor(ses, "niveles-texto")) || "";
    assert.match(textos, /Nivel 0/);
    assert.match(textos, /Nivel 1/);
    assert.match(textos, /2\.70/);
    // O006b: con un solo entrepiso no se repite la total «2.70».
    const filasNiveles = JSON.parse((await atributoVisor(ses, "niveles-cotas")) || "[]");
    const filaNiveles = filasNiveles.find((f) => f.nombre === "Niveles");
    assert.ok(filaNiveles, "faltan las cotas de niveles");
    assert.deepEqual(filaNiveles.parciales, ["2.70"]);
    assert.equal(filaNiveles.total, null);
    const capturaAlzado = path.join(CAPTURAS, "o006a_alzado_niveles.png");
    await ses.captura(capturaAlzado);
    assert.deepEqual(dimensionesPng(capturaAlzado), { ancho: 1600, alto: 900 });

    await dobleClicCota(ses, "2.70");
    await ses.porTestid("cota-campo");
    assert.equal(
      await (await ses.porTestid("cota-mover-siguientes")).isSelected(),
      true,
      "«Mover los de arriba» viene marcada",
    );
    await cambiarCota(ses, "3.00");
    await ses.driver.wait(
      async () => {
        const actuales = await invocar(ses, "modelo.niveles");
        return actuales.find((n) => n.nombre === "Nivel 1")?.elevacion === 3.0;
      },
      15_000,
      "el Nivel 1 no pasó a 3,00",
    );
    const zDespues = await cajaMalla(ses, muro.creados[0]);
    assert.ok(
      Math.abs(zDespues - zAntes - 0.3) < 1e-4,
      `el muro subió ${(zDespues - zAntes).toFixed(3)} m en vez de 0.300 m`,
    );
  } finally {
    await ses.cerrar();
  }
});

async function elegirVista(ses, nombre) {
  const boton = await ses.driver.wait(
    until.elementLocated(
      By.xpath(`//button[@data-testid="vista-item"][normalize-space(.)="${nombre}"]`),
    ),
    15_000,
    `no apareció la vista ${nombre}`,
  );
  await boton.click();
  await esperar(400);
}
