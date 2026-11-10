import { detectorRueda, textoResumenGrabacion } from "@/lib/rueda";
import { copiarTexto } from "@/lib/portapapeles";
import { colocarAbertura } from "../herramientas";
import { ControlesZoom } from "../ControlesZoom";
import { MAXIMO_CODOS, globoVisibleEje } from "../ejesVista";
import type { useGuiasVisor } from "./useGuiasVisor";
import type { Props } from "./tipos";

export function OverlaysPaneles({
  v,
  vista,
  vistas,
  modoCorte,
  puntoCorte,
  onCambiarAnotacion,
}: {
  v: ReturnType<typeof useGuiasVisor>;
  vista: Props["vista"];
  vistas: Props["vistas"];
  modoCorte: Props["modoCorte"];
  puntoCorte: Props["puntoCorte"];
  onCambiarAnotacion: Props["onCambiarAnotacion"];
}) {
  const {
    abrirCopiarAcomodo,
    agregarCodoVista,
    alternarCandadoVista,
    alternarOrbitar,
    ayudaVisible,
    candados,
    cerrarAyuda,
    copiarAcomodoAVistas,
    cotaEditando,
    detenerGrabacion,
    diagnosticoRueda,
    dialogoCopiarEje,
    distanciaParalelo,
    editorCota,
    engancheHerramienta,
    errorCota,
    eventosGrabados,
    exportarDiagnostico,
    fijarGlobos,
    fijarMoverSiguientes,
    grabando,
    herramienta,
    iniciarGrabacion,
    longitudTecleada,
    menuEje,
    modoOrbitar,
    moverSiguientes,
    puntosHerramienta,
    quitarCodoVista,
    ratonHerramienta,
    referencias,
    restablecerEjeVista,
    restablecerTodosLosEjes,
    resumenGrabacion,
    setCotaEditando,
    setDiagnosticoRueda,
    setDialogoCopiarEje,
    setErrorCota,
    setMenuEje,
    setTextoCotaEditando,
    textoCotaEditando,
    trazoEjePrevio,
    ajustar,
    confirmarCota,
    zoomAl100,
    zoomEnCentro,
    ajusteSeleccionado,
    puedeAnotarEje,
    codosFinSel,
    codosInicioSel,
    ejeSeleccionadoDatos,
  } = v;
  return (
    <>
      {puedeAnotarEje && (
        <div
          data-testid="eje-acciones"
          className="absolute left-2 top-11 z-20 flex max-w-[min(640px,80vw)] flex-wrap items-center gap-1 rounded border bg-background/95 p-1.5 text-[11px] shadow-md"
        >
          <span className="px-1 font-semibold">
            Eje {ejeSeleccionadoDatos!.etiqueta}
          </span>
          <button
            type="button"
            data-testid="eje-candado-inicio"
            aria-pressed={candados.inicio}
            title="Candado del extremo de inicio: cerrado mueve los ejes alineados; abierto mueve solo este eje"
            onClick={() =>
              alternarCandadoVista(ejeSeleccionadoDatos!.globalid, "inicio")
            }
            className={`rounded border px-1.5 py-0.5 ${
              candados.inicio ? "bg-amber-200 text-amber-950" : "hover:bg-muted"
            }`}
          >
            {candados.inicio ? "🔓" : "🔒"} Inicio
          </button>
          <button
            type="button"
            data-testid="eje-candado-fin"
            aria-pressed={candados.fin}
            title="Candado del extremo final: cerrado mueve los ejes alineados; abierto mueve solo este eje"
            onClick={() =>
              alternarCandadoVista(ejeSeleccionadoDatos!.globalid, "fin")
            }
            className={`rounded border px-1.5 py-0.5 ${
              candados.fin ? "bg-amber-200 text-amber-950" : "hover:bg-muted"
            }`}
          >
            {candados.fin ? "🔓" : "🔒"} Fin
          </button>
          <label
            className="flex items-center gap-1"
            title="Mostrar u ocultar el globo del extremo de inicio"
          >
            <input
              type="checkbox"
              data-testid="eje-globo-inicio"
              checked={globoVisibleEje(ajusteSeleccionado, "inicio")}
              onChange={(e) =>
                fijarGlobos(ejeSeleccionadoDatos!.globalid, {
                  globoInicio: e.target.checked,
                })
              }
            />
            Globo inicio
          </label>
          <label
            className="flex items-center gap-1"
            title="Mostrar u ocultar el globo del extremo final"
          >
            <input
              type="checkbox"
              data-testid="eje-globo-fin"
              checked={globoVisibleEje(ajusteSeleccionado, "fin")}
              onChange={(e) =>
                fijarGlobos(ejeSeleccionadoDatos!.globalid, {
                  globoFin: e.target.checked,
                })
              }
            />
            Globo fin
          </label>
          <button
            type="button"
            data-testid="eje-codo-inicio-agregar"
            disabled={codosInicioSel >= MAXIMO_CODOS}
            onClick={() =>
              agregarCodoVista(ejeSeleccionadoDatos!.globalid, "inicio")
            }
            className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar codo (inicio) {codosInicioSel}/{MAXIMO_CODOS}
          </button>
          <button
            type="button"
            data-testid="eje-codo-fin-agregar"
            disabled={codosFinSel >= MAXIMO_CODOS}
            onClick={() =>
              agregarCodoVista(ejeSeleccionadoDatos!.globalid, "fin")
            }
            className="rounded border px-1.5 py-0.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Agregar codo (fin) {codosFinSel}/{MAXIMO_CODOS}
          </button>
        </div>
      )}
      {menuEje && (
        <div
          data-testid="eje-menu"
          role="menu"
          className="absolute z-30 min-w-40 rounded border bg-background p-1 text-xs shadow-lg"
          style={{ left: menuEje.x, top: menuEje.y }}
        >
          {menuEje.indice !== null ? (
            <button
              type="button"
              role="menuitem"
              data-testid="eje-quitar-codo"
              className="w-full rounded px-2 py-1 text-left hover:bg-muted"
              onClick={() => {
                quitarCodoVista(
                  menuEje.globalid,
                  menuEje.lado,
                  menuEje.indice!,
                );
                setMenuEje(null);
              }}
            >
              Quitar codo
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              data-testid="eje-menu-agregar-codo"
              disabled={
                (menuEje.lado === "inicio" ? codosInicioSel : codosFinSel) >=
                MAXIMO_CODOS
              }
              className="w-full rounded px-2 py-1 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                agregarCodoVista(menuEje.globalid, menuEje.lado);
                setMenuEje(null);
              }}
            >
              Agregar codo
            </button>
          )}
          {menuEje.indice === null && (
            <>
              <button
                type="button"
                role="menuitem"
                data-testid="eje-menu-globos-ambos"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  fijarGlobos(menuEje.globalid, {
                    globoInicio: true,
                    globoFin: true,
                  });
                  setMenuEje(null);
                }}
              >
                Mostrar globo en ambos extremos
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="eje-menu-ocultar-inicio"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  fijarGlobos(menuEje.globalid, { globoInicio: false });
                  setMenuEje(null);
                }}
              >
                Ocultar globo inicio
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="eje-menu-ocultar-fin"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  fijarGlobos(menuEje.globalid, { globoFin: false });
                  setMenuEje(null);
                }}
              >
                Ocultar globo fin
              </button>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            data-testid="eje-menu-restablecer"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => {
              restablecerEjeVista(menuEje.globalid);
              setMenuEje(null);
            }}
          >
            Restablecer acomodo de este eje
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="eje-menu-restablecer-todos"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => {
              restablecerTodosLosEjes();
              setMenuEje(null);
            }}
          >
            Restablecer todos los ejes de la vista
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="eje-menu-copiar"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => {
              abrirCopiarAcomodo(menuEje.globalid);
              setMenuEje(null);
            }}
          >
            Copiar acomodo a otras vistas…
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-2 py-1 text-left hover:bg-muted"
            onClick={() => setMenuEje(null)}
          >
            Cerrar
          </button>
        </div>
      )}
      {dialogoCopiarEje && (
        <div
          data-testid="eje-copiar-dialogo"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDialogoCopiarEje(null)}
        >
          <div
            className="w-full max-w-sm rounded border bg-background p-3 text-xs shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 font-semibold">Copiar acomodo a otras vistas</p>
            {vistas.filter((v) => v.id !== vista.id && v.tipo === vista.tipo)
              .length === 0 ? (
              <p className="mb-2 text-muted-foreground">
                No hay otras vistas del mismo tipo.
              </p>
            ) : (
              <div className="mb-2 flex flex-col gap-1">
                {vistas
                  .filter((v) => v.id !== vista.id && v.tipo === vista.tipo)
                  .map((v) => (
                    <label key={v.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        data-testid={`eje-copiar-vista-${v.id}`}
                        checked={dialogoCopiarEje.seleccion.includes(v.id)}
                        onChange={(e) =>
                          setDialogoCopiarEje((d) =>
                            d
                              ? {
                                  ...d,
                                  seleccion: e.target.checked
                                    ? [...d.seleccion, v.id]
                                    : d.seleccion.filter((id) => id !== v.id),
                                }
                              : d,
                          )
                        }
                      />
                      <span>{v.nombre}</span>
                    </label>
                  ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="eje-copiar-cancelar"
                className="rounded border px-2 py-1 hover:bg-muted"
                onClick={() => setDialogoCopiarEje(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="eje-copiar-aceptar"
                className="rounded border bg-primary px-2 py-1 text-primary-foreground hover:opacity-90"
                onClick={copiarAcomodoAVistas}
              >
                Copiar
              </button>
            </div>
          </div>
        </div>
      )}
      <ControlesZoom
        onAcercar={() => zoomEnCentro(0.8)}
        onAlejar={() => zoomEnCentro(1.25)}
        onAjustar={ajustar}
        orbitar={modoOrbitar}
        onAlternarOrbitar={alternarOrbitar}
        mostrarOrbitar={vista.tipo === "iso" || vista.tipo === "perspectiva"}
        aEscala={
          (vista.anotacionEscala ??
            (vista.tipo === "alzado" || vista.tipo === "corte"
              ? "papel"
              : "pantalla")) === "papel"
        }
        onAlternarAEscala={() =>
          onCambiarAnotacion?.(
            (vista.anotacionEscala ??
              (vista.tipo === "alzado" || vista.tipo === "corte"
                ? "papel"
                : "pantalla")) === "papel"
              ? "pantalla"
              : "papel",
          )
        }
        onZoom100={zoomAl100}
      />
      {ayudaVisible && (
        <div
          data-testid="ayuda-navegacion"
          className="absolute bottom-12 right-3 z-10 flex max-w-[min(520px,60vw)] items-center gap-2 rounded border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          <span>
            Pellizca para zoom · Ctrl + dos dedos también hace zoom · botones
            +/− abajo a la derecha · Shift + dos dedos o arrastre con botón
            derecho = orbitar; botón Orbitar para usar un dedo
          </span>
          <button
            type="button"
            data-testid="ayuda-navegacion-cerrar"
            aria-label="Cerrar la ayuda de navegación"
            title="Cerrar (no vuelve a aparecer)"
            onClick={cerrarAyuda}
            className="rounded px-1 text-sm leading-none hover:bg-muted"
          >
            ×
          </button>
        </div>
      )}
      {diagnosticoRueda && (
        <div
          data-testid="diagnostico-rueda"
          className="absolute right-2 top-12 z-30 max-h-[60vh] w-[min(720px,92vw)] overflow-auto rounded border bg-background/95 p-2 text-[10px] shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <strong>Diagnóstico de rueda/touchpad</strong>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="diagnostico-rueda-grabar"
                onClick={grabando ? detenerGrabacion : iniciarGrabacion}
                title="Graba 10 s de rueda, puntero, toques y Control"
                className="rounded border px-1.5 py-0.5 hover:bg-muted"
              >
                {grabando ? "Detener" : "Grabar 10 s"}
              </button>
              <button
                type="button"
                data-testid="diagnostico-rueda-copiar-resumen"
                onClick={() =>
                  copiarTexto(
                    resumenGrabacion
                      ? textoResumenGrabacion(resumenGrabacion)
                      : "Sin grabación: pulsa «Grabar 10 s».",
                  )
                }
                title="Copia el resumen en texto para pegarlo"
                className="rounded border px-1.5 py-0.5 hover:bg-muted"
              >
                Copiar resumen
              </button>
              <button
                type="button"
                data-testid="diagnostico-rueda-exportar"
                onClick={() => void exportarDiagnostico()}
                title="Guarda el diagnóstico completo en JSON"
                className="rounded border px-1.5 py-0.5 hover:bg-muted"
              >
                Exportar…
              </button>
              <button
                type="button"
                data-testid="diagnostico-rueda-cerrar"
                onClick={() => setDiagnosticoRueda(false)}
                className="rounded px-1 text-sm leading-none hover:bg-muted"
                aria-label="Cerrar el diagnóstico"
              >
                ×
              </button>
            </div>
          </div>
          <p className="mb-1 text-muted-foreground">
            {grabando ? "Grabando… " : ""}detectado:{" "}
            {detectorRueda.ultimoDispositivo() ?? "—"}
          </p>
          {resumenGrabacion ? (
            <div data-testid="diagnostico-rueda-resumen">
              <p className="mb-1">
                {resumenGrabacion.total} eventos ·{" "}
                {Math.round(resumenGrabacion.duracionMs)} ms · zoom{" "}
                {resumenGrabacion.zoom.eventos} · producto{" "}
                {Number(resumenGrabacion.zoom.productoFactores.toFixed(6))} ·
                escala {resumenGrabacion.zoom.escalaInicial ?? "—"} →{" "}
                {resumenGrabacion.zoom.escalaFinal ?? "—"}
              </p>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b">
                    <th className="px-1">grupo</th>
                    <th className="px-1">n</th>
                    <th className="px-1">ctrl %</th>
                    <th className="px-1">modo</th>
                    <th className="px-1">ΔY mín/máx/media</th>
                    <th className="px-1">fracc. %</th>
                    <th className="px-1">intervalo ms</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(resumenGrabacion.porTipo).map(
                    ([tipo, grupo]) => (
                      <tr
                        key={`tipo-${tipo}`}
                        className="border-b border-border/40"
                      >
                        <td className="px-1">tipo {tipo}</td>
                        <td className="px-1">{grupo.cantidad}</td>
                        <td className="px-1">{grupo.pctCtrl.toFixed(1)}</td>
                        <td className="px-1">{grupo.deltaMode ?? "—"}</td>
                        <td className="px-1">
                          {grupo.deltaYMin === null
                            ? "—"
                            : `${grupo.deltaYMin} / ${grupo.deltaYMax} / ${grupo.deltaYMedia}`}
                        </td>
                        <td className="px-1">
                          {grupo.pctFraccionarios === null
                            ? "—"
                            : grupo.pctFraccionarios.toFixed(1)}
                        </td>
                        <td className="px-1">
                          {grupo.intervaloMedioMs === null
                            ? "—"
                            : grupo.intervaloMedioMs.toFixed(1)}
                        </td>
                      </tr>
                    ),
                  )}
                  {Object.entries(resumenGrabacion.porAccion).map(
                    ([accion, grupo]) => (
                      <tr
                        key={`accion-${accion}`}
                        className="border-b border-border/40"
                      >
                        <td className="px-1">acción {accion}</td>
                        <td className="px-1">{grupo.cantidad}</td>
                        <td className="px-1">{grupo.pctCtrl.toFixed(1)}</td>
                        <td className="px-1">{grupo.deltaMode ?? "—"}</td>
                        <td className="px-1">
                          {grupo.deltaYMin === null
                            ? "—"
                            : `${grupo.deltaYMin} / ${grupo.deltaYMax} / ${grupo.deltaYMedia}`}
                        </td>
                        <td className="px-1">
                          {grupo.pctFraccionarios === null
                            ? "—"
                            : grupo.pctFraccionarios.toFixed(1)}
                        </td>
                        <td className="px-1">
                          {grupo.intervaloMedioMs === null
                            ? "—"
                            : grupo.intervaloMedioMs.toFixed(1)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              <p data-testid="diagnostico-rueda-nativos" className="mt-1">
                nativo:{" "}
                {Object.entries(resumenGrabacion.nativos.porMensaje)
                  .map(([mensaje, cantidad]) => `${mensaje} ${cantidad}`)
                  .join(" · ") || "—"}{" "}
                · ventana:{" "}
                {Object.entries(resumenGrabacion.nativos.porVentana)
                  .map(([ventana, cantidad]) => `${ventana} ${cantidad}`)
                  .join(" · ") || "—"}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Sin grabación. Pulsa «Grabar 10 s», reproduce el gesto y vuelve a
              pulsar «Detener».
            </p>
          )}
          <details data-testid="diagnostico-rueda-eventos" className="mt-1">
            <summary className="cursor-pointer">
              Últimos {Math.min(20, eventosGrabados.length)} de{" "}
              {eventosGrabados.length} eventos
            </summary>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b">
                  <th className="px-1">ms</th>
                  <th className="px-1">tipo</th>
                  <th className="px-1">ctrl</th>
                  <th className="px-1">ΔX</th>
                  <th className="px-1">ΔY</th>
                  <th className="px-1">acción</th>
                  <th className="px-1">escala</th>
                </tr>
              </thead>
              <tbody>
                {eventosGrabados.slice(-20).map((registro, indice) => (
                  <tr
                    key={`${registro.t}-${indice}`}
                    className="border-b border-border/40"
                  >
                    <td className="px-1">{Math.round(registro.t)}</td>
                    <td className="px-1">
                      {registro.tipo}
                      {registro.pointerType ? ` (${registro.pointerType})` : ""}
                      {registro.toques !== undefined
                        ? ` (${registro.toques} toques)`
                        : ""}
                    </td>
                    <td className="px-1">{registro.ctrlKey ? "sí" : "no"}</td>
                    <td className="px-1">{registro.deltaX ?? "—"}</td>
                    <td className="px-1">{registro.deltaY ?? "—"}</td>
                    <td className="px-1">{registro.accion ?? "—"}</td>
                    <td className="px-1">
                      {registro.escalaAntes === undefined
                        ? "—"
                        : `${registro.escalaAntes} → ${registro.escalaDespues}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
      {cotaEditando && (
        <div
          ref={editorCota}
          data-testid="cota-editor"
          className="absolute z-30 flex -translate-x-1/2 flex-col gap-1 rounded border bg-background p-2 text-xs shadow-lg"
          style={{ left: cotaEditando.izquierda, top: cotaEditando.arriba }}
        >
          <div className="flex items-center gap-1">
            <input
              data-testid="cota-campo"
              autoFocus
              value={textoCotaEditando}
              onChange={(e) => {
                setTextoCotaEditando(e.target.value);
                setErrorCota(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmarCota();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setCotaEditando(null);
                }
              }}
              className="w-28 rounded border bg-background px-2 py-1 text-right"
            />
            <span className="text-muted-foreground">m</span>
          </div>
          {errorCota && (
            <span
              data-testid="cota-error"
              className="max-w-[15rem] text-[10px] leading-tight text-red-600"
            >
              {errorCota}
            </span>
          )}
          {cotaEditando.tipo !== "elevacion" &&
            cotaEditando.tipo !== "rebase" && (
              <label
                className="flex items-center gap-1 whitespace-nowrap text-muted-foreground"
                title={
                  cotaEditando.tipo === "nivel"
                    ? "También desplaza los niveles superiores la misma distancia."
                    : "También desplaza los ejes siguientes la misma distancia."
                }
              >
                <input
                  type="checkbox"
                  data-testid="cota-mover-siguientes"
                  checked={moverSiguientes}
                  onChange={(e) => fijarMoverSiguientes(e.target.checked)}
                />
                {cotaEditando.tipo === "nivel"
                  ? "Mover los de arriba"
                  : "Mover los siguientes"}
              </label>
            )}
        </div>
      )}
      {modoCorte && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded bg-background/90 px-3 py-1 text-xs shadow">
          {puntoCorte
            ? "Haga el segundo clic"
            : "Haga el primer clic en la planta"}
        </div>
      )}
      {herramienta && vista.tipo === "planta" && (
        <div
          data-testid="pista-herramienta"
          className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded bg-background/90 px-3 py-1 text-xs shadow"
        >
          {engancheHerramienta && (
            <span data-testid="pista-snap">
              Snap: {engancheHerramienta.tipo}
            </span>
          )}
          {ratonHerramienta && (
            <span>
              x {ratonHerramienta[0].toFixed(2)} · y{" "}
              {ratonHerramienta[1].toFixed(2)}
            </span>
          )}
          {longitudTecleada && (
            <span
              data-testid="pista-longitud-tecleada"
              className="font-semibold text-amber-600"
            >
              {longitudTecleada} m · Enter
            </span>
          )}
          {herramienta === "eje" && (
            <span data-testid="pista-eje-libre">Ctrl/Alt: sin familia</span>
          )}
          {herramienta === "eje" && distanciaParalelo && (
            <span
              data-testid="pista-distancia-eje"
              className="font-semibold text-sky-600"
            >
              distancia {distanciaParalelo.distancia.toFixed(2)} m
            </span>
          )}
          {puntosHerramienta.length > 0 &&
            ratonHerramienta &&
            herramienta !== "losa" && (
              <span data-testid="pista-longitud">
                {herramienta === "eje" && trazoEjePrevio
                  ? Math.hypot(
                      trazoEjePrevio.fin[0] - trazoEjePrevio.inicio[0],
                      trazoEjePrevio.fin[1] - trazoEjePrevio.inicio[1],
                    ).toFixed(2)
                  : Math.hypot(
                      ratonHerramienta[0] -
                        puntosHerramienta[puntosHerramienta.length - 1][0],
                      ratonHerramienta[1] -
                        puntosHerramienta[puntosHerramienta.length - 1][1],
                    ).toFixed(2)}{" "}
                m
              </span>
            )}
          {(herramienta === "puerta" || herramienta === "ventana") &&
            ratonHerramienta &&
            (() => {
              const ancho = herramienta === "puerta" ? 0.9 : 1.2;
              const colocada = colocarAbertura(
                referencias,
                ratonHerramienta,
                ancho,
              );
              return colocada ? (
                <span data-testid="pista-cotas">
                  cota inicio {colocada.desdeInicio.toFixed(2)} m · cota fin{" "}
                  {colocada.hastaFin.toFixed(2)} m
                </span>
              ) : null;
            })()}
        </div>
      )}
    </>
  );
}
