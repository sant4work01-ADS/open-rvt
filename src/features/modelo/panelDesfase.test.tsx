// O053: los campos de desfase de losa guardan con Enter (sin depender del blur),
// una sola vez por valor, y Escape restaura sin guardar.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BordesLosaElemento } from "./PanelPropiedades";

const pset = {
  Bordes: JSON.stringify([
    { referencia: "muro", lado: "exterior", desfase: 0 },
    { referencia: "muro", lado: "exterior", desfase: 0 },
    { referencia: "muro", lado: "exterior", desfase: 0 },
    { referencia: "muro", lado: "exterior", desfase: 0 },
  ]),
};

function montar() {
  const editar = vi.fn(async () => {});
  render(<BordesLosaElemento globalid="losa-1" pset={pset} editar={editar} />);
  return editar;
}

function escribir(campo: HTMLElement, valor: string) {
  fireEvent.change(campo, { target: { value: valor } });
}

describe("O053: desfase de losa con Enter", () => {
  afterEach(cleanup);

  it("el desfase común guarda una sola vez con Enter, sin blur manual", () => {
    const editar = montar();
    const campo = screen.getByTestId("elemento-desfase-bordes") as HTMLInputElement;
    campo.focus();
    escribir(campo, "0.075");
    fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledWith("losa-1", { desfase_bordes: 0.075 });
  });

  it("el desfase de un borde guarda una sola vez con Enter, sin blur manual", () => {
    const editar = montar();
    const campo = screen.getByTestId("elemento-borde-0-desfase") as HTMLInputElement;
    campo.focus();
    escribir(campo, "0.075");
    fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledWith("losa-1", {
      cambio_borde: { indice: 0, desfase: 0.075 },
    });
  });

  it("el blur también guarda, una sola vez", () => {
    const editar = montar();
    const comun = screen.getByTestId("elemento-desfase-bordes") as HTMLInputElement;
    escribir(comun, "0.075");
    fireEvent.blur(comun);
    expect(editar).toHaveBeenCalledTimes(1);
    expect(editar).toHaveBeenCalledWith("losa-1", { desfase_bordes: 0.075 });

    const borde = screen.getByTestId("elemento-borde-1-desfase") as HTMLInputElement;
    escribir(borde, "-0.125");
    fireEvent.blur(borde);
    expect(editar).toHaveBeenCalledTimes(2);
    expect(editar).toHaveBeenLastCalledWith("losa-1", {
      cambio_borde: { indice: 1, desfase: -0.125 },
    });
  });

  it("no guarda si el valor no cambió respecto al último guardado", () => {
    const editar = montar();
    const campo = screen.getByTestId("elemento-borde-0-desfase") as HTMLInputElement;
    campo.focus();
    fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
    fireEvent.blur(campo);
    expect(editar).not.toHaveBeenCalled();
  });

  it("Escape restaura el valor y no guarda", () => {
    const editar = montar();
    const campo = screen.getByTestId("elemento-desfase-bordes") as HTMLInputElement;
    campo.focus();
    escribir(campo, "0.2");
    fireEvent.keyDown(campo, { key: "Escape", code: "Escape" });
    expect(campo.value).toBe("0");
    fireEvent.blur(campo);
    expect(editar).not.toHaveBeenCalled();
  });
});
