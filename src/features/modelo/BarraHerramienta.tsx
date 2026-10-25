// OPEN-RVT (O003b): barra de opciones de la herramienta activa. El selector de tipo
// de muro aparece aquí, junto con altura y alineación, como en Revit.
import { useModelo } from "./estado";

export function BarraHerramienta() {
  const herramienta = useModelo((s) => s.herramienta);
  const opciones = useModelo((s) => s.opcionesMuro);
  const tipos = useModelo((s) => s.tiposMuro);
  const fijar = useModelo((s) => s.fijarOpcionesMuro);
  const puntos = useModelo((s) => s.puntosHerramienta);
  const longitud = useModelo((s) => s.longitudTecleada);
  const seleccionados = useModelo((s) => s.seleccionados);
  const voltear = useModelo((s) => s.voltearSiguiente);
  const cancelar = useModelo((s) => s.cancelarHerramienta);
  const doble = useModelo((s) => s.dobleClicEnPlanta);
  const losaDesdeMuros = useModelo((s) => s.losaDesdeMuros);
  if (!herramienta) return null;
  return (
    <div
      data-testid="barra-herramienta"
      data-herramienta={herramienta}
      className="flex h-9 shrink-0 items-center gap-3 border-b bg-muted/30 px-3 text-xs"
    >
      <span className="font-semibold capitalize">{herramienta}</span>
      {herramienta === "muro" && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Tipo</span>
            <select
              data-testid="muro-tipo"
              value={opciones.tipo}
              onChange={(e) => fijar({ tipo: e.target.value })}
              className="rounded border bg-background px-1 py-0.5"
            >
              {tipos.map((tipo) => (
                <option key={tipo.globalid} value={tipo.nombre}>
                  {tipo.nombre} ({tipo.espesor.toFixed(2)} m)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Altura</span>
            <input
              data-testid="muro-altura"
              type="number"
              step={0.05}
              value={opciones.altura}
              onChange={(e) => {
                const valor = Number(e.target.value);
                if (Number.isFinite(valor) && valor > 0) fijar({ altura: valor });
              }}
              className="w-16 rounded border bg-background px-1 py-0.5 text-right"
            />
            <span>m</span>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Alineación</span>
            <select
              data-testid="muro-alineacion"
              value={opciones.alineacion}
              onChange={(e) =>
                fijar({ alineacion: e.target.value as "centro" | "interior" | "exterior" })
              }
              className="rounded border bg-background px-1 py-0.5"
            >
              <option value="centro">Centro</option>
              <option value="interior">Interior</option>
              <option value="exterior">Exterior</option>
            </select>
          </label>
        </>
      )}
      {herramienta === "losa" && (
        <>
          <span className="text-muted-foreground" data-testid="losa-vertices">
            {puntos.length} vértice(s)
          </span>
          <button
            type="button"
            data-testid="losa-cerrar"
            onClick={() => void doble()}
            className="rounded border px-2 py-0.5 hover:bg-muted"
          >
            Cerrar losa
          </button>
          <button
            type="button"
            data-testid="losa-desde-muros"
            onClick={() => void losaDesdeMuros()}
            className="rounded border px-2 py-0.5 hover:bg-muted"
          >
            Desde muros ({seleccionados.length})
          </button>
        </>
      )}
      {(herramienta === "puerta" || herramienta === "ventana") && (
        <span className="text-muted-foreground" data-testid="abertura-volteo">
          Clic sobre un muro · Espacio {voltear ? "restaura" : "voltea"} el lado
        </span>
      )}
      {(herramienta === "mover" || herramienta === "copiar") && (
        <span className="text-muted-foreground">
          Selección: {seleccionados.length} · {puntos.length === 0 ? "punto base" : "punto destino"}
        </span>
      )}
      {herramienta === "muro" && (
        <span className="text-muted-foreground">
          {puntos.length === 0
            ? "Primer punto"
            : longitud
              ? `Longitud: ${longitud} m · Enter`
              : "Segundo punto o escriba la longitud"}
        </span>
      )}
      <button
        type="button"
        data-testid="herramienta-cancelar"
        onClick={cancelar}
        className="ml-auto rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted"
      >
        Esc · Cancelar
      </button>
    </div>
  );
}
