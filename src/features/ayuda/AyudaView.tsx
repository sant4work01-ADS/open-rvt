import { useTranslation } from "react-i18next";
import { tr } from "@/i18n";
import { useMemo, useRef, useState } from "react";
import { BookOpen, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/campo";
import { DialogoAtajos } from "@/app/DialogoAtajos";
import {
  indiceTrasMovimiento,
  movimientoDeTecla,
  renglonesPorPagina,
  useScrollSeleccionado,
} from "@/lib/listaTeclado";
import { plegarTexto } from "@/lib/difuso";
import manualEs from "../../../docs/manual-rapido.md?raw";
import manualEn from "../../../docs/manual-rapido.en.md?raw";
import { Markdown } from "./Markdown";
import { BitacoraView } from "./BitacoraView";
import { dividirSecciones } from "./manual";

/** Ayuda: manual rápido actualizado, con índice de secciones y buscador. */
export function AyudaView() {
  const { i18n } = useTranslation();
  const [texto, setTexto] = useState("");
  const [atajos, setAtajos] = useState(false);
  const [pestana, setPestana] = useState<"manual" | "bitacora">("manual");
  const contenido = useRef<HTMLDivElement>(null);
  const secciones = useMemo(
    () => dividirSecciones(i18n.language === "en" ? manualEn : manualEs),
    [i18n.language],
  );
  const consulta = plegarTexto(texto.trim());
  const visibles = useMemo(() => {
    if (!consulta) return secciones;
    return secciones.filter((s) => plegarTexto(`${s.titulo} ${s.markdown}`).includes(consulta));
  }, [secciones, consulta]);

  function irASeccion(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    if (el instanceof HTMLElement) el.tabIndex = -1;
  }

  // El índice de secciones también se recorre con el teclado: ↑↓, RePág/AvPág, Inicio/Fin;
  // Enter salta a la sección. El activo siempre queda a la vista.
  const indice = useRef<HTMLUListElement>(null);
  const [activo, setActivo] = useState(0);
  const activoEnLista = Math.min(activo, Math.max(visibles.length - 1, 0));
  useScrollSeleccionado(indice, activoEnLista, visibles.length);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={tr("ayuda.pestanas", "Ayuda")} className="flex shrink-0 gap-1 border-b px-2">
        <button
          type="button"
          role="tab"
          data-testid="ayuda-pestana-manual"
          aria-selected={pestana === "manual"}
          onClick={() => setPestana("manual")}
          className={
            "border-b-2 px-3 py-1.5 text-xs " +
            (pestana === "manual"
              ? "border-accent font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          {tr("ayuda.manual", "Manual")}
        </button>
        <button
          type="button"
          role="tab"
          data-testid="ayuda-pestana-bitacora"
          aria-selected={pestana === "bitacora"}
          onClick={() => setPestana("bitacora")}
          className={
            "border-b-2 px-3 py-1.5 text-xs " +
            (pestana === "bitacora"
              ? "border-accent font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          {tr("ayuda.bitacora", "Bitácora")}
        </button>
      </div>
      {pestana === "bitacora" ? (
        <BitacoraView />
      ) : (
      <div className="flex min-h-0 flex-1">
      <aside
        aria-label={tr("ayuda.indice-del-manual", "Índice del manual")}
        className="flex w-64 shrink-0 flex-col border-r"
      >
        <div className="space-y-2 border-b p-3">
          <Input
            aria-label={tr("ayuda.buscar-en-el-manual", "Buscar en el manual")}
            placeholder={tr("ayuda.buscar-en-la-ayuda", "Buscar en la ayuda…")}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setActivo(0);
            }}
            onKeyDown={(e) => {
              const mov = movimientoDeTecla(e);
              if (mov && visibles.length > 0) {
                e.preventDefault();
                setActivo(
                  indiceTrasMovimiento(
                    mov,
                    activoEnLista,
                    visibles.length,
                    renglonesPorPagina(indice.current),
                  ),
                );
              } else if (e.key === "Enter" && visibles[activoEnLista]) {
                e.preventDefault();
                irASeccion(visibles[activoEnLista].id);
              }
            }}
          />

          <Button
            variant="outline"
            className="h-8 w-full justify-start gap-2 text-xs"
            onClick={() => setAtajos(true)}
            title={tr("ayuda.atajos-de-teclado-f1", "Atajos de teclado (F1)")}
          >
            <Keyboard size={14} strokeWidth={1.5} />{" "}
            {tr("ayuda.atajos-de-teclado-f1", "Atajos de teclado (F1)")}
          </Button>
        </div>
        <nav
          aria-label={tr("ayuda.secciones", "Secciones")}
          className="min-h-0 flex-1 overflow-auto p-2"
        >
          <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {visibles.length} {tr("ayuda.de", "de")} {secciones.length}{" "}
            {tr("ayuda.secciones-2", "secciones")}
          </p>
          <ul ref={indice} className="space-y-0.5">
            {visibles.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  id={`indice-seccion-${i}`}
                  aria-selected={i === activoEnLista}
                  onClick={() => irASeccion(s.id)}
                  className={
                    "w-full truncate rounded-sm px-2 py-1 text-left text-xs " +
                    (i === activoEnLista && visibles.length > 0
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                  title={s.titulo}
                >
                  {s.titulo}
                </button>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="px-2 py-2 text-xs text-muted-foreground">
                {tr("ayuda.ninguna-seccion-coincide-con", "Ninguna sección coincide con «")}
                {texto}».
              </li>
            )}
          </ul>
        </nav>
      </aside>

      <div ref={contenido} className="min-w-0 flex-1 overflow-auto px-6 py-4">
        {visibles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <BookOpen size={16} strokeWidth={1.5} className="mr-2" />{" "}
            {tr("ayuda.sin-resultados-en-el-manual", "Sin resultados en el manual.")}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-8">
            {visibles.map((s) => (
              <section key={s.id} aria-label={s.titulo} data-seccion={s.id}>
                <Markdown texto={s.markdown} />
              </section>
            ))}
          </div>
        )}
      </div>

      {atajos && <DialogoAtajos onCerrar={() => setAtajos(false)} />}
      </div>
      )}
    </div>
  );
}
