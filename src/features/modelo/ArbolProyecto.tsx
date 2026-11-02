// O038: árbol del proyecto (modo Modelo). Jerarquía Edificio → Nivel → Categoría →
// Tipo → Elemento con ojo (visible/oculto), candado (bloqueado) y menú contextual de
// Aislar/Mostrar todo, como las capas de AutoCAD. Búsqueda por nombre, tipo o GlobalId
// y selección sincronizada con el visor. Virtualiza la lista cuando hay muchas filas.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Search,
  X,
} from "lucide-react";
import {
  elementosDeNodo,
  expandirGlobalids,
  estadoDeNodo,
  filtrarArbol,
  indexarArbol,
  rutaDeElemento,
  type EstadoNodo,
  type NodoArbol,
} from "./arbol";

interface Props {
  arbol: NodoArbol | null;
  /** Claves de nodos ocultos de la vista activa. */
  ocultos: string[];
  /** Claves de nodos bloqueados de la vista activa. */
  bloqueados: string[];
  seleccionados: string[];
  onAlternar: (clave: string, tipo: "oculto" | "bloqueado") => void;
  onAislar: (clave: string) => void;
  onMostrarTodo: () => void;
  onElegirElemento: (gid: string) => void;
  onElegirElementos: (gids: string[]) => void;
  onElegirEje: (gid: string) => void;
  onElegirNivel: (gid: string) => void;
  onAjustar: () => void;
  onPlegar?: () => void;
}

/** Altura fija de cada fila para la virtualización. */
const ALTO_FILA = 22;
/** A partir de este número de filas se virtualiza la lista. */
const UMBRAL_VIRTUALIZACION = 500;

interface Fila {
  nodo: NodoArbol;
  profundidad: number;
  expandido: boolean;
  conHijos: boolean;
}

function aplanar(arbol: NodoArbol | null, expandidos: ReadonlySet<string>, forzar: boolean): Fila[] {
  if (!arbol) return [];
  const filas: Fila[] = [];
  const visitar = (nodo: NodoArbol, profundidad: number): void => {
    const conHijos = (nodo.hijos?.length ?? 0) > 0;
    const expandido = forzar || expandidos.has(nodo.clave);
    filas.push({ nodo, profundidad, expandido, conHijos });
    if (expandido) {
      for (const hijo of nodo.hijos ?? []) visitar(hijo, profundidad + 1);
    }
  };
  visitar(arbol, 0);
  return filas;
}

function IconoOjo({ estado }: { estado: EstadoNodo }) {
  const props = { size: 14, strokeWidth: 1.8, "aria-hidden": true as const };
  if (estado === "completo") return <EyeOff {...props} data-visible="false" />;
  if (estado === "parcial") {
    return <EyeOff {...props} className="opacity-45" data-visible="parcial" />;
  }
  return <Eye {...props} data-visible="true" />;
}

function IconoCandado({ estado }: { estado: EstadoNodo }) {
  const props = { size: 14, strokeWidth: 1.8, "aria-hidden": true as const };
  if (estado === "completo") return <Lock {...props} data-bloqueado="true" />;
  if (estado === "parcial") return <Lock {...props} className="opacity-45" data-bloqueado="parcial" />;
  return <LockOpen {...props} data-bloqueado="false" />;
}

export function ArbolProyecto({
  arbol,
  ocultos,
  bloqueados,
  seleccionados,
  onAlternar,
  onAislar,
  onMostrarTodo,
  onElegirElemento,
  onElegirElementos,
  onElegirEje,
  onElegirNivel,
  onAjustar,
  onPlegar,
}: Props) {
  const [consulta, setConsulta] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ clave: string; x: number; y: number } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  const setOcultos = useMemo(() => new Set(ocultos), [ocultos]);
  const setBloqueados = useMemo(() => new Set(bloqueados), [bloqueados]);
  const indice = useMemo(() => indexarArbol(arbol), [arbol]);
  const gidsBloqueados = useMemo(
    () => expandirGlobalids(indice, setBloqueados),
    [indice, setBloqueados],
  );

  const consultaActiva = consulta.trim().length > 0;
  const arbolFiltrado = useMemo(
    () => filtrarArbol(arbol, consulta),
    [arbol, consulta],
  );
  const filas = useMemo(
    () => aplanar(arbolFiltrado, expandidos, consultaActiva),
    [arbolFiltrado, expandidos, consultaActiva],
  );

  // Expansión inicial (edificio y niveles) una sola vez; se ajusta durante el render
  // para no disparar renderizaciones en cascada desde un efecto.
  const [arbolCargado, setArbolCargado] = useState(false);
  if (!arbolCargado && arbol) {
    setArbolCargado(true);
    const iniciales = new Set<string>(["edificio"]);
    const visitar = (nodo: NodoArbol) => {
      if (nodo.tipo === "nivel") iniciales.add(nodo.clave);
      for (const hijo of nodo.hijos ?? []) visitar(hijo);
    };
    visitar(arbol);
    // Si ya hay un elemento seleccionado (p. ej. al volver de la pestaña Vistas),
    // se expande también su ruta para mostrarlo resaltado.
    const seleccionada = seleccionados[0];
    if (seleccionada) {
      const ruta = rutaDeElemento(arbol, seleccionada);
      if (ruta) for (const clave of ruta) iniciales.add(clave);
    }
    setExpandidos(iniciales);
  }

  // Selección sincronizada: al seleccionar en el visor se expande la ruta hasta el
  // elemento. Se ajusta durante el render (patrón de React, no en un efecto).
  const seleccionPrincipal = seleccionados[0] ?? null;
  const [seleccionPrevia, setSeleccionPrevia] = useState(seleccionPrincipal);
  if (seleccionPrincipal !== seleccionPrevia) {
    setSeleccionPrevia(seleccionPrincipal);
    if (seleccionPrincipal && arbol) {
      const ruta = rutaDeElemento(arbol, seleccionPrincipal);
      if (ruta) {
        setExpandidos((prev) => {
          let cambio = false;
          const siguiente = new Set(prev);
          for (const clave of ruta) {
            if (!siguiente.has(clave)) {
              siguiente.add(clave);
              cambio = true;
            }
          }
          return cambio ? siguiente : prev;
        });
      }
    }
  }

  // Llevar el elemento seleccionado a la vista (solo muta el DOM, sin setState).
  const claveScrollPrevia = useRef<string | null>(null);
  useEffect(() => {
    const seleccion = seleccionados[0];
    if (!seleccion || seleccion === claveScrollPrevia.current) return;
    claveScrollPrevia.current = seleccion;
    const clave = `elemento:${seleccion}`;
    requestAnimationFrame(() => {
      const nodo = contenedor.current;
      if (!nodo) return;
      const idx = filas.findIndex((f) => f.nodo.clave === clave);
      if (idx >= 0) nodo.scrollTop = idx * ALTO_FILA - nodo.clientHeight / 3;
    });
  }, [seleccionados, filas]);

  const alternarExpansion = (clave: string) => {
    setExpandidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  };

  const estadoOjo = (clave: string): EstadoNodo => estadoDeNodo(indice, clave, setOcultos);
  const estadoCandado = (clave: string): EstadoNodo => estadoDeNodo(indice, clave, setBloqueados);

  const elegir = (nodo: NodoArbol) => {
    setMenu(null);
    if (nodo.tipo === "elemento") {
      if (nodo.globalid && !gidsBloqueados.has(nodo.globalid)) onElegirElemento(nodo.globalid);
      return;
    }
    if (nodo.tipo === "eje") {
      if (nodo.globalid) onElegirEje(nodo.globalid);
      return;
    }
    if (nodo.tipo === "nivel-ref") {
      if (nodo.globalid) onElegirNivel(nodo.globalid);
      return;
    }
    // tipo, categoría o nivel: selecciona todos sus elementos (menos los bloqueados).
    const gids = elementosDeNodo(indice, nodo.clave).filter((g) => !gidsBloqueados.has(g));
    if (gids.length > 0) onElegirElementos(gids);
  };

  // Menú contextual flotante.
  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener("pointerdown", cerrar);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", cerrar);
      window.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  // Virtualización: solo se renderizan las filas visibles cuando hay muchas.
  const [vistaScroll, setVistaScroll] = useState({ inicio: 0, fin: UMBRAL_VIRTUALIZACION });
  const virtualizado = filas.length > UMBRAL_VIRTUALIZACION;
  const alScroll = () => {
    if (!virtualizado || !contenedor.current) return;
    const top = contenedor.current.scrollTop;
    const alto = Math.max(contenedor.current.clientHeight, ALTO_FILA);
    const inicio = Math.max(0, Math.floor(top / ALTO_FILA) - 20);
    const fin = Math.min(filas.length, Math.ceil((top + alto) / ALTO_FILA) + 20);
    setVistaScroll({ inicio, fin });
  };

  const filasVisibles = virtualizado
    ? filas.slice(vistaScroll.inicio, vistaScroll.fin)
    : filas;
  const totalAltura = filas.length * ALTO_FILA;

  // Los elementos de un mismo tipo suelen llamarse igual («Muro Block 15»): se les
  // agrega el inicio de su GlobalId para distinguirlos; el nombre completo va en title.
  const nombreConConteo = (nodo: NodoArbol) =>
    nodo.tipo === "elemento"
      ? nodo.globalid
        ? `${nodo.globalid.slice(0, 6)} · ${nodo.nombre}`
        : nodo.nombre
      : nodo.tipo === "eje" || nodo.tipo === "nivel-ref"
        ? nodo.nombre
        : `${nodo.nombre} (${nodo.conteo ?? 0})`;

  return (
    <aside
      data-testid="arbol-proyecto"
      aria-label="Árbol del proyecto"
      className="flex min-h-0 w-full flex-col overflow-hidden border-r bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proyecto
        </span>
        {onPlegar && (
          <button
            type="button"
            data-testid="panel-izquierdo-plegar"
            aria-label="Plegar panel izquierdo"
            title="Plegar el panel del Proyecto (Ctrl+Alt+←)"
            onClick={onPlegar}
            className="rounded px-1 text-sm text-muted-foreground hover:bg-muted"
          >
            ‹
          </button>
        )}
      </div>
      <div className="border-b px-2 py-1.5">
        <label className="relative flex items-center">
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <input
            data-testid="arbol-buscador"
            type="search"
            value={consulta}
            placeholder="Buscar por nombre, tipo o GlobalId…"
            aria-label="Buscar en el árbol del proyecto"
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConsulta("");
            }}
            className="w-full rounded border bg-background py-1 pl-7 pr-6 text-xs"
          />
          {consulta && (
            <button
              type="button"
              data-testid="arbol-buscador-limpiar"
              aria-label="Limpiar búsqueda"
              onClick={() => setConsulta("")}
              className="absolute right-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X size={12} />
            </button>
          )}
        </label>
      </div>
      <div
        ref={contenedor}
        data-testid="arbol-lista"
        className="relative min-h-0 flex-1 overflow-y-auto"
        onScroll={alScroll}
      >
        {!arbol && (
          <div className="p-3 text-xs text-muted-foreground">No hay modelo abierto.</div>
        )}
        {arbol && filas.length === 0 && consultaActiva && (
          <div className="p-3 text-xs text-muted-foreground">Sin coincidencias.</div>
        )}
        {virtualizado && (
          <div style={{ height: totalAltura, position: "relative" }}>
            <div style={{ transform: `translateY(${vistaScroll.inicio * ALTO_FILA}px)` }}>
              {filasVisibles.map(renderFila)}
            </div>
          </div>
        )}
        {!virtualizado && <div>{filas.map(renderFila)}</div>}
      </div>

      {menu && (
        <div
          data-testid="arbol-menu"
          data-clave={menu.clave}
          role="menu"
          style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 60 }}
          className="min-w-36 rounded-md border border-border bg-card py-1 text-xs shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="arbol-menu-aislar"
            onClick={() => {
              onAislar(menu.clave);
              setMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted"
          >
            <Eye size={13} /> Aislar
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="arbol-menu-mostrar-todo"
            onClick={() => {
              onMostrarTodo();
              setMenu(null);
            }}
            className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted"
          >
            <EyeOff size={13} /> Mostrar todo
          </button>
        </div>
      )}
    </aside>
  );

  function renderFila(fila: Fila) {
    const { nodo, profundidad, expandido, conHijos } = fila;
    const esElemento = nodo.tipo === "elemento";
    const esReferencia = nodo.tipo === "referencias" || nodo.tipo === "grupo";
    const seleccionado = esElemento && nodo.globalid ? seleccionados.includes(nodo.globalid) : false;
    const bloqueado = esElemento && nodo.globalid ? gidsBloqueados.has(nodo.globalid) : false;
    return (
      <div
        key={nodo.clave}
        data-testid="arbol-nodo"
        data-clave={nodo.clave}
        data-tipo={nodo.tipo}
        data-seleccionado={seleccionado ? "true" : "false"}
        className="group flex items-center gap-0.5 rounded px-1 py-0.5 text-xs"
        style={{ paddingLeft: `${6 + profundidad * 12}px` }}
        onClick={() => elegir(nodo)}
        onDoubleClick={() => {
          if (esElemento) onAjustar();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ clave: nodo.clave, x: e.clientX, y: e.clientY });
        }}
      >
        <button
          type="button"
          data-testid="arbol-expandir"
          aria-expanded={expandido}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (conHijos) alternarExpansion(nodo.clave);
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        >
          {conHijos ? (expandido ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
        </button>
        <button
          type="button"
          data-testid="arbol-ojo"
          data-clave={nodo.clave}
          aria-label={estadoOjo(nodo.clave) === "completo" ? "Mostrar" : "Ocultar"}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onAlternar(nodo.clave, "oculto");
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <IconoOjo estado={estadoOjo(nodo.clave)} />
        </button>
        <button
          type="button"
          data-testid="arbol-candado"
          data-clave={nodo.clave}
          aria-label={estadoCandado(nodo.clave) === "completo" ? "Desbloquear" : "Bloquear"}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onAlternar(nodo.clave, "bloqueado");
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <IconoCandado estado={estadoCandado(nodo.clave)} />
        </button>
        <span
          title={
            nodo.tipo === "elemento" && nodo.globalid
              ? `${nodo.nombre} · ${nodo.globalid}`
              : nombreConConteo(nodo)
          }
          className={
            seleccionado
              ? "truncate font-medium text-primary"
              : bloqueado
                ? "truncate text-muted-foreground"
                : esReferencia
                  ? "truncate font-semibold text-muted-foreground"
                  : "truncate"
          }
        >
          {nombreConConteo(nodo)}
        </span>
      </div>
    );
  }
}
