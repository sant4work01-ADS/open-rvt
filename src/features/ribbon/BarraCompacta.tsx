import { tr } from "@/i18n"; // Barra de herramientas compacta (§19.4 ESPECIFICACION): una sola fila, sin pestañas ni
// rótulos de grupo. Es solo otra forma de dibujar la MISMA definición de comandos
// (./comandos.ts): los comandos de las pestañas Archivo/Herramientas/Vista quedan al inicio
// como menús desplegables, los de Principal se dibujan como botones solo ícono (con tooltip
// de texto + atajo, igual que el ribbon) separados por divisores verticales, y si no cabe a
// lo ancho los grupos de la derecha se colapsan en un botón «»» con su menú.
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { factorSidebar, useTema } from "@/lib/tema";
import { ICONO_TAMANO, ICONO_TRAZO } from "@/app/iconos";
import { MenuContextual, type ItemMenu } from "@/components/ui/menu-contextual";
import {
  labelComando,
  textoComando,
  type ComandoRibbon,
  type PestanaRibbon,
  type SubitemRibbon,
} from "./comandos";

/** Pestañas que en la compacta viven como menús al inicio de la fila. */
const PESTANAS_MENU = (): { id: PestanaRibbon; texto: string }[] => [
  { id: "archivo", texto: tr("ribbon.pestanasNombres.archivo", "Archivo") },
  { id: "herramientas", texto: tr("ribbon.pestanasNombres.herramientas", "Herramientas") },
  { id: "vista", texto: tr("ribbon.pestanasNombres.vista", "Vista") },
];

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

/** Divisor vertical entre grupos y entre los menús de pestaña y la fila. */
function Divisor() {
  return <div aria-hidden data-divisor="1" className="mx-1.5 h-4 w-px shrink-0 bg-border" />;
}

interface Props {
  comandos: ComandoRibbon[];
}

export function BarraCompacta({ comandos }: Props) {
  // Se suscribe al idioma activo para redibujar los rótulos al instante (spec 056).
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  /** Grupos de la derecha colapsados en el botón «»» por falta de ancho. */
  const [colapsados, setColapsados] = useState(0);
  const [ancho, setAncho] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  // Mismo token y misma escala que el sidebar (spec 030): misma familia visual.
  const escala = useTema((s) => s.escala);
  const tamIcono = Math.round(ICONO_TAMANO * factorSidebar(escala));

  const ejecutar = useCallback((c: ComandoRibbon, sub?: SubitemRibbon) => {
    setMenu(null);
    (sub ?? c).accion?.();
  }, []);

  const abrirMenu = (etiqueta: string, items: ItemMenu[], rect: DOMRect) => {
    setMenu({ etiqueta, items, x: rect.left, y: rect.bottom + 4 });
  };

  /** Comandos como elementos de menú: el principal y, si los hay, sus subitems. */
  const itemsDeComandos = useCallback(
    (cmds: ComandoRibbon[]): ItemMenu[] => {
      const items: ItemMenu[] = [];
      for (const c of cmds) {
        if (c.subitems && c.subitems.length > 0) {
          if (c.accion) {
            items.push({
              id: `accion-${c.id}`,
              titulo: textoComando(c),
              atajo: c.atajo,
              desactivado: !c.habilitado,
              prueba: `cmd-${c.id}-accion`,
              onElegir: () => ejecutar(c),
            });
          }
          for (const s of c.subitems) {
            items.push({
              id: `sub-${s.id}`,
              titulo: textoComando(s),
              atajo: s.atajo,
              desactivado: s.desactivado ?? !c.habilitado,
              prueba: `cmd-${s.id}`,
              onElegir: () => ejecutar(c, s),
            });
          }
        } else {
          items.push({
            id: `cmd-${c.id}`,
            titulo: textoComando(c),
            atajo: c.atajo,
            desactivado: !c.habilitado,
            prueba: `cmd-${c.id}`,
            onElegir: () => ejecutar(c),
          });
        }
      }
      return items;
    },
    [ejecutar],
  );

  /** Grupos de Principal, en su orden, que son los que se dibujan en la fila. */
  const grupos = useMemo(() => {
    const mapa = new Map<string, ComandoRibbon[]>();
    for (const c of comandos.filter((x) => x.pestana === "principal")) {
      if (!mapa.has(c.grupo)) mapa.set(c.grupo, []);
      mapa.get(c.grupo)!.push(c);
    }
    return Array.from(mapa.entries());
  }, [comandos]);

  const comandosDePestana = useCallback(
    (p: PestanaRibbon) => comandos.filter((c) => c.pestana === p),
    [comandos],
  );

  // Mide el ancho de la fila: con él se decide cuántos grupos se colapsan por la derecha.
  useEffect(() => {
    const el = panel.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al cambiar el ancho se vuelve al modo holgado; el efecto de ajuste colapsa de nuevo si
  // hace falta. El ancho de cada paso es monótono (un grupo menos), así que el bucle termina.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- vuelve al modo holgado al cambiar el ancho
    setColapsados(0);
  }, [ancho]);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    setColapsados((c) => (c < grupos.length ? c + 1 : c));
  }, [ancho, colapsados, grupos]);

  const visibles = grupos.slice(0, Math.max(0, grupos.length - colapsados));
  const colapsadosG = grupos.slice(Math.max(0, grupos.length - colapsados));

  return (
    <div
      ref={panel}
      role="toolbar"
      aria-label={t("ribbon.barraCompacta")}
      data-compacta="1"
      className="flex h-[1.8rem] shrink-0 items-center overflow-hidden border-b bg-background px-1"
    >
      {/* Archivo, Herramientas y Vista: un botón por pestaña que abre su lista completa. */}
      {PESTANAS_MENU().map(({ id }) => (
        <button
          key={id}
          type="button"
          data-testid={`compacta-menu-${id}`}
          aria-haspopup="menu"
          aria-label={`${t("ribbon.menu")} ${t(`ribbon.pestanasNombres.${id}`)}`}
          title={`${t("ribbon.menu")} ${t(`ribbon.pestanasNombres.${id}`)}`}
          onClick={(e) =>
            abrirMenu(
              t(`ribbon.pestanasNombres.${id}`),
              itemsDeComandos(comandosDePestana(id)),
              e.currentTarget.getBoundingClientRect(),
            )
          }
          className="flex h-[1.6rem] shrink-0 items-center gap-0.5 rounded-sm px-1.5 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t(`ribbon.pestanasNombres.${id}`)}
          <ChevronDown size={12} strokeWidth={1.5} />
        </button>
      ))}

      <Divisor />

      {visibles.map(([grupo, cmds], idx) => (
        <Fragment key={grupo}>
          {idx > 0 && <Divisor />}
          <div
            data-testid={`grupo-${slug(grupo)}`}
            data-grupo={grupo}
            className="flex shrink-0 items-center gap-1"
          >
            {cmds.map((c) => {
              const Icono = c.icono;
              const label = labelComando(c);
              const tieneMenu = !!(c.subitems && c.subitems.length > 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`cmd-${c.id}`}
                  data-con-menu={tieneMenu ? "1" : undefined}
                  disabled={!c.habilitado}
                  aria-label={label}
                  title={label}
                  onClick={(e) => {
                    if (tieneMenu)
                      abrirMenu(
                        textoComando(c),
                        itemsDeComandos([c]),
                        e.currentTarget.getBoundingClientRect(),
                      );
                    else ejecutar(c);
                  }}
                  className={cn(
                    "flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    c.habilitado ? "hover:bg-muted" : "cursor-not-allowed opacity-40",
                  )}
                >
                  <Icono size={tamIcono} strokeWidth={ICONO_TRAZO} />
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}

      {colapsadosG.length > 0 && (
        <>
          <Divisor />
          <button
            type="button"
            data-testid="compacta-colapsados"
            aria-haspopup="menu"
            aria-label={tr("presupuesto.mas-grupos", "Más grupos")}
            title={tr("presupuesto.mas-grupos", "Más grupos")}
            onClick={(e) =>
              abrirMenu(
                tr("ribbon.mas-grupos", "Más grupos"),
                itemsDeComandos(colapsadosG.flatMap(([, cmds]) => cmds)),
                e.currentTarget.getBoundingClientRect(),
              )
            }
            className="flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronsRight size={tamIcono} strokeWidth={ICONO_TRAZO} />
          </button>
        </>
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
