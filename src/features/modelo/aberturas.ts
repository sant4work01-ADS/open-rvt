// OPEN-RVT: construye la simbología de puertas y ventanas a partir de los datos de la
// abertura (`modelo.propiedades`) y de la geometría de los muros de `modelo.referencias`.
import type { Abertura, Categoria, ElementoMalla, PropiedadesElemento } from "./tipos";
import type { Referencias } from "./herramientas";

const numero = (valor: unknown, pordefecto: number): number =>
  typeof valor === "number" && Number.isFinite(valor) ? valor : pordefecto;

/**
 * Devuelve los datos de planta de una abertura. Con pset OPENRVT_Abertura usa la
 * posición exacta sobre el muro; en modelos importados cae a la caja envolvente.
 */
export function construirAbertura(
  propiedades: PropiedadesElemento,
  malla: ElementoMalla | undefined,
  referencias: Referencias,
): Abertura | null {
  if (propiedades.clase !== "IfcDoor" && propiedades.clase !== "IfcWindow") return null;
  const categoria: Categoria = propiedades.clase === "IfcDoor" ? "puertas" : "ventanas";
  const pset = propiedades.psets?.OPENRVT_Abertura as Record<string, unknown> | undefined;
  const muroId = typeof pset?.Muro === "string" ? pset.Muro : "";
  const muro = muroId ? referencias.muros.find((m) => m.globalid === muroId) : undefined;

  if (pset && muro) {
    const ancho = numero(pset.Ancho, 0.9);
    const distancia = numero(pset.Distancia, 0);
    const dx = muro.x2 - muro.x1;
    const dy = muro.y2 - muro.y1;
    const largo = Math.hypot(dx, dy) || 1;
    const ux = dx / largo;
    const uy = dy / largo;
    return {
      globalid: propiedades.globalid,
      clase: propiedades.clase,
      centro: [muro.x1 + ux * (distancia + ancho / 2), muro.y1 + uy * (distancia + ancho / 2)],
      angulo: Math.atan2(dy, dx),
      ancho,
      espesor: muro.espesor,
      antepecho: numero(pset.Antepecho, 0),
      volteado: Boolean(pset.Volteado),
      categoria,
    };
  }

  if (!malla) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 2 < malla.vertices.length; i += 3) {
    minX = Math.min(minX, malla.vertices[i]);
    maxX = Math.max(maxX, malla.vertices[i]);
    minY = Math.min(minY, malla.vertices[i + 1]);
    maxY = Math.max(maxY, malla.vertices[i + 1]);
  }
  if (!Number.isFinite(minX)) return null;
  const anchoX = maxX - minX;
  const anchoY = maxY - minY;
  const horizontal = anchoX >= anchoY;
  return {
    globalid: propiedades.globalid,
    clase: propiedades.clase,
    centro: [(minX + maxX) / 2, (minY + maxY) / 2],
    angulo: horizontal ? 0 : Math.PI / 2,
    ancho: Math.max(horizontal ? anchoX : anchoY, 0.1),
    espesor: Math.max(horizontal ? anchoY : anchoX, 0.02),
    antepecho: numero(pset?.Antepecho, 0),
    volteado: Boolean(pset?.Volteado),
    categoria,
  };
}

/** Construye todas las aberturas de un modelo a partir de sus propiedades. */
export function construirAberturas(
  propiedades: PropiedadesElemento[],
  mallas: ElementoMalla[],
  referencias: Referencias,
): Abertura[] {
  const porId = new Map(mallas.map((m) => [m.globalid, m]));
  return propiedades
    .map((p) => construirAbertura(p, porId.get(p.globalid), referencias))
    .filter((a): a is Abertura => a !== null);
}
