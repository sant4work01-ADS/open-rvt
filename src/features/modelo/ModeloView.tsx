// OPEN-RVT: editor de la spec O003a. Navegador de vistas a la izquierda, visor three.js
// al centro y propiedades de la vista o del elemento a la derecha. Sin modelo abierto se
// conserva el hueco del esqueleto de O002.
import { PanelLeft, PanelRight, Layers, ListTree } from "lucide-react";
import { useMemo, useState } from "react";
import { tr } from "@/i18n";
import { useModelo } from "./estado";
import { Visor3D } from "./Visor3D";
import { NavegadorVistas } from "./NavegadorVistas";
import { ArbolProyecto } from "./ArbolProyecto";
import { PanelPropiedades } from "./PanelPropiedades";
import { BarraHerramienta } from "./BarraHerramienta";
import { DialogoEstilos } from "./DialogoEstilos";
import { DialogoAnotacion } from "./DialogoAnotacion";
import { DialogoCotas } from "./DialogoCotas";
import { DialogoCastillos } from "./DialogoCastillos";
import { CantidadesView } from "./CantidadesView";
import { EditorTipos } from "@/features/tipos/EditorTipos";
import { PanelRedimensionable } from "@/app/PanelRedimensionable";
import { useTema } from "@/lib/tema";
import { expandirGlobalids, indexarArbol } from "./arbol";

export function ModeloView() {
  const ruta = useModelo((s) => s.ruta);
  const esquema = useModelo((s) => s.esquema);
  const mallas = useModelo((s) => s.mallas);
  const estilos = useModelo((s) => s.estilos);
  const aberturas = useModelo((s) => s.aberturas);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const caja = useModelo((s) => s.caja);
  const niveles = useModelo((s) => s.niveles);
  const seleccion = useModelo((s) => s.seleccion);
  const seleccionados = useModelo((s) => s.seleccionados);
  const modoCorte = useModelo((s) => s.modoCorte);
  const puntoCorte = useModelo((s) => s.puntoCorte);
  const cargando = useModelo((s) => s.cargando);
  const error = useModelo((s) => s.error);
  const fijarVista = useModelo((s) => s.fijarVista);
  const actualizarVista = useModelo((s) => s.actualizarVista);
  const duplicarVista = useModelo((s) => s.duplicarVista);
  const eliminarVista = useModelo((s) => s.eliminarVista);
  const dialogoEstilos = useModelo((s) => s.dialogoEstilos);
  const dialogoAnotacion = useModelo((s) => s.dialogoAnotacion);
  const dialogoCotas = useModelo((s) => s.dialogoCotas);
  const dialogoCastillos = useModelo((s) => s.dialogoCastillos);
  const editorTipos = useModelo((s) => s.editorTipos);
  const editorTipoInicial = useModelo((s) => s.editorTipoInicial);
  const cerrarEditorTipos = useModelo((s) => s.cerrarEditorTipos);
  const seleccionar = useModelo((s) => s.seleccionar);
  const anadirPuntoCorte = useModelo((s) => s.anadirPuntoCorte);
  // O038: árbol del proyecto.
  const arbol = useModelo((s) => s.arbol);
  const alternarNodoArbol = useModelo((s) => s.alternarNodoArbol);
  const aislarNodoArbol = useModelo((s) => s.aislarNodoArbol);
  const mostrarTodoArbol = useModelo((s) => s.mostrarTodoArbol);
  // O039: árbol del presupuesto (modo Obra).
  const arbolObra = useModelo((s) => s.arbolObra);
  const moverPartidaObra = useModelo((s) => s.moverPartidaObra);
  const crearCapituloObra = useModelo((s) => s.crearCapituloObra);
  const renombrarCapituloObra = useModelo((s) => s.renombrarCapituloObra);
  const moverCapituloObra = useModelo((s) => s.moverCapituloObra);
  const borrarCapituloObra = useModelo((s) => s.borrarCapituloObra);
  const seleccionarVarios = useModelo((s) => s.seleccionarVarios);
  const pedirAjustar = useModelo((s) => s.pedirAjustar);
  const fijarEjeSeleccionado = useModelo((s) => s.fijarEjeSeleccionado);
  const fijarNivelSeleccionado = useModelo((s) => s.fijarNivelSeleccionado);
  // O011: los paneles laterales se pliegan y su estado se recuerda entre sesiones.
  const panelIzquierdoPlegado = useTema((s) => s.panelIzquierdoPlegado);
  const panelDerechoPlegado = useTema((s) => s.panelDerechoPlegado);
  const fijarPanelIzquierdoPlegado = useTema((s) => s.fijarPanelIzquierdoPlegado);
  const fijarPanelDerechoPlegado = useTema((s) => s.fijarPanelDerechoPlegado);
  // O038: pestaña del panel izquierdo (Vistas o Proyecto).
  const [panelIzquierdo, setPanelIzquierdo] = useState<"vistas" | "proyecto">("vistas");

  const esCantidades = vistaActivaId === "cantidades";
  const vista = esCantidades
    ? null
    : (vistas.find((v) => v.id === vistaActivaId) ?? vistas[0]);

  // O038: el ojo y el candado del árbol se expanden a GlobalIds de elementos.
  const indiceArbol = useMemo(() => indexarArbol(arbol), [arbol]);
  const elementosOcultos = useMemo(
    () => [...expandirGlobalids(indiceArbol, vista?.arbolOcultos ?? [])],
    [indiceArbol, vista?.arbolOcultos],
  );
  const elementosBloqueados = useMemo(
    () => [...expandirGlobalids(indiceArbol, vista?.arbolBloqueados ?? [])],
    [indiceArbol, vista?.arbolBloqueados],
  );

  // O007a: el editor de tipos ocupa toda el área de trabajo.
  if (editorTipos) {
    return <EditorTipos onCerrar={cerrarEditorTipos} tipoInicial={editorTipoInicial} />;
  }

  // Un modelo nuevo no tiene ruta ni mallas, pero sí esquema: debe mostrar el editor.
  if (!ruta && !esquema && mallas.length === 0 && !cargando) {
    return (
      <div
        data-testid="area-trabajo"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted/30 text-sm text-muted-foreground"
      >
        <span>{tr("modelo.aqui-ira-el-editor-planta-y-3d", "Aquí irá el editor (planta y 3D)")}</span>
        {error && (
          <span data-testid="error-modelo" className="max-w-[70%] text-center text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div data-testid="modelo-editor" className="flex min-h-0 flex-1 overflow-hidden">
      {!panelIzquierdoPlegado && (
        <PanelRedimensionable id="vistas" lado="izquierdo" etiqueta="el panel izquierdo">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-stretch border-b" role="tablist">
              <button
                type="button"
                role="tab"
                data-testid="panel-pestana-vistas"
                aria-selected={panelIzquierdo === "vistas"}
                onClick={() => setPanelIzquierdo("vistas")}
                className={
                  panelIzquierdo === "vistas"
                    ? "flex flex-1 items-center justify-center gap-1 border-b-2 border-primary py-1.5 text-xs font-medium text-primary"
                    : "flex flex-1 items-center justify-center gap-1 border-b-2 border-transparent py-1.5 text-xs text-muted-foreground hover:bg-muted"
                }
              >
                <Layers size={13} /> Vistas
              </button>
              <button
                type="button"
                role="tab"
                data-testid="panel-pestana-proyecto"
                aria-selected={panelIzquierdo === "proyecto"}
                onClick={() => setPanelIzquierdo("proyecto")}
                className={
                  panelIzquierdo === "proyecto"
                    ? "flex flex-1 items-center justify-center gap-1 border-b-2 border-primary py-1.5 text-xs font-medium text-primary"
                    : "flex flex-1 items-center justify-center gap-1 border-b-2 border-transparent py-1.5 text-xs text-muted-foreground hover:bg-muted"
                }
              >
                <ListTree size={13} /> Proyecto
              </button>
            </div>
            {panelIzquierdo === "proyecto" ? (
              <ArbolProyecto
                arbol={arbol}
                ocultos={vista?.arbolOcultos ?? []}
                bloqueados={vista?.arbolBloqueados ?? []}
                seleccionados={seleccionados}
                onAlternar={(clave, tipo) => void alternarNodoArbol(clave, tipo)}
                onAislar={(clave) => void aislarNodoArbol(clave)}
                onMostrarTodo={() => void mostrarTodoArbol()}
                onElegirElemento={(gid) => void seleccionar(gid)}
                onElegirElementos={(gids) => void seleccionarVarios(gids)}
                onElegirEje={(gid) => fijarEjeSeleccionado(gid)}
                onElegirNivel={(gid) => fijarNivelSeleccionado(gid)}
                onAjustar={pedirAjustar}
                onPlegar={() => fijarPanelIzquierdoPlegado(true)}
                arbolObra={arbolObra}
                onMoverPartidaObra={(partida, capitulo) =>
                  void moverPartidaObra(partida, capitulo.identificacion)
                }
                onCrearCapituloObra={(nombre) => void crearCapituloObra(nombre)}
                onRenombrarCapituloObra={(identificacion, nombre) =>
                  void renombrarCapituloObra(identificacion, nombre)
                }
                onMoverCapituloObra={(identificacion, direccion) =>
                  void moverCapituloObra(identificacion, direccion)
                }
                onBorrarCapituloObra={(identificacion) =>
                  void borrarCapituloObra(identificacion)
                }
              />
            ) : (
              <NavegadorVistas
                vistas={vistas}
                niveles={niveles}
                activaId={vista?.id ?? null}
                onElegir={fijarVista}
                cantidadesActiva={esCantidades}
                onCantidades={() => fijarVista("cantidades")}
                onPlegar={() => fijarPanelIzquierdoPlegado(true)}
                onRenombrar={(id, nombre) => void actualizarVista(id, { nombre })}
                onDuplicar={(id) => void duplicarVista(id)}
                onEliminar={(id) => void eliminarVista(id)}
              />
            )}
          </div>
        </PanelRedimensionable>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b px-3 text-xs">
          {panelIzquierdoPlegado && (
            <button
              type="button"
              data-testid="panel-izquierdo-abrir"
              aria-label="Abrir panel izquierdo"
              title="Abrir el panel de Vistas (Ctrl+Alt+←)"
              onClick={() => fijarPanelIzquierdoPlegado(false)}
              className="rounded px-1 text-sm text-muted-foreground hover:bg-muted"
            >
              ›
            </button>
          )}
          <span className="font-medium" data-testid="vista-activa-nombre">
            {esCantidades ? "Cantidades" : (vista?.nombre ?? "Sin vista")}
          </span>
          {vista && (
            <span className="text-muted-foreground">
              · {vista.categorias ? "categorías configurables" : ""}
            </span>
          )}
          <button
            type="button"
            data-testid="panel-propiedades-toggle"
            onClick={() => fijarPanelDerechoPlegado(!panelDerechoPlegado)}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-muted"
            title={panelDerechoPlegado ? "Mostrar propiedades" : "Ocultar propiedades"}
          >
            {panelDerechoPlegado ? <PanelLeft size={14} /> : <PanelRight size={14} />}
            Propiedades
          </button>
          {panelDerechoPlegado && (
            <button
              type="button"
              data-testid="panel-derecho-abrir"
              aria-label="Abrir panel derecho"
              title="Abrir el panel de Propiedades (Ctrl+Alt+→)"
              onClick={() => fijarPanelDerechoPlegado(false)}
              className="rounded px-1 text-sm text-muted-foreground hover:bg-muted"
            >
              ‹
            </button>
          )}
        </div>
        <BarraHerramienta />
        <div className="relative flex min-h-0 flex-1">
          {esCantidades ? (
            <CantidadesView />
          ) : vista ? (
            <Visor3D
              vista={vista}
              claveModelo={ruta ?? ""}
              vistas={vistas}
              niveles={niveles}
              mallas={mallas}
              estilos={estilos}
              aberturas={aberturas}
              caja={caja}
              seleccion={seleccion}
              seleccionados={seleccionados}
              modoCorte={modoCorte}
              puntoCorte={puntoCorte}
              elementosOcultos={elementosOcultos}
              elementosBloqueados={elementosBloqueados}
              onSeleccionar={(gid, agregar) => void seleccionar(gid, agregar)}
              onSeleccionarVarios={(gids) => {
                if (gids.length === 0) void seleccionar(null);
                else void seleccionar(gids[0], false).then(() => {
                  for (const gid of gids.slice(1)) {
                    useModelo.setState((s) => ({
                      seleccionados: [...s.seleccionados, gid],
                    }));
                  }
                });
              }}
              onCambiarAnotacion={(modo) => void actualizarVista(vista.id, { anotacionEscala: modo })}
              onPuntoCorte={(punto) => void anadirPuntoCorte(punto)}
              onEscape={() => {
                const estado = useModelo.getState();
                if (estado.modoCorte) estado.cancelarCorte();
                else if (estado.herramienta) {
                  if (!estado.cancelarTrazo()) estado.cancelarHerramienta();
                } else void estado.seleccionar(null);
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Este modelo no tiene vistas.
            </div>
          )}
          {cargando && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 text-sm">
              Cargando modelo…
            </div>
          )}
        </div>
      </div>
      {!panelDerechoPlegado && (
        <PanelRedimensionable id="propiedades" lado="derecho" etiqueta="el panel Propiedades">
          <PanelPropiedades onPlegar={() => fijarPanelDerechoPlegado(true)} />
        </PanelRedimensionable>
      )}
      {dialogoEstilos && <DialogoEstilos />}
      {dialogoAnotacion && <DialogoAnotacion />}
      {dialogoCotas && <DialogoCotas />}
      {dialogoCastillos && <DialogoCastillos />}
    </div>
  );
}
