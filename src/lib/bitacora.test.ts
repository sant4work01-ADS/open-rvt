// O006c: serialización de eventos, truncado de parámetros y listener global de clics.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agregarEvento,
  etiquetaDeControl,
  eventosBitacora,
  instalarEscuchasParaPruebas,
  llamarConBitacora,
  reiniciarBitacoraParaPruebas,
  resumenResultado,
  truncarParams,
} from "./bitacora";
import { ipc, ErrorIpc } from "./ipc";

let quitar: (() => void) | undefined;

beforeEach(() => {
  reiniciarBitacoraParaPruebas();
  document.body.innerHTML = "";
  quitar = instalarEscuchasParaPruebas();
});

afterEach(() => {
  quitar?.();
  document.body.innerHTML = "";
});

describe("eventos", () => {
  it("serializa con ts ISO con milisegundos, sesión y tipo", () => {
    const evento = agregarEvento("clic", { etiqueta: "cmd-nuevo" });
    expect(evento.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(evento.sesion).toBe("prueba");
    expect(evento.tipo).toBe("clic");
    expect(evento.etiqueta).toBe("cmd-nuevo");
    expect(eventosBitacora()).toHaveLength(1);
  });

  it("el resumen de un resultado conserva creados, modificados y mensaje", () => {
    expect(
      resumenResultado({ creados: ["a"], modificados: ["b"], mensaje: "Eje creado." }),
    ).toEqual({ creados: ["a"], modificados: ["b"], mensaje: "Eje creado." });
  });
});

describe("llamadas al núcleo", () => {
  it("registra la acción y el resultado correcto con el mismo id", async () => {
    const espia = vi
      .spyOn(ipc, "nucleoLlamar")
      .mockResolvedValueOnce({ creados: ["gid-1"], modificados: [], mensaje: "Eje creado." });
    const resultado = await llamarConBitacora<{ creados: string[] }>("ejes.crear", {
      etiqueta: "1",
      x1: 0,
    });
    espia.mockRestore();
    expect(resultado.creados).toEqual(["gid-1"]);

    const accion = eventosBitacora().find((e) => e.tipo === "accion");
    const respuesta = eventosBitacora().find((e) => e.tipo === "resultado");
    expect(accion?.metodo).toBe("ejes.crear");
    expect(accion?.params).toEqual({ etiqueta: "1", x1: 0 });
    expect(respuesta?.id).toBe(accion?.id);
    expect(respuesta?.ok).toBe(true);
    expect(respuesta?.resumen).toEqual({
      creados: ["gid-1"],
      modificados: [],
      mensaje: "Eje creado.",
    });
    expect(typeof respuesta?.duracion_ms).toBe("number");
  });

  it("en un error guarda el mensaje original, el código y la traza de Python", async () => {
    const traza = "Traceback (most recent call last):\nValueError: no paralelos";
    const espia = vi
      .spyOn(ipc, "nucleoLlamar")
      .mockRejectedValueOnce(
        new ErrorIpc({
          tipo: "Io",
          mensaje: "Los ejes deben ser paralelos.",
          codigo: "-32027",
          traza,
        }),
      );
    await expect(llamarConBitacora("ejes.separacion", {})).rejects.toThrow();
    espia.mockRestore();
    const respuesta = eventosBitacora().find((e) => e.tipo === "resultado");
    expect(respuesta?.ok).toBe(false);
    expect(respuesta?.mensaje).toBe("Los ejes deben ser paralelos.");
    expect(respuesta?.codigo).toBe("-32027");
    expect(respuesta?.traza).toBe(traza);
  });
});

describe("truncarParams", () => {  it("deja intactos los parámetros pequeños", () => {
    const params = { x: 1, etiqueta: "1" };
    expect(truncarParams(params)).toEqual(params);
  });

  it("corta a 2 KB el JSON de los parámetros grandes, sin perder el aviso", () => {
    const params = { puntos: Array.from({ length: 500 }, (_, i) => ({ x: i, y: i * 2 })) };
    const truncado = truncarParams(params) as {
      truncado: boolean;
      bytes: number;
      texto: string;
    };
    expect(truncado.truncado).toBe(true);
    expect(truncado.texto.length).toBe(2048);
    expect(truncado.bytes).toBeGreaterThan(2048);
    expect(truncado.bytes).toBe(JSON.stringify(params).length);
  });
});

describe("etiqueta de los controles", () => {
  it("prefiere data-testid", () => {
    const boton = document.createElement("button");
    boton.setAttribute("data-testid", "cmd-eje");
    boton.setAttribute("aria-label", "Eje (GR)");
    boton.textContent = "Eje";
    expect(etiquetaDeControl(boton)).toBe("cmd-eje");
  });

  it("usa aria-label cuando no hay data-testid", () => {
    const boton = document.createElement("button");
    boton.setAttribute("aria-label", "Crear ejes por separaciones");
    boton.textContent = "Ejes";
    expect(etiquetaDeControl(boton)).toBe("Crear ejes por separaciones");
  });

  it("cae al texto visible del botón", () => {
    const boton = document.createElement("button");
    boton.textContent = "  Exportar   bitácora… ";
    expect(etiquetaDeControl(boton)).toBe("Exportar bitácora…");
  });

  it("el listener global registra los tres casos con su tipo clic", () => {
    document.body.innerHTML = `
      <button data-testid="cmd-nuevo">Nuevo</button>
      <button aria-label="Guardar modelo">Guardar</button>
      <button>Solo texto</button>`;
    for (const boton of Array.from(document.querySelectorAll("button"))) {
      boton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    const clics = eventosBitacora().filter((e) => e.tipo === "clic");
    expect(clics.map((e) => e.etiqueta)).toEqual(["cmd-nuevo", "Guardar modelo", "Solo texto"]);
    expect(clics.every((e) => typeof e.ruta === "string")).toBe(true);
  });

  it("el listener global no registra clics fuera de controles", () => {
    document.body.innerHTML = `<div id="lienzo">modelo</div>`;
    document.getElementById("lienzo")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    expect(eventosBitacora().filter((e) => e.tipo === "clic")).toHaveLength(0);
  });
});

describe("teclas", () => {
  it("registra atajos pero no el texto escrito en un campo", () => {
    document.body.innerHTML = `<input id="campo" /><div id="zona"></div>`;
    const campo = document.getElementById("campo")!;
    campo.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    document.getElementById("zona")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
    );
    const teclas = eventosBitacora().filter((e) => e.tipo === "tecla");
    expect(teclas).toHaveLength(1);
    expect(teclas[0].combinacion).toBe("Ctrl+Z");
  });
});
