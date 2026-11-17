// Campo editable del panel derecho: guarda con Enter o al perder el foco (O003b).
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

/**
 * O053: comportamiento común de los campos numéricos del panel. Enter guarda y sale,
 * perder el foco guarda, Escape restaura y nunca se guarda dos veces el mismo valor.
 */
export function useCampoConEnter({
  valor,
  convertir,
  onGuardar,
}: {
  valor: string | number | undefined;
  convertir: (entrada: string) => string | number | null;
  onGuardar: (valor: string | number) => void;
}) {
  const comoTexto = (v: string | number | undefined) => String(v ?? "");
  const [texto, setTexto] = useState(comoTexto(valor));
  const [previo, setPrevio] = useState(valor);
  const ultimoGuardado = useRef(comoTexto(valor));
  if (valor !== previo) {
    setPrevio(valor);
    setTexto(comoTexto(valor));
  }
  useEffect(() => {
    ultimoGuardado.current = comoTexto(valor);
  }, [valor]);
  const guardar = (entrada: string) => {
    const convertido = convertir(entrada);
    if (convertido === null) {
      setTexto(comoTexto(valor));
      return;
    }
    const nuevo = String(convertido);
    if (nuevo !== ultimoGuardado.current) {
      ultimoGuardado.current = nuevo;
      onGuardar(convertido);
    }
    setTexto(nuevo);
  };
  return {
    value: texto,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setTexto(e.target.value),
    onBlur: (e: FocusEvent<HTMLInputElement>) => guardar(e.currentTarget.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        guardar(e.currentTarget.value);
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setTexto(ultimoGuardado.current);
      }
    },
  };
}

/** Campo editable que guarda con Enter o al perder el foco (spec O003b). */
export function CampoEditable({
  etiqueta,
  valor,
  testid,
  numerico,
  paso,
  title,
  onGuardar,
}: {
  etiqueta: string;
  valor: string | number | undefined;
  testid: string;
  numerico?: boolean;
  paso?: number;
  title?: string;
  onGuardar: (valor: string | number) => void;
}) {
  // O053: Enter, blur y Escape comparten el mismo comportamiento y solo se guarda
  // cuando el valor cambia respecto al último guardado.
  const campo = useCampoConEnter({
    valor,
    convertir: (entrada) => {
      if (numerico) {
        const numero = Number(entrada);
        return Number.isFinite(numero) ? numero : null;
      }
      const limpio = entrada.trim();
      return limpio || null;
    },
    onGuardar,
  });
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground" title={title}>{etiqueta}</span>
      <input
        key={String(valor)}
        data-testid={testid}
        type={numerico ? "number" : "text"}
        step={paso}
        value={campo.value}
        onChange={campo.onChange}
        onBlur={campo.onBlur}
        onKeyDown={campo.onKeyDown}
        className="w-28 rounded border bg-background px-2 py-1 text-right"
      />
    </label>
  );
}
