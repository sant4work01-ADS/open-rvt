/// <reference types="vite/client" />
import type { PeticionDialogo } from "./lib/dialogos";

declare global {
  interface Window {
    /** Costura para pruebas E2E: reemplaza los diálogos nativos de archivos. */
    __PP_DIALOGO_PRUEBAS__?: (peticion: PeticionDialogo) => Promise<string | null>;
  }
}
