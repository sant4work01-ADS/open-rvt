// O014b: texto legible en cortes, codo de cabezas de nivel y codo de burbujas de eje.
// Se ejecuta sobre la app real (Tauri), como los e2e de O011/O013/O014a.
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Sesion, esperar, By, until } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");
const CAPTURAS = path.join(RAIZ, "docs", "capturas");
const RESULTADOS = path.join(RAIZ, "resultados", "O014b");
fs.mkdirSync(CAPTURAS, { recursive: true });
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
  await esperar(200);
}

async function activar(ses, testid) {
  await (await ses.porTestid(testid)).click();
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
  await esperar(700);
}

async function elegirPrimerCorte(ses) {
  const boton = await ses.driver.wait(
    until.elementLocated(By.xpath(`//button[@data-testid="vista-item"][@data-tipo="corte"]`)),
    10_000,
    "no apareció la vista de corte",
  );
  await boton.click();
  await esperar(800);
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
  await esperar(320);
}

async function tecla(ses, key, code) {
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

async function guardarYReabrir(ses, nombre) {
  await cambiarPestana(ses, "Inicio");
  await activar(ses, "cmd-guardar");
  await esperar(900);
  await activar(ses, "cmd-abrir");
  await ses.driver.wait(async () => {
    try {
      return (await textoDom(ses, '[data-testid="estado-modelo"]')) === nombre;
    } catch {
      return false;
    }
  }, 30_000, "no reabrió el modelo");
}

function seIntersectan(a, b, margen = 0.5) {
  return (
    a.x0 < b.x1 - margen &&
    b.x0 < a.x1 - margen &&
    a.y0 < b.y1 - margen &&
    b.y0 < a.y1 - margen
  );
}

async function cajasCabezasNivel(ses) {
  const datos = JSON.parse(await atributoVisor(ses, "niveles-cabezas"));
  const [h0, h1] = datos.h;
  const [d0, d1] = datos.d;
  const cajas = [];
  for (const cabeza of datos.cabezas) {
    assert.ok(cabeza.caja, `la cabeza ${cabeza.elev} no publica su caja en mundo`);
    const { t0, t1, z0, z1 } = cabeza.caja;
    const esquinas = [
      [t0, z0],
      [t1, z0],
      [t1, z1],
      [t0, z1],
    ];
    const puntos = [];
    for (const [t, z] of esquinas) {
      const p = await proyectar(
        ses,
        h0 * t + d0 * datos.profundidad,
        h1 * t + d1 * datos.profundidad,
        z,
      );
      assert.ok(p, "no se pudo proyectar la caja de una cabeza de nivel");
      puntos.push(p);
    }
    cajas.push({
      elev: cabeza.elev,
      x0: Math.min(...puntos.map((p) => p.x)),
      y0: Math.min(...puntos.map((p) => p.y)),
      x1: Math.max(...puntos.map((p) => p.x)),
      y1: Math.max(...puntos.map((p) => p.y)),
    });
  }
  return cajas;
}

async function comprobarCabezasSeparadas(ses, contexto) {
  const cajas = await cajasCabezasNivel(ses);
  assert.equal(cajas.length, 4, `faltan cajas de cabeza (${contexto})`);
  for (let i = 0; i < cajas.length; i += 1) {
    for (let j = i + 1; j < cajas.length; j += 1) {
      assert.ok(
        !seIntersectan(cajas[i], cajas[j]),
        `las cabezas ${cajas[i].elev} y ${cajas[j].elev} se intersectan en pantalla (${contexto}): ` +
          `${JSON.stringify(cajas[i])} vs ${JSON.stringify(cajas[j])}`,
      );
    }
  }
  return cajas;
}

async function comprobarGuiasNivel(ses, contexto) {
  const datos = JSON.parse(await atributoVisor(ses, "niveles-cabezas"));
  const desplazadas = datos.cabezas.filter((c) => Math.abs(c.desplazamiento) > 1e-9);
  assert.ok(desplazadas.length > 0, `ninguna cabeza se desplazó (${contexto})`);
  for (const cabeza of desplazadas) {
    const guia = datos.guias.find((g) => Math.abs(g.elev - cabeza.elev) < 1e-9);
    assert.ok(guia, `la cabeza ${cabeza.elev} no tiene guía quebrada (${contexto})`);
    assert.equal(guia.puntos.length, 4, `la guía de ${cabeza.elev} no es quebrada`);
    const [a, b, c, d] = guia.puntos;
    assert.ok(Math.abs(a[1] - b[1]) < 1e-9, "el primer tramo de la guía no es horizontal");
    assert.ok(
      Math.abs(b[0] - c[0]) > 1e-9 && Math.abs(b[1] - c[1]) > 1e-9,
      "el tramo central de la guía no es diagonal",
    );
    assert.ok(Math.abs(c[1] - d[1]) < 1e-9, "el último tramo de la guía no es horizontal");
    assert.ok(Math.abs(d[1] - a[1]) > 1e-9, "la guía no llega a la altura de la cabeza");
  }
}

async function anotaciones(ses) {
  const anotaciones = await ses.driver.executeScript(() =>
    document.querySelector('[data-testid="visor"]').__openrvtAlzadoAnotacionesPantalla(),
  );
  assert.ok(anotaciones, "no se pudieron leer las anotaciones");
  return anotaciones;
}

async function arrastrarNivel(ses, globalid, deltaY) {
  const inicio = await ses.driver.executeScript(
    (globalid) =>
      document.querySelector('[data-testid="visor"]').__openrvtNivelAPantalla(globalid),
    globalid,
  );
  assert.ok(inicio, "no se encontró el asa de la cabeza de nivel");
  const fin = { x: inicio.x, y: inicio.y + deltaY };
  await ses.driver.executeScript(
    (inicio, fin) => {
      const canvas = document.querySelector('[data-testid="visor"] canvas');
      const abajo = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pointerId: 9,
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
  await esperar(900);
}

async function dobleClicNivel(ses, globalid) {
  const punto = await ses.driver.executeScript(
    (globalid) =>
      document.querySelector('[data-testid="visor"]').__openrvtNivelAPantalla(globalid),
    globalid,
  );
  assert.ok(punto, "no se encontró el asa de la cabeza de nivel");
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
  await esperar(900);
}

test("O014b: texto legible, codo de niveles y codo de burbujas", async () => {
  const ses = await Sesion.abrir({
    prueba: "o014b",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
    compositar: true,
  });
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-o014b-"));
  const ruta = path.join(carpeta, "o014b.ifc");
  try {
    await instalarDialogos(ses, { abrir: ruta, guardar: ruta });
    await crearModelo(ses);
    await crearNiveles(ses, 3);
    await dibujarMuroAlto(ses, 6);
    await dibujarEjes(ses, [0, 0.3, 12]);

    // Cuatro niveles: 0.00, 2.00, 2.20 y 3.00. Los dos del medio quedan a 0.20 m.
    const niveles = (await invocar(ses, "modelo.niveles")).sort(
      (a, b) => a.elevacion - b.elevacion,
    );
    assert.equal(niveles.length, 4, "faltan niveles de la prueba");
    const elevaciones = [0, 2, 2.2, 3];
    for (let i = 0; i < 4; i += 1) {
      await invocar(ses, "niveles.editar", {
        globalid: niveles[i].globalid,
        nombre: niveles[i].nombre,
        elevacion: elevaciones[i],
      });
    }
    await guardarYReabrir(ses, "o014b.ifc");

    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(800);

    // Parte 1: los textos del alzado son legibles y las cabezas están por encima.
    const texto = await atributoVisor(ses, "niveles-texto");
    for (const esperado of ["Npt 0.00m", "Npt +2.00m", "Npt +2.20m", "Npt +3.00m"]) {
      assert.ok(texto.includes(esperado), `falta «${esperado}» en: ${texto}`);
    }
    const cabezas = JSON.parse(await atributoVisor(ses, "niveles-cabezas"));
    assert.equal(cabezas.cabezas.length, 4, "faltan cabezas dibujadas");
    assert.deepEqual(cabezas.haciaCamara, [0, 1, 0], "el alzado norte no mira desde +Y");

    // Parte 2: las cabezas de 2.00/2.20 suben sin encimarse y conservan el orden.
    const bandas = cabezas.cabezas
      .slice()
      .sort((a, b) => a.z - b.z)
      .map((c) => ({
        z: c.z + cabezas.desfaseInferior,
        elev: c.elev,
        alto: cabezas.altoBanda,
      }));
    for (let i = 1; i < bandas.length; i += 1) {
      assert.ok(
        bandas[i].z >= bandas[i - 1].z + bandas[i - 1].alto - 1e-6,
        `las cabezas ${bandas[i - 1].elev} y ${bandas[i].elev} se enciman`,
      );
    }
    const ajuste = JSON.parse(await atributoVisor(ses, "niveles-ajuste"));
    assert.equal(ajuste.automaticos[0], 0, "el nivel 0.00 no debía subir");
    // O025b separa el par de niveles juntos moviendo el de abajo hacia abajo; el
    // de arriba y el siguiente se recolocan para no encimarse. Lo que importa es
    // que el par quede separado y en orden (la comprobación de bandas sigue abajo).
    assert.ok(ajuste.automaticos[1] < -0.1, "el nivel 2.00 debía bajar con codo");
    assert.ok(
      ajuste.automaticos[2] > ajuste.automaticos[1] + 0.1,
      `el nivel 2.20 no quedó separado del 2.00: ${JSON.stringify(ajuste.automaticos)}`,
    );
    // Aserción geométrica: las cajas en pantalla (triángulo + texto + nombre) de
    // TODOS los pares de cabezas quedan separadas, no solo sus bandas teóricas.
    await comprobarCabezasSeparadas(ses, "alzado 0.00/2.00/2.20/3.00");
    await comprobarGuiasNivel(ses, "alzado 0.00/2.00/2.20/3.00");

    const anot = await anotaciones(ses);
    const etiquetasNivel = anot.etiquetas.filter((e) => e.tipo === "nivel");
    assert.equal(etiquetasNivel.length, 4, "faltan etiquetas de nivel en pantalla");
    // El triángulo queda a la izquierda de su texto: si el texto saliera espejado,
    // el ancla izquierda caería sobre el triángulo.
    const triangulos = cabezas.cabezas.map((c) => ({ z: c.z, t: c.t }));
    for (const etiqueta of etiquetasNivel) {
      const cy = (etiqueta.y0 + etiqueta.y1) / 2;
      let mejor = null;
      let distancia = Infinity;
      for (const t of triangulos) {
        const p = await proyectar(
          ses,
          cabezas.h[0] * t.t + cabezas.d[0] * cabezas.profundidad,
          cabezas.h[1] * t.t + cabezas.d[1] * cabezas.profundidad,
          t.z,
        );
        if (!p) continue;
        const d = Math.abs(p.y - cy);
        if (d < distancia) {
          distancia = d;
          mejor = p;
        }
      }
      assert.ok(mejor, "no se pudo proyectar el triángulo de una etiqueta");
      assert.ok(
        mejor.x < (etiqueta.x0 + etiqueta.x1) / 2,
        `«${etiqueta.texto}» no quedó a la derecha de su triángulo`,
      );
      assert.ok(etiqueta.x1 > etiqueta.x0 + 10, `«${etiqueta.texto}» no tiene ancho legible`);
    }
    await ses.captura(path.join(CAPTURAS, "o014b-alzado-niveles.png"));

    // Parte 2b: arrastrar el asa guarda un desplazamiento manual en la vista; el
    // doble clic en el asa vuelve al automático.
    const nivel22 = niveles[2];
    await arrastrarNivel(ses, nivel22.globalid, -70);
    const ajusteManual = JSON.parse(await atributoVisor(ses, "niveles-ajuste"));
    assert.ok(
      ajusteManual.manuales[nivel22.globalid],
      "el arrastre no guardó el desplazamiento manual",
    );
    assert.ok(
      ajusteManual.manuales[nivel22.globalid].desplazamiento > ajuste.automaticos[2] + 0.1,
      "el arrastre no subió la cabeza lo esperado",
    );
    const guardado = await invocar(ses, "vistas.leer");
    const alzado = guardado.find((v) => v.nombre === "Alzado Norte");
    assert.ok(
      alzado.nivelesAjuste?.[nivel22.globalid],
      "el desplazamiento manual no se guardó en el pset de la vista",
    );
    await dobleClicNivel(ses, nivel22.globalid);
    const ajusteReset = JSON.parse(await atributoVisor(ses, "niveles-ajuste"));
    assert.equal(
      ajusteReset.manuales[nivel22.globalid],
      undefined,
      "el doble clic no devolvió la cabeza al automático",
    );
    assert.equal(
      ajusteReset.automaticos[2],
      ajuste.automaticos[2],
      "el automático cambió tras el doble clic",
    );

    // Parte 3: los ejes 1 y 2 están a 0.30 m y sus burbujas (0.80 m) se encimaban.
    const desplazamientos = JSON.parse(
      await atributoVisor(ses, "ejes-alzado-desplazamientos"),
    );
    // En el alzado norte la horizontal va hacia -X, así que el eje de s mayor es
    // el que estaba en x=0; solo uno de los tres debe desplazarse.
    assert.equal(
      desplazamientos.filter((d) => Math.abs(d) < 1e-9).length,
      2,
      `solo una burbuja debía moverse: ${JSON.stringify(desplazamientos)}`,
    );
    assert.ok(
      Math.max(...desplazamientos) > 0.05,
      `ninguna burbuja se desplazó con codo: ${JSON.stringify(desplazamientos)}`,
    );
    const anotEjes = await anotaciones(ses);
    const globos = anotEjes.globos;
    assert.equal(globos.length, 3, "faltan burbujas de eje");
    for (let i = 0; i < globos.length; i += 1) {
      for (let j = i + 1; j < globos.length; j += 1) {
        const separacion = Math.hypot(globos[j].x - globos[i].x, globos[j].y - globos[i].y);
        assert.ok(
          separacion >= globos[i].radio * 2 * 0.98,
          `las burbujas ${globos[i].etiqueta}/${globos[j].etiqueta} siguen encimadas: ${separacion}`,
        );
      }
    }
    const lineaConCodo = anotEjes.lineas.find((l) => l.puntos.length >= 3);
    assert.ok(lineaConCodo, "ninguna burbuja desplazada tiene codo");
    await ses.captura(path.join(CAPTURAS, "o014b-ejes-codo.png"));

    // Parte 2c: el mismo alzado con tres niveles muy juntos (0.00/0.10/0.20).
    const nivelesJuntos = (await invocar(ses, "modelo.niveles")).sort(
      (a, b) => a.elevacion - b.elevacion,
    );
    const elevacionesJuntas = [0, 0.1, 0.2, 3];
    for (let i = 0; i < 4; i += 1) {
      await invocar(ses, "niveles.editar", {
        globalid: nivelesJuntos[i].globalid,
        nombre: nivelesJuntos[i].nombre,
        elevacion: elevacionesJuntas[i],
      });
    }
    await guardarYReabrir(ses, "o014b.ifc");
    await elegirVista(ses, "Alzado Norte");
    await activar(ses, "visor-ajustar");
    await esperar(800);
    await comprobarCabezasSeparadas(ses, "alzado 0.00/0.10/0.20/3.00");
    await comprobarGuiasNivel(ses, "alzado 0.00/0.10/0.20/3.00");
    const ajusteJuntos = JSON.parse(await atributoVisor(ses, "niveles-ajuste"));
    // O025b abre el par juntos bajando el de abajo y subiendo el de arriba; la
    // banda publicada es el alto mínimo de cada cabeza. Se comprueba la invariante
    // exacta: ninguna cabeza se acerca a otra menos que su banda (sin encimarse) y
    // el nivel de arranque no se mueve.
    const cabezasJuntos = JSON.parse(await atributoVisor(ses, "niveles-cabezas"));
    const banda = cabezasJuntos.altoBanda;
    assert.ok(banda > 0, `la banda de la cabeza no puede ser cero: ${banda}`);
    assert.ok(
      ajusteJuntos.automaticos.some((d) => Math.abs(d) > 1e-9),
      "ninguna cabeza se abrió con los niveles juntos",
    );
    const cabezasOrdenadas = cabezasJuntos.cabezas
      .slice()
      .sort((a, b) => a.elev - b.elev);
    for (let i = 1; i < cabezasOrdenadas.length; i += 1) {
      assert.ok(
        cabezasOrdenadas[i].z - cabezasOrdenadas[i - 1].z >= banda - 1e-6,
        `las cabezas juntas se acercan más que su banda: ${cabezasOrdenadas[i - 1].z} / ${cabezasOrdenadas[i].z}`,
      );
    }
    await ses.captura(path.join(CAPTURAS, "o014b-alzado-niveles-juntos.png"));

    // Parte 1 en corte: la traza (0,0)→(10,0) mira hacia (0,1). La anotación debe
    // usar la normal contraria y los textos no salen espejados.
    await elegirVista(ses, "Planta Nivel 0");
    await cambiarPestana(ses, "Vista");
    await activar(ses, "visor-ajustar");
    await esperar(600);
    await activar(ses, "cmd-nuevo-corte");
    await clicMundo(ses, 0, -2);
    await clicMundo(ses, 10, -2);
    await esperar(900);
    await elegirPrimerCorte(ses);
    await activar(ses, "visor-ajustar");
    await esperar(800);
    const cabezasCorte = JSON.parse(await atributoVisor(ses, "niveles-cabezas"));
    assert.equal(cabezasCorte.haciaCamara[0], 0);
    assert.ok(
      cabezasCorte.haciaCamara[1] < -0.99,
      `el corte (0,1) debía mirar desde -Y: ${JSON.stringify(cabezasCorte.haciaCamara)}`,
    );
    const textoCorte = await atributoVisor(ses, "niveles-texto");
    assert.ok(textoCorte.includes("Npt +3.00m"), `el corte no muestra +3.00m: ${textoCorte}`);
    const anotCorte = await anotaciones(ses);
    const etiquetasCorte = anotCorte.etiquetas.filter((e) => e.tipo === "nivel");
    assert.equal(etiquetasCorte.length, 4, "faltan etiquetas de nivel en el corte");
    for (const etiqueta of etiquetasCorte) {
      assert.ok(
        etiqueta.x1 > etiqueta.x0 + 10,
        `«${etiqueta.texto}» no se dibujó con ancho legible en el corte`,
      );
      const cy = (etiqueta.y0 + etiqueta.y1) / 2;
      let mejor = null;
      let distancia = Infinity;
      for (const t of cabezasCorte.cabezas) {
        const p = await proyectar(
          ses,
          cabezasCorte.h[0] * t.t + cabezasCorte.d[0] * cabezasCorte.profundidad,
          cabezasCorte.h[1] * t.t + cabezasCorte.d[1] * cabezasCorte.profundidad,
          t.z,
        );
        if (!p) continue;
        const d = Math.abs(p.y - cy);
        if (d < distancia) {
          distancia = d;
          mejor = p;
        }
      }
      assert.ok(mejor, "no se pudo proyectar el triángulo del corte");
      assert.ok(
        mejor.x < (etiqueta.x0 + etiqueta.x1) / 2,
        `en el corte «${etiqueta.texto}» quedó a la izquierda de su triángulo (espejado)`,
      );
    }
    await comprobarCabezasSeparadas(ses, "corte (0,1) 0.00/0.10/0.20/3.00");
    await comprobarGuiasNivel(ses, "corte (0,1) 0.00/0.10/0.20/3.00");
    await ses.captura(path.join(CAPTURAS, "o014b-corte-legible.png"));
  } finally {
    await ses.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});
