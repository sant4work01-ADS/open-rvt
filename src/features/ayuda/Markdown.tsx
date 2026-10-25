// Renderizador mínimo del Markdown del manual. No usa `dangerouslySetInnerHTML` ni
// dependencias nuevas: el documento viene empaquetado y se pinta como React.
import { useMemo, type ReactNode } from "react";
import { plegar, parsearMarkdown, type Bloque } from "./manual";

const ENLINEA = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

/** Negritas, cursivas, código y enlaces en línea, sin interpretar HTML. */
function enLinea(texto: string): ReactNode[] {
  const partes = texto.split(ENLINEA).filter((p) => p !== "");
  return partes.map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return <strong key={i}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("`") && parte.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {parte.slice(1, -1)}
        </code>
      );
    }
    if (parte.startsWith("*") && parte.endsWith("*")) {
      return <em key={i}>{parte.slice(1, -1)}</em>;
    }
    const enlace = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(parte);
    if (enlace) {
      return (
        <a key={i} href={enlace[2]} className="text-teal-700 underline dark:text-teal-400">
          {enlace[1]}
        </a>
      );
    }
    return <span key={i}>{parte}</span>;
  });
}

function bloqueARender(b: Bloque, i: number): ReactNode {
  switch (b.tipo) {
    case "titulo": {
      const nivel = Math.min(b.nivel, 4);
      const clases = [
        "",
        "text-xl font-semibold",
        "text-lg font-semibold",
        "text-base font-semibold",
        "text-sm font-semibold",
      ][nivel];
      return (
        <p key={`h-${i}`} id={plegar(b.texto)} className={`${clases} mt-4 first:mt-0`}>
          {enLinea(b.texto)}
        </p>
      );
    }
    case "parrafo":
      return (
        <p key={`p-${i}`} className="leading-relaxed">
          {enLinea(b.texto)}
        </p>
      );
    case "lista": {
      const Lista = b.ordenada ? "ol" : "ul";
      return (
        <Lista
          key={`l-${i}`}
          className={`ml-5 space-y-1 ${b.ordenada ? "list-decimal" : "list-disc"}`}
        >
          {b.items.map((item, j) => (
            <li key={j}>{enLinea(item)}</li>
          ))}
        </Lista>
      );
    }
    case "tabla":
      return (
        <div key={`t-${i}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {b.encabezados.map((c, j) => (
                  <th key={j} className="border-b bg-muted px-2 py-1 text-left font-semibold">
                    {enLinea(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.filas.map((fila, j) => (
                <tr key={j} className="border-b last:border-0">
                  {fila.map((c, k) => (
                    <td key={k} className="px-2 py-1 align-top">
                      {enLinea(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cita":
      return (
        <blockquote
          key={`c-${i}`}
          className="border-l-2 border-teal-600 bg-muted/40 px-3 py-1 text-sm text-muted-foreground"
        >
          {b.lineas.map((l, j) => (
            <p key={j}>{enLinea(l)}</p>
          ))}
        </blockquote>
      );
    case "codigo":
      return (
        <pre key={`x-${i}`} className="overflow-x-auto rounded bg-muted p-2 text-xs">
          <code>{b.lineas.join("\n")}</code>
        </pre>
      );
    case "separador":
      return <hr key={`r-${i}`} className="my-3 border-border" />;
  }
}

/** Markdown del manual como React (sin HTML crudo). */
export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const bloques = useMemo(() => parsearMarkdown(texto), [texto]);
  return <div className={`space-y-2 text-sm ${className ?? ""}`}>{bloques.map(bloqueARender)}</div>;
}
