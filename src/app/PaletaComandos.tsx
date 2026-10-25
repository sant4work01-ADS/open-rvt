import { tr } from "@/i18n";
import { useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/campo";
import { filtrarDifuso } from "@/lib/difuso";
import {
  indiceTrasMovimiento,
  movimientoDeTecla,
  renglonesPorPagina,
  useScrollSeleccionado,
} from "@/lib/listaTeclado";

export interface Comando {
  id: string;
  titulo: string;
  /** Atajo de teclado, solo informativo. */
  atajo?: string;
  accion: () => void;
}

interface Props {
  comandos: Comando[];
  onCerrar: () => void;
}

/** Paleta de comandos (Ctrl+K): búsqueda difusa, ↑↓ elegir, Enter ejecutar, Esc cerrar. */
export function PaletaComandos({ comandos, onCerrar }: Props) {
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const visibles = useMemo(
    () => filtrarDifuso(comandos, texto, (c) => c.titulo),
    [comandos, texto],
  );
  const indice = Math.min(activo, Math.max(visibles.length - 1, 0));
  useScrollSeleccionado(lista, indice, visibles.length);

  function ejecutar(c: Comando | undefined) {
    if (!c) return;
    onCerrar();
    // Después de cerrar, para que el foco vuelva antes de actuar.
    setTimeout(c.accion, 0);
  }

  function mover(e: React.KeyboardEvent) {
    const mov = movimientoDeTecla(e);
    if (mov && visibles.length > 0) {
      e.preventDefault();
      setActivo(
        indiceTrasMovimiento(mov, indice, visibles.length, renglonesPorPagina(lista.current)),
      );
      return true;
    }
    return false;
  }

  return (
    <Modal titulo={tr("dialogos.paleta-de-comandos", "Paleta de comandos")} onCerrar={onCerrar}>
      <div className="flex flex-col">
        <Input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="paleta-lista"
          aria-label={tr("app.buscar-comando", "Buscar comando")}
          placeholder={tr("app.escribe-un-comando", "Escribe un comando…")}
          className="h-10 rounded-none border-0 border-b"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
          }}
          onKeyDown={(e) => {
            if (mover(e)) return;
            if (e.key === "Enter") {
              e.preventDefault();
              ejecutar(visibles[indice]);
            }
          }}
        />

        <ul
          id="paleta-lista"
          ref={lista}
          role="listbox"
          aria-label={tr("app.comandos", "Comandos")}
          className="max-h-[50vh] overflow-auto py-1"
        >
          {visibles.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">
              {tr("app.sin-comandos-que-coincidan", "Sin comandos que coincidan.")}
            </li>
          )}
          {visibles.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === indice}
              onMouseEnter={() => setActivo(i)}
              onClick={() => ejecutar(c)}
              className={
                "flex cursor-pointer items-center justify-between px-3 py-1.5 " +
                (i === indice ? "bg-accent text-accent-foreground" : "")
              }
            >
              <span>{c.titulo}</span>
              {c.atajo && <kbd className="text-xs text-muted-foreground">{c.atajo}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
