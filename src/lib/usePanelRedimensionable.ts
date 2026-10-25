import { useEffect, useRef, useState } from "react";

export interface OpcionesPanel {
  clave: string;
  minimo: number;
  maximo?: number | (() => number);
  defecto: number;
  /** Eje del arrastre; por omisión, alto (vertical). Spec 063 usa horizontal para la lista. */
  orientacion?: "vertical" | "horizontal";
}

function leerTamano({ clave, minimo, defecto }: OpcionesPanel): number {
  try {
    const guardada = Number(localStorage.getItem(clave));
    if (Number.isFinite(guardada) && guardada >= minimo) return guardada;
  } catch {
    /* sin localStorage */
  }
  return defecto;
}

/**
 * Panel redimensionable que recuerda su tamaño en `localStorage`. Vertical ajusta el alto
 * (arrastre y flechas arriba/abajo); horizontal ajusta el ancho (izquierda/derecha).
 */
export function usePanelRedimensionable(opciones: OpcionesPanel) {
  const horizontal = opciones.orientacion === "horizontal";
  const {
    clave,
    minimo,
    maximo = () => (horizontal ? window.innerWidth - 420 : window.innerHeight - 220),
    defecto,
  } = opciones;
  const [tamano, setTamano] = useState(() =>
    leerTamano({ clave, minimo, defecto, orientacion: opciones.orientacion }),
  );
  const arrastre = useRef<{ inicio: number; tamano: number } | null>(null);

  const limitar = (v: number) =>
    Math.max(minimo, Math.min(v, typeof maximo === "function" ? maximo() : maximo));

  useEffect(() => {
    try {
      localStorage.setItem(clave, String(tamano));
    } catch {
      /* sin localStorage */
    }
  }, [clave, tamano]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    arrastre.current = {
      inicio: horizontal ? e.clientX : e.clientY,
      tamano,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastre.current) return;
    const delta = horizontal
      ? e.clientX - arrastre.current.inicio
      : arrastre.current.inicio - e.clientY;
    setTamano(limitar(arrastre.current.tamano + delta));
  };

  const onPointerUp = () => {
    arrastre.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (horizontal) {
      if (e.key === "ArrowLeft") setTamano((v) => limitar(v - 24));
      if (e.key === "ArrowRight") setTamano((v) => limitar(v + 24));
    } else {
      if (e.key === "ArrowUp") setTamano((v) => limitar(v + 24));
      if (e.key === "ArrowDown") setTamano((v) => limitar(v - 24));
    }
  };

  return {
    altura: tamano,
    setAltura: setTamano,
    separadorProps: {
      "aria-valuenow": tamano,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onKeyDown,
    },
  };
}

/** Variante horizontal del mismo panel: recuerda el ancho y lo expone como `ancho`. */
export function usePanelAnchoRedimensionable(opciones: OpcionesPanel) {
  const { altura, setAltura, separadorProps } = usePanelRedimensionable({
    ...opciones,
    orientacion: "horizontal",
  });
  return { ancho: altura, setAncho: setAltura, separadorProps };
}
