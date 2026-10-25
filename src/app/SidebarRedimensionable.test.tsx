// OPEN-RVT: adaptado de PresupuestosPro; ancho en el store de tema.
// Spec 044: sidebar expandido redimensionable en horizontal.
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { screen } from "@testing-library/dom";
import { afterEach, describe, expect, it } from "vitest";
import { montarApp } from "@/test/utiles";
import { useTema } from "@/lib/tema";
import {
  ANCHO_MAX_REM,
  ANCHO_EXPANDIDO_REM,
  anchoMinimoRem,
  estimarTextoBaseRem,
  RELLENO_DEFECTO_REM,
} from "./SidebarModulos";
import { MODULOS } from "./modulos";

const nav = () => screen.getByRole("navigation", { name: "Módulos" });
const asa = () => screen.getByRole("separator", { name: "Redimensionar el panel lateral" });
/** Espera a que el tema (asíncrono) hidrate el sidebar expandido. */
const asaEsperada = () =>
  screen.findByRole("separator", { name: "Redimensionar el panel lateral" });

/** Ancho en rem del estilo inline (`calc(Nrem * var(--factor-sidebar))`). */
const anchoRem = () => {
  const m = /calc\(([\d.]+)rem/.exec(nav().style.width);
  return m ? Number(m[1]) : NaN;
};

const textoMasLargo = Math.max(...MODULOS().map((m) => estimarTextoBaseRem(m.nombre)));

describe("Sidebar redimensionable (spec 044)", () => {
  afterEach(cleanup);

  // CA-1
  it("CA-1: expandido muestra un asa vertical que responde a flechas", async () => {
    montarApp({ lateralExpandido: true });
    const a = await asaEsperada();
    expect(a).toHaveAttribute("aria-orientation", "vertical");
    expect(a).toHaveAttribute("role", "separator");
    const antes = anchoRem();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(anchoRem()).toBeGreaterThan(antes);
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(anchoRem()).toBeCloseTo(antes, 1);
  });

  // CA-2
  it("CA-2: el mínimo es el contenido medido y no baja de ahí; el máximo es 20rem", async () => {
    montarApp({ lateralExpandido: true });
    await asaEsperada();
    const min = Number(asa().getAttribute("aria-valuemin"));
    expect(min).toBeCloseTo(anchoMinimoRem(textoMasLargo, 120), 1);
    const a = asa();
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(anchoRem()).toBeCloseTo(ANCHO_MAX_REM, 1);
    for (let i = 0; i < 80; i += 1) fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(anchoRem()).toBeCloseTo(min, 1);
    expect(anchoRem()).toBeGreaterThanOrEqual(min);
  });

  // CA-3
  it("CA-3: el ancho por omisión se ajusta al contenido más largo y queda bajo 12rem", async () => {
    montarApp({ lateralExpandido: true });
    await asaEsperada();
    const porDefecto = anchoRem();
    // O007a añadió «Tipos y materiales»: el ancho sigue al texto más largo medido.
    expect(porDefecto).toBeGreaterThan(8.4);
    expect(porDefecto).toBeLessThan(9.4);
    expect(porDefecto).toBeCloseTo(
      anchoMinimoRem(textoMasLargo, 120) + RELLENO_DEFECTO_REM,
      0,
    );
    const recorte = (ANCHO_EXPANDIDO_REM - porDefecto) / ANCHO_EXPANDIDO_REM;
    expect(recorte).toBeGreaterThanOrEqual(0.24);
    expect(recorte).toBeLessThanOrEqual(0.31);
  });

  // CA-4
  it("CA-4: guarda el ancho elegido, lo recupera y el doble clic vuelve al de omisión", async () => {
    montarApp({ lateralExpandido: true });
    const a = await asaEsperada();
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(a, { key: "ArrowRight" });
    const elegido = anchoRem();
    expect(useTema.getState().lateralAncho).toBeCloseTo(elegido, 1);
    cleanup();

    montarApp({ lateralExpandido: true, lateralAncho: elegido });
    await asaEsperada();
    await waitFor(() => expect(anchoRem()).toBeCloseTo(elegido, 1));

    fireEvent.doubleClick(asa());
    expect(anchoRem()).toBeLessThan(elegido);
    // El valor guardado vuelve a «por omisión» (sin ancho propio).
    await waitFor(() => expect(useTema.getState().lateralAncho).toBeNull());
  });

  // CA-5
  it("CA-5: colapsado no hay asa y la flechita sigue funcionando", async () => {
    montarApp();
    await waitFor(() => expect(nav()).toHaveAttribute("data-expandido", "false"));
    expect(screen.queryByRole("separator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expandir menú lateral" }));
    expect(asa()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Colapsar menú lateral" }));
    expect(screen.queryByRole("separator")).toBeNull();
  });

  // CA-6
  it("CA-6: el mínimo se recalcula con la escala (igual en rem, mayor en píxeles)", async () => {
    const a100 = anchoMinimoRem(textoMasLargo, 100);
    const a130 = anchoMinimoRem(textoMasLargo, 130);
    expect(a130).toBeCloseTo(a100, 1);
    // En píxeles el panel (y su mínimo) crece con la escala.
    const px = (rem: number, escala: number) => rem * 16 * (escala / 100) * 1.25;
    expect(px(a130, 130)).toBeGreaterThan(px(a100, 100));
    montarApp({ lateralExpandido: true });
    await asaEsperada();
    expect(Number(asa().getAttribute("aria-valuemin"))).toBeCloseTo(
      anchoMinimoRem(textoMasLargo, 120),
      1,
    );
  });
});
