// OPEN-RVT: copiado de src/app/BarraEstado.tsx de PresupuestosPro y adaptado a O003a:
// nombre del archivo, esquema, número de elementos, escala de la vista activa y avisos
// del núcleo IFC. Sin modelo se conserva «Sin modelo abierto» del esqueleto.
import { useTranslation } from "react-i18next";
import { useModelo } from "@/features/modelo/estado";
import { AvisoActualizacion } from "@/features/actualizaciones/Actualizaciones";

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
        {aviso && (
          <span data-testid="estado-aviso" className="truncate" title={aviso}>
            {aviso}
          </span>
        )}
        {error && (
          <span data-testid="estado-error" className="truncate text-red-600" title={error}>
            {error}
          </span>
        )}
      </span>
    </footer>
  );
}
