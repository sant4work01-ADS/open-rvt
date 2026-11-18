// O068: barra de opciones de Ventana y Puerta (medidas y nivel de referencia).
import { useModelo } from "./estado";

export function BarraAbertura() {
  const opciones = useModelo((s) => s.opcionesAbertura);
  const fijar = useModelo((s) => s.fijarOpcionesAbertura);
  const niveles = useModelo((s) => s.niveles);
  const voltear = useModelo((s) => s.voltearSiguiente);
  return (
    <>
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Ancho</span>
        <input
          data-testid="abertura-ancho"
          type="number"
          step={0.05}
          value={opciones.ancho}
          onChange={(e) => {
            const valor = Number(e.target.value);
            if (Number.isFinite(valor) && valor > 0) fijar({ ancho: valor });
          }}
          className="w-16 rounded border bg-background px-1 py-0.5 text-right"
        />
        <span>m</span>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Alto</span>
        <input
          data-testid="abertura-alto"
          type="number"
          step={0.05}
          value={opciones.alto}
          onChange={(e) => {
            const valor = Number(e.target.value);
            if (Number.isFinite(valor) && valor > 0) fijar({ alto: valor });
          }}
          className="w-16 rounded border bg-background px-1 py-0.5 text-right"
        />
        <span>m</span>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground" title="Altura del alféizar desde el nivel de referencia">
          Antepecho
        </span>
        <input
          data-testid="abertura-antepecho"
          type="number"
          step={0.05}
          value={opciones.antepecho}
          onChange={(e) => {
            const valor = Number(e.target.value);
            if (Number.isFinite(valor) && valor >= 0) fijar({ antepecho: valor });
          }}
          className="w-16 rounded border bg-background px-1 py-0.5 text-right"
        />
        <span>m</span>
      </label>
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Nivel de referencia</span>
        <select
          data-testid="abertura-nivel"
          value={opciones.nivel}
          onChange={(e) => fijar({ nivel: e.target.value })}
          className="rounded border bg-background px-1 py-0.5"
        >
          <option value="">Base del muro</option>
          {niveles.map((nivel) => (
            <option key={nivel.globalid} value={nivel.globalid}>
              {nivel.nombre}
            </option>
          ))}
        </select>
      </label>
      <span className="text-muted-foreground" data-testid="abertura-volteo">
        Clic sobre un muro · Espacio {voltear ? "restaura" : "voltea"} el lado
      </span>
    </>
  );
}
