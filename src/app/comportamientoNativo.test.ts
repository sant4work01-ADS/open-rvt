import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { instalarComportamientoNativo } from "./comportamientoNativo";

let desinstalar: () => void;

beforeEach(() => {
  document.body.innerHTML = "";
  desinstalar = instalarComportamientoNativo();
});

afterEach(() => {
  desinstalar();
});

function clicDerecho(el: Element) {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

function tecla(init: KeyboardEventInit) {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(e);
  return e;
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe("comportamiento nativo", () => {
  // CA-1: clic derecho fuera de un campo de texto no abre nada.
  it("CA-1 bloquea el menú del navegador en un div", async () => {
    const div = document.createElement("div");
    document.body.append(div);
    const e = clicDerecho(div);
    await esperar();
    expect(e.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  // CA-2: menú propio en campos de texto, en español y con las cinco opciones.
  it("CA-2 abre el menú propio en un input y selecciona todo", async () => {
    const input = document.createElement("input");
    input.value = "hola mundo";
    document.body.append(input);
    clicDerecho(input);
    await esperar();
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const opciones = Array.from(menu!.querySelectorAll('[role="menuitem"]')).map(
      (b) => b.textContent ?? "",
    );
    const titulos = ["Deshacer", "Cortar", "Copiar", "Pegar", "Seleccionar todo"];
    for (const t of titulos) expect(opciones.some((o) => o.includes(t))).toBe(true);
    expect(opciones).toHaveLength(5);

    const todo = Array.from(menu!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
      (b) => b.textContent?.includes("Seleccionar todo"),
    )!;
    todo.click();
    await esperar();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  // CA-3: se bloquean los atajos del navegador y se respetan los nuestros.
  it("CA-3 bloquea F5, Ctrl+R, Ctrl+P y Ctrl+U; respeta Ctrl+K y Ctrl+Z", () => {
    for (const init of [
      { key: "F5" },
      { key: "r", ctrlKey: true },
      { key: "p", ctrlKey: true },
      { key: "u", ctrlKey: true },
    ]) {
      expect(tecla(init).defaultPrevented).toBe(true);
    }
    expect(tecla({ key: "k", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(tecla({ key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
  });

  // CA-4: Ctrl+rueda no hace zoom salvo donde el componente lo pida.
  it("CA-4 bloquea Ctrl+rueda fuera del Gantt", () => {
    const div = document.createElement("div");
    document.body.append(div);
    const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true });
    div.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);

    const gantt = document.createElement("div");
    gantt.dataset.permiteCtrlRueda = "";
    document.body.append(gantt);
    const e2 = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true });
    gantt.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});
