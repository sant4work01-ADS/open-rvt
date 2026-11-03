// O011: geometría de los ejes anotados en una vista. Los ajustes (extremos libres y
// codos) son de anotación y viven en `Vista.ejes`; nunca modifican el IfcGrid.
import type { AjusteEjeVista } from "./tipos";
import type { Punto2 } from "./herramientas";

export type LadoEje = "inicio" | "fin";
/** O042: un codo son dos nodos (V1 sobre el eje y V2 desplazado), uno por extremo. */
export const MAXIMO_CODOS = 2;

const esPunto = (valor: unknown): valor is [number, number] =>
  Array.isArray(valor) &&
  valor.length === 2 &&
  Number.isFinite(valor[0]) &&
  Number.isFinite(valor[1]);

/** Copia el ajuste descartando puntos inválidos y recortando a dos codos por extremo. */
export function normalizarAjusteEje(
  ajuste: AjusteEjeVista | null | undefined,
): AjusteEjeVista | undefined {
  if (!ajuste || typeof ajuste !== "object") return undefined;
  const salida: AjusteEjeVista = {};
  if (esPunto(ajuste.extremoInicio)) salida.extremoInicio = [...ajuste.extremoInicio];
  if (esPunto(ajuste.extremoFin)) salida.extremoFin = [...ajuste.extremoFin];
  const codosInicio = Array.isArray(ajuste.codosInicio)
    ? ajuste.codosInicio.filter(esPunto).slice(0, MAXIMO_CODOS)
    : [];
  const codosFin = Array.isArray(ajuste.codosFin)
    ? ajuste.codosFin.filter(esPunto).slice(0, MAXIMO_CODOS)
    : [];
  if (codosInicio.length > 0) salida.codosInicio = codosInicio.map((p) => [...p] as [number, number]);
  if (codosFin.length > 0) salida.codosFin = codosFin.map((p) => [...p] as [number, number]);
  // O044: la marca de forma nueva solo tiene sentido mientras haya codo del lado.
  if (codosInicio.length > 0 && ajuste.codoNuevoInicio === true) salida.codoNuevoInicio = true;
  if (codosFin.length > 0 && ajuste.codoNuevoFin === true) salida.codoNuevoFin = true;
  if (typeof ajuste.globoInicio === "boolean") salida.globoInicio = ajuste.globoInicio;
  if (typeof ajuste.globoFin === "boolean") salida.globoFin = ajuste.globoFin;
  return ajusteVacio(salida) ? undefined : salida;
}

export function ajusteVacio(ajuste: AjusteEjeVista | null | undefined): boolean {
  if (!ajuste) return true;
  return (
    !esPunto(ajuste.extremoInicio) &&
    !esPunto(ajuste.extremoFin) &&
    (!ajuste.codosInicio || ajuste.codosInicio.length === 0) &&
    (!ajuste.codosFin || ajuste.codosFin.length === 0) &&
    ajuste.codoNuevoInicio !== true &&
    ajuste.codoNuevoFin !== true &&
    typeof ajuste.globoInicio !== "boolean" &&
    typeof ajuste.globoFin !== "boolean"
  );
}

/** Convierte milímetros de papel a metros de modelo según la escala de la vista. */
export function mmPapelAMetros(mm: number, escala: number): number {
  return (mm * escala) / 1000;
}

function normalizar(v: Punto2): Punto2 {
  const largo = Math.hypot(v[0], v[1]);
  if (largo < 1e-12) return [1, 0];
  return [v[0] / largo, v[1] / largo];
}

function deduplicar(puntos: Punto2[]): Punto2[] {
  const salida: Punto2[] = [];
  for (const punto of puntos) {
    const ultimo = salida[salida.length - 1];
    if (!ultimo || Math.hypot(punto[0] - ultimo[0], punto[1] - ultimo[1]) > 1e-9) {
      salida.push([punto[0], punto[1]]);
    }
  }
  return salida;
}

export interface GeometriaEje {
  /** Polilínea completa, del globo de inicio al globo de fin. */
  puntos: Punto2[];
  /** Globo de inicio; no se dibuja en alzados ni si el extremo no se ha tocado. */
  globoInicio?: Punto2;
  globoFin: Punto2;
  /** Puntos donde se apoya la línea antes de los codos (sin extremos libres). */
  baseInicio: Punto2;
  baseFin: Punto2;
  /** O042: tramo del eje con su patrón trazo-punto. Termina en V1 en los lados
   *  con codo y en el globo/extremo en los demás. */
  ejeDiscontinuo: [Punto2, Punto2];
  /** O042: tramos continuos y finos de cada codo (V1 → V2 → globo). */
  tramosSolidos: Punto2[][];
}

/** Sentido hacia afuera del eje (del interior al extremo que se anota). */
function afueraEje(inicio: Punto2, fin: Punto2, lado: LadoEje): Punto2 {
  const dir = normalizar([fin[0] - inicio[0], fin[1] - inicio[1]]);
  return lado === "inicio" ? [-dir[0], -dir[1]] : dir;
}

function desplazar(p: Punto2, v: Punto2, k: number): Punto2 {
  return [p[0] + v[0] * k, p[1] + v[1] * k];
}

/**
 * Construye la polilínea del eje. `inicio` y `fin` son los extremos de la línea del
 * IfcGrid en coordenadas de la vista (XY en planta; (s, z) en alzados y cortes).
 * Cada tramo es base → codos → globo; el globo es el extremo libre si existe.
 */
export function geometriaEje(
  ajuste: AjusteEjeVista | undefined,
  inicio: Punto2,
  fin: Punto2,
  opciones: { globoInicio?: boolean; diametroGlobo?: number } = {},
): GeometriaEje {
  const limpio = normalizarAjusteEje(ajuste);
  const codosInicio = limpio?.codosInicio ?? [];
  const codosFin = limpio?.codosFin ?? [];
  const diametro = opciones.diametroGlobo ?? 0;
  const radio = diametro / 2;
  // O044: con el codo nuevo el globo queda paralelo al eje, a 0.80·D de V2 hasta su
  // borde (1.30·D hasta el centro). Un codo viejo (sin marca) conserva su 1.0·D de
  // tramo final (1.50·D hasta el centro). Sin dos nodos se respeta el extremo.
  const globoDerivado = (codos: Punto2[], lado: LadoEje): Punto2 | null => {
    if (codos.length < 2 || !(diametro > 1e-12)) return null;
    const nuevo =
      lado === "inicio" ? limpio?.codoNuevoInicio === true : limpio?.codoNuevoFin === true;
    const tramoFinal = nuevo ? 0.8 * diametro : diametro;
    return desplazar(codos[1], afueraEje(inicio, fin, lado), radio + tramoFinal);
  };
  // Sin codo el borde del globo toca el extremo de la línea: el centro queda medio
  // diámetro más afuera. Así el globo no se mueve a lo largo del eje al agregar codo.
  const globoBase = (base: Punto2, lado: LadoEje): Punto2 =>
    radio > 0 ? desplazar(base, afueraEje(inicio, fin, lado), radio) : base;
  const globoInicio =
    globoDerivado(codosInicio, "inicio") ??
    limpio?.extremoInicio ??
    (codosInicio.length > 0 ? codosInicio[codosInicio.length - 1] : globoBase(inicio, "inicio"));
  const globoFin =
    globoDerivado(codosFin, "fin") ??
    limpio?.extremoFin ??
    (codosFin.length > 0 ? codosFin[codosFin.length - 1] : globoBase(fin, "fin"));
  // Borde del globo hacia el interior del eje: allí termina la línea dibujada.
  const bordeGlobo = (globo: Punto2, lado: LadoEje): Punto2 =>
    radio > 0 ? desplazar(globo, afueraEje(inicio, fin, lado), -radio) : globo;
  const igual = (a: Punto2, b: Punto2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9;
  // O042: con codo el extremo bruto del IfcGrid ya no se visita; la línea pasa por
  // V1 y V2. Sin codo se conserva el recorrido de siempre (incluido el extremo libre).
  const inicioConGlobo = codosInicio.length > 0 || !!opciones.globoInicio;
  const puntoInicio = inicioConGlobo ? globoInicio : bordeGlobo(globoInicio, "inicio");
  const parteInicio =
    codosInicio.length > 0
      ? [globoInicio, ...codosInicio.slice().reverse()]
      : igual(puntoInicio, inicio)
        ? [inicio]
        : [puntoInicio, inicio];
  const parteFin =
    codosFin.length > 0
      ? [...codosFin, globoFin]
      : igual(globoFin, fin)
        ? [fin]
        : [fin, globoFin];
  const puntos = deduplicar([...parteInicio, ...parteFin]);
  // El eje discontinuo llega hasta V1 (el primer nodo del codo) de cada lado; sin
  // codo termina en el borde del globo, nunca en su centro.
  const bordeInicio = bordeGlobo(globoInicio, "inicio");
  const bordeFin = bordeGlobo(globoFin, "fin");
  const ejeDiscontinuo: [Punto2, Punto2] = [
    codosInicio.length > 0 ? codosInicio[0] : bordeInicio,
    codosFin.length > 0 ? codosFin[0] : bordeFin,
  ];
  const tramosSolidos: Punto2[][] = [];
  if (codosInicio.length > 0) {
    tramosSolidos.push([bordeInicio, ...codosInicio.slice().reverse()]);
  }
  if (codosFin.length > 0) {
    tramosSolidos.push([...codosFin, bordeFin]);
  }
  return {
    puntos,
    globoInicio: opciones.globoInicio ? globoInicio : undefined,
    globoFin,
    baseInicio: inicio,
    baseFin: fin,
    ejeDiscontinuo,
    tramosSolidos,
  };
}

/**
 * O044: intersecciones de la línea del eje con otros ejes de la misma vista. Solo
 * cuentan los cruces reales dentro de ambos segmentos; sirven para que el codo no
 * nazca encima de un cruce (el defecto que marcó el dueño en rojo).
 */
export function interseccionesEje(
  inicio: Punto2,
  fin: Punto2,
  otros: Array<{ inicio: Punto2; fin: Punto2 }>,
): Punto2[] {
  const rx = fin[0] - inicio[0];
  const ry = fin[1] - inicio[1];
  const salida: Punto2[] = [];
  for (const otro of otros) {
    const sx = otro.fin[0] - otro.inicio[0];
    const sy = otro.fin[1] - otro.inicio[1];
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) continue;
    const qpx = otro.inicio[0] - inicio[0];
    const qpy = otro.inicio[1] - inicio[1];
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
    const punto: Punto2 = [inicio[0] + t * rx, inicio[1] + t * ry];
    if (!salida.some((p) => Math.hypot(p[0] - punto[0], p[1] - punto[1]) <= 1e-9)) {
      salida.push(punto);
    }
  }
  return salida;
}

/**
 * O044: «Agregar codo» crea el codo completo (V1 y V2) de una vez, con la forma que
 * dibujó el dueño:
 *
 * - El globo conserva su posición a lo largo del eje y solo se separa 0.55·D de lado.
 * - V2 queda 1.30·D antes del centro del globo (0.80·D hasta su borde + el radio),
 *   con el mismo corrimiento lateral de 0.55·D.
 * - V1 queda 0.50·D antes de V2 sobre el eje; la diagonal sale a unos 45°.
 * - El tramo final (V2 → borde del globo) mide 0.80·D y es paralelo al eje.
 * - Si V1 quedaría a menos de 0.30·D de un cruce (o más atrás), todo el codo se
 *   corre hacia afuera hasta dejar 0.30·D de tramo recto pasado el cruce.
 *
 * `extremo` es el centro del globo antes del codo y `direccion` el sentido hacia
 * afuera. `cruces` son las intersecciones con los demás ejes de la vista. Un archivo
 * viejo con un solo nodo se completa: el nodo existente es V1.
 */
export function agregarCodoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  extremo: Punto2,
  direccion: Punto2,
  diametroGlobo: number,
  cruces: Punto2[] = [],
): AjusteEjeVista {
  const base = normalizarAjusteEje(ajuste) ?? {};
  const claveCodos = lado === "inicio" ? "codosInicio" : "codosFin";
  const claveExtremo = lado === "inicio" ? "extremoInicio" : "extremoFin";
  const claveMarca = lado === "inicio" ? "codoNuevoInicio" : "codoNuevoFin";
  const codos = [...(base[claveCodos] ?? [])];
  if (codos.length >= MAXIMO_CODOS || !(diametroGlobo > 1e-12)) return base;
  const afuera = normalizar(direccion);
  // O044: el codo se dibuja hacia el lado contrario a las agujas del reloj visto
  // desde el eje (en un eje horizontal que va a la derecha, V2 baja), como el azul.
  const perpendicular: Punto2 = [afuera[1], -afuera[0]];
  const D = diametroGlobo;
  const D_ = (k: number): Punto2 => [afuera[0] * k * D, afuera[1] * k * D];
  const L_ = (k: number): Punto2 => [perpendicular[0] * k * D, perpendicular[1] * k * D];
  const sumar = (a: Punto2, b: Punto2): Punto2 => [a[0] + b[0], a[1] + b[1]];
  let globo: Punto2;
  let v2: Punto2;
  let v1: Punto2;
  if (codos.length > 0) {
    // Archivo viejo con un solo nodo: ese nodo es V1 y el codo se completa.
    v1 = [codos[0][0], codos[0][1]];
    v2 = sumar(sumar(v1, D_(0.5)), L_(0.55));
    globo = sumar(v2, D_(1.3));
  } else {
    // El globo no cambia su posición a lo largo del eje: solo se separa de lado.
    globo = sumar(extremo, L_(0.55));
    v2 = sumar(globo, D_(-1.3));
    v1 = sumar(sumar(v2, D_(-0.5)), L_(-0.55));
  }
  // Tramo recto mínimo de 0.30·D pasado el cruce más exterior del lado.
  if (cruces.length > 0) {
    const aLoLargo = (p: Punto2) =>
      (p[0] - extremo[0]) * afuera[0] + (p[1] - extremo[1]) * afuera[1];
    const v1s = aLoLargo(v1);
    const cruceMax = Math.max(...cruces.map(aLoLargo));
    const corrimiento = Math.max(0, cruceMax + 0.3 * D - v1s);
    if (corrimiento > 0) {
      const delta = D_(corrimiento / D);
      v1 = sumar(v1, delta);
      v2 = sumar(v2, delta);
      globo = sumar(globo, delta);
    }
  }
  const salida: AjusteEjeVista = {
    ...base,
    [claveCodos]: [v1, v2],
    [claveMarca]: true,
  };
  // El globo se deriva de V2; un extremo libre guardado ya no aplica.
  delete salida[claveExtremo];
  return normalizarAjusteEje(salida) ?? {};
}

/**
 * O042: quitar el codo deja la línea recta y el globo en el extremo. Como hay un
 * solo codo por extremo, pulsar V1 o V2 quita el codo completo de ese lado.
 */
export function quitarCodoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  indice: number,
): AjusteEjeVista | undefined {
  const base = normalizarAjusteEje(ajuste);
  if (!base) return undefined;
  const clave = lado === "inicio" ? "codosInicio" : "codosFin";
  const codos = base[clave] ?? [];
  if (indice < 0 || indice >= codos.length) return base;
  const salida: AjusteEjeVista = { ...base };
  delete salida[clave];
  delete salida[lado === "inicio" ? "extremoInicio" : "extremoFin"];
  delete salida[lado === "inicio" ? "codoNuevoInicio" : "codoNuevoFin"];
  return normalizarAjusteEje(salida);
}

/** Fija el extremo libre de un lado (o lo borra con `null`, volviendo a la alineación). */
export function fijarExtremoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  punto: Punto2 | null,
): AjusteEjeVista | undefined {
  const base = normalizarAjusteEje(ajuste) ?? {};
  const salida: AjusteEjeVista = { ...base };
  const clave = lado === "inicio" ? "extremoInicio" : "extremoFin";
  if (punto && esPunto(punto)) salida[clave] = [punto[0], punto[1]];
  else delete salida[clave];
  return normalizarAjusteEje(salida);
}

export function extremoEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
  inicio: Punto2,
  fin: Punto2,
): Punto2 {
  if (lado === "inicio") return ajuste?.extremoInicio ?? inicio;
  return ajuste?.extremoFin ?? fin;
}

/** O021: ¿se dibuja el globo de este lado? Por omisión el fin sí y el inicio solo
 *  cuando el extremo se ha tocado, exactamente como se dibujaba en O011. */
export function globoVisibleEje(
  ajuste: AjusteEjeVista | undefined,
  lado: LadoEje,
): boolean {
  const valor = lado === "inicio" ? ajuste?.globoInicio : ajuste?.globoFin;
  if (typeof valor === "boolean") return valor;
  if (lado === "fin") return true;
  return !!ajuste && (!!ajuste.extremoInicio || !!ajuste.codosInicio?.length);
}

/** O021: copia profunda del acomodo (extremos, codos y globos) para otras vistas. */
export function copiarAjusteEje(
  ajuste: AjusteEjeVista | null | undefined,
): AjusteEjeVista | undefined {
  const limpio = normalizarAjusteEje(ajuste);
  if (!limpio) return undefined;
  return {
    ...limpio,
    ...(limpio.extremoInicio ? { extremoInicio: [...limpio.extremoInicio] as Punto2 } : {}),
    ...(limpio.extremoFin ? { extremoFin: [...limpio.extremoFin] as Punto2 } : {}),
    ...(limpio.codosInicio
      ? { codosInicio: limpio.codosInicio.map((p) => [...p] as Punto2) }
      : {}),
    ...(limpio.codosFin ? { codosFin: limpio.codosFin.map((p) => [...p] as Punto2) } : {}),
  };
}

export type FamiliaEje = "vertical" | "horizontal" | "alzado";

interface EjeParaArrastre {
  globalid: string;
  vertical?: boolean;
}

/**
 * O021: arrastre de un extremo con candado. Cerrado (`candado = true`) mueve todos
 * los extremos de la misma familia que comparten la alineación; abierto mueve solo
 * el eje pulsado. Devuelve los ajustes completos para persistirlos de una vez.
 */
export function arrastrarExtremoEje(
  originales: Record<string, AjusteEjeVista>,
  bases: Record<string, { inicio: Punto2; fin: Punto2 }>,
  ejes: EjeParaArrastre[],
  globalid: string,
  lado: LadoEje,
  punto: Punto2,
  candado: boolean,
  familia: FamiliaEje,
  tolerancia = 1e-6,
): Record<string, AjusteEjeVista> {
  const cambios: Record<string, AjusteEjeVista> = { ...originales };
  const basesEje = bases[globalid];
  if (!basesEje) return cambios;
  if (!candado) {
    cambios[globalid] = fijarExtremoEje(originales[globalid], lado, punto) ?? {};
    return cambios;
  }
  const actualEje = extremoEje(originales[globalid], lado, basesEje.inicio, basesEje.fin);
  const delta: Punto2 = [punto[0] - actualEje[0], punto[1] - actualEje[1]];
  const coordenada = (p: Punto2) =>
    familia === "horizontal" ? p[0] : p[1];
  const alineacion = coordenada(actualEje);
  for (const eje of ejes) {
    const mismaFamilia =
      familia === "alzado" || (eje.vertical ? "vertical" : "horizontal") === familia;
    if (!mismaFamilia) continue;
    const b = bases[eje.globalid];
    if (!b) continue;
    const original = originales[eje.globalid];
    const actual = extremoEje(original, lado, b.inicio, b.fin);
    if (Math.abs(coordenada(actual) - alineacion) > tolerancia) continue;
    const nuevo: Punto2 =
      familia === "horizontal"
        ? [actual[0] + delta[0], actual[1]]
        : [actual[0], actual[1] + delta[1]];
    cambios[eje.globalid] = fijarExtremoEje(
      cambios[eje.globalid] ?? original,
      lado,
      nuevo,
    ) ?? {};
  }
  return cambios;
}

/** O021: doble clic en un asa = devolver ese extremo al acomodo automático
 *  (quita su extremo libre y los codos de ese lado; conserva el otro extremo). */
export function restablecerExtremoEje(
  ajuste: AjusteEjeVista | null | undefined,
  lado: LadoEje,
): AjusteEjeVista | undefined {
  const base = normalizarAjusteEje(ajuste);
  if (!base) return undefined;
  const salida: AjusteEjeVista = { ...base };
  delete salida[lado === "inicio" ? "extremoInicio" : "extremoFin"];
  delete salida[lado === "inicio" ? "codosInicio" : "codosFin"];
  return normalizarAjusteEje(salida);
}

// O027: restricciones del arrastre de asas. `direccion` es la dirección del eje en
// la vista: en planta la de la línea y en alzado/corte siempre «vertical».
export type TipoAsaArrastre = "extremo" | "globo" | "codo" | "nivel-cabeza" | "nivel-extremo";
export type DireccionEjeArrastre = "vertical" | "horizontal";

/** O044: la dirección elegida para un arrastre: a lo largo del eje (V1), o en X o Y (V2). */
export type ModoArrastreCodo = "auto" | "eje" | "x" | "y";

/**
 * O044: arrastre de un nodo del codo.
 *
 * - V1 (`nodo = 0`) solo se mueve a lo largo del eje: la otra coordenada no cambia.
 * - V2 (`nodo = 1`) se mueve en X o en Y, una sola dirección por arrastre. En
 *   «auto» se elige por el componente mayor del movimiento y el llamador la
 *   conserva hasta soltar.
 * - El destino parte del nodo, no del punto de pulsación, y se redondea a `paso`
 *   (1 mm de papel).
 */
export function destinoArrastreCodo(
  v1: Punto2,
  v2: Punto2,
  cursorInicio: Punto2,
  cursor: Punto2,
  direccionEje: DireccionEjeArrastre,
  nodo: 0 | 1 = 1,
  modo: ModoArrastreCodo = "auto",
  paso = 0,
): { punto: Punto2; modo: "eje" | "x" | "y" } {
  const d: Punto2 = [cursor[0] - cursorInicio[0], cursor[1] - cursorInicio[1]];
  const redondear = (v: number) => (paso > 1e-12 ? Math.round(v / paso) * paso : v);
  if (nodo === 0) {
    const indice = direccionEje === "vertical" ? 1 : 0;
    const destino: Punto2 = [v1[0], v1[1]];
    destino[indice] = redondear(v1[indice] + d[indice]);
    return { punto: destino, modo: "eje" };
  }
  const elegido: "eje" | "x" | "y" =
    modo === "auto"
      ? Math.abs(d[0]) >= Math.abs(d[1])
        ? "x"
        : "y"
      : modo === "eje"
        ? direccionEje === "vertical"
          ? "y"
          : "x"
        : modo;
  const indice = elegido === "y" ? 1 : 0;
  const destino: Punto2 = [v2[0], v2[1]];
  destino[indice] = redondear(v2[indice] + d[indice]);
  return { punto: destino, modo: elegido };
}

/**
 * O027: devuelve el delta permitido para cada asa. El extremo y el quiebre del codo
 * solo avanzan a lo largo del eje; el globo desplazado solo se separa perpendicular
 * al eje; la cabeza de nivel solo sube/baja y el extremo de su línea solo se corre.
 * Con `libre` (Shift) no se restringe nada.
 */
export function restringirArrastre(
  tipoAsa: TipoAsaArrastre,
  direccionEje: DireccionEjeArrastre,
  delta: Punto2,
  libre = false,
): Punto2 {
  const [dx, dy] = delta;
  if (libre) return [dx, dy];
  if (tipoAsa === "nivel-cabeza") return [0, dy];
  if (tipoAsa === "nivel-extremo") return [dx, 0];
  if (tipoAsa === "globo") {
    return direccionEje === "vertical" ? [dx, 0] : [0, dy];
  }
  return direccionEje === "vertical" ? [0, dy] : [dx, 0];
}

/**
 * Destino de un asa arrastrada: parte de donde estaba el asa, no de donde se pulsó.
 * Pulsar unos píxeles fuera del centro del globo o del codo ya no lo hace saltar
 * ni lo saca de la línea a la que está restringido.
 */
export function destinoArrastreAsa(
  asaInicio: Punto2,
  cursorInicio: Punto2,
  cursor: Punto2,
  tipoAsa: TipoAsaArrastre,
  direccionEje: DireccionEjeArrastre,
  libre = false,
): Punto2 {
  const delta = restringirArrastre(
    tipoAsa,
    direccionEje,
    [cursor[0] - cursorInicio[0], cursor[1] - cursorInicio[1]],
    libre,
  );
  return [asaInicio[0] + delta[0], asaInicio[1] + delta[1]];
}

/**
 * Posición real (en coordenadas de la vista) del punto que mueve un asa: el codo,
 * el extremo de la línea o el globo. No es el punto donde se dibuja el asa: en
 * alzado el globo se dibuja un radio arriba de su extremo y el asa «codo nuevo»
 * debajo del globo.
 */
export function puntoAsaEje(
  ajuste: AjusteEjeVista | undefined,
  bases: { inicio: Punto2; fin: Punto2 },
  lado: LadoEje,
  tipo: "globo" | "codo" | "codo-nuevo" | "base",
  indice: number | null = null,
): Punto2 {
  const limpio = normalizarAjusteEje(ajuste);
  if (tipo === "codo" && indice !== null) {
    const codos = (lado === "inicio" ? limpio?.codosInicio : limpio?.codosFin) ?? [];
    const codo = codos[indice];
    if (codo) return [codo[0], codo[1]];
  }
  // Sin codos ni extremo libre el asa «base» y el globo coinciden con el extremo.
  if (tipo === "base") return extremoEje(limpio, lado, bases.inicio, bases.fin);
  const g = geometriaEje(limpio, bases.inicio, bases.fin, { globoInicio: true });
  const globo = lado === "inicio" ? (g.globoInicio ?? bases.inicio) : g.globoFin;
  return [globo[0], globo[1]];
}

/**
 * Desplazamiento de una cabeza de nivel al arrastrarla: el que tenía más lo que
 * se movió el puntero en vertical. Se engancha a 0 (de vuelta sobre su línea)
 * dentro de la tolerancia, salvo con `libre` (Shift).
 */
export function desplazamientoArrastreNivel(
  desplazamientoInicial: number,
  zCursorInicio: number,
  zCursor: number,
  tolerancia: number,
  libre = false,
): ResultadoIman {
  const valor = desplazamientoInicial + (zCursor - zCursorInicio);
  if (libre) return { valor, enganchado: false };
  return imanAlineacion(valor, [0], tolerancia);
}

/** O031: el candado de alineación vale para las asas de extremo, incluido el globo
 *  cuando aún no tiene codo (antes el globo quedaba siempre libre y rompía O021).
 *  Con codo el globo se separa perpendicular al eje (O027), no sigue la alineación. */
export function candadoArrastreAsa(
  tipo: "base" | "globo" | "codo" | "codo-nuevo",
  candadoCerrado: boolean,
  conCodo = false,
): boolean {
  if (tipo === "globo" && conCodo) return false;
  return (tipo === "base" || tipo === "globo") && candadoCerrado;
}

export interface ResultadoIman {
  valor: number;
  enganchado: boolean;
}

/** O027: engancha un valor a la alineación más cercana dentro de la tolerancia. */
export function imanAlineacion(
  valor: number,
  candidatos: number[],
  tolerancia: number,
): ResultadoIman {
  let mejor = valor;
  let distancia = Math.abs(tolerancia);
  let enganchado = false;
  for (const candidato of candidatos) {
    if (!Number.isFinite(candidato)) continue;
    const d = Math.abs(candidato - valor);
    if (d <= distancia) {
      distancia = d;
      mejor = candidato;
      enganchado = true;
    }
  }
  return { valor: mejor, enganchado };
}

/** O027: engancha un desplazamiento a múltiplos del paso (un diámetro de globo). */
export function imanMultiplo(
  valor: number,
  base: number,
  paso: number,
  tolerancia: number,
): ResultadoIman {
  if (!(paso > 1e-9)) return { valor, enganchado: false };
  const multiplo = base + Math.round((valor - base) / paso) * paso;
  const d = Math.abs(multiplo - valor);
  if (d <= Math.abs(tolerancia)) return { valor: multiplo, enganchado: true };
  return { valor, enganchado: false };
}

export interface AsaCodoVista {
  lado: LadoEje;
  indice: number;
  punto: Punto2;
}

/**
 * O037: posición del asa «codo nuevo» (la que, al arrastrarla, crea un codo junto al
 * globo). Debe quedar exactamente sobre la polilínea, en su último tramo (codo → globo
 * en el lado fin; globo → codo en el lado inicio), separada `separacion` del globo hacia
 * el interior. Antes se colocaba a lo largo de la línea base del IfcGrid, por lo que al
 * existir un codo quedaba flotando fuera de la polilínea.
 */
export function puntoAsaCodoNuevo(
  ajuste: AjusteEjeVista | undefined,
  bases: { inicio: Punto2; fin: Punto2 },
  lado: LadoEje,
  separacion: number,
  diametroGlobo = 0,
): Punto2 {
  const g = geometriaEje(ajuste, bases.inicio, bases.fin, {
    globoInicio: true,
    diametroGlobo,
  });
  const globo = lado === "inicio" ? (g.globoInicio ?? bases.inicio) : g.globoFin;
  // El punto de la polilínea contiguo al globo (su borde), hacia el interior del eje.
  const adyacente =
    lado === "inicio"
      ? (g.puntos[1] ?? bases.fin)
      : (g.puntos[g.puntos.length - 2] ?? bases.inicio);
  const dx = adyacente[0] - globo[0];
  const dy = adyacente[1] - globo[1];
  const largo = Math.hypot(dx, dy);
  if (largo <= 1e-9) return [globo[0], globo[1]];
  // Desde el centro, avanza hasta el borde (radio) y luego la separación pedida.
  const avance = (diametroGlobo > 1e-12 ? diametroGlobo / 2 : 0) + separacion;
  return [globo[0] + (dx / largo) * avance, globo[1] + (dy / largo) * avance];
}

/**
 * O044: asas de los codos que se dibujan en una vista. Con el codo completo hay dos
 * por lado: V1 y V2. Un archivo viejo con un único nodo aún lo muestra para poder
 * quitarlo. El globo no tiene pinzamiento cuando hay codo.
 */
export function asasCodoVista(ajuste: AjusteEjeVista | undefined): AsaCodoVista[] {
  const limpio = normalizarAjusteEje(ajuste);
  const asas: AsaCodoVista[] = [];
  for (const [lado, clave] of [
    ["inicio", "codosInicio"],
    ["fin", "codosFin"],
  ] as const) {
    const codos = limpio?.[clave] ?? [];
    for (let indice = 0; indice < codos.length; indice += 1) {
      asas.push({ lado, indice, punto: codos[indice] });
    }
  }
  return asas;
}
