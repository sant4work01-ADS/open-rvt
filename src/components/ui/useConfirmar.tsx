import { useCallback, useRef, useState } from "react";
import { DialogoConfirmar, type OpcionesConfirmar } from "./confirmar";

/**
 * `const { preguntar, dialogo } = useConfirmar()`: `await preguntar({...})` devuelve true
 * solo si el usuario confirma. Hay que pintar `{dialogo}` en el componente.
 */
export function useConfirmar() {
  const [abierto, setAbierto] = useState<OpcionesConfirmar | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const preguntar = useCallback((opciones: OpcionesConfirmar) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setAbierto(opciones);
    });
  }, []);

  const dialogo = abierto ? (
    <DialogoConfirmar
      {...abierto}
      onResolver={(ok) => {
        resolver.current?.(ok);
        resolver.current = null;
        setAbierto(null);
      }}
    />
  ) : null;

  return { preguntar, dialogo };
}
