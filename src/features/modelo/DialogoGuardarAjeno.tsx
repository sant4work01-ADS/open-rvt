// O066: aviso al guardar sobre un IFC que no creó OPEN-RVT.
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useModelo } from "./estado";

export function DialogoGuardarAjeno() {
  const pregunta = useModelo((s) => s.preguntaAjeno);
  const responder = useModelo((s) => s.responderGuardarAjeno);
  if (!pregunta) return null;
  return (
    <Modal
      titulo="Guardar IFC ajeno"
      onCerrar={() => responder("cancelar")}
      className="w-[min(520px,92vw)]"
    >
      <div className="flex flex-col gap-3 p-4" data-testid="dialogo-guardar-ajeno">
        <h2 className="font-semibold">Guardar sobre un IFC ajeno</h2>
        <p className="text-muted-foreground">
          Este IFC no lo creó OPEN-RVT. Guardarlo reescribe el archivo completo.
        </p>
        <p className="text-sm text-muted-foreground">
          Archivo: {pregunta.nombre || "sin título"}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            data-testid="ajeno-cancelar"
            onClick={() => responder("cancelar")}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            data-testid="ajeno-sobrescribir"
            onClick={() => responder("sobrescribir")}
          >
            Sobrescribir
          </Button>
          <Button
            autoFocus
            data-testid="ajeno-guardar-como"
            onClick={() => responder("guardar_como")}
          >
            Guardar como…
          </Button>
        </div>
      </div>
    </Modal>
  );
}
