// Prueba E2E del esqueleto: app Tauri real bajo xvfb. Genera la captura de la entrega.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Sesion } = require("./arnes");

const RAIZ = path.resolve(__dirname, "..");

test("O002: la ventana muestra título, ribbon, 5 módulos y el área de trabajo vacía", async () => {
  const ses = await Sesion.abrir({
    prueba: "o002-inicio",
    tamano: { ancho: 1600, alto: 900 },
    lateralExpandido: true,
  });
  try {
    assert.equal(await ses.driver.getTitle(), "OPEN-RVT");
    assert.equal(await ses.texto('[data-testid="estado-producto"]'), "OPEN-RVT");
    assert.equal(await ses.texto('[data-testid="estado-modelo"]'), "Sin modelo abierto");
    assert.equal(
      await ses.texto('[data-testid="area-trabajo"]'),
      "Aquí irá el editor (planta y 3D)",
    );

    const { By } = require("selenium-webdriver");
    const modulos = await ses.driver.findElements(By.css("nav [data-modulo]"));
    const nombres = [];
    for (const m of modulos) nombres.push(await m.getAttribute("aria-label"));
    assert.deepEqual(nombres, [
      "Modelo",
      "Tipos y materiales",
      "Niveles y ejes",
      "Configuración",
      "Ayuda",
    ]);

    const tabs = await ses.driver.findElements(By.css('[role="tab"]'));
    const textos = [];
    for (const t of tabs) textos.push(await t.getText());
    assert.deepEqual(textos, ["Inicio", "Vista"]);

    for (const id of ["nuevo", "abrir", "guardar"]) {
      const b = await ses.porTestid(`cmd-${id}`);
      assert.equal(await b.isEnabled(), true);
    }

    // La captura de la entrega: ribbon, sidebar con los 5 módulos y área vacía.
    await ses.captura(path.join(RAIZ, "docs", "capturas", "o002-inicio.png"));
  } finally {
    await ses.cerrar();
  }
});

test("O002: la pestaña Vista aplica el tema oscuro al instante", async () => {
  const ses = await Sesion.abrir({ prueba: "o002-tema", tamano: { ancho: 1400, alto: 820 } });
  try {
    const vista = await ses.driver.wait(
      require("selenium-webdriver").until.elementLocated(
        require("selenium-webdriver").By.xpath('//*[@role="tab"][normalize-space(.)="Vista"]'),
      ),
      10_000,
    );
    await vista.click();
    const oscuro = await ses.q('[data-testid="cmd-tema-oscuro"]');
    await oscuro.click();
    await ses.driver.wait(async () => {
      const clases = await ses.driver.executeScript(
        () => document.documentElement.className,
      );
      return String(clases).includes("dark");
    }, 5_000, "el tema oscuro no se aplicó");
    assert.equal(await oscuro.getAttribute("aria-pressed"), "true");
  } finally {
    await ses.cerrar();
  }
});
