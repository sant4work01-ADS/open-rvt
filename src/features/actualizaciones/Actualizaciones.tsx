// Aviso no intrusivo de la barra de estado (CA-1) y diálogo de instalación (CA-3).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, RefreshCw, X } from "lucide-react";
import { tr } from "@/i18n";
import { avisoPendiente, useActualizaciones } from "./tienda";
import { abrirEnlace, esLinux, URL_DESCARGA, type ProgresoDescarga } from "./servicio";

/** Comprobación automática: una vez, 5 s después de abrir y sin bloquear (CA-1). */
export function useComprobacionAutomatica() {
  const comprobar = useActualizaciones((s) => s.comprobarAutomatica);
  useEffect(() => {
    const t = setTimeout(() => void comprobar(), 5000);
    return () => clearTimeout(t);
  }, [comprobar]);
}

/** Aviso «Hay una actualización (x.y.z)»; un clic abre el diálogo. */
export function AvisoActualizacion() {
  const actualizacion = useActualizaciones((s) => s.actualizacion);
  const visible = useActualizaciones(avisoPendiente);
  const abrirDialogo = useActualizaciones((s) => s.abrirDialogo);
  useTranslation();
  if (!visible || !actualizacion) return null;
  return (
    <button
      type="button"
      data-testid="aviso-actualizacion"
      onClick={abrirDialogo}
      title={tr("actualizaciones.verDisponible", "Ver la actualización disponible")}
      className="flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-sky-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-400"
    >
      <Download size={13} strokeWidth={2} />
      {tr("actualizaciones.hayActualizacion", "Hay una actualización ({{version}})", {
        version: actualizacion.version,
      })}
    </button>
  );
}

/** Texto de progreso: «Descargando 1.2 MB de 4.0 MB (30 %)». */
export function textoProgreso(p: ProgresoDescarga | null): string {
  if (!p) return tr("actualizaciones.preparando", "Preparando la descarga…");
  if (p.total === null || p.total <= 0)
    return tr("actualizaciones.descargando", "Descargando {{descargado}}…", {
      descargado: enMb(p.descargado),
    });
  const pct = Math.min(100, Math.round((p.descargado / p.total) * 100));
  return tr(
    "actualizaciones.descargandoDe",
    "Descargando {{descargado}} de {{total}} ({{pct}} %)",
    {
      descargado: enMb(p.descargado),
      total: enMb(p.total),
      pct,
    },
  );
}

function enMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Notas del latest.json: texto plano o markdown simple, sin interpretar HTML. */
export function NotasActualizacion({ notas }: { notas: string | null }) {
  if (!notas)
    return (
      <p className="text-sm text-muted-foreground">
        {tr("actualizaciones.sinNotas", "Sin notas de esta versión.")}
      </p>
    );
  const lineas = notas.split(/\r?\n/);
  return (
    <div data-testid="notas-actualizacion" className="space-y-1 text-sm">
      {lineas.map((linea, i) => {
        const t = linea.trim();
        if (t === "") return <div key={i} className="h-1" />;
        const titulo = /^#{1,6}\s+/.test(t);
        const vineta = /^[-*]\s+/.test(t);
        const texto = t.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "");
        return titulo ? (
          <p key={i} className="font-medium">
            {texto}
          </p>
        ) : vineta ? (
          <p key={i} className="pl-3">
            • {texto}
          </p>
        ) : (
          <p key={i}>{texto}</p>
        );
      })}
    </div>
  );
}

/** Diálogo modal de actualización: versión, fecha, notas y acciones (CA-3 a CA-6). */
export function DialogoActualizacion() {
  const abierto = useActualizaciones((s) => s.dialogo);
  const actualizacion = useActualizaciones((s) => s.actualizacion);
  const estado = useActualizaciones((s) => s.estado);
  const error = useActualizaciones((s) => s.error);
  const progreso = useActualizaciones((s) => s.progreso);
  const instalar = useActualizaciones((s) => s.instalarAhora);
  const cerrar = useActualizaciones((s) => s.cerrarDialogo);
  const descargando = estado === "descargando" || estado === "instalando";
  // OPEN-RVT: Linux no instala .deb desde el updater; se ofrece la descarga.
  const linux = esLinux();
  useTranslation();

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !descargando) cerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, descargando, cerrar]);

  if (!abierto || !actualizacion) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("actualizaciones.disponible", "Actualización disponible")}
        data-testid="dialogo-actualizacion"
        className="w-full max-w-lg rounded-lg border bg-background p-4 shadow-xl"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-base font-medium">
            {tr("actualizaciones.disponibleVersion", "Actualización disponible: {{version}}", {
              version: actualizacion.version,
            })}
          </h2>
          {!descargando && (
            <button
              type="button"
              aria-label={tr("comun.cerrar", "Cerrar")}
              onClick={cerrar}
              className="rounded-sm p-1 hover:bg-muted"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {actualizacion.fecha && (
          <p className="mb-2 text-xs text-muted-foreground">
            {tr("actualizaciones.publicada", "Publicada el {{fecha}}", {
              fecha: new Date(actualizacion.fecha).toLocaleDateString("es-MX"),
            })}
          </p>
        )}
        <NotasActualizacion notas={actualizacion.notas} />

        {descargando && (
          <div className="mt-3" data-testid="progreso-actualizacion">
            <p className="mb-1 text-xs">
              {estado === "instalando"
                ? tr("actualizaciones.instalando", "Instalando…")
                : textoProgreso(progreso)}
            </p>
            <div
              className="h-2 overflow-hidden rounded bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                progreso?.total
                  ? Math.round((progreso.descargado / progreso.total) * 100)
                  : undefined
              }
            >
              <div
                className="h-full bg-sky-600 transition-[width]"
                style={{
                  width: `${progreso?.total ? Math.min(100, (progreso.descargado / progreso.total) * 100) : 5}%`,
                }}
              />
            </div>
          </div>
        )}

        {estado === "error" && error && (
          <p
            role="alert"
            data-testid="error-actualizacion"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}

        {linux && (
          <p className="mt-3 rounded border bg-muted/40 p-2 text-xs text-muted-foreground">
            {tr(
              "actualizaciones.linuxDeb",
              "En Linux el instalador .deb se descarga aparte; la aplicación no puede sustituirse sola.",
            )}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="actualizacion-despues"
            disabled={descargando}
            onClick={cerrar}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {tr("actualizaciones.despues", "Después")}
          </button>
          <button
            type="button"
            data-testid="actualizacion-ahora"
            disabled={descargando}
            onClick={() => void (linux ? abrirEnlace(URL_DESCARGA) : instalar())}
            className="flex items-center gap-1 rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {linux ? <Download size={14} strokeWidth={1.5} /> : <RefreshCw size={14} strokeWidth={1.5} />}{" "}
            {linux
              ? tr("actualizaciones.descargar", "Descargar")
              : tr("actualizaciones.actualizarAhora", "Actualizar ahora")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sección «Acerca de / Actualizaciones» de Configuración (CA-2). */
export function AcercaDeActualizaciones() {
  const version = useActualizaciones((s) => s.versionActual);
  const estado = useActualizaciones((s) => s.estado);
  const actualizacion = useActualizaciones((s) => s.actualizacion);
  const error = useActualizaciones((s) => s.error);
  const comprobar = useActualizaciones((s) => s.comprobar);
  const abrirDialogo = useActualizaciones((s) => s.abrirDialogo);
  const [enMarcha, setEnMarcha] = useState(false);
  useTranslation();

  useEffect(() => {
    const { servicio, versionActual } = useActualizaciones.getState();
    if (versionActual) return;
    void servicio
      .versionActual()
      .then((v) => useActualizaciones.setState({ versionActual: v }))
      .catch(() => {
        /* sin backend: se muestra «—» */
      });
  }, []);

  async function buscar() {
    setEnMarcha(true);
    try {
      await comprobar();
    } finally {
      setEnMarcha(false);
    }
  }

  return (
    <section
      aria-label={tr("configuracion.acercaActualizaciones", "Acerca de / Actualizaciones")}
      className="max-w-xl space-y-4"
    >
      <div>
        <h2 className="text-base font-medium">
          {tr("configuracion.acercaActualizaciones", "Acerca de / Actualizaciones")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {tr(
            "actualizaciones.seActualizaSolo",
            "OPEN-RVT se actualiza solo cuando hay una versión nueva.",
          )}
        </p>
      </div>
      <p data-testid="version-actual" className="text-sm">
        {tr("actualizaciones.versionActual", "Versión actual:")} <b>{version ?? "—"}</b>
      </p>
      {esLinux() && (
        <p className="text-xs text-muted-foreground">
          {tr(
            "actualizaciones.linuxDescarga",
            "En Linux descarga el .deb nuevo desde la página de versiones.",
          )}{" "}
          <button
            type="button"
            className="underline"
            data-testid="descargar-actualizacion"
            onClick={() => void abrirEnlace(URL_DESCARGA)}
          >
            {tr("actualizaciones.irADescargas", "Ir a descargas")}
          </button>
        </p>
      )}
      <button
        type="button"
        data-testid="buscar-actualizaciones"
        disabled={enMarcha || estado === "buscando"}
        onClick={() => void buscar()}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {tr("actualizaciones.buscar", "Buscar actualizaciones")}
      </button>
      <div aria-live="polite" data-testid="resultado-actualizaciones" className="text-sm">
        {estado === "buscando" && tr("actualizaciones.buscando", "Buscando…")}
        {estado === "alDia" && tr("actualizaciones.alDia", "Estás al día.")}
        {estado === "disponible" && actualizacion && (
          <span>
            {tr("actualizaciones.versionNueva", "Hay una versión nueva ({{version}}).", {
              version: actualizacion.version,
            })}{" "}
            <button type="button" className="underline" onClick={abrirDialogo}>
              {tr("actualizaciones.verDetalles", "Ver detalles")}
            </button>
          </span>
        )}
        {estado === "error" && error && (
          <span role="alert" className="text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
