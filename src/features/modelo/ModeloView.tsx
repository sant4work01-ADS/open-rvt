// OPEN-RVT: editor de la spec O003a. Navegador de vistas a la izquierda, visor three.js
// al centro y propiedades de la vista o del elemento a la derecha. Sin modelo abierto se
// conserva el hueco del esqueleto de O002.
import { useState } from "react";
import { PanelLeft, PanelRight } from "lucide-react";
import { tr } from "@/i18n";
import { useModelo } from "./estado";
import { Visor3D } from "./Visor3D";
import { NavegadorVistas } from "./NavegadorVistas";
import { PanelPropiedades } from "./PanelPropiedades";
import { BarraHerramienta } from "./BarraHerramienta";
import { DialogoEstilos } from "./DialogoEstilos";

export function ModeloView() {
  const ruta = useModelo((s) => s.ruta);
  const esquema = useModelo((s) => s.esquema);
  const mallas = useModelo((s) => s.mallas);
  const estilos = useModelo((s) => s.estilos);
  const aberturas = useModelo((s) => s.aberturas);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const caja = useModelo((s) => s.caja);
  const niveles = useModelo((s) => s.niveles);
  const seleccion = useModelo((s) => s.seleccion);
  const seleccionados = useModelo((s) => s.seleccionados);
  const modoCorte = useModelo((s) => s.modoCorte);
  const puntoCorte = useModelo((s) => s.puntoCorte);
  const cargando = useModelo((s) => s.cargando);
  const error = useModelo((s) => s.error);
  const fijarVista = useModelo((s) => s.fijarVista);
  const seleccionar = useModelo((s) => s.seleccionar);
  const anadirPuntoCorte = useModelo((s) => s.anadirPuntoCorte);
  const [panelAbierto, setPanelAbierto] = useState(true);

  const vista = vistas.find((v) => v.id === vistaActivaId) ?? vistas[0];

  // Un modelo nuevo no tiene ruta ni mallas, pero sí esquema: debe mostrar el editor.
  if (!ruta && !esquema && mallas.length === 0 && !cargando) {
    return (
      <div
        data-testid="area-trabajo"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted/30 text-sm text-muted-foreground"
      >
        <span>{tr("modelo.aqui-ira-el-editor-planta-y-3d", "Aquí irá el editor (planta y 3D)")}</span>
        {error && (
          <span data-testid="error-modelo" className="max-w-[70%] text-center text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div data-testid="modelo-editor" className="flex min-h-0 flex-1 overflow-hidden">
      <NavegadorVistas vistas={vistas} activaId={vista?.id ?? null} onElegir={fijarVista} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
          <span className="font-medium" data-testid="vista-activa-nombre">
            {vista?.nombre ?? "Sin vista"}
          </span>
          {vista && (
            <span className="text-muted-foreground">
              · {vista.categorias ? "categorías configurables" : ""}
            </span>
          )}
          <button
            type="button"
            data-testid="panel-propiedades-toggle"
            onClick={() => setPanelAbierto((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-muted"
            title={panelAbierto ? "Ocultar propiedades" : "Mostrar propiedades"}
          >
            {panelAbierto ? <PanelRight size={14} /> : <PanelLeft size={14} />}
            Propiedades
          </button>
        </div>
        <BarraHerramienta />
        <div className="relative flex min-h-0 flex-1">
          {vista ? (
            <Visor3D
              vista={vista}
              vistas={vistas}
              niveles={niveles}
              mallas={mallas}
              estilos={estilos}
              aberturas={aberturas}
              caja={caja}
              seleccion={seleccion}
              seleccionados={seleccionados}
              modoCorte={modoCorte}
              puntoCorte={puntoCorte}
              onSeleccionar={(gid, agregar) => void seleccionar(gid, agregar)}
              onSeleccionarVarios={(gids) => {
                if (gids.length === 0) void seleccionar(null);
                else void seleccionar(gids[0], false).then(() => {
                  for (const gid of gids.slice(1)) {
                    useModelo.setState((s) => ({
                      seleccionados: [...s.seleccionados, gid],
                    }));
                  }
                });
              }}
              onPuntoCorte={(punto) => void anadirPuntoCorte(punto)}
              onEscape={() => {
                const estado = useModelo.getState();
                if (estado.modoCorte) estado.cancelarCorte();
                else if (estado.herramienta) estado.cancelarHerramienta();
                else void estado.seleccionar(null);
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Este modelo no tiene vistas.
            </div>
          )}
          {cargando && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 text-sm">
              Cargando modelo…
            </div>
          )}
        </div>
      </div>
      {panelAbierto && <PanelPropiedades />}
      <DialogoEstilos />
    </div>
  );
}
