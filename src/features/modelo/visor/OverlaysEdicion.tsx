import { useModelo } from "../estado";
import { clasificarEmpujar, textoDimensiones } from "../empujar";
import { formaDeMarcador } from "./utilidades";
import type { useGuiasVisor } from "./useGuiasVisor";
import type { Props } from "./tipos";

export function OverlaysEdicion({
  v,
  vista,
  niveles,
}: {
  v: ReturnType<typeof useGuiasVisor>;
  vista: Props["vista"];
  niveles: Props["niveles"];
}) {
  const {
    actualizarVista,
    alternarCandadoAlinear,
    arrastreNota,
    caraEmpujarHover,
    cotasNivel,
    editorDesfaseLosa,
    elegirReferenciaAlinear,
    empujarAltura,
    empujarCara,
    empujarClasificacion,
    empujarRect,
    guiaArrastre,
    guiaCodo,
    guiaEmpujar,
    herramienta,
    marcadorEmpujar,
    moverNota,
    notaEditando,
    notaSeleccionada,
    notasPx,
    opcionesNivel,
    panelAnotaciones,
    previewLosaPx,
    ratonHerramienta,
    seleccionarNota,
    setArrastreNota,
    setEditorDesfaseLosa,
    setNotaEditando,
    setPanelAnotaciones,
    setTextoNota,
    textoNota,
    ventanaSeleccion,
    ajustar,
    restablecerIso,
    abrirEditorNotaExistente,
    confirmarNota,
    cotasFantasma,
    esAlzadoOCorte,
    guiaAlinear,
    lineaFantasmaNivel,
    posicionNotaArrastrada,
    zNivelHerramienta,
  } = v;
  return (
    <>
      {notasPx.length > 0 && (
        <div
          data-testid="notas-visor"
          className="pointer-events-none absolute inset-0 z-20"
        >
          {notasPx.map(({ nota, x, y }) => {
            const arrastre =
              arrastreNota?.globalid === nota.globalid ? arrastreNota : null;
            return (
              <div
                key={nota.globalid}
                data-testid={`nota-${nota.globalid}`}
                data-seleccionada={
                  notaSeleccionada === nota.globalid ? "si" : "no"
                }
                className={`pointer-events-auto absolute flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded border bg-white/85 px-1.5 py-0.5 text-[11px] text-neutral-900 shadow ${
                  notaSeleccionada === nota.globalid
                    ? "border-amber-500 ring-1 ring-amber-400"
                    : "border-neutral-300"
                }`}
                style={{
                  left: x + (arrastre?.dx ?? 0),
                  top: y + (arrastre?.dy ?? 0),
                }}
                title="Clic para seleccionar; doble clic para editar; arrastre para mover"
                onPointerDown={(evento) => {
                  evento.stopPropagation();
                  (evento.target as HTMLElement).setPointerCapture?.(
                    evento.pointerId,
                  );
                  setArrastreNota({
                    globalid: nota.globalid,
                    x0: evento.clientX,
                    y0: evento.clientY,
                    dx: 0,
                    dy: 0,
                    posicion: nota.posicion,
                  });
                  seleccionarNota(nota.globalid);
                }}
                onPointerMove={(evento) => {
                  if (arrastre?.globalid !== nota.globalid) return;
                  evento.stopPropagation();
                  setArrastreNota({
                    ...arrastre,
                    dx: evento.clientX - arrastre.x0,
                    dy: evento.clientY - arrastre.y0,
                  });
                }}
                onPointerUp={(evento) => {
                  if (arrastre?.globalid !== nota.globalid) return;
                  evento.stopPropagation();
                  const dx = evento.clientX - arrastre.x0;
                  const dy = evento.clientY - arrastre.y0;
                  setArrastreNota(null);
                  if (Math.hypot(dx, dy) < 3) return;
                  void moverNota(
                    nota.globalid,
                    posicionNotaArrastrada(arrastre.posicion, dx, dy),
                  );
                }}
                onDoubleClick={(evento) => {
                  evento.stopPropagation();
                  abrirEditorNotaExistente(nota, x, y);
                }}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-neutral-900" />
                {nota.texto}
              </div>
            );
          })}
        </div>
      )}
      {notaEditando && (
        <div
          data-testid="nota-editor"
          className="absolute z-30 flex -translate-x-1/2 flex-col gap-1 rounded border bg-background p-2 text-xs shadow-lg"
          style={{ left: notaEditando.izquierda, top: notaEditando.arriba }}
        >
          <span className="text-[10px] text-muted-foreground">
            {notaEditando.globalid ? "Editar nota" : "Nueva nota"} · Enter
            confirma, Esc cancela
          </span>
          <input
            data-testid="nota-campo"
            autoFocus
            value={textoNota}
            onChange={(evento) => setTextoNota(evento.target.value)}
            onKeyDown={(evento) => {
              evento.stopPropagation();
              if (evento.key === "Enter") {
                evento.preventDefault();
                void confirmarNota();
              } else if (evento.key === "Escape") {
                evento.preventDefault();
                setNotaEditando(null);
              }
            }}
            className="w-56 rounded border bg-background px-2 py-1"
          />
        </div>
      )}
      {ventanaSeleccion && (
        <div
          data-testid="ventana-seleccion"
          className="pointer-events-none absolute z-10 border border-sky-500 bg-sky-500/10"
          style={{
            // Antes se dibujaba con coordenadas de página dentro del visor y salía
            // corrido el ancho del panel de vistas y el alto de la cinta.
            left:
              Math.min(ventanaSeleccion.x1, ventanaSeleccion.x2) -
              ventanaSeleccion.ox,
            top:
              Math.min(ventanaSeleccion.y1, ventanaSeleccion.y2) -
              ventanaSeleccion.oy,
            width: Math.abs(ventanaSeleccion.x2 - ventanaSeleccion.x1),
            height: Math.abs(ventanaSeleccion.y2 - ventanaSeleccion.y1),
          }}
        />
      )}
      {herramienta === "alinear" && vista.tipo !== "planta" && (
        <div
          data-testid="alinear-niveles"
          className="absolute left-2 top-12 z-30 flex max-w-[16rem] flex-wrap gap-1 rounded border bg-background/95 p-1 text-[11px] shadow"
        >
          <span className="w-full text-muted-foreground">
            Referencia: un nivel (base o tope según la mitad que toque)
          </span>
          {niveles.map((nivel) => (
            <button
              key={nivel.globalid}
              type="button"
              data-testid={`alinear-nivel-${nivel.globalid}`}
              onClick={() =>
                elegirReferenciaAlinear({
                  tipo: "nivel",
                  globalid: nivel.globalid,
                })
              }
              className="rounded border px-1 py-0.5 hover:bg-muted"
            >
              {nivel.nombre}
            </button>
          ))}
        </div>
      )}
      {guiaAlinear && (
        <svg
          data-testid="guia-alinear"
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          aria-hidden="true"
        >
          <line
            x1={guiaAlinear.x1}
            y1={guiaAlinear.y1}
            x2={guiaAlinear.x2}
            y2={guiaAlinear.y2}
            stroke="#1d6feb"
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        </svg>
      )}
      {guiaAlinear?.candado && (
        <button
          type="button"
          data-testid="candado-alinear"
          data-bloqueada={guiaAlinear.bloqueada ? "si" : "no"}
          title={
            guiaAlinear.bloqueada
              ? "Candado cerrado: quitar la restricción"
              : "Cerrar el candado y guardar la restricción"
          }
          onClick={() => void alternarCandadoAlinear()}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded border bg-background/95 p-1 text-sm shadow"
          style={{ left: guiaAlinear.candado.x, top: guiaAlinear.candado.y }}
        >
          {guiaAlinear.bloqueada ? "\u{1F512}" : "\u{1F513}"}
        </button>
      )}
      {guiaEmpujar && (
        <svg
          data-testid="empujar-guia"
          data-tipo={guiaEmpujar.tipo}
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          aria-hidden="true"
        >
          <line
            x1={guiaEmpujar.x1}
            y1={guiaEmpujar.y1}
            x2={guiaEmpujar.x2}
            y2={guiaEmpujar.y2}
            stroke={guiaEmpujar.color}
            strokeWidth={2}
            strokeDasharray="8 6"
          />
        </svg>
      )}
      {marcadorEmpujar && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: marcadorEmpujar.x, top: marcadorEmpujar.y }}
        >
          <span
            className="absolute"
            style={{ left: 0, top: 0, transform: "translate(-50%, -50%)" }}
          >
            <span
              data-testid="empujar-marcador"
              data-tipo={marcadorEmpujar.tipo}
              data-etiqueta={marcadorEmpujar.etiqueta}
              data-punto={`${marcadorEmpujar.punto.x},${marcadorEmpujar.punto.y},${marcadorEmpujar.punto.z}`}
              className="block"
              style={formaDeMarcador(marcadorEmpujar.tipo)}
            >
              {marcadorEmpujar.tipo === "interseccion" ? "×" : ""}
            </span>
          </span>
          <span
            data-testid="empujar-tooltip"
            className={`absolute -top-2 whitespace-nowrap rounded bg-background/95 px-1 py-0.5 text-[11px] shadow ${
              marcadorEmpujar.tooltipIzquierda ? "right-3" : "left-3"
            }`}
          >
            {marcadorEmpujar.etiqueta}
          </span>
        </div>
      )}
      {caraEmpujarHover && (
        <div
          className="pointer-events-none absolute z-30"
          style={{ left: caraEmpujarHover.x, top: caraEmpujarHover.y }}
        >
          <span
            data-testid="empujar-cara-tooltip"
            data-accion={caraEmpujarHover.clasificacion.accion}
            className={`absolute -top-2 whitespace-nowrap rounded bg-background/95 px-1 py-0.5 text-[11px] shadow ${
              caraEmpujarHover.tooltipIzquierda ? "right-3" : "left-3"
            }`}
          >
            {caraEmpujarHover.clasificacion.accion === "ninguna"
              ? caraEmpujarHover.clasificacion.motivo
              : caraEmpujarHover.clasificacion.etiqueta}
          </span>
        </div>
      )}
      {empujarCara && (
        <div
          data-testid="empujar-cara-distancia"
          className="pointer-events-none absolute bottom-20 left-2 z-10 whitespace-nowrap rounded bg-background/95 px-2 py-1 text-[11px] shadow"
        >
          <strong>{empujarCara.etiqueta}</strong> ·{" "}
          {empujarCara.distancia >= 0 ? "+" : ""}
          {empujarCara.distancia.toFixed(2)} m
        </div>
      )}
      {herramienta === "empujar" &&
        (vista.tipo === "iso" || vista.tipo === "perspectiva") && (
          <div
            data-testid="empujar-preview"
            data-paso={
              empujarCara ? "cara" : empujarRect ? "altura" : "contorno"
            }
            className="pointer-events-none absolute bottom-12 left-2 z-10 whitespace-nowrap rounded bg-background/95 px-2 py-1 text-[11px] shadow"
          >
            <strong>Empujar/Tirar</strong>
            {empujarCara ? (
              <>
                {" "}
                · {empujarCara.etiqueta} ·{" "}
                {empujarCara.distancia >= 0 ? "+" : ""}
                {empujarCara.distancia.toFixed(2)} m
              </>
            ) : empujarRect ? (
              <>
                {" "}
                · {textoDimensiones(empujarRect)}
                {empujarAltura !== null && (
                  <span data-testid="empujar-preview-altura">
                    {" "}
                    · h {empujarAltura.toFixed(2)} m
                  </span>
                )}
                <span data-testid="empujar-preview-clase">
                  {" "}
                  ·{" "}
                  {empujarClasificacion === "auto"
                    ? clasificarEmpujar(empujarRect, empujarAltura ?? 0).clase
                    : empujarClasificacion}
                </span>
              </>
            ) : (
              <> · primer clic en el nivel activo</>
            )}
          </div>
        )}
      {herramienta === "nivel" && ratonHerramienta && (
        <div
          data-testid="nivel-preview"
          className="pointer-events-none absolute bottom-12 left-2 z-10 whitespace-nowrap rounded bg-background/95 px-2 py-1 text-[11px] shadow"
        >
          <strong data-testid="nivel-preview-nombre">
            {opcionesNivel.nombre || "Nivel"}
          </strong>{" "}
          · {(zNivelHerramienta ?? ratonHerramienta[1]).toFixed(2)} m
          {cotasNivel?.inferior && (
            <span data-testid="nivel-preview-inferior">
              {" "}
              = {cotasNivel.inferior.nombre} +{" "}
              {(
                (zNivelHerramienta ?? ratonHerramienta[1]) -
                cotasNivel.inferior.elevacion
              ).toFixed(2)}
            </span>
          )}
          {cotasNivel?.superior && (
            <span data-testid="nivel-preview-superior">
              {" "}
              · {cotasNivel.superior.nombre} −{" "}
              {(
                cotasNivel.superior.elevacion -
                (zNivelHerramienta ?? ratonHerramienta[1])
              ).toFixed(2)}
            </span>
          )}
        </div>
      )}
      {herramienta === "nivel" && esAlzadoOCorte && lineaFantasmaNivel && (
        <svg
          data-testid="nivel-fantasma"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        >
          <line
            x1={lineaFantasmaNivel.x1}
            y1={lineaFantasmaNivel.y}
            x2={lineaFantasmaNivel.x2}
            y2={lineaFantasmaNivel.y}
            stroke="#0891b2"
            strokeWidth={1.5}
            strokeDasharray="8 4"
          />
          {(cotasFantasma ?? []).map((fila, i) => (
            <g key={i} data-testid={`nivel-cota-temporal-${i}`}>
              <line
                x1={lineaFantasmaNivel.x2 - 70}
                y1={fila.y1}
                x2={lineaFantasmaNivel.x2 - 70}
                y2={fila.y2}
                stroke="#0e7490"
                strokeWidth={1}
              />
              <text
                x={lineaFantasmaNivel.x2 - 66}
                y={(fila.y1 + fila.y2) / 2 + 4}
                fill="#0e7490"
                fontSize={11}
              >
                {fila.texto}
              </text>
            </g>
          ))}
        </svg>
      )}
      {guiaCodo && (
        <svg
          data-testid="guia-codo"
          data-direcciones={
            guiaCodo.ambos
              ? "x,y"
              : guiaCodo.vertical
                ? "vertical"
                : "horizontal"
          }
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        >
          <defs>
            <marker
              id="o044-flecha-codo"
              viewBox="0 0 6 6"
              refX="3"
              refY="3"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L6,3 L0,6 z" fill="#16a34a" />
            </marker>
          </defs>
          {(guiaCodo.ambos || !guiaCodo.vertical) && (
            <line
              x1={guiaCodo.x - 15}
              y1={guiaCodo.y}
              x2={guiaCodo.x + 15}
              y2={guiaCodo.y}
              stroke="#16a34a"
              strokeWidth={2}
              markerStart="url(#o044-flecha-codo)"
              markerEnd="url(#o044-flecha-codo)"
            />
          )}
          {(guiaCodo.ambos || guiaCodo.vertical) && (
            <line
              x1={guiaCodo.x}
              y1={guiaCodo.y - 15}
              x2={guiaCodo.x}
              y2={guiaCodo.y + 15}
              stroke="#16a34a"
              strokeWidth={2}
              markerStart="url(#o044-flecha-codo)"
              markerEnd="url(#o044-flecha-codo)"
            />
          )}
        </svg>
      )}
      {guiaArrastre && (
        <>
          <svg
            data-testid="guia-arrastre"
            data-enganchado={guiaArrastre.enganchado ? "si" : "no"}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          >
            <line
              x1={guiaArrastre.x1}
              y1={guiaArrastre.y1}
              x2={guiaArrastre.x2}
              y2={guiaArrastre.y2}
              stroke={guiaArrastre.enganchado ? "#0ea5e9" : "#94a3b8"}
              strokeWidth={guiaArrastre.enganchado ? 2 : 1}
              strokeDasharray="6 4"
            />
          </svg>
          <div
            data-testid="cota-arrastre"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-background/95 px-1.5 py-0.5 text-[11px] font-medium shadow"
            style={{
              left: (guiaArrastre.x1 + guiaArrastre.x2) / 2,
              top: (guiaArrastre.y1 + guiaArrastre.y2) / 2,
            }}
          >
            {guiaArrastre.texto}
          </div>
        </>
      )}
      {previewLosaPx && (
        <svg
          data-testid="preview-losa"
          data-puntos={previewLosaPx.length}
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
        >
          <polygon
            points={previewLosaPx
              .map((punto) => `${punto.x},${punto.y}`)
              .join(" ")}
            fill="rgba(245, 158, 11, 0.12)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
        </svg>
      )}
      {editorDesfaseLosa && (
        <div
          data-testid="asa-losa-editor"
          className="absolute z-30 flex items-center gap-1 rounded border bg-background/95 p-1 text-[11px] shadow"
          style={{
            left: editorDesfaseLosa.izquierda,
            top: editorDesfaseLosa.arriba,
          }}
        >
          <span className="text-muted-foreground">Desfase</span>
          <input
            data-testid="asa-losa-desfase"
            autoFocus
            type="text"
            inputMode="decimal"
            value={editorDesfaseLosa.valor}
            onChange={(evento) =>
              setEditorDesfaseLosa((actual) =>
                actual ? { ...actual, valor: evento.target.value } : actual,
              )
            }
            onKeyDown={(evento) => {
              evento.stopPropagation();
              if (evento.key === "Escape") {
                evento.preventDefault();
                setEditorDesfaseLosa(null);
                return;
              }
              if (evento.key !== "Enter") return;
              evento.preventDefault();
              const valor = Number(editorDesfaseLosa.valor.replace(",", "."));
              const editor = editorDesfaseLosa;
              setEditorDesfaseLosa(null);
              if (!Number.isFinite(valor)) return;
              void useModelo.getState().editarElemento(editor.globalid, {
                cambio_borde: { indice: editor.indice, desfase: valor },
              });
            }}
            onBlur={() => setEditorDesfaseLosa(null)}
            className="w-20 rounded border bg-background px-1 py-0.5 text-right"
          />
          <span className="text-muted-foreground">m</span>
        </div>
      )}
      <div className="absolute left-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          data-testid="visor-ajustar"
          title="Ajustar la vista (F, Z y luego A, doble clic medio)"
          onClick={ajustar}
          className="rounded border bg-background/90 px-2 py-1 text-xs shadow-sm hover:bg-muted"
        >
          Ajustar
        </button>
        {vista.tipo === "iso" && (
          <button
            type="button"
            data-testid="visor-restablecer-iso"
            onClick={restablecerIso}
            className="rounded border bg-background/90 px-2 py-1 text-xs shadow-sm hover:bg-muted"
          >
            Restablecer iso
          </button>
        )}
        {(vista.tipo === "iso" || vista.tipo === "perspectiva") && (
          <div className="relative">
            <button
              type="button"
              data-testid="visor-anotaciones"
              aria-expanded={panelAnotaciones}
              title="Mostrar u ocultar ejes, niveles, cotas y notas"
              onClick={() => setPanelAnotaciones((abierto) => !abierto)}
              className={
                panelAnotaciones
                  ? "rounded border bg-accent px-2 py-1 text-xs font-medium text-accent-foreground shadow-sm"
                  : "rounded border bg-background/90 px-2 py-1 text-xs shadow-sm hover:bg-muted"
              }
            >
              Anotaciones
            </button>
            {panelAnotaciones && (
              <div
                data-testid="visor-anotaciones-panel"
                className="absolute left-0 top-8 z-30 flex w-44 flex-col gap-1 rounded border bg-background/95 p-2 text-[11px] shadow-lg"
              >
                {(
                  [
                    ["ejes3d", "Ejes"],
                    ["niveles3d", "Niveles"],
                    ["cotas3d", "Cotas"],
                    ["notas3d", "Notas"],
                  ] as const
                ).map(([clave, nombre]) => (
                  <label key={clave} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid={`visor-anotaciones-${clave}`}
                      checked={
                        clave === "notas3d"
                          ? vista.notas3d !== false
                          : vista[clave] === true
                      }
                      onChange={(evento) =>
                        void actualizarVista(vista.id, {
                          [clave]: evento.target.checked,
                        })
                      }
                    />
                    {nombre}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
