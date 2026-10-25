// Configuración común de las pruebas de OPEN-RVT (adaptada de la de PresupuestosPro).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { configure } from "@testing-library/react";
import i18n from "@/i18n";

configure({ asyncUtilTimeout: 5000 });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});

// jsdom no implementa estas APIs que usan los componentes.
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverFalso;
Element.prototype.scrollIntoView ??= () => {};

// El idioma por omisión de las pruebas es español: cada una lo deja como estaba.
afterEach(async () => {
  await i18n.changeLanguage("es");
});

// jsdom no implementa el portapapeles: se simula.
const textosCopiados: string[] = [];
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (texto: string) => {
      textosCopiados.push(texto);
    },
  },
});
(globalThis as { textosCopiados?: string[] }).textosCopiados = textosCopiados;
