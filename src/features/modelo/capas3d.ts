// O012: franjas de capa del muro en 3D. Usa exactamente los mismos polígonos
// recortados que la planta (`poligonosCapas`), de modo que las esquinas en L y T
// no muestran muescas ni capas que sobresalen.
import * as THREE from "three";
import { poligonosCapas, type MuroPlanta } from "./planta";
import type { Abertura, ElementoMalla } from "./tipos";

function formaDe(poligono: Array<[number, number]>): THREE.Shape | null {
  if (poligono.length < 3) return null;
  const abierto =
    Math.hypot(
      poligono[0][0] - poligono[poligono.length - 1][0],
      poligono[0][1] - poligono[poligono.length - 1][1],
    ) < 1e-9
      ? poligono.slice(0, -1)
      : poligono;
  if (abierto.length < 3) return null;
  const forma = new THREE.Shape();
  forma.moveTo(abierto[0][0], abierto[0][1]);
  for (let i = 1; i < abierto.length; i += 1) {
    forma.lineTo(abierto[i][0], abierto[i][1]);
  }
  forma.closePath();
  return forma;
}

export function crearMallasCapas(
  elemento: ElementoMalla,
  muros: MuroPlanta[],
  z0: number,
  z1: number,
  opciones: {
    seleccionado: boolean;
    planos: THREE.Plane[];
    opacidad: number;
    aberturas?: Abertura[];
  },
): THREE.Mesh[] {
  if (elemento.categoria !== "muros" || elemento.capas.length < 2 || !elemento.eje) {
    return [];
  }
  // Una pared con vanos se sigue dibujando con su cuerpo recortado: las franjas
  // completas taparían la puerta o la ventana.
  const [mx1, my1, mx2, my2] = elemento.eje;
  const largo = Math.hypot(mx2 - mx1, my2 - my1) || 1e-9;
  const ux = (mx2 - mx1) / largo;
  const uy = (my2 - my1) / largo;
  const espesor = elemento.capas.reduce((suma, capa) => suma + capa.espesor, 0);
  for (const abertura of opciones.aberturas ?? []) {
    const dx = abertura.centro[0] - mx1;
    const dy = abertura.centro[1] - my1;
    const t = dx * ux + dy * uy;
    const distancia = Math.abs(-dx * uy + dy * ux);
    if (t > -0.05 && t < largo + 0.05 && distancia <= espesor / 2 + 0.05) {
      return [];
    }
  }
  const alto = Math.max(z1 - z0, 0.001);
  const colores = new Map(
    elemento.capas.map((capa) => [capa.material, capa.color] as const),
  );
  const muro = {
    globalid: elemento.globalid,
    eje: elemento.eje,
    capas: elemento.capas,
  };
  const salida: THREE.Mesh[] = [];
  for (const banda of poligonosCapas(muro, muros)) {
    const forma = formaDe(banda.poligono);
    if (!forma) continue;
    const geometria = new THREE.ExtrudeGeometry(forma, {
      depth: alto,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometria.translate(0, 0, z0);
    const color = opciones.seleccionado
      ? new THREE.Color(0x2f7dd1)
      : new THREE.Color(colores.get(banda.material) ?? "#c9c9c9");
    const material = new THREE.MeshLambertMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: opciones.opacidad < 1,
      opacity: opciones.opacidad,
      clippingPlanes: opciones.planos,
      emissive: opciones.seleccionado ? 0x123a66 : 0x000000,
    });
    const malla = new THREE.Mesh(geometria, material);
    malla.userData.globalid = elemento.globalid;
    malla.userData.capa = banda.material;
    malla.renderOrder = 0;
    salida.push(malla);
  }
  return salida;
}
