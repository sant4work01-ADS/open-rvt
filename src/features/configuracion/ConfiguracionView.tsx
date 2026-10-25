// OPEN-RVT: copiado de src/features/configuracion/ConfiguracionView.tsx de PresupuestosPro.
// Se conservan las secciones de Apariencia (tema y escala) e Idioma; se quitaron las de
// obra, biblioteca, respaldos, asistente, color del tema y barra de herramientas porque
// OPEN-RVT todavía no tiene esas funciones.
import { tr } from "@/i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Info, Monitor, Moon, Palette, Sun } from "lucide-react";
import type { Idioma } from "@/i18n";
import { cn } from "@/lib/utils";
import { ESCALA_OPCIONES, useTema, type PreferenciaTema } from "@/lib/tema";
import { useRueda, type PreferenciaRueda } from "@/lib/rueda";
import { AcercaDeActualizaciones } from "@/features/actualizaciones/Actualizaciones";

const SECCIONES = () =>
  [
    { id: "apariencia", nombre: tr("configuracion.apariencia", "Apariencia"), icono: Palette },
    { id: "idioma", nombre: tr("configuracion.idioma", "Idioma"), icono: Languages },
    {
      id: "acerca",
      nombre: tr("configuracion.acercaActualizaciones", "Acerca de / Actualizaciones"),
      icono: Info,
    },
  ] as const;

const TEMAS = (): { id: PreferenciaTema; nombre: string; icono: typeof Sun }[] => [
  { id: "claro", nombre: tr("configuracion.claro", "Claro"), icono: Sun },
  { id: "oscuro", nombre: tr("configuracion.oscuro", "Oscuro"), icono: Moon },
  { id: "sistema", nombre: tr("configuracion.sistema", "Sistema"), icono: Monitor },
];

/** Etiqueta legible del tamaño: «120 %». */
const etiquetaEscala = (e: number) => `${e} %`;

/** Selector del tamaño de la interfaz (100/110/120/130 %). */
function TamanoInterfaz() {
  const escala = useTema((s) => s.escala);
  const fijarEscala = useTema((s) => s.fijarEscala);
  return (
    <section aria-labelledby="tamano-interfaz">
      <h2 id="tamano-interfaz" className="mb-2 text-sm font-medium">
        {tr("configuracion.tamano-de-la-interfaz", "Tamaño de la interfaz")}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {tr(
          "configuracion.escala-toda-la-interfaz-el-sidebar-iconos-y-boto",
          "Escala toda la interfaz; el sidebar (íconos y botones) queda un poco más grande. Atajos:\n        Ctrl+= agranda, Ctrl+− achica y Ctrl+0 vuelve al predeterminado (120 %).",
        )}
      </p>
      <div
        role="radiogroup"
        aria-label={tr("configuracion.tamano-de-la-interfaz", "Tamaño de la interfaz")}
        className="flex flex-wrap gap-1"
      >
        {ESCALA_OPCIONES.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={escala === e}
            data-testid={`escala-${e}`}
            onClick={() => fijarEscala(e)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm hover:bg-muted",
              escala === e && "border-accent bg-accent text-accent-foreground hover:bg-accent",
            )}
          >
            {etiquetaEscala(e)}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Selector de idioma (spec 056): español o inglés, con efecto inmediato. */
export function IdiomaSelector() {
  const { t } = useTranslation();
  const idioma = useTema((s) => s.idioma);
  const fijarIdioma = useTema((s) => s.fijarIdioma);
  const opciones: { id: Idioma; nombre: string }[] = [
    { id: "es", nombre: t("comun.espanol") },
    { id: "en", nombre: t("comun.ingles") },
  ];

  return (
    <section aria-labelledby="idioma">
      <h2 id="idioma" className="mb-2 text-sm font-medium">
        {t("configuracion.idioma")}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("configuracion.idiomaAyuda")}</p>
      <div
        role="radiogroup"
        aria-label={t("configuracion.idioma")}
        className="flex flex-wrap gap-1"
      >
        {opciones.map(({ id, nombre }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={idioma === id}
            data-testid={`idioma-${id}`}
            onClick={() => fijarIdioma(id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm hover:bg-muted",
              idioma === id && "border-accent bg-accent text-accent-foreground hover:bg-accent",
            )}
          >
            {nombre}
          </button>
        ))}
      </div>
    </section>
  );
}

/** O006d: qué hace la rueda del ratón o el desplazamiento de dos dedos del touchpad. */
function RuedaTouchpad() {
  const preferencia = useRueda((s) => s.preferencia);
  const fijar = useRueda((s) => s.fijarPreferencia);
  const opciones: Array<{ id: PreferenciaRueda; nombre: string; ayuda: string }> = [
    { id: "auto", nombre: "Automático", ayuda: "Detecta ratón o touchpad" },
    { id: "zoom", nombre: "Zoom", ayuda: "Siempre acerca y aleja" },
    { id: "paneo", nombre: "Paneo", ayuda: "Siempre mueve la vista" },
  ];
  return (
    <section aria-labelledby="rueda-touchpad">
      <h2 id="rueda-touchpad" className="mb-2 text-sm font-medium">
        Rueda/touchpad: zoom o paneo
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        El pellizco del touchpad siempre hace zoom y Shift + rueda desplaza en
        horizontal. En «Automático» los saltos grandes de la rueda hacen zoom y los
        desplazamientos pequeños de dos dedos, paneo.
      </p>
      <div role="radiogroup" aria-label="Rueda/touchpad" className="flex flex-wrap gap-1">
        {opciones.map(({ id, nombre, ayuda }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={preferencia === id}
            data-testid={`rueda-${id}`}
            title={ayuda}
            onClick={() => fijar(id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm hover:bg-muted",
              preferencia === id && "border-accent bg-accent text-accent-foreground hover:bg-accent",
            )}
          >
            {nombre}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Configuración de la aplicación: apariencia (tema y escala) e idioma. */
export function ConfiguracionView({
  seccionInicial = "apariencia",
}: {
  seccionInicial?: ReturnType<typeof SECCIONES>[number]["id"];
}) {
  const [seccion, setSeccion] =
    useState<ReturnType<typeof SECCIONES>[number]["id"]>(seccionInicial);
  const { pref, fijar } = useTema();
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1" aria-label={t("configuracion.titulo")}>
      <nav aria-label={t("configuracion.secciones")} className="w-44 shrink-0 border-r p-2">
        {SECCIONES().map(({ id, nombre, icono: Icono }) => (
          <button
            key={id}
            aria-current={seccion === id ? "page" : undefined}
            onClick={() => setSeccion(id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
              seccion === id && "bg-accent text-accent-foreground hover:bg-accent",
            )}
          >
            <Icono size={14} strokeWidth={1.5} /> {t(`configuracion.${id}`, nombre)}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-auto p-4">
        {seccion === "apariencia" && (
          <section aria-label={t("configuracion.apariencia")} className="max-w-xl space-y-6">
            <div>
              <h2 className="text-base font-medium">{t("configuracion.apariencia")}</h2>
              <p className="text-xs text-muted-foreground">{t("configuracion.aparienciaAyuda")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TEMAS().map(({ id, nombre, icono: Icono }) => (
                <button
                  key={id}
                  onClick={() => fijar(id)}
                  aria-pressed={pref === id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted",
                    pref === id && "border-accent bg-accent text-accent-foreground",
                  )}
                >
                  <Icono size={16} strokeWidth={1.5} />
                  {t(`configuracion.${id}`, nombre)}
                </button>
              ))}
            </div>
            <TamanoInterfaz />
            <RuedaTouchpad />
          </section>
        )}
        {seccion === "idioma" && (
          <section aria-label={t("configuracion.idioma")} className="max-w-xl space-y-6">
            <IdiomaSelector />
          </section>
        )}
        {seccion === "acerca" && <AcercaDeActualizaciones />}
      </div>
    </div>
  );
}
