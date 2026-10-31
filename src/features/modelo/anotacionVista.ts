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
  tFin: number;
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
}

const MM = (mm: number, escala: EscalaVista) => mmAMundo(mm, escala);

/** Ancho aproximado del texto, en mundo, con el mismo criterio que el visor. */
export function anchoTextoAprox(texto: string, altoMundo: number): number {
  return Math.max(0.1, texto.length * altoMundo * 0.62);
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

/** Codo de una cabeza: punto en la línea, quiebre y llegada a la cabeza. */
function guiaCabeza(tFin: number, zLinea: number, tCabeza: number, zCabeza: number, escala: EscalaVista) {
  const avance = MM(2, escala);
  return [
    [tFin, zLinea],
    [tFin + avance, zLinea],
    [tCabeza, zCabeza],
  ] as Array<[number, number]>;
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
  const tCadena = sMax + MM(10, escala);
  const tTotal = tCadena + MM(estiloCota.distanciaFilas, escala);
  const tFin = Math.max(sMax + extension, tTotal + MM(4, escala));
  const tCabeza = tFin + MM(6, escala);

  const altoCabeza = MM(estiloNivel.tamanoCabeza, escala);
  const anchoCabeza = MM(estiloNivel.tamanoCabeza, escala);
  const altoTextoNivel = MM(estiloNivel.altoTexto, escala);
  const banda = Math.max(altoCabeza, altoTextoNivel);
  // Solo se pide un aire mínimo: la referencia separa lo justo para no encimar.
  const auto = acomodarCabezasSimetrico(elevaciones, banda, MM(0.5, escala));

  const lineas: LineaAnotacion[] = [];
  const cabezas: CabezaNivelCalc[] = [];
  const cajas: CajaAnotacion[] = [];

  for (let i = 0; i < niveles.length; i += 1) {
    const nivel = niveles[i];
    const zLinea = nivel.elevacion;
    lineas.push({
      tipo: "nivel",
      elevacion: zLinea,
      puntos: [
        [tInicio, zLinea],
        [tFin, zLinea],
      ],
    });
    const manual = entrada.ajustesNivel?.[nivel.globalid];
    const z = Number.isFinite(manual) ? (manual as number) : auto[i];
    const desplazamiento = z - zLinea;
    const guia = guiaCabeza(tFin, zLinea, tCabeza, z, escala);
    lineas.push({ tipo: "guia-nivel", elevacion: zLinea, puntos: guia });
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
    // Las cabezas desplazadas llevan el texto en una columna más a la derecha
    // para que dos cabezas cercanas nunca encimen sus textos.
    const columnaExtra = Math.abs(desplazamiento) > 1e-9 ? anchoTexto * 1.2 : 0;
    const bordeTexto = tCabeza + anchoCabeza / 2 + MM(1, escala) + columnaExtra;
    // Si la cabeza bajó, el texto va debajo del vértice para no tachar la línea;
    // si subió o no se movió, arriba del vértice, a la altura de la cabeza.
    const zTexto =
      desplazamiento < -1e-9
        ? { z0: z - altoTextoNivel, z1: z }
        : { z0: z + (altoCabeza - altoTextoNivel) / 2, z1: z + (altoCabeza + altoTextoNivel) / 2 };
    const cajaTexto: CajaAnotacion = {
      tipo: "nivel",
      texto,
      t0: bordeTexto,
      t1: bordeTexto + anchoTexto,
      z0: zTexto.z0,
      z1: zTexto.z1,
      centro: [bordeTexto + anchoTexto / 2, (zTexto.z0 + zTexto.z1) / 2],
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

  // Cotas: cadena entre niveles consecutivos y total en la fila de afuera.
  const altoTextoCota = MM(estiloCota.altoTexto, escala);
  const separacion = MM(estiloCota.separacionTexto, escala);
  const remate = MM(estiloCota.tamanoRemate, escala);
  const separacionExt = MM(estiloCota.separacionExtension, escala);
  const prolongacion = MM(estiloCota.prolongacion, escala);

  const cotaDe = (
    desde: number,
    hasta: number,
    t: number,
    tipo: "parcial" | "total",
  ): CotaTramoCalc => {
    const valor = hasta - desde;
    const texto = formatearNumero(valor, estiloCota.decimales, estiloCota.unidad);
    const ancho = anchoTextoAprox(texto, altoTextoCota);
    const fuera = Math.abs(valor) < 2 * remate;
    // Si el tramo es más chico que el texto, éste no cabe entre las dos líneas:
    // se saca por encima del nivel superior para no tachar ninguna línea.
    const centroZ =
      fuera && Math.abs(valor) < altoTextoCota + 2 * separacion
        ? hasta + separacion + altoTextoCota / 2
        : (desde + hasta) / 2;
    const cajaTexto: CajaAnotacion = {
      tipo,
      texto,
      t0: t - separacion - ancho,
      t1: t - separacion,
      z0: centroZ - altoTextoCota / 2,
      z1: centroZ + altoTextoCota / 2,
      centro: [t - separacion - ancho / 2, centroZ],
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
  for (let i = 0; i + 1 < niveles.length; i += 1) {
    parciales.push(cotaDe(niveles[i].elevacion, niveles[i + 1].elevacion, tCadena, "parcial"));
  }
  for (const nivel of niveles) {
    lineas.push({
      tipo: "extension",
      elevacion: nivel.elevacion,
      puntos: [
        [sMax + separacionExt, nivel.elevacion],
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
  let total: CotaTotalCalc | null = null;
  if (niveles.length >= 2) {
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
