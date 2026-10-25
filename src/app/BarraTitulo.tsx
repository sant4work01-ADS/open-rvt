// OPEN-RVT: copiado de src/app/BarraTitulo.tsx de PresupuestosPro. Se quitó el botón del
// asistente y el estado de la obra; el título es siempre el nombre del producto.
//
// Barra de título propia (spec 031): la ventana va con `decorations: false` y aquí se
// dibujan el título y los botones de minimizar, maximizar/restaurar y cerrar.
// Se conserva lo nativo: `data-tauri-drag-region` mueve la ventana (y con ello Aero Snap en
// Windows), el doble clic maximiza/restaura y los bordes redimensionan con
// `startResizeDragging` (necesario en Windows al quitar las decoraciones).
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Minimize2, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bordes desde los que se puede redimensionar (mismo tipo que la API de Tauri). */
type ResizeDirection =
  "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

/** Ventana actual; `null` fuera de Tauri (pruebas en navegador o jsdom). */
function ventanaActual() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/** Zonas de redimensión pegadas a los bordes de la ventana (decorations:false). */
const ZONAS: ReadonlyArray<{ dir: ResizeDirection; clase: string; testid: string }> = [
  { dir: "North", clase: "left-2 right-2 top-0 h-1 cursor-n-resize", testid: "redimension-north" },
  {
    dir: "South",
    clase: "bottom-0 left-2 right-2 h-1 cursor-s-resize",
    testid: "redimension-south",
  },
  { dir: "West", clase: "bottom-2 left-0 top-2 w-1 cursor-w-resize", testid: "redimension-west" },
  { dir: "East", clase: "bottom-2 right-0 top-2 w-1 cursor-e-resize", testid: "redimension-east" },
  { dir: "NorthWest", clase: "left-0 top-0 h-2 w-2 cursor-nw-resize", testid: "redimension-nw" },
  { dir: "NorthEast", clase: "right-0 top-0 h-2 w-2 cursor-ne-resize", testid: "redimension-ne" },
  { dir: "SouthWest", clase: "bottom-0 left-0 h-2 w-2 cursor-sw-resize", testid: "redimension-sw" },
  {
    dir: "SouthEast",
    clase: "bottom-0 right-0 h-2 w-2 cursor-se-resize",
    testid: "redimension-se",
  },
];

function redimensionar(dir: ResizeDirection) {
  const v = ventanaActual();
  if (!v) return;
  v.startResizeDragging(dir).catch(() => {
    /* el gestor de ventanas puede no soportarlo */
  });
}

export function BarraTitulo() {
  const { t } = useTranslation();
  const [activa, setActiva] = useState(true);
  const [maximizada, setMaximizada] = useState(false);

  // Foco de la ventana: activa (color pleno) o inactiva (atenuada).
  useEffect(() => {
    let vivo = true;
    const quitar: Array<() => void> = [];
    void (async () => {
      const v = ventanaActual();
      if (!v) return;
      try {
        quitar.push(
          await v.onFocusChanged(({ payload }) => {
            if (vivo) setActiva(payload);
          }),
        );
        quitar.push(
          await v.onResized(async () => {
            if (vivo) setMaximizada(await v.isMaximized());
          }),
        );
        if (vivo) setMaximizada(await v.isMaximized());
      } catch {
        /* sin backend de Tauri: se queda activa */
      }
    })();
    return () => {
      vivo = false;
      for (const f of quitar) f();
    };
  }, []);

  const alternarMaximizada = useCallback(async () => {
    const v = ventanaActual();
    if (!v) return;
    // Se refleja al instante; `onResized` confirma el estado real cuando el gestor de
    // ventanas responde (en xvfb sin WM no hay evento de redimensión).
    setMaximizada((m) => !m);
    try {
      await v.toggleMaximize();
    } catch {
      /* sin backend */
    }
  }, []);

  const alDobleClic = useCallback(
    (e: MouseEvent) => {
      // Los botones de la barra tienen su propia acción.
      if ((e.target as HTMLElement).closest("button")) return;
      void alternarMaximizada();
    },
    [alternarMaximizada],
  );

  const accion = (f: "minimize" | "close") => () => {
    const v = ventanaActual();
    if (!v) return;
    v[f]().catch(() => {
      /* sin backend */
    });
  };

  const titulo = t("comun.app", "OPEN-RVT");

  return (
    <>
      <div
        data-testid="ventana-barra-titulo"
        data-activa={activa}
        data-maximizada={maximizada}
        role="group"
        aria-label={t("barraTitulo.barra")}
        data-tauri-drag-region
        onDoubleClick={alDobleClic}
        style={{ height: 30 }}
        className={cn(
          "relative flex shrink-0 select-none items-center bg-accent text-accent-foreground transition-opacity",
          activa ? "opacity-100" : "opacity-60",
        )}
      >
        <span
          data-testid="titulo-ventana"
          data-tauri-drag-region
          style={{ fontSize: 12 }}
          className="truncate px-3 font-medium"
        >
          {titulo}
        </span>
        <div className="ml-auto flex h-full items-stretch">
          <button
            type="button"
            aria-label={t("barraTitulo.minimizar")}
            title={t("barraTitulo.minimizar")}
            onClick={accion("minimize")}
            style={{ width: 46 }}
            className="flex h-full items-center justify-center hover:bg-black/15"
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            aria-label={maximizada ? t("barraTitulo.restaurar") : t("barraTitulo.maximizar")}
            title={maximizada ? t("barraTitulo.restaurar") : t("barraTitulo.maximizar")}
            onClick={() => void alternarMaximizada()}
            style={{ width: 46 }}
            className="flex h-full items-center justify-center hover:bg-black/15"
          >
            {maximizada ? <Minimize2 size={18} /> : <Square size={18} />}
          </button>
          <button
            type="button"
            aria-label={t("barraTitulo.cerrar")}
            title={t("barraTitulo.cerrar")}
            onClick={accion("close")}
            style={{ width: 46 }}
            className="flex h-full items-center justify-center hover:bg-red-600 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {ZONAS.map((z) => (
        <div
          key={z.testid}
          data-testid={z.testid}
          aria-hidden
          onMouseDown={(e) => {
            e.preventDefault();
            redimensionar(z.dir);
          }}
          className={cn("fixed z-50", z.clase)}
        />
      ))}
    </>
  );
}
