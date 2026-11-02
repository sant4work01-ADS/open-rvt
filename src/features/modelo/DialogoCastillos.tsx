// OPEN-RVT (O007c): «Castillos automáticos». Pide la separación máxima entre
// centros (3.00 m por omisión) y la aplica a los muros seleccionados o, si no hay
// selección, a todos los del nivel activo. Todo en un solo paso de deshacer.
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useModelo } from "./estado";

export function DialogoCastillos() {
  const cerrar = useModelo((s) => s.cerrarDialogoCastillos);
  const aplicar = useModelo((s) => s.castillosAutomaticos);
  const seleccionados = useModelo((s) => s.seleccionados);
  const elementos = useModelo((s) => s.elementos);
  const [separacion, setSeparacion] = useState("3.00");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const muros = seleccionados.filter((gid) =>
    elementos.some((e) => e.globalid === gid && e.clase === "IfcWall"),
  );
  const valor = Number(separacion.replace(",", "."));
  const valido = Number.isFinite(valor) && valor > 0;

  const aceptar = async () => {
    if (!valido) {
      setError("La separación debe ser un número mayor que cero.");
      return;
    }
    setError(null);
    setProcesando(true);
    const ok = await aplicar(valor);
    setProcesando(false);
    if (!ok) setError("No se pudieron colocar los castillos.");
  };

  return (
    <Modal
      titulo="Castillos automáticos"
      onCerrar={cerrar}
      className="w-[min(480px,92vw)]"
    >
      <div
        data-testid="dialogo-castillos"
        className="flex flex-col gap-3 p-4 text-sm"
      >
        <h2 className="font-semibold">Castillos automáticos</h2>
        <p className="text-muted-foreground">
          Se colocan en esquinas, remates e intermedios de{" "}
          {muros.length > 0
            ? `${muros.length} muro(s) seleccionado(s)`
            : "todos los muros del nivel activo"}
          . No se duplican los que ya existen.
        </p>
        <label className="flex items-center gap-2">
          <span>Separación máxima</span>
          <input
            data-testid="castillos-separacion"
            type="number"
            min={0.05}
            step={0.05}
            value={separacion}
            onChange={(e) => setSeparacion(e.target.value)}
            className="w-24 rounded border bg-background px-2 py-1 text-right"
          />
          <span>m</span>
        </label>
        {error && <p className="text-red-600">{error}</p>}
        {procesando && (
          <p data-testid="castillos-procesando" className="text-muted-foreground">
            Colocando castillos…
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="castillos-cancelar"
            onClick={cerrar}
            disabled={procesando}
            className="rounded border px-3 py-1 hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="castillos-aceptar"
            disabled={!valido || procesando}
            onClick={() => void aceptar()}
            className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
          >
            Colocar castillos
          </button>
        </div>
      </div>
    </Modal>
  );
}
