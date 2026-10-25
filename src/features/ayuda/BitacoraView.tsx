// O006c: panel «Bitácora» del módulo Ayuda. Muestra la sesión actual en vivo, filtra
// por tipo, abre el detalle de un error con su traza y las acciones previas, y exporta
// el .zip con las sesiones, OPEN-RVT.log, sistema.json y (opcional) el IFC.
import { useEffect, useMemo, useState } from "react";
import { Download, Copy, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { tr } from "@/i18n";
import {
  eventosBitacora,
  suscribirBitacora,
  TIPOS_EVENTO,
  textoDeDetalle,
  type EventoBitacora,
} from "@/lib/bitacora";
import { exportarBitacora } from "@/lib/bitacoraExportar";
import { copiarTexto } from "@/lib/portapapeles";
import { useModelo } from "@/features/modelo/estado";

function esError(evento: EventoBitacora): boolean {
  return (
    evento.tipo === "error_ui" ||
    (evento.tipo === "resultado" && evento.ok === false) ||
    (evento.tipo === "aviso" && evento.nivel === "error")
  );
}

function resumen(evento: EventoBitacora): string {
  switch (evento.tipo) {
    case "clic":
      return `${String(evento.etiqueta ?? "")} — ${String(evento.ruta ?? "")}`;
    case "tecla":
      return String(evento.combinacion ?? "");
    case "herramienta":
      return `${String(evento.herramienta ?? "")}: ${String(evento.paso ?? "")}`;
    case "accion":
      return `${String(evento.metodo ?? "")} ${JSON.stringify(evento.params ?? {})}`;
    case "resultado":
      return evento.ok
        ? `ok · ${String(evento.duracion_ms ?? 0)} ms · ${JSON.stringify(evento.resumen ?? {})}`
        : `error · ${String(evento.mensaje ?? "")}`;
    case "aviso":
      return `${String(evento.nivel ?? "")}: ${String(evento.texto ?? "")}`;
    case "error_ui":
      return String(evento.mensaje ?? "");
    case "vista":
      return `${String(evento.nombre ?? "")} — ${String(evento.ruta ?? "sin archivo")}`;
    case "nucleo_stderr":
      return String(evento.texto ?? "");
    case "inicio":
      return `OPEN-RVT ${String(evento.version ?? "")} · Python ${String(evento.python ?? "")} · IfcOpenShell ${String(evento.ifcopenshell ?? "")}`;
    default:
      return "";
  }
}

function hora(ts: unknown): string {
  const texto = String(ts ?? "");
  return texto.length >= 23 ? texto.slice(11, 23) : texto;
}

export function BitacoraView() {
  const ruta = useModelo((s) => s.ruta);
  const [lista, setLista] = useState<EventoBitacora[]>(() => eventosBitacora());
  const [filtro, setFiltro] = useState("todos");
  const [soloErrores, setSoloErrores] = useState(false);
  const [detalle, setDetalle] = useState<EventoBitacora | null>(null);
  const [exportando, setExportando] = useState(false);
  const [todas, setTodas] = useState(false);
  const [incluirIfc, setIncluirIfc] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => suscribirBitacora(setLista), []);

  const visibles = useMemo(
    () =>
      lista.filter(
        (evento) =>
          (filtro === "todos" || evento.tipo === filtro) && (!soloErrores || esError(evento)),
      ),
    [lista, filtro, soloErrores],
  );

  const indiceDetalle = detalle ? lista.indexOf(detalle) : -1;
  const accionesPrevias = useMemo(() => {
    if (indiceDetalle < 0) return [];
    return lista
      .slice(0, indiceDetalle)
      .filter((e) => e.tipo === "accion" || e.tipo === "resultado")
      .slice(-20);
  }, [indiceDetalle, lista]);

  async function exportar() {
    setMensaje(null);
    try {
      const destino = await exportarBitacora({ todas, incluirIfc, rutaIfc: ruta });
      if (destino) {
        setMensaje(`Bitácora exportada en ${destino}`);
        setExportando(false);
      }
    } catch (e) {
      setMensaje(`No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div data-testid="bitacora-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Filter size={14} strokeWidth={1.5} className="text-muted-foreground" />
        <select
          data-testid="bitacora-filtro"
          aria-label={tr("bitacora.filtrar-por-tipo", "Filtrar por tipo")}
          className="h-8 rounded-sm border bg-background px-2 text-xs"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="todos">{tr("bitacora.todos", "Todos los tipos")}</option>
          {TIPOS_EVENTO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            data-testid="bitacora-solo-errores"
            checked={soloErrores}
            onChange={(e) => setSoloErrores(e.target.checked)}
          />
          {tr("bitacora.solo-errores", "Solo errores")}
        </label>
        <span className="text-xs text-muted-foreground">
          {visibles.length} / {lista.length} {tr("bitacora.eventos", "eventos")}
        </span>
        <Button
          variant="outline"
          className="ml-auto h-7 text-xs"
          data-testid="bitacora-exportar"
          onClick={() => setExportando(true)}
        >
          <Download size={14} strokeWidth={1.5} />{" "}
          {tr("bitacora.exportar", "Exportar bitácora…")}
        </Button>
      </div>

      {mensaje && (
        <div data-testid="bitacora-mensaje" className="border-b px-3 py-1.5 text-xs">
          {mensaje}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Hora</th>
                <th className="px-2 py-1 font-medium">Tipo</th>
                <th className="px-2 py-1 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((evento, indice) => (
                <tr
                  key={`${evento.ts}-${indice}`}
                  data-testid={esError(evento) ? "bitacora-fila-error" : "bitacora-fila"}
                  data-tipo={evento.tipo}
                  onClick={() => esError(evento) && setDetalle(evento)}
                  className={
                    "border-t " +
                    (esError(evento)
                      ? "cursor-pointer bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300"
                      : "")
                  }
                >
                  <td className="whitespace-nowrap px-2 py-1 font-mono">{hora(evento.ts)}</td>
                  <td className="whitespace-nowrap px-2 py-1">{evento.tipo}</td>
                  <td className="max-w-0 truncate px-2 py-1" title={resumen(evento)}>
                    {resumen(evento)}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">
                    {tr("bitacora.sin-eventos", "Sin eventos que coincidan con el filtro.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {detalle && (
          <aside
            data-testid="bitacora-detalle"
            className="flex w-[46%] min-w-[320px] shrink-0 flex-col overflow-auto border-l p-3 text-xs"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-red-700 dark:text-red-300">
                {tr("bitacora.detalle-del-error", "Detalle del error")}
              </h3>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  className="h-7 text-xs"
                  data-testid="bitacora-copiar-detalle"
                  onClick={() => copiarTexto(textoDeDetalle(detalle))}
                >
                  <Copy size={13} strokeWidth={1.5} />{" "}
                  {tr("bitacora.copiar-detalle", "Copiar detalle")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tr("componentes.cerrar", "Cerrar")}
                  onClick={() => setDetalle(null)}
                >
                  <X size={14} strokeWidth={1.5} />
                </Button>
              </div>
            </div>
            <p className="mb-1 font-medium">
              {String(detalle.mensaje ?? detalle.texto ?? "")}
            </p>
            {detalle.codigo != null && (
              <p className="mb-1 text-muted-foreground">Código: {String(detalle.codigo)}</p>
            )}
            {detalle.traza ? (
              <pre className="mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded border bg-muted/50 p-2 font-mono text-[11px]">
                {String(detalle.traza)}
              </pre>
            ) : (
              <p className="mb-3 text-muted-foreground">
                {tr("bitacora.sin-traza", "Este error no trae traza de Python.")}
              </p>
            )}
            <h4 className="mb-1 font-semibold">
              {tr("bitacora.acciones-previas", "20 acciones previas")}
            </h4>
            <ol className="space-y-1">
              {accionesPrevias.map((accion, indice) => (
                <li
                  key={`${accion.ts}-${indice}`}
                  className="rounded border bg-muted/30 px-2 py-1 font-mono text-[11px]"
                >
                  {hora(accion.ts)} · {accion.tipo} · {resumen(accion).slice(0, 300)}
                </li>
              ))}
              {accionesPrevias.length === 0 && (
                <li className="text-muted-foreground">
                  {tr("bitacora.sin-acciones-previas", "No hay acciones anteriores.")}
                </li>
              )}
            </ol>
          </aside>
        )}
      </div>

      {exportando && (
        <Modal
          titulo={tr("bitacora.exportar-titulo", "Exportar bitácora")}
          onCerrar={() => setExportando(false)}
          className="w-[min(480px,92vw)]"
        >
          <div data-testid="bitacora-exportar-dialogo" className="space-y-3 p-4 text-sm">
            <p className="text-muted-foreground">
              {tr(
                "bitacora.exportar-explicacion",
                "El .zip incluye las sesiones, OPEN-RVT.log y sistema.json.",
              )}
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="bitacora-todas"
                checked={todas}
                onChange={(e) => setTodas(e.target.checked)}
              />
              {tr("bitacora.todas-las-sesiones", "Todas las sesiones (no solo las últimas 3)")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="bitacora-incluir-ifc"
                checked={incluirIfc}
                onChange={(e) => setIncluirIfc(e.target.checked)}
              />
              {tr("bitacora.incluir-ifc", "Incluir el modelo IFC abierto")}
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExportando(false)}>
                {tr("comun.cancelar", "Cancelar")}
              </Button>
              <Button data-testid="bitacora-exportar-confirmar" onClick={() => void exportar()}>
                {tr("bitacora.guardar-zip", "Guardar .zip…")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
