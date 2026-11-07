// OPEN-RVT: adaptado de PresupuestosPro; dos pestañas y comandos nuevos.
// Pruebas del ribbon común de OPEN-RVT (adaptadas de
// src/features/presupuesto/ribbon/Ribbon.test.tsx de PresupuestosPro).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Ribbon } from "./Ribbon";
import { construirComandosRibbon } from "./comandos";

function montar(extra: Partial<Parameters<typeof construirComandosRibbon>[0]> = {}) {
  const acciones = {
    nuevo: vi.fn(),
    abrir: vi.fn(),
    guardar: vi.fn(),
    guardarComo: vi.fn(),
    nuevaVistaCorte: vi.fn(),
    estilosObjeto: vi.fn(),
    estilosAnotacion: vi.fn(),
    nuevoNivel: vi.fn(),
    nuevoEje: vi.fn(),
    nuevosEjesPorSeparaciones: vi.fn(),
    herramientaMuro: vi.fn(),
    herramientaLosa: vi.fn(),
    losaDesdeMuros: vi.fn(),
    herramientaPuerta: vi.fn(),
    herramientaVentana: vi.fn(),
    herramientaMover: vi.fn(),
    herramientaCopiar: vi.fn(),
    herramientaAlinear: vi.fn(),
    herramientaZapata: vi.fn(),
    herramientaZapataCorrida: vi.fn(),
    herramientaContratrabe: vi.fn(),
    herramientaColumna: vi.fn(),
    herramientaCastillo: vi.fn(),
    herramientaTrabe: vi.fn(),
    herramientaCerramiento: vi.fn(),
    herramientaDala: vi.fn(),
    castillosAutomaticos: vi.fn(),
    unirZapatas: vi.fn(),
    unirTrabes: vi.fn(),
    abrirTipos: vi.fn(),
    borrarSeleccion: vi.fn(),
    deshacer: vi.fn(),
    rehacer: vi.fn(),
    herramientaActiva: null,
    temaSistema: vi.fn(),
    temaClaro: vi.fn(),
    temaOscuro: vi.fn(),
    temaActivo: "sistema" as const,
    ...extra,
  };
  const comandos = construirComandosRibbon(acciones);
  const r = render(
    <Ribbon comandos={comandos} minimizado={false} onToggleMinimizado={() => undefined} />,
  );
  return { ...r, acciones };
}

describe("Ribbon", () => {
  it("tiene las pestañas Inicio, Modelar y Vista, con Inicio activa", () => {
    montar();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Inicio", "Modelar", "Vista"]);
    expect(screen.getByRole("tab", { name: "Inicio" })).toHaveAttribute("aria-selected", "true");
  });

  it("Inicio trae el grupo Archivo con Nuevo, Abrir, Guardar y Guardar como", () => {
    montar();
    const panel = within(screen.getByRole("tabpanel", { name: "Pestaña Inicio" }));
    expect(panel.getByText("Archivo")).toBeInTheDocument();
    for (const nombre of [
      /Nuevo \(Ctrl\+N\) — Crear un modelo IFC vacío/,
      /Abrir \(Ctrl\+O\) — Abrir un modelo IFC/,
      /Guardar \(Ctrl\+S\) — Guardar el modelo/,
      /Guardar como \(Ctrl\+Shift\+S\) — Guardar el modelo en otro archivo/,
    ]) {
      expect(panel.getByRole("button", { name: nombre })).toBeEnabled();
    }
  });

  it("O051: los comandos no dejan tooltip nativo que pueda quedar pegado", () => {
    montar();
    const nuevo = screen.getByRole("button", {
      name: /Nuevo \(Ctrl\+N\) — Crear un modelo IFC vacío/,
    });
    expect(nuevo).toHaveAttribute("aria-label");
    expect(nuevo).not.toHaveAttribute("title");
  });

  it("Vista trae el grupo Tema con los tres botones y avisa de la elección", () => {
    const { acciones } = montar({ temaActivo: "oscuro" });
    fireEvent.click(screen.getByRole("tab", { name: "Vista" }));
    const panel = within(screen.getByRole("tabpanel", { name: "Pestaña Vista" }));
    expect(panel.getByText("Tema")).toBeInTheDocument();
    expect(panel.getByRole("button", { name: /Sistema — Seguir el tema del sistema/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(panel.getByRole("button", { name: /Oscuro — Tema oscuro/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(panel.getByRole("button", { name: /Claro — Tema claro/ }));
    expect(acciones.temaClaro).toHaveBeenCalledTimes(1);
  });

  it("minimizada solo quedan las pestañas y el botón pide restaurarla", () => {
    const onToggleMinimizado = vi.fn();
    render(
      <Ribbon
        comandos={construirComandosRibbon({
          nuevo: vi.fn(),
          abrir: vi.fn(),
          guardar: vi.fn(),
          guardarComo: vi.fn(),
          nuevaVistaCorte: vi.fn(),
    estilosObjeto: vi.fn(),
    estilosAnotacion: vi.fn(),
          nuevoNivel: vi.fn(),
          nuevoEje: vi.fn(),
          nuevosEjesPorSeparaciones: vi.fn(),
          herramientaMuro: vi.fn(),
          herramientaLosa: vi.fn(),
          losaDesdeMuros: vi.fn(),
          herramientaPuerta: vi.fn(),
          herramientaVentana: vi.fn(),
          herramientaMover: vi.fn(),
          herramientaCopiar: vi.fn(),
          herramientaAlinear: vi.fn(),
          herramientaZapata: vi.fn(),
          herramientaZapataCorrida: vi.fn(),
          herramientaContratrabe: vi.fn(),
          herramientaColumna: vi.fn(),
          herramientaCastillo: vi.fn(),
          herramientaTrabe: vi.fn(),
          herramientaCerramiento: vi.fn(),
          herramientaDala: vi.fn(),
          castillosAutomaticos: vi.fn(),
          unirZapatas: vi.fn(),
          unirTrabes: vi.fn(),
          abrirTipos: vi.fn(),
          borrarSeleccion: vi.fn(),
          deshacer: vi.fn(),
          rehacer: vi.fn(),
          herramientaActiva: null,
          temaSistema: vi.fn(),
          temaClaro: vi.fn(),
          temaOscuro: vi.fn(),
          temaActivo: "sistema",
        })}
        minimizado
        onToggleMinimizado={onToggleMinimizado}
      />,
    );
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expandir la cinta" }));
    expect(onToggleMinimizado).toHaveBeenCalledTimes(1);
  });
});
