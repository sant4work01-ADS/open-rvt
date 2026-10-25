import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export interface OpcionesConfirmar {
  titulo: string;
  mensaje: ReactNode;
  /** Texto del botón que confirma (la acción destructiva). */
  confirmar: string;
  /** Texto del botón seguro; es el que tiene el foco al abrir (Enter = no hacer nada). */
  cancelar?: string;
}

/** Diálogo de confirmación. El botón por defecto (foco inicial, Enter, Escape) es el seguro. */
export function DialogoConfirmar({
  titulo,
  mensaje,
  confirmar,
  cancelar = "Cancelar",
  onResolver,
}: OpcionesConfirmar & { onResolver: (ok: boolean) => void }) {
  return (
    <Modal titulo={titulo} onCerrar={() => onResolver(false)} className="w-[min(480px,92vw)]">
      <div className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{titulo}</h2>
        <div className="text-muted-foreground">{mensaje}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" autoFocus onClick={() => onResolver(false)}>
            {cancelar}
          </Button>
          <Button
            variant="ghost"
            className="text-red-600 hover:text-red-700 dark:text-red-400"
            onClick={() => onResolver(true)}
          >
            {confirmar}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
