import { tr } from "@/i18n";
import { useRef, type ReactNode, type ThHTMLAttributes } from "react";
import { limitarAncho, useAnchos } from "@/lib/anchos";
import { cn } from "@/lib/utils";

interface Props extends Omit<ThHTMLAttributes<HTMLTableCellElement>, "children"> {
  /** Vista de cuadrícula (clave de la preferencia) y columna. */
  vista: string;
  columna: string;
  /** Ancho de fábrica en píxeles; sin él, la columna ocupa lo que sobra hasta que se ajusta. */
  defecto?: number;
  children?: ReactNode;
}

/**
 * Encabezado de tabla con borde arrastrable para cambiar el ancho (la tabla debe usar
 * `table-layout: fixed`). Doble clic en el borde autoajusta al contenido; las flechas
 * izquierda y derecha lo ajustan con el teclado. El ancho se recuerda por vista.
 */
export function ThAncho({ vista, columna, defecto, className, style, children, ...resto }: Props) {
  const th = useRef<HTMLTableCellElement>(null);
  const arrastre = useRef<{ x: number; ancho: number } | null>(null);
  const guardado = useAnchos((s) => s.anchos[vista]?.[columna]);
  const ancho = guardado ?? defecto;
  const nombre =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.filter((c): c is string => typeof c === "string").join("")
        : columna;

  const fijar = (n: number, persistir: boolean) =>
    useAnchos.getState().fijar(vista, columna, n, persistir);

  function autoajustar() {
    const idx = th.current?.cellIndex ?? -1;
    const tabla = th.current?.closest("table");
    if (idx < 0 || !tabla) return;
    let max = 0;
    for (const fila of Array.from(tabla.rows)) {
      const c = fila.cells[idx];
      if (c && fila.cells.length > idx) max = Math.max(max, c.scrollWidth);
    }
    fijar(limitarAncho(max + 8), true);
  }

  return (
    <th
      ref={th}
      className={cn("relative", className)}
      style={{ ...style, width: ancho }}
      {...resto}
    >
      {children}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={tr("componentes.anchoDe", "Ancho de {{nombre}}", { nombre })}
        aria-valuenow={ancho}
        tabIndex={0}
        title={tr(
          "componentes.arrastra-para-cambiar-el-ancho-doble-clic-para-a",
          "Arrastra para cambiar el ancho; doble clic para ajustar al contenido",
        )}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent focus-visible:bg-accent"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={autoajustar}
        onPointerDown={(e) => {
          arrastre.current = { x: e.clientX, ancho: ancho ?? th.current?.offsetWidth ?? 100 };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (arrastre.current)
            fijar(arrastre.current.ancho + e.clientX - arrastre.current.x, false);
        }}
        onPointerUp={(e) => {
          if (!arrastre.current) return;
          fijar(arrastre.current.ancho + e.clientX - arrastre.current.x, true);
          arrastre.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const actual = ancho ?? th.current?.offsetWidth ?? 100;
          fijar(actual + (e.key === "ArrowRight" ? 10 : -10), true);
        }}
      />
    </th>
  );
}
