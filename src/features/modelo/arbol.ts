// O038: tipos y funciones puras del árbol del proyecto (modo Modelo). Separado del
// visor para probarlo sin WebGL: aplanado, expansión de ocultos/bloqueados a GlobalIds,
// estado intermedio (hijos mezclados), búsqueda y ruta de un elemento.
export type TipoNodoArbol =
  | "edificio"
  | "nivel"
  | "categoria"
  | "tipo"
  | "elemento"
  | "referencias"
  | "grupo"
  | "eje"
  | "nivel-ref";

export interface NodoArbol {
  clave: string;
  nombre: string;
  tipo: TipoNodoArbol;
  conteo?: number;
  globalid?: string;
  clase?: string;
  categoria?: string;
  elevacion?: number | null;
  hijos?: NodoArbol[];
}

/** Índice por clave: GlobalIds de elementos descendientes y claves de nodos hijos. */
export interface IndiceArbol {
  elementos: Map<string, Set<string>>;
  claves: Map<string, Set<string>>;
}

/** Recorre el árbol una sola vez y devuelve el índice para expandir y medir estados. */
export function indexarArbol(arbol: NodoArbol | null): IndiceArbol {
  const elementos = new Map<string, Set<string>>();
  const claves = new Map<string, Set<string>>();
  const visitar = (nodo: NodoArbol): { gids: Set<string>; cls: Set<string> } => {
    const gids = new Set<string>();
    const cls = new Set<string>([nodo.clave]);
    for (const hijo of nodo.hijos ?? []) {
      const r = visitar(hijo);
      for (const g of r.gids) gids.add(g);
      for (const c of r.cls) cls.add(c);
    }
    if (nodo.tipo === "elemento" && nodo.globalid) gids.add(nodo.globalid);
    elementos.set(nodo.clave, gids);
    claves.set(nodo.clave, cls);
    return { gids, cls };
  };
  if (arbol) visitar(arbol);
  return { elementos, claves };
}

/** GlobalIds de elementos ocultos/bloqueados por un conjunto de claves de nodo. */
export function expandirGlobalids(indice: IndiceArbol, claves: Iterable<string>): Set<string> {
  const salida = new Set<string>();
  for (const clave of claves) {
    const gids = indice.elementos.get(clave);
    if (gids) for (const g of gids) salida.add(g);
  }
  return salida;
}

export type EstadoNodo = "completo" | "parcial" | "ninguno";

/** Estado del ojo/candado de un nodo: todos, ninguno o mezcla de sus descendientes. */
export function estadoDeNodo(
  indice: IndiceArbol,
  clave: string,
  claves: ReadonlySet<string>,
): EstadoNodo {
  if (claves.has(clave)) return "completo";
  const total = indice.elementos.get(clave);
  if (!total || total.size === 0) return "ninguno";
  const subclaves = indice.claves.get(clave) ?? new Set<string>();
  let afectados = 0;
  for (const c of claves) {
    if (!subclaves.has(c)) continue;
    const gids = indice.elementos.get(c);
    if (gids) afectados += gids.size;
  }
  if (afectados === 0) return "ninguno";
  return afectados >= total.size ? "completo" : "parcial";
}

/** Minúsculas y sin acentos, para buscar sin distinguir mayúsculas ni tildes. */
export function normalizarConsulta(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿El nodo coincide con la búsqueda por nombre, tipo o GlobalId? */
export function nodoCoincide(nodo: NodoArbol, consulta: string): boolean {
  const buscado = normalizarConsulta(consulta);
  if (!buscado) return true;
  const nombre = normalizarConsulta(nodo.nombre);
  if (nombre.includes(buscado)) return true;
  if (normalizarConsulta(nodo.tipo).includes(buscado)) return true;
  if (nodo.clase && normalizarConsulta(nodo.clase).includes(buscado)) return true;
  if (nodo.categoria && normalizarConsulta(nodo.categoria).includes(buscado)) return true;
  if (nodo.globalid && normalizarConsulta(nodo.globalid).includes(buscado)) return true;
  return false;
}

/** Podar el árbol conservando solo los nodos que coinciden o tienen un hijo que coincide. */
export function filtrarArbol(arbol: NodoArbol | null, consulta: string): NodoArbol | null {
  const buscado = normalizarConsulta(consulta);
  if (!arbol || !buscado) return arbol;
  const visitar = (nodo: NodoArbol): NodoArbol | null => {
    const hijos = (nodo.hijos ?? [])
      .map(visitar)
      .filter((h): h is NodoArbol => h !== null);
    if (nodoCoincide(nodo, consulta) || hijos.length > 0) {
      return { ...nodo, hijos };
    }
    return null;
  };
  return visitar(arbol);
}

/** Claves de los ancestros de un elemento (desde la raíz hasta el elemento), para
 * expandir el árbol y llevar el elemento a la vista. */
export function rutaDeElemento(arbol: NodoArbol | null, globalid: string): string[] | null {
  if (!arbol) return null;
  const visitar = (nodo: NodoArbol, camino: string[]): string[] | null => {
    const siguiente = [...camino, nodo.clave];
    if (nodo.tipo === "elemento" && nodo.globalid === globalid) return siguiente;
    for (const hijo of nodo.hijos ?? []) {
      const ruta = visitar(hijo, siguiente);
      if (ruta) return ruta;
    }
    return null;
  };
  return visitar(arbol, []);
}

/** Claves desde la raíz hasta un nodo (por clave), para aislar y expandir. */
export function rutaDeClave(arbol: NodoArbol | null, clave: string): string[] | null {
  if (!arbol) return null;
  const visitar = (nodo: NodoArbol, camino: string[]): string[] | null => {
    const siguiente = [...camino, nodo.clave];
    if (nodo.clave === clave) return siguiente;
    for (const hijo of nodo.hijos ?? []) {
      const ruta = visitar(hijo, siguiente);
      if (ruta) return ruta;
    }
    return null;
  };
  return visitar(arbol, []);
}

/** Claves de nodos a ocultar para que solo quede visible el subárbol de `clave`. */
export function clavesParaAislar(arbol: NodoArbol | null, clave: string): string[] {
  if (!arbol) return [];
  const indice = indexarArbol(arbol);
  const subarbol = indice.claves.get(clave);
  if (!subarbol) return [];
  const ocultos: string[] = [];
  const visitar = (nodo: NodoArbol): void => {
    for (const hijo of nodo.hijos ?? []) {
      if (subarbol.has(hijo.clave)) {
        visitar(hijo);
      } else if (indice.claves.get(hijo.clave)?.has(clave)) {
        visitar(hijo);
      } else {
        ocultos.push(hijo.clave);
      }
    }
  };
  visitar(arbol);
  return ocultos;
}

/** GlobalIds de los elementos descendientes de un nodo (por clave). */
export function elementosDeNodo(indice: IndiceArbol, clave: string): string[] {
  return [...(indice.elementos.get(clave) ?? [])];
}

// ---------------------------------------------------------------- O039: modo Obra
export interface RenglonObra {
  clave: string;
  globalid: string;
  elemento: string;
  descripcion: string;
  resultado: number;
}

export interface PartidaObra {
  clave: string;
  clave_pp: string;
  nombre: string;
  unidad: string;
  total: number;
  conteo: number;
  renglones: RenglonObra[];
}

export interface CapituloObra {
  clave: string;
  globalid: string;
  identificacion: string;
  nombre: string;
  orden: number;
  conteo: number;
  partidas: PartidaObra[];
}

export interface ArbolObra {
  tipo: "obra";
  clave: string;
  nombre: string;
  conteo: number;
  capitulos: CapituloObra[];
}

/** Unidades del núcleo con su símbolo visible (m3 → m³). */
const UNIDADES_VISIBLES: Record<string, string> = {
  m: "m",
  m2: "m²",
  m3: "m³",
  kg: "kg",
  pza: "pza",
};

export function unidadVisible(unidad: string): string {
  return UNIDADES_VISIBLES[unidad] ?? unidad;
}

/** «Cimentación (3)». */
export function formatoCapituloObra(capitulo: CapituloObra): string {
  return `${capitulo.nombre} (${capitulo.conteo})`;
}

/** «CIM-010 Concreto en zapatas · 1.234 m³» (sin clave: «Nombre · total unidad»). */
export function formatoPartidaObra(partida: PartidaObra): string {
  const total = `${Number(partida.total).toFixed(3)} ${unidadVisible(partida.unidad)}`;
  return partida.clave_pp
    ? `${partida.clave_pp} ${partida.nombre} · ${total}`
    : `${partida.nombre} · ${total}`;
}

/** «Muro 1 · 8.510». */
export function formatoRenglonObra(renglon: RenglonObra): string {
  const resultado = Number(renglon.resultado);
  const numero = Number.isFinite(resultado) ? resultado.toFixed(3) : "—";
  return `${renglon.elemento} · ${numero}`;
}

/** GlobalIds únicos de los elementos de una partida. */
export function gidsDePartidaObra(partida: PartidaObra): string[] {
  return [...new Set(partida.renglones.map((r) => r.globalid).filter(Boolean))];
}

/** GlobalIds únicos de los elementos de un capítulo. */
export function gidsDeCapituloObra(capitulo: CapituloObra): string[] {
  return [
    ...new Set(
      capitulo.partidas.flatMap((partida) => gidsDePartidaObra(partida)),
    ),
  ];
}

/** Busca una partida por su clave de nodo (para arrastrar y soltar). */
export function buscarPartidaObra(
  arbol: ArbolObra | null,
  clave: string,
): PartidaObra | null {
  if (!arbol) return null;
  for (const capitulo of arbol.capitulos) {
    const partida = capitulo.partidas.find((p) => p.clave === clave);
    if (partida) return partida;
  }
  return null;
}

/** Filtra capítulos, partidas y renglones por nombre, clave o GlobalId. */
export function filtrarArbolObra(
  arbol: ArbolObra | null,
  consulta: string,
): ArbolObra | null {
  const buscado = normalizarConsulta(consulta);
  if (!arbol || !buscado) return arbol;
  const capitulos: CapituloObra[] = [];
  for (const capitulo of arbol.capitulos) {
    const partidas: PartidaObra[] = [];
    for (const partida of capitulo.partidas) {
      const renglones = partida.renglones.filter(
        (renglon) =>
          normalizarConsulta(renglon.elemento).includes(buscado) ||
          normalizarConsulta(renglon.globalid).includes(buscado) ||
          normalizarConsulta(renglon.descripcion).includes(buscado),
      );
      const coincidePartida =
        normalizarConsulta(partida.nombre).includes(buscado) ||
        normalizarConsulta(partida.clave_pp).includes(buscado);
      if (coincidePartida) {
        partidas.push(partida);
      } else if (renglones.length > 0) {
        partidas.push({ ...partida, renglones, conteo: renglones.length });
      }
    }
    const coincideCapitulo = normalizarConsulta(capitulo.nombre).includes(buscado);
    if (partidas.length > 0 || coincideCapitulo) {
      capitulos.push({
        ...capitulo,
        conteo: coincideCapitulo ? capitulo.conteo : partidas.length,
        partidas: coincideCapitulo ? capitulo.partidas : partidas,
      });
    }
  }
  return { ...arbol, capitulos };
}
