import { tr, trTexto } from "@/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  className?: string;
  /** Muestra una cabecera con el título y el botón de cerrar. */
  conCabecera?: boolean;
  /** Permite arrastrar la ventana desde la cabecera. */
  movible?: boolean;
  /** Permite redimensionar la ventana desde bordes y esquinas. */
  redimensionable?: boolean;
  minAncho?: number;
  minAlto?: number;
}

const MIN_ANCHO = 600;
const MIN_ALTO = 400;

function anchoInicial(className?: string) {
  if (typeof window === "undefined") return MIN_ANCHO;
  const max = window.innerWidth * 0.9;
  if (className?.includes("1100px")) return Math.min(1100, max);
  if (className?.includes("760px")) return Math.min(760, max);
  if (className?.includes("720px")) return Math.min(720, max);
  if (className?.includes("640px")) return Math.min(640, max);
  if (className?.includes("480px")) return Math.min(480, max);
  if (className?.includes("420px")) return Math.min(420, max);
  return Math.min(640, max);
}

function altoInicial() {
  if (typeof window === "undefined") return MIN_ALTO;
  return Math.min(600, window.innerHeight * 0.8);
}

/** Diálogo modal sencillo: foco atrapado al abrir, Escape cierra, desactiva los atajos globales.
 *  Si no cabe a lo alto, su contenido se desplaza. */
export function Modal({
  titulo,
  onCerrar,
  children,
  className,
  conCabecera = false,
  movible = false,
  redimensionable = false,
  minAncho = MIN_ANCHO,
  minAlto = MIN_ALTO,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const previo = useRef<Element | null>(null);

  const [[x, y, ancho, alto], setRect] = useState(() => {
    const w = anchoInicial(className);
    const h = altoInicial();
    const ix = typeof window !== "undefined" ? Math.round((window.innerWidth - w) / 2) : 0;
    const iy = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.12) : 0;
    return [ix, iy, w, h];
  });

  useEffect(() => {
    previo.current = document.activeElement;
    // OPEN-RVT: sin sesión de obra; el modal solo recuerda y devuelve el foco.
    return () => {
      if (previo.current instanceof HTMLElement) previo.current.focus();
    };
  }, []);

  const limitar = (nx: number, ny: number, nw: number, nh: number) => {
    const W = typeof window !== "undefined" ? window.innerWidth : nw;
    const H = typeof window !== "undefined" ? window.innerHeight : nh;
    const w = Math.max(minAncho, Math.min(nw, W));
    const h = Math.max(minAlto, Math.min(nh, H));
    const x = Math.max(0, Math.min(nx, W - w));
    const y = Math.max(0, Math.min(ny, H - h));
    return [x, y, w, h] as [number, number, number, number];
  };

  const arrastrar = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!movible) return;
    e.preventDefault();
    const inicioX = e.clientX;
    const inicioY = e.clientY;
    const inicioRect = [x, y, ancho, alto] as const;

    const mover = (ev: MouseEvent) => {
      const dx = ev.clientX - inicioX;
      const dy = ev.clientY - inicioY;
      setRect(limitar(inicioRect[0] + dx, inicioRect[1] + dy, inicioRect[2], inicioRect[3]));
    };

    const soltar = () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
    };

    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  type Borde = "e" | "w" | "s" | "n" | "se" | "sw" | "ne" | "nw";

  const redimensionar = (borde: Borde, e: React.MouseEvent<HTMLDivElement>) => {
    if (!redimensionable) return;
    e.preventDefault();
    e.stopPropagation();
    const inicioX = e.clientX;
    const inicioY = e.clientY;
    const inicioRect = [x, y, ancho, alto] as const;

    const mover = (ev: MouseEvent) => {
      const dx = ev.clientX - inicioX;
      const dy = ev.clientY - inicioY;
      let nx = inicioRect[0];
      let ny = inicioRect[1];
      let nw = inicioRect[2];
      let nh = inicioRect[3];

      if (borde.includes("e")) nw = inicioRect[2] + dx;
      if (borde.includes("w")) {
        nw = inicioRect[2] - dx;
        nx = inicioRect[0] + dx;
      }
      if (borde.includes("s")) nh = inicioRect[3] + dy;
      if (borde.includes("n")) {
        nh = inicioRect[3] - dy;
        ny = inicioRect[1] + dy;
      }

      setRect(limitar(nx, ny, nw, nh));
    };

    const soltar = () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
    };

    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  const conControles = movible || redimensionable;

  const asa = (borde: Borde, cursor: string, clases: string) =>
    redimensionable ? (
      <div
        key={borde}
        data-testid={`modal-asa-${borde}`}
        className={cn("absolute z-50", clases, cursor)}
        onMouseDown={(e) => redimensionar(borde, e)}
      />
    ) : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={trTexto("dialogos", titulo)}
        className={cn(
          "rounded-md border bg-background shadow-xl",
          conControles
            ? "absolute flex flex-col overflow-hidden"
            : "max-h-[calc(100vh-12vh-1rem)] w-[min(640px,92vw)] overflow-y-auto",
          className,
        )}
        style={
          conControles
            ? {
                left: x,
                top: y,
                width: ancho,
                height: alto,
                minWidth: minAncho,
                minHeight: minAlto,
              }
            : undefined
        }
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCerrar();
          }
        }}
      >
        {conCabecera && (
          <div
            data-testid="modal-cabecera"
            className={cn(
              "flex items-center justify-between border-b px-4 py-2",
              movible ? "cursor-move" : "",
            )}
            onMouseDown={arrastrar}
          >
            <h2 className="text-sm font-semibold">{trTexto("dialogos", titulo)}</h2>
            <button
              type="button"
              aria-label={tr("componentes.cerrar", "Cerrar")}
              title={tr("componentes.cerrar-esc", "Cerrar (Esc)")}
              data-testid="modal-cerrar"
              onClick={onCerrar}
              className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        )}
        <div className={cn("relative", conControles && "flex flex-1 flex-col overflow-hidden")}>
          {children}
        </div>
        {asa("n", "cursor-n-resize", "left-1 right-1 top-0 h-1")}
        {asa("s", "cursor-s-resize", "bottom-0 left-1 right-1 h-1")}
        {asa("e", "cursor-e-resize", "right-0 top-1 bottom-1 w-1")}
        {asa("w", "cursor-w-resize", "left-0 top-1 bottom-1 w-1")}
        {asa("nw", "cursor-nw-resize", "left-0 top-0 h-2 w-2")}
        {asa("ne", "cursor-ne-resize", "right-0 top-0 h-2 w-2")}
        {asa("sw", "cursor-sw-resize", "left-0 bottom-0 h-2 w-2")}
        {asa("se", "cursor-se-resize", "right-0 bottom-0 h-2 w-2")}
      </div>
    </div>
  );
}
