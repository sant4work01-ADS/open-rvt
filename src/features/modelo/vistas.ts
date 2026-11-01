// OPEN-RVT: matemática pura de las vistas. Se separa del visor para poder probarla
// sin WebGL: cámaras de alzados/iso/perspectiva, creación automática de vistas y el
// JSON que se guarda en el pset OPENRVT_Vistas del IfcProject.
import {
  CATEGORIAS_TODAS,
  type Caja,
  type Categoria,
  type CategoriasVisibles,
  type ElementoMalla,
  type EscalaVista,
  type EstiloVista,
  type Nivel,
  type Orientacion,
  type TipoVista,
  type Vista,
  type AjusteEjeVista,
} from "./tipos";
import type { EstiloCategoriaVista } from "./estilos";
import type { EjeReferencia } from "./herramientas";
import { normalizarAjusteEje } from "./ejesVista";
import { normalizarAjusteNivel } from "./niveles";

export type Vector3 = [number, number, number];

export interface CamaraOrtografica {
  posicion: Vector3;
  objetivo: Vector3;
  arriba: Vector3;
  /** Eje +X de la pantalla en coordenadas del mundo. */
  ejeDerecha: Vector3;
  izquierda: number;
  derecha: number;
  abajo: number;
  arribaPlano: number;
  cerca: number;
  lejos: number;
  /** Dimensiones que debe abarcar la cámara (sin el margen). */
  ancho: number;
  alto: number;
}

export interface CamaraPerspectiva {
  posicion: Vector3;
  objetivo: Vector3;
  arriba: Vector3;
  fov: number;
  cerca: number;
  lejos: number;
  distancia: number;
}

const sumar = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const restar = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const escalar = (a: Vector3, k: number): Vector3 => [a[0] * k, a[1] * k, a[2] * k];
const punto = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cruz = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalizar = (a: Vector3): Vector3 => {
  const largo = Math.hypot(a[0], a[1], a[2]);
  return largo > 1e-12 ? escalar(a, 1 / largo) : [0, 0, 1];
};

/**
 * El IFC usa +Z arriba y el norte del proyecto en +Y (el `TrueNorth` por omisión es
 * (0, 1)). En planta mirando desde +Z, `arriba = +Y` deja el norte arriba y +X a la
 * derecha.
 */
export const ARRIBA_IFC: Vector3 = [0, 0, 1];

/** Arriba de la pantalla en planta: el norte del proyecto (+Y). */
export const ARRIBA_PLANTA: Vector3 = [0, 1, 0];

/** Dirección desde el modelo hacia la cámara de cada alzado. */
export function direccionAlzado(orientacion: Orientacion): Vector3 {
  switch (orientacion) {
    case "norte":
      // Observador al norte (+Y) mirando hacia −Y: +X queda a la izquierda.
      return [0, 1, 0];
    case "sur":
      // Observador al sur (−Y) mirando hacia +Y: +X queda a la derecha.
      return [0, -1, 0];
    case "este":
      return [1, 0, 0];
    case "oeste":
      return [-1, 0, 0];
  }
}

/** Isométrica: 35.26° de elevación (atan(1/√2)) y 45° de azimut. */
export function vectorIso(): Vector3 {
  const elevacion = Math.atan(1 / Math.SQRT2);
  return [Math.cos(elevacion) * Math.cos(Math.PI / 4), Math.cos(elevacion) * Math.sin(Math.PI / 4), Math.sin(elevacion)];
}

/** Perspectiva por defecto: desde el sureste, mirando al noroeste. */
export function vectorPerspectiva(): Vector3 {
  return normalizar([1, -1, 0.65]);
}

export function centroCaja(caja: Caja): Vector3 {
  return [
    (caja.min[0] + caja.max[0]) / 2,
    (caja.min[1] + caja.max[1]) / 2,
    (caja.min[2] + caja.max[2]) / 2,
  ];
}

export function tamanoCaja(caja: Caja): Vector3 {
  return [
    Math.max(caja.max[0] - caja.min[0], 0),
    Math.max(caja.max[1] - caja.min[1], 0),
    Math.max(caja.max[2] - caja.min[2], 0),
  ];
}

export function diagonalCaja(caja: Caja): number {
  const t = tamanoCaja(caja);
  return Math.hypot(t[0], t[1], t[2]);
}

export function esquinasCaja(caja: Caja): Vector3[] {
  const salida: Vector3[] = [];
  for (const x of [caja.min[0], caja.max[0]]) {
    for (const y of [caja.min[1], caja.max[1]]) {
      for (const z of [caja.min[2], caja.max[2]]) salida.push([x, y, z]);
    }
  }
  return salida;
}

/**
 * Cámara ortográfica que encuadra la caja envolvente desde `direccion` (vector del
 * modelo a la cámara). `arriba` fija la orientación de la pantalla; en planta se usa
 * (0, 1, 0) para que el norte del IFC (+Y) quede arriba y +X a la derecha.
 */
export function camaraOrtografica(
  caja: Caja,
  direccion: Vector3,
  opciones: { arriba?: Vector3; centro?: Vector3 } = {},
): CamaraOrtografica {
  const dir = normalizar(direccion);
  const arriba = normalizar(opciones.arriba ?? ARRIBA_IFC);
  const centro = opciones.centro ?? centroCaja(caja);
  // Convención de three.js: `dir` es el vector del objetivo a la cámara (atrás);
  // derecha = arriba × atrás y el arriba real = atrás × derecha.
  let derecha = normalizar(cruz(arriba, dir));
  if (Math.hypot(...derecha) < 1e-6) derecha = [1, 0, 0];
  const arribaReal = normalizar(cruz(dir, derecha));

  let minD = Infinity;
  let maxD = -Infinity;
  let minA = Infinity;
  let maxA = -Infinity;
  for (const esquina of esquinasCaja(caja)) {
    const relativo = restar(esquina, centro);
    const d = punto(relativo, derecha);
    const a = punto(relativo, arribaReal);
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
  }
  const ancho = Math.max(maxD - minD, 1);
  const alto = Math.max(maxA - minA, 1);
  const radio = Math.max(diagonalCaja(caja) / 2, 1);
  const distancia = radio * 3 + 1;
  const margen = 1.06;
  return {
    posicion: sumar(centro, escalar(dir, distancia)),
    objetivo: centro,
    arriba: arribaReal,
    ejeDerecha: derecha,
    izquierda: (-ancho / 2) * margen,
    derecha: (ancho / 2) * margen,
    abajo: (-alto / 2) * margen,
    arribaPlano: (alto / 2) * margen,
    cerca: 0.01,
    lejos: distancia + radio * 3 + 1,
    ancho,
    alto,
  };
}

/**
 * Ajusta los límites de una cámara ortográfica al aspecto real del lienzo, sin
 * recortar el modelo. Devuelve los límites que hay que asignar a la cámara.
 */
export function ajustarAspecto(
  camara: CamaraOrtografica,
  aspecto: number,
): { izquierda: number; derecha: number; abajo: number; arriba: number } {
  let ancho = camara.derecha - camara.izquierda;
  let alto = camara.arribaPlano - camara.abajo;
  const actual = ancho / alto;
  const objetivo = Number.isFinite(aspecto) && aspecto > 0 ? aspecto : 1;
  if (objetivo > actual) ancho = alto * objetivo;
  else alto = ancho / objetivo;
  return { izquierda: -ancho / 2, derecha: ancho / 2, abajo: -alto / 2, arriba: alto / 2 };
}

/** Cámara en perspectiva de 50° que encuadra la caja envolvente. */
export function camaraPerspectiva(
  caja: Caja,
  opciones: { direccion?: Vector3; fov?: number; aspecto?: number } = {},
): CamaraPerspectiva {
  const dir = normalizar(opciones.direccion ?? vectorPerspectiva());
  const fov = opciones.fov ?? 50;
  const centro = centroCaja(caja);
  const radio = Math.max(diagonalCaja(caja) / 2, 1);
  const aspecto = opciones.aspecto && opciones.aspecto > 0 ? opciones.aspecto : 1;
  const vertical = (fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspecto);
  const apertura = Math.min(vertical, horizontal);
  const distancia = (radio / Math.sin(apertura / 2)) * 1.15;
  return {
    posicion: sumar(centro, escalar(dir, distancia)),
    objetivo: centro,
    arriba: ARRIBA_IFC,
    fov,
    cerca: 0.05,
    lejos: distancia + radio * 4 + 1,
    distancia,
  };
}

/** Caja envolvente de las mallas ya decodificadas. */
export function cajaDeMallas(mallas: ElementoMalla[]): Caja {
  if (mallas.length === 0) return { min: [-1, -1, -1], max: [1, 1, 1] };
  const min: Vector3 = [Infinity, Infinity, Infinity];
  const max: Vector3 = [-Infinity, -Infinity, -Infinity];
  for (const malla of mallas) {
    for (let i = 0; i + 2 < malla.vertices.length; i += 3) {
      for (let eje = 0; eje < 3; eje += 1) {
        const valor = malla.vertices[i + eje];
        if (valor < min[eje]) min[eje] = valor;
        if (valor > max[eje]) max[eje] = valor;
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [-1, -1, -1], max: [1, 1, 1] };
  return { min, max };
}

/**
 * O005c: caja de encuadre que incluye los ejes. Sin esto, en un modelo recién creado
 * la cámara sigue encuadrando el cubo vacío y las burbujas quedan fuera de la planta.
 */
export function cajaConEjes(caja: Caja, ejes: EjeReferencia[]): Caja {
  if (ejes.length === 0) return caja;
  const min: Vector3 = [...caja.min];
  const max: Vector3 = [...caja.max];
  for (const eje of ejes) {
    min[0] = Math.min(min[0], eje.x1, eje.x2);
    min[1] = Math.min(min[1], eje.y1, eje.y2);
    max[0] = Math.max(max[0], eje.x1, eje.x2);
    max[1] = Math.max(max[1], eje.y1, eje.y2);
  }
  // Margen para las burbujas y sus etiquetas.
  const margen = Math.max(0.6, (max[0] - min[0] + max[1] - min[1]) * 0.04);
  return {
    min: [min[0] - margen, min[1] - margen, min[2]],
    max: [max[0] + margen, max[1] + margen, max[2]],
  };
}

/** Crea las vistas que la aplicación muestra al abrir un modelo. */
export function crearVistas(niveles: Nivel[]): Vista[] {
  const categorias = CATEGORIAS_TODAS();
  const idsNiveles = niveles.map((n) => n.globalid);
  const vistas: Vista[] = [];

  const ordenados = [...niveles].sort((a, b) => a.elevacion - b.elevacion);
  ordenados.forEach((nivel, i) => {
    const inferior = i > 0 ? ordenados[i - 1].elevacion : nivel.elevacion - 1;
    vistas.push({
      id: `planta-${nivel.globalid}`,
      nombre: `Planta ${nivel.nombre}`,
      tipo: "planta",
      nivel: nivel.globalid,
      alturaPlano: nivel.elevacion + 1.2,
      profundidad: inferior,
      // O005b: una planta nueva muestra solo su nivel; el resto se desmarca.
      nivelesVisibles: [nivel.globalid],
      categorias: { ...categorias },
      estilo: "lineas-ocultas",
      escala: 100,
      alturaArriba: 3,
      cotasEjes: true,
    });
  });

  (["norte", "sur", "este", "oeste"] as Orientacion[]).forEach((orientacion) => {
    const nombre = orientacion[0].toUpperCase() + orientacion.slice(1);
    vistas.push({
      id: `alzado-${orientacion}`,
      nombre: `Alzado ${nombre}`,
      tipo: "alzado",
      orientacion,
      nivelesVisibles: [...idsNiveles],
      categorias: { ...categorias },
      estilo: "lineas-ocultas",
      escala: 100,
    });
  });

  vistas.push({
    id: "iso",
    nombre: "3D Isométrica",
    tipo: "iso",
    nivelesVisibles: [...idsNiveles],
    categorias: { ...categorias },
    estilo: "aristas",
    escala: 100,
  });
  vistas.push({
    id: "perspectiva",
    nombre: "3D Perspectiva",
    tipo: "perspectiva",
    nivelesVisibles: [...idsNiveles],
    categorias: { ...categorias },
    estilo: "sombreado",
    escala: 100,
  });
  return vistas;
}

/** Vista de corte a partir de dos puntos tomados en una planta. */
export function crearVistaCorte(datos: {
  puntoA: [number, number];
  puntoB: [number, number];
  alturaPlano: number;
  nivelesVisibles: string[];
  categorias?: CategoriasVisibles;
  estilo?: EstiloVista;
  escala?: EscalaVista;
  indice?: number;
  /** Se conserva para que la cámara sepa de qué planta se tomó. */
  nivel?: string;
}): Vista {
  const dx = datos.puntoB[0] - datos.puntoA[0];
  const dy = datos.puntoB[1] - datos.puntoA[1];
  const largo = Math.hypot(dx, dy);
  if (largo < 1e-6) throw new Error("Los dos puntos del corte no pueden coincidir.");
  // Normal a la traza: la mirada del corte es perpendicular a la línea.
  const direccion: [number, number] = [-dy / largo, dx / largo];
  const numero = datos.indice ?? 1;
  return {
    id: `corte-${Date.now()}-${numero}`,
    nombre: `Corte ${numero}`,
    tipo: "corte",
    nivel: datos.nivel,
    alturaPlano: datos.alturaPlano,
    puntoA: [datos.puntoA[0], datos.puntoA[1]],
    puntoB: [datos.puntoB[0], datos.puntoB[1]],
    direccion,
    profundidad: 10,
    nivelesVisibles: [...datos.nivelesVisibles],
    categorias: { ...(datos.categorias ?? CATEGORIAS_TODAS()) },
    estilo: datos.estilo ?? "lineas-ocultas",
    escala: datos.escala ?? 100,
  };
}

const CATEGORIAS_VALIDAS = new Set<Categoria>([
  "muros",
  "losas",
  "columnas",
  "vigas",
  "puertas",
  "ventanas",
  "cubiertas",
  "escaleras",
  "otros",
]);

const TIPOS: TipoVista[] = ["planta", "alzado", "corte", "iso", "perspectiva"];
const ESTILOS_VALIDOS: EstiloVista[] = ["sombreado", "aristas", "lineas-ocultas"];
const ESCALAS_VALIDAS: EscalaVista[] = [20, 50, 100, 200];

/** Completa y valida una vista leída del pset. Devuelve `null` si no es utilizable. */
export function normalizarVista(valor: unknown): Vista | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  const tipo = TIPOS.includes(v.tipo as TipoVista) ? (v.tipo as TipoVista) : null;
  if (!tipo) return null;
  const categorias = { ...CATEGORIAS_TODAS() };
  if (v.categorias && typeof v.categorias === "object") {
    for (const [clave, activo] of Object.entries(v.categorias as Record<string, unknown>)) {
      if (CATEGORIAS_VALIDAS.has(clave as Categoria)) {
        categorias[clave as Categoria] = Boolean(activo);
      }
    }
  }
  const estilo = ESTILOS_VALIDOS.includes(v.estilo as EstiloVista)
    ? (v.estilo as EstiloVista)
    : "sombreado";
  const escala = ESCALAS_VALIDAS.includes(v.escala as EscalaVista)
    ? (v.escala as EscalaVista)
    : 100;
  const orientaciones: Orientacion[] = ["norte", "sur", "este", "oeste"];
  const orientacion = orientaciones.includes(v.orientacion as Orientacion)
    ? (v.orientacion as Orientacion)
    : undefined;
  const puntoA = Array.isArray(v.puntoA) && v.puntoA.length === 2
    ? ([Number(v.puntoA[0]), Number(v.puntoA[1])] as [number, number])
    : undefined;
  const puntoB = Array.isArray(v.puntoB) && v.puntoB.length === 2
    ? ([Number(v.puntoB[0]), Number(v.puntoB[1])] as [number, number])
    : undefined;
  const direccion = Array.isArray(v.direccion) && v.direccion.length === 2
    ? ([Number(v.direccion[0]), Number(v.direccion[1])] as [number, number])
    : undefined;
  const estilos: Partial<Record<Categoria, EstiloCategoriaVista>> = {};
  if (v.estilos && typeof v.estilos === "object") {
    for (const [clave, valor] of Object.entries(v.estilos as Record<string, unknown>)) {
      if (!CATEGORIAS_VALIDAS.has(clave as Categoria) || !valor || typeof valor !== "object") continue;
      const e = valor as Record<string, unknown>;
      const cambio: EstiloCategoriaVista = {};
      if (typeof e.oculta === "boolean") cambio.oculta = e.oculta;
      if (e.corte === null) cambio.corte = null;
      else if (typeof e.corte === "number" && Number.isFinite(e.corte)) cambio.corte = e.corte;
      if (typeof e.proyeccion === "number" && Number.isFinite(e.proyeccion)) {
        cambio.proyeccion = e.proyeccion;
      }
      estilos[clave as Categoria] = cambio;
    }
  }
  // O011: los ajustes de eje son datos de la vista y pasan por la misma validación
  // que el resto (máximo dos codos por extremo, puntos finitos).
  const ejes: Record<string, AjusteEjeVista> = {};
  if (v.ejes && typeof v.ejes === "object") {
    for (const [globalid, crudo] of Object.entries(v.ejes as Record<string, unknown>)) {
      if (!globalid) continue;
      const ajuste = normalizarAjusteEje(crudo as AjusteEjeVista);
      if (ajuste) ejes[globalid] = ajuste;
    }
  }
  // O014b: desplazamientos manuales de las cabezas de nivel de esta vista.
  const nivelesAjuste: Record<string, { desplazamiento: number }> = {};
  if (v.nivelesAjuste && typeof v.nivelesAjuste === "object") {
    for (const [globalid, crudo] of Object.entries(v.nivelesAjuste as Record<string, unknown>)) {
      if (!globalid) continue;
      const ajuste = normalizarAjusteNivel(crudo);
      if (ajuste) nivelesAjuste[globalid] = ajuste;
    }
  }
  return {
    id: typeof v.id === "string" && v.id ? v.id : `vista-${Math.random().toString(36).slice(2)}`,
    nombre: typeof v.nombre === "string" && v.nombre ? v.nombre : "Vista",
    tipo,
    nivel: typeof v.nivel === "string" ? v.nivel : undefined,
    alturaPlano: typeof v.alturaPlano === "number" ? v.alturaPlano : undefined,
    profundidad: typeof v.profundidad === "number" ? v.profundidad : undefined,
    nivelesVisibles: Array.isArray(v.nivelesVisibles)
      ? v.nivelesVisibles.filter((x): x is string => typeof x === "string")
      : [],
    categorias,
    estilo,
    escala,
    orientacion,
    puntoA,
    puntoB,
    direccion,
    estilos: Object.keys(estilos).length > 0 ? estilos : undefined,
    alturaArriba:
      typeof v.alturaArriba === "number" && Number.isFinite(v.alturaArriba)
        ? v.alturaArriba
        : undefined,
    cotasEjes: v.cotasEjes !== false,
    anotacionEscala:
      v.anotacionEscala === "papel" || v.anotacionEscala === "pantalla"
        ? v.anotacionEscala
        : tipo === "alzado" || tipo === "corte"
          ? "papel"
          : "pantalla",
    ejes: Object.keys(ejes).length > 0 ? ejes : undefined,
    nivelesAjuste: Object.keys(nivelesAjuste).length > 0 ? nivelesAjuste : undefined,
  };
}

/** Normaliza la lista completa; omite entradas rotas. */
export function normalizarVistas(valor: unknown): Vista[] {
  if (!Array.isArray(valor)) return [];
  return valor.map(normalizarVista).filter((v): v is Vista => v !== null);
}

/** JSON que se guarda en la propiedad `Datos` del pset OPENRVT_Vistas. */
export function serializarVistas(vistas: Vista[]): string {
  return JSON.stringify(
    vistas.map((v) => ({
      ...v,
      alturaPlano:
        v.alturaPlano === undefined ? undefined : Math.round(v.alturaPlano * 1e6) / 1e6,
      profundidad:
        v.profundidad === undefined ? undefined : Math.round(v.profundidad * 1e6) / 1e6,
    })),
  );
}

/** Lee el JSON guardado en OPENRVT_Vistas (texto) y devuelve vistas válidas. */
export function leerVistas(texto: string): Vista[] {
  try {
    return normalizarVistas(JSON.parse(texto));
  } catch {
    return [];
  }
}

/** Altura del plano de corte de una planta (1.20 m sobre el nivel). */
export function alturaPlanoPlanta(nivel: Nivel): number {
  return nivel.elevacion + 1.2;
}

/** Profundidad que alcanza una planta: el nivel de abajo o −1 m en el más bajo. */
export function fondoPlanta(niveles: Nivel[], indice: number): number {
  if (indice > 0) return niveles[indice - 1].elevacion;
  return niveles[indice].elevacion - 1;
}

export function numeroDeCorte(vistas: Vista[]): number {
  const usados = new Set(
    vistas
      .filter((v) => v.tipo === "corte")
      .map((v) => Number(v.nombre.match(/(\d+)/)?.[1] ?? 0)),
  );
  let n = 1;
  while (usados.has(n)) n += 1;
  return n;
}

/** Comprueba si una categoría está visible en una vista. */
export function categoriaVisible(vista: Vista, categoria: Categoria): boolean {
  return vista.categorias[categoria] !== false;
}

/** Categorías que se dibujan por encima del corte en una planta (silueta). */
export const CATEGORIAS_SOBRE_CORTE: readonly Categoria[] = ["losas", "cubiertas", "vigas"];

/**
 * O005b: en una planta solo se dibuja la silueta de lo que queda sobre el corte si es
 * una losa, cubierta o viga **del mismo nivel** de la planta. Así no se cuelan las
 * viguetas ni los elementos del piso de arriba.
 */
export function dibujaSiluetaSobreCorte(
  vista: Vista,
  categoria: Categoria,
  nivelGlobalid: string | undefined,
  cotaMinima: number,
): boolean {
  if (vista.tipo !== "planta") return false;
  if (!CATEGORIAS_SOBRE_CORTE.includes(categoria)) return false;
  if (!vista.nivel || nivelGlobalid !== vista.nivel) return false;
  if (vista.alturaPlano === undefined) return false;
  const corte = vista.alturaPlano;
  return (
    cotaMinima > corte + 1e-4 && cotaMinima <= corte + (vista.alturaArriba ?? 3)
  );
}

/**
 * O031: un archivo guardado con solo plantas (por ejemplo, creado por la herramienta
 * Nivel desde otro cliente) no debe ocultar los alzados y el 3D automáticos. Se
 * completan únicamente cuando no queda ninguna vista que no sea planta: si el usuario
 * borró a mano un alzado o una vista 3D, su elección se respeta al abrir.
 */
export function completarVistasEstandar(
  vistas: Vista[],
  niveles: Nivel[],
): { vistas: Vista[]; cambiadas: boolean } {
  if (vistas.some((v) => v.tipo !== "planta")) return { vistas, cambiadas: false };
  const ids = new Set(vistas.map((v) => v.id));
  const faltantes = crearVistas(niveles).filter((v) => !ids.has(v.id));
  if (faltantes.length === 0) return { vistas, cambiadas: false };
  return { vistas: [...vistas, ...faltantes], cambiadas: true };
}

/**
 * Migra las vistas guardadas con el criterio viejo (todos los niveles marcados) al
 * nuevo: cada planta muestra solo su nivel, salvo que el usuario la haya editado.
 */
export function migrarNivelesVisibles(
  vistas: Vista[],
  niveles: Array<{ globalid: string }>,
): { vistas: Vista[]; cambiadas: boolean } {
  const todos = new Set(niveles.map((n) => n.globalid));
  let cambiadas = false;
  const migradas = vistas.map((vista) => {
    if (vista.tipo !== "planta" || !vista.nivel || !todos.has(vista.nivel)) return vista;
    const sinNiveles = vista.nivelesVisibles.length === 0;
    const conTodos =
      !sinNiveles &&
      vista.nivelesVisibles.length === todos.size &&
      vista.nivelesVisibles.every((id) => todos.has(id));
    if (!sinNiveles && !conTodos) return vista;
    // Si ya mostraba exactamente su nivel no hay nada que migrar: no se marca la
    // obra como modificada al abrirla.
    if (vista.nivelesVisibles.length === 1 && vista.nivelesVisibles[0] === vista.nivel) {
      return vista;
    }
    cambiadas = true;
    return { ...vista, nivelesVisibles: [vista.nivel] };
  });
  return { vistas: migradas, cambiadas };
}
