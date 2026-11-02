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
