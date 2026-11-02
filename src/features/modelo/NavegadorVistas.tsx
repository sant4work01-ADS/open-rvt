// OPEN-RVT: navegador de vistas en árbol, a la izquierda del área de trabajo.
// O022: grupos plegables recordados, buscador sin acentos, menú contextual, renombrado
// en línea y navegación por teclado.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Layers,
  Pencil,
  Scissors,
  Search,
  SquareStack,
  Trash2,
  X,
} from "lucide-react";
import type { Vista } from "./tipos";

interface Props {
  vistas: Vista[];
  activaId: string | null;
  /** O029: elevación de cada nivel para ordenar las plantas. */
  niveles?: Array<{ globalid: string; elevacion: number; nombre?: string }>;
  onElegir: (id: string) => void;
  /** O009: la vista Cantidades vive bajo 3D y no es una vista IFC guardada. */
  cantidadesActiva?: boolean;
  onCantidades?: () => void;
  /** O011: pliega el panel y deja solo la barra de iconos de módulos. */
  onPlegar?: () => void;
  /** O022: acciones del estado (se omiten en las pruebas presentacionales). */
  onRenombrar?: (id: string, nombre: string) => void;
  onDuplicar?: (id: string) => void;
  onEliminar?: (id: string) => void;
}

const GRUPOS: ReadonlyArray<{ titulo: string; tipos: Vista["tipo"][]; prueba: string }> = [
  { titulo: "Plantas", tipos: ["planta"], prueba: "plantas" },
  { titulo: "Alzados", tipos: ["alzado"], prueba: "alzados" },
  { titulo: "Cortes", tipos: ["corte"], prueba: "cortes" },
  { titulo: "3D", tipos: ["iso", "perspectiva"], prueba: "3d" },
];

/** Clave de localStorage donde se recuerda qué grupos están plegados. */
export const CLAVE_GRUPOS_PLEGADOS = "openrvt.vistas.grupos-plegados";

/** Minúsculas y sin acentos, para buscar «alzado» aunque el nombre diga «Alzadó». */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * O037: la última planta de un nivel se lleva el nivel. Lo dice antes de confirmar
 * para que «Eliminar» no deje un nivel sin planta que sigue en los alzados.
 */
export function textoEliminar(
  vista: Vista,
  vistas: Vista[],
  niveles: Array<{ globalid: string; nombre?: string }>,
): string {
  const ultimaDelNivel =
    vista.tipo === "planta" &&
    !!vista.nivel &&
    vistas.filter((v) => v.tipo === "planta" && v.nivel === vista.nivel).length === 1;
  const nivel = ultimaDelNivel ? niveles.find((n) => n.globalid === vista.nivel) : undefined;
  if (nivel) {
    return `¿Eliminar «${vista.nombre}» y su nivel «${nivel.nombre ?? "sin nombre"}»? El nivel desaparece de todas las vistas.`;
  }
  return `¿Eliminar «${vista.nombre}»?`;
}

/** Filtra por nombre sin distinguir acentos ni mayúsculas. */
export function filtrarVistas(vistas: Vista[], consulta: string): Vista[] {
  const buscado = normalizarBusqueda(consulta);
  if (!buscado) return vistas;
  return vistas.filter((vista) => normalizarBusqueda(vista.nombre).includes(buscado));
}

/** Grupos plegados guardados; cualquier error de almacenamiento deja el valor por omisión. */
export function leerGruposPlegados(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const crudo = localStorage.getItem(CLAVE_GRUPOS_PLEGADOS);
    if (!crudo) return [];
    const valor: unknown = JSON.parse(crudo);
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function guardarGruposPlegados(ids: string[]): void {
  try {
    localStorage.setItem(CLAVE_GRUPOS_PLEGADOS, JSON.stringify(ids));
  } catch {
    /* sin almacenamiento: el plegado sigue funcionando en la sesión */
  }
}

function IconoTipo({ tipo }: { tipo: Vista["tipo"] }) {
  const props = { size: 14, strokeWidth: 1.8, "aria-hidden": true as const };
  switch (tipo) {
    case "planta":
      return <Layers data-testid="vista-icono-planta" {...props} />;
    case "alzado":
      return <SquareStack data-testid="vista-icono-alzado" {...props} />;
    case "corte":
      return <Scissors data-testid="vista-icono-corte" {...props} />;
    case "iso":
      return <Box data-testid="vista-icono-iso" {...props} />;
    case "perspectiva":
      return <Box data-testid="vista-icono-perspectiva" {...props} />;
  }
}

interface Menu {
  id: string;
  x: number;
  y: number;
}

export function NavegadorVistas({
  vistas,
  activaId,
  niveles = [],
  onElegir,
  cantidadesActiva = false,
  onCantidades,
  onPlegar,
  onRenombrar,
  onDuplicar,
  onEliminar,
}: Props) {
  const [consulta, setConsulta] = useState("");
  const [plegados, setPlegados] = useState<string[]>(() => leerGruposPlegados());
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);
  const [renombrando, setRenombrando] = useState<{ id: string; valor: string } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  const filtradas = useMemo(() => filtrarVistas(vistas, consulta), [vistas, consulta]);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", cerrar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointerdown", cerrar);
      window.removeEventListener("keydown", tecla);
    };
  }, [menu]);

  const alternar = (prueba: string) => {
    const siguiente = plegados.includes(prueba)
      ? plegados.filter((p) => p !== prueba)
      : [...plegados, prueba];
    setPlegados(siguiente);
    guardarGruposPlegados(siguiente);
  };

  const abrirRenombrar = (vista: Vista) => {
    setRenombrando({ id: vista.id, valor: vista.nombre });
    setMenu(null);
  };

  const confirmarRenombrado = () => {
    if (!renombrando) return;
    const nombre = renombrando.valor.trim();
    if (nombre) onRenombrar?.(renombrando.id, nombre);
    setRenombrando(null);
  };

  const pedirEliminar = (vista: Vista) => {
    const delMismoTipo = vistas.filter((v) => v.tipo === vista.tipo);
    if (delMismoTipo.length <= 1) return;
    setConfirmarBorrado(vista.id);
  };

  /** Flechas mueven el foco entre todas las vistas visibles; Enter abre; F2 renombra. */
  const alTeclaItem = (evento: React.KeyboardEvent<HTMLButtonElement>, vista?: Vista) => {
    const lista = Array.from(
      contenedor.current?.querySelectorAll<HTMLButtonElement>("[data-vista-foco]") ?? [],
    );
    const actual = lista.indexOf(evento.currentTarget);
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      const paso = evento.key === "ArrowDown" ? 1 : -1;
      const destino = lista[(actual + paso + lista.length) % lista.length];
      destino?.focus();
    } else if (evento.key === "Enter" && vista) {
      evento.preventDefault();
      onElegir(vista.id);
    } else if (evento.key === "F2" && vista) {
      evento.preventDefault();
      abrirRenombrar(vista);
    }
  };

  const filaClase = (activa: boolean) =>
    activa
      ? "group flex w-full items-center gap-1.5 truncate rounded border-l-2 border-primary bg-accent px-1.5 py-0.5 text-left text-xs font-medium text-accent-foreground"
      : "group flex w-full items-center gap-1.5 truncate rounded border-l-2 border-transparent px-1.5 py-0.5 text-left text-xs hover:bg-muted";

  const menuVista = menu ? vistas.find((v) => v.id === menu.id) : null;
  const menuDelMismoTipo = menuVista
    ? vistas.filter((v) => v.tipo === menuVista.tipo).length
    : 0;

  return (
    <aside
      data-testid="navegador-vistas"
      aria-label="Navegador de vistas"
      className="flex min-h-0 w-full flex-col overflow-y-auto border-r bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Vistas
        </span>
        {onPlegar && (
          <button
            type="button"
            data-testid="panel-izquierdo-plegar"
            aria-label="Plegar panel izquierdo"
            title="Plegar el panel de Vistas (Ctrl+Alt+←)"
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
            data-testid="vistas-buscador"
            type="search"
            value={consulta}
            placeholder="Buscar vista…"
            aria-label="Buscar vista por nombre"
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setConsulta("");
            }}
            className="w-full rounded border bg-background py-1 pl-7 pr-6 text-xs"
          />
          {consulta && (
            <button
              type="button"
              data-testid="vistas-buscador-limpiar"
              aria-label="Limpiar búsqueda"
              onClick={() => setConsulta("")}
              className="absolute right-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X size={12} />
            </button>
          )}
        </label>
      </div>
      <div ref={contenedor} data-testid="navegador-lista" className="flex flex-col gap-1 p-2">
        {GRUPOS.map((grupo) => {
          const elevacionDe = new Map(niveles.map((n) => [n.globalid, n.elevacion]));
          const delGrupo = filtradas
            .filter((v) => grupo.tipos.includes(v.tipo))
            .slice()
            .sort((a, b) => {
              if (grupo.prueba !== "plantas") return 0;
              const ea = a.nivel ? elevacionDe.get(a.nivel) : undefined;
              const eb = b.nivel ? elevacionDe.get(b.nivel) : undefined;
              if (ea === undefined || eb === undefined) return 0;
              return ea - eb;
            });
          if (delGrupo.length === 0) return null;
          // Con una búsqueda activa se muestran las coincidencias aunque el grupo esté plegado.
          const plegado = plegados.includes(grupo.prueba) && !normalizarBusqueda(consulta);
          return (
            <section key={grupo.titulo} data-grupo={grupo.prueba}>
              <button
                type="button"
                data-testid={`grupo-${grupo.prueba}-plegar`}
                aria-expanded={!plegado}
                onClick={() => alternar(grupo.prueba)}
                title={`${plegado ? "Mostrar" : "Ocultar"} ${grupo.titulo}`}
                className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted"
              >
                {plegado ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span>{grupo.titulo}</span>
                <span
                  data-testid={`grupo-${grupo.prueba}-contador`}
                  className="ml-auto rounded bg-muted px-1 text-[10px] font-normal tabular-nums"
                >
                  {delGrupo.length}
                </span>
              </button>
              {!plegado && <ul className="flex flex-col">
                {delGrupo.map((vista) => (
                  <li key={vista.id}>
                    {renombrando?.id === vista.id ? (
                      <input
                        data-testid="vista-renombrar"
                        autoFocus
                        value={renombrando.valor}
                        aria-label={`Nuevo nombre de ${vista.nombre}`}
                        onChange={(e) => setRenombrando({ id: vista.id, valor: e.target.value })}
                        onBlur={confirmarRenombrado}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            confirmarRenombrado();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setRenombrando(null);
                          }
                        }}
                        className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        data-testid="vista-item"
                        data-tipo={vista.tipo}
                        data-vista-id={vista.id}
                        data-vista-foco
                        aria-current={activaId === vista.id ? "true" : undefined}
                        onClick={() => onElegir(vista.id)}
                        onDoubleClick={() => onRenombrar && abrirRenombrar(vista)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setConfirmarBorrado(null);
                          setMenu({ id: vista.id, x: e.clientX, y: e.clientY });
                        }}
                        onKeyDown={(e) => alTeclaItem(e, vista)}
                        className={filaClase(activaId === vista.id)}
                        title={`${vista.nombre} · doble clic para renombrar`}
                      >
                        <span className={activaId === vista.id ? "text-primary" : "text-muted-foreground"}>
                          <IconoTipo tipo={vista.tipo} />
                        </span>
                        <span className="truncate">{vista.nombre}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>}
            </section>
          );
        })}
        <section data-grupo="cantidades">
          <button
            type="button"
            data-testid="grupo-cantidades-plegar"
            aria-expanded={
              !(plegados.includes("cantidades") && !normalizarBusqueda(consulta))
            }
            onClick={() => alternar("cantidades")}
            title={`${plegados.includes("cantidades") ? "Mostrar" : "Ocultar"} Cantidades`}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted"
          >
            {plegados.includes("cantidades") && !normalizarBusqueda(consulta) ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
            <span>Cantidades</span>
            <span
              data-testid="grupo-cantidades-contador"
              className="ml-auto rounded bg-muted px-1 text-[10px] font-normal tabular-nums"
            >
              {normalizarBusqueda(consulta) && !normalizarBusqueda("Cantidades").includes(normalizarBusqueda(consulta))
                ? 0
                : 1}
            </span>
          </button>
          {!(plegados.includes("cantidades") && !normalizarBusqueda(consulta)) &&
            (!normalizarBusqueda(consulta) ||
              normalizarBusqueda("Cantidades").includes(normalizarBusqueda(consulta))) && (
              <ul className="flex flex-col">
                <li>
                  <button
                    type="button"
                    data-testid="vista-cantidades-item"
                    data-tipo="cantidades"
                    data-vista-foco
                    aria-current={cantidadesActiva ? "true" : undefined}
                    onClick={() => onCantidades?.()}
                    onKeyDown={(e) => alTeclaItem(e)}
                    className={filaClase(cantidadesActiva)}
                    title="Cantidades de medición para PresupuestosPro"
                  >
                    <span className={cantidadesActiva ? "text-primary" : "text-muted-foreground"}>
                      <Layers size={14} strokeWidth={1.8} aria-hidden />
                    </span>
                    <span className="truncate">Cantidades</span>
                  </button>
                </li>
              </ul>
            )}
        </section>
      </div>

      {menu && menuVista && (
        <div
          data-testid="vista-menu"
          role="menu"
          aria-label={`Acciones de ${menuVista.nombre}`}
          style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 60 }}
          className="min-w-40 rounded-md border border-border bg-card py-1 text-xs shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {confirmarBorrado === menuVista.id ? (
            <div className="px-2 py-1">
              <div className="mb-1 max-w-56 text-muted-foreground" data-testid="vista-eliminar-texto">
                {textoEliminar(menuVista, vistas, niveles)}
              </div>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  data-testid="vista-eliminar-cancelar"
                  onClick={() => setMenu(null)}
                  className="rounded px-2 py-0.5 hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  data-testid="vista-eliminar-confirmar"
                  onClick={() => {
                    onEliminar?.(menuVista.id);
                    setMenu(null);
                    setConfirmarBorrado(null);
                  }}
                  className="rounded bg-red-600 px-2 py-0.5 text-white hover:bg-red-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                data-testid="vista-menu-abrir"
                onClick={() => {
                  onElegir(menuVista.id);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted"
              >
                <Layers size={13} /> Abrir
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="vista-menu-renombrar"
                disabled={!onRenombrar}
                onClick={() => abrirRenombrar(menuVista)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted disabled:opacity-40"
              >
                <Pencil size={13} /> Renombrar
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="vista-menu-duplicar"
                disabled={!onDuplicar}
                onClick={() => {
                  onDuplicar?.(menuVista.id);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-muted disabled:opacity-40"
              >
                <Copy size={13} /> Duplicar
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="vista-menu-eliminar"
                disabled={menuDelMismoTipo <= 1 || !onEliminar}
                title={
                  menuDelMismoTipo <= 1
                    ? "No se puede eliminar la última vista de su tipo"
                    : "Eliminar esta vista"
                }
                onClick={() => pedirEliminar(menuVista)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left text-red-600 hover:bg-muted disabled:opacity-40"
              >
                <Trash2 size={13} /> Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
