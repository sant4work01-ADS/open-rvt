// O068: barra de opciones de Mover/Copiar (fases y botón Listo).
import { useModelo } from "./estado";

export function BarraMover() {
  const fase = useModelo((s) => s.faseMover);
  const seleccionados = useModelo((s) => s.seleccionados);
  const ejeSeleccionado = useModelo((s) => s.ejeSeleccionado);
  const listo = useModelo((s) => s.listoMover);
  const texto =
    fase === "seleccionar"
      ? "Seleccione elementos; Enter, clic derecho o Listo"
      : fase === "base"
        ? "Punto base"
        : "Punto destino o distancia y Enter";
  return (
    <>
      <span className="text-muted-foreground" data-testid="mover-paso">
        Selección: {seleccionados.length}
        {ejeSeleccionado ? " · eje" : ""} · {texto}
      </span>
      {fase === "seleccionar" && (
        <button
          type="button"
          data-testid="mover-listo"
          onClick={listo}
          className="rounded border px-2 py-0.5 hover:bg-muted"
        >
          Listo
        </button>
      )}
    </>
  );
}
