import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { indiceTrasMovimiento, renglonesPorPagina } from "@/lib/listaTeclado";
import { cn } from "@/lib/utils";

export type ItemMenu =
  | { separador: true }
  | {
      separador?: false;
      id: string;
      titulo: string;
      /** Atajo de teclado, solo informativo. */
      atajo?: string;
      desactivado?: boolean;
      peligro?: boolean;
      /** Opción principal del menú: se muestra en primer lugar y con más peso. */
      destacado?: boolean;
      /** Identificador estable para las pruebas E2E (`data-testid`). */
      prueba?: string;
      onElegir: () => void;
    };

interface Props {
  x: number;
  y: number;
  items: ItemMenu[];
  etiqueta: string;
  onCerrar: () => void;
}

/** Menú contextual (clic derecho): flechas para moverse, Enter elige, Escape o clic fuera cierra. */
export function MenuContextual({ x, y, items, etiqueta, onCerrar }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const accionables = items.filter(
    (i): i is Extract<ItemMenu, { id: string }> => !i.separador && !i.desactivado,
  );
  const [activo, setActivo] = useState(0);
  const [activoEl, setActivoEl] = useState<HTMLButtonElement | null>(null);

  // Que el renglón activo siempre quede a la vista (↑↓, RePág/AvPág, Inicio/Fin).
  useEffect(() => {
    activoEl?.scrollIntoView?.({ block: "nearest" });
  }, [activoEl]);

  // Que no se salga de la ventana.
  useLayoutEffect(() => {
    const r = raiz.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    raiz.current?.focus();
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) onCerrar();
    };
    window.addEventListener("mousedown", fuera);
    window.addEventListener("blur", onCerrar);
    return () => {
      window.removeEventListener("mousedown", fuera);
      window.removeEventListener("blur", onCerrar);
    };
  }, [onCerrar]);

  function elegir(i: Extract<ItemMenu, { id: string }>) {
    onCerrar();
    // Tras cerrar, para que el foco vuelva a la cuadrícula antes de actuar.
    setTimeout(i.onElegir, 0);
  }

  return (
    <div
      ref={raiz}
      role="menu"
      aria-label={etiqueta}
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 min-w-64 rounded-md border bg-background py-1 text-base shadow-xl outline-none"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onCerrar();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setActivo((a) => (a + 1) % Math.max(accionables.length, 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActivo((a) => (a - 1 + accionables.length) % Math.max(accionables.length, 1));
        } else if (e.key === "PageDown" || e.key === "PageUp" || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const mov =
            e.key === "PageDown"
              ? "paginaAbajo"
              : e.key === "PageUp"
                ? "paginaArriba"
                : e.key === "Home"
                  ? "inicio"
                  : "fin";
          // RePág/AvPág, Inicio y Fin no se envuelven: se detienen en los extremos.
          setActivo((a) =>
            indiceTrasMovimiento(mov, a, accionables.length, renglonesPorPagina(raiz.current)),
          );
        } else if (e.key === "Enter") {
          e.preventDefault();
          const i = accionables[activo];
          if (i) elegir(i);
        }
      }}
    >
      {items.map((i, k) =>
        i.separador ? (
          <div key={`s${k}`} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={i.id}
            type="button"
            role="menuitem"
            data-testid={i.prueba}
            disabled={i.desactivado}
            aria-label={i.titulo}
            aria-keyshortcuts={i.atajo}
            ref={(el) => {
              // El elemento resaltado se mantiene a la vista al navegar con el teclado.
              if (!i.desactivado && accionables[activo]?.id === i.id) setActivoEl(el);
            }}
            className={cn(
              "flex w-full items-center justify-between gap-6 px-3 py-1 text-left disabled:opacity-40",
              !i.desactivado && accionables[activo]?.id === i.id && "bg-muted",
              i.destacado && "font-medium",
              i.peligro && "text-red-600 dark:text-red-400",
            )}
            onMouseEnter={() => {
              const n = accionables.findIndex((a) => a.id === i.id);
              if (n >= 0) setActivo(n);
            }}
            onClick={() => elegir(i)}
          >
            <span>{i.titulo}</span>
            {i.atajo && <span className="text-xs text-muted-foreground">{i.atajo}</span>}
          </button>
        ),
      )}
    </div>
  );
}
