// O006c: el mensaje original de un error nunca se pierde al mostrarlo ni al registrarlo.
import { describe, expect, it } from "vitest";
import { normalizarError } from "./bindings";
import { mensajeDeError } from "./ipc";

describe("mensajeDeError", () => {
  it("sin código devuelve el mensaje original tal cual", () => {
    expect(mensajeDeError({ tipo: "Otro", mensaje: "El eje ya existe." })).toBe(
      "El eje ya existe.",
    );
  });

  it("con código conocido añade el prefijo traducido sin perder el mensaje", () => {
    expect(
      mensajeDeError({ tipo: "Io", mensaje: "Los ejes deben ser paralelos.", codigo: "io" }),
    ).toBe("No se pudo completar la operación: Los ejes deben ser paralelos.");
  });

  it("con un código desconocido conserva el mensaje original", () => {
    expect(
      mensajeDeError({ tipo: "Io", mensaje: "Falta el nivel.", codigo: "-32027" }),
    ).toBe("Falta el nivel.");
  });
});

describe("normalizarError", () => {
  it("conserva mensaje, código y traza del puente", () => {
    const error = normalizarError({
      mensaje: "Los ejes deben ser paralelos.",
      codigo: -32027,
      traza: "Traceback (most recent call last):\nValueError: no paralelos",
    });
    expect(error.mensaje).toBe("Los ejes deben ser paralelos.");
    expect(error.codigo).toBe("-32027");
    expect(error.traza).toContain("ValueError: no paralelos");
  });

  it("no convierte un objeto de error en «[object Object]»", () => {
    expect(normalizarError({ mensaje: "No se pudo crear el eje." }).mensaje).toBe(
      "No se pudo crear el eje.",
    );
  });
});
