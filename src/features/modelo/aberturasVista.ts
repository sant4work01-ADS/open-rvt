// O069: la planta dibuja las aberturas con los datos actuales del núcleo y las
// deja seleccionar; el nivel por defecto no puede dejar la abertura fuera del muro.
import { categoriaOculta } from "./estilos";
import { categoriaVisible } from "./vistas";
import { colocarAbertura, type MuroReferencia, type Punto2, type Referencias } from "./herramientas";
import type { Abertura, ElementoMalla, Nivel, Orientacion, Vista } from "./tipos";
import type { OpcionesAbertura } from "./estado";

const TOLERANCIA = 1e-6;

/** Cota absoluta de la base de un muro (0 si el IFC no la trae). */
export function baseDeMuro(muro: MuroReferencia): number {
  return Number.isFinite(muro.base) ? Number(muro.base) : 0;
}

/** Cota del nivel pedido; null si no existe o si se pidió la base del muro. */
export function elevacionDeNivel(
  niveles: Nivel[],
  globalid: string,
): number | null {
  if (!globalid) return null;
  const nivel = niveles.find((n) => n.globalid === globalid);
  return nivel ? nivel.elevacion : null;
}

/**
 * Motivo por el que una abertura no cabe en el muro, o null si cabe.
 * `colocada` es el resultado de colocarAbertura (lleva la distancia ya acotada).
 */
export function motivoNoCabe(
  muro: MuroReferencia,
  distancia: number,
  opciones: Pick<OpcionesAbertura, "ancho" | "alto" | "antepecho" | "nivel">,
  niveles: Nivel[],
): string | null {
  const largo = Math.hypot(muro.x2 - muro.x1, muro.y2 - muro.y1);
  if (distancia < -TOLERANCIA || distancia + opciones.ancho > largo + TOLERANCIA) {
    return "La abertura no cabe a lo largo del muro.";
  }
  const base = baseDeMuro(muro);
  const tope = base + muro.altura;
  const cotaNivel = elevacionDeNivel(niveles, opciones.nivel);
  const z = (cotaNivel ?? base) + opciones.antepecho;
  if (z < base - TOLERANCIA) {
    return "La abertura queda por debajo del muro con ese nivel.";
  }
  if (z + opciones.alto > tope + TOLERANCIA) {
    return (
      `La abertura no cabe: ${z.toFixed(2)} + ${opciones.alto.toFixed(2)}` +
      ` = ${(z + opciones.alto).toFixed(2)} m y el muro llega a ${tope.toFixed(2)} m.`
    );
  }
  return null;
}

/** Valida la abertura centrada en `punto` sobre el muro bajo el cursor. */
export function validarAberturaEnPunto(
  referencias: Referencias,
  punto: Punto2,
  opciones: OpcionesAbertura,
  niveles: Nivel[],
): { colocada: ReturnType<typeof colocarAbertura>; motivo: string | null } {
  const colocada = colocarAbertura(referencias, punto, opciones.ancho);
  if (!colocada) {
    return { colocada: null, motivo: "Coloque la abertura sobre un muro." };
  }
  return {
    colocada,
    motivo: motivoNoCabe(colocada.muro, colocada.distancia, opciones, niveles),
  };
}

/**
 * Nivel por defecto de Ventana/Puerta: el de la vista, salvo que su cota deje la
 * abertura fuera de todos los muros de la vista; entonces se usa la base del muro.
 */
export function nivelPorDefectoAbertura(
  vista: Pick<Vista, "tipo" | "nivel"> | undefined,
  niveles: Nivel[],
  referencias: Referencias,
  opciones: Pick<OpcionesAbertura, "alto" | "antepecho">,
): string {
  const nivelVista = vista?.nivel ?? "";
  if (!nivelVista) return "";
  const cota = elevacionDeNivel(niveles, nivelVista);
  if (cota === null) return "";
  // Sin muros no hay con qué comparar: se respeta el nivel de la vista.
  if (referencias.muros.length === 0) return nivelVista;
  const cabeEnAlguno = referencias.muros.some(
    (muro) =>
      cota + opciones.antepecho + opciones.alto <=
      baseDeMuro(muro) + muro.altura + TOLERANCIA,
  );
  return cabeEnAlguno ? nivelVista : "";
}

/** Derecha de pantalla de una vista en el plano XY: (1,0) para el alzado Sur. */
export function derechaDeVista(vista: Pick<Vista, "tipo" | "orientacion" | "direccion">): [
  number,
  number,
] {
  let dx = 0;
  let dy = -1;
  if (vista.tipo === "alzado") {
    const orientacion: Orientacion = vista.orientacion ?? "sur";
    if (orientacion === "sur") return [1, 0];
    if (orientacion === "norte") return [-1, 0];
    if (orientacion === "este") return [0, 1];
    return [0, -1];
  }
  if (vista.tipo === "corte") {
    if (vista.direccion) [dx, dy] = vista.direccion;
  }
  return [-dy, dx];
}

/**
 * Desplazamiento del mundo para un trazo base→destino en un alzado o corte.
 * El punto local es [horizontal de pantalla, cota]. En el alzado Sur (1,1)→(3,1.5)
 * da dx=2, dy=0, dz=0.5; en el Este da dx=0, dy=2, dz=0.5.
 */
export function desplazamientoEnVista(
  vista: Pick<Vista, "tipo" | "orientacion" | "direccion">,
  desde: Punto2,
  hasta: Punto2,
): { dx: number; dy: number; dz: number } {
  const [ux, uy] = derechaDeVista(vista);
  const du = hasta[0] - desde[0];
  return {
    dx: du * ux,
    dy: du * uy,
    dz: hasta[1] - desde[1],
  };
}

function aberturaEnPlanta(
  abertura: Abertura,
  vista: Vista,
  mallasDibujadas: ElementoMalla[],
): boolean {
  if (!categoriaVisible(vista, abertura.categoria)) return false;
  if (categoriaOculta(vista, abertura.categoria)) return false;
  // El muro que la aloja tiene que dibujarse en esta vista (nivel y corte).
  const muroDibujado = mallasDibujadas.some(
    (m) => m.globalid === abertura.muro && m.categoria === "muros",
  );
  if (!muroDibujado) return false;
  if (abertura.nivel && vista.nivel && abertura.nivel === vista.nivel) return true;
  const corte = vista.alturaPlano;
  if (corte === undefined) return true;
  return abertura.cota <= corte + TOLERANCIA &&
    abertura.cota + abertura.alto >= corte - TOLERANCIA;
}

/**
 * Aberturas que pertenecen a la planta de la vista activa. `mallasDibujadas` son
 * las que la escena ya filtró por nivel: el símbolo solo sale si su muro se ve.
 */
export function aberturasVisiblesEnPlanta(
  aberturas: Abertura[],
  vista: Vista,
  mallasDibujadas: ElementoMalla[],
): Abertura[] {
  if (vista.tipo !== "planta") return [];
  return aberturas.filter((a) => aberturaEnPlanta(a, vista, mallasDibujadas));
}

/**
 * Abertura bajo un punto de planta. Gana la más cercana al eje y, si hay empate,
 * la de menor distancia al centro; así el símbolo gana sobre el muro que lo aloja.
 */
export function aberturaEnPunto(
  aberturas: Abertura[],
  punto: Punto2,
  tolerancia = 0.05,
): Abertura | null {
  let mejor: Abertura | null = null;
  let mejorDistancia = Infinity;
  for (const abertura of aberturas) {
    const dx = punto[0] - abertura.centro[0];
    const dy = punto[1] - abertura.centro[1];
    const coseno = Math.cos(abertura.angulo);
    const seno = Math.sin(abertura.angulo);
    const aLoLargo = Math.abs(dx * coseno + dy * seno);
    const aLoAncho = Math.abs(-dx * seno + dy * coseno);
    if (
      aLoLargo > abertura.ancho / 2 + tolerancia ||
      aLoAncho > abertura.espesor / 2 + tolerancia
    ) {
      continue;
    }
    const distancia = Math.hypot(dx, dy);
    if (distancia < mejorDistancia) {
      mejor = abertura;
      mejorDistancia = distancia;
    }
  }
  return mejor;
}
