// O070: área de trabajo con una o dos vistas. Cada panel tiene su propia vista,
// cámara y controles; el activo manda en el resto de la interfaz.
import { useEffect, useRef, useState } from "react";
import { Visor3D } from "../Visor3D";
import { useModelo } from "../estado";
import { limitarProporcion } from "../paneles";
import type { Vista } from "../tipos";
import type { Props } from "./tipos";

type PropsArea = Omit<Props, "vista" | "claveCamara" | "panelIndice"> & {
  /** Vista de la vista activa; se usa cuando la pantalla no está dividida. */
  vista: Vista;
};

/** Nombre visible de la vista de un panel (o «Sin vista» si está vacío). */
function nombrePanel(vistas: Vista[], vistaId: string | null): string {
  return vistas.find((v) => v.id === vistaId)?.nombre ?? "Sin vista";
}

export function AreaDividida({ vista, vistas, ...comunes }: PropsArea) {
  const dividida = useModelo((s) => s.dividida);
  const orientacion = useModelo((s) => s.orientacionDivision);
  const proporcionGuardada = useModelo((s) => s.proporcionDivision);
  const paneles = useModelo((s) => s.paneles);
  const panelActivo = useModelo((s) => s.panelActivo);
  const fijarPanelActivo = useModelo((s) => s.fijarPanelActivo);
  const fijarProporcion = useModelo((s) => s.fijarProporcionDivision);
  const [proporcion, setProporcion] = useState(proporcionGuardada);
  const [arrastrando, setArrastrando] = useState(false);
  const proporcionRef = useRef(proporcionGuardada);
  const contenedor = useRef<HTMLDivElement>(null);

  // Separador: arrastre limitado al 20–80 % de cada lado.
  useEffect(() => {
    if (!arrastrando) return;
    const mover = (e: PointerEvent) => {
      const rect = contenedor.current?.getBoundingClientRect();
      if (!rect) return;
      const valor =
        orientacion === "vertical"
          ? (e.clientX - rect.left) / Math.max(rect.width, 1)
          : (e.clientY - rect.top) / Math.max(rect.height, 1);
      const limitado = limitarProporcion(valor);
      proporcionRef.current = limitado;
      setProporcion(limitado);
    };
    const soltar = () => {
      setArrastrando(false);
      fijarProporcion(proporcionRef.current);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
  }, [arrastrando, orientacion, fijarProporcion]);

  const vistaDePanel = (indice: 0 | 1): Vista | null =>
    vistas.find((v) => v.id === paneles[indice].vistaId) ?? null;

  if (!dividida) {
    return (
      <div
        data-testid="area-dividida"
        data-dividida="no"
        className="flex min-h-0 flex-1"
      >
        <Visor3D {...comunes} vistas={vistas} vista={vista} />
      </div>
    );
  }

  const primera = vistaDePanel(0) ?? vista;
  const segunda = vistaDePanel(1);
  const mostrada = arrastrando ? proporcion : proporcionGuardada;
  const tamano = `${(mostrada * 100).toFixed(3)}%`;
  // El segundo panel ocupa el resto; antes ambos usaban `tamano` y quedaba un hueco vacío.
  const tamanoResto = `${((1 - mostrada) * 100).toFixed(3)}%`;
  const columna = orientacion === "vertical";

  return (
    <div
      ref={contenedor}
      data-testid="area-dividida"
      data-dividida="si"
      data-orientacion={orientacion}
      data-proporcion={mostrada.toFixed(4)}
      data-arrastrando={arrastrando ? "si" : "no"}
      className={`flex min-h-0 flex-1 ${columna ? "flex-row" : "flex-col"}`}
    >
      {[0, 1].map((indice) => {
        const i = indice as 0 | 1;
        const vistaPanel = i === 0 ? primera : segunda;
        const activo = panelActivo === i;
        return (
          <div key={i} className="contents">
            {i === 1 && (
              <div
                data-testid="separador-paneles"
                role="separator"
                aria-orientation={columna ? "vertical" : "horizontal"}
                aria-valuenow={Math.round(mostrada * 100)}
                aria-valuemin={20}
                aria-valuemax={80}
                title="Arrastrar para repartir; doble clic para 50/50"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProporcion(proporcionGuardada);
                  proporcionRef.current = proporcionGuardada;
                  setArrastrando(true);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProporcion(0.5);
                  fijarProporcion(0.5);
                }}
                className={`shrink-0 bg-border hover:bg-primary/60 ${
                  columna ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
                }`}
              />
            )}
            <div
              data-testid={`panel-vista-${i}`}
              data-activo={activo ? "si" : "no"}
              data-vista-id={vistaPanel?.id ?? ""}
              onPointerDownCapture={() => fijarPanelActivo(i)}
              onWheelCapture={() => fijarPanelActivo(i)}
              onPointerMoveCapture={(e) => {
                if (e.buttons !== 0) fijarPanelActivo(i);
              }}
              style={
                columna
                  ? { width: `calc(${i === 0 ? tamano : tamanoResto} - 2px)`, flexShrink: 0 }
                  : { height: `calc(${i === 0 ? tamano : tamanoResto} - 2px)`, flexShrink: 0 }
              }
              className={`flex min-h-0 min-w-0 flex-col border-2 ${
                activo ? "border-primary" : "border-transparent"
              }`}
            >
              <div
                data-testid={`panel-nombre-${i}`}
                className={`flex h-6 shrink-0 items-center gap-2 border-b px-2 text-xs ${
                  activo ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="truncate">
                  {nombrePanel(vistas, paneles[i].vistaId)}
                </span>
                {activo && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide">
                    activo
                  </span>
                )}
              </div>
              {vistaPanel ? (
                <Visor3D
                  {...comunes}
                  vistas={vistas}
                  vista={vistaPanel}
                  panelIndice={i}
                  claveCamara={`${i}:${vistaPanel.id}`}
                />
              ) : (
                <div
                  data-testid={`panel-vacio-${i}`}
                  className="flex flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground"
                >
                  Elija una vista en el navegador para este panel.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
