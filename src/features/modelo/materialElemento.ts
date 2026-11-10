// O062: material de una cara del visor 3D. Las categorías de losas y estructura
// (cerramientos, castillos, vigas y columnas) llevan un offset de polígono
// positivo: cuando su cara queda enrasada con la del muro, en el empate de
// profundidad gana el muro y no se ve la cuña gris ni la cara transparente.

import * as THREE from "three";
import { CATEGORIAS_ESTRUCTURALES } from "./aristasSobreMuro";

export interface ParametrosMaterialElemento {
  diseno: boolean;
  seleccionado: boolean;
  color: THREE.Color;
  fondo: THREE.Color;
  opaco: boolean;
  opacidad: number;
  planos: THREE.Plane[];
  categoria: string;
}

export function crearMaterialElemento({
  diseno,
  seleccionado,
  color,
  fondo,
  opaco,
  opacidad,
  planos,
  categoria,
}: ParametrosMaterialElemento): THREE.Material {
  const desplazaPorMuro = CATEGORIAS_ESTRUCTURALES.has(categoria);
  if (diseno) {
    return new THREE.MeshBasicMaterial({
      color: seleccionado ? color : fondo,
      side: THREE.DoubleSide,
      clippingPlanes: planos,
      polygonOffset: desplazaPorMuro,
      polygonOffsetFactor: desplazaPorMuro ? 1 : 0,
      polygonOffsetUnits: desplazaPorMuro ? 1 : 0,
    });
  }
  return new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: !opaco,
    opacity: opacidad,
    clippingPlanes: planos,
    emissive: seleccionado ? 0x123a66 : 0x000000,
    polygonOffset: desplazaPorMuro,
    polygonOffsetFactor: desplazaPorMuro ? 1 : 0,
    polygonOffsetUnits: desplazaPorMuro ? 1 : 0,
  });
}
