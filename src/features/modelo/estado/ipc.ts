// O065B: puerta unica de llamadas al nucleo.
import { llamarConBitacora } from "@/lib/bitacora";
import { verificarPuertaNucleo } from "../nucleoCaido";

export async function rpc<T>(metodo: string, params: Record<string, unknown> = {}): Promise<T> {
  // O063: una sola puerta bloquea cualquier edición si el núcleo perdió el modelo.
  verificarPuertaNucleo(metodo);
  // O006c: cada llamada al núcleo queda como `accion` y su `resultado`.
  return llamarConBitacora<T>(metodo, params);
}
