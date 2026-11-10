// O065B: utilidades puras de mallas, nombres y plantas.
import type { Caja, ElementoMalla, Nivel, RespuestaTeselado, Vista } from "../tipos";

function base64ABytes(texto: string): Uint8Array {
  const binario = atob(texto);
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) salida[i] = binario.charCodeAt(i);
  return salida;
}

export function decodificarMalla(crudo: RespuestaTeselado["elementos"][number]): ElementoMalla {
  const vertices = base64ABytes(crudo.vertices);
  const indices = base64ABytes(crudo.indices);
  return {
    globalid: crudo.globalid,
    clase: crudo.clase,
    nombre: crudo.nombre,
    nivel: crudo.nivel,
    color: crudo.color,
    opacidad: crudo.opacidad,
    categoria: crudo.categoria,
    tipo: crudo.tipo ?? "",
    capas: crudo.capas ?? [],
    eje: crudo.eje ?? null,
    estructura: crudo.estructura ?? null,
    vertices: new Float32Array(vertices.buffer, vertices.byteOffset, vertices.byteLength / 4),
    indices: new Uint32Array(indices.buffer, indices.byteOffset, indices.byteLength / 4),
  };
}

export function nombreDeRuta(ruta: string | null, nombreModelo: string): string {
  if (!ruta) return `${nombreModelo || "Modelo"}.ifc`;
  const partes = ruta.split(/[\\/]/);
  return partes[partes.length - 1] || "Modelo.ifc";
}

export const CAJA_VACIA: Caja = { min: [-1, -1, -1], max: [1, 1, 1] };

/**
 * O006a: al mover niveles, las plantas conservan su plano de corte y su fondo
 * relativos a la nueva elevación. La cadena puede mover varios niveles a la vez.
 */
/** O037: ¿es la única planta que muestra su nivel? */
export function plantaUnicaDeNivel(vistas: Vista[], vista: Vista): boolean {
  return (
    vista.tipo === "planta" &&
    !!vista.nivel &&
    vistas.filter((v) => v.tipo === "planta" && v.nivel === vista.nivel).length === 1
  );
}

/** O037: quita las plantas cuyo nivel ya no existe (borrado con Supr, deshacer…). */
export function quitarPlantasHuerfanas(vistas: Vista[], niveles: Nivel[]): Vista[] {
  const ids = new Set(niveles.map((n) => n.globalid));
  const quedan = vistas.filter((v) => v.tipo !== "planta" || !v.nivel || ids.has(v.nivel));
  // Nunca se queda sin plantas: si todas eran huérfanas se conservan.
  return quedan.some((v) => v.tipo === "planta") ? quedan : vistas;
}

export function sincronizarPlantas(vistas: Vista[], niveles: Nivel[]): Vista[] {
  const ordenados = [...niveles].sort((a, b) => a.elevacion - b.elevacion);
  return vistas.map((vista) => {
    if (vista.tipo !== "planta" || !vista.nivel) return vista;
    const nivel = niveles.find((n) => n.globalid === vista.nivel);
    if (!nivel) return vista;
    const indice = ordenados.findIndex((n) => n.globalid === nivel.globalid);
    return {
      ...vista,
      nombre: `Planta ${nivel.nombre}`,
      alturaPlano: nivel.elevacion + 1.2,
      profundidad:
        indice > 0 ? ordenados[indice - 1].elevacion : nivel.elevacion - 1,
    };
  });
}
