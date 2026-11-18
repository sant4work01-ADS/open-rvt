// O068: ficha de Ventana/Puerta: medidas, antepecho desde el nivel y distancia.
import type { Nivel } from "./tipos";
import { CampoEditable } from "./campoEditable";

export function PropiedadesAbertura({
  globalid,
  clase,
  ancho,
  alto,
  pset,
  niveles,
  editar,
}: {
  globalid: string;
  clase: string;
  ancho: number;
  alto: number;
  pset?: Record<string, unknown>;
  niveles: Nivel[];
  editar: (globalid: string, cambios: Record<string, unknown>) => void | Promise<void>;
}) {
  const numero = (valor: unknown, porDefecto: number): number => {
    const n = Number(valor);
    return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : porDefecto;
  };
  const tieneVano = !!pset && pset.Muro !== undefined;
  const nivel = String(pset?.Nivel ?? "");
  const antepecho = numero(pset?.AntepechoNivel ?? pset?.Antepecho, 0);
  const distancia = numero(pset?.Distancia, 0);
  const defecto = clase === "IfcDoor" ? 0.9 : 1.2;
  return (
    <>
      <CampoEditable
        etiqueta="Ancho (m)"
        testid="elemento-ancho"
        numerico
        paso={0.05}
        valor={ancho || defecto}
        onGuardar={(valor) => void editar(globalid, { ancho: valor })}
      />
      <CampoEditable
        etiqueta="Alto (m)"
        testid="elemento-alto"
        numerico
        paso={0.05}
        valor={alto || (clase === "IfcDoor" ? 2.1 : 1.2)}
        onGuardar={(valor) => void editar(globalid, { alto: valor })}
      />
      {tieneVano && (
        <>
          <CampoEditable
            etiqueta="Antepecho (m)"
            testid="elemento-antepecho"
            numerico
            paso={0.05}
            title="Altura del alféizar desde el nivel de referencia"
            valor={antepecho}
            onGuardar={(valor) =>
              void editar(globalid, { antepecho: valor, nivel })
            }
          />
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Nivel de referencia</span>
            <select
              data-testid="elemento-nivel-abertura"
              value={nivel}
              onChange={(e) =>
                void editar(globalid, { nivel: e.target.value })
              }
              className="w-36 rounded border bg-background px-2 py-1"
            >
              <option value="">Base del muro</option>
              {niveles.map((n) => (
                <option key={n.globalid} value={n.globalid}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <CampoEditable
            etiqueta="Distancia al inicio (m)"
            testid="elemento-distancia"
            numerico
            paso={0.05}
            valor={distancia}
            onGuardar={(valor) => void editar(globalid, { distancia: valor })}
          />
        </>
      )}
    </>
  );
}
