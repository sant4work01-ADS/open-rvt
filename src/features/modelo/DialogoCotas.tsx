// OPEN-RVT (O006a): «Crear ejes por separaciones». Pide dirección, origen,
// separaciones, longitud y primera etiqueta, y muestra una vista previa en planta
// antes de crear la retícula completa en una sola operación.
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useModelo } from "./estado";
import { parsearCota } from "./cotas";

function etiquetaSiguiente(primera: string, indice: number): string {
  if (/^\d+$/.test(primera)) return String(Number(primera) + indice);
  if (/^[A-Za-z]$/.test(primera)) {
    return String.fromCharCode(primera.toUpperCase().charCodeAt(0) + indice);
  }
  return `${primera}${indice}`;
}

export function DialogoCotas() {
  const cerrar = useModelo((s) => s.cerrarDialogoCotas);
  const crear = useModelo((s) => s.crearEjesPorSeparaciones);
  const errorNucleo = useModelo((s) => s.error);
  const [direccion, setDireccion] = useState<"vertical" | "horizontal">("vertical");
  const [origen, setOrigen] = useState("0");
  const [separaciones, setSeparaciones] = useState("5, 4.5, 5");
  const [longitud, setLongitud] = useState("20");
  const [primera, setPrimera] = useState("1");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const valores = useMemo(
    () =>
      separaciones
        .split(/[,;]/)
        .map((texto) => texto.trim())
        .filter(Boolean)
        .map((texto) => parsearCota(texto)),
    [separaciones],
  );
  const validas = valores.every((v): v is number => v !== null);
  const origenNumero = Number(origen.replace(",", "."));
  const longitudNumero = Number(longitud.replace(",", "."));
  const previewValida =
    validas &&
    valores.length > 0 &&
    Number.isFinite(origenNumero) &&
    Number.isFinite(longitudNumero) &&
    longitudNumero > 0;

  const vistaPrevia = useMemo(() => {
    const distancias = valores.filter((v): v is number => v !== null);
    if (distancias.length === 0 || !previewValida) return null;
    const posiciones = [origenNumero];
    for (const d of distancias) posiciones.push(posiciones[posiciones.length - 1] + d);
    const largo = longitudNumero;
    const ancho = Math.max(posiciones[posiciones.length - 1] - posiciones[0], 0.1);
    const escalaX = 260 / Math.max(direccion === "vertical" ? ancho : largo, 0.1);
    const escalaY = 110 / Math.max(direccion === "vertical" ? largo : ancho, 0.1);
    const etiquetas = posiciones.map((_, i) => etiquetaSiguiente(primera || "1", i));
    return { posiciones, ancho, largo, escalaX, escalaY, etiquetas };
  }, [direccion, longitudNumero, origenNumero, previewValida, primera, valores]);

  const aceptar = async () => {
    if (!previewValida) {
      setMensaje("Revise las separaciones, el origen y la longitud.");
      return;
    }
    const ok = await crear(
      direccion,
      origenNumero,
      valores.filter((v): v is number => v !== null),
      longitudNumero,
      primera,
    );
    if (!ok) {
      setMensaje(useModelo.getState().error ?? errorNucleo ?? "No se pudieron crear los ejes.");
      return;
    }
    cerrar();
  };

  return (
    <Modal titulo="Crear ejes por separaciones" onCerrar={cerrar} conCabecera className="w-[min(720px,94vw)]">
      <div data-testid="dialogo-ejes-separaciones" className="flex flex-col gap-3 p-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Dirección</span>
            <select
              data-testid="eje-sep-direccion"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value as "vertical" | "horizontal")}
              className="rounded border bg-background px-2 py-1"
            >
              <option value="vertical">Vertical (números)</option>
              <option value="horizontal">Horizontal (letras)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Origen (m)</span>
            <input
              data-testid="eje-sep-origen"
              value={origen}
              onChange={(e) => setOrigen(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-right"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Separaciones (m, separadas por coma)</span>
            <input
              data-testid="eje-sep-separaciones"
              value={separaciones}
              onChange={(e) => setSeparaciones(e.target.value)}
              className="rounded border bg-background px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Longitud de los ejes (m)</span>
            <input
              data-testid="eje-sep-longitud"
              value={longitud}
              onChange={(e) => setLongitud(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-right"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Primera etiqueta</span>
            <input
              data-testid="eje-sep-etiqueta"
              value={primera}
              onChange={(e) => setPrimera(e.target.value)}
              className="rounded border bg-background px-2 py-1"
            />
          </label>
        </div>

        <div className="rounded border bg-muted/20 p-2">
          <div className="mb-1 text-muted-foreground">Vista previa en planta</div>
          <svg
            data-testid="eje-sep-vista-previa"
            viewBox="0 0 320 160"
            role="img"
            aria-label="Vista previa de los ejes"
            className="h-40 w-full"
          >
            <rect x="0" y="0" width="320" height="160" className="fill-background" />
            {vistaPrevia && direccion === "vertical" && (
              <g>
                {vistaPrevia.posiciones.map((posicion, i) => {
                  const x = 30 + (posicion - vistaPrevia.posiciones[0]) * vistaPrevia.escalaX;
                  return (
                    <g key={i}>
                      <line x1={x} y1={20} x2={x} y2={140} className="stroke-amber-700" strokeWidth="1" />
                      <circle cx={x} cy={20} r="6" className="fill-background stroke-amber-700" strokeWidth="1" />
                      <text x={x} y={17} textAnchor="middle" className="fill-amber-700 text-[8px]">
                        {vistaPrevia.etiquetas[i]}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
            {vistaPrevia && direccion === "horizontal" && (
              <g>
                {vistaPrevia.posiciones.map((posicion, i) => {
                  const y = 140 - (posicion - vistaPrevia.posiciones[0]) * vistaPrevia.escalaY;
                  return (
                    <g key={i}>
                      <line x1={30} y1={y} x2={290} y2={y} className="stroke-amber-700" strokeWidth="1" />
                      <circle cx={290} cy={y} r="6" className="fill-background stroke-amber-700" strokeWidth="1" />
                      <text x={296} y={y + 3} className="fill-amber-700 text-[8px]">
                        {vistaPrevia.etiquetas[i]}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {mensaje && (
          <div data-testid="eje-sep-error" className="text-red-600">
            {mensaje}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="eje-sep-cancelar"
            onClick={cerrar}
            className="rounded border px-3 py-1 hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="eje-sep-aceptar"
            onClick={() => void aceptar()}
            disabled={!previewValida}
            className="rounded bg-amber-600 px-3 py-1 text-white disabled:opacity-40"
          >
            Crear ejes
          </button>
        </div>
      </div>
    </Modal>
  );
}
