// O011: ejes con codos y extremos libres, anotación nítida, niveles en alzado y
// paneles plegables. Se ejecuta sobre la app real (Tauri + WebKitGTK).
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Sesion, esperar, By, until, Key } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const RESULTADOS = path.join(RAIZ, "resultados", "O011");
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
  await esperar(250);
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

async function proyectar(ses, x, y, z = 0) {
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

async function clicMundo(ses, x, y) {
  const punto = await proyectar(ses, x, y);
  await clicEn(ses, punto);
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
  await esperar(320);
}

async function tecla(ses, key, code, extras = {}) {
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
  await esperar(250);
}

async function crearModelo(ses) {
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

async function crearNiveles(ses, cantidad) {
  for (let i = 0; i < cantidad; i += 1) await activar(ses, "cmd-nivel");
}

async function dibujarEjes(ses, xs) {
  await activar(ses, "cmd-eje");
  for (const x of xs) {
    await clicMundo(ses, x, -2);
    await clicMundo(ses, x, 8);
  }
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(400);
  // O010 conserva la cámara entre ediciones; «Ajustar» encuadra los ejes nuevos.
  await activar(ses, "visor-ajustar");
  await esperar(600);
}

async function dibujarMuroAlto(ses, alto) {
  await activar(ses, "cmd-muro");
  await fijarValor(ses, "muro-altura", String(alto));
  await clicMundo(ses, 0, 0);
  await clicMundo(ses, 18, 0);
  await tecla(ses, "Escape", "Escape");
  await tecla(ses, "Escape", "Escape");
  await esperar(700);
}

async function seleccionarEje(ses, etiqueta) {
  const punto = await ses.driver.executeScript(
    (etiqueta) => {
      const visor = document.querySelector('[data-testid="visor"]');
      return visor.__openrvtEjeLineaAPantalla(etiqueta);
    },
    etiqueta,
  );
  assert.ok(punto, `no se pudo proyectar el eje ${etiqueta}`);
  await clicEn(ses, punto);
  await ses.driver.wait(
    async () => (await atributoVisor(ses, "eje-seleccionado")) !== null,
    5_000,
    "el eje no quedó seleccionado",
  );
}

async function ajustes(ses) {
  return JSON.parse((await atributoVisor(ses, "ejes-ajustes")) || "{}");
}

async function arrastrarExtremo(ses, etiqueta, lado, destinoMundo) {
  const inicio = await ses.driver.executeScript(
    (etiqueta, lado) => {
      const visor = document.querySelector('[data-testid="visor"]');
      return visor.__openrvtEjeAPantalla(etiqueta, lado);
    },
    etiqueta,
    lado,
  );
  const fin = await proyectar(ses, destinoMundo[0], destinoMundo[1]);
  assert.ok(inicio && fin, "no se pudieron proyectar los extremos del arrastre");
  await ses.driver.executeScript(
    (inicio, fin) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 7,
        pointerType: "mouse",
        clientX: inicio.x,
        clientY: inicio.y,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", abajo));
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...abajo, clientX: fin.x, clientY: fin.y }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", { ...abajo, buttons: 0, clientX: fin.x, clientY: fin.y }),
      );
    },
    inicio,
    fin,
  );
  await esperar(700);
}

test("O011-1: paneles plegables, atajos y el visor ocupa el espacio", async () => {
  const ses = await Sesion.abrir({
    prueba: "o011-paneles",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    const anchoInicial = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"] canvas').getBoundingClientRect().width,
    );
    await activar(ses, "panel-izquierdo-plegar");
    const anchoIzq = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"] canvas').getBoundingClientRect().width,
    );
    assert.ok(
      anchoIzq >= anchoInicial + 150,
      `el visor no creció al plegar Vistas: ${anchoInicial} → ${anchoIzq}`,
    );
    assert.equal(
      (await ses.driver.findElements(By.css('[data-testid="panel-vistas"]'))).length,
      0,
      "el panel Vistas no se plegó",
    );

    await activar(ses, "panel-derecho-plegar");
    const anchoDer = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"] canvas').getBoundingClientRect().width,
    );
    assert.ok(
      anchoDer >= anchoIzq + 200,
      `el visor no creció al plegar Propiedades: ${anchoIzq} → ${anchoDer}`,
    );
    await ses.captura(path.join(RESULTADOS, "paneles-plegados.png"));

    // La preferencia queda en config.json de la app.
    await esperar(600);
    const config = JSON.parse(fs.readFileSync(path.join(ses.datos, "config.json"), "utf8"));
    assert.equal(config.panel_izquierdo_plegado, true);
    assert.equal(config.panel_derecho_plegado, true);

    // Los botones de abrir devuelven los paneles y el visor se reajusta.
    await activar(ses, "panel-izquierdo-abrir");
    await activar(ses, "panel-derecho-abrir");
    const anchoVuelta = await ses.driver.executeScript(
      () => document.querySelector('[data-testid="visor"] canvas').getBoundingClientRect().width,
    );
    assert.ok(
      anchoVuelta <= anchoInicial + 2,
      `el visor no volvió a su ancho: ${anchoInicial} vs ${anchoVuelta}`,
    );

    // Ctrl+Alt+← y Ctrl+Alt+→ pliegan y abren.
    await tecla(ses, "ArrowLeft", "ArrowLeft", { ctrlKey: true, altKey: true });
    assert.equal(
      (await ses.driver.findElements(By.css('[data-testid="panel-vistas"]'))).length,
      0,
      "Ctrl+Alt+← no plegó Vistas",
    );
    await tecla(ses, "ArrowRight", "ArrowRight", { ctrlKey: true, altKey: true });
    assert.equal(
      (await ses.driver.findElements(By.css('[data-testid="panel-propiedades"]'))).length,
      0,
      "Ctrl+Alt+→ no plegó Propiedades",
    );
    await tecla(ses, "ArrowLeft", "ArrowLeft", { ctrlKey: true, altKey: true });
    await tecla(ses, "ArrowRight", "ArrowRight", { ctrlKey: true, altKey: true });
    assert.ok((await ses.driver.findElements(By.css('[data-testid="panel-vistas"]'))).length > 0);
    assert.ok(
      (await ses.driver.findElements(By.css('[data-testid="panel-propiedades"]'))).length > 0,
    );
  } finally {
    await ses.cerrar();
  }
});

test("O011-2: dos codos, tercero deshabilitado, candado, guardar/reabrir y deshacer", async () => {
  const ses = await Sesion.abrir({
    prueba: "o011-ejes",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o011-"));
  const ruta = path.join(carpeta, "o011-ejes.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 1);
    await dibujarEjes(ses, [0, 6, 13]);

    await elegirVista(ses, "Planta Nivel 0");
    const referencias = await invocar(ses, "modelo.referencias");
    assert.equal(referencias.ejes.length, 3, "faltan ejes de la prueba");
    const eje1 = referencias.ejes.find((e) => e.etiqueta === "1");
    assert.ok(eje1, "falta el eje 1");
    assert.ok(eje1.vertical, "el eje 1 debe ser vertical");

    await seleccionarEje(ses, "1");
    await activar(ses, "eje-codo-fin-agregar");
    let a = await ajustes(ses);
    assert.equal(a[eje1.globalid].codosFin.length, 1);
    // 5 mm de papel a 1:100 = 0.5 m; el primer codo va 0.5 m hacia la línea y
    // 0.5 m de lado. La dirección es del globo al interior y el lado, +X.
    const fin = [eje1.x2, eje1.y2];
    const interior = [eje1.x1, eje1.y1];
    const largo = Math.hypot(interior[0] - fin[0], interior[1] - fin[1]);
    const dir = [(interior[0] - fin[0]) / largo, (interior[1] - fin[1]) / largo];
    const esperado1 = [fin[0] + dir[0] * 0.5 - dir[1] * 0.5, fin[1] + dir[1] * 0.5 + dir[0] * 0.5];
    assert.ok(
      Math.abs(a[eje1.globalid].codosFin[0][0] - esperado1[0]) < 1e-6 &&
        Math.abs(a[eje1.globalid].codosFin[0][1] - esperado1[1]) < 1e-6,
      `el codo no está a 5 mm: ${JSON.stringify(a[eje1.globalid].codosFin[0])} vs ${esperado1}`,
    );
    await activar(ses, "eje-codo-fin-agregar");
    a = await ajustes(ses);
    assert.equal(a[eje1.globalid].codosFin.length, 2);
    const boton = await ses.porTestid("eje-codo-fin-agregar");
    assert.equal(await boton.getAttribute("disabled"), "true", "el tercer codo debe estar deshabilitado");
    await ses.captura(path.join(RESULTADOS, "eje-2-codos.png"));

    // Abrir el candado del fin y arrastrarlo 1 m: solo ese eje cambia.
    await activar(ses, "eje-candado-fin");
    assert.equal(await (await ses.porTestid("eje-candado-fin")).getAttribute("aria-pressed"), "true");
    await arrastrarExtremo(ses, "1", "fin", [fin[0], fin[1] + 1]);
    a = await ajustes(ses);
    assert.deepEqual(Object.keys(a), [eje1.globalid], "el arrastre con candado abierto tocó otros ejes");
    assert.ok(a[eje1.globalid].extremoFin, "no se guardó el extremo libre");
    assert.ok(
      Math.abs(a[eje1.globalid].extremoFin[1] - (fin[1] + 1)) < 0.05,
      `el extremo no se movió 1 m: ${a[eje1.globalid].extremoFin}`,
    );

    // Ctrl+Z: una entrada por arrastre.
    await tecla(ses, "z", "KeyZ", { ctrlKey: true });
    a = await ajustes(ses);
    assert.equal(a[eje1.globalid]?.extremoFin, undefined, "Ctrl+Z no deshizo el arrastre");

    // Cerrar el candado devuelve el extremo a la alineación.
    await activar(ses, "eje-candado-fin");
    a = await ajustes(ses);
    assert.equal(a[eje1.globalid]?.extremoFin, undefined);
    assert.equal(a[eje1.globalid].codosFin.length, 2, "los codos no deben perderse al cerrar el candado");

    // Guardar, reabrir y comprobar que los ajustes de la vista persisten.
    await cambiarPestana(ses, "Inicio");
    await activar(ses, "cmd-guardar");
    await esperar(900);
    await activar(ses, "cmd-abrir");
    await ses.driver.wait(async () => {
      try {
        return (await textoDom(ses, '[data-testid="estado-modelo"]')) === "o011-ejes.ifc";
      } catch {
        return false;
      }
    }, 30_000, "no reabrió el modelo");
    await elegirVista(ses, "Planta Nivel 0");
    const reabierto = await ajustes(ses);
    assert.equal(reabierto[eje1.globalid].codosFin.length, 2, "los codos no persistieron");
    assert.equal(reabierto[eje1.globalid].codosFin[0][0], a[eje1.globalid].codosFin[0][0]);

    // En la sesión reabierta, otro arrastre y Ctrl+Z vuelven al estado guardado.
    await seleccionarEje(ses, "1");
    await activar(ses, "eje-candado-fin");
    const baseReabierta = await invocar(ses, "modelo.referencias");
    const ejeReabierto = baseReabierta.ejes.find((e) => e.etiqueta === "1");
    await arrastrarExtremo(ses, "1", "fin", [ejeReabierto.x2, ejeReabierto.y2 + 1]);
    assert.ok((await ajustes(ses))[eje1.globalid]?.extremoFin, "no se movió en la sesión reabierta");
    await tecla(ses, "z", "KeyZ", { ctrlKey: true });
    assert.equal((await ajustes(ses))[eje1.globalid]?.extremoFin, undefined);
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test("O011-3: cotas .15 por la pantalla y niveles/globos del alzado", async () => {
  const ses = await Sesion.abrir({
    prueba: "o011-alzado",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  try {
    await crearModelo(ses);
    await crearNiveles(ses, 4);
    await dibujarMuroAlto(ses, 13);
    await dibujarEjes(ses, [0, 3, 6, 9, 12, 15, 18]);
    const niveles = await invocar(ses, "modelo.niveles");
    assert.equal(niveles.length, 5, "deben ser 5 niveles");
    const referencias = await invocar(ses, "modelo.referencias");
    assert.equal(referencias.ejes.length, 7, "deben ser 7 ejes");

    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    const orden = (await atributoVisor(ses, "ejes-alzado-orden")).split(",");
    assert.equal(orden.length, 7, "no se ven los 7 ejes en el alzado");
    const nivelMin = Number(await atributoVisor(ses, "ejes-nivel-min"));
    const nivelMax = Number(await atributoVisor(ses, "ejes-nivel-max"));
    const globoZ = Number(await atributoVisor(ses, "ejes-globo-z"));
    assert.equal(nivelMax, 12, "el nivel más alto debe ser el Nivel 4");
    assert.ok(globoZ > nivelMax, `el globo debe quedar arriba del Nivel 4: ${globoZ} <= ${nivelMax}`);
    assert.ok(globoZ - nivelMax >= 0.3, "falta el margen de 3 mm del globo");

    const x = JSON.parse(await atributoVisor(ses, "niveles-x"));
    assert.equal(x.ejes.length, 7);
    assert.ok(
      x.desde <= Math.min(...x.ejes) && x.hasta >= Math.max(...x.ejes),
      `las líneas de nivel no cubren todos los ejes: ${JSON.stringify(x)}`,
    );

    // Ningún globo queda por debajo del Nivel 4 (comparación en pantalla).
    const yNivel4 = await ses.driver.executeScript(async () => {
      const visor = document.querySelector('[data-testid="visor"]');
      const texto = JSON.parse(visor.getAttribute("data-niveles-cotas"));
      const cabecera = texto.flatMap((n) => n.cabezas).find((c) => c.startsWith("Nivel 4"));
      return visor.__openrvtCotaAPantalla(cabecera, 0).y;
    });
    for (const etiqueta of orden) {
      const globo = await ses.driver.executeScript(
        (etiqueta) =>
          document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, "fin"),
        etiqueta,
      );
      assert.ok(globo.y < yNivel4, `el globo del eje ${etiqueta} no está arriba del Nivel 4`);
    }
    // Los codos y su menú contextual también funcionan en el alzado.
    await seleccionarEje(ses, "3");
    await activar(ses, "eje-codo-fin-agregar");
    let ajustesAlzado = await ajustes(ses);
    const eje3 = referencias.ejes.find((e) => e.etiqueta === "3");
    assert.equal(
      ajustesAlzado[eje3.globalid]?.codosFin?.length,
      1,
      "el codo del alzado no se guardó",
    );
    const codoPunto = await ses.driver.executeScript(() =>
      document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla("3", "fin", 0),
    );
    assert.ok(codoPunto, "no se proyectó el asa del codo");
    await ses.driver.executeScript(
      (punto) => {
        const canvas = document.querySelector('[data-testid="visor"] canvas');
        canvas.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: punto.x,
            clientY: punto.y,
          }),
        );
      },
      codoPunto,
    );
    await esperar(300);
    await activar(ses, "eje-quitar-codo");
    ajustesAlzado = await ajustes(ses);
    assert.equal(
      ajustesAlzado[eje3.globalid]?.codosFin?.length,
      undefined,
      "«Quitar codo» no eliminó el codo",
    );

    await ses.captura(path.join(RESULTADOS, "alzado-norte.png"));

    // Nitidez: globo de 8 mm de papel a ×1 y ×8, con el borde escalado. Se elige
    // el globo más cercano al centro para que el zoom ×8 no lo saque de pantalla.
    const centroVisor = await ses.driver.executeScript(() => {
      const r = document.querySelector('[data-testid="visor"] canvas').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    let etiquetaGlobo = null;
    let menor = Infinity;
    for (const etiqueta of orden) {
      const p = await ses.driver.executeScript(
        (etiqueta) =>
          document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, "fin"),
        etiqueta,
      );
      const d = Math.hypot(p.x - centroVisor.x, p.y - centroVisor.y);
      if (d < menor) {
        menor = d;
        etiquetaGlobo = etiqueta;
      }
    }
    const antes = await ses.driver.executeScript(
      (etiqueta) =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla(etiqueta),
      etiquetaGlobo,
    );
    assert.ok(antes && antes.radio > 4, `no se encontró el globo del eje ${etiquetaGlobo}`);
    await ses.captura(path.join(RESULTADOS, "globo-zoom-x1.png"));
    await ses.driver.executeScript(
      (x, y) => document.querySelector('[data-testid="visor"]').__openrvtZoomEn(0.125, x, y),
      antes.x,
      antes.y,
    );
    await esperar(600);
    const despues = await ses.driver.executeScript(
      (etiqueta) =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeBurbujaPantalla(etiqueta),
      etiquetaGlobo,
    );
    assert.ok(
      despues.radio > antes.radio * 5,
      `el globo no creció con el zoom ×8: ${antes.radio} → ${despues.radio}`,
    );
    const png = path.join(RESULTADOS, "globo-zoom-x8.png");
    await ses.captura(png);

    const guion = String.raw`
import sys, math
from PIL import Image, ImageChops
ruta, cx, cy, r, ancho, alto, hex_fondo, hex_anillo = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), sys.argv[7], sys.argv[8]
img = Image.open(ruta).convert("RGB")
sx = img.width / ancho
sy = img.height / alto
px = lambda x, y: img.getpixel((max(0, min(img.width-1, round(x*sx))), max(0, min(img.height-1, round(y*sy)))))
def dist(a, b):
    return math.sqrt(sum((a[i]-b[i])**2 for i in range(3)))
# El color del fondo se toma de una esquina del visor (fuera del globo).
fondo = px(img.width - 5, img.height - 5)
# Calibrar el anillo con la propia imagen: color más contrastado en la banda del
# borde (excluye el texto, que está en el centro).
mejor = -1
anillo = None
radio_anillo = r
for i in range(0, 360, 2):
    a = math.radians(i)
    for rr in range(int(0.55*r), int(1.45*r)+1):
        c = px(cx + math.cos(a)*rr, cy + math.sin(a)*rr)
        d = dist(c, fondo)
        if d > mejor and d > 20:
            mejor = d
            anillo = c
            radio_anillo = rr
# Recorrido radial hacia arriba (zona vacía sobre el globo), desde dentro del
# relleno hasta más allá del anillo.
intermedios = 0
max_racha = 0
cercanos = 0
for k in range(int(0.60*radio_anillo), int(1.40*radio_anillo)+1):
    c = px(cx, cy - k)
    if dist(c, anillo) <= 45:
        cercanos += 1
    if dist(c, fondo) > 20 and dist(c, anillo) > 45:
        intermedios += 1
        max_racha = max(max_racha, intermedios)
    else:
        intermedios = 0
print(f"{max_racha} {mejor:.1f} {cercanos}")
`;
    const [racha, contraste, cercanos] = execFileSync(
      "python3",
      [
        "-c",
        guion,
        png,
        String(despues.x),
        String(despues.y),
        String(despues.radio),
        String(despues.anchoVentana),
        String(despues.altoVentana),
        String(despues.colorFondo),
        String(despues.colorAnillo),
      ],
      { encoding: "utf8" },
    )
      .trim()
      .split(" ")
      .map(Number);
    // La medición debe haber encontrado el anillo (contraste y pixeles del borde).
    assert.ok(contraste > 30, `no se encontró el anillo del globo: contraste ${contraste}`);
    assert.ok(cercanos > 0, "la línea radial no cruzó el anillo del globo");
    assert.ok(
      racha <= 2,
      `el borde del globo está rasterizado: racha de ${racha} píxeles intermedios a ×8`,
    );

    // Captura de entrega: el mismo eje con dos codos, ampliado para verlos.
    await activar(ses, "visor-ajustar");
    await esperar(500);
    await seleccionarEje(ses, etiquetaGlobo);
    await activar(ses, "eje-codo-fin-agregar");
    await activar(ses, "eje-codo-fin-agregar");
    const conCodos = await ajustes(ses);
    const gidCentral = referencias.ejes.find((e) => e.etiqueta === etiquetaGlobo).globalid;
    assert.equal(conCodos[gidCentral]?.codosFin?.length, 2);
    const globoCentral = await ses.driver.executeScript(
      (etiqueta) =>
        document.querySelector('[data-testid="visor"]').__openrvtEjeAPantalla(etiqueta, "fin"),
      etiquetaGlobo,
    );
    await ses.driver.executeScript(
      (x, y) => document.querySelector('[data-testid="visor"]').__openrvtZoomEn(0.2, x, y),
      globoCentral.x,
      globoCentral.y,
    );
    await esperar(500);
    await ses.captura(path.join(RESULTADOS, "eje-2-codos.png"));
  } finally {
    await ses.cerrar();
  }
});
