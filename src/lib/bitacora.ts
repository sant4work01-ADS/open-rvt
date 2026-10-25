// O006c: bitácora de la sesión. Cada evento es una línea JSON con `ts`, `sesion` y
// `tipo`; la interfaz los acumula, los manda por lotes a Rust cada segundo (y al
// instante cuando hay un error) y los muestra en el panel de Ayuda.
//
// Privacidad: nunca se guarda el contenido del IFC ni lo que se escribe en campos.
import { commands } from "./bindings";
import { ipc, ErrorIpc } from "./ipc";

export type TipoEvento =
  | "inicio"
  | "clic"
  | "tecla"
  | "herramienta"
  | "accion"
  | "resultado"
  | "aviso"
  | "error_ui"
  | "vista"
  | "nucleo_stderr";

export const TIPOS_EVENTO: readonly TipoEvento[] = [
  "inicio",
  "clic",
  "tecla",
  "herramienta",
  "accion",
  "resultado",
  "aviso",
  "error_ui",
  "vista",
  "nucleo_stderr",
];

export interface EventoBitacora {
  ts: string;
  sesion: string;
  tipo: TipoEvento;
  [campo: string]: unknown;
}

/** Eventos conservados en memoria para el panel (la app puede estar abierta horas). */
const MAX_MEMORIA = 5000;
const MAX_PARAMS = 2048;
const INTERVALO_ENVIO_MS = 1000;

let sesion = "";
let eventos: EventoBitacora[] = [];
let pendientes: EventoBitacora[] = [];
let temporizador: ReturnType<typeof setInterval> | null = null;
let enviando = false;
let iniciada = false;
const oyentes = new Set<(eventos: EventoBitacora[]) => void>();

function ahora(): string {
  return new Date().toISOString();
}

function sesionLocal(): string {
  const fecha = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return (
    `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}_` +
    `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}_` +
    `ui${fecha.getTime()}`
  );
}

/** Parámetros de una llamada al núcleo, truncados a 2 KB de JSON. */
export function truncarParams(params: unknown): unknown {
  try {
    const texto = JSON.stringify(params ?? {});
    if (texto.length <= MAX_PARAMS) return params ?? {};
    return {
      truncado: true,
      bytes: texto.length,
      texto: texto.slice(0, MAX_PARAMS),
    };
  } catch {
    return { truncado: true, texto: String(params).slice(0, MAX_PARAMS) };
  }
}

/** Resumen de una respuesta del núcleo para el evento `resultado`. */
export function resumenResultado(resultado: unknown): Record<string, unknown> {
  if (!resultado || typeof resultado !== "object") return { mensaje: String(resultado ?? "") };
  const datos = resultado as Record<string, unknown>;
  const resumen: Record<string, unknown> = {};
  for (const clave of ["creados", "modificados", "borrados"]) {
    if (Array.isArray(datos[clave])) resumen[clave] = datos[clave];
  }
  if (typeof datos.mensaje === "string") resumen.mensaje = datos.mensaje;
  return resumen;
}

/** Añade un evento al búfer y avisa al panel. */
export function agregarEvento(tipo: TipoEvento, datos: Record<string, unknown> = {}): EventoBitacora {
  const evento: EventoBitacora = {
    ts: ahora(),
    sesion: sesion || (sesion = sesionLocal()),
    tipo,
    ...datos,
  };
  eventos.push(evento);
  if (eventos.length > MAX_MEMORIA) eventos = eventos.slice(-MAX_MEMORIA);
  pendientes.push(evento);
  for (const oyente of oyentes) oyente(eventos);
  if (tipo === "error_ui") void vaciarBitacora();
  return evento;
}

/** Vacía el lote pendiente hacia Rust; si falla, los eventos se conservan. */
export async function vaciarBitacora(): Promise<void> {
  if (enviando || pendientes.length === 0) return;
  const lote = pendientes;
  pendientes = [];
  enviando = true;
  let exito = false;
  try {
    await commands.bitacoraAgregar(lote);
    exito = true;
  } catch {
    // Sin backend (pruebas en navegador) no hay dónde escribir; no se pierde el panel.
    pendientes = [...lote, ...pendientes];
  } finally {
    enviando = false;
    // Si llegó un error mientras se enviaba el lote, se escribe de inmediato.
    if (exito && pendientes.length > 0) void vaciarBitacora();
    else if (!exito && pendientes.length > 0 && !temporizador) {
      temporizador = setInterval(() => void vaciarBitacora(), INTERVALO_ENVIO_MS);
    }
  }
}

export function eventosBitacora(): EventoBitacora[] {
  return eventos;
}

export function suscribirBitacora(oyente: (eventos: EventoBitacora[]) => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Último evento de error con su traza (para «Copiar detalle»). */
export function ultimoErrorBitacora(): EventoBitacora | undefined {
  for (let i = eventos.length - 1; i >= 0; i -= 1) {
    const evento = eventos[i];
    if (
      evento.tipo === "error_ui" ||
      (evento.tipo === "resultado" && evento.ok === false) ||
      (evento.tipo === "aviso" && evento.nivel === "error")
    ) {
      return evento;
    }
  }
  return undefined;
}

// ——— Descripción de clics ———

function textoLimpio(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\s+/g, " ").trim();
}

/** Etiqueta estable del control: `data-testid`, `aria-label` o texto visible. */
export function etiquetaDeControl(elemento: Element): string {
  const testid = elemento.getAttribute("data-testid");
  if (testid) return testid;
  const aria = elemento.getAttribute("aria-label");
  if (aria) return aria;
  return textoLimpio(elemento.textContent).slice(0, 120);
}

/** Contexto del control: `ribbon>Modelar>Eje`, sin repetir etiquetas. */
export function rutaDeComponentes(elemento: Element, etiqueta = etiquetaDeControl(elemento)): string {
  const partes: string[] = [];
  const barraRibbon = document.querySelector('[role="tablist"]')?.parentElement;
  const enRibbon = Boolean(barraRibbon && barraRibbon.contains(elemento));
  if (enRibbon) {
    partes.push("ribbon");
    const pestana = document.querySelector('[role="tab"][aria-selected="true"]');
    const nombre = textoLimpio(pestana?.textContent);
    if (nombre) partes.push(nombre);
    const grupo = elemento.closest('[data-testid^="grupo-"]');
    const nombreGrupo = textoLimpio(grupo?.getAttribute("aria-label"));
    if (nombreGrupo) partes.push(nombreGrupo);
  } else {
    const ancestros: string[] = [];
    let actual = elemento.parentElement;
    for (let i = 0; actual && i < 8; i += 1) {
      const testid = actual.getAttribute("data-testid");
      const aria = actual.getAttribute("aria-label");
      if (testid && !testid.startsWith("cmd-")) ancestros.unshift(testid);
      else if (aria) ancestros.unshift(textoLimpio(aria));
      actual = actual.parentElement;
    }
    partes.push(...ancestros.slice(-2));
  }
  partes.push(etiqueta);
  return [...new Set(partes.filter(Boolean))].join(">");
}

/** Vista activa tal como la ve el usuario (módulo y vista de modelo). */
export function vistaActiva(): string {
  const modulo = document.querySelector('[data-modulo][aria-current="page"]');
  const vista = document.querySelector('[data-testid="vista-item"][aria-current="true"]');
  const partes = [textoLimpio(modulo?.getAttribute("aria-label")), textoLimpio(vista?.textContent)];
  return partes.filter(Boolean).join(" · ");
}

function controlInteractivo(objetivo: EventTarget | null): Element | null {
  if (!(objetivo instanceof Element)) return null;
  return objetivo.closest(
    'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], ' +
      'input[type="checkbox"], input[type="radio"], select, [role="switch"]',
  );
}

function alHacerClic(evento: MouseEvent) {
  const control = controlInteractivo(evento.target);
  if (!control) return;
  const etiqueta = etiquetaDeControl(control);
  agregarEvento("clic", {
    etiqueta,
    testid: control.getAttribute("data-testid") ?? null,
    aria: control.getAttribute("aria-label") ?? null,
    texto: textoLimpio(control.textContent).slice(0, 120) || null,
    ruta: rutaDeComponentes(control, etiqueta),
    vista: vistaActiva(),
  });
}

function enCampoDeTexto(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false;
  if (objetivo.isContentEditable) return true;
  if (objetivo.tagName === "TEXTAREA") return true;
  if (objetivo.tagName !== "INPUT") return false;
  return !["checkbox", "radio", "button", "range", "submit"].includes(
    (objetivo as HTMLInputElement).type,
  );
}

function combinacionDeTecla(evento: KeyboardEvent): string {
  const partes: string[] = [];
  if (evento.ctrlKey) partes.push("Ctrl");
  if (evento.metaKey) partes.push("Meta");
  if (evento.altKey) partes.push("Alt");
  if (evento.shiftKey) partes.push("Shift");
  partes.push(evento.key.length === 1 ? evento.key.toUpperCase() : evento.key);
  return partes.join("+");
}

function alTeclear(evento: KeyboardEvent) {
  if (enCampoDeTexto(evento.target)) return; // no se registra lo que se escribe
  if (["Shift", "Control", "Alt", "Meta"].includes(evento.key)) return;
  const conModificador = evento.ctrlKey || evento.metaKey || evento.altKey;
  const especial = ["Enter", "Escape", "Delete", "Backspace", " "].includes(evento.key);
  if (!conModificador && !especial) return;
  agregarEvento("tecla", {
    tecla: evento.key,
    combinacion: combinacionDeTecla(evento),
    vista: vistaActiva(),
  });
}

// ——— Envoltorio de llamadas al núcleo ———

let siguienteId = 1;

/**
 * Ejecuta `nucleoLlamar` registrando la `accion` y su `resultado`, con duración y, en
 * los errores, mensaje, código y traza de Python.
 */
export async function llamarConBitacora<T>(
  metodo: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const id = `n${siguienteId++}`;
  agregarEvento("accion", { id, metodo, params: truncarParams(params) });
  const inicio = performance.now();
  try {
    const resultado = await ipc.nucleoLlamar(metodo, params);
    agregarEvento("resultado", {
      id,
      ok: true,
      duracion_ms: Math.round(performance.now() - inicio),
      resumen: resumenResultado(resultado),
    });
    return resultado as T;
  } catch (error) {
    const detalle = error instanceof ErrorIpc ? error.detalle : undefined;
    agregarEvento("resultado", {
      id,
      ok: false,
      duracion_ms: Math.round(performance.now() - inicio),
      mensaje: error instanceof Error ? error.message : String(error),
      codigo: detalle?.codigo ?? null,
      traza: detalle?.traza ?? null,
    });
    void vaciarBitacora(); // un error se escribe de inmediato
    throw error;
  }
}

// ——— Herramientas, avisos y errores ———

export function bitacoraHerramienta(
  herramienta: string,
  paso: string,
  coordenadas?: { x: number; y: number },
) {
  agregarEvento("herramienta", {
    herramienta,
    paso,
    ...(coordenadas ? { x: coordenadas.x, y: coordenadas.y } : {}),
    vista: vistaActiva(),
  });
}

export function bitacoraAviso(texto: string, nivel: "info" | "error" = "info") {
  agregarEvento("aviso", { texto, nivel });
  if (nivel === "error") void vaciarBitacora();
}

export function bitacoraErrorUi(mensaje: string, pila?: string | null) {
  agregarEvento("error_ui", { mensaje, pila: pila ?? null });
}

export function bitacoraVista(nombre: string, rutaArchivo: string | null) {
  agregarEvento("vista", { nombre, ruta: rutaArchivo });
}

/** Texto completo de un error (con traza) para el portapapeles. */
export function textoDeDetalle(evento?: EventoBitacora): string {
  const elegido = evento ?? ultimoErrorBitacora();
  if (!elegido) return "No hay errores en la bitácora.";
  const lineas = [
    `[${elegido.tipo}] ${String(elegido.mensaje ?? elegido.texto ?? "")}`,
    elegido.codigo ? `Código: ${String(elegido.codigo)}` : "",
    elegido.metodo ? `Método: ${String(elegido.metodo)}` : "",
    elegido.pila ? `Pila:\n${String(elegido.pila)}` : "",
    elegido.traza ? `Traza:\n${String(elegido.traza)}` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}

// ——— Arranque y cierre ———

async function datosDelSistema(): Promise<Record<string, unknown>> {
  let version = "";
  let python = "";
  let ifcopenshell = "";
  try {
    const respuesta = await commands.versionApp();
    if (respuesta.status === "ok") version = String(respuesta.data);
  } catch {
    /* sin backend */
  }
  try {
    const datos = await llamarConBitacora<{
      disponible?: boolean;
      ifcopenshell?: string;
      python?: string;
    }>("nucleo.ping");
    python = datos.python ?? "";
    ifcopenshell = datos.disponible ? (datos.ifcopenshell ?? "") : "no disponible";
  } catch {
    python = "no disponible";
    ifcopenshell = "no disponible";
  }
  const pantalla =
    typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "desconocida";
  return {
    version: version || "desconocida",
    so: navigator.userAgent.includes("Windows")
      ? "windows"
      : navigator.userAgent.includes("Mac")
        ? "macos"
        : "linux",
    arquitectura: navigator.userAgent.includes("x86_64") ? "x86_64" : navigator.platform,
    python: python || "desconocida",
    ifcopenshell: ifcopenshell || "desconocido",
    idioma: document.documentElement.lang || navigator.language,
    pantalla,
  };
}

/** Arranca la sesión: id de Rust, evento `inicio`, listener global y envío por lotes. */
export function iniciarBitacora(): void {
  if (iniciada) return;
  iniciada = true;
  sesion = sesionLocal();
  if (typeof document !== "undefined") {
    document.addEventListener("click", alHacerClic, true);
    document.addEventListener("keydown", alTeclear, true);
  }
  if (typeof window !== "undefined") {
    const cerrar = () => void vaciarBitacora();
    window.addEventListener("beforeunload", cerrar);
    window.addEventListener("pagehide", cerrar);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") cerrar();
    });
  }
  temporizador = setInterval(() => void vaciarBitacora(), INTERVALO_ENVIO_MS);
  void (async () => {
    try {
      const respuesta = await commands.bitacoraSesion();
      if (respuesta.status === "ok" && respuesta.data.sesion) {
        sesion = String(respuesta.data.sesion);
      }
    } catch {
      /* sin backend */
    }
    agregarEvento("inicio", await datosDelSistema());
    await vaciarBitacora();
  })();
}

/** Solo pruebas: instala los listeners sin arrancar la sesión ni el backend. */
export function instalarEscuchasParaPruebas(): () => void {
  const clic = (evento: Event) => alHacerClic(evento as MouseEvent);
  const tecla = (evento: Event) => alTeclear(evento as KeyboardEvent);
  document.addEventListener("click", clic, true);
  document.addEventListener("keydown", tecla, true);
  return () => {
    document.removeEventListener("click", clic, true);
    document.removeEventListener("keydown", tecla, true);
  };
}

/** Solo pruebas: reinicia el estado del módulo. */
export function reiniciarBitacoraParaPruebas(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
  eventos = [];
  pendientes = [];
  oyentes.clear();
  iniciada = false;
  enviando = false;
  sesion = "prueba";
}
