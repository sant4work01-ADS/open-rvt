// OPEN-RVT (O006e): clasificación por ráfaga de la rueda y el touchpad del visor.
//
// Un touchpad de Windows puede mandar `deltaY` entero de 100 o 120, igual que una
// rueda. Por eso la decisión no se toma con un solo evento: se observa la ráfaga.
//   · Un delta fraccionario o con `deltaX` marca touchpad durante 60 s.
//   · Más de 3 eventos en menos de 40 ms con saltos pequeños también es touchpad.
//   · Una rueda real manda eventos sueltos, con delta >= 100 y > 30 ms entre sí.
// El último dispositivo detectado se guarda en localStorage; la preferencia del
// usuario («ratón» o «touchpad») manda sobre la detección.
import { create } from "zustand";

export type PreferenciaRueda = "auto" | "raton" | "touchpad";
export type DispositivoRueda = "raton" | "touchpad";
export type AccionRueda = "zoom" | "paneo" | "paneo-horizontal";

export interface EventoRueda {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** O006e: una fila del diagnóstico Ctrl+Shift+D. */
export interface RegistroRueda {
  ms: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  intervaloMs: number | null;
  dispositivo: DispositivoRueda;
  accion: AccionRueda;
}

const CLAVE = "openrvt.rueda";
const CLAVE_AYUDA = "openrvt.ayudaNavegacion";
const CLAVE_DETECTADO = "openrvt.rueda.dispositivo";
const VENTANA_TOUCHPAD_MS = 60_000;
const RAFAGA_MS = 40;
/** O017: el diagnóstico copia los últimos 50 eventos. */
const MAX_REGISTROS = 50;

function leerPreferencia(): PreferenciaRueda {
  try {
    const valor = localStorage.getItem(CLAVE);
    if (valor === "raton" || valor === "touchpad") return valor;
    // Migración de O006d: «zoom» y «paneo» eran preferencias de acción.
    if (valor === "zoom") return "raton";
    if (valor === "paneo") return "touchpad";
    return "auto";
  } catch {
    return "auto";
  }
}

function leerDetectado(): DispositivoRueda | null {
  try {
    const valor = localStorage.getItem(CLAVE_DETECTADO);
    return valor === "raton" || valor === "touchpad" ? valor : null;
  } catch {
    return null;
  }
}

function leerAyudaVisible(): boolean {
  try {
    return localStorage.getItem(CLAVE_AYUDA) !== "cerrada";
  } catch {
    return true;
  }
}

/**
 * O006e: detector con estado. `ahora` permite probar secuencias con tiempos
 * deterministas; en el visor se omite y se usa `Date.now()`.
 */
export class DetectorRueda {
  private detectado: DispositivoRueda | null;
  private touchpadHasta = 0;
  private ultimoMs: number | null = null;
  private rafaga = 0;
  private registros: RegistroRueda[] = [];

  constructor(detectado: DispositivoRueda | null = null) {
    this.detectado = detectado;
  }

  ultimoDispositivo(): DispositivoRueda | null {
    return this.detectado;
  }

  ultimos(): RegistroRueda[] {
    return [...this.registros];
  }

  private marcarTouchpad(ahora: number): void {
    this.detectado = "touchpad";
    this.touchpadHasta = ahora + VENTANA_TOUCHPAD_MS;
  }

  clasificar(
    evento: EventoRueda,
    preferencia: PreferenciaRueda = "auto",
    ahora = Date.now(),
  ): AccionRueda {
    const intervaloMs = this.ultimoMs === null ? null : ahora - this.ultimoMs;
    const dx = Math.abs(evento.deltaX);
    const dy = Math.abs(evento.deltaY);
    const enteros = Number.isInteger(evento.deltaX) && Number.isInteger(evento.deltaY);

    // Delta fraccionario o desplazamiento horizontal: touchpad inequívoco.
    if (!enteros || evento.deltaX !== 0) {
      this.marcarTouchpad(ahora);
    }

    // Ráfaga de eventos muy seguidos: un touchpad que imita saltos de rueda.
    if (intervaloMs !== null && intervaloMs < RAFAGA_MS && (dy < 50 || intervaloMs <= 12)) {
      this.rafaga += 1;
    } else {
      this.rafaga = 1;
    }
    if (this.rafaga > 3) this.marcarTouchpad(ahora);

    const vigenteTouchpad = this.touchpadHasta > ahora;
    // Rueda real: eventos sueltos, enteros, con delta grande y sin ráfaga.
    if (
      !vigenteTouchpad &&
      intervaloMs !== null &&
      intervaloMs >= 30 &&
      evento.deltaMode === 0 &&
      enteros &&
      evento.deltaX === 0 &&
      dy >= 100
    ) {
      this.detectado = "raton";
    }

    const dispositivo: DispositivoRueda =
      preferencia === "raton" || preferencia === "touchpad"
        ? preferencia
        : (this.detectado ?? "raton");

    let accion: AccionRueda;
    if (evento.ctrlKey) {
      accion = "zoom";
    } else if (evento.shiftKey) {
      accion = "paneo-horizontal";
    } else if (dispositivo === "touchpad") {
      accion = "paneo";
    } else {
      accion = dy === 0 && dx > 0 ? "paneo" : "zoom";
    }

    this.ultimoMs = ahora;
    this.registros.push({
      ms: ahora,
      deltaX: evento.deltaX,
      deltaY: evento.deltaY,
      deltaMode: evento.deltaMode,
      ctrlKey: evento.ctrlKey,
      shiftKey: evento.shiftKey,
      intervaloMs,
      dispositivo,
      accion,
    });
    if (this.registros.length > MAX_REGISTROS) {
      this.registros.splice(0, this.registros.length - MAX_REGISTROS);
    }
    return accion;
  }
}

export const detectorRueda = new DetectorRueda(leerDetectado());

/** Compatibilidad: clasifica un evento aislado con un detector nuevo. */
export function clasificarRueda(
  evento: EventoRueda,
  preferencia: PreferenciaRueda = "auto",
): AccionRueda {
  return new DetectorRueda().clasificar(evento, preferencia);
}

/** Factor de zoom de un `wheel`; el signo positivo acerca en la convención del visor. */
export function factorRueda(deltaY: number): number {
  return Math.pow(1.0018, deltaY);
}

/**
 * O017: factor del pellizco de touchpad. Windows manda `deltaY` fraccionario y
 * pequeño (±1–10), donde `factorRueda` apenas cambia; aquí cada unidad pesa más
 * y el evento se acota a [0,8; 1,25] para que un gesto brusco no salte.
 */
export function factorPellizco(deltaY: number): number {
  const factor = Math.pow(1.01, deltaY);
  return Math.min(1.25, Math.max(0.8, factor));
}

/**
 * O017: elige el factor del evento. Es pellizco cuando llega con Ctrl y el
 * dispositivo es touchpad, el delta no es entero o es menor que un salto de
 * rueda; una rueda real con Ctrl conserva el factor fino de siempre.
 */
export function factorZoomRueda(
  evento: EventoRueda,
  dispositivo: DispositivoRueda | null,
): number {
  const pellizco =
    evento.ctrlKey &&
    (dispositivo === "touchpad" ||
      !Number.isInteger(evento.deltaY) ||
      Math.abs(evento.deltaY) < 50);
  return pellizco ? factorPellizco(evento.deltaY) : factorRueda(evento.deltaY);
}

/** O017: texto plano (TSV) de los eventos para el botón «Copiar» del diagnóstico. */
export function textoDiagnosticoRueda(registros: RegistroRueda[]): string {
  const cabecera = [
    "#",
    "deltaX",
    "deltaY",
    "modo",
    "ctrl",
    "shift",
    "ms",
    "intervaloMs",
    "dispositivo",
    "accion",
  ].join("\t");
  const filas = registros.map((registro, indice) =>
    [
      indice + 1,
      registro.deltaX,
      registro.deltaY,
      registro.deltaMode,
      registro.ctrlKey ? "si" : "no",
      registro.shiftKey ? "si" : "no",
      registro.ms,
      registro.intervaloMs ?? "",
      registro.dispositivo,
      registro.accion,
    ].join("\t"),
  );
  return [cabecera, ...filas].join("\n");
}

interface EstadoRueda {
  preferencia: PreferenciaRueda;
  detectado: DispositivoRueda | null;
  ayudaVisible: boolean;
  fijarPreferencia: (preferencia: PreferenciaRueda) => void;
  fijarDetectado: (dispositivo: DispositivoRueda) => void;
  cerrarAyuda: () => void;
}

export const useRueda = create<EstadoRueda>((set, get) => ({
  preferencia: leerPreferencia(),
  detectado: leerDetectado(),
  ayudaVisible: leerAyudaVisible(),
  fijarPreferencia: (preferencia) => {
    try {
      localStorage.setItem(CLAVE, preferencia);
    } catch {
      /* sin almacenamiento disponible */
    }
    set({ preferencia });
  },
  fijarDetectado: (dispositivo) => {
    if (dispositivo === get().detectado) return;
    try {
      localStorage.setItem(CLAVE_DETECTADO, dispositivo);
    } catch {
      /* sin almacenamiento disponible */
    }
    set({ detectado: dispositivo });
  },
  cerrarAyuda: () => {
    try {
      localStorage.setItem(CLAVE_AYUDA, "cerrada");
    } catch {
      /* sin almacenamiento disponible */
    }
    set({ ayudaVisible: false });
  },
}));
