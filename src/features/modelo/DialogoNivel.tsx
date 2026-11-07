// O051: cuadro pequeño del comando «Nivel». El campo de elevación nace vacío y
// con el foco; no hay 3 m automáticos. Enter crea y deja el cuadro abierto para
// seguir, Esc lo cierra. Acepta absoluto (2.20) o relativo al nivel más alto (+2.6).
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useModelo } from "./estado";
import { nombreNivelAutomatico } from "./niveles";
import { resolverElevacion } from "./nivelesDialogo";

interface Props {
  onCerrar: () => void;
}

export function DialogoNivel({ onCerrar }: Props) {
  const niveles = useModelo((s) => s.niveles);
  const crearNivel = useModelo((s) => s.crearNivel);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  useEffect(() => {
    const alTecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      evento.stopPropagation();
      onCerrar();
    };
    window.addEventListener("keydown", alTecla, true);
    return () => window.removeEventListener("keydown", alTecla, true);
  }, [onCerrar]);

  const crear = async () => {
    if (creando) return;
    const resultado = resolverElevacion(texto, niveles);
    if (resultado.elevacion === null) {
      setError(resultado.error);
      campo.current?.focus();
      return;
    }
    setCreando(true);
    const nombre = nombreNivelAutomatico(niveles, resultado.elevacion);
    const ok = await crearNivel(nombre, resultado.elevacion);
    setCreando(false);
    if (!ok) {
      setError(useModelo.getState().error ?? "No se pudo crear el nivel.");
      campo.current?.focus();
      return;
    }
    setError(null);
    setTexto("");
    campo.current?.focus();
  };

  const masAlto = niveles.length > 0 ? Math.max(...niveles.map((n) => n.elevacion)) : 0;

  return (
    <div
      data-testid="dialogo-nivel"
      className="fixed left-1/2 top-28 z-50 w-[min(320px,92vw)] -translate-x-1/2 rounded border bg-background p-3 shadow-lg"
      role="dialog"
      aria-label="Nivel"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">Nivel</span>
        <button
          type="button"
          data-testid="nivel-dialogo-cerrar"
          aria-label="Cerrar"
          onClick={onCerrar}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X size={14} />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Elevación (m)</span>
        <input
          ref={campo}
          data-testid="nivel-dialogo-elevacion"
          type="text"
          inputMode="decimal"
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void crear();
            }
          }}
          placeholder="2.20 o +2.6"
          className="w-full rounded border bg-background px-2 py-1 text-right"
        />
      </label>
      <p className="mt-1 text-[10px] text-muted-foreground" data-testid="nivel-dialogo-ayuda">
        Absoluto o relativo al más alto ({masAlto.toFixed(2)} m). Enter crea; Esc cierra.
      </p>
      {error && (
        <p data-testid="nivel-dialogo-error" className="mt-1 text-[10px] leading-tight text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
