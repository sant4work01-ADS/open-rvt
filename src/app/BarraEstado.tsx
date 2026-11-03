// OPEN-RVT: copiado de src/app/BarraEstado.tsx de PresupuestosPro y adaptado a O003a:
// nombre del archivo, esquema, número de elementos, escala de la vista activa y avisos
// del núcleo IFC. Sin modelo se conserva «Sin modelo abierto» del esqueleto.
import { useTranslation } from "react-i18next";
import { Copy, Download } from "lucide-react";
import { useModelo } from "@/features/modelo/estado";
import { AvisoActualizacion } from "@/features/actualizaciones/Actualizaciones";
import { textoDeDetalle, ultimoErrorBitacora } from "@/lib/bitacora";
import { exportarBitacora } from "@/lib/bitacoraExportar";
import { copiarTexto } from "@/lib/portapapeles";

/** Altura anterior de la barra (h-7 = 1.75 rem); se conserva la de PP. */
export const ALTO_ANTERIOR_REM = 1.75;
/** Altura actual: 1.2 × la anterior (spec 030 de PP, CA-1). */
export const ALTO_BARRA_ESTADO_REM = ALTO_ANTERIOR_REM * 1.2;

/** Barra de estado: producto, archivo abierto, esquema, elementos y avisos. */
export function BarraEstado() {
  const { t } = useTranslation();
  const nombreArchivo = useModelo((s) => s.nombreArchivo);
  const esquema = useModelo((s) => s.esquema);
  const totalElementos = useModelo((s) => s.totalElementos);
  const conCambios = useModelo((s) => s.conCambios);
  const vistas = useModelo((s) => s.vistas);
  const vistaActivaId = useModelo((s) => s.vistaActivaId);
  const modoCorte = useModelo((s) => s.modoCorte);
  const aviso = useModelo((s) => s.aviso);
  const pistaTab = useModelo((s) => s.pistaTab);
  const error = useModelo((s) => s.error);
  const cargando = useModelo((s) => s.cargando);
  const tiempoCargaMs = useModelo((s) => s.tiempoCargaMs);
  const vista = vistas.find((v) => v.id === vistaActivaId);
  return (
    <footer
      role="status"
      aria-label={t("barraEstado.barra", "Barra de estado")}
      className="flex shrink-0 items-center gap-4 overflow-hidden border-t px-3 text-xs text-muted-foreground"
      style={{ height: `${ALTO_BARRA_ESTADO_REM}rem` }}
    >
      <span data-testid="estado-producto" className="shrink-0">
        {t("comun.app", "OPEN-RVT")}
      </span>
      {nombreArchivo ? (
        <>
          <span data-testid="estado-modelo" className="shrink-0 truncate">
            {nombreArchivo}
            {conCambios ? " •" : ""}
          </span>
          <span data-testid="estado-esquema" className="shrink-0">
            {esquema}
          </span>
          <span data-testid="estado-elementos" className="shrink-0">
            {totalElementos} elementos
          </span>
          {vista && (
            <span data-testid="estado-vista" className="shrink-0">
              1:{vista.escala}
            </span>
          )}
          {tiempoCargaMs !== null && (
            <span data-testid="estado-tiempo" className="shrink-0">
              {tiempoCargaMs} ms
            </span>
          )}
        </>
      ) : (
        <span data-testid="estado-modelo">{t("comun.noHayObra", "Sin modelo abierto")}</span>
      )}
      <span className="ml-auto flex min-w-0 items-center gap-3">
        <AvisoActualizacion />
        {cargando && <span data-testid="estado-cargando">Cargando…</span>}
        {modoCorte && (
          <span data-testid="estado-modo-corte" className="text-amber-600 dark:text-amber-400">
            {vista?.tipo === "planta"
              ? "Haga dos clics para el corte · Esc cancela"
              : "Abra una planta para crear el corte"}
          </span>
        )}
        {pistaTab && (
          <span data-testid="estado-pista-tab" className="truncate text-sky-600 dark:text-sky-400" title={pistaTab}>
            {pistaTab}
          </span>
        )}
        {aviso && (
          <span data-testid="estado-aviso" className="truncate" title={aviso}>
            {aviso}
          </span>
        )}
        {error && (
          <span
            data-testid="estado-error"
            className="flex min-w-0 items-center gap-1 truncate text-red-600"
            title={error}
          >
            <span className="truncate">{error}</span>
            <button
              type="button"
              data-testid="aviso-copiar-detalle"
              title={t("bitacora.copiar-detalle", "Copiar detalle")}
              aria-label={t("bitacora.copiar-detalle", "Copiar detalle")}
              onClick={() => copiarTexto(textoDeDetalle(ultimoErrorBitacora()))}
              className="flex shrink-0 items-center gap-1 rounded px-1 hover:bg-muted"
            >
              <Copy size={12} strokeWidth={1.5} />
              {t("bitacora.copiar-detalle", "Copiar detalle")}
            </button>
            <button
              type="button"
              data-testid="aviso-exportar-bitacora"
              title={t("bitacora.exportar", "Exportar bitácora…")}
              aria-label={t("bitacora.exportar", "Exportar bitácora…")}
              onClick={() => {
                void exportarBitacora({ rutaIfc: useModelo.getState().ruta }).catch((e: unknown) => {
                  useModelo
                    .getState()
                    .fijarAviso(`No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`);
                });
              }}
              className="flex shrink-0 items-center gap-1 rounded px-1 hover:bg-muted"
            >
              <Download size={12} strokeWidth={1.5} />
              {t("bitacora.exportar", "Exportar bitácora…")}
            </button>
          </span>
        )}
      </span>
    </footer>
  );
}
