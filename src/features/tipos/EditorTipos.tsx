// OPEN-RVT O007a: editor de tipos y biblioteca de materiales. Pantalla completa dentro
// del área de trabajo, con árbol de tipos, tabla de capas y vista previa en corte.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  MinusCircle,
  Plus,
  PlusCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { llamarConBitacora } from "@/lib/bitacora";
import { textoDeError } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { useModelo } from "@/features/modelo/estado";
import type {
  CapaMuro,
  FuncionCapa,
  LineaUbicacion,
  MaterialBiblioteca,
  TipoElemento,
} from "@/features/modelo/tipos";
import {
  capaPorDefecto,
  cmAMetros,
  colorCapa,
  espesorCm,
  FUNCIONES,
  LINEAS_UBICACION,
  nombreDuplicado,
  posicionesCapas,
  RAYADOS,
  totalCapas,
  UNIDADES,
  validarCapas,
} from "./editor";

interface ResumenTipo {
  globalid: string;
  nombre: string;
  clase: string;
  espesor?: number;
  instancias: number;
}

interface Borrador {
  nombre: string;
  capas: CapaMuro[];
  linea: LineaUbicacion;
}

type Dialogo =
  | { modo: "crear" }
  | { modo: "duplicar"; globalid: string; nombre: string }
  | { modo: "material" }
  | null;

const CATEGORIAS = [
  { id: "muros", nombre: "Muros", proximamente: false },
  { id: "estructura", nombre: "Estructura", proximamente: true },
  { id: "instalaciones", nombre: "Instalaciones", proximamente: true },
];

async function rpc<T>(metodo: string, params: Record<string, unknown> = {}): Promise<T> {
  return llamarConBitacora<T>(metodo, params);
}

function patronCss(rayado: string): string {
  const color = "currentColor";
  switch (rayado) {
    case "diagonal":
      return `repeating-linear-gradient(45deg, transparent 0 4px, ${color} 4px 4.6px)`;
    case "ladrillo":
      return `repeating-linear-gradient(0deg, transparent 0 7px, ${color} 7px 7.6px), repeating-linear-gradient(90deg, transparent 0 11px, ${color} 11px 11.6px)`;
    case "block":
      return `repeating-linear-gradient(0deg, transparent 0 5px, ${color} 5px 5.5px), repeating-linear-gradient(90deg, transparent 0 8px, ${color} 8px 8.5px)`;
    case "concreto":
      return `radial-gradient(${color} 0.8px, transparent 1px)`;
    default:
      return "none";
  }
}

function claseCategoria(clase: string): string {
  return clase.replace(/^Ifc/, "").replace(/Type$/, "");
}

export function EditorTipos({ onCerrar }: { onCerrar?: () => void }) {
  const [pestana, setPestana] = useState<"capas" | "materiales">("capas");
  const [materiales, setMateriales] = useState<MaterialBiblioteca[]>([]);
  const [tipos, setTipos] = useState<ResumenTipo[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [nombreDialogo, setNombreDialogo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [instancias, setInstancias] = useState(0);
  const cargado = useRef(false);

  const cerrar = useCallback(() => {
    onCerrar?.();
  }, [onCerrar]);

  const cargarMateriales = useCallback(async () => {
    const lista = await rpc<MaterialBiblioteca[]>("materiales.listar");
    setMateriales(lista);
    return lista;
  }, []);

  const cargarTipos = useCallback(async () => {
    const lista = await rpc<ResumenTipo[]>("tipos.listar", { clase: "IfcWallType" });
    setTipos(lista);
    // La lista del panel de propiedades también debe ver los tipos nuevos.
    await useModelo.getState().recargarTipos();
    return lista;
  }, []);

  const cargarTipo = useCallback(async (globalid: string) => {
    const tipo = await rpc<TipoElemento>("tipos.obtener", { globalid });
    setSeleccion(globalid);
    setInstancias(tipo.instancias);
    setBorrador({
      nombre: tipo.nombre,
      capas: tipo.capas.map((capa) => ({ ...capa })),
      linea: (tipo.parametros.LineaUbicacion as LineaUbicacion) ?? "eje_nucleo",
    });
  }, []);

  useEffect(() => {
    if (cargado.current) return;
    cargado.current = true;
    void (async () => {
      try {
        const [listaMateriales, listaTipos] = await Promise.all([
          cargarMateriales(),
          cargarTipos(),
        ]);
        if (listaTipos.length > 0) await cargarTipo(listaTipos[0].globalid);
        void listaMateriales;
      } catch (e) {
        setError(textoDeError(e));
      }
    })();
  }, [cargarMateriales, cargarTipos, cargarTipo]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es");
    if (!texto) return tipos;
    return tipos.filter((t) => t.nombre.toLocaleLowerCase("es").includes(texto));
  }, [tipos, busqueda]);

  const errorCapas = borrador ? validarCapas(borrador.capas) : null;
  const total = borrador ? totalCapas(borrador.capas) : 0;

  const cambiarBorrador = (cambios: Partial<Borrador>) => {
    setBorrador((actual) => (actual ? { ...actual, ...cambios } : actual));
  };

  const cambiarCapa = (indice: number, cambios: Partial<CapaMuro>) => {
    if (!borrador) return;
    const capas = borrador.capas.map((capa, i) =>
      i === indice ? { ...capa, ...cambios } : capa,
    );
    cambiarBorrador({ capas });
  };

  const elegirMaterial = (indice: number, nombre: string) => {
    const material = materiales.find((m) => m.nombre === nombre);
    cambiarCapa(indice, {
      material: nombre,
      color: material?.color,
      rayado: material?.rayado,
      categoria: material?.categoria,
    });
  };

  const moverCapa = (indice: number, delta: number) => {
    if (!borrador) return;
    const destino = indice + delta;
    if (destino < 0 || destino >= borrador.capas.length) return;
    const capas = [...borrador.capas];
    [capas[indice], capas[destino]] = [capas[destino], capas[indice]];
    cambiarBorrador({ capas });
  };

  const insertarCapa = (indice: number) => {
    if (!borrador) return;
    const capas = [...borrador.capas];
    capas.splice(indice + 1, 0, capaPorDefecto(materiales));
    cambiarBorrador({ capas });
  };

  const quitarCapa = (indice: number) => {
    if (!borrador) return;
    cambiarBorrador({ capas: borrador.capas.filter((_c, i) => i !== indice) });
  };

  const abrirDialogo = (nuevo: Dialogo, nombre = "") => {
    setDialogo(nuevo);
    setNombreDialogo(nombre);
  };

  const aceptarDialogo = async () => {
    if (!dialogo) return;
    const nombre = nombreDialogo.trim();
    if (!nombre) {
      setError("Escriba un nombre.");
      return;
    }
    setOcupado(true);
    try {
      if (dialogo.modo === "crear") {
        const respuesta = await rpc<{ tipo: TipoElemento }>("tipos.crear", {
          clase: "IfcWallType",
          nombre,
          datos: {
            capas: [
              {
                material:
                  materiales.find((m) => m.nombre === "Block de concreto 15")?.nombre ??
                  materiales.find((m) => m.categoria === "núcleo")?.nombre ??
                  "",
                espesor: 0.15,
                funcion: "núcleo",
              },
            ],
            parametros: { LineaUbicacion: "eje_nucleo" },
          },
        });
        await cargarTipos();
        await cargarTipo(respuesta.tipo.globalid);
      } else if (dialogo.modo === "duplicar") {
        const respuesta = await rpc<{ tipo: TipoElemento }>("tipos.duplicar", {
          globalid: dialogo.globalid,
          nombre,
        });
        await cargarTipos();
        await cargarTipo(respuesta.tipo.globalid);
      } else {
        const material = await rpc<{ material: MaterialBiblioteca }>("materiales.crear", {
          nombre,
          campos: {
            categoria: "acabado",
            color: "#cccccc",
            rayado: "ninguno",
            unidad: "m²",
            espesor_tipico: 0.01,
          },
        });
        await cargarMateriales();
        void material;
      }
      setDialogo(null);
      setError(null);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const borrarTipo = async () => {
    if (!seleccion) return;
    setOcupado(true);
    try {
      await rpc("tipos.borrar", { globalid: seleccion });
      const lista = await cargarTipos();
      if (lista.length > 0) await cargarTipo(lista[0].globalid);
      else {
        setSeleccion(null);
        setBorrador(null);
      }
      setError(null);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const duplicarTipo = () => {
    if (!seleccion || !borrador) return;
    const nombre = nombreDuplicado(
      borrador.nombre,
      tipos.map((t) => t.nombre),
    );
    abrirDialogo({ modo: "duplicar", globalid: seleccion, nombre }, nombre);
  };

  const aplicar = async () => {
    if (!seleccion || !borrador || errorCapas) return;
    setOcupado(true);
    try {
      const ok = await useModelo.getState().aplicarTipoEdicion(seleccion, {
        nombre: borrador.nombre,
        capas: borrador.capas,
        linea_ubicacion: borrador.linea,
        parametros: { LineaUbicacion: borrador.linea },
      });
      if (!ok) throw new Error("No se pudo aplicar el tipo.");
      setError(null);
      cerrar();
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const seleccionarInstancias = async () => {
    if (!seleccion) return;
    try {
      const lista = await rpc<Array<{ globalid: string }>>("tipos.instancias", {
        globalid: seleccion,
      });
      if (lista.length === 0) return;
      const estado = useModelo.getState();
      await estado.seleccionar(lista[0].globalid);
      for (const instancia of lista.slice(1)) {
        await estado.seleccionar(instancia.globalid, true);
      }
      cerrar();
    } catch (e) {
      setError(textoDeError(e));
    }
  };

  const actualizarMaterial = async (indice: number, cambios: Partial<MaterialBiblioteca>) => {
    const actual = materiales[indice];
    if (!actual) return;
    const siguiente = { ...actual, ...cambios };
    setMateriales((lista) => lista.map((m, i) => (i === indice ? siguiente : m)));
    try {
      await rpc("materiales.editar", {
        nombre: actual.nombre,
        campos: {
          nombre: siguiente.nombre,
          categoria: siguiente.categoria,
          color: siguiente.color,
          rayado: siguiente.rayado,
          unidad: siguiente.unidad,
          espesor_tipico: siguiente.espesor_tipico,
        },
      });
    } catch (e) {
      setError(textoDeError(e));
    }
  };

  const borrarMaterial = async (indice: number) => {
    const actual = materiales[indice];
    if (!actual) return;
    try {
      await rpc("materiales.borrar", { nombre: actual.nombre });
      await cargarMateriales();
      setError(null);
    } catch (e) {
      setError(textoDeError(e));
    }
  };

  const bandaPreview = borrador ? posicionesCapas(borrador.capas, 360) : [];
  const todosLosTipos = CATEGORIAS.map((categoria) => ({
    ...categoria,
    tipos: categoria.id === "muros" ? filtrados : [],
  }));

  return (
    <div
      data-testid="editor-tipos"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div className="flex h-9 shrink-0 items-center gap-3 border-b px-3">
        <span className="font-semibold">Tipos y materiales</span>
        <div className="ml-4 flex gap-1" role="tablist" aria-label="Secciones del editor">
          <button
            type="button"
            role="tab"
            aria-selected={pestana === "capas"}
            data-testid="pestana-tipos"
            onClick={() => setPestana("capas")}
            className={`rounded px-3 py-1 text-sm ${
              pestana === "capas" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Tipos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestana === "materiales"}
            data-testid="pestana-materiales"
            onClick={() => setPestana("materiales")}
            className={`rounded px-3 py-1 text-sm ${
              pestana === "materiales" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Materiales
          </button>
        </div>
        {error && (
          <span data-testid="editor-error" className="truncate text-xs text-red-600">
            {error}
          </span>
        )}
        <button
          type="button"
          data-testid="editor-cerrar"
          onClick={cerrar}
          className="ml-auto rounded p-1 hover:bg-muted"
          title="Cerrar el editor"
        >
          <X size={16} />
        </button>
      </div>

      {pestana === "capas" ? (
        <div className="flex min-h-0 flex-1">
          {/* Columna 1: árbol de tipos */}
          <aside className="flex w-64 shrink-0 flex-col border-r">
            <div className="border-b p-2">
              <div className="mb-2 flex items-center gap-1">
                <div className="relative flex-1">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    data-testid="tipos-buscar"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar tipo…"
                    className="h-7 w-full rounded border bg-background pl-7 pr-2 text-xs"
                  />
                </div>
                <button
                  type="button"
                  data-testid="tipos-crear"
                  onClick={() => abrirDialogo({ modo: "crear" }, "Tipo nuevo")}
                  className="rounded p-1 hover:bg-muted"
                  title="Crear tipo"
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  data-testid="tipos-duplicar"
                  onClick={duplicarTipo}
                  disabled={!seleccion}
                  className="rounded p-1 hover:bg-muted disabled:opacity-40"
                  title="Duplicar tipo"
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  data-testid="tipos-borrar"
                  onClick={() => void borrarTipo()}
                  disabled={!seleccion || ocupado}
                  className="rounded p-1 hover:bg-muted disabled:opacity-40"
                  title="Borrar tipo"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2 text-sm">
              {todosLosTipos.map((categoria) => (
                <div key={categoria.id} className="mb-3" data-testid={`categoria-${categoria.id}`}>
                  <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{categoria.nombre}</span>
                    {categoria.proximamente && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[10px] normal-case">
                        Próximamente
                      </span>
                    )}
                  </div>
                  {categoria.tipos.map((tipo) => (
                    <button
                      key={tipo.globalid}
                      type="button"
                      data-testid={`tipo-${tipo.nombre}`}
                      onClick={() => void cargarTipo(tipo.globalid)}
                      className={`block w-full rounded px-2 py-1 text-left ${
                        seleccion === tipo.globalid
                          ? "bg-primary/15 font-medium"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="block truncate">{tipo.nombre}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {tipo.espesor !== undefined
                          ? `${(tipo.espesor * 100).toFixed(1)} cm`
                          : claseCategoria(tipo.clase)}
                        {tipo.instancias > 0 ? ` · ${tipo.instancias} inst.` : ""}
                      </span>
                    </button>
                  ))}
                  {categoria.proximamente && (
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      Los tipos de esta categoría llegarán en O007b y O008a.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* Columna 2: parámetros del tipo */}
          <section className="flex min-w-0 flex-1 flex-col overflow-auto border-r">
            {borrador ? (
              <>
                <div className="flex flex-wrap items-end gap-3 border-b p-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Nombre del tipo</span>
                    <input
                      data-testid="tipo-nombre"
                      value={borrador.nombre}
                      onChange={(e) => cambiarBorrador({ nombre: e.target.value })}
                      className="h-8 w-64 rounded border bg-background px-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Línea de ubicación</span>
                    <select
                      data-testid="linea-ubicacion"
                      value={borrador.linea}
                      onChange={(e) =>
                        cambiarBorrador({ linea: e.target.value as LineaUbicacion })
                      }
                      className="h-8 rounded border bg-background px-2 text-sm"
                    >
                      {LINEAS_UBICACION.map((linea) => (
                        <option key={linea.id} value={linea.id}>
                          {linea.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Capas (exterior → interior)</h3>
                    <span data-testid="capas-total" className="text-xs text-muted-foreground">
                      Total: {(total * 100).toFixed(1)} cm · {total.toFixed(3)} m
                    </span>
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="w-24 py-1 pr-2 font-medium">Función</th>
                        <th className="py-1 pr-2 font-medium">Material</th>
                        <th className="w-24 py-1 pr-2 font-medium">Espesor (cm)</th>
                        <th className="w-28 py-1 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {borrador.capas.map((capa, indice) => (
                        <tr
                          key={`${indice}-${capa.material}`}
                          data-testid={`capa-${indice}`}
                          data-funcion={capa.funcion}
                          className={capa.funcion === "núcleo" ? "bg-amber-500/10" : ""}
                        >
                          <td className="py-1 pr-2">
                            <select
                              data-testid={`capa-funcion-${indice}`}
                              aria-label={`Función de la capa ${indice + 1}`}
                              value={capa.funcion}
                              onChange={(e) =>
                                cambiarCapa(indice, {
                                  funcion: e.target.value as FuncionCapa,
                                })
                              }
                              className="h-7 w-full rounded border bg-background px-1"
                            >
                              {FUNCIONES.map((funcion) => (
                                <option key={funcion.id} value={funcion.id}>
                                  {funcion.nombre}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 pr-2">
                            <select
                              data-testid={`capa-material-${indice}`}
                              aria-label={`Material de la capa ${indice + 1}`}
                              value={capa.material}
                              onChange={(e) => elegirMaterial(indice, e.target.value)}
                              className="h-7 w-full rounded border bg-background px-1"
                            >
                              {!materiales.some((m) => m.nombre === capa.material) && (
                                <option value={capa.material}>{capa.material}</option>
                              )}
                              {materiales.map((material) => (
                                <option key={material.id} value={material.nombre}>
                                  {material.nombre}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              data-testid={`capa-espesor-${indice}`}
                              aria-label={`Espesor de la capa ${indice + 1} en centímetros`}
                              type="number"
                              step="0.05"
                              min="0.001"
                              value={espesorCm(capa.espesor)}
                              onChange={(e) =>
                                cambiarCapa(indice, { espesor: cmAMetros(e.target.value) })
                              }
                              className="h-7 w-full rounded border bg-background px-1"
                            />
                          </td>
                          <td className="py-1">
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                data-testid={`capa-subir-${indice}`}
                                onClick={() => moverCapa(indice, -1)}
                                disabled={indice === 0}
                                className="rounded p-1 hover:bg-muted disabled:opacity-30"
                                title="Subir"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                data-testid={`capa-bajar-${indice}`}
                                onClick={() => moverCapa(indice, 1)}
                                disabled={indice === borrador.capas.length - 1}
                                className="rounded p-1 hover:bg-muted disabled:opacity-30"
                                title="Bajar"
                              >
                                <ChevronDown size={13} />
                              </button>
                              <button
                                type="button"
                                data-testid={`capa-insertar-${indice}`}
                                onClick={() => insertarCapa(indice)}
                                className="rounded p-1 hover:bg-muted"
                                title="Insertar capa debajo"
                              >
                                <PlusCircle size={13} />
                              </button>
                              <button
                                type="button"
                                data-testid={`capa-quitar-${indice}`}
                                onClick={() => quitarCapa(indice)}
                                className="rounded p-1 hover:bg-muted"
                                title="Quitar capa"
                              >
                                <MinusCircle size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {errorCapas && (
                    <p data-testid="capas-error" className="mt-2 text-xs text-red-600">
                      {errorCapas}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Seleccione un tipo del árbol o cree uno nuevo.
              </div>
            )}
          </section>

          {/* Columna 3: vista previa en corte */}
          <section className="flex w-[440px] shrink-0 flex-col overflow-auto p-3">
            <h3 className="mb-2 text-sm font-semibold">Vista previa del corte</h3>
            {borrador && bandaPreview.length > 0 ? (
              <svg
                data-testid="vista-previa-capas"
                viewBox="0 0 420 250"
                className="w-full rounded border bg-white"
                role="img"
                aria-label="Corte del muro con sus capas"
              >
                <defs>
                  {bandaPreview.map((banda, indice) => (
                    <pattern
                      key={`patron-${indice}`}
                      id={`rayado-${indice}`}
                      width={banda.capa.rayado === "concreto" ? 6 : 8}
                      height={banda.capa.rayado === "concreto" ? 6 : 8}
                      patternUnits="userSpaceOnUse"
                      patternTransform={
                        banda.capa.rayado === "diagonal" ? "rotate(45)" : undefined
                      }
                    >
                      <rect width="8" height="8" fill={colorCapa(banda.capa)} />
                      {banda.capa.rayado === "ninguno" ? null : (
                        <path
                          d={
                            banda.capa.rayado === "concreto"
                              ? "M0,0 h1 M3,3 h1"
                              : "M0,0 v8 M0,4 h8"
                          }
                          stroke="#333333"
                          strokeWidth="0.45"
                          opacity="0.7"
                        />
                      )}
                    </pattern>
                  ))}
                </defs>
                <text x="24" y="22" fontSize="11" fill="#333">
                  Exterior
                </text>
                <text x="396" y="22" fontSize="11" fill="#333" textAnchor="end">
                  Interior
                </text>
                <line x1="24" y1="28" x2="24" y2="42" stroke="#333" strokeWidth="0.8" />
                <line x1="396" y1="28" x2="396" y2="42" stroke="#333" strokeWidth="0.8" />
                <line x1="24" y1="38" x2="396" y2="38" stroke="#333" strokeWidth="0.8" />
                <g transform="translate(30,50)">
                  {bandaPreview.map((banda, indice) => (
                    <g key={`banda-${indice}`}>
                      <rect
                        data-testid={`previa-capa-${indice}`}
                        data-x={banda.x.toFixed(4)}
                        data-ancho={banda.ancho.toFixed(4)}
                        x={banda.x}
                        y={0}
                        width={Math.max(banda.ancho, 0.25)}
                        height={90}
                        fill={`url(#rayado-${indice})`}
                        stroke={banda.esNucleo ? "#1f2328" : "#555555"}
                        strokeWidth={banda.esNucleo ? 1.4 : 0.5}
                      />
                    </g>
                  ))}
                  {/* Cota total y de cada capa, escalonadas para que se lean. */}
                  <g fontSize="7" fill="#333">
                    <line x1={0} y1={110} x2={360} y2={110} stroke="#333" strokeWidth="0.7" />
                    <line x1={0} y1={104} x2={0} y2={116} stroke="#333" strokeWidth="0.7" />
                    <line x1={360} y1={104} x2={360} y2={116} stroke="#333" strokeWidth="0.7" />
                    <text x={180} y={124} textAnchor="middle" fontSize="9">
                      {(total * 100).toFixed(1)} cm
                    </text>
                    {bandaPreview.map((banda, indice) => (
                      <g key={`cota-${indice}`}>
                        <line
                          x1={banda.x}
                          y1={96}
                          x2={banda.x}
                          y2={104}
                          stroke="#777"
                          strokeWidth="0.4"
                        />
                        <text
                          x={banda.x + banda.ancho / 2}
                          y={indice % 2 === 0 ? 145 : 157}
                          textAnchor="middle"
                          transform={
                            banda.ancho < 18
                              ? `rotate(-55 ${banda.x + banda.ancho / 2} ${
                                  indice % 2 === 0 ? 145 : 157
                                })`
                              : undefined
                          }
                        >
                          {(banda.capa.espesor * 100).toFixed(2)}
                        </text>
                      </g>
                    ))}
                    <text x={0} y={180} fill="#555">
                      Espesores en cm
                    </text>
                  </g>
                </g>
              </svg>
            ) : (
              <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
                Sin capas que mostrar.
              </div>
            )}
            {borrador && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">{borrador.nombre}</div>
                <div>{borrador.capas.length} capa(s)</div>
                <div>
                  Línea de ubicación:{" "}
                  {LINEAS_UBICACION.find((l) => l.id === borrador.linea)?.nombre}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="min-h-0 flex-1 overflow-auto p-3" data-testid="tabla-materiales">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Biblioteca de materiales</h3>
            <Button
              variant="outline"
              data-testid="material-crear"
              onClick={() => abrirDialogo({ modo: "material" }, "Material nuevo")}
            >
              <Plus size={14} /> Nuevo material
            </Button>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-12 py-1 font-medium">Muestra</th>
                <th className="py-1 pr-2 font-medium">Nombre</th>
                <th className="w-28 py-1 pr-2 font-medium">Categoría</th>
                <th className="w-20 py-1 pr-2 font-medium">Color</th>
                <th className="w-28 py-1 pr-2 font-medium">Rayado</th>
                <th className="w-20 py-1 pr-2 font-medium">Unidad</th>
                <th className="w-24 py-1 pr-2 font-medium">Espesor (cm)</th>
                <th className="w-10 py-1" />
              </tr>
            </thead>
            <tbody>
              {materiales.map((material, indice) => (
                <tr key={material.id} data-testid={`material-${indice}`} className="border-b">
                  <td className="py-1">
                    <span
                      data-testid={`material-muestra-${indice}`}
                      className="block h-5 w-7 rounded border"
                      style={{
                        backgroundColor: material.color,
                        backgroundImage: patronCss(material.rayado),
                        color: "#444",
                      }}
                      title={`${material.color} · ${material.rayado}`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      data-testid={`material-nombre-${indice}`}
                      value={material.nombre}
                      onChange={(e) =>
                        setMateriales((lista) =>
                          lista.map((m, i) =>
                            i === indice ? { ...m, nombre: e.target.value } : m,
                          ),
                        )
                      }
                      onBlur={(e) => void actualizarMaterial(indice, { nombre: e.target.value })}
                      className="h-7 w-full rounded border bg-background px-1"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      data-testid={`material-categoria-${indice}`}
                      value={material.categoria}
                      onChange={(e) =>
                        void actualizarMaterial(indice, { categoria: e.target.value })
                      }
                      className="h-7 w-full rounded border bg-background px-1"
                    >
                      {["núcleo", "acabado", "aislante", "membrana", "concreto", "acero", "instalación"].map(
                        (categoria) => (
                          <option key={categoria} value={categoria}>
                            {categoria}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      data-testid={`material-color-${indice}`}
                      type="color"
                      value={material.color}
                      onChange={(e) =>
                        void actualizarMaterial(indice, { color: e.target.value })
                      }
                      className="h-7 w-10 cursor-pointer rounded border bg-background"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      data-testid={`material-rayado-${indice}`}
                      value={material.rayado}
                      onChange={(e) =>
                        void actualizarMaterial(indice, { rayado: e.target.value })
                      }
                      className="h-7 w-full rounded border bg-background px-1"
                    >
                      {RAYADOS.map((rayado) => (
                        <option key={rayado} value={rayado}>
                          {rayado}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      data-testid={`material-unidad-${indice}`}
                      value={material.unidad}
                      onChange={(e) =>
                        void actualizarMaterial(indice, { unidad: e.target.value })
                      }
                      className="h-7 w-full rounded border bg-background px-1"
                    >
                      {UNIDADES.map((unidad) => (
                        <option key={unidad} value={unidad}>
                          {unidad}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      data-testid={`material-espesor-${indice}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={espesorCm(material.espesor_tipico)}
                      onChange={(e) =>
                        void actualizarMaterial(indice, {
                          espesor_tipico: cmAMetros(e.target.value),
                        })
                      }
                      className="h-7 w-full rounded border bg-background px-1"
                    />
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      data-testid={`material-borrar-${indice}`}
                      onClick={() => void borrarMaterial(indice)}
                      className="rounded p-1 hover:bg-muted"
                      title="Borrar material"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Pie: instancias y acciones */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-t px-3">
        <span data-testid="tipos-instancias" className="text-sm">
          Instancias: {instancias}
        </span>
        <Button
          variant="outline"
          data-testid="seleccionar-instancias"
          disabled={instancias === 0}
          onClick={() => void seleccionarInstancias()}
        >
          Seleccionar en el modelo
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" data-testid="tipos-cancelar" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
              data-testid="tipos-aplicar"
            onClick={() => void aplicar()}
            disabled={!borrador || !!errorCapas || ocupado}
          >
            <Check size={14} /> Aplicar
          </Button>
        </div>
      </div>

      {dialogo && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25">
          <div
            data-testid="dialogo-nombre"
            className="w-[min(380px,90vw)] rounded border bg-background p-4 shadow-lg"
          >
            <h3 className="mb-2 font-semibold">
              {dialogo.modo === "crear"
                ? "Nuevo tipo"
                : dialogo.modo === "duplicar"
                  ? "Duplicar tipo"
                  : "Nuevo material"}
            </h3>
            <input
              autoFocus
              data-testid="dialogo-nombre-input"
              value={nombreDialogo}
              onChange={(e) => setNombreDialogo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void aceptarDialogo();
                if (e.key === "Escape") setDialogo(null);
              }}
              className="mb-3 h-8 w-full rounded border bg-background px-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                data-testid="dialogo-nombre-cancelar"
                onClick={() => setDialogo(null)}
              >
                Cancelar
              </Button>
              <Button
                data-testid="dialogo-nombre-aceptar"
                onClick={() => void aceptarDialogo()}
                disabled={ocupado}
              >
                Aceptar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
