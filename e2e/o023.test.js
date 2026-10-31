// O023: auditoría de «pulir lo que hay» con la app real. Comprueba los puntos 1,
// 3, 4, 5 y 6 de la lista del 2026-10-26 y deja capturas en docs/progreso/O023/.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const PROGRESO = path.join(RAIZ, "docs", "progreso", "O023");
fs.mkdirSync(PROGRESO, { recursive: true });

const textoDom = (ses, selector) =>
  ses.driver.executeScript(
    (selector) => document.querySelector(selector)?.textContent?.trim() ?? null,
    selector,
  );

async function atributoVisor(ses, nombre) {
  return (await ses.porTestid("visor")).getAttribute(`data-${nombre}`);
}

async function cambiarPestana(ses, nombre) {
  const pestana = await ses.driver.wait(
    until.elementLocated(By.xpath(`//*[@role="tab"][normalize-space(.)="${nombre}"]`)),
    10_000,
  );
  await pestana.click();
  await esperar(200);
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

async function nuevoModelo(ses) {
  await activar(ses, "cmd-nuevo");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-esquema"]')) === "IFC4";
    } catch {
      return false;
    }
  }, 20_000, "el modelo nuevo no cargó");
  await cambiarPestana(ses, "Modelar");
}

async function proyectar(ses, x, y, z = 0) {
  return ses.driver.executeScript(
    (x, y, z) => document.querySelector('[data-testid="visor"]').__openrvtMundoAPantalla(x, y, z),
    x,
    y,
    z,
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
  await fijarValor(ses, "muro-tipo", tipo);
  await fijarValor(ses, "muro-altura", "3");
  await clicMundo(ses, x1, y1);
  await clicMundo(ses, x2, y2);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
}

async function rueda(ses, deltaY = -240) {
  await ses.driver.executeScript((deltaY) => {
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
  }, deltaY);
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
      window.dispatchEvent(new PointerEvent("pointermove", { ...abajo, clientX: x + dx, clientY: y + dy }));
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

function verticesDe(elemento) {
  const bytes = Uint8Array.from(Buffer.from(elemento.vertices, "base64"));
  const v = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  const puntos = [];
  for (let i = 0; i + 2 < v.length; i += 3) puntos.push([v[i], v[i + 1], v[i + 2]]);
  return puntos;
}

function cajaDe(elementos) {
  const puntos = elementos.flatMap(verticesDe);
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const zs = puntos.map((p) => p[2]);
  return {
    x0: Math.min(...xs), x1: Math.max(...xs),
    y0: Math.min(...ys), y1: Math.max(...ys),
    z0: Math.min(...zs), z1: Math.max(...zs),
  };
}

function cerca(actual, esperado, mensaje) {
  assert.ok(
    Math.abs(actual - esperado) < 1e-6,
    `${mensaje}: ${actual} != ${esperado}`,
  );
}

async function posicionCota(ses, texto, indice = 0) {
  return ses.driver.executeScript(
    (texto, indice) => document.querySelector('[data-testid="visor"]').__openrvtCotaAPantalla(texto, indice),
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
        new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0, clientX: punto.x, clientY: punto.y }),
      );
    },
    punto,
  );
  await esperar(250);
}

test("O023-1: esquinas de muros en L, T y espesores distintos sin picos ni huecos", async () => {
  const ses = await Sesion.abrir({
    prueba: "o023-esquinas",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    // Tres uniones separadas. Cada muro mide 3.00 m de alto.
    // L con 15 y 20 cm; T con 15 pasante y 20 que llega; L de 15 y 15.
    const muros = [
      [0, 0, 4, 0, "Block 15"],
      [4, 0, 4, 3, "Block 20"],
      [6, 0, 12, 0, "Block 15"],
      [9, 0, 9, 3, "Block 20"],
      [14, 0, 18, 0, "Block 15"],
      [18, 0, 18, 3, "Block 15"],
    ];
    for (const [x1, y1, x2, y2, tipo] of muros) {
      await dibujarMuro(ses, x1, y1, x2, y2, tipo);
    }
    await ses.driver.wait(async () => {
      const visor = await ses.porTestid("visor");
      return Number(await visor.getAttribute("data-mallas")) >= 6;
    }, 25_000, "no se teselaron los seis muros");

    const teselado = await invocar(ses, "geometria.teselar", { globalids: null });
    const paredes = teselado.elementos.filter((e) => e.clase === "IfcWall");
    assert.equal(paredes.length, 6, `se esperaban 6 muros, hay ${paredes.length}`);

    // Cajas medidas desde los vértices reales de la app (no desde lo que dice el
    // código): la unión no puede salir de la caja esperada ni quedarse corta.
    const grupos = [
      { nombre: "L 15/20", x0: 0, x1: 4.1, y0: -0.075, y1: 3, filtro: (c) => c.x0 < 5 },
      { nombre: "T 15/20", x0: 6, x1: 12, y0: -0.075, y1: 3, filtro: (c) => c.x0 >= 5 && c.x0 < 13 },
      { nombre: "L 15/15", x0: 14, x1: 18.075, y0: -0.075, y1: 3, filtro: (c) => c.x0 >= 13 },
    ];
    const cajas = paredes.map((e) => ({ elemento: e, caja: cajaDe([e]) }));
    for (const grupo of grupos) {
      const miembros = cajas.filter(({ caja }) => grupo.filtro(caja));
      assert.equal(miembros.length, 2, `${grupo.nombre}: se esperaban dos muros`);
      const caja = cajaDe(miembros.map((m) => m.elemento));
      // Tolerancia de 1 µm: la geometría no puede tener un pico fuera de la caja.
      cerca(caja.x0, grupo.x0, `${grupo.nombre} x0`);
      cerca(caja.x1, grupo.x1, `${grupo.nombre} x1`);
      cerca(caja.y0, grupo.y0, `${grupo.nombre} y0`);
      cerca(caja.y1, grupo.y1, `${grupo.nombre} y1`);
      cerca(caja.z0, 0, `${grupo.nombre} z0`);
      cerca(caja.z1, 3, `${grupo.nombre} z1`);
    }

    // Volumen a mano de la unión de los tres grupos (altura 3.00):
    // L 15/20: 4·0.15 + 3·0.20 − 0.10·0.075 = 1.1925 m²
    // T 15/20: 6·0.15 + 3·0.20 − 0.20·0.075 = 1.4850 m²
    // L 15/15: 4·0.15 + 3·0.15 − 0.075·0.075 = 1.044375 m²
    // Total: (1.1925 + 1.485 + 1.044375) · 3 = 11.165625 m³
    const cantidades = await invocar(ses, "cantidades.estructura", {});
    cerca(cantidades.union_m3, 11.165625, "volumen de la unión");
    cerca(cantidades.total.volumen_neto_m3, 11.165625, "suma de netos");
    // Ningún muro puede aportar más que su propio prisma bruto: un traslape o un
    // pico haría que la unión midiera más que la suma de prismas.
    for (const muro of cantidades.elementos) {
      assert.ok(
        muro.volumen_neto_m3 <= muro.volumen_bruto_m3 + 1e-6,
        `${muro.globalid} neto ${muro.volumen_neto_m3} > bruto ${muro.volumen_bruto_m3}`,
      );
    }

    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "3D Isométrica");
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "esquinas-L-T-3d.png"));
    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await ses.captura(path.join(PROGRESO, "esquinas-L-T-planta.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O023-3: el rango de vista avanzado está plegado por omisión y no molesta", async () => {
  const ses = await Sesion.abrir({
    prueba: "o023-rango",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "Planta Nivel 0");
    const grupo = await ses.porTestid("vista-rango-avanzado");
    assert.equal(await grupo.getTagName(), "details");
    assert.equal(await grupo.getAttribute("open"), null, "el grupo no debe venir abierto");
    const resumen = await grupo.findElement(By.css("summary"));
    assert.match(await resumen.getText(), /Rango de vista \(avanzado\)/);
    assert.match(
      await resumen.getAttribute("title"),
      /No cambia la altura del nivel/,
      "el resumen debe explicar que no es la altura del nivel",
    );
    const altura = await ses.driver.findElement(By.css('[data-testid="vista-altura"]'));
    assert.equal(await altura.isDisplayed(), false, "los campos avanzados no deben verse plegados");
    const profundidad = await ses.driver.findElement(By.css('[data-testid="vista-profundidad"]'));
    assert.equal(await profundidad.isDisplayed(), false);
    await resumen.click();
    await esperar(250);
    assert.equal(await altura.isDisplayed(), true, "el grupo debe poder abrirse");
    await resumen.click();
    await esperar(250);
    assert.equal(await altura.isDisplayed(), false, "el grupo debe poder cerrarse");
    // Un alzado no pide rango de vista.
    await elegirVista(ses, "Alzado Norte");
    assert.equal(
      (await ses.driver.findElements(By.css('[data-testid="vista-rango-avanzado"]'))).length,
      0,
      "el alzado no debe mostrar el rango de vista de planta",
    );
    await ses.captura(path.join(PROGRESO, "rango-vista-plegado.png"));
  } finally {
    await ses.cerrar();
  }
});

async function ponerElevacion(ses, globalid, texto) {
  const entrada = await ses.porTestid(`nivel-elevacion-${globalid}`);
  await entrada.sendKeys(Key.CONTROL, "a");
  await entrada.sendKeys(texto);
  await ses.driver.executeScript((el) => el.blur(), entrada);
  await esperar(450);
}

async function elevacionDe(ses, globalid) {
  const niveles = await invocar(ses, "modelo.niveles");
  return niveles.find((n) => n.globalid === globalid)?.elevacion;
}

test("O023-4: elevaciones, error junto a la caja, cota Total y ejes ordenados al norte", async () => {
  const ses = await Sesion.abrir({
    prueba: "o023-niveles",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await activar(ses, "cmd-nivel");
    await activar(ses, "cmd-nivel");
    const niveles = await invocar(ses, "modelo.niveles");
    assert.equal(niveles.length, 3);
    const objetivo = niveles.find((n) => Math.abs(n.elevacion - 3) < 1e-6);
    assert.ok(objetivo, "falta el nivel de 3.00");

    const modulo = await ses.driver.wait(
      until.elementLocated(By.css('[data-modulo="niveles"]')),
      10_000,
    );
    await modulo.click();
    await esperar(250);

    // Se parte de 5.00 en cada caso para demostrar que el formato SÍ cambia el
    // valor (no que se ignora y queda el anterior).
    for (const [texto, esperado] of [
      [".1", 0.1],
      ["0.1", 0.1],
      ["0,1", 0.1],
      ["10cm", 0.1],
      ["-3", -3],
    ]) {
      await ponerElevacion(ses, objetivo.globalid, "5");
      cerca(await elevacionDe(ses, objetivo.globalid), 5, "base de la prueba");
      await ponerElevacion(ses, objetivo.globalid, texto);
      const valor = await elevacionDe(ses, objetivo.globalid);
      cerca(valor, esperado, `«${texto}»`);
      const error = await ses.driver.findElements(
        By.css(`[data-testid="nivel-error-${objetivo.globalid}"]`),
      );
      assert.equal(error.length, 0, `«${texto}» no debería dar error`);
    }

    // Texto inválido: mensaje junto a la caja (misma celda) y valor intacto.
    await ponerElevacion(ses, objetivo.globalid, "abc");
    cerca(await elevacionDe(ses, objetivo.globalid), -3, "el valor no debe cambiar con «abc»");
    const mensaje = await textoDom(ses, `[data-testid="nivel-error-${objetivo.globalid}"]`);
    assert.match(mensaje ?? "", /Cota no válida/);
    const juntos = await ses.driver.executeScript((gid) => {
      const entrada = document.querySelector(`[data-testid="nivel-elevacion-${gid}"]`);
      const error = document.querySelector(`[data-testid="nivel-error-${gid}"]`);
      if (!entrada || !error) return false;
      const celda = entrada.closest("td");
      return !!celda && celda.contains(error);
    }, objetivo.globalid);
    assert.equal(juntos, true, "el error debe estar en la misma celda que la caja");
    assert.equal(
      (await ses.driver.findElements(By.css('[data-testid="cota-error"]'))).length,
      0,
      "el error no debe irse a la barra de estado",
    );

    // Ejes creados en orden no monótono: 8, 0, 4, 2 y 6.
    await (await ses.driver.findElement(By.css('[data-modulo="modelo"]'))).click();
    await esperar(250);
    await cambiarPestana(ses, "Modelar");
    for (const x of [8, 0, 4, 2, 6]) {
      await activar(ses, "cmd-eje");
      await clicMundo(ses, x, -1);
      await clicMundo(ses, x, 6);
      await tecla(ses, "Escape", "Escape");
    }
    await cambiarPestana(ses, "Vista");
    await elegirVista(ses, "Alzado Norte");
    // Desde el norte (+Y mirando a −Y), +X queda a la izquierda: de izquierda a
    // derecha se ven x=8,6,4,2,0, que son las etiquetas 1,5,3,4,2.
    assert.equal(
      await atributoVisor(ses, "ejes-alzado-orden"),
      "1,5,3,4,2",
      "el orden de los globos debe seguir la orientación norte",
    );
    // Niveles: −3.00, 0.00 y 6.00 → dos parciales de 3.00 y 6.00, total 9.00.
    // O025 pone la total en su fila como número solo, sin la palabra «Total».
    const filas = JSON.parse((await atributoVisor(ses, "niveles-cotas")) || "[]");
    assert.deepEqual(filas[0].parciales, ["3.00", "6.00"], "la cadena de cotas es 3.00 y 6.00");
    assert.equal(filas[0].total, "9.00", "la cota total debe ser 9.00");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await ses.captura(path.join(PROGRESO, "niveles-ejes-norte.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O023-5: la planta no tiene cotas sueltas; todas salen de los ejes o del rebase", async () => {
  const ses = await Sesion.abrir({
    prueba: "o023-cotas",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    await activar(ses, "cmd-nivel");
    await activar(ses, "cmd-nivel");
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
    await esperar(600);
    await activar(ses, "visor-ajustar");
    await esperar(600);

    const ejes = await invocar(ses, "ejes.listar");
    const verticales = ejes.filter((e) => e.vertical).map((e) => e.x1).sort((a, b) => a - b);
    const horizontales = ejes.filter((e) => !e.vertical).map((e) => e.y1).sort((a, b) => a - b);
    assert.equal(verticales.length, 5);
    assert.equal(horizontales.length, 5);
    const distancias = (valores) =>
      valores.slice(1).map((v, i) => (v - valores[i]).toFixed(2)).sort();

    const familias = JSON.parse((await atributoVisor(ses, "cotas")) || "[]");
    assert.equal(familias.length, 2, "solo debe haber una cadena por dirección");
    const esperadas = {
      true: distancias(verticales),
      false: distancias(horizontales),
    };
    for (const familia of familias) {
      const parciales = [...familia.parciales].sort();
      assert.deepEqual(
        parciales,
        esperadas[familia.vertical],
        `las parciales ${familia.vertical ? "verticales" : "horizontales"} deben ser las separaciones entre ejes`,
      );
      // Toda cota vertical/horizontal se rotula si es rebase; ninguna «2.00» suelta.
      assert.equal(familia.rebase, "2.00", "el rebase debe medir 2.00");
      const valores = (familia.vertical ? verticales : horizontales);
      assert.equal(
        familia.total,
        (valores[valores.length - 1] - valores[0]).toFixed(2),
        "la total debe ser la distancia entre los ejes extremos",
      );
    }
    // El «2.00» azul ya no es una cota suelta: el texto dibujado lleva «Rebase».
    assert.equal(
      await atributoVisor(ses, "cotas-rebases"),
      "Rebase 2.00,Rebase 2.00",
      "los rebases deben estar rotulados en el dibujo",
    );
    // Las etiquetas dibujadas son exactamente parciales + total + «Rebase».
    const visuales = await ses.driver.executeScript(() => {
      const texto = document.querySelector('[data-testid="visor"]')?.dataset.nivelesTexto ?? "";
      return texto;
    });
    assert.equal(visuales, "", "una planta no debe dibujar cotas de nivel sueltas");
    await ses.captura(path.join(PROGRESO, "cotas-sin-sueltas.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O023-6: la cámara no se mueve al crear y editar cinco elementos", async () => {
  const ses = await Sesion.abrir({
    prueba: "o023-camara",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await nuevoModelo(ses);
    const nombres = ["Planta Nivel 0", "Alzado Norte", "3D Isométrica", "3D Perspectiva"];
    const antes = {};
    for (const nombre of nombres) {
      await elegirVista(ses, nombre);
      const inicial = await camara(ses);
      await rueda(ses, nombre.includes("Perspectiva") ? -180 : -240);
      await panear(ses, nombre.includes("3D") ? 35 : 55, 25);
      antes[nombre] = await camara(ses);
      assert.ok(
        iguales(inicial, antes[nombre]).length > 0,
        `el zoom de «${nombre}» no cambió la cámara`,
      );
    }

    await elegirVista(ses, "Planta Nivel 0");
    await activar(ses, "cmd-nivel");
    const visibles = await ses.driver.findElements(By.css('[data-testid^="nivel-visible-"]'));
    for (const check of visibles) {
      if (!(await check.isSelected())) await check.click();
    }
    await esperar(250);
    await cambiarPestana(ses, "Modelar");
    await activar(ses, "cmd-eje");
    await clicMundo(ses, -1, -1);
    await clicMundo(ses, -1, 6);
    await tecla(ses, "Escape", "Escape");
    await dibujarMuro(ses, 0, 0, 5, 0, "Block 15");
    await ses.driver.wait(async () => {
      const visor = await ses.porTestid("visor");
      return Number(await visor.getAttribute("data-mallas")) >= 1;
    }, 15_000, "no se teseló el muro");
    await elegirVista(ses, "Alzado Norte");
    // O025 muestra la elevación del nivel como «Npt +3.00m»; las cotas «3.00» de
    // la cadena son distancias entre niveles, no elevaciones.
    await dobleClicCota(ses, "Npt +3.00m", 0);
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
      assert.deepEqual(
        diferencias,
        [],
        `la cámara de «${nombre}» se movió tras crear/editar: ${diferencias.join("; ")}`,
      );
    }
    await ses.captura(path.join(PROGRESO, "camara-estable.png"));
  } finally {
    await ses.cerrar();
  }
});
