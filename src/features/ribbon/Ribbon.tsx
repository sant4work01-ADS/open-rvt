// Cinta de comandos tipo OPUS para el presupuesto.
// Renderiza la lista declarativa de src/features/presupuesto/ribbon/comandos.ts.
//
// Rótulos (§20.7): en el ribbon normal NINGÚN botón queda solo con ícono — los grandes
// llevan ícono de 24 px arriba y texto debajo (hasta 2 líneas) y los chicos ícono de
// 16 px con texto a la derecha. Cuando el ancho no alcanza, la reducción es POR GRUPO y
// de DERECHA a IZQUIERDA (como Office): primero el grupo más a la derecha que tenga
// botones grandes (p. ej. «Historial») pasa sus grandes a chicos con texto, luego el
// siguiente («Cálculo»), y así sucesivamente; los grupos de la izquierda («Portapapeles»,
// «Editar») siguen grandes mientras quepan. Solo si todos los grupos ya están en chico
// se colapsan los de la derecha en un único botón con su nombre que los abre en un
// desplegable. Nunca hay scroll horizontal ni texto recortado.
//
// Reparto del ancho (§20.6, actualizado): cada grupo ocupa solo el ancho natural de su
// contenido y los grupos van pegados a la izquierda, uno tras otro; lo que sobra queda
// vacío a la derecha.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuContextual, type ItemMenu } from "@/components/ui/menu-contextual";
import type { ComandoRibbon, PestanaRibbon, SubitemRibbon, TamanoRibbon } from "./comandos";
import { labelComando, textoComando, textoGrupo } from "./comandos";
import { tr } from "@/i18n";

// OPEN-RVT: el ribbon solo tiene Inicio (id «principal») y Vista.
const PESTANAS = (): { id: PestanaRibbon; texto: string }[] => [
  { id: "principal", texto: tr("ribbon.pestanasNombres.inicio", "Inicio") },
  { id: "modelar", texto: tr("ribbon.pestanasNombres.modelar", "Modelar") },
  { id: "anotar", texto: tr("ribbon.pestanasNombres.anotar", "Anotar") },
  { id: "vista", texto: tr("ribbon.pestanasNombres.vista", "Vista") },
];

/**
 * Ajuste de compacidad: `reducidos` cuenta cuántos grupos —contando desde la derecha—
 * han pasado sus botones grandes a chicos, y `colapsados` cuántos grupos de la derecha
 * se han plegado en un único botón con su nombre.
 */
interface Ajuste {
  reducidos: number;
  colapsados: number;
}

/** Tamaño real de un botón: si su grupo está reducido, los grandes pasan a chicos. */
function tamanoEfectivo(reducido: boolean, t: TamanoRibbon): TamanoRibbon {
  return reducido && t === "grande" ? "chico" : t;
}

/** Identificador estable de un grupo para las pruebas (`data-testid`). */
function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface MenuAbierto {
  etiqueta: string;
  items: ItemMenu[];
  x: number;
  y: number;
}

interface Props {
  comandos: ComandoRibbon[];
  minimizado: boolean;
  onToggleMinimizado: () => void;
}

export function Ribbon({ comandos, minimizado, onToggleMinimizado }: Props) {
  // Se suscribe al idioma activo: al cambiarlo, la cinta se vuelve a dibujar al instante.
  const { t } = useTranslation();
  const [activa, setActiva] = useState<PestanaRibbon>("principal");
  const [expandido, setExpandido] = useState(false);
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  /** Ajuste de compacidad medido del ancho: grupos reducidos y grupos colapsados. */
  const [ajuste, setAjuste] = useState<Ajuste>({ reducidos: 0, colapsados: 0 });
  const { reducidos, colapsados } = ajuste;
  /** Ancho disponible del panel (ResizeObserver); decide los grupos reducidos y colapsados. */
  const [ancho, setAncho] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const visible = !minimizado || expandido;

  // Cuando la cinta está minimizada, quedan solo las pestañas. Un clic en una pestaña
  // despliega el panel encima de la tabla; un clic fuera o un comando lo ocultan.
  useEffect(() => {
    if (!minimizado || !expandido) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setExpandido(false);
    };
    window.addEventListener("mousedown", fuera);
    return () => window.removeEventListener("mousedown", fuera);
  }, [minimizado, expandido]);

  const cerrarExpandido = useCallback(() => {
    if (minimizado) setExpandido(false);
  }, [minimizado]);

  const ejecutar = useCallback(
    (c: ComandoRibbon, sub?: SubitemRibbon) => {
      setMenu(null);
      (sub ?? c).accion?.();
      cerrarExpandido();
    },
    [cerrarExpandido],
  );

  const porGrupo = useMemo(() => {
    const visibles = comandos.filter((c) => c.pestana === activa);
    const mapa = new Map<string, ComandoRibbon[]>();
    for (const c of visibles) {
      if (!mapa.has(c.grupo)) mapa.set(c.grupo, []);
      mapa.get(c.grupo)!.push(c);
    }
    return mapa;
  }, [comandos, activa]);

  const grupos = useMemo(() => Array.from(porGrupo.entries()), [porGrupo]);

  /**
   * Índices de los grupos que tienen botones grandes, de izquierda a derecha. Cuando no
   * cabe, se reducen de derecha a izquierda: primero el último grupo con grandes
   * (p. ej. «Historial»), luego el anterior («Cálculo»), etc.
   */
  const gruposConGrandes = useMemo(
    () =>
      grupos
        .map(([, cmds], i) => (cmds.some((c) => c.tamano === "grande") ? i : -1))
        .filter((i) => i >= 0),
    [grupos],
  );

  /** ¿El grupo (por su índice) ya pasó sus botones grandes a chicos? */
  const grupoReducido = useCallback(
    (indice: number) => {
      const pos = gruposConGrandes.indexOf(indice);
      if (pos < 0) return false;
      return gruposConGrandes.length - pos <= reducidos;
    },
    [gruposConGrandes, reducidos],
  );

  const abrirMenu = (etiqueta: string, items: ItemMenu[], rect: DOMRect) => {
    setMenu({ etiqueta, items, x: rect.left, y: rect.bottom + 4 });
  };

  const itemsDeComando = (c: ComandoRibbon): ItemMenu[] =>
    c.subitems?.map((s): ItemMenu => ({
      id: s.id,
      titulo: textoComando(s),
      atajo: s.atajo,
      desactivado: s.desactivado,
      prueba: `cmd-${s.id}`,
      onElegir: () => ejecutar(c, s),
    })) ?? [];

  /** Elementos del desplegable de un grupo colapsado (el grupo y sus submenús). */
  const itemsDeGrupo = (cmds: ComandoRibbon[]): ItemMenu[] => {
    const items: ItemMenu[] = [];
    for (const c of cmds) {
      if (c.subitems && c.subitems.length > 0) {
        if (c.accion) {
          items.push({
            id: `grupo-${c.id}`,
            titulo: textoComando(c),
            atajo: c.atajo,
            desactivado: !c.habilitado,
            prueba: `cmd-${c.id}`,
            onElegir: () => ejecutar(c),
          });
        }
        for (const s of c.subitems) {
          items.push({
            id: `grupo-${s.id}`,
            titulo: textoComando(s),
            atajo: s.atajo,
            desactivado: s.desactivado ?? !c.habilitado,
            prueba: `cmd-${s.id}`,
            onElegir: () => ejecutar(c, s),
          });
        }
      } else {
        items.push({
          id: `grupo-${c.id}`,
          titulo: textoComando(c),
          atajo: c.atajo,
          desactivado: !c.habilitado,
          prueba: `cmd-${c.id}`,
          onElegir: () => ejecutar(c),
        });
      }
    }
    return items;
  };

  // Mide el ancho del panel: con él se decide cuándo apretar los grupos.
  useEffect(() => {
    if (!visible) return;
    const el = panel.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, activa]);

  // Al cambiar el ancho o la pestaña se vuelve al ajuste más holgado y sin grupos
  // colapsados; el efecto de ajuste aplica de nuevo los pasos si hace falta.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve al ajuste holgado al cambiar el ancho
    setAjuste({ reducidos: 0, colapsados: 0 });
  }, [ancho, activa]);

  // Ajuste por pasos: si el contenido no cabe, primero se reduce UN grupo de derecha a
  // izquierda (el más a la derecha que aún tenga botones grandes) y, solo cuando todos
  // los grupos ya están en chico, se colapsa un grupo más de la derecha. El ancho de
  // cada paso es monótono, así que el bucle termina.
  useLayoutEffect(() => {
    if (!visible) return;
    const el = panel.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    setAjuste((a) =>
      a.reducidos < gruposConGrandes.length
        ? { reducidos: a.reducidos + 1, colapsados: a.colapsados }
        : a.colapsados < grupos.length
          ? { reducidos: a.reducidos, colapsados: a.colapsados + 1 }
          : a,
    );
  }, [ancho, reducidos, colapsados, grupos, gruposConGrandes, visible, comandos]);

  // Punto 4: además de Tab, las flechas recorren los comandos de la pestaña activa.
  const navegarConFlechas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    const botones = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    if (botones.length === 0) return;
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const actual = botones.indexOf(document.activeElement as HTMLButtonElement);
    const siguiente = botones[(actual + paso + botones.length) % botones.length];
    e.preventDefault();
    siguiente.focus();
  };

  /** Reparte los comandos de un grupo en columnas de tres renglones: cada botón grande ocupa
   *  su propia columna entera (los tres renglones) y los chicos se apilan de a tres. Los
   *  comandos con columna fija (p. ej. los de nivel) van a la columna que indican. */
  const columnasDe = useCallback((cmds: ComandoRibbon[], reducido: boolean): ComandoRibbon[][] => {
    const fijas = new Map<number, ComandoRibbon[]>();
    const libres: ComandoRibbon[] = [];
    for (const c of cmds) {
      if (c.columna !== undefined) {
        const pila = fijas.get(c.columna) ?? [];
        pila.push(c);
        fijas.set(c.columna, pila);
      } else {
        libres.push(c);
      }
    }
    const cols: ComandoRibbon[][] = [];
    // Las columnas fijas van primero, en el orden en que se declararon.
    for (const indice of [...fijas.keys()].sort((a, b) => a - b)) cols.push(fijas.get(indice)!);
    // Las demás: cada grande en su columna y las chicas de tres en tres.
    let pila: ComandoRibbon[] = [];
    const cerrar = () => {
      if (pila.length > 0) cols.push(pila);
      pila = [];
    };
    for (const c of libres) {
      const t = tamanoEfectivo(reducido, c.tamano);
      if (t === "grande") {
        cerrar();
        cols.push([c]);
        continue;
      }
      pila.push(c);
      if (pila.length === 3) cerrar();
    }
    cerrar();
    return cols;
  }, []);

  const visibles = grupos.slice(0, Math.max(0, grupos.length - colapsados));
  const colapsadosG = grupos.slice(Math.max(0, grupos.length - colapsados));

  return (
    <div
      ref={contenedor}
      className={cn("shrink-0 border-b bg-background", minimizado && "relative z-30")}
      role="region"
      aria-label={t("ribbon.cinta")}
    >
      <div className="flex h-6 items-center justify-between border-b px-1">
        <div
          role="tablist"
          aria-label={t("ribbon.pestanas")}
          className="flex h-full items-center gap-1"
        >
          {PESTANAS().map(({ id }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activa === id}
              aria-controls={`ribbon-panel-${id}`}
              onClick={() => {
                setActiva(id);
                if (minimizado) setExpandido(true);
              }}
              onKeyDown={(e) => {
                const idx = PESTANAS().findIndex((p) => p.id === activa);
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setActiva(PESTANAS()[(idx + 1) % PESTANAS().length].id);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setActiva(PESTANAS()[(idx - 1 + PESTANAS().length) % PESTANAS().length].id);
                }
              }}
              className={cn(
                "h-5 rounded-sm px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activa === id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`ribbon.pestanasNombres.${id}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label={minimizado ? t("ribbon.expandir") : t("ribbon.minimizar")}
          title={minimizado ? t("ribbon.expandirAtajo") : t("ribbon.minimizarAtajo")}
          onClick={() => {
            setExpandido(false);
            onToggleMinimizado();
          }}
          className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {minimizado ? (
            <ChevronDown size={14} strokeWidth={1.5} />
          ) : (
            <ChevronUp size={14} strokeWidth={1.5} />
          )}
        </button>
      </div>

      {visible && (
        <div
          ref={panel}
          id={`ribbon-panel-${activa}`}
          role="tabpanel"
          aria-label={t("ribbon.pestana", { nombre: t(`ribbon.pestanasNombres.${activa}`) })}
          data-reducidos={reducidos}
          onKeyDown={navegarConFlechas}
          className={cn(
            "flex items-stretch overflow-hidden px-2",
            minimizado &&
              expandido &&
              "absolute left-0 right-0 top-full z-30 border-b border-x bg-background shadow-lg",
          )}
        >
          {visibles.map(([grupo, cmds], indice) => {
            const reducido = grupoReducido(indice);
            return (
              <GrupoRibbon
                key={grupo}
                nombre={grupo}
                reducido={reducido}
                columnas={columnasDe(cmds, reducido).map((col) =>
                  col.map((c) => (
                    <BotonRibbon
                      key={c.id}
                      comando={c}
                      tamano={tamanoEfectivo(reducido, c.tamano)}
                      onClick={() => {
                        if (c.subitems && !c.accion) {
                          const el = document.activeElement;
                          if (el instanceof HTMLElement)
                            abrirMenu(
                              textoComando(c),
                              itemsDeComando(c),
                              el.getBoundingClientRect(),
                            );
                        } else {
                          ejecutar(c);
                        }
                      }}
                      onAbrirMenu={(rect) => abrirMenu(textoComando(c), itemsDeComando(c), rect)}
                    />
                  )),
                )}
              />
            );
          })}
          {colapsadosG.map(([grupo, cmds]) => (
            <GrupoColapsado
              key={grupo}
              nombre={grupo}
              onAbrir={(rect) => abrirMenu(grupo, itemsDeGrupo(cmds), rect)}
            />
          ))}
        </div>
      )}

      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          etiqueta={menu.etiqueta}
          items={menu.items}
          onCerrar={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/**
 * Un grupo de la cinta: sus botones y, debajo, el nombre. Cada grupo mide solo lo que su
 * contenido (sin `grow`), pegado a la izquierda; nunca se encogen por debajo de su contenido (si no caben, el
 * ajuste de la cinta reduce botones o colapsa grupos).
 */
function GrupoRibbon({
  nombre,
  reducido,
  columnas,
}: {
  nombre: string;
  reducido: boolean;
  columnas: React.ReactNode[][];
}) {
  return (
    <div
      data-testid={`grupo-${slug(nombre)}`}
      data-grupo={nombre}
      data-reducido={reducido ? "1" : undefined}
      className="flex shrink-0 flex-col border-r px-1.5 last:border-r-0"
    >
      {/* Columnas de tres renglones: un botón grande ocupa una columna entera (los tres
          renglones) y los chicos se apilan de a tres, así el cuerpo nunca pasa de tres
          renglones de alto (como OPUS). */}
      <div className="flex h-[4.125rem] shrink-0 items-stretch justify-start gap-x-1">
        {columnas.map((nodos, i) => (
          <div key={i} className="flex shrink-0 flex-col justify-center">
            {nodos}
          </div>
        ))}
      </div>
      <span className="flex h-3.5 items-center justify-center text-center text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
        {textoGrupo(nombre)}
      </span>
    </div>
  );
}

/** Grupo colapsado: un único botón con el nombre que lo despliega entero. */
function GrupoColapsado({ nombre, onAbrir }: { nombre: string; onAbrir: (rect: DOMRect) => void }) {
  return (
    <div
      data-testid={`grupo-${slug(nombre)}`}
      data-grupo={nombre}
      data-colapsado="1"
      className="flex shrink-0 items-center rounded-sm border-r px-1 last:border-r-0"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-label={textoGrupo(nombre)}
        title={textoGrupo(nombre)}
        onClick={(e) => onAbrir(e.currentTarget.getBoundingClientRect())}
        className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown size={14} strokeWidth={1.5} />
        <span className="whitespace-nowrap">{textoGrupo(nombre)}</span>
      </button>
    </div>
  );
}

const BotonRibbon = ({
  comando,
  tamano,
  onClick,
  onAbrirMenu,
}: {
  comando: ComandoRibbon;
  tamano: TamanoRibbon;
  onClick: () => void;
  onAbrirMenu: (rect: DOMRect) => void;
}) => {
  const { t } = useTranslation();
  const Icono = comando.icono;
  const label = labelComando(comando);

  if (tamano === "grande") {
    if (comando.subitems) {
      return (
        <div
          className={cn(
            "flex h-[4.125rem] w-fit max-w-[6rem] overflow-hidden rounded-sm text-xs text-foreground focus-within:ring-2 focus-within:ring-ring",
            comando.habilitado ? "hover:bg-muted" : "opacity-40",
          )}
        >
          <button
            type="button"
            data-testid={`cmd-${comando.id}`}
            data-tamano={tamano}
            disabled={!comando.habilitado}
            aria-label={label}
            title={label}
            aria-pressed={comando.activo}
            onClick={onClick}
            className={cn(
              "flex min-w-[3rem] flex-col items-center justify-center gap-0.5 px-1 focus-visible:outline-none",
              !comando.habilitado && "cursor-not-allowed",
            )}
          >
            <Icono size={24} strokeWidth={1.5} />
            <span className="max-w-full text-center text-[0.6875rem] leading-tight">
              {textoComando(comando)}
            </span>
          </button>
          <button
            type="button"
            data-testid={`cmd-${comando.id}-menu`}
            data-tamano={tamano}
            disabled={!comando.habilitado}
            aria-label={`${t("ribbon.menu")} ${textoComando(comando)}`}
            aria-haspopup="menu"
            title={t("ribbon.masOpciones", { nombre: textoComando(comando) })}
            onClick={(e) => onAbrirMenu(e.currentTarget.getBoundingClientRect())}
            className={cn(
              "flex w-3.5 shrink-0 items-center justify-center border-l border-transparent focus-visible:outline-none",
              comando.habilitado && "hover:bg-muted/80",
              !comando.habilitado && "cursor-not-allowed",
            )}
          >
            <ChevronDown size={10} strokeWidth={1.5} />
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        data-testid={`cmd-${comando.id}`}
        data-tamano={tamano}
        disabled={!comando.habilitado}
        aria-label={label}
        title={label}
        aria-pressed={comando.activo}
        onClick={onClick}
        className={cn(
          "flex h-[4.125rem] w-fit min-w-[3rem] max-w-[6rem] flex-col items-center justify-center gap-0.5 rounded-sm px-1 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          comando.activo
            ? "bg-accent text-accent-foreground hover:bg-accent"
            : comando.habilitado
              ? "hover:bg-muted"
              : "cursor-not-allowed opacity-40",
        )}
      >
        <Icono size={24} strokeWidth={1.5} />
        <span className="max-w-full text-center text-[0.6875rem] leading-tight">
          {textoComando(comando)}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex h-[1.375rem] items-center rounded-sm text-foreground",
        comando.habilitado ? "hover:bg-muted" : "opacity-40",
      )}
    >
      <button
        type="button"
        data-testid={`cmd-${comando.id}`}
        data-tamano={tamano}
        disabled={!comando.habilitado}
        aria-label={label}
        title={label}
        aria-pressed={comando.activo}
        onClick={onClick}
        className={cn(
          "flex h-full items-center gap-0.5 px-1 text-[0.6875rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          comando.activo ? "bg-accent text-accent-foreground hover:bg-accent" : "hover:bg-muted",
          !comando.habilitado && "cursor-not-allowed",
        )}
      >
        <Icono size={16} strokeWidth={1.5} />
        <span className="whitespace-nowrap text-left leading-tight">{textoComando(comando)}</span>
      </button>
      {comando.subitems && (
        <button
          type="button"
          data-testid={`cmd-${comando.id}-menu`}
          data-tamano={tamano}
          disabled={!comando.habilitado}
          aria-label={`${t("ribbon.menu")} ${textoComando(comando)}`}
          aria-haspopup="menu"
          onClick={(e) => onAbrirMenu(e.currentTarget.getBoundingClientRect())}
          className={cn(
            "flex h-full items-center px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !comando.habilitado && "cursor-not-allowed",
          )}
        >
          <ChevronDown size={12} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
};
