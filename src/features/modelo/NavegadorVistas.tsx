// OPEN-RVT: navegador de vistas en árbol, a la izquierda del área de trabajo.
import type { Vista } from "./tipos";

interface Props {
  vistas: Vista[];
  activaId: string | null;
  onElegir: (id: string) => void;
}

const GRUPOS: ReadonlyArray<{ titulo: string; tipos: Vista["tipo"][]; prueba: string }> = [
  { titulo: "Plantas", tipos: ["planta"], prueba: "plantas" },
  { titulo: "Alzados", tipos: ["alzado"], prueba: "alzados" },
  { titulo: "Cortes", tipos: ["corte"], prueba: "cortes" },
  { titulo: "3D", tipos: ["iso", "perspectiva"], prueba: "3d" },
];

export function NavegadorVistas({ vistas, activaId, onElegir }: Props) {
  return (
    <aside
      data-testid="navegador-vistas"
      aria-label="Navegador de vistas"
      className="flex w-[210px] shrink-0 flex-col overflow-y-auto border-r bg-background"
    >
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Vistas
      </div>
      <div className="flex flex-col gap-2 p-2">
        {GRUPOS.map((grupo) => {
          const delGrupo = vistas.filter((v) => grupo.tipos.includes(v.tipo));
          if (delGrupo.length === 0) return null;
          return (
            <section key={grupo.titulo} data-grupo={grupo.prueba}>
              <h3 className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {grupo.titulo}
              </h3>
              <ul className="flex flex-col">
                {delGrupo.map((vista) => (
                  <li key={vista.id}>
                    <button
                      type="button"
                      data-testid="vista-item"
                      data-tipo={vista.tipo}
                      data-vista-id={vista.id}
                      aria-current={activaId === vista.id ? "true" : undefined}
                      onClick={() => onElegir(vista.id)}
                      className={
                        activaId === vista.id
                          ? "w-full truncate rounded bg-accent px-2 py-1 text-left text-xs font-medium text-accent-foreground"
                          : "w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      }
                      title={vista.nombre}
                    >
                      {vista.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
