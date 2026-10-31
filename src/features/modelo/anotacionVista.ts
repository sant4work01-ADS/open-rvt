// O024/O025: colocación compartida de niveles, ejes y cotas en alzado y corte.
// Trabaja en el plano de papel de la vista (t horizontal, z vertical) y en
// unidades de mundo (metros); el visor y la vista previa del editor dibujan
// exactamente esta geometría. Todas las medidas de estilo son mm de papel.
import { mmAMundo, type EstiloCota, type EstiloEje, type EstiloNivel } from "./estilos";
import type { EscalaVista } from "./tipos";

export interface NivelEntrada {
  globalid: string;
  nombre: string;
  elevacion: number;
}

export interface EjeEntrada {
  globalid: string;
  etiqueta: string;
  /** Posición del eje a lo largo de la vista (m). */
  s: number;
}

export interface CajaAnotacion {
  tipo: "nivel" | "parcial" | "total" | "eje";
  texto: string;
  t0: number;
  t1: number;
  z0: number;
  z1: number;
  centro: [number, number];
}

export interface LineaAnotacion {
  tipo: "nivel" | "guia-nivel" | "extension" | "cota" | "cota-total" | "eje" | "guia-eje";
  puntos: Array<[number, number]>;
  elevacion?: number;
  /** Punto sobre la línea del nivel donde arranca la guía (referencia). */
  punto?: [number, number];
}

export interface CabezaNivelCalc {
  globalid: string;
  nombre: string;
  elevacion: number;
  /** Vértice de la cabeza (toca la línea guía). */
  t: number;
  z: number;
  desplazamiento: number;
  /** Triángulo invertido en el plano (t, z). */
  poligono: Array<[number, number]>;
  texto: string;
  cajaTexto: CajaAnotacion;
}

export interface GloboCalc {
  globalid: string;
  etiqueta: string;
  t: number;
  z: number;
  radio: number;
}

export interface RemateCota {
  /** Punto del extremo de la línea de cota. */
  t: number;
  z: number;
  /** Hacia dónde apunta la punta del remate. */
  hacia: "arriba" | "abajo";
  fuera: boolean;
}

export interface CotaTramoCalc {
  desde: number;
  hasta: number;
  valor: number;
  texto: string;
  t: number;
  fuera: boolean;
  cajaTexto: CajaAnotacion;
  remates: [RemateCota, RemateCota];
}

export interface CotaTotalCalc extends CotaTramoCalc {
  tipo: "total";
}

export interface LayoutAlzado {
  tInicio: number;
  /** Fin de las líneas de nivel (más allá del último eje). */
  tFin: number;
  /** Borde derecho de toda la anotación (texto de la cabeza más ancha). */
  tFinAnotacion: number;
  /** Punto de la línea del nivel donde arranca la guía con codo. */
  tGuia: number;
  tCadena: number;
  tTotal: number;
  tCabeza: number;
  zGlobo: number;
  zGloboInferior: number;
  /** Separación efectiva (m) del globo sobre el último nivel. */
  separacionGlobos: number;
  lineas: LineaAnotacion[];
  cabezas: CabezaNivelCalc[];
  globos: GloboCalc[];
  ejesLineas: LineaAnotacion[];
  parciales: CotaTramoCalc[];
  total: CotaTotalCalc | null;
  cajas: CajaAnotacion[];
}

export interface EntradaLayoutAlzado {
  niveles: NivelEntrada[];
  ejes: EjeEntrada[];
  estiloNivel: EstiloNivel;
  estiloEje: EstiloEje;
  estiloCota: EstiloCota;
  escala: EscalaVista;
  tMinCaja: number;
  tMaxCaja: number;
  /** Sobrescritura por vista de la separación de globos (mm). */
  separacionGlobosMm?: number;
  /** Desplazamientos manuales de cabeza (mundo, por GlobalId). */
  ajustesNivel?: Record<string, number>;
  /** Alto real del texto de nivel en mundo (incluye el mínimo en píxeles del visor). */
  altoTextoNivelMundo?: number;
  /** Alto real del texto de cota en mundo (incluye el mínimo en píxeles del visor). */
  altoTextoCotaMundo?: number;
}

const MM = (mm: number, escala: EscalaVista) => mmAMundo(mm, escala);

/** Ancho aproximado del texto, en mundo, con el mismo criterio que el visor. */
export function anchoTextoAprox(texto: string, altoMundo: number, factor = 0.75): number {
  return Math.max(0.1, texto.length * altoMundo * factor);
}

export function formatearNumero(valor: number, decimales: number, unidad = ""): string {
  return `${valor.toFixed(decimales)}${unidad}`;
}

export function textoNivel(elevacion: number, estilo: EstiloNivel): string {
  const factor = 10 ** estilo.decimales;
  const valor = Math.round(Math.abs(elevacion) * factor) / factor;
  const cuerpo =
    valor === 0
      ? valor.toFixed(estilo.decimales)
      : `${elevacion < 0 ? "-" : estilo.signo ? "+" : ""}${valor.toFixed(estilo.decimales)}`;
  const conUnidad = `${cuerpo}${estilo.unidad}`;
  return estilo.prefijo ? `${estilo.prefijo} ${conUnidad}` : conUnidad;
}

/** Separa cabezas que se enciman moviendo el par hacia arriba y hacia abajo. */
export function acomodarCabezasSimetrico(
  elevaciones: number[],
  altoBanda: number,
  separacionMin: number,
): number[] {
  const zs = elevaciones.map((z) => (Number.isFinite(z) ? z : 0));
  const banda = Math.max(0, altoBanda);
  const hueco = Math.max(0, separacionMin);
  for (let pasada = 0; pasada < 40; pasada += 1) {
    let cambio = false;
    for (let i = 0; i + 1 < zs.length; i += 1) {
      const minimo = banda + hueco;
      const actual = zs[i + 1] - zs[i];
      if (actual < minimo) {
        const delta = (minimo - actual) / 2;
        zs[i] -= delta;
        zs[i + 1] += delta;
        cambio = true;
      }
    }
    if (!cambio) break;
  }
  return zs;
}

/**
 * Segmentos de una línea trazo-punto: trazo largo, hueco, punto, hueco.
 * Devuelve pares de puntos en mundo para dibujar con material continuo, porque
 * LineMaterial solo admite un par guion/hueco y no dibujaría el punto.
 */
export function segmentosTrazoPunto(
  puntos: Array<[number, number]>,
  escala: EscalaVista,
): Array<[[number, number], [number, number]]> {
  const patron = [MM(6, escala), MM(2, escala), MM(0.5, escala), MM(2, escala)];
  if (puntos.length < 2) return [];
  const salida: Array<[[number, number], [number, number]]> = [];
  let indice = 0;
  let restante = patron[0];
  let restanteTramo = Math.hypot(puntos[1][0] - puntos[0][0], puntos[1][1] - puntos[0][1]);
  let segmento = 0;
  let cursor = puntos[0];
  let direccion = [
    (puntos[1][0] - puntos[0][0]) / (restanteTramo || 1),
    (puntos[1][1] - puntos[0][1]) / (restanteTramo || 1),
  ];
  const dibujando = (i: number) => i % 2 === 0;
  while (segmento + 1 < puntos.length) {
    const paso = Math.min(restante, restanteTramo);
    const siguiente: [number, number] = [cursor[0] + direccion[0] * paso, cursor[1] + direccion[1] * paso];
    if (dibujando(indice) && paso > 1e-9) salida.push([cursor, siguiente]);
    cursor = siguiente;
    restante -= paso;
    restanteTramo -= paso;
    if (restanteTramo <= 1e-9) {
      segmento += 1;
      if (segmento + 1 >= puntos.length) break;
      cursor = puntos[segmento];
      const dx = puntos[segmento + 1][0] - puntos[segmento][0];
      const dz = puntos[segmento + 1][1] - puntos[segmento][1];
      restanteTramo = Math.hypot(dx, dz);
      direccion = [dx / (restanteTramo || 1), dz / (restanteTramo || 1)];
    }
    if (restante <= 1e-9) {
      indice = (indice + 1) % patron.length;
      restante = patron[indice];
    }
  }
  return salida;
}

export function calcularLayoutAlzado(entrada: EntradaLayoutAlzado): LayoutAlzado {
  const { escala, estiloNivel, estiloEje, estiloCota } = entrada;
  const niveles = [...entrada.niveles].sort((a, b) => a.elevacion - b.elevacion);
  const ejes = [...entrada.ejes].sort((a, b) => a.s - b.s);
  const elevaciones = niveles.map((n) => n.elevacion);
  const zMin = elevaciones.length > 0 ? elevaciones[0] : 0;
  const zMax = elevaciones.length > 0 ? elevaciones[elevaciones.length - 1] : 1;

  const extension = MM(estiloNivel.extension, escala);
  const sMin = ejes.length > 0 ? ejes[0].s : entrada.tMinCaja;
  const sMax = ejes.length > 0 ? ejes[ejes.length - 1].s : entrada.tMaxCaja;
  const tInicio = Math.min(entrada.tMinCaja, sMin - extension);
  const tFin = Math.max(sMax + extension, tInicio);

  const altoTextoCota = entrada.altoTextoCotaMundo ?? MM(estiloCota.altoTexto, escala);
  const separacion = MM(estiloCota.separacionTexto, escala);
  const remate = MM(estiloCota.tamanoRemate, escala);
  const separacionExt = MM(estiloCota.separacionExtension, escala);
  const prolongacion = MM(estiloCota.prolongacion, escala);
  const altoTextoNivel = entrada.altoTextoNivelMundo ?? MM(estiloNivel.altoTexto, escala);

  // La referencia (dibujada a 1:20) usa un triángulo ancho y bajo: si fuera
  // cuadrado, las cabezas de niveles juntos se tocarían.
  const anchoCabeza = MM(estiloNivel.tamanoCabeza, escala);
  const altoCabeza = anchoCabeza * 0.7;
  const altoBanda = Math.max(altoCabeza, altoTextoNivel);

  // Cadena y total en filas separadas. La fila de la total se ensancha lo justo
  // para que su texto quepa a la izquierda sin tocar la cadena.
  const textoTotal =
    niveles.length >= 2
      ? formatearNumero(
          elevaciones[elevaciones.length - 1] - elevaciones[0],
          estiloCota.decimales,
          estiloCota.unidad,
        )
      : "";
  const anchoTextoTotal = anchoTextoAprox(textoTotal, altoTextoCota, 0.55);
  const tExtInicio = tFin + separacionExt;
  const tCadena = tExtInicio + MM(6, escala);
  const filaSiguiente = Math.max(
    MM(estiloCota.distanciaFilas, escala),
    anchoTextoTotal + 2 * separacion + MM(1, escala),
  );
  const tTotal = tCadena + filaSiguiente;
  // Punto de arranque de la guía (solo en cabezas con codo) y columna única de
  // cabezas, siempre más afuera que las cotas.
  const tGuia = tTotal + MM(6, escala);
  const tCabeza = Math.max(tGuia + MM(4, escala), tTotal + MM(14, escala));

  // Cabezas juntas: se abren en vertical con codo (2.20 sube, 2.00 baja). El
  // umbral incluye el triángulo, su texto y el aire de la referencia; a 1:20 el
  // par de 0.20 m mide 10 mm de papel y este umbral lo marca como «junto».
  const zs = [...elevaciones];
  const umbralCodo = altoCabeza + altoTextoNivel + MM(6, escala);
  for (let i = 0; i + 1 < zs.length; i += 1) {
    const hueco = elevaciones[i + 1] - elevaciones[i];
    if (hueco < umbralCodo) {
      const d = Math.max((umbralCodo - hueco) / 2, MM(4, escala));
      zs[i] -= d;
      zs[i + 1] += d;
    }
  }
  const auto = acomodarCabezasSimetrico(zs, altoBanda, MM(2, escala));

  const lineas: LineaAnotacion[] = [];
  const cabezas: CabezaNivelCalc[] = [];
  const cajas: CajaAnotacion[] = [];

  for (let i = 0; i < niveles.length; i += 1) {
    const nivel = niveles[i];
    const zLinea = nivel.elevacion;
    const manual = entrada.ajustesNivel?.[nivel.globalid];
    const z = Number.isFinite(manual) ? (manual as number) : auto[i];
    const desplazamiento = z - zLinea;
    const plegada = Math.abs(desplazamiento) > 1e-9;
    // Sin codo la línea de nivel llega hasta el vértice del triángulo; con codo
    // termina en el punto donde nace la guía quebrada.
    lineas.push({
      tipo: "nivel",
      elevacion: zLinea,
      puntos: [
        [tInicio, zLinea],
        [plegada ? tGuia : tCabeza, zLinea],
      ],
    });
    if (plegada) {
      lineas.push({
        tipo: "guia-nivel",
        elevacion: zLinea,
        puntos: [
          [tGuia, zLinea],
          [tCabeza, z],
        ],
        punto: [tGuia, zLinea],
      });
    }
    const poligono: Array<[number, number]> =
      estiloNivel.cabeza === "triangulo-relleno" || estiloNivel.cabeza === "triangulo"
        ? [
            [tCabeza, z],
            [tCabeza + anchoCabeza / 2, z + altoCabeza],
            [tCabeza - anchoCabeza / 2, z + altoCabeza],
          ]
        : [];
    const texto = textoNivel(zLinea, estiloNivel);
    const anchoTexto = anchoTextoAprox(texto, altoTextoNivel);
    const bordeTexto = tCabeza + anchoCabeza / 2 + MM(1, escala);
    // Texto siempre a la derecha del triángulo y centrado con él, como en la
    // referencia: así los niveles juntos nunca enciman sus textos.
    const centroZ = z + altoCabeza / 2;
    const cajaTexto: CajaAnotacion = {
      tipo: "nivel",
      texto,
      t0: bordeTexto,
      t1: bordeTexto + anchoTexto,
      z0: centroZ - altoTextoNivel / 2,
      z1: centroZ + altoTextoNivel / 2,
      centro: [bordeTexto + anchoTexto / 2, centroZ],
    };
    cabezas.push({
      globalid: nivel.globalid,
      nombre: nivel.nombre,
      elevacion: zLinea,
      t: tCabeza,
      z,
      desplazamiento,
      poligono,
      texto,
      cajaTexto,
    });
    cajas.push(cajaTexto);
  }
  const anchoMaxTextoNivel = cabezas.reduce(
    (max, c) => Math.max(max, c.cajaTexto.t1 - c.cajaTexto.t0),
    0,
  );
  const tFinAnotacion = tCabeza + anchoCabeza / 2 + MM(1, escala) + anchoMaxTextoNivel;

  // Texto de cota: a la izquierda de su línea y centrado en el tramo. En tramos
  // donde los remates no caben (0.20) las flechas van por fuera apuntando
  // adentro; el texto sigue fuera del hueco para no pisar ninguna flecha.
  const cotaDe = (
    desde: number,
    hasta: number,
    t: number,
    tipo: "parcial" | "total",
  ): CotaTramoCalc => {
    const valor = hasta - desde;
    const texto = formatearNumero(valor, estiloCota.decimales, estiloCota.unidad);
    const ancho = anchoTextoAprox(texto, altoTextoCota, 0.55);
    const fuera = Math.abs(valor) < 3 * altoTextoCota + 2 * remate;
    const centroZ = (desde + hasta) / 2;
    const t1 = t - separacion;
    const t0 = t1 - ancho;
    const cajaTexto: CajaAnotacion = {
      tipo,
      texto,
      t0,
      t1,
      z0: centroZ - altoTextoCota / 2,
      z1: centroZ + altoTextoCota / 2,
      centro: [t0 + ancho / 2, centroZ],
    };
    const remates: [RemateCota, RemateCota] = fuera
      ? [
          { t, z: desde, hacia: "arriba", fuera: true },
          { t, z: hasta, hacia: "abajo", fuera: true },
        ]
      : [
          { t, z: desde, hacia: "abajo", fuera: false },
          { t, z: hasta, hacia: "arriba", fuera: false },
        ];
    return { desde, hasta, valor, texto, t, fuera, cajaTexto, remates };
  };

  const parciales: CotaTramoCalc[] = [];
  // O031: la casilla «Cotas de nivel» volvía a dibujar la cadena y la total porque
  // `estiloNivel.cotas` solo se guardaba. Se respeta el estilo guardado.
  if (estiloNivel.cotas) {
    for (let i = 0; i + 1 < niveles.length; i += 1) {
      parciales.push(cotaDe(niveles[i].elevacion, niveles[i + 1].elevacion, tCadena, "parcial"));
    }
    for (const nivel of niveles) {
      lineas.push({
        tipo: "extension",
        elevacion: nivel.elevacion,
        puntos: [
          [tExtInicio, nivel.elevacion],
          [tTotal + prolongacion, nivel.elevacion],
        ],
      });
    }
    if (parciales.length > 0) {
      lineas.push({
        tipo: "cota",
        puntos: [
          [tCadena, niveles[0].elevacion],
          [tCadena, niveles[niveles.length - 1].elevacion],
        ],
      });
    }
  }
  let total: CotaTotalCalc | null = null;
  if (estiloNivel.cotas && niveles.length >= 2) {
    const base = cotaDe(elevaciones[0], elevaciones[elevaciones.length - 1], tTotal, "total");
    total = { ...base, tipo: "total" };
    lineas.push({
      tipo: "cota-total",
      puntos: [
        [tTotal, elevaciones[0]],
        [tTotal, elevaciones[elevaciones.length - 1]],
      ],
    });
  }
  cajas.push(...parciales.map((c) => c.cajaTexto));
  if (total) cajas.push(total.cajaTexto);

  // Ejes: globo arriba, a la separación configurada sobre el último nivel.
  const separacionGlobosMm = entrada.separacionGlobosMm ?? estiloEje.separacionGlobos;
  const separacionGlobos = MM(separacionGlobosMm, escala);
  const radio = MM(estiloEje.diametroGlobo, escala) / 2;
  const zGloboInferior = zMax + separacionGlobos;
  const zGlobo = zGloboInferior + radio;
  const zBajo = zMin - MM(estiloEje.extensionBajoPrimerNivel, escala);
  const globos: GloboCalc[] = [];
  const ejesLineas: LineaAnotacion[] = [];
  const ocupados: Array<{ t0: number; t1: number }> = [];
  for (const eje of ejes) {
    let t = eje.s;
    // Si el globo se encima con otro, se desplaza con codo (como la referencia).
    while (ocupados.some((o) => t + radio > o.t0 && t - radio < o.t1)) t += radio * 2.2;
    ocupados.push({ t0: t - radio, t1: t + radio });
    const puntos: Array<[number, number]> = [
      [eje.s, zBajo],
      [eje.s, zGloboInferior - MM(2, escala)],
    ];
    if (Math.abs(t - eje.s) > 1e-9) {
      puntos.push([t, zGloboInferior]);
    } else {
      puntos[puntos.length - 1] = [eje.s, zGloboInferior];
    }
    ejesLineas.push({ tipo: "eje", puntos });
    globos.push({ globalid: eje.globalid, etiqueta: eje.etiqueta, t, z: zGlobo, radio });
    cajas.push({
      tipo: "eje",
      texto: eje.etiqueta,
      t0: t - radio,
      t1: t + radio,
      z0: zGlobo - radio,
      z1: zGlobo + radio,
      centro: [t, zGlobo],
    });
  }

  return {
    tInicio,
    tFin,
    tFinAnotacion,
    tGuia,
    tCadena,
    tTotal,
    tCabeza,
    zGlobo,
    zGloboInferior,
    separacionGlobos,
    lineas,
    cabezas,
    globos,
    ejesLineas,
    parciales,
    total,
    cajas,
  };
}

/** Suma de la cadena de cotas; debe coincidir con la total. */
export function sumaCadena(parciales: CotaTramoCalc[]): number {
  return parciales.reduce((total, c) => total + c.valor, 0);
}
