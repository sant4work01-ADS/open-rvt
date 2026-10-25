// Arnés E2E mínimo de OPEN-RVT: app Tauri real con tauri-driver + WebKitGTK.
// Adaptado de presupuestos-pro/e2e/arnes.js (solo lo necesario para la captura y las
// comprobaciones básicas del esqueleto).
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { Builder, Capabilities, By, until, Key } = require("selenium-webdriver");

const RAIZ = path.resolve(__dirname, "..");
const SALIDA = path.join(RAIZ, "e2e", "salida");
fs.mkdirSync(SALIDA, { recursive: true });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function conTimeout(promesa, ms, mensaje) {
  let t;
  const vencido = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${mensaje} (sin respuesta en ${ms} ms)`)), ms);
  });
  Promise.resolve(promesa).catch(() => {});
  return Promise.race([promesa, vencido]).finally(() => clearTimeout(t));
}

/** Localiza el binario debug de la app (target del proyecto o CARGO_TARGET_DIR). */
function rutaBinario() {
  const tdir = process.env.CARGO_TARGET_DIR;
  const candidatos = [
    process.env.OPENRVT_E2E_BINARIO,
    tdir && path.join(tdir, "debug", "open-rvt"),
    path.join(RAIZ, "target", "debug", "open-rvt"),
    path.join(RAIZ, "src-tauri", "target", "debug", "open-rvt"),
  ];
  for (const c of candidatos) if (c && fs.existsSync(c)) return c;
  throw new Error(
    "No se encontró el binario debug de la app. Ejecuta: npx tauri build --debug --no-bundle",
  );
}

function puertoLibre() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

function esperarPuerto(h, p, ms = 30_000) {
  const fin = Date.now() + ms;
  return new Promise((res, rej) => {
    const intentar = () => {
      const s = net.connect(p, h);
      s.once("connect", () => {
        s.destroy();
        res();
      });
      s.once("error", () => {
        if (Date.now() > fin) rej(new Error(`tauri-driver no abrió el puerto ${p}`));
        else setTimeout(intentar, 100);
      });
    };
    intentar();
  });
}

class Sesion {
  constructor(driver, procesos, datos, prueba) {
    this.driver = driver;
    this.procesos = procesos;
    this.datos = datos;
    this.prueba = prueba || "e2e";
    this.registro = path.join(SALIDA, `registro-${this.prueba}.txt`);
  }

  registrar(mensaje) {
    try {
      fs.appendFileSync(this.registro, `${new Date().toISOString()} ${mensaje}\n`);
    } catch {
      /* si no se puede escribir, la prueba sigue */
    }
  }

  static async abrir({ prueba = "e2e", tamano } = {}) {
    const datos = fs.mkdtempSync(path.join(os.tmpdir(), "openrvt-e2e-"));
    fs.writeFileSync(
      path.join(datos, "config.json"),
      JSON.stringify({ idioma: "es", idioma_migrado: true }),
    );

    const entorno = {
      ...process.env,
      OPENRVT_DATOS_DIR: datos,
      WEBKIT_DISABLE_COMPOSITING_MODE: "1",
      GDK_BACKEND: "x11",
    };
    delete entorno.WAYLAND_DISPLAY;
    if (tamano && Number.isFinite(tamano.ancho) && Number.isFinite(tamano.alto)) {
      entorno.OPENRVT_TAMANO_VENTANA = `${Math.round(tamano.ancho)}x${Math.round(tamano.alto)}`;
    }

    const puerto = await puertoLibre();
    const puertoNativo = await puertoLibre();
    const drv = spawn(
      "tauri-driver",
      ["--port", String(puerto), "--native-port", String(puertoNativo)],
      { env: entorno, stdio: ["ignore", "pipe", "pipe"], detached: true },
    );
    drv.stderr.on("data", (d) => process.stderr.write(d));
    await esperarPuerto("127.0.0.1", puerto);

    const caps = new Capabilities();
    caps.set("tauri:options", { application: rutaBinario() });
    caps.setBrowserName("wry");

    const driver = await new Builder()
      .usingServer(`http://127.0.0.1:${puerto}`)
      .withCapabilities(caps)
      .build();

    const ses = new Sesion(driver, [drv], datos, prueba);
    try {
      await ses.esperarInicio();
    } catch (e) {
      await ses.cerrar();
      throw e;
    }
    return ses;
  }

  async esperarInicio(ms = 25_000) {
    await this.driver.wait(
      until.elementLocated(By.css('nav[aria-label="Módulos"] button')),
      ms,
      "La ventana de la app no cargó",
    );
    await this.driver.executeScript(() => {
      try {
        localStorage.setItem("openrvt.ribbon.minimizado", "false");
      } catch {
        /* sin localStorage */
      }
    });
  }

  async q(selector, ms = 10_000) {
    const el = await this.driver.wait(until.elementLocated(By.css(selector)), ms);
    await this.driver.wait(until.elementIsVisible(el), ms);
    return el;
  }

  async porTestid(id, ms = 10_000) {
    return this.q(`[data-testid="${id}"]`, ms);
  }

  async texto(selector) {
    return (await this.q(selector)).getText();
  }

  async captura(ruta) {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const png = await this.driver.takeScreenshot();
    fs.writeFileSync(ruta, Buffer.from(png, "base64"));
    return ruta;
  }

  async cerrar() {
    try {
      await conTimeout(this.driver.quit(), 15_000, "driver.quit()");
    } catch {
      /* se mata el grupo abajo */
    }
    for (const p of this.procesos) {
      if (p.exitCode !== null) continue;
      try {
        process.kill(-p.pid, "SIGTERM");
      } catch {
        try {
          p.kill("SIGTERM");
        } catch {
          /* nada */
        }
      }
    }
    fs.rmSync(this.datos, { recursive: true, force: true });
  }
}

module.exports = { Sesion, esperar, conTimeout, By, until, Key };
