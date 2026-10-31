// OPEN-RVT (O003b): barra de opciones de la herramienta activa. El selector de tipo
// de muro aparece aquí, junto con altura y alineación, como en Revit.
import {
  ALIAS_HERRAMIENTA,
  esHerramientaEstructura,
  esHerramientaLineal,
  esHerramientaPuntual,
  useModelo,
} from "./estado";

export function BarraHerramienta() {
  const herramienta = useModelo((s) => s.herramienta);
  const opciones = useModelo((s) => s.opcionesMuro);
  const tipos = useModelo((s) => s.tiposMuro);
  const fijar = useModelo((s) => s.fijarOpcionesMuro);
  const tiposEstructura = useModelo((s) => s.tiposHerramienta);
  const elegidos = useModelo((s) => s.tipoHerramienta);
  const fijarTipo = useModelo((s) => s.fijarTipoHerramienta);
  const girar = useModelo((s) => s.girar90);
  const rotacion = useModelo((s) => s.rotacionSiguiente);
  const puntos = useModelo((s) => s.puntosHerramienta);
  const longitud = useModelo((s) => s.longitudTecleada);
  const seleccionados = useModelo((s) => s.seleccionados);
  const voltear = useModelo((s) => s.voltearSiguiente);
  const cancelar = useModelo((s) => s.cancelarHerramienta);
  const doble = useModelo((s) => s.dobleClicEnPlanta);
  const losaDesdeMuros = useModelo((s) => s.losaDesdeMuros);
  const etiquetaEje = useModelo((s) => s.etiquetaEje);
  const opcionesNivel = useModelo((s) => s.opcionesNivel);
  const fijarOpcionesNivel = useModelo((s) => s.fijarOpcionesNivel);
  const cotasNivel = useModelo((s) => s.cotasNivel);
  const crearNivel = useModelo((s) => s.crearNivel);
  const conZapata = useModelo((s) => s.columnaConZapata);
  const fijarConZapata = useModelo((s) => s.fijarColumnaConZapata);
  const tipoZapata = useModelo((s) => s.tipoZapata);
  const fijarTipoZapata = useModelo((s) => s.fijarTipoZapata);
  const columnasEnCruces = useModelo((s) => s.columnasEnCruces);
  if (!herramienta) return null;
  const estructura = esHerramientaEstructura(herramienta);
  const opcionesTipo = estructura
    ? tiposEstructura.filter((t) => t.alias === ALIAS_HERRAMIENTA[herramienta])
    : [];
  const tiposZapata = tiposEstructura.filter((t) => t.alias === "zapata");
  const tipoElegido =
    (estructura ? elegidos[herramienta] : undefined) ?? opcionesTipo[0]?.nombre ?? "";
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
      {estructura && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Tipo</span>
            <select
              data-testid="estructura-tipo"
              value={tipoElegido}
              onChange={(e) => fijarTipo(herramienta, e.target.value)}
              className="rounded border bg-background px-1 py-0.5"
            >
              {opcionesTipo.map((tipo) => (
                <option key={tipo.globalid} value={tipo.nombre}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </label>
          {esHerramientaPuntual(herramienta) && (
            <>
              <span className="text-muted-foreground">
                {herramienta === "castillo"
                  ? "Clic sobre un muro o en un cruce de ejes"
                  : "Clic en un cruce de ejes"}
              </span>
              <button
                type="button"
                data-testid="estructura-girar"
                onClick={girar}
                className="rounded border px-2 py-0.5 hover:bg-muted"
              >
                R · Girar 90° ({rotacion}°)
              </button>
              {herramienta === "columna" && (
                <>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      data-testid="columna-con-zapata"
                      checked={conZapata}
                      onChange={(e) => fijarConZapata(e.target.checked)}
                    />
                    <span>Con zapata</span>
                  </label>
                  <select
                    data-testid="columna-tipo-zapata"
                    value={tipoZapata || tiposZapata[0]?.nombre || ""}
                    onChange={(e) => fijarTipoZapata(e.target.value)}
                    disabled={!conZapata}
                    className="rounded border bg-background px-1 py-0.5 disabled:opacity-50"
                  >
                    {tiposZapata.map((tipo) => (
                      <option key={tipo.globalid} value={tipo.nombre}>
                        {tipo.nombre}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="columna-en-cruces"
                    onClick={() => void columnasEnCruces()}
                    className="rounded border px-2 py-0.5 hover:bg-muted"
                  >
                    En todos los cruces
                  </button>
                </>
              )}
            </>
          )}
          {(herramienta === "cerramiento" || herramienta === "dala") && (
            <span className="text-muted-foreground">
              Clic sobre un muro · se liga a su eje
            </span>
          )}
          {esHerramientaLineal(herramienta) && (
            <span className="text-muted-foreground">
              {puntos.length === 0
                ? "Primer punto"
                : longitud
                  ? `Longitud: ${longitud} m · Enter`
                  : "Segundo punto o escriba la longitud"}
            </span>
          )}
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
      {herramienta === "nivel" && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Nombre</span>
            <input
              data-testid="nivel-herramienta-nombre"
              value={opcionesNivel.nombre}
              onChange={(e) => fijarOpcionesNivel({ nombre: e.target.value })}
              className="w-28 rounded border bg-background px-1 py-0.5"
            />
            <button
              type="button"
              data-testid="nivel-herramienta-auto"
              data-automatico={opcionesNivel.nombreAutomatico ? "si" : "no"}
              title="Volver al nombre automático"
              onClick={() =>
                fijarOpcionesNivel({ nombre: "", nombreAutomatico: true })
              }
              className="rounded border px-1 py-0.5 text-muted-foreground hover:bg-muted"
            >
              Auto
            </button>
          </label>
          <label className="flex items-center gap-1">
            <input
              data-testid="nivel-herramienta-crear-planta"
              type="checkbox"
              checked={opcionesNivel.crearPlanta}
              onChange={(e) => fijarOpcionesNivel({ crearPlanta: e.target.checked })}
            />
            <span className="text-muted-foreground">Crear vista de planta</span>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Elevación</span>
            <input
              data-testid="nivel-herramienta-elevacion"
              type="text"
              inputMode="decimal"
              value={opcionesNivel.elevacionTexto}
              onChange={(e) => fijarOpcionesNivel({ elevacionTexto: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="1.50"
              className="w-16 rounded border bg-background px-1 py-0.5 text-right"
            />
            <span>m</span>
            <button
              type="button"
              data-testid="nivel-herramienta-crear"
              onClick={() => {
                const valor = Number(
                  (opcionesNivel.elevacionTexto || "").replace(",", "."),
                );
                if (!Number.isFinite(valor)) return;
                void crearNivel(
                  opcionesNivel.nombre || "Nivel",
                  valor,
                  { crearPlanta: opcionesNivel.crearPlanta },
                );
              }}
              className="rounded border px-2 py-0.5 hover:bg-muted"
            >
              Crear
            </button>
          </label>
          <span className="text-muted-foreground" data-testid="nivel-herramienta-cotas">
            {cotasNivel?.inferior
              ? `${(puntos[puntos.length - 1]?.[1] ?? cotasNivel.inferior.elevacion).toFixed(2)} m = ${cotasNivel.inferior.nombre} + ...`
              : "Sin nivel inferior"}
          </span>
        </>
      )}
      {herramienta === "eje" && (
        <span className="text-muted-foreground" data-testid="eje-etiqueta">
          {puntos.length === 0
            ? `Siguiente etiqueta: ${etiquetaEje || "1 / A"}`
            : longitud
              ? `Longitud: ${longitud} m · Enter`
              : "Segundo punto, longitud y Enter, o doble clic"}
        </span>
      )}
      {herramienta === "losa" && puntos.length > 0 && (
        <span className="text-muted-foreground">
          {longitud ? `Longitud: ${longitud} m · Enter cierra` : "Doble clic o Enter para cerrar"}
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
