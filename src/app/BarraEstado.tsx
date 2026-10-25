// OPEN-RVT: copiado de src/app/BarraEstado.tsx de PresupuestosPro y reducido a lo que
// existe: sin obra abierta no hay totales, problemas ni guardado. Se conservan el alto y
// el estilo de la barra para que el esqueleto se vea igual que el de PP.
import { useTranslation } from "react-i18next";

/** Altura anterior de la barra (h-7 = 1.75 rem); se conserva la de PP. */
export const ALTO_ANTERIOR_REM = 1.75;
/** Altura actual: 1.2 × la anterior (spec 030 de PP, CA-1). */
export const ALTO_BARRA_ESTADO_REM = ALTO_ANTERIOR_REM * 1.2;

/** Barra de estado: producto y estado del modelo. */
export function BarraEstado() {
  const { t } = useTranslation();
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
      <span data-testid="estado-modelo">{t("comun.noHayObra", "Sin modelo abierto")}</span>
    </footer>
  );
}
