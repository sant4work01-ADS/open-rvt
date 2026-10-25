// OPEN-RVT (O006d): «Crear ejes por separaciones» en ambos sentidos. Los bloques
// vertical (números) y horizontal (letras) pueden ir vacíos por separado. En modo
// rebase (el de omisión) cada familia llega hasta la opuesta más el rebase; con una
// sola familia se usa el modo origen con su longitud.
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

function distanciasDe(texto: string): { valores: number[]; validas: boolean } {
  const partes = texto
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const valores = partes.map((t) => parsearCota(t));
  return {
    valores: valores.filter((v): v is number => v !== null),
    validas: valores.every((v) => v !== null),
  };
}

interface Bloque {
  separaciones: string;
  primera: string;
  origen: string;
  longitud: string;
}

const VERTICAL_INICIAL: Bloque = {
  separaciones: "5, 4.5, 5",
  primera: "1",
  origen: "0",
  longitud: "20",
};
const HORIZONTAL_INICIAL: Bloque = {
  separaciones: "4, 4",
  primera: "A",
  origen: "0",
  longitud: "12",
};

function numero(texto: string): number {
  return Number(texto.replace(",", "."));
}

export function DialogoCotas() {
  const cerrar = useModelo((s) => s.cerrarDialogoCotas);
  const crear = useModelo((s) => s.crearReticula);
  const errorNucleo = useModelo((s) => s.error);
  const [vertical, setVertical] = useState<Bloque>(VERTICAL_INICIAL);
  const [horizontal, setHorizontal] = useState<Bloque>(HORIZONTAL_INICIAL);
  const [modo, setModo] = useState<"origen" | "rebase">("rebase");
  const [rebase, setRebase] = useState("1.5");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const v = useMemo(() => distanciasDe(vertical.separaciones), [vertical.separaciones]);
  const h = useMemo(() => distanciasDe(horizontal.separaciones), [horizontal.separaciones]);
  const hayVertical = vertical.separaciones.trim() !== "";
  const hayHorizontal = horizontal.separaciones.trim() !== "";
  const soloUna = hayVertical !== hayHorizontal;
  const modoEfectivo = soloUna ? "origen" : modo;
  const usaLongitud = modoEfectivo === "origen";

  const rebaseNumero = numero(rebase);
  const verticalValido =
    !hayVertical ||
    (v.validas && v.valores.length > 0 && /^\d+$/.test(vertical.primera.trim()));
  const horizontalValido =
    !hayHorizontal ||
    (h.validas && h.valores.length > 0 && /^[A-Za-z]$/.test(horizontal.primera.trim()));
  const longitudesValidas =
    !usaLongitud ||
    ((!hayVertical || numero(vertical.longitud) > 0) &&
      (!hayHorizontal || numero(horizontal.longitud) > 0));
  const rebaseValido = modoEfectivo === "rebase" ? rebaseNumero > 0 : true;
  const valido =
    (hayVertical || hayHorizontal) &&
    verticalValido &&
    horizontalValido &&
    longitudesValidas &&
    rebaseValido;

  const vistaPrevia = useMemo(() => {
    const xs = hayVertical
      ? v.valores.reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + d], [
          numero(vertical.origen) || 0,
        ])
      : [];
    const ys = hayHorizontal
      ? h.valores.reduce<number[]>((acc, d) => [...acc, acc[acc.length - 1] + d], [
          numero(horizontal.origen) || 0,
        ])
      : [];
    if (xs.length === 0 && ys.length === 0) return null;
    const reb = modoEfectivo === "rebase" ? Math.max(rebaseNumero, 0) : 0;
    const vOrigen = numero(vertical.origen) || 0;
    const vLargo = numero(vertical.longitud) || 1;
    const hOrigen = numero(horizontal.origen) || 0;
    const hLargo = numero(horizontal.longitud) || 1;
    let xMin: number;
    let xMax: number;
    let yMin: number;
    let yMax: number;
    if (modoEfectivo === "rebase" && xs.length > 0 && ys.length > 0) {
      xMin = Math.min(...xs) - reb;
      xMax = Math.max(...xs) + reb;
      yMin = Math.min(...ys) - reb;
      yMax = Math.max(...ys) + reb;
    } else {
      const limitesX = [
        ...(xs.length > 0 ? xs : []),
        ...(ys.length > 0 ? [hOrigen, hOrigen + hLargo] : []),
      ];
      const limitesY = [
        ...(ys.length > 0 ? ys : []),
        ...(xs.length > 0 ? [vOrigen, vOrigen + vLargo] : []),
      ];
      xMin = limitesX.length > 0 ? Math.min(...limitesX) : 0;
      xMax = limitesX.length > 0 ? Math.max(...limitesX) : 1;
      yMin = limitesY.length > 0 ? Math.min(...limitesY) : 0;
      yMax = limitesY.length > 0 ? Math.max(...limitesY) : 1;
    }
    if (xMax - xMin < 0.1) xMax = xMin + 0.1;
    if (yMax - yMin < 0.1) yMax = yMin + 0.1;
    const margen = 22;
    const escala = Math.min(
      (320 - margen * 2) / (xMax - xMin),
      (160 - margen * 2) / (yMax - yMin),
    );
    const px = (x: number) => margen + (x - xMin) * escala + ((320 - margen * 2) - (xMax - xMin) * escala) / 2;
    const py = (y: number) => 160 - margen - (y - yMin) * escala - ((160 - margen * 2) - (yMax - yMin) * escala) / 2;
    const usaRebase = modoEfectivo === "rebase" && xs.length > 0 && ys.length > 0;
    return {
      xs: xs.map((x, i) => ({ x: px(x), etiqueta: etiquetaSiguiente(vertical.primera || "1", i) })),
      ys: ys.map((y, i) => ({ y: py(y), etiqueta: etiquetaSiguiente(horizontal.primera || "A", i) })),
      yInicio: usaRebase ? py(yMax) : py(vOrigen + vLargo),
      yFin: usaRebase ? py(yMin) : py(vOrigen),
      xInicio: usaRebase ? px(xMin) : px(hOrigen),
      xFin: usaRebase ? px(xMax) : px(hOrigen + hLargo),
      rebase: reb,
    };
  }, [
    hayVertical,
    hayHorizontal,
    horizontal,
    modoEfectivo,
    rebaseNumero,
    v.valores,
    vertical,
    h.valores,
  ]);

  const aceptar = async () => {
    if (!valido) {
      setMensaje("Revise las separaciones, las etiquetas, el origen y la longitud.");
      return;
    }
    const bloque = (b: Bloque, valores: number[]) =>
      b.separaciones.trim() === ""
        ? null
        : {
            separaciones: valores,
            origen: numero(b.origen) || 0,
            longitud: numero(b.longitud) || 1,
            primeraEtiqueta: b.primera.trim(),
          };
    const ok = await crear(
      bloque(vertical, v.valores),
      bloque(horizontal, h.valores),
      modoEfectivo,
      modoEfectivo === "rebase" ? rebaseNumero : 1.5,
    );
    if (!ok) {
      setMensaje(useModelo.getState().error ?? errorNucleo ?? "No se pudieron crear los ejes.");
      return;
    }
    cerrar();
  };

  const campo = (
    clave: "vertical" | "horizontal",
    bloque: Bloque,
    fijar: (b: Bloque) => void,
    etiqueta: string,
  ) => (
    <fieldset className="rounded border p-2">
      <legend className="px-1 text-muted-foreground">{etiqueta}</legend>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Separaciones (m, separadas por coma)</span>
          <input
            data-testid={`eje-sep-${clave}-separaciones`}
            value={bloque.separaciones}
            onChange={(e) => fijar({ ...bloque, separaciones: e.target.value })}
            className="rounded border bg-background px-2 py-1"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Primera etiqueta</span>
            <input
              data-testid={`eje-sep-${clave}-etiqueta`}
              value={bloque.primera}
              onChange={(e) => fijar({ ...bloque, primera: e.target.value })}
              className="rounded border bg-background px-2 py-1"
            />
          </label>
          {usaLongitud && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Origen (m)</span>
                <input
                  data-testid={`eje-sep-${clave}-origen`}
                  value={bloque.origen}
                  onChange={(e) => fijar({ ...bloque, origen: e.target.value })}
                  className="rounded border bg-background px-2 py-1 text-right"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Longitud (m)</span>
                <input
                  data-testid={`eje-sep-${clave}-longitud`}
                  value={bloque.longitud}
                  onChange={(e) => fijar({ ...bloque, longitud: e.target.value })}
                  className="rounded border bg-background px-2 py-1 text-right"
                />
              </label>
            </>
          )}
        </div>
      </div>
    </fieldset>
  );

  return (
    <Modal
      titulo="Crear ejes por separaciones"
      onCerrar={cerrar}
      conCabecera
      className="w-[min(820px,96vw)]"
    >
      <div data-testid="dialogo-ejes-separaciones" className="flex flex-col gap-3 p-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          {campo("vertical", vertical, setVertical, "Ejes verticales (numerados)")}
          {campo("horizontal", horizontal, setHorizontal, "Ejes horizontales (con letras)")}
        </div>

        <fieldset className="rounded border p-2">
          <legend className="px-1 text-muted-foreground">Longitud de los ejes</legend>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                data-testid="eje-sep-modo-origen"
                name="eje-sep-modo"
                checked={modoEfectivo === "origen"}
                disabled={!soloUna && modoEfectivo === "origen" ? false : soloUna}
                onChange={() => setModo("origen")}
              />
              Desde el origen
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                data-testid="eje-sep-modo-rebase"
                name="eje-sep-modo"
                checked={modoEfectivo === "rebase"}
                disabled={soloUna}
                onChange={() => setModo("rebase")}
              />
              Rebase sobre los ejes opuestos
            </label>
            <label className="flex items-center gap-1">
              <span className="text-muted-foreground">Rebase (m)</span>
              <input
                data-testid="eje-sep-rebase"
                value={rebase}
                disabled={modoEfectivo !== "rebase"}
                onChange={(e) => setRebase(e.target.value)}
                className="w-20 rounded border bg-background px-2 py-1 text-right disabled:opacity-40"
              />
            </label>
            {soloUna && (
              <span data-testid="eje-sep-aviso-una-familia" className="text-muted-foreground">
                Con una sola familia se usa el origen y la longitud.
              </span>
            )}
          </div>
        </fieldset>

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
            {vistaPrevia && (
              <g>
                {vistaPrevia.xs.map(({ x, etiqueta }, i) => (
                  <g key={`v${i}`}>
                    <line
                      x1={x}
                      y1={vistaPrevia.yInicio}
                      x2={x}
                      y2={vistaPrevia.yFin}
                      className="stroke-amber-700"
                      strokeWidth="1"
                    />
                    <circle cx={x} cy={vistaPrevia.yInicio} r="6" className="fill-background stroke-amber-700" strokeWidth="1" />
                    <text x={x} y={vistaPrevia.yInicio - 9} textAnchor="middle" className="fill-amber-700 text-[8px]">
                      {etiqueta}
                    </text>
                  </g>
                ))}
                {vistaPrevia.ys.map(({ y, etiqueta }, i) => (
                  <g key={`h${i}`}>
                    <line
                      x1={vistaPrevia.xInicio}
                      y1={y}
                      x2={vistaPrevia.xFin}
                      y2={y}
                      className="stroke-amber-700"
                      strokeWidth="1"
                    />
                    <circle cx={vistaPrevia.xFin} cy={y} r="6" className="fill-background stroke-amber-700" strokeWidth="1" />
                    <text x={vistaPrevia.xFin + 7} y={y + 3} className="fill-amber-700 text-[8px]">
                      {etiqueta}
                    </text>
                  </g>
                ))}
                {modoEfectivo === "rebase" && vistaPrevia.rebase > 0 && (
                  <text
                    data-testid="eje-sep-previa-rebase"
                    x="8"
                    y="154"
                    className="fill-sky-600 text-[8px]"
                  >
                    rebase {vistaPrevia.rebase.toFixed(2)} m
                  </text>
                )}
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
            disabled={!valido}
            className="rounded bg-amber-600 px-3 py-1 text-white disabled:opacity-40"
          >
            Crear ejes
          </button>
        </div>
      </div>
    </Modal>
  );
}
