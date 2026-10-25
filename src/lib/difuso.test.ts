import { filtrarDifuso, plegarTexto, puntajeDifuso } from "./difuso";

describe("búsqueda difusa", () => {
  it("ignora acentos y mayúsculas", () => {
    expect(plegarTexto("Guardar VERSIÓN")).toBe("guardar version");
    expect(puntajeDifuso("Guardar versión", "VERSION")).toBeGreaterThan(0);
  });

  it("exige todas las palabras y acepta subsecuencias", () => {
    expect(puntajeDifuso("Ir a Presupuesto", "ir pres")).toBeGreaterThan(0);
    expect(puntajeDifuso("Ir a Presupuesto", "ir xyz")).toBe(0);
    expect(puntajeDifuso("Deshacer", "dsh")).toBeGreaterThan(0);
    expect(puntajeDifuso("Deshacer", "zh")).toBe(0);
  });

  it("consulta vacía deja todo y ordena por relevancia con empate estable", () => {
    const items = ["Abrir obra", "Nueva obra", "Cerrar obra", "Obra reciente"];
    expect(filtrarDifuso(items, "", (x) => x)).toEqual(items);
    // Empate de puntaje: se conserva el orden original.
    expect(filtrarDifuso(items, "obra", (x) => x)).toEqual(items);
    // Coincidir al inicio de una palabra vale más que en medio de ella.
    expect(filtrarDifuso(["Cobrar", "Obra"], "obra", (x) => x)[0]).toBe("Obra");
    expect(filtrarDifuso(items, "nue", (x) => x)).toEqual(["Nueva obra"]);
  });
});
