// CA-1 (spec 056): `es.json` y `en.json` tienen exactamente las mismas claves y ninguna
// traducción está vacía. También se comprueba la interpolación y el idioma del sistema.
import { describe, expect, it } from "vitest";
import es from "./es.json";
import en from "./en.json";
import { cambiarIdioma, idiomaDeConfig, idiomaDelSistema, tr } from "./index";

type Arbol = { [clave: string]: string | Arbol };

/** Claves hoja en notación de puntos, en orden. */
function claves(arbol: Arbol, prefijo = ""): string[] {
  return Object.entries(arbol).flatMap(([clave, valor]) => {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    return typeof valor === "string" ? [ruta] : claves(valor, ruta);
  });
}

function vacias(arbol: Arbol, prefijo = ""): string[] {
  return Object.entries(arbol).flatMap(([clave, valor]) => {
    const ruta = prefijo ? `${prefijo}.${clave}` : clave;
    if (typeof valor === "string") return valor.trim() === "" ? [ruta] : [];
    return vacias(valor, ruta);
  });
}

describe("i18n — recursos", () => {
  it("CA-1: es.json y en.json tienen exactamente las mismas claves", () => {
    expect(claves(en as Arbol).sort()).toEqual(claves(es as Arbol).sort());
  });

  it("CA-1: ninguna traducción está vacía", () => {
    expect(vacias(es as Arbol)).toEqual([]);
    expect(vacias(en as Arbol)).toEqual([]);
  });

  it("interpola valores y cambia de idioma al instante", async () => {
    await cambiarIdioma("es");
    expect(tr("modulos.alertas", "x", { n: 3 })).toBe("3 alertas");
    await cambiarIdioma("en");
    expect(tr("modulos.alertas", "x", { n: 3 })).toBe("3 alerts");
    await cambiarIdioma("es");
  });

  it("la primera vez usa el idioma del sistema; después, la preferencia guardada", () => {
    expect(idiomaDelSistema("es-MX")).toBe("es");
    expect(idiomaDelSistema("en-US")).toBe("en");
    expect(idiomaDelSistema("fr-FR")).toBe("en");
    expect(idiomaDeConfig({ idioma: "es", idioma_migrado: false }, )).toBe(
      idiomaDelSistema(),
    );
    expect(idiomaDeConfig({ idioma: "en", idioma_migrado: true })).toBe("en");
    expect(idiomaDeConfig({ idioma: "es", idioma_migrado: true })).toBe("es");
  });
});
