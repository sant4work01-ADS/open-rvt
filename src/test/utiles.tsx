// OPEN-RVT: adaptado de PresupuestosPro; monta el App del esqueleto.
// Utilidades de prueba de OPEN-RVT (adaptadas de src/test/utiles.tsx de PresupuestosPro).
import { render } from "@testing-library/react";
import { App } from "@/app/App";
import { ESCALA_DEFECTO, useTema } from "@/lib/tema";

/** Reinicia las preferencias y monta la aplicación. */
export function montarApp(
  opciones: {
    tema?: "sistema" | "claro" | "oscuro";
    escala?: 100 | 110 | 120 | 130;
    idioma?: "es" | "en";
    lateralExpandido?: boolean;
    lateralAncho?: number | null;
    panelIzquierdoPlegado?: boolean;
    panelDerechoPlegado?: boolean;
  } = {},
) {
  useTema.setState({
    pref: opciones.tema ?? "sistema",
    escala: opciones.escala ?? ESCALA_DEFECTO,
    idioma: opciones.idioma ?? "es",
    lateralExpandido: opciones.lateralExpandido ?? false,
    lateralAncho: opciones.lateralAncho ?? null,
    panelIzquierdoPlegado: opciones.panelIzquierdoPlegado ?? false,
    panelDerechoPlegado: opciones.panelDerechoPlegado ?? false,
    cargado: false,
  });
  return render(<App />);
}
