import { tr, trTexto } from "@/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { Conflicto, Estrategia } from "@/lib/bindings";

const OPCIONES = (): { valor: Estrategia; titulo: string; texto: string }[] => [
  {
    valor: "Reutilizar",
    titulo: tr("dialogos.opciones.reutilizar", "Reutilizar"),
    texto: tr(
      "dialogos.usa-lo-que-ya-existe-y-no-copia-este-elemento",
      "Usa lo que ya existe y no copia este elemento.",
    ),
  },
  {
    valor: "Renombrar",
    titulo: tr("dialogos.opciones.renombrar", "Renombrar"),
    texto: tr(
      "dialogos.copia-con-una-clave-nueva-por-ejemplo-clave-2",
      "Copia con una clave nueva (por ejemplo, CLAVE-2).",
    ),
  },
  {
    valor: "Sobrescribir",
    titulo: tr("dialogos.opciones.sobrescribir", "Sobrescribir"),
    texto: tr(
      "dialogos.reemplaza-lo-que-ya-existe-con-esta-version",
      "Reemplaza lo que ya existe con esta versión.",
    ),
  },
];

function textoMotivo(c: Conflicto): string {
  return c.motivo === "MismaClave" ? "misma clave" : "mismo elemento";
}

/** Diálogo «Conflictos al copiar»: lista los conflictos y deja elegir la estrategia. */
export function DialogoConflictos({
  conflictos,
  onResolver,
}: {
  conflictos: Conflicto[];
  /** Estrategia elegida, o null si se cancela. */ onResolver: (
    estrategia: Estrategia | null,
  ) => void;
}) {
  const [estrategia, setEstrategia] = useState<Estrategia>("Reutilizar");
  return (
    <Modal
      titulo={tr("componentes.conflictos-al-copiar", "Conflictos al copiar")}
      onCerrar={() => onResolver(null)}
      className="w-[min(520px,92vw)]"
    >
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          onResolver(estrategia);
        }}
      >
        <h2 className="font-semibold">
          {tr("componentes.conflictos-al-copiar", "Conflictos al copiar")}
        </h2>
        <p className="text-muted-foreground">
          {tr(
            "componentes.algunos-elementos-ya-existen-en-el-destino-elige",
            "Algunos elementos ya existen en el destino. Elige qué hacer con ellos.",
          )}
        </p>
        <ul
          className="max-h-40 overflow-y-auto rounded border p-2"
          aria-label={tr("componentes.lista-de-conflictos", "Lista de conflictos")}
        >
          {conflictos.map((c, i) => (
            <li key={`${c.entidad}-${c.clave}-${i}`}>
              {c.entidad} <span className="font-mono">{c.clave}</span> ({textoMotivo(c)})
            </li>
          ))}
        </ul>
        <div
          role="radiogroup"
          aria-label={tr(
            "componentes.que-hacer-con-los-conflictos",
            "Qué hacer con los conflictos",
          )}
          className="flex flex-col gap-2"
        >
          {OPCIONES().map((o) => (
            <label key={o.valor} className="flex items-start gap-2">
              <input
                type="radio"
                name="estrategia-conflicto"
                value={o.valor}
                checked={estrategia === o.valor}
                autoFocus={o.valor === "Reutilizar"}
                onChange={() => setEstrategia(o.valor)}
                className="mt-1"
              />

              <span>
                <span className="font-medium">{trTexto("dialogos.opciones", o.titulo)}</span>
                <span className="block text-muted-foreground">
                  {trTexto("dialogos.opciones", o.texto)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onResolver(null)}>
            {tr("componentes.cancelar", "Cancelar")}
          </Button>
          <Button type="submit">{tr("componentes.copiar", "Copiar")}</Button>
        </div>
      </form>
    </Modal>
  );
}
