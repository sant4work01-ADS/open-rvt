// OPEN-RVT: panel derecho. Sin selección muestra las propiedades de la vista; con
// selección, las del elemento IFC (O064: cada panel vive en su propio módulo).
import { useModelo } from "./estado";
import { type AjusteEjeVista, type Vista } from "./tipos";
import { globoVisibleEje } from "./ejesVista";
import { PropiedadesVista } from "./panelVista";
import { PropiedadesElemento } from "./panelElemento";

export { CLAVE_SECCIONES_PLEGADAS, leerSeccionesPlegadas } from "./panelVista";
export { PropiedadesVista } from "./panelVista";
export { PropiedadesElemento } from "./panelElemento";
export { CampoEditable } from "./campoEditable";
export { BordesLosaElemento } from "./panelLosa";

function PropiedadesEje({ vista }: { vista: Vista }) {
  const ejeSeleccionado = useModelo((s) => s.ejeSeleccionado);
  const referencias = useModelo((s) => s.referencias);
  const fijarAjustesEjes = useModelo((s) => s.fijarAjustesEjes);
  const eje = referencias.ejes.find((e) => e.globalid === ejeSeleccionado);
  if (!eje) return null;
  const ajuste: AjusteEjeVista | undefined = vista.ejes?.[eje.globalid];
  const guardar = (cambios: Partial<AjusteEjeVista>, limpiar = false) => {
    if (limpiar) {
      void fijarAjustesEjes(vista.id, { [eje.globalid]: null });
      return;
    }
    const siguiente: AjusteEjeVista = { ...(ajuste ?? {}), ...cambios };
    void fijarAjustesEjes(vista.id, { [eje.globalid]: siguiente });
  };
  const automaticos = !ajuste?.extremoInicio && !ajuste?.extremoFin;
  return (
    <div data-testid="propiedades-eje" className="flex flex-col gap-2 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Eje {eje.etiqueta}</span>
        <span className="text-muted-foreground">{vista.nombre}</span>
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Globo inicio</span>
        <input
          type="checkbox"
          data-testid="eje-prop-globo-inicio"
          checked={globoVisibleEje(ajuste, "inicio")}
          onChange={(e) => guardar({ globoInicio: e.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Globo fin</span>
        <input
          type="checkbox"
          data-testid="eje-prop-globo-fin"
          checked={globoVisibleEje(ajuste, "fin")}
          onChange={(e) => guardar({ globoFin: e.target.checked })}
        />
      </label>
      <label
        className="flex items-center justify-between gap-2"
        title="Con los extremos en automático, el eje sigue la alineación común de la retícula."
      >
        <span className="text-muted-foreground">Extremos en automático</span>
        <input
          type="checkbox"
          data-testid="eje-prop-automatico"
          checked={automaticos}
          onChange={(e) => {
            if (!e.target.checked) return;
            const siguiente: AjusteEjeVista = { ...(ajuste ?? {}) };
            delete siguiente.extremoInicio;
            delete siguiente.extremoFin;
            void fijarAjustesEjes(vista.id, { [eje.globalid]: siguiente });
          }}
        />
      </label>
      <button
        type="button"
        data-testid="eje-prop-restablecer"
        className="rounded border px-2 py-1 hover:bg-muted"
        onClick={() => guardar({}, true)}
      >
        Restablecer acomodo de este eje
      </button>
    </div>
  );
}

export function PanelPropiedades({ onPlegar }: { onPlegar?: () => void }) {
  const seleccion = useModelo((s) => s.seleccion);
  const ejeSeleccionado = useModelo((s) => s.ejeSeleccionado);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const vista = vistas.find((v) => v.id === vistaActivaId);
  const hayEje = !!ejeSeleccionado && !!vista;
  return (
    <aside
      data-testid="panel-propiedades"
      aria-label="Propiedades"
      className="flex min-h-0 w-full flex-col overflow-y-auto border-l bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {seleccion
            ? "Propiedades del elemento"
            : hayEje
              ? "Propiedades del eje"
              : "Propiedades de la vista"}
        </span>
        {onPlegar && (
          <button
            type="button"
            data-testid="panel-derecho-plegar"
            aria-label="Plegar panel derecho"
            title="Plegar el panel de Propiedades (Ctrl+Alt+→)"
            onClick={onPlegar}
            className="rounded px-1 text-sm text-muted-foreground hover:bg-muted"
          >
            ›
          </button>
        )}
      </div>
      {seleccion ? (
        <PropiedadesElemento />
      ) : hayEje && vista ? (
        <PropiedadesEje vista={vista} />
      ) : vista ? (
        <PropiedadesVista vista={vista} />
      ) : (
        <div className="p-3 text-xs text-muted-foreground">No hay ninguna vista activa.</div>
      )}
    </aside>
  );
}
