import { tr, trTexto } from "@/i18n";
import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/campo";
import { gruposDeAtajos } from "@/lib/atajos";
import {
  indiceTrasMovimiento,
  movimientoDeTecla,
  renglonesPorPagina,
  useScrollSeleccionado,
} from "@/lib/listaTeclado";
import { plegarTexto } from "@/lib/difuso";

interface Props {
  onCerrar: () => void;
}

/** Ventana «Atajos de teclado» (F1 o Ctrl+/): lee la tabla única de `src/lib/atajos.ts`. */
export function DialogoAtajos({ onCerrar }: Props) {
  const [texto, setTexto] = useState("");
  const grupos = useMemo(() => gruposDeAtajos(), []);
  const consulta = plegarTexto(texto.trim());
  const visibles = useMemo(() => {
    if (!consulta) return grupos;
    return grupos
      .map((g) => ({
        ...g,
        atajos: g.atajos.filter((a) =>
          plegarTexto(
            `${a.combinacion} ${a.descripcion} ${g.grupo} ${trTexto("ayuda.descripciones", a.descripcion)} ${trTexto("ayuda.grupos", g.grupo)}`,
          ).includes(consulta),
        ),
      }))
      .filter((g) => g.atajos.length > 0);
  }, [grupos, consulta]);
  const total = visibles.reduce((n, g) => n + g.atajos.length, 0);

  // El listado se recorre con ↑↓, RePág/AvPág, Inicio y Fin (sin salirse de la tabla).
  const contenido = useRef<HTMLDivElement>(null);
  const filas = useMemo(() => visibles.flatMap((g) => g.atajos), [visibles]);
  const [activo, setActivo] = useState(0);
  useScrollSeleccionado(contenido, activo, filas.length);

  return (
    <Modal titulo={tr("ayuda.atajos", "Atajos de teclado")} onCerrar={onCerrar} className="w-[min(760px,94vw)]">
      <div className="flex flex-col">
        <div className="border-b p-3">
          <Input
            autoFocus
            aria-label={tr("app.buscar-atajo", "Buscar atajo")}
            placeholder={tr("app.buscar-por-tecla-o-accion", "Buscar por tecla o acción…")}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setActivo(0);
            }}
            onKeyDown={(e) => {
              const mov = movimientoDeTecla(e);
              if (mov && filas.length > 0) {
                e.preventDefault();
                setActivo(
                  indiceTrasMovimiento(
                    mov,
                    activo,
                    filas.length,
                    renglonesPorPagina(contenido.current),
                  ),
                );
              }
            }}
          />
        </div>
        <div ref={contenido} className="max-h-[65vh] overflow-auto p-3">
          {visibles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tr("app.ningun-atajo-coincide-con", "Ningún atajo coincide con «")}
              {texto}».
            </p>
          )}
          {visibles.map((g) => (
            <section
              key={g.grupo}
              aria-label={trTexto("ayuda.grupos", g.grupo)}
              className="mb-4 last:mb-0"
            >
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {trTexto("ayuda.grupos", g.grupo)}
              </h3>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {g.atajos.map((a) => {
                    const k = filas.indexOf(a);
                    return (
                      <tr
                        key={`${g.grupo}-${a.combinacion}-${a.descripcion}`}
                        id={`atajo-${k}`}
                        aria-selected={k === activo}
                        className="border-t data-[activo=true]:bg-muted"
                        data-activo={k === activo}
                      >
                        <td className="w-56 py-1 pr-3 align-top">
                          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {a.combinacion}
                          </kbd>
                        </td>
                        <td className="py-1">{trTexto("ayuda.descripciones", a.descripcion)}</td>
                        <td className="w-16 py-1 text-right align-top text-[10px] uppercase text-muted-foreground">
                          {tr(`ayuda.origen.${a.origen}`, a.origen)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {total} {total === 1 ? tr("ayuda.unAtajo", "atajo") : tr("ayuda.variosAtajos", "atajos")}{" "}
          {tr("app.navegacion-esc-cierra", "· ↑↓ navegación · Esc cierra")}
        </p>
      </div>
    </Modal>
  );
}
