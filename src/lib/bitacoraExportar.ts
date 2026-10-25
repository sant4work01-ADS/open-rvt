// O006c: exportación de la bitácora a .zip desde la interfaz.
import { commands, type ErrorDatos } from "./bindings";
import { elegirDestinoZip } from "./dialogos";
import { vaciarBitacora } from "./bitacora";
import { ErrorIpc } from "./ipc";

export interface OpcionesExportarBitacora {
  /** Todas las sesiones guardadas; por omisión, la actual y las dos anteriores. */
  todas?: boolean;
  /** Solo si el usuario lo marca: incluir el IFC abierto. */
  incluirIfc?: boolean;
  rutaIfc?: string | null;
}

/**
 * Vacía el lote pendiente, pide el destino con el nombre
 * `bitacora-openrvt-<fecha>.zip` y genera el .zip en Rust.
 */
export async function exportarBitacora(
  opciones: OpcionesExportarBitacora = {},
): Promise<string | null> {
  await vaciarBitacora();
  const fecha = new Date().toISOString().slice(0, 10);
  const destino = await elegirDestinoZip(`bitacora-openrvt-${fecha}`);
  if (!destino) return null;
  let respuesta;
  try {
    respuesta = await commands.bitacoraExportar(
      destino,
      Boolean(opciones.todas),
      Boolean(opciones.incluirIfc),
      opciones.rutaIfc ?? null,
    );
  } catch (error) {
    throw new ErrorIpc({
      tipo: "Io",
      mensaje: error instanceof Error ? error.message : String(error),
    } as ErrorDatos);
  }
  if (respuesta.status === "error") throw new ErrorIpc(respuesta.error);
  return respuesta.data;
}
