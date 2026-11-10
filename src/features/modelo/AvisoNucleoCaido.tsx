// O063 punto 2: aviso modal cuando el proceso del núcleo murió o no respondió.
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModelo } from "./estado";

export function AvisoNucleoCaido() {
  const caido = useModelo((s) => s.nucleoCaido);
  const aviso = useModelo((s) => s.avisoNucleo);
  const cerrar = useModelo((s) => s.cerrarAvisoNucleo);
  if (!caido || !aviso) return null;
  return (
    <div
      data-testid="aviso-nucleo-caido"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-nucleo-caido"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl">
        <h2
          id="titulo-nucleo-caido"
          className="flex items-center gap-2 text-base font-semibold text-red-700"
        >
          <AlertTriangle size={18} /> El núcleo se reinició
        </h2>
        <p className="mt-3 text-sm text-foreground">{aviso}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          La edición queda bloqueada hasta que abra o cree un modelo.
        </p>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={cerrar}>
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
