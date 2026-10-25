// OPEN-RVT (O006a): cotas de ejes automáticas y derivadas. No se guardan en el IFC:
// se calculan de `ejes_listar` en cada planta, agrupando las familias de ejes
// paralelos. El visor solo dibuja lo que devuelve este módulo.
import type { EjeReferencia } from "./herramientas";

export interface CotaLinea {
  tipo: "parcial" | "total" | "rebase";
  /** Eje de referencia (izquierda o inferior). */
  referencia: string;
  /** Eje que se movería al editar (derecha o superior). */
  mover: string;
  valor: number;
  /** Solo las parciales y el rebase se editan; la total es de lectura. */
  editable: boolean;
  /** Proyecciones sobre la normal de la familia (m). */
  desde: number;
  hasta: number;
}

export interface FamiliaCotas {
  /** Dirección unitaria de los ejes de la familia. */
  direccion: [number, number];
  /** Normal unitaria usada para ordenar y medir. */
  normal: [number, number];
  /** Coordenada del extremo de las burbujas sobre `direccion`. */
  bordeBurbujas: number;
  /** Ejes de la familia, ordenados de izquierda a derecha o de abajo arriba. */
  ejes: EjeReferencia[];
  parciales: CotaLinea[];
  total: CotaLinea | null;
  /** O006d: cota del rebase desde el eje opuesto extremo hasta la punta. */
  rebase: CotaLinea | null;
  /** O006d: familia perpendicular con la que se mide el rebase. */
  opuesta: boolean;
}

const TOLERANCIA_PARALELO = 1e-6;

function normalizar(x: number, y: number): [number, number] {
  const largo = Math.hypot(x, y);
  return largo > 1e-12 ? [x / largo + 0, y / largo + 0] : [0, 1];
}

function proyeccion(eje: EjeReferencia, n: [number, number]): number {
  return eje.x1 * n[0] + eje.y1 * n[1];
}

function cota(
  tipo: "parcial" | "total",
  referencia: EjeReferencia,
  mover: EjeReferencia,
  desde: number,
  hasta: number,
): CotaLinea {
  return {
    tipo,
    referencia: referencia.globalid,
    mover: mover.globalid,
    valor: Math.abs(hasta - desde),
    editable: tipo === "parcial",
    desde,
    hasta,
  };
}

/**
 * Agrupa los ejes en familias paralelas y arma la cadena de parciales y la cota
 * total de cada familia. Con un solo eje no hay cotas; con un único tramo parcial
 * tampoco hay total (repetiría la parcial).
 */
export function calcularFamiliasCotas(
  ejes: EjeReferencia[],
  reticula?: { modo: "origen" | "rebase"; rebase: number },
): FamiliaCotas[] {
  const familias: Array<{ direccion: [number, number]; ejes: EjeReferencia[] }> = [];
  for (const eje of ejes) {
    const dx = eje.x2 - eje.x1;
    const dy = eje.y2 - eje.y1;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const u = normalizar(dx, dy);
    const familia = familias.find(
      (f) => Math.abs(f.direccion[0] * u[1] - f.direccion[1] * u[0]) <= TOLERANCIA_PARALELO,
    );
    if (familia) familia.ejes.push(eje);
    else familias.push({ direccion: u, ejes: [eje] });
  }

  return familias.map((familia) => {
    let normal: [number, number] = [-familia.direccion[1] + 0, familia.direccion[0] + 0];
    // La normal mira siempre hacia +X o +Y para que el orden sea el de dibujo.
    if (normal[0] < -1e-9 || (Math.abs(normal[0]) <= 1e-9 && normal[1] < 0)) {
      normal = [-normal[0] + 0, -normal[1] + 0];
    }
    const ordenados = [...familia.ejes].sort((a, b) => proyeccion(a, normal) - proyeccion(b, normal));
    const bordeBurbujas = Math.max(
      ...familia.ejes.map(
        (eje) => eje.x2 * familia.direccion[0] + eje.y2 * familia.direccion[1],
      ),
    );
    const parciales: CotaLinea[] = [];
    for (let i = 0; i + 1 < ordenados.length; i += 1) {
      parciales.push(
        cota(
          "parcial",
          ordenados[i],
          ordenados[i + 1],
          proyeccion(ordenados[i], normal),
          proyeccion(ordenados[i + 1], normal),
        ),
      );
    }
    // La cota total solo aporta información con dos o más tramos parciales; con uno
    // solo repetiría la misma medida.
    const total =
      parciales.length >= 2
        ? cota(
            "total",
            ordenados[0],
            ordenados[ordenados.length - 1],
            proyeccion(ordenados[0], normal),
            proyeccion(ordenados[ordenados.length - 1], normal),
          )
        : null;
    // O006d: el rebase se mide desde el eje opuesto más extremo hasta la punta.
    let rebase: CotaLinea | null = null;
    let opuesta = false;
    const contraria = familias.find(
      (f) => Math.abs(f.direccion[0] * familia.direccion[1] - f.direccion[1] * familia.direccion[0]) > 0.5,
    );
    if (reticula?.modo === "rebase" && contraria) {
      opuesta = true;
      const proyeccionDirFin = (eje: EjeReferencia) =>
        eje.x2 * familia.direccion[0] + eje.y2 * familia.direccion[1];
      const desde = Math.max(...contraria.ejes.map(proyeccionDirFin));
      const hasta = Math.max(...familia.ejes.map(proyeccionDirFin));
      if (hasta - desde > 1e-6) {
        const referencia = contraria.ejes.reduce((a, b) =>
          proyeccionDirFin(a) >= proyeccionDirFin(b) ? a : b,
        );
        rebase = {
          tipo: "rebase",
          referencia: referencia.globalid,
          mover: referencia.globalid,
          valor: hasta - desde,
          editable: true,
          desde,
          hasta,
        };
      }
    }
    return {
      direccion: familia.direccion,
      normal,
      bordeBurbujas,
      ejes: ordenados,
      parciales,
      total,
      rebase,
      opuesta,
    };
  });
}

/** Formato de cota: metros con dos decimales, sin unidad («4.50»). */
export function formatearCota(valor: number): string {
  return valor.toFixed(2);
}

/**
 * Acepta «4.5», «4,5» y «450cm». Devuelve metros o `null` si no es un número
 * positivo. No usa `parseFloat` con texto suelto para no aceptar «4.5.6».
 */
export function parsearCota(texto: string): number | null {
  let limpio = (texto ?? "").trim().toLocaleLowerCase("es").replace(/\s+/g, "");
  if (!limpio) return null;
  let factor = 1;
  if (limpio.endsWith("cm")) {
    factor = 0.01;
    limpio = limpio.slice(0, -2);
  } else if (limpio.endsWith("m")) {
    limpio = limpio.slice(0, -1);
  }
  limpio = limpio.replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(limpio)) return null;
  const valor = Number(limpio) * factor;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return Math.round(valor * 1e6) / 1e6;
}

/** La cota total solo se lee; nunca se edita. */
export function cotaEditable(cota: CotaLinea): boolean {
  return (cota.tipo === "parcial" || cota.tipo === "rebase") && cota.editable;
}

/**
 * O006b: coloca el texto de una cota sobre su línea. Si el ancho del texto más la
 * marca no cabe entre las dos marcas, se saca afuera del tramo (pegado a la marca
 * derecha) para no encimarse; el visor dibuja entonces la línea guía.
 */
export function posicionTextoEntreMarcas(
  desde: number,
  hasta: number,
  ancho: number,
  marca: number,
): { centro: number; fuera: boolean } {
  if (ancho + marca <= Math.abs(hasta - desde)) {
    return { centro: (desde + hasta) / 2, fuera: false };
  }
  const borde = Math.max(desde, hasta);
  return { centro: borde + ancho / 2 + marca, fuera: true };
}

/** Elección de la casilla «Mover los siguientes», recordada durante la sesión. */
let moverSiguientes = true;

export function moverSiguientesCotas(): boolean {
  return moverSiguientes;
}

export function fijarMoverSiguientesCotas(valor: boolean): void {
  moverSiguientes = valor;
}
