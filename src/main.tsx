import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/styles/globals.css";
import "@/i18n";
import { App } from "@/app/App";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { aplicarTema } from "@/lib/tema";
import { instalarComportamientoNativo } from "@/app/comportamientoNativo";
import { instalarErroresGlobales } from "@/lib/errores-globales";
import { iniciarBitacora } from "@/lib/bitacora";

// Hasta leer config.json se sigue el tema del sistema (evita el parpadeo).
aplicarTema("sistema");

// Spec 021: sin menús ni atajos del navegador; la app se siente nativa.
instalarComportamientoNativo();
// Spec 077: los errores no capturados de la interfaz también van al log de la app.
instalarErroresGlobales();
// O006c: bitácora de la sesión (clics, teclas, acciones, errores y vistas).
iniciarBitacora();

const clienteConsultas = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={clienteConsultas}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
