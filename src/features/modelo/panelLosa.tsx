// Panel de una losa: uso, bordes y (O067) nivel y desfase.
import {
  bordesDePset,
  desfaseConSigno,
  etiquetaBorde,
  valorComunDesfase,
} from "./bordesLosa";
import { useCampoConEnter } from "./campoEditable";

type Editar = (
  globalid: string,
  cambios: Record<string, unknown>,
) => Promise<void>;

function CampoDesfaseComun({
  globalid,
  valor,
  editar,
}: {
  globalid: string;
  valor: number | "Varios";
  editar: Editar;
}) {
  const campo = useCampoConEnter({
    valor,
    convertir: (entrada) => {
      const numero = Number(entrada);
      return Number.isFinite(numero) ? numero : null;
    },
    onGuardar: (nuevo) => void editar(globalid, { desfase_bordes: Number(nuevo) }),
  });
  return (
    <input
      key={String(valor)}
      data-testid="elemento-desfase-bordes"
      type={valor === "Varios" ? "text" : "number"}
      step={0.005}
      value={campo.value}
      onChange={campo.onChange}
      onBlur={campo.onBlur}
      onKeyDown={campo.onKeyDown}
      className="w-28 rounded border bg-background px-2 py-1 text-right"
    />
  );
}

function CampoDesfaseBorde({
  globalid,
  indice,
  desfase,
  editar,
}: {
  globalid: string;
  indice: number;
  desfase: number;
  editar: Editar;
}) {
  const campo = useCampoConEnter({
    valor: desfase,
    convertir: (entrada) => {
      const numero = Number(entrada);
      return Number.isFinite(numero) ? numero : null;
    },
    onGuardar: (nuevo) =>
      void editar(globalid, { cambio_borde: { indice, desfase: Number(nuevo) } }),
  });
  return (
    <input
      key={`${indice}-${desfase}`}
      data-testid={`elemento-borde-${indice}-desfase`}
      type="number"
      step={0.005}
      value={campo.value}
      onChange={campo.onChange}
      onBlur={campo.onBlur}
      onKeyDown={campo.onKeyDown}
      className="w-20 rounded border bg-background px-1 py-0.5 text-right"
    />
  );
}

export function BordesLosaElemento({
  globalid,
  pset,
  editar,
}: {
  globalid: string;
  pset: Record<string, unknown> | undefined;
  editar: Editar;
}) {
  const bordes = bordesDePset(pset);
  if (bordes.length === 0) {
    return (
      <div className="text-muted-foreground" data-testid="elemento-sin-bordes">
        Losa sin bordes referenciados.
      </div>
    );
  }
  const comun = valorComunDesfase(bordes);
  return (
    <div className="flex flex-col gap-2" data-testid="elemento-bordes-losa">
      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Desfase de bordes (m)</span>
        <CampoDesfaseComun globalid={globalid} valor={comun} editar={editar} />
      </label>
      <table className="w-full text-left text-[11px]" data-testid="tabla-bordes-losa">
        <thead>
          <tr className="text-muted-foreground">
            <th className="font-normal">Borde</th>
            <th className="font-normal">Desfase</th>
          </tr>
        </thead>
        <tbody>
          {bordes.map((borde, indice) => (
            <tr key={indice} data-testid={`elemento-borde-${indice}`}>
              <td>{etiquetaBorde(indice, borde)}</td>
              <td>
                <CampoDesfaseBorde
                  globalid={globalid}
                  indice={indice}
                  desfase={Number(borde.desfase) || 0}
                  editar={editar}
                />
                <span className="ml-1 text-muted-foreground">
                  {desfaseConSigno(borde)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
