// Sidebar de módulos con tooltip propio (sin `title` nativo): una píldora junto al
// botón con el nombre y el atajo, y una barra del color activo en el módulo actual.
// Aparece a los ~90 ms al apuntar o enfocar y, ya visible, sigue al siguiente botón
// al instante. Con animación de entrada de 120 ms, desactivada con «reduce motion»
// (regla global de styles/globals.css).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { FACTOR_SIDEBAR_EXTRA, factorSidebar, useTema } from "@/lib/tema";
import { ICONO_TAMANO, ICONO_TRAZO } from "./iconos";
import { MODULOS } from "./modulos";

/** Milisegundos de espera antes de mostrar la píldora la primera vez. */
export const RETRASO_PILDORA = 90;
/** Duración de la animación de entrada. */
export const ANIMACION_PILDORA = 120;

/** Tamaño base del ícono del sidebar: el token compartido (16 px al 100 %). */
export const ICONO_BASE = ICONO_TAMANO;
/** Tamaño base del botón (h-8/w-8 = 2rem) y del ancho del sidebar (w-12 = 3rem). */
export const BOTON_REM = 2;
export const ANCHO_REM = 3;
/** Ancho histórico del sidebar expandido; se conserva para documentar el recorte (spec 044). */
export const ANCHO_EXPANDIDO_REM = 12;
/** Ancho máximo del sidebar expandido (spec 044, CA-2). */
export const ANCHO_MAX_REM = 20;
/** Paso del teclado al redimensionar (CA-1). */
export const PASO_ANCHO_REM = 0.5;
/**
 * Ancho base por carácter para estimar el texto cuando el navegador no puede medirlo
 * (jsdom). En la app real manda la medición del DOM.
 */
export const TEXTO_BASE_REM_POR_CARACTER = 0.36;
/** Aire extra sobre el contenido en el ancho por omisión (CA-3). */
export const RELLENO_DEFECTO_REM = 1.9;

/** Ancho estimado del nombre de un módulo, en rem base (sin escala). */
export function estimarTextoBaseRem(nombre: string): number {
  return nombre.length * TEXTO_BASE_REM_POR_CARACTER;
}

/**
 * Mínimo del sidebar expandido: ícono + separación + relleno + el texto más largo.
 * Se expresa en rem base (el estilo lo multiplica por `--factor-sidebar`), así que el
 * valor en rem apenas cambia con la escala; en píxeles crece con ella (CA-6).
 */
export function anchoMinimoRem(textoBaseRem: number, escala: number): number {
  const raizPx = 16 * (escala / 100);
  const contenidoPx = ICONO_BASE * factorSidebar(escala) + raizPx + textoBaseRem * raizPx;
  return contenidoPx / (raizPx * FACTOR_SIDEBAR_EXTRA);
}

/** Recorta un ancho a los límites permitidos. */
export function recortarAncho(ancho: number, minimo: number): number {
  return Math.min(ANCHO_MAX_REM, Math.max(minimo, ancho));
}

interface Tip {
  id: string;
  top: number;
}

export function SidebarModulos({
  activo,
  onElegir,
  insignias,
}: {
  activo: string;
  onElegir: (id: string) => void;
  insignias?: Record<string, number>;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const { t } = useTranslation();
  /** Nombre visible del módulo en el idioma activo. */
  const nombreDe = (m: { id: string; nombre: string }) => t(`modulos.${m.id}`, m.nombre);
  // Escala del sidebar: la fuente raíz ya escala los rem; los px del ícono van aparte.
  const escala = useTema((s) => s.escala);
  // Preferencia recordada en config.json: colapsado (solo iconos) o con textos.
  const expandido = useTema((s) => s.lateralExpandido);
  const fijarLateral = useTema((s) => s.fijarLateralExpandido);
  // Ancho elegido (rem base) recordado en config.json; `null` = por omisión.
  const anchoGuardado = useTema((s) => s.lateralAncho);
  const fijarAncho = useTema((s) => s.fijarLateralAncho);
  const factor = factorSidebar(escala);
  // Durante el arrastre manda este valor; al soltar, la preferencia del store.
  // No se copia el store a estado: se deriva en el render (sin efectos de sincronía).
  const [arrastreRem, setArrastreRem] = useState<number | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [medidoRem, setMedidoRem] = useState(() =>
    Math.max(...MODULOS().map((m) => estimarTextoBaseRem(nombreDe(m)))),
  );
  const minimo = anchoMinimoRem(medidoRem, escala);
  const porDefecto = minimo + RELLENO_DEFECTO_REM;
  const ancho = recortarAncho(arrastreRem ?? anchoGuardado ?? porDefecto, minimo);

  // Mide el texto real del módulo más largo (icono + texto sin cortarse, CA-2) como
  // suscripción externa: el cambio de tamaño llega por el callback del observador.
  // En jsdom la medida es 0 y se usa la estimación por caracteres.
  useLayoutEffect(() => {
    if (!expandido) return;
    const raizPx = 16 * (escala / 100);
    const medir = () => {
      let mayor = 0;
      nav.current?.querySelectorAll<HTMLElement>("[data-medir]").forEach((el) => {
        const w = el.getBoundingClientRect().width;
        if (w > 0) mayor = Math.max(mayor, w / raizPx);
      });
      if (mayor > 0) {
        setMedidoRem((prev) => (Math.abs(prev - mayor) < 0.01 ? prev : mayor));
      }
    };
    if (typeof ResizeObserver === "undefined") {
      // Sin ResizeObserver (jsdom) se mide en el siguiente cuadro; la estimación cubre
      // el primer render.
      const id = window.requestAnimationFrame(medir);
      return () => window.cancelAnimationFrame(id);
    }
    const observador = new ResizeObserver(medir);
    nav.current?.querySelectorAll("[data-medir]").forEach((el) => observador.observe(el));
    return () => observador.disconnect();
  }, [expandido, escala]);
  const enEspera = useRef<number | null>(null);
  /** ¿La píldora ya está en pantalla? Con ella visible, el siguiente botón es al instante. */
  const visible = useRef(false);
  const nav = useRef<HTMLElement>(null);

  useEffect(
    () => () => {
      if (enEspera.current) clearTimeout(enEspera.current);
    },
    [],
  );

  /** Guarda el ancho (redondeado a 0,1 rem) o vuelve al de omisión con `null`. */
  const guardarAncho = (rem: number | null) => {
    const valor = rem === null ? null : Number(recortarAncho(rem, minimo).toFixed(1));
    setArrastreRem(null);
    if (valor !== anchoGuardado) fijarAncho(valor);
  };

  const anchoDesdePuntero = (clientX: number) => {
    const izquierda = nav.current?.getBoundingClientRect().left ?? 0;
    const raizPx = 16 * (escala / 100);
    return (clientX - izquierda) / (raizPx * FACTOR_SIDEBAR_EXTRA);
  };

  const mostrar = (id: string, alInstante: boolean) => {
    if (enEspera.current) clearTimeout(enEspera.current);
    // Posición relativa al nav, descontando el desplazamiento de la lista.
    const boton = nav.current?.querySelector<HTMLElement>(`[data-modulo="${id}"]`);
    const top =
      boton && nav.current
        ? boton.getBoundingClientRect().top - nav.current.getBoundingClientRect().top
        : 0;
    const colocar = () => {
      enEspera.current = null;
      visible.current = true;
      setTip({ id, top });
    };
    if (visible.current || alInstante) colocar();
    else enEspera.current = window.setTimeout(colocar, RETRASO_PILDORA);
  };

  const ocultar = () => {
    if (enEspera.current) clearTimeout(enEspera.current);
    enEspera.current = null;
    visible.current = false;
    setTip(null);
  };

  const mostrado = tip ? MODULOS().find((m) => m.id === tip.id) : null;
  const indiceMostrado = mostrado ? MODULOS().findIndex((m) => m.id === mostrado.id) : -1;
  const atajoMostrado =
    indiceMostrado >= 0 && indiceMostrado < 9 ? `Alt+${indiceMostrado + 1}` : null;

  return (
    <nav
      ref={nav}
      aria-label={t("modulos.selector")}
      data-expandido={expandido ? "true" : "false"}
      className={cn(
        "relative flex min-h-0 flex-1 shrink-0 flex-col gap-1 border-r py-2",
        expandido ? "items-stretch px-1" : "items-center",
      )}
      style={{
        width: `calc(${expandido ? ancho.toFixed(2) : ANCHO_REM}rem * var(--factor-sidebar))`,
      }}
      onMouseLeave={ocultar}
    >
      {/* Si la ventana es baja, los módulos se desplazan aquí dentro y no la ventana completa. */}
      <div
        data-testid="sidebar-lista"
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pt-1",
          expandido ? "items-stretch" : "items-center",
        )}
        onScroll={ocultar}
      >
        {MODULOS().map(({ id, nombre, icono: Icono }) => (
          <button
            key={id}
            data-modulo={id}
            aria-label={t(`modulos.${id}`, nombre)}
            aria-current={id === activo ? "page" : undefined}
            onClick={() => {
              // Al elegir un módulo la píldora desaparece (§20.8).
              ocultar();
              onElegir(id);
            }}
            onMouseEnter={() => mostrar(id, false)}
            onFocus={() => mostrar(id, false)}
            onBlur={ocultar}
            className={cn(
              "relative flex items-center rounded-md text-muted-foreground transition-colors hover:bg-muted",
              expandido ? "gap-2 px-1" : "justify-center",
              id === activo &&
                "bg-accent text-accent-foreground shadow-[inset_2px_0_0_hsl(var(--primary))] hover:bg-accent",
            )}
            style={{
              height: `calc(${BOTON_REM}rem * var(--factor-sidebar))`,
              ...(expandido ? {} : { width: `calc(${BOTON_REM}rem * var(--factor-sidebar))` }),
            }}
          >
            <Icono size={Math.round(ICONO_BASE * factor)} strokeWidth={ICONO_TRAZO} />
            {expandido && (
              <span data-testid={`texto-modulo-${id}`} className="truncate">
                {t(`modulos.${id}`, nombre)}
              </span>
            )}
            {insignias?.[id] ? (
              <span
                data-testid={`insignia-${id}`}
                aria-label={t("modulos.alertas", { n: insignias[id] })}
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
              >
                {insignias[id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="sidebar-flecha"
        aria-label={expandido ? t("modulos.colapsarMenu") : t("modulos.expandirMenu")}
        aria-expanded={expandido}
        title={expandido ? t("modulos.colapsarMenu") : t("modulos.expandirMenu")}
        onClick={() => fijarLateral(!expandido)}
        className={cn(
          "mt-auto flex items-center rounded-md text-muted-foreground transition-colors hover:bg-muted",
          expandido ? "gap-2 px-1" : "justify-center",
        )}
        style={{
          height: `calc(${BOTON_REM}rem * var(--factor-sidebar))`,
          ...(expandido ? {} : { width: `calc(${BOTON_REM}rem * var(--factor-sidebar))` }),
        }}
      >
        {expandido ? (
          <ChevronLeft size={ICONO_BASE} strokeWidth={ICONO_TRAZO} />
        ) : (
          <ChevronRight size={ICONO_BASE} strokeWidth={ICONO_TRAZO} />
        )}
        {expandido && <span className="truncate text-xs">{t("modulos.colapsar")}</span>}
      </button>
      {expandido && (
        // Los textos se miden aquí sin afectar el diseño (CA-2: mínimo medido).
        <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0">
          {MODULOS().map((m) => (
            <span key={m.id} data-medir className="whitespace-nowrap">
              {nombreDe(m)}
            </span>
          ))}
        </div>
      )}
      {expandido && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("modulos.redimensionar")}
          aria-valuemin={Number(minimo.toFixed(2))}
          aria-valuemax={ANCHO_MAX_REM}
          aria-valuenow={Number(ancho.toFixed(2))}
          tabIndex={0}
          data-testid="sidebar-asa"
          onDoubleClick={() => guardarAncho(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              guardarAncho(ancho + PASO_ANCHO_REM);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              guardarAncho(ancho - PASO_ANCHO_REM);
            } else if (e.key === "Home") {
              e.preventDefault();
              guardarAncho(minimo);
            } else if (e.key === "End") {
              e.preventDefault();
              guardarAncho(ANCHO_MAX_REM);
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setArrastrando(true);
          }}
          onPointerMove={(e) => {
            if (arrastrando) setArrastreRem(recortarAncho(anchoDesdePuntero(e.clientX), minimo));
          }}
          onPointerUp={(e) => {
            if (!arrastrando) return;
            setArrastrando(false);
            e.currentTarget.releasePointerCapture?.(e.pointerId);
            guardarAncho(anchoDesdePuntero(e.clientX));
          }}
          onPointerCancel={() => setArrastrando(false)}
          className={cn(
            "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none rounded-full transition-colors hover:bg-accent/40 focus-visible:bg-accent/40",
            arrastrando && "bg-accent/60",
          )}
        />
      )}
      {tip && mostrado && (
        // §20.8: la píldora es opaca (fondo sólido del tema, borde y sombra), va por
        // encima de todo (capa flotante) y no deja ver lo que hay detrás.
        <div
          role="tooltip"
          data-testid="tooltip-modulo"
          data-modulo={tip.id}
          data-timings={`${RETRASO_PILDORA}/${ANIMACION_PILDORA}`}
          className="pointer-events-none absolute left-full z-50 ml-1 flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs shadow-lg"
          style={{
            top: tip.top,
            // El color sólido del tema (--card): opaco también en claro y en oscuro.
            backgroundColor: "hsl(var(--card))",
            opacity: 1,
            animation: `tip-entrada ${ANIMACION_PILDORA}ms ease-out`,
          }}
        >
          {tip.id === activo && (
            <span aria-hidden className="h-3.5 w-1 rounded-full bg-accent" data-barra-activa="1" />
          )}
          <span className="whitespace-nowrap">{nombreDe(mostrado)}</span>
          {atajoMostrado && (
            <kbd className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
              {atajoMostrado}
            </kbd>
          )}
        </div>
      )}
    </nav>
  );
}
