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

/** O017b: evento crudo de la grabación del diagnóstico. */
export type TipoEventoGrabado =
  | "wheel"
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "touchstart"
  | "touchmove"
  | "touchend"
  | "keydown"
  | "keyup"
  /** O018: mensaje nativo de Windows, p. ej. `nativo:GID_ZOOM`. */
  | `nativo:${string}`;

export interface EventoGrabado {
  /** Milisegundos desde el inicio de la grabación. */
  t: number;
  tipo: TipoEventoGrabado;
  ctrlKey: boolean;
  shiftKey: boolean;
  key?: string;
  pointerType?: string;
  toques?: number;
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  accion?: AccionRueda;
  dispositivo?: DispositivoRueda;
  /** Escala de la cámara antes y después de aplicar un zoom. */
  escalaAntes?: number;
  escalaDespues?: number;
  factor?: number;
  /** O018: ventana que entregó el gesto nativo. */
  ventana?: string;
  /** O018: carga útil nativa (ullArguments, delta, pointerId…). */
  detalle?: unknown;
}

export interface ResumenGrupo {
  cantidad: number;
  /** Porcentaje (0–100) de eventos con Ctrl. */
  pctCtrl: number;
  deltaMode: number | null;
  deltaYMin: number | null;
  deltaYMax: number | null;
  deltaYMedia: number | null;
  /** Porcentaje de ruedas con deltaY no entero. */
  pctFraccionarios: number | null;
  intervaloMedioMs: number | null;
}

export interface ResumenGrabacion {
  total: number;
  duracionMs: number;
  porTipo: Record<string, ResumenGrupo>;
  porAccion: Partial<Record<AccionRueda, ResumenGrupo>>;
  zoom: {
    eventos: number;
    productoFactores: number;
    escalaInicial: number | null;
    escalaFinal: number | null;
  };
  /** O018: cantidad de gestos nativos por mensaje y por ventana. */
  nativos: {
    porMensaje: Record<string, number>;
    porVentana: Record<string, number>;
  };
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
  if (!pellizco) return factorRueda(evento.deltaY);
  // O017b: un gesto de dos dedos con Ctrl puede llegar solo con deltaX, y los
  // deltas verticales reales rondan 0,5: con 1,01^0,5 veinte eventos no llegan al
  // 10 %. Se usa el eje que traiga movimiento y un paso mínimo de 0,75 por evento.
  const crudo = evento.deltaY !== 0 ? evento.deltaY : evento.deltaX;
  const delta = crudo === 0 ? 0 : Math.sign(crudo) * Math.max(Math.abs(crudo), 0.75);
  return factorPellizco(delta);
}

function resumirGrupo(eventos: EventoGrabado[]): ResumenGrupo {
  const cantidad = eventos.length;
  const ruedas = eventos.filter((evento) => evento.tipo === "wheel");
  const deltas = ruedas.map((evento) => evento.deltaY ?? 0);
  const modos = [...new Set(ruedas.map((evento) => evento.deltaMode ?? 0))];
  const intervalos = eventos
    .slice(1)
    .map((evento, indice) => evento.t - eventos[indice].t);
  return {
    cantidad,
    pctCtrl: cantidad === 0 ? 0 : (eventos.filter((e) => e.ctrlKey).length / cantidad) * 100,
    deltaMode: ruedas.length === 0 ? null : modos.length === 1 ? modos[0] : null,
    deltaYMin: deltas.length === 0 ? null : Math.min(...deltas),
    deltaYMax: deltas.length === 0 ? null : Math.max(...deltas),
    deltaYMedia:
      deltas.length === 0 ? null : deltas.reduce((suma, d) => suma + d, 0) / deltas.length,
    pctFraccionarios:
      ruedas.length === 0
        ? null
        : (ruedas.filter((e) => !Number.isInteger(e.deltaY ?? 0)).length / ruedas.length) * 100,
    intervaloMedioMs:
      intervalos.length === 0
        ? null
        : intervalos.reduce((suma, i) => suma + i, 0) / intervalos.length,
  };
}

/**
 * O017b: resume una grabación por tipo y por acción, y aparte el zoom, donde se
 * ve si la escala de la cámara cambió de verdad entre `alRodar` y después.
 */
export function resumirGrabacion(eventos: EventoGrabado[]): ResumenGrabacion {
  const porTipo: Record<string, ResumenGrupo> = {};
  const porAccion: Partial<Record<AccionRueda, ResumenGrupo>> = {};
  const tipos = [...new Set(eventos.map((evento) => evento.tipo))];
  for (const tipo of tipos) {
    porTipo[tipo] = resumirGrupo(eventos.filter((evento) => evento.tipo === tipo));
  }
  const acciones = [...new Set(eventos.flatMap((e) => (e.accion ? [e.accion] : [])))];
  for (const accion of acciones) {
    porAccion[accion] = resumirGrupo(eventos.filter((evento) => evento.accion === accion));
  }
  const zooms = eventos.filter(
    (evento) => evento.accion === "zoom" && typeof evento.factor === "number",
  );
  const conEscalaAntes = zooms.filter((evento) => typeof evento.escalaAntes === "number");
  const conEscalaDespues = [...zooms]
    .reverse()
    .find((evento) => typeof evento.escalaDespues === "number");
  const nativos = eventos.filter((evento) => evento.tipo.startsWith("nativo:"));
  const porMensaje: Record<string, number> = {};
  const porVentana: Record<string, number> = {};
  for (const evento of nativos) {
    const mensaje = evento.tipo.slice("nativo:".length);
    porMensaje[mensaje] = (porMensaje[mensaje] ?? 0) + 1;
    const ventana = evento.ventana ?? "desconocida";
    porVentana[ventana] = (porVentana[ventana] ?? 0) + 1;
  }
  return {
    total: eventos.length,
    duracionMs: eventos.length < 2 ? 0 : eventos[eventos.length - 1].t - eventos[0].t,
    porTipo,
    porAccion,
    zoom: {
      eventos: zooms.length,
      productoFactores: zooms.reduce((producto, evento) => producto * (evento.factor ?? 1), 1),
      escalaInicial: conEscalaAntes[0]?.escalaAntes ?? null,
      escalaFinal: conEscalaDespues?.escalaDespues ?? null,
    },
    nativos: { porMensaje, porVentana },
  };
}

/** O017b: resumen en texto para el botón «Copiar resumen». */
export function textoResumenGrabacion(resumen: ResumenGrabacion): string {
  const lineas = [
    `Eventos: ${resumen.total} · duración: ${Math.round(resumen.duracionMs)} ms`,
  ];
  for (const [tipo, grupo] of Object.entries(resumen.porTipo)) {
    lineas.push(
      `tipo ${tipo}: ${grupo.cantidad} · ctrl ${grupo.pctCtrl.toFixed(1)} %` +
        (grupo.deltaYMedia === null ? "" : ` · deltaY media ${grupo.deltaYMedia}`) +
        (grupo.intervaloMedioMs === null
          ? ""
          : ` · intervalo ${grupo.intervaloMedioMs.toFixed(1)} ms`),
    );
  }
  for (const [accion, grupo] of Object.entries(resumen.porAccion)) {
    lineas.push(
      `acción ${accion}: ${grupo.cantidad} · ctrl ${grupo.pctCtrl.toFixed(1)} %` +
        (grupo.deltaMode === null ? "" : ` · deltaMode ${grupo.deltaMode}`) +
        (grupo.pctFraccionarios === null
          ? ""
          : ` · fraccionarios ${grupo.pctFraccionarios.toFixed(1)} %`),
    );
  }
  lineas.push(
    `zoom: ${resumen.zoom.eventos} eventos · producto ${Number(resumen.zoom.productoFactores.toFixed(6))}` +
      ` · escala ${resumen.zoom.escalaInicial ?? "—"} → ${resumen.zoom.escalaFinal ?? "—"}`,
  );
  for (const [mensaje, cantidad] of Object.entries(resumen.nativos.porMensaje)) {
    lineas.push(`nativo ${mensaje}: ${cantidad}`);
  }
  for (const [ventana, cantidad] of Object.entries(resumen.nativos.porVentana)) {
    lineas.push(`ventana ${ventana}: ${cantidad}`);
  }
  return lineas.join("\n");
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
