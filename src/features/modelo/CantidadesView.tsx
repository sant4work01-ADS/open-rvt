// OPEN-RVT O009: vista Cantidades. Agrupa las partidas de medición de los tipos,
// despliega sus renglones generadores y exporta el contrato de PresupuestosPro.
import { Fragment, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Download } from "lucide-react";
import { llamarConBitacora } from "@/lib/bitacora";
import { elegirDestinoMedicion } from "@/lib/dialogos";
import { textoDeError } from "@/lib/ipc";
import { Button } from "@/components/ui/button";
import { useModelo } from "./estado";
import { ETIQUETA_UNIDAD, totalesOrdenados } from "./cantidadesUnidad";

export interface RenglonMedicion {
  eje: string;
  tramo: string;
  descripcion: string;
  piezas: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  resultado: number;
  globalid: string;
}

export interface PartidaMedicionCalculada {
  clave: string;
  nombre: string;
  unidad: string;
  total: number;
  renglones: RenglonMedicion[];
}

/** O063: losa u otro elemento que no se pudo medir; no suma en los totales. */
export interface ErrorMedicion {
  globalid: string;
  mensaje: string;
}

function numero(valor: number): string {
  return valor.toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function CantidadesView() {
  const niveles = useModelo((s) => s.niveles);
  const conCambios = useModelo((s) => s.conCambios);
  const nombreArchivo = useModelo((s) => s.nombreArchivo);
  const seleccionar = useModelo((s) => s.seleccionar);
  const fijarAviso = useModelo((s) => s.fijarAviso);
  const [nivel, setNivel] = useState("");
  const [partidas, setPartidas] = useState<PartidaMedicionCalculada[]>([]);
  const [errores, setErrores] = useState<ErrorMedicion[]>([]);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      // Después del efecto: así la carga no encadena renders síncronos.
      await Promise.resolve();
      if (!vivo) return;
      setCargando(true);
      try {
        const datos = await llamarConBitacora<{
          partidas: PartidaMedicionCalculada[];
          errores?: ErrorMedicion[];
        }>("medicion.calcular", nivel ? { nivel } : {});
        if (!vivo) return;
        setPartidas(datos.partidas ?? []);
        setErrores(datos.errores ?? []);
        setError(null);
      } catch (e) {
        if (vivo) setError(textoDeError(e));
      } finally {
        if (vivo) setCargando(false);
      }
    };
    void cargar();
    return () => {
      vivo = false;
    };
  }, [nivel, conCambios]);

  // O063: un total por unidad; sumar m² con m³ no dice nada.
  const totales = useMemo(() => totalesOrdenados(partidas), [partidas]);

  const alternar = (clave: string) => {
    setAbiertas((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const base = (nombreArchivo || "medicion").replace(/\.ifc$/i, "");
      const ruta = await elegirDestinoMedicion(base);
      if (!ruta) return;
      await llamarConBitacora("medicion.exportar", { ruta });
      fijarAviso(`Medición exportada a PresupuestosPro: ${ruta}`);
    } catch (e) {
      setError(textoDeError(e));
    } finally {
      setExportando(false);
    }
  };

  return (
    <div
      data-testid="vista-cantidades"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Cantidades</h2>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Nivel
          <select
            data-testid="cantidades-nivel"
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
            className="h-7 rounded border bg-background px-1 text-xs text-foreground"
          >
            <option value="">Todos</option>
            {niveles.map((n) => (
              <option key={n.globalid} value={n.globalid}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span data-testid="cantidades-total">{partidas.length} partidas</span>
          {totales.map(([unidad, total]) => (
            <span key={unidad} data-testid={`cantidades-total-${unidad}`}>
              <span className="font-medium text-foreground">{numero(total)}</span>{" "}
              {ETIQUETA_UNIDAD[unidad] ?? unidad}
            </span>
          ))}
        </span>
        <Button
          type="button"
          data-testid="cantidades-exportar"
          onClick={() => void exportar()}
          disabled={exportando || partidas.length === 0}
          className="ml-auto"
        >
          <Download size={14} /> Exportar a PresupuestosPro…
        </Button>
      </div>

      {error && (
        <p data-testid="cantidades-error" className="px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {errores.length > 0 && (
        <ul
          data-testid="cantidades-errores"
          className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {errores.map((fallo) => (
            <li key={fallo.globalid} data-testid={`cantidades-error-${fallo.globalid}`}>
              <AlertTriangle size={12} className="mr-1 inline" />
              Elemento {fallo.globalid}: {fallo.mensaje}. No suma en los totales.
            </li>
          ))}
        </ul>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs" aria-label="Cantidades por partida">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="w-8 px-2 py-2 font-medium" />
              <th className="w-32 px-2 py-2 font-medium">Clave</th>
              <th className="px-2 py-2 font-medium">Nombre</th>
              <th className="w-20 px-2 py-2 font-medium">Unidad</th>
              <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {partidas.map((partida, indice) => {
              const claveFila = `${partida.clave}|${partida.nombre}|${partida.unidad}`;
              const abierta = abiertas.has(claveFila);
              return (
                <Fragment key={claveFila}>
                  <tr
                    data-testid={`cantidades-partida-${indice}`}
                    className="cursor-pointer border-b hover:bg-muted/40"
                    onClick={() => alternar(claveFila)}
                  >
                    <td className="px-2 py-1 text-muted-foreground">
                      {abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </td>
                    <td className="px-2 py-1 font-mono">
                      {partida.clave || (
                        <span
                          data-testid={`cantidades-aviso-${indice}`}
                          className="flex items-center gap-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-sans text-amber-800"
                          title="Sin clave de PP: ponla en el tipo"
                        >
                          <AlertTriangle size={11} /> Sin clave
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {partida.nombre}
                      {!partida.clave && (
                        <span className="ml-2 text-[10px] text-amber-700">
                          Sin clave de PP: ponla en el tipo
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {ETIQUETA_UNIDAD[partida.unidad] ?? partida.unidad}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {numero(partida.total)}
                    </td>
                  </tr>
                  {abierta &&
                    partida.renglones.map((renglon, i) => (
                      <tr
                        key={`${claveFila}-${renglon.globalid}-${i}`}
                        data-testid={`cantidades-renglon-${indice}-${i}`}
                        className="cursor-pointer border-b bg-muted/20 hover:bg-accent"
                        onClick={() => void seleccionar(renglon.globalid)}
                        title="Seleccionar el elemento en el modelo"
                      >
                        <td />
                        <td className="px-2 py-1 font-mono text-[11px]">{renglon.eje || "—"}</td>
                        <td className="px-2 py-1">
                          {renglon.descripcion}
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            {renglon.tramo}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-[11px] text-muted-foreground">
                          {renglon.piezas !== null && `pza ${renglon.piezas}`}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {numero(renglon.resultado)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!cargando && partidas.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            No hay partidas para mostrar. Agrega partidas en el editor de tipos.
          </p>
        )}
        {cargando && <p className="p-4 text-sm text-muted-foreground">Calculando…</p>}
      </div>
    </div>
  );
}
