// OPEN-RVT (O010): paneles laterales redimensionables. El ancho se guarda en
// localStorage (preferencia de la aplicación) y se puede cambiar arrastrando el borde
// o con las flechas del teclado.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface LimitesPanel {
  minimo: number;
  maximo: number;
  defecto: number;
}

export const LIMITES_PANELES = {
  vistas: { minimo: 160, maximo: 420, defecto: 210 },
  propiedades: { minimo: 220, maximo: 520, defecto: 275 },
} as const satisfies Record<string, LimitesPanel>;

export type PanelId = keyof typeof LIMITES_PANELES;

function clave(id: string): string {
  return `openrvt.ancho-panel.${id}`;
}

export function limitarAnchoPanel(valor: number, limites: LimitesPanel): number {
  if (!Number.isFinite(valor)) return limites.defecto;
  return Math.round(Math.max(limites.minimo, Math.min(limites.maximo, valor)));
}

function leerAncho(id: string, limites: LimitesPanel): number {
  if (typeof localStorage === "undefined") return limites.defecto;
  try {
    const guardado = localStorage.getItem(clave(id));
    if (guardado === null || guardado.trim() === "") return limites.defecto;
    return limitarAnchoPanel(Number(guardado), limites);
  } catch {
    return limites.defecto;
  }
}

function guardarAncho(id: string, valor: number): void {
  try {
    localStorage.setItem(clave(id), String(valor));
  } catch {
    /* sin almacenamiento: el ancho sigue funcionando en la sesión */
  }
}

export function PanelRedimensionable({
  id,
  lado,
  limites = LIMITES_PANELES[id],
  etiqueta,
  children,
}: {
  id: PanelId;
  /** El asa va en el borde derecho del panel izquierdo y en el izquierdo del derecho. */
  lado: "izquierdo" | "derecho";
  limites?: LimitesPanel;
  etiqueta: string;
  children: ReactNode;
}) {
  const [ancho, setAncho] = useState(() => leerAncho(id, limites));
  const [arrastrando, setArrastrando] = useState(false);
  const inicio = useRef<{ x: number; ancho: number } | null>(null);
  const anchoRef = useRef(ancho);
  anchoRef.current = ancho;

  // Si cambian los límites (por ejemplo al montar otra escala), se recorta.
  useEffect(() => {
    setAncho((actual) => limitarAnchoPanel(actual, limites));
  }, [limites]);

  const fijar = useCallback(
    (valor: number, persistir: boolean) => {
      const nuevo = limitarAnchoPanel(valor, limites);
      setAncho(nuevo);
      if (persistir) guardarAncho(id, nuevo);
    },
    [id, limites],
  );

  const alBajar = (evento: React.PointerEvent<HTMLDivElement>) => {
    evento.preventDefault();
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    inicio.current = { x: evento.clientX, ancho: anchoRef.current };
    setArrastrando(true);
  };

  const alMover = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (!inicio.current) return;
    const delta = evento.clientX - inicio.current.x;
    fijar(lado === "izquierdo" ? inicio.current.ancho + delta : inicio.current.ancho - delta, false);
  };

  const alSoltar = (evento: React.PointerEvent<HTMLDivElement>) => {
    if (!inicio.current) return;
    inicio.current = null;
    setArrastrando(false);
    evento.currentTarget.releasePointerCapture?.(evento.pointerId);
    guardarAncho(id, anchoRef.current);
  };

  const alTecla = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const paso = evento.shiftKey ? 40 : 16;
    if (evento.key === "ArrowLeft") {
      evento.preventDefault();
      fijar(anchoRef.current + (lado === "izquierdo" ? -paso : paso), true);
    } else if (evento.key === "ArrowRight") {
      evento.preventDefault();
      fijar(anchoRef.current + (lado === "izquierdo" ? paso : -paso), true);
    } else if (evento.key === "Home") {
      evento.preventDefault();
      fijar(limites.defecto, true);
    }
  };

  const asa = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Redimensionar ${etiqueta}`}
      aria-valuemin={limites.minimo}
      aria-valuemax={limites.maximo}
      aria-valuenow={ancho}
      title={`Arrastre para cambiar el ancho de ${etiqueta}; doble clic para restablecer`}
      tabIndex={0}
      data-testid={`asa-panel-${id}`}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onDoubleClick={() => fijar(limites.defecto, true)}
      onKeyDown={alTecla}
      className={`absolute top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40 focus:bg-primary/50 focus:outline-none ${
        lado === "izquierdo" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"
      } ${arrastrando ? "bg-primary/50" : ""}`}
    />
  );

  return (
    <div
      data-testid={`panel-${id}`}
      data-ancho={ancho}
      className="relative flex min-h-0 shrink-0"
      style={{ width: `${ancho}px` }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      {asa}
    </div>
  );
}
