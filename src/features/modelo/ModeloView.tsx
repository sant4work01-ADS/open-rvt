// OPEN-RVT: área de trabajo del módulo Modelo. Todavía no hay editor: es el hueco vacío
// donde irá la planta y la vista 3D (spec O002).
import { tr } from "@/i18n";

export function ModeloView() {
  return (
    <div
      data-testid="area-trabajo"
      className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 text-sm text-muted-foreground"
    >
      {tr("modelo.aqui-ira-el-editor-planta-y-3d", "Aquí irá el editor (planta y 3D)")}
    </div>
  );
}
